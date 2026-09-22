-- ############################################################################
-- 0038 — Gap-audit capabilities (v3)
--
-- The permission gap audit surfaced granular controllables that had no
-- dedicated key (cost/profit/revenue visibility, own-vs-all record scope,
-- locked-record editing, backdating, discount-over-limit, price override,
-- archive, saved filters, imports, finer settings sections, role preview).
-- Those keys are now declared in the catalog + matrix (permissions.ts /
-- permission-levels.ts) so they are toggleable per role.
--
-- Defaults:
--   • Owner roles (master_shop_owner, platform_owner) receive the new
--     capabilities explicitly. platform_owner already holds '*' which implies
--     everything; master_shop_owner holds full_access which also implies them,
--     but we add the explicit keys so the Roles UI shows them ticked and intent
--     is auditable.
--   • EVERY other role — built-in or custom — is left untouched (OFF). New
--     custom roles start without any of these, so sensitive figures (cost,
--     profit) and cross-record visibility are hidden until explicitly granted.
--
-- Nothing here grants a wildcard/god key, so the 0036 owner-only trigger is
-- respected. Idempotent + safe to re-run.
-- ############################################################################

insert into public.role_permissions (role_id, permission_key)
select r.id, k.key
from public.roles r
cross join (values
  -- Sensitive data visibility
  ('inventory_view_cost'), ('inventory_edit_cost'), ('view_profit_margin'), ('view_revenue_totals'),
  -- Record scope (owners see all)
  ('tickets_view_all'), ('invoices_view_all'), ('leads_view_all'), ('field_view_all'), ('customers_view_all'),
  -- Data integrity & pricing
  ('edit_locked_records'), ('backdate_records'), ('discount_over_limit'), ('edit_price_after_creation'),
  ('archive_records'), ('manage_saved_filters'), ('import_customers'), ('import_inventory'),
  -- Finer settings sections
  ('settings_invoice_tax_edit'), ('settings_payment_modes_manage'), ('settings_ticket_assignees_manage'),
  ('manage_webhooks'),
  -- Roles admin
  ('roles_preview')
) as k(key)
where r.id in ('master_shop_owner', 'platform_owner')
on conflict (role_id, permission_key) do nothing;

-- Developer / Admin: give the operationally useful, non-destructive ones
-- (visibility + preview + record scope) so platform maintenance can see data,
-- but NOT pricing/discount overrides. Guarded by a join to roles so it is a
-- no-op if the developer_admin role isn't present in this database.
insert into public.role_permissions (role_id, permission_key)
select r.id, k.key
from public.roles r
cross join (values
  ('view_profit_margin'), ('view_revenue_totals'), ('inventory_view_cost'),
  ('tickets_view_all'), ('invoices_view_all'), ('leads_view_all'), ('field_view_all'), ('customers_view_all'),
  ('roles_preview')
) as k(key)
where r.id = 'developer_admin'
on conflict (role_id, permission_key) do nothing;
