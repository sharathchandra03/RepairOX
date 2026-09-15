-- ============================================================================
-- 0028 — Field Jobs operational columns (Lead Type, Source, Ticket Device).
--
-- The Field module (Shop Management → Field) now surfaces the full operational
-- table from the prototype:
--   DATE · TRIP ID · LEAD TYPE · SOURCE · ASSIGNEE · CUSTOMER · CONTACT ·
--   MODEL · TICKET ID · SERVICE STATUS · INVOICE ID · INVOICE AMT · ACTION
--
-- Most of those columns are DERIVED at read time from already-linked records
-- (Customer Master, the linked Ticket / Ticket Device, the linked Invoice) so
-- nothing is duplicated. Three genuinely NEW, Field-specific facts have no home
-- yet and are added here:
--
--   • lead_type              — Pickup / On-Site / Drop / Warranty Pickup /
--                              Warranty On-Site (drives the leg workflow).
--   • source                 — raw origin string, mapped from the originating
--                              Lead / Walk-In source (e.g. "Store", "Marketing").
--   • linked_ticket_device_id — which DeviceRecord on a multi-device Ticket this
--                              field job is for, so MODEL resolves to the right
--                              device (Ticket T-056 → Device A vs Device B).
--
-- The linked INVOICE ID / AMOUNT are NOT stored here — they are resolved live
-- from the linked Invoice via the linked Ticket so the amount is never stale.
-- linked_invoice_id already exists (0019) and is kept only as an optional
-- direct reference/snapshot; the app prefers the live Ticket → Invoice lookup.
--
-- Idempotent + additive: safe to run multiple times. Existing rows default to
-- lead_type = 'pickup' (the historical behaviour — every Field Job was a
-- pickup & drop) and an empty source.
-- ============================================================================

alter table if exists public.field_jobs
  add column if not exists lead_type text not null default 'pickup';

alter table if exists public.field_jobs
  add column if not exists source text;

alter table if exists public.field_jobs
  add column if not exists linked_ticket_device_id text;

-- Helpful indexes for the new operational filters (Lead Type, Source, and the
-- Ticket-device join used to resolve MODEL / INVOICE columns).
create index if not exists field_jobs_lead_type_idx on public.field_jobs (lead_type);
create index if not exists field_jobs_source_idx     on public.field_jobs (source);
create index if not exists field_jobs_ticket_idx     on public.field_jobs (linked_ticket_id);
create index if not exists field_jobs_invoice_idx    on public.field_jobs (linked_invoice_id);

-- ============================================================================
-- Done. RLS, realtime and the updated_at trigger from 0019/0021 continue to
-- apply unchanged — these are plain additive columns on the same table.
-- ============================================================================
