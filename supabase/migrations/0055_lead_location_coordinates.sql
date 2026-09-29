-- ############################################################################
-- 0055_lead_location_coordinates.sql
--
-- REPAIROX — LEAD LOCATION PIN. Additive + idempotent.
--
-- The Lead Form's free-text `location` (address / landmark) is unchanged. This
-- adds an EXACT map pin captured via the Leaflet + OpenStreetMap picker so the
-- field team gets a navigable point (and so a lead's coordinates flow through
-- to the Field Job / route handoff):
--
--   • location_lat       — picked latitude  (double precision).
--   • location_lng       — picked longitude (double precision).
--   • location_maps_url  — a shareable maps URL for the picked point.
--
-- These COMPLEMENT `location`; they never replace it (per the Lead data
-- foundation standard — free-text label + structured pin coexist). No RLS
-- change: the columns live on the existing `leads` table and inherit its
-- policies.
-- ############################################################################

alter table public.leads add column if not exists location_lat      double precision;
alter table public.leads add column if not exists location_lng      double precision;
alter table public.leads add column if not exists location_maps_url text;

comment on column public.leads.location_lat is
  'Picked latitude (Leaflet/OpenStreetMap map picker). Complements the '
  'free-text `location`; used to hand an exact pin to the field team.';
comment on column public.leads.location_lng is
  'Picked longitude (Leaflet/OpenStreetMap map picker).';
comment on column public.leads.location_maps_url is
  'Shareable maps URL for the picked point (e.g. https://www.openstreetmap.org/'
  '?mlat=..&mlon=.. or a Google Maps ?q=lat,lng link).';

-- ============================================================================
-- Done. Leads can now carry an exact, navigable location pin alongside the
-- existing free-text address.
-- ============================================================================
