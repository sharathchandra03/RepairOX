-- 0053 — Customer alternate (secondary) contact number
--
-- Adds `alt_mobile` to public.customers: a SECOND contact number captured
-- alongside the primary `mobile` at every customer-capture surface (ticket,
-- invoice, walk-in, manual add, import). It lets a returning customer be
-- identified even when they reach out from their alternate number, so the
-- sales agent never loses the real customer record.
--
-- Like `mobile`, we also keep a normalized (digits-only, last-10) generated
-- column so the alternate number can participate in dedup/identification and
-- be indexed for fast lookup. Reuses the existing normalize_customer_mobile()
-- helper from migration 0033.
--
-- Additive + idempotent + safe to re-run. No existing data is destroyed.
-- ############################################################################

alter table public.customers
  add column if not exists alt_mobile text;

-- Normalized generated key (non-unique — an alternate number may legitimately
-- coincide with another customer's primary number for shared household lines;
-- we surface it as a possible-match warning, never a hard unique constraint).
alter table public.customers
  add column if not exists alt_mobile_normalized text
    generated always as (public.normalize_customer_mobile(alt_mobile)) stored;

-- Index so lookups/dedup that check the alternate number stay fast.
create index if not exists customers_alt_mobile_normalized_idx
  on public.customers (organization_id, alt_mobile_normalized);

comment on column public.customers.alt_mobile is
  'Alternate/secondary contact number for the customer, captured alongside mobile. Used to identify a returning customer who contacts from a different number.';
