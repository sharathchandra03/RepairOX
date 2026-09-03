-- ============================================================================
-- MIGRATION: Ticket workflow settings columns on organization_settings
--   Run this ONCE in the Supabase SQL Editor.
--   Adds the columns backing Settings → Tickets → Workflow:
--     • ticket_default_status              — default status for NEW tickets
--     • ticket_default_resolution_minutes  — default SLA/resolution minutes
--   Affects FUTURE tickets only; existing tickets are never rewritten.
--   Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- ============================================================================

alter table public.organization_settings
  add column if not exists ticket_default_status text not null default 'in_progress';

alter table public.organization_settings
  add column if not exists ticket_default_resolution_minutes integer not null default 59;
