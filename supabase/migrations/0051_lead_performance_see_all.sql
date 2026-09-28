-- 0051_lead_performance_see_all.sql
-- Align the lead see-all predicate with CAP.lead.viewTeam.
--
-- The owner "All Agents" performance leaderboard is gated on
-- `leads_performance_view_all` (CAP.lead.performanceAll). Previously that key
-- did NOT widen lead visibility, so a role granted ONLY that granular key would
-- pass the UI gate but the RLS-scoped lead set stayed own-only — the leaderboard
-- would show just the owner's own row. Add `leads_performance_view_all` to
-- auth_lead_see_all() so UI = RLS: whoever may view all agents' performance can
-- also resolve every agent's leads within their store scope.
--
-- Additive + idempotent (create or replace). auth_has_any() still honours
-- is_admin(), full_access and '*'. manage_sales remains a WRITE key (not here).

create or replace function public.auth_lead_see_all()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_has_any(array[
    'leads_view_all', 'leads_view_team', 'leads_performance_view_all',
    'view_sales_reports', 'view_financial_reports', 'manage_reports', 'manage_users'
  ]);
$$;

grant execute on function public.auth_lead_see_all() to authenticated;
