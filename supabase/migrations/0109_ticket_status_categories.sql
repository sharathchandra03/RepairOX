-- 0109 — Ticket status categories + custom statuses (Settings → Tickets).
-- Additive + idempotent. One JSONB on organization_settings:
--   { categories: [{id,name}], builtins: {<system status>: <category id>},
--     statuses: [{id,name,color,categoryId,base,active}] }
-- A ticket keeps its SYSTEM status in tickets.status (all business rules,
-- RLS and reports unchanged); the chosen custom status id rides in the
-- tickets.devices JSONB envelope (statusId / per-device statusId). Writes are
-- covered by the existing organization_settings RLS (org_settings_write).
alter table public.organization_settings add column if not exists ticket_status_config jsonb;
comment on column public.organization_settings.ticket_status_config is
  'Ticket status categories + custom statuses: { categories, builtins, statuses }. '
  'Custom statuses map to a system stage (base); read via normalizeStatusConfig().';
