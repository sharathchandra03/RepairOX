-- ############################################################################
-- 0040 — Customer capture-source (module of origin)
--
-- Adds `capture_source` to public.customers: WHERE (which module/screen) each
-- customer record was first captured — walk_in | lead | ticket | invoice |
-- field | pos | import | manual. This is SEPARATE from `source` (the marketing
-- channel: gmb/meta/referral/…). It lets the Customer Master show, for every
-- person, exactly where they were captured, now that the app captures EVERYONE
-- (walk-ins, leads, prospects) into the master rather than only paying
-- customers.
--
-- Immutable provenance: set once on create, never overwritten on edit.
-- Nullable + no default beyond app-provided value, so existing rows are simply
-- unlabelled (rendered as "—" / Unknown) until they next transact or are edited.
--
-- Idempotent + safe to re-run.
-- ############################################################################

alter table public.customers
  add column if not exists capture_source text;

-- Optional lightweight index for filtering the master by capture source.
create index if not exists customers_capture_source_idx
  on public.customers (organization_id, capture_source);

comment on column public.customers.capture_source is
  'Module of origin where this customer was first captured: walk_in|lead|ticket|invoice|field|pos|import|manual. Separate from source (marketing channel). Immutable provenance.';
