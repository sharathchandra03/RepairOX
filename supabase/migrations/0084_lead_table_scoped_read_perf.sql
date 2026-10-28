-- ############################################################################
-- 0084_lead_table_scoped_read_perf.sql
--
-- REPAIROX — Speed up the Lead Table for SCOPED (own-scope) accounts.
--
-- PROBLEM:
--   A new Sales Agent (own-scope) account loads the Lead Table noticeably
--   slower than an owner/manager. An owner short-circuits `leads_sel` on the
--   first `auth_lead_see_all()` branch (a simple org + branch read). A scoped
--   agent FAILS that branch and must evaluate the OR-chain, whose final branch
--   `auth_is_lead_followup_agent(id)` is a correlated EXISTS subquery against
--   `lead_followup_history` that Postgres probes for lead rows not already
--   matched by the cheap equality branches (created_by / assigned_to /
--   assigned_user_id / follow_up_agent_id = auth_staff_id()).
--
--   That subquery filters:
--       f.lead_id = p_lead_id
--       AND f.followup_user_id = auth_staff_id()
--       AND coalesce(f.status,'scheduled') <> 'cancelled'
--   but NO index covers both (followup_user_id, lead_id) together, so each
--   per-row probe is inefficient. `auth_branch_visible(branch_id)` also lacked
--   a standalone leads(branch_id) index.
--
-- WHAT (additive + idempotent — no RLS/behaviour change, indexes only):
--   1. A composite PARTIAL index on lead_followup_history
--      (followup_user_id, lead_id) WHERE the follow-up is not cancelled — this
--      serves the auth_is_lead_followup_agent() subquery directly: it resolves
--      the agent's own (non-cancelled) follow-ups in one index probe per lead.
--      The partial predicate is written to MATCH the subquery expression
--      exactly (coalesce(status,'scheduled') <> 'cancelled') so the planner can
--      use it.
--   2. A standalone index on leads(branch_id) for auth_branch_visible.
--   3. A supporting index on leads(follow_up_agent_id) is already present
--      (0048); created_by / assigned_to / assigned_user_id are already indexed
--      (0049 / 0002 / 0045). Only the two gaps above are filled here.
--
-- The visibility rules are UNCHANGED — a scoped agent still sees exactly their
-- own / assigned / follow-up leads; an owner/manager still sees everyone's.
-- This migration only makes the scoped read fast.
-- ############################################################################

-- 1. Composite partial index serving auth_is_lead_followup_agent(). Leading
--    column is followup_user_id (the fixed equality on auth_staff_id(), which
--    narrows to just this agent's rows); lead_id second so a per-lead probe is
--    an index-only lookup. Partial predicate matches the subquery expression.
create index if not exists lfu_user_lead_active_idx
  on public.lead_followup_history (followup_user_id, lead_id)
  where coalesce(status, 'scheduled') <> 'cancelled';

-- 2. Standalone leads(branch_id) index for auth_branch_visible(branch_id).
create index if not exists leads_branch_idx
  on public.leads (branch_id);

-- 3. Re-assert the follow-up EXISTS helper unchanged, so its predicate stays
--    textually aligned with the partial index above (and to document the
--    index it now relies on). No behaviour change.
create or replace function public.auth_is_lead_followup_agent(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  -- Served by lfu_user_lead_active_idx (followup_user_id, lead_id) WHERE
  -- coalesce(status,'scheduled') <> 'cancelled'. Keep this predicate IDENTICAL
  -- to the index's partial predicate so the planner can use the index.
  select exists (
    select 1 from public.lead_followup_history f
    where f.followup_user_id = public.auth_staff_id()
      and f.lead_id = p_lead_id
      and coalesce(f.status, 'scheduled') <> 'cancelled'
  );
$$;
grant execute on function public.auth_is_lead_followup_agent(uuid) to authenticated;

-- Refresh planner statistics so the new indexes are considered immediately.
analyze public.lead_followup_history;
analyze public.leads;
