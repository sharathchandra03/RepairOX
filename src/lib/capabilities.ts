/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Capability resolution (UI enforcement helper)

   The permission CATALOG (permissions.ts) and the MATRIX (permission-levels.ts)
   define fine-grained keys per feature. Historically the UI gated many actions
   on a few COARSE keys (manage_repair_jobs, manage_invoices, manage_sales,
   use_pos, …). To enforce the granular keys WITHOUT breaking existing roles,
   every action resolves to a small OR-set: the granular key(s) that should now
   gate it, PLUS the coarse legacy key(s) that used to. `full_access` (and the
   DB wildcard `*`) already imply everything via checkGrantedPermission, so they
   never need listing here.

   Usage (client):
     const { can } = usePermissions();
     if (allow(can, "ticket.delete")) { … }
     <Can permission={CAP.ticket.delete}>…</Can>   // key[] with mode="any"

   This is the SINGLE place the granular↔legacy fallback is expressed, so the
   whole app stays consistent and a new feature only has to add one entry here.
   ────────────────────────────────────────────────────────────────────────── */

import type { PermissionKey } from "@/lib/permissions";

/** For each logical action, the keys that GRANT it (checked with mode "any").
 *  First entries are the precise granular keys; trailing entries are the
 *  backward-compatible coarse keys so pre-existing roles keep working. */
export const CAP = {
  /* Administrative capabilities. These are DELIBERATELY separate:
       • manageRoles  — view/create/edit roles + change permission grants
                        (gates the Permission Matrix + role CRUD).
       • addUser      — create/add staff & assign an existing role + store(s),
                        WITHOUT the authority to redesign the permission system.
     `add_user` implies neither `manage_roles` nor `manage_users`; and
     `manage_roles` does NOT imply `add_user` (owners get both explicitly).
     Coarse `manage_users` is kept only as a fallback for pre-existing roles
     that were configured before the split. */
  admin: {
    // Manage Roles & Permissions — the permission-administration capability.
    manageRoles: ["manage_roles", "manage_permissions"],
    // Add User — create staff & assign role/store. `manage_users` is a coarse
    // legacy fallback so existing user-managers keep the ability to add users.
    addUser: ["add_user", "create_users", "manage_users"],
    // Manage existing users (edit / suspend / delete / reset). Broader than add.
    manageUsers: ["manage_users"],
    editUser: ["edit_users", "manage_users"],
    deleteUser: ["delete_users", "manage_users"],
    assignRole: ["assign_roles", "manage_users", "manage_roles"],
  },
  store: {
    // View All Shops (the consolidated context) — a real capability.
    viewAll: ["stores_view_all", "multi_store_access"],
    // Operate/switch across stores.
    multiStore: ["multi_store_access"],
    create: ["stores_create", "manage_branches"],
    edit: ["stores_edit", "manage_branches"],
    // View the store list / a store's administration detail.
    listView: ["stores_list_view", "manage_branches", "multi_store_access", "stores_view_all"],
    // View a store's members (People With Access).
    viewUsers: ["stores_users_view", "stores_users_assign", "manage_branches", "manage_users"],
    assignUsers: ["stores_users_assign", "manage_branches", "manage_users"],
    removeUsers: ["stores_users_remove", "manage_branches", "manage_users"],
    // Manage store logins / credential actions (reset password, temp password).
    manageCredentials: ["stores_credentials_manage", "manage_branches", "manage_users"],
    // Assign a role to a store member.
    assignRoles: ["stores_roles_assign", "manage_branches", "manage_users", "assign_roles"],
    // Activate / deactivate (archive) a store.
    deactivate: ["stores_deactivate", "manage_branches"],
    // Permanently delete a store (guarded further server-side: empty stores only).
    delete: ["stores_delete"],
    // View a store's reports.
    reportsView: ["stores_reports_view", "multi_store_access", "manage_branches"],
  },
  /* Money-sensitive VISIBILITY gates (gap audit v3). Owners hold these via
     full_access; grant explicitly to let a role SEE these figures. */
  sensitive: {
    // See cost/buying price. `manage_inventory` implies it (a stock manager
    // already sees cost). Otherwise a plain inventory viewer does NOT.
    viewCost: ["inventory_view_cost", "manage_inventory", "manage_purchases"],
    editCost: ["inventory_edit_cost", "manage_inventory"],
    viewProfit: ["view_profit_margin", "view_financial_reports"],
    viewRevenue: ["view_revenue_totals", "view_financial_reports"],
  },
  /* Own-vs-all record scope. When a user LACKS the *_view_all key they should
     see only their own/assigned records (UI filters to created_by/assigned).
     Coarse module-manage keys imply "view all" so existing managers are
     unaffected. */
  recordScope: {
    ticketsViewAll: ["tickets_view_all", "manage_repair_jobs"],
    invoicesViewAll: ["invoices_view_all", "manage_invoices"],
    leadsViewAll: ["leads_view_all", "manage_sales"],
    fieldViewAll: ["field_view_all", "manage_field_jobs"],
    customersViewAll: ["customers_view_all", "manage_customers"],
  },
  /* High-trust data-integrity + pricing actions. */
  integrity: {
    editLocked: ["edit_locked_records"],
    backdate: ["backdate_records"],
    discountOverLimit: ["discount_over_limit"],
    editPriceAfterCreation: ["edit_price_after_creation", "edit_invoice"],
    archive: ["archive_records"],
    manageSavedFilters: ["manage_saved_filters"],
  },
  /* Settings sections — the EDIT/SAVE capability for each settings page. These
     gate whether a user can SAVE changes on that page (view-tier users see the
     page read-only). Granular key first, coarse `manage_settings` fallback,
     `full_access`/`*` implied by can(). */
  settings: {
    // Invoice-related settings pages
    invoiceGeneral: ["edit_invoice_settings", "manage_settings"],
    invoiceNumbering: ["edit_numbering", "edit_invoice_settings", "manage_settings"],
    invoiceTax: ["settings_invoice_tax_edit", "edit_invoice_settings", "manage_settings"],
    paymentModes: ["settings_payment_modes_manage", "edit_invoice_settings", "manage_settings"],
    // Ticket settings
    ticketSettings: ["edit_ticket_settings", "manage_settings"],
    ticketAssignees: ["settings_ticket_assignees_manage", "edit_ticket_settings", "manage_settings"],
    // Store identity + printing + numbering prefixes
    storeInfo: ["edit_store_details", "edit_org_profile", "manage_settings"],
    printing: ["edit_printing_settings", "manage_settings"],
    // System / preferences / backup / integrations (full tier)
    system: ["settings_system_manage", "system_administrator", "manage_settings"],
    integrations: ["manage_integrations", "manage_settings"],
    // Notifications config
    notifications: ["manage_notifications", "manage_settings"],
    // Financial (currency/tax/accounting/expense categories)
    financial: ["settings_financial_edit", "manage_settings"],
    // Inventory + barcode settings
    inventorySettings: ["settings_inventory_edit", "manage_inventory", "manage_settings"],
    barcode: ["settings_barcode_edit", "manage_settings"],
    // Dashboard config
    dashboard: ["settings_dashboard_configure", "edit_dashboard_targets", "manage_settings"],
    // Cross-cutting controls (unchanged)
    moduleAccess: ["settings_feature_visibility_manage", "manage_settings"],
    webhooks: ["manage_webhooks", "manage_integrations"],
    rolePreview: ["roles_preview", "manage_roles"],
    activityLog: ["view_activity_log", "view_audit_logs"],
    // Can the user even OPEN settings (read-only view)? Anything above implies it.
    viewAny: ["view_settings", "manage_settings"],
  },
  customer: {
    view: ["view_customers", "manage_customers"],
    create: ["create_customer", "manage_customers"],
    // Deliberately bypassing the duplicate-match warning ("Create Anyway")
    // is a more sensitive variant of create — gated on the manage tier only.
    createForceDuplicate: ["manage_customers"],
    edit: ["edit_customer", "manage_customers"],
    delete: ["delete_customer", "manage_customers"],
    merge: ["merge_customer", "manage_customers"],
    manageGroups: ["manage_customer_groups", "manage_customers"],
    export: ["export_customers", "manage_customers"],
    import: ["import_customers", "manage_customers"],
  },
  loyalty: {
    view: ["view_loyalty", "manage_loyalty"],
    awardPoints: ["loyalty_award_points", "manage_loyalty"],
    redeemPoints: ["loyalty_redeem_points", "manage_loyalty"],
    changeTier: ["loyalty_tier_change", "manage_loyalty"],
    manage: ["manage_loyalty"],
  },
  ticket: {
    view: ["view_ticket", "manage_repair_jobs"],
    create: ["create_ticket", "manage_repair_jobs"],
    edit: ["edit_ticket", "manage_repair_jobs"],
    delete: ["delete_ticket", "manage_repair_jobs"],
    changeStatus: ["change_ticket_status", "update_repair_status", "manage_repair_jobs"],
    changePriority: ["change_ticket_priority", "edit_ticket", "manage_repair_jobs"],
    pin: ["pin_ticket", "edit_ticket", "manage_repair_jobs"],
    assign: ["assign_technician", "assign_technicians", "manage_repair_jobs"],
    parts: ["add_parts", "remove_parts", "manage_repair_jobs"],
    qc: ["perform_qc", "manage_repair_jobs"],
    pushToInvoice: ["push_to_invoice", "manage_repair_jobs", "manage_invoices"],
    print: ["print_ticket", "print_documents", "manage_repair_jobs"],
    transfer: ["transfer_ticket", "manage_repair_jobs"],
    sendComms: ["ticket_send_comms", "send_communications", "manage_repair_jobs"],
    downloadPdf: ["print_ticket", "print_documents", "view_ticket", "manage_repair_jobs"],
  },
  warranty: {
    view: ["view_warranty", "manage_repair_jobs"],
    create: ["create_warranty", "manage_repair_jobs"],
    edit: ["edit_warranty", "manage_repair_jobs"],
    complete: ["complete_warranty", "edit_warranty", "manage_repair_jobs"],
    convert: ["convert_warranty_to_ticket", "create_ticket", "manage_repair_jobs"],
  },
  invoice: {
    view: ["view_invoice", "manage_invoices"],
    create: ["create_invoice", "manage_invoices"],
    createPartial: ["create_partial_invoice", "create_invoice", "manage_invoices"],
    edit: ["edit_invoice", "manage_invoices"],
    delete: ["delete_invoice", "manage_invoices"],
    duplicate: ["duplicate_invoice", "create_invoice", "manage_invoices"],
    cancel: ["cancel_invoice", "change_invoice_status", "manage_invoices"],
    changeStatus: ["change_invoice_status", "manage_invoices"],
    updatePayment: ["update_payment", "manage_payments", "manage_invoices"],
    applyDiscount: ["apply_invoice_discount", "manage_invoices"],
    print: ["print_invoice", "print_documents", "manage_invoices"],
    share: ["share_invoice", "send_communications", "manage_invoices"],
    export: ["export_invoices", "export_reports", "manage_invoices"],
    convertFromTicket: ["convert_from_ticket", "create_invoice", "manage_invoices"],
  },
  walkin: {
    view: ["walkin_view", "use_pos", "manage_repair_jobs"],
    create: ["walkin_create", "use_pos", "manage_repair_jobs", "manage_sales"],
    edit: ["walkin_edit", "use_pos", "manage_repair_jobs"],
    delete: ["walkin_delete", "manage_repair_jobs"],
    bulkDelete: ["walkin_bulk_delete", "walkin_delete", "manage_repair_jobs"],
    convert: ["walkin_convert_to_ticket", "create_ticket", "manage_repair_jobs"],
    pin: ["walkin_pin", "walkin_edit", "use_pos", "manage_repair_jobs"],
    finalStatus: ["walkin_final_status_change", "walkin_edit", "use_pos", "manage_repair_jobs"],
    import: ["walkin_import", "import_data", "use_pos", "manage_repair_jobs"],
    export: ["walkin_export", "export_reports", "export_csv", "use_pos"],
    followup: ["walkin_followup_create", "walkin_followup_reschedule", "walkin_followup_complete", "walkin_edit", "use_pos", "manage_repair_jobs"],
    followupCancel: ["walkin_followup_cancel", "walkin_edit", "use_pos", "manage_repair_jobs"],
    reportsView: ["walkin_reports_view", "view_reports", "use_pos"],
  },
  lead: {
    view: ["leads_view", "manage_sales"],
    create: ["leads_create", "manage_sales"],
    edit: ["leads_edit", "manage_sales"],
    delete: ["leads_delete", "manage_sales"],
    // First assignment of an owner. `assign` (generic) + manage_sales fallback.
    assign: ["leads_assign", "assign", "manage_sales"],
    // Change an EXISTING owner. leads_assign implies it (assigners can reassign).
    reassign: ["leads_reassign", "leads_assign", "assign", "manage_sales"],
    stageChange: ["leads_stage_change", "manage_sales"],
    priorityChange: ["leads_priority_change", "manage_sales"],
    pin: ["leads_pin", "leads_edit", "manage_sales"],
    // Work a lead's follow-ups (schedule/complete/cancel). Editing implies it.
    followup: ["leads_followup", "leads_edit", "manage_sales"],
    convert: ["leads_convert", "manage_sales"],
    import: ["leads_import", "import_data", "manage_sales"],
    export: ["leads_export", "export_reports", "manage_sales"],
    // Scope: see the whole team's leads (between own-only and org-wide view-all).
    viewTeam: ["leads_view_team", "leads_view_all", "manage_sales", "view_sales_reports"],
    // Scope: see every lead in the org/store (own-vs-all record scope).
    viewAll: ["leads_view_all", "view_sales_reports", "view_financial_reports", "manage_reports", "manage_users"],
  },
  deal: {
    create: ["deals_create", "manage_sales"],
    edit: ["deals_edit", "manage_sales"],
    delete: ["deals_delete", "manage_sales"],
  },
  quotation: {
    create: ["quotations_create", "manage_sales"],
    send: ["quotations_send", "send_communications", "manage_sales"],
    convertToInvoice: ["quotations_convert_to_invoice", "create_invoice", "manage_invoices"],
  },
  dashboard: {
    editTargets: ["edit_dashboard_targets", "manage_settings"],
    export: ["export_dashboard", "export_reports", "manage_reports"],
  },
  field: {
    assignFieldManager: ["assign_field_manager", "manage_field_jobs"],
    advancePickup: ["field_pickup_status_change", "update_pickup", "manage_field_jobs"],
    advanceDrop: ["field_drop_status_change", "update_drop", "manage_field_jobs"],
  },
  expense: {
    view: ["view_expenses", "view_financial_reports"],
    create: ["create_expense", "manage_payments"],
    edit: ["edit_expense", "manage_payments"],
    delete: ["delete_expense", "manage_payments"],
  },
} satisfies Record<string, Record<string, PermissionKey[]>>;

/** True when the caller's `can()` grants ANY of the keys for an action.
 *  `full_access` / `*` are already handled inside `can` (checkGrantedPermission). */
export function allow(can: (k: PermissionKey) => boolean, keys: PermissionKey[]): boolean {
  return keys.some(can);
}
