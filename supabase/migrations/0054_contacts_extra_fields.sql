-- 0054 — Contacts: persist the extra CRM fields the app already writes
--
-- The public.contacts table (migration 0031) was created WITHOUT columns for
-- several fields the client `contactToRow` mapper already sends on every
-- insert/update (see app/src/lib/leads-context.tsx): source, status, owner,
-- address, city, last_contact_at. Because those columns didn't exist, the app
-- degraded them to in-memory only (they were lost on refresh in DB mode).
--
-- This migration adds them so a captured/added contact persists its full shape
-- server-side and survives refresh, logout/login and other sessions — matching
-- how the Contacts page and lead-capture already treat this data.
--
-- Definitions mirror the client Contact type (leads-data.ts):
--   source           — marketing/lead source label (Google/Meta/Referral/…)
--   status           — 'active' | 'inactive' (defaults to 'active')
--   owner            — display name/id of the responsible person
--   address, city    — location the Contacts page shows
--   last_contact_at  — timestamp of the most recent interaction
--
-- Additive + idempotent + safe to re-run. No existing data is destroyed and no
-- RLS/trigger changes are needed (the existing contacts_* policies and the
-- contacts_touch / contacts_audit triggers already cover every column).
-- ############################################################################

alter table public.contacts
  add column if not exists source          text,
  add column if not exists status          text not null default 'active',
  add column if not exists owner           text,
  add column if not exists address         text,
  add column if not exists city            text,
  add column if not exists last_contact_at timestamptz;

-- Fast filtering of active vs archived contacts within an org.
create index if not exists contacts_status_idx
  on public.contacts (organization_id, status);

comment on column public.contacts.source is
  'Marketing / lead source label for the contact (e.g. Google, Meta, Referral). Provenance of how they were acquired.';
comment on column public.contacts.status is
  'Contact lifecycle state: active | inactive. Defaults to active.';
comment on column public.contacts.owner is
  'Display name/id of the staff member responsible for this contact.';
comment on column public.contacts.last_contact_at is
  'Timestamp of the most recent interaction with this contact; drives the "last activity" shown on the Contacts page.';
