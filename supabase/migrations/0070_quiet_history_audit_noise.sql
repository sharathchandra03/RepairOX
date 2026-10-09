-- 0070 — Stop redundant audit noise from append-only history tables (SAFE)
--
-- PROBLEM
--   Migration 0045 attached the generic audit trigger fn_audit('Lead History')
--   to the five append-only lead event tables:
--       lead_assignment_history, lead_activity_history, lead_followup_history,
--       lead_status_history, lead_conversion_history
--   Every insert into those tables therefore also wrote a row into audit_log
--   like "Insert Lead History (<uuid>)". Those tables are ALREADY the lead's
--   own append-only trail (that is their entire purpose), so copying each write
--   into audit_log is pure duplication — and it surfaces as meaningless,
--   UUID-only noise in the user-facing Recent Activity feed.
--
-- FIX
--   Drop the audit triggers on those history tables. The history tables keep
--   recording every event (unchanged) — we simply stop mirroring them into
--   audit_log. The meaningful, user-facing lead events (create/update/delete on
--   the `leads` table itself) keep their audit trail via audit_leads.
--
--   This is the backend half of the cleanup; the app also humanizes/filters the
--   feed at the presentation layer (activity-humanize.ts) so EXISTING noisy
--   rows already in audit_log are hidden too. Together: the backend stays the
--   trail, the user sees only clear, useful activity.
--
-- Idempotent and safe to re-run.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'lead_assignment_history',
    'lead_activity_history',
    'lead_followup_history',
    'lead_status_history',
    'lead_conversion_history'
  ]
  loop
    -- Only act if the table exists (keeps this migration safe on partial installs).
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$s;', t);
    end if;
  end loop;
end $$;
