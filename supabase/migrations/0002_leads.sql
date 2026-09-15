-- ============================================================================
-- RepairOX — Lead Management schema (leads + configurable dropdown options).
--
-- Run this ONCE in Supabase → SQL Editor AFTER schema.sql (paste all, Run).
-- Safe to re-run: uses "if not exists" / "drop ... if exists" everywhere.
--
-- Depends on helper functions defined in schema.sql:
--   public.auth_org_id(), public.auth_branch_id(), public.auth_staff_id(),
--   public.auth_member_of_org(uuid), public.auth_branch_visible(uuid),
--   public.auth_has_any(text[]), public.fn_audit(), public.touch_updated_at().
--
-- WHAT THIS ADDS:
--   • public.leads          — one row per sales lead (all 28 Excel columns).
--   • public.lead_options   — admin-configurable dropdown master lists
--                             (Region, Source, Agent, Priority, Result, …).
--   • A per-org, gap-free Lead ID sequence (L-001, L-002, …) via
--     public.next_lead_id(uuid).
--   • RLS (manage_sales to write, broad sales/reporting keys to read),
--     audit trigger, updated_at trigger, realtime publication, grants.
-- ============================================================================


-- ############################################################################
-- SECTION 1 — LEAD OPTIONS (configurable dropdown master lists)
--   Each row is one selectable value for one lead field (field = 'source',
--   'region', 'priority', …). `active=false` archives a value: existing leads
--   keep their saved text, but the value no longer appears in NEW dropdowns.
-- ############################################################################

create table if not exists public.lead_options (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  field           text not null,               -- which lead field this option belongs to
  value           text not null,               -- the human label / stored value
  sort_order      integer not null default 0,  -- display order within the field
  active          boolean not null default true,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists lead_options_org_field_idx
  on public.lead_options(organization_id, field, sort_order);

-- Prevent duplicate values for the same field within an org.
create unique index if not exists lead_options_unique_value
  on public.lead_options(organization_id, field, lower(value));


-- ############################################################################
-- SECTION 2 — LEADS
--   Persists every field the sales team records today in the spreadsheet.
--   `lead_no` is the clean sequential display id (L-001). The primary key
--   `id` is a stable uuid so renames/re-sequences never break references.
-- ############################################################################

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id        uuid default public.auth_branch_id() references public.branches(id) on delete set null,

  -- ── Automatic identity / timestamps (never entered by the user) ──
  lead_no          text,                         -- L-001, L-002 … (per org)
  lead_date        date,                         -- creation date
  lead_time        text,                         -- creation time (HH:MM, 24h)
  lead_month       text,                         -- derived from lead_date (e.g. "August")

  -- ── Stage 1: Quick capture ──
  region           text,
  source           text,
  agent            text,
  name             text,
  number           text,
  email            text,
  location         text,

  -- ── Stage 2: Qualification ──
  device           text,
  issue            text,
  category         text,
  estimate         numeric,
  discount         numeric,
  lead_category    text,
  lead_nature      text,
  priority         text,
  comments         text,

  -- ── Stage 3: Contact / follow-up / result ──
  contact_status   text,
  status           text,
  result           text,
  final_remarks    text,
  follow_up_date   date,
  follow_up_agent  text,
  final_result     text,
  follow_up_comments text,

  -- ── Audit ──
  role_scope       text,
  created_by       uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by       uuid references public.staff(id) on delete set null,
  deleted_by       uuid references public.staff(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- ── Assignment (added idempotently) ──
--   assigned_to / assigned_by reference staff so per-user RLS visibility works.
--   The free-text `agent` field is kept as-is (display); `assigned_to` is the
--   authoritative owner used for visibility + notifications.
alter table public.leads add column if not exists assigned_to      uuid references public.staff(id) on delete set null;
alter table public.leads add column if not exists assigned_by      uuid references public.staff(id) on delete set null;
alter table public.leads add column if not exists assigned_to_name text;
alter table public.leads add column if not exists assigned_by_name text;
alter table public.leads add column if not exists assigned_at      timestamptz;
-- Pin state: a non-null pinned_at floats the lead to the top of the list.
alter table public.leads add column if not exists pinned_at        timestamptz;

create index if not exists leads_org_idx        on public.leads(organization_id);
create index if not exists leads_created_idx     on public.leads(created_at desc);
create index if not exists leads_follow_up_idx    on public.leads(follow_up_date);
create index if not exists leads_assignee_idx     on public.leads(assigned_to);
create unique index if not exists leads_org_no_unique
  on public.leads(organization_id, lead_no) where lead_no is not null;


-- ############################################################################
-- SECTION 3 — LEAD ID SEQUENCE  (L-001, L-002 … per organization)
--   Atomically get-and-increment the next lead number for an org. Gap-free and
--   race-safe via a dedicated counter table locked FOR UPDATE.
-- ############################################################################

create table if not exists public.lead_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_number     integer not null default 1
);

create or replace function public.next_lead_id(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  -- Seed the counter above any lead numbers that already exist for this org
  -- so re-running / importing never produces a duplicate.
  insert into public.lead_sequences (organization_id, next_number)
  values (
    p_org_id,
    coalesce((
      select max((regexp_replace(lead_no, '\D', '', 'g'))::int)
      from public.leads
      where organization_id = p_org_id and lead_no ~ '\d'
    ), 0) + 1
  )
  on conflict (organization_id) do nothing;

  select next_number into v_num
  from public.lead_sequences
  where organization_id = p_org_id
  for update;

  update public.lead_sequences
  set next_number = v_num + 1
  where organization_id = p_org_id;

  return 'L-' || lpad(v_num::text, 3, '0');
end;
$$;

-- Zero-arg convenience overload: derives the org from the signed-in user, so
-- the browser client can call `supabase.rpc('next_lead_id')` with no params.
create or replace function public.next_lead_id()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_lead_id(public.auth_org_id());
$$;


-- ############################################################################
-- SECTION 4 — updated_at + audit triggers
-- ############################################################################

do $$
begin
  -- touch_updated_at keeps updated_at fresh on every UPDATE (defined in schema.sql)
  if exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    execute 'drop trigger if exists touch_leads on public.leads';
    execute 'create trigger touch_leads before update on public.leads for each row execute function public.touch_updated_at()';
    execute 'drop trigger if exists touch_lead_options on public.lead_options';
    execute 'create trigger touch_lead_options before update on public.lead_options for each row execute function public.touch_updated_at()';
  end if;

  -- fn_audit records who did what (defined in schema.sql)
  if exists (select 1 from pg_proc where proname = 'fn_audit') then
    execute 'drop trigger if exists audit_leads on public.leads';
    execute 'create trigger audit_leads after insert or update or delete on public.leads for each row execute function public.fn_audit(''Lead'')';
    execute 'drop trigger if exists audit_lead_options on public.lead_options';
    execute 'create trigger audit_lead_options after insert or update or delete on public.lead_options for each row execute function public.fn_audit(''Lead Settings'')';
  end if;
end $$;


-- ############################################################################
-- SECTION 5 — ROW LEVEL SECURITY
--   leads:        read = broad sales/reporting keys; write = manage_sales.
--   lead_options: read = sales users; write = manage_settings (admin/owner).
-- ############################################################################

alter table public.leads        enable row level security;
alter table public.lead_options enable row level security;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('lead_options', array['manage_sales','view_sales_reports','manage_settings','view_only'],             array['manage_settings','manage_sales'])
    ) as x(tbl, read_keys, write_keys)
  loop
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_sel', r.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_sel', r.tbl, r.read_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_ins', r.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_ins', r.tbl, r.write_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_upd', r.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      )
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_upd', r.tbl, r.write_keys, r.write_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_del', r.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_del', r.tbl, r.write_keys);
  end loop;
end $$;

-- ── Leads: per-user assignment visibility ────────────────────────────────────
--   Owners/Managers (is_admin) and users with manager/report keys see ALL leads
--   in their org/branch scope. A plain sales user sees only leads they created
--   or that are assigned to them. Writes still require manage_sales.
drop policy if exists leads_sel on public.leads;
create policy leads_sel on public.leads for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.is_admin()
    or public.auth_has_any(array['view_sales_reports','view_financial_reports','manage_reports','manage_users'])
    or created_by = public.auth_staff_id()
    or assigned_to = public.auth_staff_id()
  )
);

drop policy if exists leads_ins on public.leads;
create policy leads_ins on public.leads for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['manage_sales'])
);

drop policy if exists leads_upd on public.leads;
create policy leads_upd on public.leads for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.is_admin()
    or public.auth_has_any(array['manage_sales'])
    or assigned_to = public.auth_staff_id()
    or created_by = public.auth_staff_id()
  )
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['manage_sales'])
);

drop policy if exists leads_del on public.leads;
create policy leads_del on public.leads for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['manage_sales'])
);


-- ############################################################################
-- SECTION 6 — REAL-TIME
-- ############################################################################

do $$
declare
  t text;
  tables text[] := array['leads', 'lead_options'];
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
-- SECTION 7 — GRANTS
-- ############################################################################

grant execute on function public.next_lead_id(uuid) to authenticated;
grant execute on function public.next_lead_id()     to authenticated;

do $$
declare
  t text;
  tables text[] := array['leads', 'lead_options', 'lead_sequences'];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
  end loop;
end $$;

-- ============================================================================
-- Done. The Lead Management module now reads/writes public.leads and loads
-- dropdown values from public.lead_options.
-- ============================================================================
