-- 0061_lead_intelligence_foundation.sql
-- Query + authorization foundation for deterministic Lead Intelligence.
-- Additive/idempotent: no stored counters, no predictive score, no duplicate
-- permission system. Raw Lead/history visibility remains governed by existing
-- RLS; store scope remains separate from performance capability.

-- Cohort and owner filters used together by individual/selected-agent analysis.
create index if not exists leads_intelligence_owner_cohort_idx
  on public.leads (organization_id, assigned_user_id, branch_id, lead_date)
  where deleted_at is null;

create index if not exists leads_intelligence_dimensions_idx
  on public.leads (organization_id, assigned_user_id, source, fulfilment_route, priority)
  where deleted_at is null;

create index if not exists lead_followup_intelligence_idx
  on public.lead_followup_history (followup_user_id, lead_id, status, scheduled_at, completed_at);

-- Harden the existing eligible Sales Agent directory. It remains the one source
-- for assignment and analytics subjects, but now requires a legitimate Lead
-- capability and refuses a requested branch outside the caller's store scope.
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
             'manage_reports', 'manage_sales'
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

-- Reassert reporting views as caller-invoker so direct evidence queries always
-- inherit Lead RLS (organization + authorized store + own/all data scope).
alter view if exists public.lead_reporting_v            set (security_invoker = true);
alter view if exists public.lead_conversion_reporting_v set (security_invoker = true);
