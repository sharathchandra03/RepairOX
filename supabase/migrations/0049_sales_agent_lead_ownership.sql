-- ############################################################################
-- 0049_sales_agent_lead_ownership.sql
--
-- REPAIROX — LEAD MANAGEMENT PHASE 1
--   SALES AGENT ROLE + ASSIGNMENT + VISIBILITY + OWNERSHIP
--
-- Builds on 0002 (leads + RLS), 0045 (assigned_user_id, history tables,
-- auth_lead_visible), 0046 (follow-up / assignment history columns) and 0048
-- (follow_up_agent_id). Additive + idempotent. It:
--
--   1. Creates the built-in SALES AGENT role as a REAL roles row with REAL
--      role_permissions rows (no frontend-only role).
--   2. Adds the eligibility model: a user is an eligible lead owner (Sales
--      Agent) when they are ACTIVE and their role holds the exact key
--      `leads_sales_agent` (never implied by full_access / '*'), AND they are
--      authorized for the lead's store. `staff_store_ids()` mirrors
--      auth_store_ids() for any staff member; `lead_agent_eligible()` is the
--      single predicate; `lead_sales_agents()` is the store-scoped RPC the
--      Agent pickers read (the client can't read other users' user_stores).
--   3. Enforces ownership in the DATABASE (BEFORE trigger, runs after the
--      0045 sync trigger):
--        • created_by is always the signed-in user and immutable;
--        • a creating Sales Agent becomes the default owner automatically;
--        • the owner / follow-up agent must be an eligible Sales Agent for the
--          lead's store (inactive / ineligible users can't receive new work);
--        • first-assign vs reassign require the matching capability;
--        • ownership metadata (assigned_by/at/name) is server-stamped;
--        • soft delete requires the Delete capability.
--   4. Writes lead_assignment_history from an AFTER trigger on EVERY owner
--      change (create + reassign + unassign) — transactional, never skipped.
--   5. Rewrites lead visibility so UI = RLS: see-all keys (incl. leads_view_all
--      / leads_view_team) OR created / owned / follow-up agent (lead column or
--      an assigned follow-up record). Writes accept the granular lead keys so a
--      Sales Agent works WITHOUT the coarse manage_sales key.
--   6. Makes the two lead reporting views SECURITY INVOKER so they obey the
--      caller's RLS (they previously bypassed it).
--
-- Historical ownership is never rewritten: existing owners stay as they are
-- even if they are no longer Sales Agents; only NEW assignments are validated.
-- ############################################################################


-- ============================================================================
-- SECTION 1 — SALES AGENT role + default grants
--   Default intent: own/assigned lead work only. NO leads_view_all,
--   leads_view_team, view_sales_reports, manage_sales, manage_users,
--   manage_roles, add_user, multi_store_access, stores_view_all, full_access.
--   The Owner can change any of these in Settings → Roles & Permissions.
-- ============================================================================
insert into public.roles (id, label, summary, workspaces, is_custom)
values (
  'sales_agent',
  'Sales Agent',
  'Captures and works their own leads — owned, assigned and follow-up leads only.',
  array['leads'],
  false
)
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_key)
select 'sales_agent', k.key
from (values
  ('leads_sales_agent'),
  ('leads_view'), ('leads_create'), ('leads_edit'), ('leads_followup'), ('leads_assign'),
  ('leads_stage_change'), ('leads_priority_change'), ('leads_pin'),
  ('leads_performance_view_own'),
  ('comms_call_log'), ('comms_activities_view'),
  ('view_customers'), ('contacts_view'), ('contacts_create'),
  ('view_device_catalog'),
  ('view_dashboard'),
  ('account_password_change'), ('account_pin_manage'),
  ('notifications_view'), ('notifications_mark_read')
) as k(key)
where exists (select 1 from public.roles r where r.id = 'sales_agent')
on conflict (role_id, permission_key) do nothing;


-- ============================================================================
-- SECTION 2 — Store scope of ANY staff member + Sales Agent eligibility
-- ============================================================================

-- Mirrors auth_store_ids() for an arbitrary staff member (not just the caller):
-- owners / multi_store_access / '*' → every store in their org; otherwise their
-- home store + active user_stores grants.
create or replace function public.staff_store_ids(p_staff_id uuid)
returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v uuid[];
begin
  select id, organization_id, branch_id, role_id into s
  from public.staff where id = p_staff_id;
  if not found then
    return '{}'::uuid[];
  end if;

  if s.role_id in ('master_shop_owner', 'platform_owner', 'developer_admin')
     or exists (
       select 1 from public.role_permissions rp
       where rp.role_id = s.role_id and rp.permission_key in ('*', 'multi_store_access')
     ) then
    select coalesce(array_agg(b.id), '{}'::uuid[]) into v
    from public.branches b where b.organization_id = s.organization_id;
    return v;
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v
  from (
    select s.branch_id as x
    union
    select us.branch_id from public.user_stores us
    where us.staff_id = s.id and us.status = 'active'
  ) t
  where x is not null;
  return v;
end;
$$;

-- THE eligibility predicate for lead ownership + follow-up responsibility.
--   • active user (status = 'active')
--   • role holds the EXACT key 'leads_sales_agent' (full_access / '*' do NOT
--     make an owner a Sales Agent)
--   • same organization (when given)
--   • authorized for the lead's store (or the lead is org-wide: branch null)
create or replace function public.lead_agent_eligible(p_staff_id uuid, p_branch_id uuid, p_org_id uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.staff s
    where s.id = p_staff_id
      and coalesce(s.status, 'active') = 'active'
      and (p_org_id is null or s.organization_id = p_org_id)
      and exists (
        select 1 from public.role_permissions rp
        where rp.role_id = s.role_id and rp.permission_key = 'leads_sales_agent'
      )
      and (p_branch_id is null or p_branch_id = any(public.staff_store_ids(s.id)))
  );
$$;

-- Store-scoped Sales Agent directory for the Agent / Follow-up Agent pickers.
-- Returns ONLY eligible Sales Agents of the caller's organization. A caller
-- without multi-store access sees only agents who share one of their stores,
-- and each agent's store list is intersected with the caller's own stores (no
-- unauthorized store ids leak). Pass p_branch_id to get agents for one store.
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
           public.auth_store_ids()        as mine
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
    and (p_branch_id is null or p_branch_id = any(a.ids))
    and (me.xb or a.ids && me.mine)
  order by lower(a.name);
$$;

-- Internal helpers are not callable directly by clients (they reveal other
-- users' store scope). The RPC below is the only client entry point.
revoke all on function public.staff_store_ids(uuid) from public, anon, authenticated;
revoke all on function public.lead_agent_eligible(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lead_sales_agents(uuid) from public, anon;
grant execute on function public.lead_sales_agents(uuid) to authenticated;


-- ============================================================================
-- SECTION 3 — Lead visibility helpers (UI = RLS)
-- ============================================================================

-- "See every lead in my store scope." Must match CAP.lead.viewTeam / viewAll
-- in app/src/lib/capabilities.ts. auth_has_any also honours is_admin(),
-- full_access and '*'. manage_sales is a WRITE key, not a visibility key.
create or replace function public.auth_lead_see_all()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_has_any(array[
    'leads_view_all', 'leads_view_team',
    'view_sales_reports', 'view_financial_reports', 'manage_reports', 'manage_users'
  ]);
$$;

-- The caller is the follow-up agent on at least one (non-cancelled) follow-up
-- of this lead → the lead is part of their follow-up workload.
create or replace function public.auth_is_lead_followup_agent(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lead_followup_history f
    where f.lead_id = p_lead_id
      and f.followup_user_id = public.auth_staff_id()
      and coalesce(f.status, 'scheduled') <> 'cancelled'
  );
$$;

grant execute on function public.auth_lead_see_all()                to authenticated;
grant execute on function public.auth_is_lead_followup_agent(uuid)  to authenticated;

-- History visibility follows the parent lead (same predicate as leads_sel).
create or replace function public.auth_lead_visible(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and public.auth_member_of_org(l.organization_id)
      and public.auth_branch_visible(l.branch_id)
      and (
        public.auth_lead_see_all()
        or l.created_by         = public.auth_staff_id()
        or l.assigned_to        = public.auth_staff_id()
        or l.assigned_user_id   = public.auth_staff_id()
        or l.follow_up_agent_id = public.auth_staff_id()
        or public.auth_is_lead_followup_agent(l.id)
      )
  );
$$;
grant execute on function public.auth_lead_visible(uuid) to authenticated;


-- ============================================================================
-- SECTION 4 — Ownership columns + triggers
-- ============================================================================

-- Optional free-text reason carried by an assignment write, recorded into
-- lead_assignment_history by the AFTER trigger (then cleared on the next write).
alter table public.leads add column if not exists last_assignment_reason text;

create index if not exists leads_created_by_idx on public.leads(created_by);

-- 4a. Sync fix: an UPDATE that changes only ONE side of the owner pair must
-- mirror to the other (0045 left assigned_user_id stale when only assigned_to
-- changed). assigned_user_id is canonical; assigned_to is the legacy mirror.
create or replace function public.leads_sync_assignee()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.assigned_user_id is distinct from old.assigned_user_id then
      new.assigned_to := new.assigned_user_id;
    elsif new.assigned_to is distinct from old.assigned_to then
      new.assigned_user_id := new.assigned_to;
    end if;
    return new;
  end if;
  -- INSERT
  if new.assigned_user_id is null and new.assigned_to is not null then
    new.assigned_user_id := new.assigned_to;
  elsif new.assigned_user_id is not null then
    new.assigned_to := new.assigned_user_id;
  end if;
  return new;
end;
$$;

-- 4b. Ownership guard. Trigger name sorts AFTER leads_sync_assignee_trg so it
-- sees the synchronized pair. Service-role writes (no end-user JWT) skip the
-- end-user checks.
create or replace function public.leads_ownership_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me         uuid := public.auth_staff_id();
  v_me_name    text;
  v_changed    boolean := false;
  v_fu_changed boolean := false;
begin
  if auth.uid() is null then
    return new;
  end if;
  select s.name into v_me_name from public.staff s where s.id = v_me;

  if tg_op = 'INSERT' then
    -- created_by is ALWAYS the signed-in user (never client-supplied).
    new.created_by := v_me;
    -- Default owner = the creating Sales Agent (IVR / phone capture flow).
    if new.assigned_user_id is null
       and v_me is not null
       and public.lead_agent_eligible(v_me, new.branch_id, new.organization_id) then
      new.assigned_user_id := v_me;
    end if;
    v_changed := new.assigned_user_id is not null;
    -- Creating a lead OWNED BY SOMEONE ELSE is an assignment.
    if v_changed
       and new.assigned_user_id is distinct from v_me
       and not public.auth_has_any(array['leads_assign', 'assign', 'manage_sales']) then
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
    -- created_by is immutable.
    new.created_by := old.created_by;
    v_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    if v_changed then
      if old.assigned_user_id is null then
        if not public.auth_has_any(array['leads_assign', 'assign', 'manage_sales']) then
          raise exception 'lead_assign_forbidden: you are not allowed to assign leads'
            using errcode = '42501';
        end if;
      elsif not public.auth_has_any(array['leads_reassign', 'leads_assign', 'assign', 'manage_sales']) then
        raise exception 'lead_reassign_forbidden: you are not allowed to change the lead owner'
          using errcode = '42501';
      end if;
    else
      -- Ownership metadata only ever changes together with the owner.
      new.assigned_to      := old.assigned_to;
      new.assigned_to_name := old.assigned_to_name;
      new.assigned_by      := old.assigned_by;
      new.assigned_by_name := old.assigned_by_name;
      new.assigned_at      := old.assigned_at;
      new.last_assignment_reason := null;
    end if;
    v_fu_changed := new.follow_up_agent_id is distinct from old.follow_up_agent_id;
    -- Soft delete is the Delete capability, not a plain edit.
    if old.deleted_at is null and new.deleted_at is not null
       and not public.auth_has_any(array['leads_delete', 'manage_sales']) then
      raise exception 'lead_delete_forbidden: you are not allowed to delete leads'
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
    new.agent            := new.assigned_to_name;   -- cached display label of AGENTS
    new.assigned_by      := v_me;
    new.assigned_by_name := v_me_name;
    new.assigned_at      := case when new.assigned_user_id is null then null else now() end;
    if tg_op = 'UPDATE' and new.last_assignment_reason is not distinct from old.last_assignment_reason then
      new.last_assignment_reason := null;           -- stale reason from an earlier write
    end if;
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
    -- The cached name always follows the id (never free text when an id exists).
    new.follow_up_agent := (select s.name from public.staff s where s.id = new.follow_up_agent_id);
  end if;

  return new;
end;
$$;

drop trigger if exists leads_tz_ownership_guard_trg on public.leads;
create trigger leads_tz_ownership_guard_trg
  before insert or update on public.leads
  for each row execute function public.leads_ownership_guard();

-- 4c. Assignment history — one append-only row per owner change, written in
-- the SAME transaction as the change (create, assign, reassign, unassign).
create or replace function public.leads_record_assignment()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_user_id is null then
      return null;
    end if;
  elsif new.assigned_user_id is not distinct from old.assigned_user_id then
    return null;
  end if;

  insert into public.lead_assignment_history (
    organization_id, branch_id, lead_id,
    from_user_id, from_user_name,
    to_user_id, to_user_name,
    assigned_by, assigned_by_name,
    reason, actor_staff_id
  ) values (
    new.organization_id, new.branch_id, new.id,
    case when tg_op = 'UPDATE' then old.assigned_user_id end,
    case when tg_op = 'UPDATE' then old.assigned_to_name end,
    new.assigned_user_id, new.assigned_to_name,
    coalesce(new.assigned_by, public.auth_staff_id()), new.assigned_by_name,
    coalesce(new.last_assignment_reason, case when tg_op = 'INSERT' then 'Lead created' end),
    public.auth_staff_id()
  );
  return null;
end;
$$;

drop trigger if exists leads_assignment_history_trg on public.leads;
create trigger leads_assignment_history_trg
  after insert or update on public.leads
  for each row execute function public.leads_record_assignment();

-- 4d. Follow-up record guard: the follow-up agent must be an eligible Sales
-- Agent for the lead's store; names are server-stamped; created_by is the
-- signed-in user; a completed/cancelled follow-up's agent is history (frozen).
create or replace function public.lead_followup_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lead record;
  v_me   uuid := public.auth_staff_id();
begin
  if auth.uid() is null then
    return new;
  end if;
  select l.organization_id, l.branch_id into v_lead from public.leads l where l.id = new.lead_id;

  if tg_op = 'INSERT' then
    new.created_by      := v_me;
    new.created_by_name := (select s.name from public.staff s where s.id = v_me);
  elsif new.followup_user_id is distinct from old.followup_user_id
        and coalesce(old.status, 'scheduled') <> 'scheduled' then
    raise exception 'lead_followup_closed: a completed or cancelled follow-up can''t be reassigned'
      using errcode = '23514';
  end if;

  if new.followup_user_id is not null
     and (tg_op = 'INSERT' or new.followup_user_id is distinct from old.followup_user_id) then
    if not public.lead_agent_eligible(new.followup_user_id, v_lead.branch_id, v_lead.organization_id) then
      raise exception 'lead_followup_agent_not_eligible: the follow-up agent must be an active Sales Agent authorized for this store'
        using errcode = '23514';
    end if;
    new.followup_user_name := (select s.name from public.staff s where s.id = new.followup_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists lead_followup_guard_trg on public.lead_followup_history;
create trigger lead_followup_guard_trg
  before insert or update on public.lead_followup_history
  for each row execute function public.lead_followup_guard();


-- ============================================================================
-- SECTION 5 — Leads RLS (visibility = see-all keys OR own / assigned / follow-up)
-- ============================================================================
drop policy if exists leads_sel on public.leads;
create policy leads_sel on public.leads for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.auth_lead_see_all()
    or created_by         = public.auth_staff_id()
    or assigned_to        = public.auth_staff_id()
    or assigned_user_id   = public.auth_staff_id()
    or follow_up_agent_id = public.auth_staff_id()
    or public.auth_is_lead_followup_agent(id)
  )
);

drop policy if exists leads_ins on public.leads;
create policy leads_ins on public.leads for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['leads_create', 'leads_import', 'manage_sales'])
);

-- Update: only leads the caller can SEE, with a lead-work key. What they may
-- change (owner / follow-up agent / delete) is further enforced by the guard.
drop policy if exists leads_upd on public.leads;
create policy leads_upd on public.leads for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.auth_lead_see_all()
    or created_by         = public.auth_staff_id()
    or assigned_to        = public.auth_staff_id()
    or assigned_user_id   = public.auth_staff_id()
    or follow_up_agent_id = public.auth_staff_id()
    or public.auth_is_lead_followup_agent(id)
  )
  and public.auth_has_any(array[
    'leads_edit', 'leads_followup', 'leads_assign', 'leads_reassign', 'leads_stage_change',
    'leads_priority_change', 'leads_pin', 'leads_convert', 'leads_delete', 'route_leads',
    'assign', 'manage_sales'
  ])
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array[
    'leads_edit', 'leads_followup', 'leads_assign', 'leads_reassign', 'leads_stage_change',
    'leads_priority_change', 'leads_pin', 'leads_convert', 'leads_delete', 'route_leads',
    'assign', 'manage_sales'
  ])
);

drop policy if exists leads_del on public.leads;
create policy leads_del on public.leads for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_lead_visible(id)
  and public.auth_has_any(array['leads_delete', 'manage_sales'])
);


-- ============================================================================
-- SECTION 6 — History RLS: granular lead-work keys (no manage_sales needed)
-- ============================================================================
do $$
declare
  t text;
  tables text[] := array[
    'lead_assignment_history', 'lead_activity_history', 'lead_followup_history',
    'lead_status_history', 'lead_conversion_history'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I;', t || '_ins', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(array[
          'leads_create', 'leads_edit', 'leads_followup', 'leads_assign', 'leads_reassign',
          'leads_stage_change', 'leads_convert', 'route_leads', 'comms_call_log',
          'assign', 'manage_sales'
        ])
        and public.auth_lead_visible(lead_id)
      );$f$, t || '_ins', t);
  end loop;
end $$;

-- Follow-ups are worked (completed / cancelled / rescheduled / agent changed)
-- by anyone who may work the lead's follow-ups and can see the lead. Other
-- history tables stay manager-correctable only (0045).
drop policy if exists lead_followup_history_upd on public.lead_followup_history;
create policy lead_followup_history_upd on public.lead_followup_history for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.is_admin()
    or public.auth_has_any(array['manage_reports', 'manage_users'])
    or (public.auth_has_any(array['leads_followup', 'leads_edit', 'manage_sales'])
        and public.auth_lead_visible(lead_id))
  )
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
);


-- ============================================================================
-- SECTION 7 — Reporting views obey the caller's RLS
--   Plain views run as their owner and bypassed leads RLS, so any signed-in
--   user could read every lead's reporting row. SECURITY INVOKER fixes that.
-- ============================================================================
alter view if exists public.lead_reporting_v            set (security_invoker = true);
alter view if exists public.lead_conversion_reporting_v set (security_invoker = true);


-- ============================================================================
-- Done. Sales Agent is a real role; lead ownership + follow-up responsibility
-- are user ids validated against role eligibility AND store scope; every owner
-- change is recorded in lead_assignment_history in the same transaction; and a
-- Sales Agent sees only created / owned / follow-up leads unless a see-all key
-- is granted. UI = server = RLS.
-- ============================================================================
