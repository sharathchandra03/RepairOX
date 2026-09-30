-- ############################################################################
-- 0057_lead_location_unit.sql
--
-- REPAIROX — LEAD DOOR / FLAT / HOUSE NO. Additive + idempotent.
--
-- The Lead Form's free-text `location` (address / landmark) and the exact map
-- pin (0055) are unchanged. A single street/landmark box could not carry the
-- exact door/flat/house number, so a field agent still could not tell which
-- unit to reach in a multi-storey building. This adds ONE dedicated field:
--
--   • location_unit — door / flat / house no. (text, "" = none).
--
-- It COMPLEMENTS `location` (per the Lead data foundation standard — free-text
-- label + structured detail coexist); it never replaces it. No RLS change: the
-- column lives on the existing `leads` table and inherits its policies.
-- ############################################################################

alter table public.leads add column if not exists location_unit text default '';

comment on column public.leads.location_unit is
  'Exact door / flat / house number for the lead address. Complements the '
  'free-text `location` and the map pin so the field team reaches the correct '
  'unit. "" when not provided.';

-- ============================================================================
-- Done. Leads can now carry an unambiguous door/flat number alongside the
-- free-text address and the map pin.
-- ============================================================================
