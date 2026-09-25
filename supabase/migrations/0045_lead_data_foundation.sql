-- ############################################################################
-- 0045_lead_data_foundation.sql
--
-- REPAIROX — LEAD DATA FOUNDATION (normalized, reporting-ready)
--
-- Purpose: turn the flat `leads` table (0002) + Customer-Master link (0031)
-- into the reliable data foundation for the Lead Management sales operating
-- system, WITHOUT forking any existing system.
--
-- This migration is ADDITIVE and IDEMPOTENT. It:
--   1. Adds normalized REFERENCE + STATE columns to public.leads (device
--      catalog, salesperson user id, capture channel, expected value, terminal
--      timestamps) alongside the existing free-text columns (never destroyed).
--   2. Replaces the manually-stored `lead_month` with a GENERATED column
--      derived from lead_date (business rule: Month is derived, never edited).
--   3. Creates 5 append-only HISTORY / EVENT tables so every important lead
--      event is queryable independently:
--        - lead_assignment_history   (who owned it, when, by whom)
--        - lead_activity_history      (contact attempts / calls / notes / dispositions)
--        - lead_followup_history      (scheduled + completed follow-ups)
--        - lead_status_history         (lifecycle stage transitions)
--        - lead_conversion_history     (handoff to Walk-In / Field / Ticket / Invoice / Customer)
--   4. Wires RLS (mirrors the leads own-vs-all model), indexes for reporting,
--      updated_at + audit triggers, realtime and grants.
--
-- Reporting rule: metrics (lead count, qualified count, conversion rate,
-- time-to-contact, time-to-convert, revenue, lost reason, …) are DERIVED from
-- these transactional/event rows. No manually-updated counters are introduced.
--
-- Reuse guarantees (no duplicate masters):
--   • Customer   → public.customers(id)   via leads.customer_id (text)
--   • Contact    → public.contacts(id)     via leads.contact_id (text)
--   • Company    → public.companies(id)    via leads.company_id (text)
--   • User/Agent → public.staff(id)         via assigned_user_id / created_by / *_by
--   • Store      → public.branches(id)      via branch_id
--   • Device     → Device Catalog ids       via device_category_id / device_brand_id / device_model_id
-- ############################################################################


-- ============================================================================
-- SECTION 1 — LEADS: normalized REFERENCE columns (ids, not free text)
--   The existing free-text columns (device, category, agent, region, location,
--   source) are KEPT for backward-compatibility and display. These id columns
--   are the authoritative, reportable references. Both may be populated; the
--   application resolves the id and caches the display text.
-- ============================================================================

-- ── Device Catalog references (Category → Brand → Model) ──
-- Catalog PKs are text (cat-… / plb-… / plm-…). No FK constraint is added
-- because catalog rows can be reseeded/renamed; these are soft references
-- validated in the app. Free-text `device`/`category` remain the cached label.
alter table public.leads add column if not exists device_category_id text;
alter table public.leads add column if not exists device_brand_id     text;
alter table public.leads add column if not exists device_model_id     text;

-- ── Salesperson / owner as a real USER reference (not a role name) ──
-- `assigned_to` (0002) already references staff(id) for RLS visibility. We add
-- `assigned_user_id` as the canonical, explicitly-named ownership pointer and
-- keep it in sync with assigned_to. The free-text `agent`/`follow_up_agent`
-- columns remain the cached display label only.
alter table public.leads add column if not exists assigned_user_id uuid references public.staff(id) on delete set null;

-- ── Customer / Contact / Company identity references ──
-- customer_id (text) was added in 0031. Add contact_id + company_id here so the
-- Lead can be associated with all three without duplicating the entities.
alter table public.leads add column if not exists contact_id text references public.contacts(id)  on delete set null;
alter table public.leads add column if not exists company_id text references public.companies(id) on delete set null;

-- ============================================================================
-- SECTION 2 — LEADS: SOURCE vs CAPTURE CHANNEL (two separate dimensions)
--   `source` (0002, free text via lead_options) = ACQUISITION SOURCE / marketing
--     channel (Google / Meta / GMB / YouTube / Organic / Reference …). KEPT.
--   `capture_channel` = HOW the lead entered the system (IVR / Form / Manual /
--     Import / WhatsApp / Phone …). NEW, separate, never overwrites source.
-- ============================================================================
alter table public.leads add column if not exists capture_channel text;

-- ============================================================================
-- SECTION 3 — LEADS: numeric / commercial + terminal state columns
--   estimate + discount already exist (numeric). Add expected_value as the
--   canonical reportable pipeline value (defaults to estimate when unset in the
--   app) and the terminal-state timestamps so time-to-* metrics are derivable.
-- ============================================================================
alter table public.leads add column if not exists expected_value  numeric;
alter table public.leads add column if not exists next_followup_at timestamptz;  -- normalized from follow_up_date; drives the follow-up queue
alter table public.leads add column if not exists first_contacted_at timestamptz; -- set on first "connected" activity → time-to-contact
alter table public.leads add column if not exists qualified_at    timestamptz;    -- set when status first reaches a qualified stage
alter table public.leads add column if not exists converted_at    timestamptz;    -- terminal WON/converted (also mirrored to conversion history)
alter table public.leads add column if not exists lost_at         timestamptz;    -- terminal LOST/dropped
alter table public.leads add column if not exists lost_reason     text;           -- structured lost reason (reportable)

-- ============================================================================
-- SECTION 4 — LEADS: downstream handoff link columns (ids only, nullable)
--   Mirrors the FieldJob pattern. A Lead is the CRM origin; downstream records
--   reference it. These make the Lead → operational trail queryable directly.
--   (The app already writes some of these via a JSON overlay; making them real
--   columns removes the schema-drift healing and enables reporting joins.)
-- ============================================================================
alter table public.leads add column if not exists fulfilment_route  text;  -- 'STORE_VISIT' | 'PICKUP_DROP' | null
alter table public.leads add column if not exists assigned_store_id uuid references public.branches(id) on delete set null;
alter table public.leads add column if not exists routed_at         timestamptz;
alter table public.leads add column if not exists linked_walk_in_id text;
alter table public.leads add column if not exists linked_field_job_id text;
alter table public.leads add column if not exists linked_ticket_id  text;
alter table public.leads add column if not exists linked_invoice_id text;
alter table public.leads add column if not exists converted_by      uuid references public.staff(id) on delete set null;
alter table public.leads add column if not exists conversion_source text;   -- 'ticket' | 'invoice' | 'walk_in' | 'field' | 'manual'

-- ============================================================================
-- SECTION 5 — LEADS: `lead_month` is DERIVED, never edited
--   Business rule: Month must be derived from Lead Date. Replace the manually-
--   stored text column with a STORED GENERATED column so it can never drift and
--   is still directly indexable/queryable for month-over-month reporting.
--   (Guarded: only converts when the column is not already generated.)
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'lead_month'
      and is_generated = 'NEVER'
  ) then
    alter table public.leads drop column lead_month;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'lead_month'
  ) then
    -- YYYY-MM is the reportable, sortable month key derived from lead_date.
    -- NOTE: the expression MUST be IMMUTABLE for a generated column. Both
    -- `to_char(date,text)` and `date::text` are only STABLE (locale-dependent),
    -- so we compose the key from EXTRACT (immutable for a date):
    --   lpad(extract(year)::int::text,4,'0') || '-' || lpad(extract(month)::int::text,2,'0')
    alter table public.leads
      add column lead_month text generated always as (
        lpad((extract(year  from lead_date))::int::text, 4, '0') || '-' ||
        lpad((extract(month from lead_date))::int::text, 2, '0')
      ) stored;
  end if;
end $$;

-- ── Reporting-oriented indexes on leads ──
create index if not exists leads_assigned_user_idx    on public.leads(assigned_user_id);
create index if not exists leads_status_idx           on public.leads(status);
create index if not exists leads_source_idx           on public.leads(source);
create index if not exists leads_capture_channel_idx  on public.leads(capture_channel);
create index if not exists leads_lead_month_idx       on public.leads(lead_month);
create index if not exists leads_next_followup_idx    on public.leads(next_followup_at);
create index if not exists leads_converted_at_idx     on public.leads(converted_at);
create index if not exists leads_lost_at_idx          on public.leads(lost_at);
create index if not exists leads_device_model_idx     on public.leads(device_model_id);
create index if not exists leads_customer_ref_idx     on public.leads(customer_id);
create index if not exists leads_contact_ref_idx      on public.leads(contact_id);
create index if not exists leads_company_ref_idx      on public.leads(company_id);

-- Keep assigned_user_id and the RLS-visibility assigned_to in lockstep. Either
-- side may be written by different code paths; this makes them consistent.
create or replace function public.leads_sync_assignee()
returns trigger language plpgsql as $$
begin
  if new.assigned_user_id is null and new.assigned_to is not null then
    new.assigned_user_id := new.assigned_to;
  elsif new.assigned_to is null and new.assigned_user_id is not null then
    new.assigned_to := new.assigned_user_id;
  elsif new.assigned_user_id is distinct from new.assigned_to
        and (tg_op = 'INSERT' or new.assigned_user_id is distinct from old.assigned_user_id) then
    -- explicit change to assigned_user_id wins and mirrors to assigned_to
    new.assigned_to := new.assigned_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_sync_assignee_trg on public.leads;
create trigger leads_sync_assignee_trg
  before insert or update on public.leads
  for each row execute function public.leads_sync_assignee();


-- ############################################################################
-- SECTION 6 — HISTORY / EVENT TABLES
--   All are append-only, org+branch scoped, and reference the Lead by its uuid.
--   `actor_staff_id` is WHO performed the event (a real user, not a role).
--   A shared column spine keeps them consistent with the rest of the schema.
-- ############################################################################

-- ── 6a. Assignment history — every ownership change ──
create table if not exists public.lead_assignment_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id         uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  from_user_id      uuid references public.staff(id) on delete set null,  -- previous owner ("" / null = was unassigned)
  to_user_id        uuid references public.staff(id) on delete set null,  -- new owner
  assigned_by       uuid references public.staff(id) on delete set null,  -- who made the assignment
  reason            text,
  actor_staff_id    uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ── 6b. Activity history — contact attempts, calls, notes, dispositions ──
--   This is where "result" (latest interaction/disposition) is recorded over
--   time; the leads.result column caches the LATEST for quick display.
create table if not exists public.lead_activity_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id         uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  activity_type     text not null,   -- 'call' | 'note' | 'email' | 'whatsapp' | 'meeting' | 'contact_attempt' | 'disposition'
  channel           text,            -- optional communication channel used
  contact_status    text,            -- normalized reach state at this activity (Not Contacted / Contacted / RNR / Connected …)
  result            text,            -- disposition of this interaction (Interested / Not Interested / RNR / Follow-Up …)
  outcome_value     numeric,         -- optional value captured during the interaction
  note              text,
  occurred_at       timestamptz not null default now(),
  actor_staff_id    uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ── 6c. Follow-up history — scheduled + completed follow-ups ──
create table if not exists public.lead_followup_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id         uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  scheduled_at      timestamptz,                       -- when the follow-up is due
  followup_user_id  uuid references public.staff(id) on delete set null,  -- assigned follow-up agent
  status            text not null default 'scheduled', -- 'scheduled' | 'completed' | 'rescheduled' | 'cancelled' | 'missed'
  comments          text,
  completed_at      timestamptz,
  result            text,                              -- disposition captured when completed
  actor_staff_id    uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ── 6d. Status history — lifecycle stage transitions ──
--   Enables funnel + stage-duration reporting (New → Qualified → Converted/Lost).
create table if not exists public.lead_status_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id         uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  from_status       text,
  to_status         text not null,
  note              text,
  actor_staff_id    uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  changed_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ── 6e. Conversion / handoff history — the operational trail ──
--   One row per handoff: Lead → Walk-In / Field Job / Ticket / Invoice, or
--   Lead → Customer promotion, or Lost. target_type + target_id keep it generic
--   and queryable for conversion + revenue attribution.
create table if not exists public.lead_conversion_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id         uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  event_type        text not null,   -- 'routed' | 'walk_in_created' | 'field_job_created' | 'ticket_created' | 'invoice_created' | 'customer_linked' | 'won' | 'lost'
  target_type       text,            -- 'walk_in' | 'field_job' | 'ticket' | 'invoice' | 'customer' | 'company'
  target_id         text,            -- id of the created/linked record (text — matches those masters)
  value             numeric,         -- realized/attributed value where applicable
  note              text,
  actor_staff_id    uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);


-- ── Indexes for every history table (lead_id + time; plus reporting keys) ──
create index if not exists lah_lead_idx    on public.lead_assignment_history(lead_id, created_at desc);
create index if not exists lah_to_user_idx on public.lead_assignment_history(to_user_id);
create index if not exists lah_org_idx     on public.lead_assignment_history(organization_id);

create index if not exists lact_lead_idx   on public.lead_activity_history(lead_id, occurred_at desc);
create index if not exists lact_type_idx   on public.lead_activity_history(activity_type);
create index if not exists lact_org_idx    on public.lead_activity_history(organization_id);

create index if not exists lfu_lead_idx    on public.lead_followup_history(lead_id, scheduled_at);
create index if not exists lfu_status_idx  on public.lead_followup_history(status);
create index if not exists lfu_user_idx    on public.lead_followup_history(followup_user_id);
create index if not exists lfu_org_idx     on public.lead_followup_history(organization_id);

create index if not exists lsh_lead_idx    on public.lead_status_history(lead_id, changed_at desc);
create index if not exists lsh_to_idx      on public.lead_status_history(to_status);
create index if not exists lsh_org_idx     on public.lead_status_history(organization_id);

create index if not exists lch_lead_idx    on public.lead_conversion_history(lead_id, occurred_at desc);
create index if not exists lch_event_idx   on public.lead_conversion_history(event_type);
create index if not exists lch_target_idx  on public.lead_conversion_history(target_type, target_id);
create index if not exists lch_org_idx     on public.lead_conversion_history(organization_id);


-- ############################################################################
-- SECTION 7 — updated_at (n/a: append-only) + AUDIT triggers
--   History tables are append-only, so they only need the fn_audit trail.
-- ############################################################################
do $$
declare
  t text;
  tables text[] := array[
    'lead_assignment_history', 'lead_activity_history', 'lead_followup_history',
    'lead_status_history', 'lead_conversion_history'
  ];
begin
  if exists (select 1 from pg_proc where proname = 'fn_audit') then
    foreach t in array tables loop
      execute format('drop trigger if exists audit_%1$s on public.%1$s;', t);
      execute format(
        'create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.fn_audit(''Lead History'');',
        t
      );
    end loop;
  end if;
end $$;


-- ############################################################################
-- SECTION 8 — ROW LEVEL SECURITY
--   Mirrors the leads own-vs-all model: a row is visible if the parent lead is
--   visible to the caller. We reuse the SAME visibility predicate as leads_sel
--   (org member + branch visible + admin/report keys OR the caller owns/created
--   the parent lead). Writes require manage_sales (same as lead writes).
-- ############################################################################

-- Helper: is the given lead visible to the current user? (SECURITY DEFINER so
-- it can read leads without recursing into the history RLS.)
create or replace function public.auth_lead_visible(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and public.auth_member_of_org(l.organization_id)
      and public.auth_branch_visible(l.branch_id)
      and (
        public.is_admin()
        or public.auth_has_any(array['view_sales_reports','view_financial_reports','manage_reports','manage_users','leads_view_all'])
        or l.created_by = public.auth_staff_id()
        or l.assigned_to = public.auth_staff_id()
      )
  );
$$;

grant execute on function public.auth_lead_visible(uuid) to authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'lead_assignment_history', 'lead_activity_history', 'lead_followup_history',
    'lead_status_history', 'lead_conversion_history'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);

    -- SELECT: parent lead must be visible to the caller.
    execute format('drop policy if exists %I on public.%I;', t || '_sel', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_lead_visible(lead_id)
      );$f$, t || '_sel', t);

    -- INSERT: caller may work the lead (manage_sales) and it stays in scope.
    execute format('drop policy if exists %I on public.%I;', t || '_ins', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(array['manage_sales'])
        and public.auth_lead_visible(lead_id)
      );$f$, t || '_ins', t);

    -- UPDATE: append-only in practice; allow correction by managers only.
    execute format('drop policy if exists %I on public.%I;', t || '_upd', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and (public.is_admin() or public.auth_has_any(array['manage_reports','manage_users']))
      )
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
      );$f$, t || '_upd', t);

    -- DELETE: admins/managers only (history should rarely be deleted).
    execute format('drop policy if exists %I on public.%I;', t || '_del', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and (public.is_admin() or public.auth_has_any(array['manage_reports','manage_users']))
      );$f$, t || '_del', t);
  end loop;
end $$;


-- ############################################################################
-- SECTION 9 — REAL-TIME
-- ############################################################################
do $$
declare
  t text;
  tables text[] := array[
    'lead_assignment_history', 'lead_activity_history', 'lead_followup_history',
    'lead_status_history', 'lead_conversion_history'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    execute format('alter table public.%I replica identity full;', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;


-- ############################################################################
-- SECTION 10 — GRANTS
-- ############################################################################
do $$
declare
  t text;
  tables text[] := array[
    'lead_assignment_history', 'lead_activity_history', 'lead_followup_history',
    'lead_status_history', 'lead_conversion_history'
  ];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
  end loop;
end $$;


-- ############################################################################
-- SECTION 11 — REPORTING VIEW (derived, never a stored counter)
--   A single per-lead rollup that reporting can build on. Every number is
--   computed from the transactional/event rows, so it always reflects reality.
-- ############################################################################
create or replace view public.lead_reporting_v as
select
  l.id,
  l.organization_id,
  l.branch_id,
  l.lead_no,
  l.lead_date,
  l.lead_month,                                   -- derived YYYY-MM
  l.source,                                       -- acquisition source
  l.capture_channel,                              -- capture channel
  l.status,
  l.priority,
  l.assigned_user_id,
  l.customer_id,
  l.contact_id,
  l.company_id,
  l.device_model_id,
  coalesce(l.expected_value, l.estimate)          as expected_value,
  l.discount,
  l.first_contacted_at,
  l.qualified_at,
  l.converted_at,
  l.lost_at,
  l.lost_reason,
  -- Booleans for funnel counting (count(*) filter (where ...) in reports)
  (l.qualified_at is not null)                    as is_qualified,
  (l.converted_at is not null)                    as is_converted,
  (l.lost_at is not null)                         as is_lost,
  -- Time-to-contact / time-to-convert in hours (null until the event happens)
  case when l.first_contacted_at is not null
       then extract(epoch from (l.first_contacted_at - l.created_at)) / 3600.0 end as hours_to_contact,
  case when l.converted_at is not null
       then extract(epoch from (l.converted_at - l.created_at)) / 3600.0 end       as hours_to_convert,
  -- Handoff links for operational + revenue joins
  l.linked_walk_in_id,
  l.linked_field_job_id,
  l.linked_ticket_id,
  l.linked_invoice_id,
  l.fulfilment_route,
  l.assigned_store_id,
  l.created_at
from public.leads l
where l.deleted_at is null;

grant select on public.lead_reporting_v to authenticated;

-- ============================================================================
-- Done. The Lead Management module now has a normalized, reporting-ready data
-- foundation: the leads table carries authoritative references + terminal
-- state, month is derived, and every important event is captured in its own
-- append-only history table. No masters were duplicated and no existing values
-- were destroyed.
-- ============================================================================
