-- ############################################################################
-- 0059_lead_mode_qualification_subcategory.sql
--
-- REPAIROX — LEAD MODE OF CONTACT + QUALIFICATION + SUBCATEGORY.
-- Additive + idempotent.
--
-- Three new SELECTION-BASED lead attributes, each backed by the existing
-- configurable Lead Options system (lead_options), so admins manage their
-- values from Settings → Lead Settings like every other dropdown:
--
--   • mode_of_contact — preferred contact mode (Call / WhatsApp / Email / …).
--   • qualification   — Qualified Lead / Not Qualified Lead.
--   • sub_category    — a more specific category beneath `category`.
--
-- They COMPLEMENT the existing fields (source, contact_status, category, …);
-- none replaces another (Source ≠ Mode of Contact; Category ≠ Subcategory;
-- Qualification is distinct from Status/Result). No RLS change: the columns
-- live on the existing `leads` table and inherit its policies. Option values
-- are seeded by the app's Lead Options seeder (LEAD_DROPDOWN_FIELDS).
-- ############################################################################

alter table public.leads add column if not exists mode_of_contact text default '';
alter table public.leads add column if not exists qualification   text default '';
alter table public.leads add column if not exists sub_category     text default '';

comment on column public.leads.mode_of_contact is
  'Preferred contact mode for the lead (Call / WhatsApp / Email / …). '
  'Configurable via lead_options (field = modeOfContact). "" when not set.';
comment on column public.leads.qualification is
  'Lead qualification (Qualified Lead / Not Qualified Lead). Configurable via '
  'lead_options (field = qualification). Distinct from status/result. "" = unset.';
comment on column public.leads.sub_category is
  'More specific category beneath `category`. Configurable via lead_options '
  '(field = subCategory). "" when not set.';

-- ============================================================================
-- Done. Leads can now carry Mode of Contact, Qualification and Subcategory,
-- all managed through the standard configurable Lead Options.
-- ============================================================================
