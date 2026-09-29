-- 0056_lead_not_contacted_lock.sql
-- Not-Contacted accountability lock.
--
-- A lead left at contact_status "Not Contacted" is on a 48-hour countdown.
-- `not_contacted_since` records the instant the lead ENTERED (or last re-entered)
-- the Not-Contacted state. After 48h with no contact the lead is treated as
-- LOCKED by the app: its Sales Agent loses access to the flow and a senior/owner
-- must reassign it (which restarts the clock for the new owner and hands the
-- conversion credit to that new owner). The lock itself is DERIVED live from
-- contact_status + not_contacted_since (see isNotContactedLocked in
-- app/src/lib/leads-data.ts) — never a stored "locked" flag.
--
-- Additive + idempotent. Existing rows stay NULL; the app falls back to the
-- lead's creation time so legacy Not-Contacted leads still age correctly.

alter table public.leads
  add column if not exists not_contacted_since timestamptz;

-- Backfill: stamp the creation time for leads that are currently Not Contacted
-- (or have no contact status yet) and have no timestamp, so the countdown has a
-- sensible origin. Contacted leads stay NULL. Guarded so a re-run is a no-op.
update public.leads
set not_contacted_since = coalesce(created_at, now())
where not_contacted_since is null
  and (contact_status is null or lower(btrim(contact_status)) like 'not contacted%' or btrim(coalesce(contact_status, '')) = '');
