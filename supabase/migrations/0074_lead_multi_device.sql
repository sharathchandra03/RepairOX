-- 0074_lead_multi_device.sql
-- Multi-device capture for leads.
--
-- A lead may now reference MULTIPLE devices, each with its own repair/part
-- category, issue and estimate. The structured list lives in a jsonb column
-- `devices`; the existing flat device/category/sub_category/issue/estimate/
-- discount columns continue to mirror the FIRST device so every existing
-- single-device read-site (Lead Table, View Lead, Quotation, conversion,
-- reporting) keeps working unchanged.
--
-- Additive + idempotent. Historical leads are never rewritten: their `devices`
-- stays NULL/[] and getLeadDevices() falls back to the flat fields.

alter table public.leads
  add column if not exists devices jsonb not null default '[]'::jsonb;

comment on column public.leads.devices is
  'Structured multi-device capture (LeadDevice[]). devices[0] mirrors the flat device/category/sub_category/issue/estimate/discount columns. [] for legacy single-device leads.';
