-- ############################################################################
-- 0073_decouple_performance_from_sales_scope.sql
--
-- REPAIROX — Decouple the shared "Agent Performance leaderboard" visibility
-- from row-level OPERATIONAL data visibility (deals / quotations / contacts).
--
-- CONTEXT:
--   • `leads_performance_view_all` is the key that lets a user see the SHARED
--     Agent Performance leaderboard (all agents' metrics) — a read-only
--     competition view. We WANT every Sales Agent to have it.
--   • But 0051 folded that key into `auth_lead_see_all()`, so holding it also
--     granted row-level SELECT on every lead — and therefore (transitively,
--     via auth_lead_visible) on every agent's DEALS, plus (via auth_sales_see_all
--     from 0071) their CONTACTS / QUOTATIONS. That broke "each agent is a fresh,
--     own-only account": one agent could see another's deals/contacts/quotations.
--
-- GOAL (the product rule):
--   • Agent Performance leaderboard + the Lead Table + the leads list stay
--     visible to agents  →  `auth_lead_see_all()` KEEPS `leads_performance_view_all`
--     (UNCHANGED here — leads remain readable so the client leaderboard engine
--     resolves every agent, and the Lead Table is untouched).
--   • Deals / Quotations / Contacts become OWN-ONLY for an agent whose ONLY
--     cross-agent key is `leads_performance_view_all`  →  introduce a STRICTER
--     "sales operational see-all" predicate that DROPS the leaderboard key, and
--     point those three surfaces at it.
--
-- Net: perf key = "see the scoreboard + the leads", NOT "see everyone's deals/
-- quotations/contacts". A true owner/manager (leads_view_all / manage_reports /
-- manage_users / full_access / '*') still sees everything everywhere.
--
-- Additive + idempotent (create or replace / drop policy if exists).
-- ############################################################################

-- ── Strict operational see-all (NO leaderboard-only key) ─────────────────────
-- This is the "owner/manager" predicate for OPERATIONAL sales data. It is the
-- same owner keys as the lead see-all EXCEPT it deliberately omits
-- `leads_performance_view_all` (leaderboard view ≠ operational data access).
create or replace function public.auth_sales_see_all()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_has_any(array[
    'leads_view_all', 'leads_view_team',
    'view_sales_reports', 'view_financial_reports', 'manage_reports', 'manage_users'
  ]);
$$;
grant execute on function public.auth_sales_see_all() to authenticated;

-- Strict lead visibility for OPERATIONAL child records (deals): a lead is
-- "operationally visible" when the caller owns/created/follows it, or holds a
-- STRICT operational see-all key — NOT merely the leaderboard key.
create or replace function public.auth_lead_visible_strict(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and public.auth_member_of_org(l.organization_id)
      and public.auth_branch_visible(l.branch_id)
      and (
        public.auth_sales_see_all()
        or l.created_by         = public.auth_staff_id()
        or l.assigned_to        = public.auth_staff_id()
        or l.assigned_user_id   = public.auth_staff_id()
        or l.follow_up_agent_id = public.auth_staff_id()
        or public.auth_is_lead_followup_agent(l.id)
      )
  );
$$;
grant execute on function public.auth_lead_visible_strict(uuid) to authenticated;


-- ── DEALS: visible only when the caller can view all deals (owner/approver) OR
--    the parent lead is OPERATIONALLY visible (own/assigned/follow-up or a
--    strict operational see-all) — the leaderboard key no longer leaks deals. ──
drop policy if exists lead_deals_sel on public.lead_deals;
create policy lead_deals_sel on public.lead_deals for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.auth_has_any(array['deals_view_all', 'deals_approve', 'manage_sales', 'manage_reports'])
    or public.auth_lead_visible_strict(lead_id)
  )
);

-- CONTACTS + QUOTATIONS already use auth_sales_see_all() (migration 0071); the
-- redefinition above (dropping the leaderboard key) is what tightens them. No
-- policy change needed here — they inherit the stricter predicate automatically.
