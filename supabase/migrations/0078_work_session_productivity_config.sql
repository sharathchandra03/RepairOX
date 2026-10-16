-- ############################################################################
-- 0078_work_session_productivity_config.sql
--
-- REPAIROX — Work Session / Productivity configuration (org-level).
--
-- Adds an org-wide `productivity_config` JSONB on organization_settings, backing
-- Settings → Lead Management → Productivity. It currently carries ONE tunable:
--   { "breakReminderMinutes": number }  — how long a Sales Agent may stay ON
--   BREAK before the client reminds them to resume work (0 = never).
--
-- This is presentation-only configuration: it tunes WHEN the client nudges an
-- agent. It NEVER changes any persisted work-session duration or the pure
-- time-calculation engine (work-session.ts) — those remain the source of truth.
--
-- Additive + idempotent. NULL/absent reads as the app default in the client via
-- parseJsonColumn(DEFAULT_STORE_SETTINGS.productivityConfig). This migration
-- does NOT backfill — older rows simply inherit the default.
--
-- Run ONCE in the Supabase SQL Editor.
-- ############################################################################

alter table public.organization_settings
  add column if not exists productivity_config jsonb;

comment on column public.organization_settings.productivity_config is
  'Work Session / Productivity config: { breakReminderMinutes: number } — minutes '
  'on break before the agent is reminded to resume work (0 = never). Presentation '
  'only; never affects persisted durations or the pure engine. Read via '
  'parseJsonColumn with DEFAULT_STORE_SETTINGS.productivityConfig as the fallback '
  'for older rows.';
