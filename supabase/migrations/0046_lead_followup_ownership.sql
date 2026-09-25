-- ############################################################################
-- 0046_lead_followup_ownership.sql
--
-- REPAIROX — LEAD OWNERSHIP & STRUCTURED FOLLOW-UP (Phase 2)
--
-- Builds on 0045_lead_data_foundation.sql. Additive + idempotent. It:
--   1. Enriches lead_followup_history with the columns the structured
--      follow-up model needs (sequence, cached user names, created_by,
--      outcome) so each follow-up (#1, #2, …) is a complete, queryable record.
--   2. Caches user names on lead_assignment_history for display without a join.
--   3. Backfills leads.assigned_user_id from assigned_to and
--      leads.expected_value from estimate for existing rows (one-time).
--   4. Confirms the notifications table can carry a lead follow-up reference
--      (follow_up_id already exists in 0025) — no separate notification system.
--
-- The follow-up lifecycle (Pending/Due/Overdue) is DERIVED from due time; only
-- scheduled/completed/cancelled/rescheduled/missed are stored. Completing a
-- follow-up records the activity + outcome; it NEVER changes the lead to Won.
-- ############################################################################


-- ============================================================================
-- SECTION 1 — lead_followup_history: structured follow-up columns
-- ============================================================================
alter table public.lead_followup_history add column if not exists seq              integer;   -- Follow-up #1, #2, … within the lead
alter table public.lead_followup_history add column if not exists followup_user_name text;     -- cached display name of the follow-up agent
alter table public.lead_followup_history add column if not exists created_by        uuid references public.staff(id) on delete set null;
alter table public.lead_followup_history add column if not exists created_by_name   text;
alter table public.lead_followup_history add column if not exists outcome           text;      -- structured completion outcome (Interested / Quotation Requested / …)
alter table public.lead_followup_history add column if not exists next_followup_at  timestamptz; -- when completing schedules the next one (link, not overwrite)

-- The 0045 table already has: scheduled_at, followup_user_id, status, comments,
-- completed_at, result, actor_staff_id, created_at. `outcome` is the canonical
-- structured disposition; `result` is retained for backward-compat.

create index if not exists lfu_seq_idx     on public.lead_followup_history(lead_id, seq);
create index if not exists lfu_due_open_idx on public.lead_followup_history(scheduled_at)
  where status = 'scheduled';

-- Per-lead follow-up sequence: assign the next seq when one is not supplied.
create or replace function public.lead_followup_seq()
returns trigger language plpgsql as $$
begin
  if new.seq is null then
    select coalesce(max(seq), 0) + 1 into new.seq
    from public.lead_followup_history
    where lead_id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists lead_followup_seq_trg on public.lead_followup_history;
create trigger lead_followup_seq_trg
  before insert on public.lead_followup_history
  for each row execute function public.lead_followup_seq();


-- ============================================================================
-- SECTION 2 — lead_assignment_history: cached display names
-- ============================================================================
alter table public.lead_assignment_history add column if not exists from_user_name text;
alter table public.lead_assignment_history add column if not exists to_user_name   text;
alter table public.lead_assignment_history add column if not exists assigned_by_name text;


-- ============================================================================
-- SECTION 3 — one-time backfill for existing leads
--   assigned_user_id ← assigned_to; expected_value ← estimate.
--   Guarded so re-running never overwrites a value that already differs.
-- ============================================================================
update public.leads
   set assigned_user_id = assigned_to
 where assigned_user_id is null and assigned_to is not null;

update public.leads
   set expected_value = estimate
 where expected_value is null and estimate is not null;

-- Seed an initial assignment-history row for any already-assigned lead that has
-- no history yet, so the ownership timeline is complete from day one.
insert into public.lead_assignment_history
  (organization_id, branch_id, lead_id, to_user_id, to_user_name, assigned_by, assigned_by_name, reason, created_at)
select l.organization_id, l.branch_id, l.id, l.assigned_to, l.assigned_to_name,
       l.assigned_by, l.assigned_by_name, 'Backfilled from existing assignment',
       coalesce(l.assigned_at, l.created_at)
from public.leads l
where l.assigned_to is not null
  and not exists (
    select 1 from public.lead_assignment_history h where h.lead_id = l.id
  );


-- ============================================================================
-- SECTION 4 — notifications: lead follow-up reference (already supported)
--   0025 created notifications.follow_up_id. Ensure it exists (idempotent) so a
--   follow-up-due notification can deep-link back to its follow-up. The client
--   `notify()` reuses the SAME notifications feed — no separate system.
-- ============================================================================
alter table public.notifications add column if not exists follow_up_id uuid;
create index if not exists notifications_follow_up_idx on public.notifications(follow_up_id)
  where follow_up_id is not null;


-- ============================================================================
-- Done. lead_followup_history now stores complete, sequenced follow-up records
-- with structured outcomes; assignment history carries cached names; existing
-- leads are backfilled; follow-up notifications reuse the shared feed.
-- ============================================================================
