-- ############################################################################
-- 0035 — Branch Manager is NOT a global admin
--
-- ROOT CAUSE of "branch owner sees other shops + can edit roles":
--   1. `is_admin()` hardcoded `shop_owner_branch_manager` as a super-admin.
--      is_admin() is the master key: it short-circuits auth_has_any(),
--      auth_can_cross_branch() and auth_branch_visible(), so a Branch Manager
--      bypassed EVERY permission and store-scope check regardless of the matrix.
--   2. The `shop_owner_branch_manager` role carried `full_access`, which implies
--      every permission (incl. manage_roles + multi_store_access).
--
-- FIX:
--   • Redefine is_admin() to include ONLY true organization/platform admins:
--     master_shop_owner, platform_owner, developer_admin. A Branch Manager is a
--     normal role, gated by its granted permissions + store scope like everyone
--     else. (This one function is used by every RLS policy, so fixing it here
--     fixes cross-store leakage, staff writes, org/settings writes, etc.)
--   • Strip `full_access` (and any cross-store / role-admin keys) from
--     shop_owner_branch_manager and replace them with explicit BRANCH-SCOPED
--     capabilities: full operational control of THEIR OWN store, but NOT
--     multi-store access, NOT All Shops, NOT manage_roles. `add_user` is kept
--     (a branch manager may add staff to their store) — that does NOT imply
--     manage_roles.
--
-- Idempotent + safe to re-run. Only affects the shop_owner_branch_manager role
-- and the is_admin() definition; no other role's grants are touched.
-- ############################################################################

-- ── 1. is_admin() = true org/platform admins ONLY ───────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.auth_user_id = auth.uid()
      and s.role_id in (
        'master_shop_owner', 'platform_owner', 'developer_admin'
      )
  );
$$;

-- ── 2. Downgrade shop_owner_branch_manager from super-admin to branch admin ──
-- Remove the escalating keys: full_access (implies everything), and every
-- cross-store / role-administration / platform key. Keep only what a Branch
-- Manager legitimately needs within their OWN store.
delete from public.role_permissions
where role_id = 'shop_owner_branch_manager'
  and permission_key in (
    'full_access', '*',
    'multi_store_access', 'stores_view_all', 'stores_multi_select', 'stores_switch',
    'owner_dashboard_view', 'owner_performance_view', 'owner_consolidated_reports_view', 'owner_export',
    'manage_roles', 'manage_permissions',
    'stores_create', 'stores_edit', 'stores_delete', 'stores_deactivate', 'manage_branches',
    'system_administrator', 'backup_restore', 'access_api', 'manage_subscription'
  );

-- Ensure the branch manager KEEPS a sensible, explicit branch-scoped grant set
-- (add only — never removes anything already present). These give full control
-- of their assigned store's operations without any cross-store or role-admin
-- capability. add_user stays so they can add staff to their store (Add User ≠
-- Manage Roles & Permissions).
insert into public.role_permissions (role_id, permission_key)
select 'shop_owner_branch_manager', k.key
from (values
  ('create'),('edit'),('delete'),('approve'),('assign'),
  ('view_dashboard'),('view_kpi_cards'),('view_charts'),('view_activity_log'),('export_dashboard'),
  ('create_ticket'),('edit_ticket'),('delete_ticket'),('view_ticket'),
  ('assign_technician'),('assign_technicians'),('change_ticket_status'),('update_repair_status'),
  ('add_parts'),('remove_parts'),('view_qc'),('perform_qc'),
  ('view_internal_notes'),('view_customer_details'),('view_device_details'),('push_to_invoice'),
  ('manage_repair_jobs'),
  ('view_warranty'),('create_warranty'),('edit_warranty'),('complete_warranty'),('convert_warranty_to_ticket'),
  ('create_invoice'),('edit_invoice'),('delete_invoice'),('view_invoice'),('print_invoice'),
  ('update_payment'),('mark_overdue'),('share_invoice'),('convert_from_ticket'),('view_payment_history'),
  ('manage_invoices'),('manage_payments'),('manage_refunds'),('manage_warranties'),
  ('view_inventory'),('create_item'),('edit_item'),('delete_item'),('adjust_stock'),('stock_movement'),
  ('approve_inventory'),('manage_barcode'),('manage_categories'),('manage_brands'),('manage_models'),('manage_price_list'),
  ('manage_inventory'),('manage_purchases'),('manage_vendors'),('transfer_inventory'),
  ('view_customers'),('create_customer'),('edit_customer'),('delete_customer'),
  ('view_customer_history'),('merge_customer'),('export_customers'),('manage_customers'),
  ('manage_customer_groups'),('assign_customer_groups'),
  ('view_expenses'),('create_expense'),('edit_expense'),('delete_expense'),
  ('post_to_ledger'),('view_ledger'),('manual_ledger_entry'),('close_day'),
  ('bank_transfer'),('cash_settlement'),('view_transaction_details'),('view_financial_reports'),
  ('view_employees'),('create_employee'),('edit_employee'),('assign_salary'),('view_payouts'),
  ('manage_sales'),('use_pos'),('send_communications'),
  ('view_device_catalog'),('edit_parts_pricing'),
  ('view_settings'),('edit_store_details'),('edit_invoice_settings'),('edit_ticket_settings'),
  ('edit_printing_settings'),('manage_settings'),
  ('view_reports'),('export_reports'),('view_inventory_reports'),('view_sales_reports'),
  ('view_ticket_reports'),('manage_reports'),
  ('print_documents'),('upload_files'),
  ('view_field_jobs'),('manage_field_jobs'),('route_leads'),('receive_store_handoff'),
  ('assign_field_manager'),('assign_ninja'),('update_pickup'),('update_drop'),('view_field_reports'),
  -- Add User (create staff for their store) — but NOT manage_roles.
  ('add_user'),('view_users'),('create_users'),('edit_users'),('assign_roles')
) as k(key)
on conflict (role_id, permission_key) do nothing;
