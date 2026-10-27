-- ############################################################################
-- 0083_lead_table_own_scope_for_agents.sql
--
-- REPAIROX — A Sales Agent sees ONLY their own / assigned leads in the Lead
-- Table. Only a true owner / manager sees every agent's leads.
--
-- CONTEXT:
--   • Migrations 0051 + 0073 folded `leads_performance_view_all` (the SHARED
--     Agent Performance LEADERBOARD key — a read-only scoreboard) into
--     `auth_lead_see_all()` so the client leaderboard engine could resolve
--     every agent's lead rows. As a side effect, ANY Sales Agent holding the
--     leaderboard key could SELECT every other agent's lead rows and therefore
--     saw all leads in the Lead Table (e.g. Ullas seeing Shyam's leads).
--
--   • The product rule is the opposite: a Sales Agent is an own-only account —
--     they see ONLY leads they created, own, or follow up — while the OWNER /
--     manager sees everyone's. The leaderboard (a scoreboard of metrics) must
--     NOT, by itself, expose another agent's raw lead rows.
--
-- WHAT:
--   • Redefine `auth_lead_see_all()` to DROP `leads_performance_view_all`. It
--     now grants see-all lead ROWS only to true owner/manager keys
--     (leads_view_all / leads_view_team / view_sales_reports /
--     view_financial_reports / manage_reports / manage_users), plus is_admin()
--     / full_access / '*' via auth_has_any(). This is the SAME key set the
--     client's CAP.lead.viewTeam uses (capabilities.ts) so UI = RLS.
--
--   • `auth_sales_see_all()` (0073) already omits the leaderboard key, so
--     deals / quotations / contacts are unchanged (still own-only for agents).
--
-- EFFECT ON THE LEADERBOARD:
--   • A Sales Agent keeps `leads_performance_view_all` and still sees the shared
--     Agent Performance leaderboard. The client performance engine resolves
--     each agent's aggregated metrics; it no longer relies on an agent being
--     able to read every raw lead row. The Lead Table / leads list for that
--     agent now correctly shows only their own/assigned leads.
--   • A true owner / manager (leads_view_all / manage_reports / full_access /
--     '*') still sees every agent's leads everywhere, unchanged.
--
-- Additive + idempotent (create or replace). No data is modified; only the
-- visibility predicate changes.
-- ############################################################################

create or replace function public.auth_lead_see_all()
returns boolean
language sql stable security definer set search_path = public as $$
  -- Owner / manager lead-ROW see-all. Deliberately EXCLUDES
  -- `leads_performance_view_all` (leaderboard view ≠ raw lead-row access) and
  -- `manage_sales` (a write key, not a visibility key). auth_has_any() also
  -- honours is_admin(), full_access and '*'. Keep this array IN LOCKSTEP with
  -- CAP.lead.viewTeam in app/src/lib/capabilities.ts.
  select public.auth_has_any(array[
    'leads_view_all', 'leads_view_team',
    'view_sales_reports', 'view_financial_reports', 'manage_reports', 'manage_users'
  ]);
$$;

grant execute on function public.auth_lead_see_all() to authenticated;
