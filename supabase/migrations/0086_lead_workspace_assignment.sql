-- ############################################################################
-- 0086 — Lead workspace restructuring: Assigned inbox, Not-Contacted history,
--        manual lead assignment (Assign Leads) and the future Pending queue.
--
-- Additive + idempotent. Reuses (never forks) the existing ownership model:
--   • assigned_at / assigned_by / lead_assignment_history are ALREADY stamped by
--     leads_ownership_guard + leads_record_assignment (0049/0050). Untouched.
--   • NEW  leads.first_action_at   — the first meaningful agent action. Drives
--     "Assigned Leads" (the fresh-assignment INBOX). Trigger-owned, never
--     client-written.
--   • leads.first_contacted_at     — (exists since 0045, never written) now set
--     by trigger the first time contact_status reaches a genuinely "contacted"
--     state.
--   • lead_activity_history        — gets previous_contact_status; the trigger
--     writes one row per contact_status change (attempt / contacted) so the
--     Not-Contacted HISTORY view can show previous status, when and by whom.
--   • NEW  permission keys (TS catalog only; OFF by default, owners via
--     full_access):  leads_assign_intake  ("Assign Leads")
--                    leads_pending_access ("Access Pending Leads")
--   • NEW  pending_leads + pending_lead_events — the unassigned inbound queue
--     (service-role ingestion in future; this phase only reads/assigns).
--   • NEW  organization_settings.lead_first_response_sla_minutes (nullable).
-- ############################################################################

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.leads add column if not exists first_action_at timestamptz;
alter table public.lead_activity_history add column if not exists previous_contact_status text;

alter table public.organization_settings
  add column if not exists lead_first_response_sla_minutes integer;
do $$ begin
  alter table public.organization_settings
    add constraint organization_settings_lead_sla_positive
    check (lead_first_response_sla_minutes is null or lead_first_response_sla_minutes > 0);
exception when duplicate_object then null; end $$;

-- ── 2. Contact-status classifier (mirrors contactStatusClass in leads-data.ts) ──
create or replace function public.lead_contact_class(p text)
returns text language sql immutable as $$
  select case
    when btrim(coalesce(p, '')) = '' or lower(btrim(p)) like 'not contacted%' then 'not_contacted'
    when lower(p) ~ '(rnr|busy|switched off|switch off|no answer|not reachable|unreachable|not connected|no response|not picked|ringing|voicemail)' then 'attempted'
    else 'contacted'
  end;
$$;

-- ── 3. First-action / first-contact tracking ───────────────────────────────
create or replace function public.leads_track_first_action()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old text := public.lead_contact_class(old.contact_status);
  v_new text := public.lead_contact_class(new.contact_status);
begin
  if new.assigned_user_id is distinct from old.assigned_user_id
     and new.assigned_user_id is not null
     and v_new = 'not_contacted' then
    -- Re-assigned and still untouched: it is a FRESH assignment for the new
    -- owner's inbox again (assigned_at is re-stamped by the ownership guard).
    new.first_action_at := null;
  elsif new.first_action_at is null and (
       new.contact_status is distinct from old.contact_status
    or new.status         is distinct from old.status
    or new.lead_category  is distinct from old.lead_category
    or (new.converted_at is not null and old.converted_at is null)
    or (new.lost_at      is not null and old.lost_at      is null)
  ) then
    new.first_action_at := now();
  end if;

  if new.contact_status is distinct from old.contact_status then
    if v_old <> 'contacted' and v_new = 'contacted' then
      new.first_contacted_at := coalesce(new.first_contacted_at, now());
    end if;
    insert into public.lead_activity_history (
      organization_id, branch_id, lead_id, activity_type,
      contact_status, previous_contact_status, note, occurred_at, actor_staff_id
    ) values (
      new.organization_id, new.branch_id, new.id,
      case when v_new = 'contacted' then 'disposition' else 'contact_attempt' end,
      new.contact_status, old.contact_status, 'Contact status changed', now(),
      public.auth_staff_id()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists leads_zz_first_action_trg on public.leads;
create trigger leads_zz_first_action_trg
  before update on public.leads
  for each row execute function public.leads_track_first_action();

-- Scheduling a follow-up is a meaningful action.
create or replace function public.lead_followup_marks_first_action()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.leads set first_action_at = now()
  where id = new.lead_id and first_action_at is null;
  return null;
end;
$$;

drop trigger if exists lead_followup_first_action_trg on public.lead_followup_history;
create trigger lead_followup_first_action_trg
  after insert on public.lead_followup_history
  for each row execute function public.lead_followup_marks_first_action();

-- Backfill: leads that already show real work are NOT fresh assignments.
-- Untouched, still-uncontacted leads stay NULL (they genuinely await action).
update public.leads l
set first_action_at = coalesce(l.first_contacted_at, l.updated_at, l.created_at)
where l.first_action_at is null
  and (
    public.lead_contact_class(l.contact_status) <> 'not_contacted'
    or lower(btrim(coalesce(l.status, ''))) not in ('', 'new lead', 'new')
    or l.converted_at is not null
    or l.lost_at is not null
    or exists (select 1 from public.lead_followup_history f where f.lead_id = l.id)
  );

create index if not exists leads_assigned_inbox_idx
  on public.leads (assigned_user_id, assigned_at desc)
  where first_action_at is null and deleted_at is null;

create index if not exists lead_activity_contact_idx
  on public.lead_activity_history (lead_id, occurred_at desc)
  where previous_contact_status is not null;

-- ── 4. Ownership guard — allow Assign Leads (leads_assign_intake) to CREATE a
--      lead owned by someone else. Copy of the 0050 definition + one key.
--      The update/reassign branches are intentionally unchanged.
create or replace function public.leads_ownership_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me         uuid := public.auth_staff_id();
  v_me_name    text;
  v_changed    boolean := false;
  v_fu_changed boolean := false;
  v_mine       boolean := false;
  v_broad      boolean := false;
begin
  if auth.uid() is null then
    return new;
  end if;
  select s.name into v_me_name from public.staff s where s.id = v_me;

  if tg_op = 'INSERT' then
    new.created_by := v_me;
    if new.assigned_user_id is null
       and v_me is not null
       and public.lead_agent_eligible(v_me, new.branch_id, new.organization_id) then
      new.assigned_user_id := v_me;
    end if;
    v_changed := new.assigned_user_id is not null;
    if v_changed
       and new.assigned_user_id is distinct from v_me
       and not public.auth_has_any(array['leads_assign', 'leads_assign_intake', 'assign', 'manage_sales']) then
      raise exception 'lead_assign_forbidden: you can only create leads owned by yourself'
        using errcode = '42501';
    end if;
    v_fu_changed := new.follow_up_agent_id is not null;
    if not v_changed then
      new.assigned_to      := null;
      new.assigned_to_name := null;
      new.assigned_by      := null;
      new.assigned_by_name := null;
      new.assigned_at      := null;
    end if;
  else
    new.created_by := old.created_by;
    v_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    if v_changed then
      v_mine  := coalesce(old.assigned_user_id = v_me, false) or coalesce(old.created_by = v_me, false);
      v_broad := coalesce(public.auth_has_any(array['leads_reassign', 'assign', 'manage_sales']), false);
      if not coalesce(
           v_broad
           or (public.auth_has_any(array['leads_assign']) and (v_mine or public.auth_lead_see_all())),
           false) then
        if old.assigned_user_id is null then
          raise exception 'lead_assign_forbidden: you are not allowed to assign this lead'
            using errcode = '42501';
        else
          raise exception 'lead_reassign_forbidden: you are not allowed to change the owner of this lead'
            using errcode = '42501';
        end if;
      end if;
    else
      new.assigned_to      := old.assigned_to;
      new.assigned_to_name := old.assigned_to_name;
      new.assigned_by      := old.assigned_by;
      new.assigned_by_name := old.assigned_by_name;
      new.assigned_at      := old.assigned_at;
      new.agent            := old.agent;
      new.last_assignment_reason := null;
      if new.branch_id is distinct from old.branch_id
         and new.assigned_user_id is not null
         and not public.lead_agent_eligible(new.assigned_user_id, new.branch_id, new.organization_id) then
        raise exception 'lead_owner_not_eligible: the lead owner must be an active Sales Agent authorized for this store'
          using errcode = '23514';
      end if;
    end if;
    v_fu_changed := new.follow_up_agent_id is distinct from old.follow_up_agent_id
                 or (new.branch_id is distinct from old.branch_id and new.follow_up_agent_id is not null);
    if (old.deleted_at is null) <> (new.deleted_at is null)
       and not public.auth_has_any(array['leads_delete', 'manage_sales']) then
      raise exception 'lead_delete_forbidden: you are not allowed to delete or restore leads'
        using errcode = '42501';
    end if;
  end if;

  if v_changed then
    if new.assigned_user_id is not null
       and not public.lead_agent_eligible(new.assigned_user_id, new.branch_id, new.organization_id) then
      raise exception 'lead_owner_not_eligible: the lead owner must be an active Sales Agent authorized for this store'
        using errcode = '23514';
    end if;
    new.assigned_to      := new.assigned_user_id;
    new.assigned_to_name := (select s.name from public.staff s where s.id = new.assigned_user_id);
    new.agent            := new.assigned_to_name;
    new.assigned_by      := v_me;
    new.assigned_by_name := v_me_name;
    new.assigned_at      := case when new.assigned_user_id is null then null else now() end;
  end if;

  if v_fu_changed then
    if new.follow_up_agent_id is not null then
      if not public.lead_agent_eligible(new.follow_up_agent_id, new.branch_id, new.organization_id) then
        raise exception 'lead_followup_agent_not_eligible: the follow-up agent must be an active Sales Agent authorized for this store'
          using errcode = '23514';
      end if;
      new.follow_up_agent := (select s.name from public.staff s where s.id = new.follow_up_agent_id);
    elsif tg_op = 'UPDATE' then
      new.follow_up_agent := null;
    end if;
  elsif new.follow_up_agent_id is not null
        and tg_op = 'UPDATE'
        and new.follow_up_agent is distinct from old.follow_up_agent then
    new.follow_up_agent := (select s.name from public.staff s where s.id = new.follow_up_agent_id);
  end if;

  return new;
end;
$$;

-- ── 5. Insert policy — Assign Leads may create (and assign) incoming leads.
--      Store scope is still enforced by auth_branch_visible; visibility after
--      insert is the creator's own (created_by) — NOT all leads.
drop policy if exists leads_ins on public.leads;
create policy leads_ins on public.leads for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['leads_create', 'leads_import', 'leads_assign_intake', 'manage_sales'])
);

-- ── 6. Eligible-agent directory — let intake / pending users read it.
create or replace function public.lead_sales_agents(p_branch_id uuid default null)
returns table (
  staff_id       uuid,
  name           text,
  avatar_url     text,
  role_id        text,
  role_label     text,
  home_branch_id uuid,
  store_ids      uuid[]
)
language sql stable security definer set search_path = public as $$
  with me as (
    select public.auth_org_id()           as org,
           public.auth_can_cross_branch() as xb,
           public.auth_store_ids()        as mine,
           public.auth_has_any(array[
             'leads_view', 'leads_create', 'leads_edit', 'leads_followup',
             'leads_assign', 'leads_reassign', 'leads_performance_view_own',
             'leads_performance_view_all', 'leads_view_all', 'view_sales_reports',
             'manage_reports', 'manage_sales',
             'leads_assign_intake', 'leads_pending_access'
           ]) as may_use_directory
  ),
  agents as (
    select s.id, s.name, s.avatar_url, s.role_id, r.label, s.branch_id,
           public.staff_store_ids(s.id) as ids
    from public.staff s
    join me on s.organization_id = me.org
    left join public.roles r on r.id = s.role_id
    where coalesce(s.status, 'active') = 'active'
      and exists (
        select 1 from public.role_permissions rp
        where rp.role_id = s.role_id and rp.permission_key = 'leads_sales_agent'
      )
  )
  select a.id, a.name, a.avatar_url, a.role_id, a.label, a.branch_id,
         case when me.xb then a.ids
              else array(select unnest(a.ids) intersect select unnest(me.mine)) end
  from agents a
  cross join me
  where me.org is not null
    and me.may_use_directory
    and (p_branch_id is null or p_branch_id = any(a.ids))
    and (me.xb or a.ids && me.mine)
    and (me.xb or p_branch_id is null or p_branch_id = any(me.mine))
  order by lower(a.name);
$$;

revoke all on function public.lead_sales_agents(uuid) from public, anon;
grant execute on function public.lead_sales_agents(uuid) to authenticated;

-- ── 7. Pending Leads queue (future automated intake lands here) ─────────────
--   Pending = received, NOBODY owns it yet. Assigned (leads.assigned_user_id)
--   is a different state. Inbound ingestion (webhooks, round-robin, working
--   hours) is OUT OF SCOPE: rows arrive via the service role in a later phase.
create table if not exists public.pending_leads (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id        uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  name             text,
  number           text,
  email            text,
  device           text,
  issue            text,
  source           text,
  capture_channel  text,
  region           text,
  payload          jsonb not null default '{}'::jsonb,
  ingest_source    text not null default 'manual',     -- future: meta | google | whatsapp | form | email
  pending_reason   text,                               -- no_agent_available | outside_hours | no_rule | manual
  status           text not null default 'pending',    -- pending | assigning | assigned | discarded
  received_at      timestamptz not null default now(),
  assigned_lead_id uuid references public.leads(id) on delete set null,
  assigned_to      uuid references public.staff(id) on delete set null,
  assigned_by      uuid references public.staff(id) on delete set null,
  assigned_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pending_leads_status_chk check (status in ('pending', 'assigning', 'assigned', 'discarded'))
);
create index if not exists pending_leads_queue_idx
  on public.pending_leads (organization_id, branch_id, received_at desc) where status = 'pending';

create table if not exists public.pending_lead_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid,
  pending_lead_id  uuid not null references public.pending_leads(id) on delete cascade,
  event            text not null,           -- received | claim | assigned | released | discarded
  note             text,
  actor_staff_id   uuid,
  created_at       timestamptz not null default now()
);
create index if not exists pending_lead_events_idx on public.pending_lead_events (pending_lead_id, created_at);

alter table public.pending_leads enable row level security;
alter table public.pending_lead_events enable row level security;

drop policy if exists pending_leads_sel on public.pending_leads;
create policy pending_leads_sel on public.pending_leads for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['leads_pending_access'])
);

-- No end-user INSERT / DELETE policy: ingestion is service-role only.
drop policy if exists pending_leads_upd on public.pending_leads;
create policy pending_leads_upd on public.pending_leads for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['leads_pending_access'])
)
with check (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['leads_pending_access'])
);

drop policy if exists pending_lead_events_sel on public.pending_lead_events;
create policy pending_lead_events_sel on public.pending_lead_events for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['leads_pending_access'])
);
-- Events are written ONLY by the trigger below (append-only, un-forgeable).

-- Guard: only the workflow columns may change; legal transitions only; the
-- assignee must be an eligible Sales Agent for the store; assignment metadata
-- is server-stamped.
create or replace function public.pending_leads_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;   -- service role (ingestion / maintenance)
  end if;
  new.organization_id  := old.organization_id;
  new.branch_id        := old.branch_id;
  new.name             := old.name;
  new.number           := old.number;
  new.email            := old.email;
  new.device           := old.device;
  new.issue            := old.issue;
  new.source           := old.source;
  new.capture_channel  := old.capture_channel;
  new.region           := old.region;
  new.payload          := old.payload;
  new.ingest_source    := old.ingest_source;
  new.pending_reason   := old.pending_reason;
  new.received_at      := old.received_at;
  new.updated_at       := now();

  if new.status is distinct from old.status then
    if not (
         (old.status = 'pending'   and new.status in ('assigning', 'discarded'))
      or (old.status = 'assigning' and new.status in ('assigned', 'pending'))
    ) then
      raise exception 'pending_lead_invalid_transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
    if new.status = 'assigned' then
      if new.assigned_to is null or new.assigned_lead_id is null then
        raise exception 'pending_lead_assignment_incomplete' using errcode = '23514';
      end if;
      if not public.lead_agent_eligible(new.assigned_to, new.branch_id, new.organization_id) then
        raise exception 'lead_owner_not_eligible: the lead owner must be an active Sales Agent authorized for this store'
          using errcode = '23514';
      end if;
      new.assigned_by := public.auth_staff_id();
      new.assigned_at := now();
    elsif new.status = 'pending' then
      new.assigned_to := null; new.assigned_lead_id := null;
      new.assigned_by := null; new.assigned_at := null;
    end if;
  else
    new.assigned_to      := old.assigned_to;
    new.assigned_lead_id := old.assigned_lead_id;
    new.assigned_by      := old.assigned_by;
    new.assigned_at      := old.assigned_at;
  end if;
  return new;
end;
$$;

drop trigger if exists pending_leads_guard_trg on public.pending_leads;
create trigger pending_leads_guard_trg
  before update on public.pending_leads
  for each row execute function public.pending_leads_guard();

create or replace function public.pending_leads_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pending_lead_events (organization_id, branch_id, pending_lead_id, event, note, actor_staff_id)
    values (new.organization_id, new.branch_id, new.id, 'received', new.pending_reason, null);
  elsif new.status is distinct from old.status then
    insert into public.pending_lead_events (organization_id, branch_id, pending_lead_id, event, note, actor_staff_id)
    values (new.organization_id, new.branch_id, new.id,
      case new.status when 'assigning' then 'claim' when 'assigned' then 'assigned'
                      when 'pending' then 'released' else 'discarded' end,
      case when new.status = 'assigned' then new.assigned_to::text end,
      public.auth_staff_id());
  end if;
  return null;
end;
$$;

drop trigger if exists pending_leads_audit_trg on public.pending_leads;
create trigger pending_leads_audit_trg
  after insert or update on public.pending_leads
  for each row execute function public.pending_leads_audit();

-- ############################################################################
-- Permission keys are registered in the TS catalog (permissions.ts,
-- permission-levels.ts, capabilities.ts). They are intentionally NOT seeded on
-- any role: OFF by default, owners via full_access / is_admin().
-- ############################################################################
