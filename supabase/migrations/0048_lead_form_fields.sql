-- ############################################################################
-- 0048_lead_form_fields.sql
--
-- REPAIROX — LEAD FORM (Step 1) supporting columns. Additive + idempotent.
--
-- The Lead Form collects the 28-column business data contract. Almost every
-- field already has a column (0002 + 0045). This adds the two genuinely-new
-- structured fields the corrected form needs:
--
--   • discount_type      — how `discount` is expressed ('amount' | 'percent').
--                          `discount` stays numeric; this records its unit so
--                          the value is never silently converted.
--   • follow_up_agent_id — the FOLLOW-UP AGENT as a real USER reference
--                          (staff.id), distinct from the primary owner
--                          (assigned_user_id) and from the cached display name
--                          `follow_up_agent`. May differ from the lead owner.
--
-- Device Catalog references (device_category_id / device_brand_id /
-- device_model_id) and the primary-owner user reference (assigned_user_id) were
-- already added in 0045 — reused here, never duplicated.
-- ############################################################################

alter table public.leads add column if not exists discount_type      text default 'amount';
alter table public.leads add column if not exists follow_up_agent_id  uuid references public.staff(id) on delete set null;

comment on column public.leads.discount_type is
  'Unit for the numeric `discount` value: ''amount'' (fixed ₹) or ''percent'' (%).';
comment on column public.leads.follow_up_agent_id is
  'FOLLOW-UP AGENT as a staff user id — distinct from assigned_user_id (the '
  'primary owner). The follow-up agent may differ from the owner and never '
  'replaces them.';

create index if not exists leads_follow_up_agent_idx on public.leads(follow_up_agent_id)
  where follow_up_agent_id is not null;

-- ============================================================================
-- Done. The leads table now carries every field the 28-column Lead Form needs,
-- with Device via the catalog (ids), primary + follow-up agents as user ids,
-- and a structured discount unit.
-- ============================================================================
