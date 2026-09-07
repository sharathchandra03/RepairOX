-- ############################################################################
-- Migration: Ticket table column configuration on organization_settings
--
-- Backs "Settings → Tickets → Ticket Settings → Column Settings", which is now
-- the single source of truth for the Tickets table layout (previously an
-- in-memory, page-local setting on the Tickets page).
--
--   • ticket_column_order    jsonb  → ordered list of column ids
--   • ticket_visible_columns jsonb  → subset of ids that are shown
--
-- Existing rows keep NULL, which the app interprets as "use built-in defaults"
-- (the full column catalog, all visible, in catalog order). No historical data
-- changes, and previously-saved preferences elsewhere are untouched.
--
-- Safe to run repeatedly (idempotent).
-- ############################################################################

alter table public.organization_settings
  add column if not exists ticket_column_order    jsonb,
  add column if not exists ticket_visible_columns jsonb;
