-- 0131 — Warranty status categories + custom statuses (Settings → Tickets).
-- Same shape as ticket_status_config (0109), plus optional system-status colour
-- overrides: { categories, builtins, statuses, colors }. Additive + idempotent.
-- Writes are covered by the existing organization_settings RLS (org_settings_write).
alter table public.organization_settings add column if not exists warranty_status_config jsonb;
comment on column public.organization_settings.warranty_status_config is
  'Warranty record status categories + custom statuses: { categories, builtins, statuses, colors }. '
  'Read via normalizeStatusConfig(); NULL = same layout as the ticket defaults.';
