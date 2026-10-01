-- ############################################################################
-- 0058_lead_alternate_number.sql
--
-- REPAIROX — LEAD ALTERNATE (SECONDARY) PHONE. Additive + idempotent.
--
-- The Lead Form captures a primary phone in `leads.number`. Customers often
-- give a second reachable number (alternate / secondary / office). This adds
-- ONE dedicated field on the lead:
--
--   • alternate_number — secondary phone (text, "" = none).
--
-- It COMPLEMENTS `number`; it never replaces it. The lead's alternate number
-- flows into the Customer Master via the existing customers.alt_mobile column
-- (migration 0053) at the shared customer-resolution choke point, so a captured
-- alternate number is preserved on the canonical customer identity too.
--
-- No RLS change: the column lives on the existing `leads` table and inherits
-- its policies.
-- ############################################################################

alter table public.leads add column if not exists alternate_number text default '';

comment on column public.leads.alternate_number is
  'Secondary / alternate phone for the lead. Complements `number` (primary) '
  'and flows to the Customer Master (customers.alt_mobile) on customer '
  'resolution. "" when not provided.';

-- ============================================================================
-- Done. Leads can now carry an alternate phone alongside the primary number,
-- and it is preserved on the Customer Master via customers.alt_mobile.
-- ============================================================================
