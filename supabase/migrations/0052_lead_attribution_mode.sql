-- 0052_lead_attribution_mode.sql
-- Effort-based agent credit: record HOW a lead's conversion was driven.
--
--   • 'agent_routed'  → the sales agent WORKED the lead and routed it forward
--     (agent-driven). The conversion COUNTS toward the agent's credit.
--   • 'back_matched'  → a SELF-INITIATED operational record (the customer came
--     in on their own) was later linked to this lead by the attribution safety
--     net. Kept for history/reporting, but does NOT earn the agent credit.
--
-- Additive + idempotent. Existing rows stay NULL and are treated as
-- agent-driven only when they carry a routed_at timestamp (see isAgentDrivenLead
-- in app/src/lib/leads-data.ts), so historical attribution is unchanged.

alter table public.leads
  add column if not exists attribution_mode text;

-- Optional guard: only accept the two known values (or NULL). Wrapped so a
-- re-run doesn't error if the constraint already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_attribution_mode_chk'
  ) then
    alter table public.leads
      add constraint leads_attribution_mode_chk
      check (attribution_mode is null or attribution_mode in ('agent_routed', 'back_matched'));
  end if;
end $$;
