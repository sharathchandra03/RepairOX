/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Permission Access-Level model + Role Presets

   The raw permission registry (permissions.ts) has 200+ fine-grained keys.
   Showing all of them as a flat checkbox wall is unusable for a normal shop
   owner. This module adds a SIMPLE layer on top:

     • MODULES        — the business areas a person thinks in (Tickets, Invoices,
                        Walk-In, Leads, Inventory, …).
     • ACCESS LEVELS  — one control per module: None → View → Work → Manage → Full.
                        Each level maps to a bundle of the underlying keys.
     • PRESETS        — ready-made role templates (Reception, Technician, Owner…)
                        expressed as { module: level } so the whole role is one
                        click, then optionally fine-tuned.

   The UI works in levels; persistence stays as the SAME flat PermissionKey[]
   the rest of the app already uses (saveGrants). `levelToKeys` expands a level
   to keys; `keysToLevel` collapses a key set back to the closest level for
   display. Nothing in the existing permission pipeline changes.
   ────────────────────────────────────────────────────────────────────────── */

import type { PermissionKey } from "@/lib/permissions";

/** The five access levels, from least to most. */
export type AccessLevel = "none" | "view" | "work" | "manage" | "full";

export const ACCESS_LEVELS: { id: AccessLevel; label: string; hint: string }[] = [
  { id: "none", label: "No Access", hint: "Hidden — cannot open this module" },
  { id: "view", label: "View", hint: "Can see, but not change anything" },
  { id: "work", label: "Work", hint: "Day-to-day: create & edit records" },
  { id: "manage", label: "Manage", hint: "Full control incl. delete & approve" },
  { id: "full", label: "Full", hint: "Everything, including admin actions" },
];

export const ACCESS_LEVEL_ORDER: AccessLevel[] = ["none", "view", "work", "manage", "full"];

/** A module = one row in the simple matrix. Each level lists the KEYS granted
 *  at that level. Levels are CUMULATIVE by intent but we list keys explicitly
 *  per level so the mapping is exact and auditable. `levelToKeys` unions all
 *  levels up to and including the chosen one. */
export interface ModuleDef {
  id: string;
  label: string;
  /** One-line plain-English description for the module row. */
  blurb: string;
  /** lucide icon name (resolved in the UI). */
  icon: string;
  /** Which levels this module supports (some modules only have view/manage). */
  levels: Partial<Record<AccessLevel, PermissionKey[]>>;
}

/* ── The module catalogue that drives the simple matrix ─────────────────────
   `levels` lists the keys ADDED at that level (view ⊂ work ⊂ manage ⊂ full is
   enforced by levelToKeys which unions lower levels in). */
export const PERMISSION_MODULES: ModuleDef[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    blurb: "The store's home overview, KPIs and charts.",
    icon: "Home",
    levels: {
      view: ["view_dashboard", "view_kpi_cards", "view_charts", "view_activity_log"],
      work: ["reorder_widgets"],
      manage: ["edit_dashboard_targets", "export_dashboard"],
    },
  },
  {
    id: "tickets",
    label: "Tickets & Repairs",
    blurb: "Repair jobs — creation, status, parts, QC, warranty.",
    icon: "Ticket",
    levels: {
      view: ["view_ticket", "view_qc", "view_internal_notes", "view_customer_details", "view_device_details", "view_warranty"],
      work: [
        "create_ticket", "edit_ticket", "change_ticket_status", "update_repair_status",
        "ticket_device_status_change", "change_ticket_priority", "add_parts", "edit_internal_notes",
        "push_to_invoice", "convert_from_ticket", "pin_ticket", "ticket_send_comms", "print_documents",
        "print_ticket", "transfer_ticket", "create_warranty", "edit_warranty", "convert_warranty_to_ticket",
      ],
      manage: [
        "delete_ticket", "assign_technician", "assign_technicians", "remove_parts",
        "perform_qc", "manage_repair_jobs", "complete_warranty",
        // See all tickets (not only own/assigned), edit locked tickets, backdate.
        "tickets_view_all", "edit_locked_records", "backdate_records", "archive_records",
        "manage_saved_filters",
      ],
    },
  },
  {
    id: "invoices",
    label: "Invoices & Billing",
    blurb: "Invoices, payments, refunds and printing.",
    icon: "FileText",
    levels: {
      view: ["view_invoice", "view_payment_history"],
      work: [
        "create_invoice", "create_partial_invoice", "edit_invoice", "print_invoice",
        "share_invoice", "update_payment", "apply_invoice_discount", "duplicate_invoice",
      ],
      manage: [
        "delete_invoice", "cancel_invoice", "change_invoice_status", "mark_overdue",
        "export_invoices", "manage_invoices", "manage_payments", "manage_warranties",
        // See all invoices, override price/discount limits, edit locked, revenue.
        "invoices_view_all", "edit_price_after_creation", "view_revenue_totals",
      ],
      full: [
        "manage_refunds", "void_payment", "reconcile_payment",
        "discount_over_limit",
      ],
    },
  },
  {
    id: "walkin",
    label: "Walk-In",
    blurb: "Walk-in enquiries, conversions and follow-ups.",
    icon: "Footprints",
    levels: {
      view: ["walkin_view", "walkin_reports_view"],
      work: [
        "walkin_create", "walkin_edit", "walkin_convert_to_ticket", "walkin_pin",
        "walkin_followup_create", "walkin_followup_reschedule", "walkin_followup_complete",
        "walkin_followup_notifications", "use_pos",
      ],
      manage: [
        "walkin_delete", "walkin_bulk_delete", "walkin_import", "walkin_export",
        "walkin_final_status_change", "walkin_followup_cancel",
      ],
    },
  },
  {
    id: "leads",
    label: "Leads & Sales CRM",
    blurb: "Leads, pipeline, deals, quotations and CRM.",
    icon: "Users",
    levels: {
      view: ["leads_view", "deals_view", "quotations_view", "companies_view", "contacts_view", "comms_activities_view", "leads_inbox_view", "leads_map_view", "view_sales_reports"],
      work: [
        "manage_sales", "leads_create", "leads_edit", "leads_stage_change", "leads_priority_change",
        "leads_pin", "leads_convert", "deals_create", "deals_edit", "quotations_create",
        "quotations_send", "quotations_convert_to_invoice", "companies_create", "companies_edit",
        "contacts_create", "contacts_manage", "comms_call_log", "comms_email_send",
        "comms_whatsapp_send", "comms_tasks_manage", "comms_meetings_manage", "send_communications",
      ],
      manage: [
        "leads_delete", "leads_assign", "leads_import", "leads_export", "leads_options_manage",
        "leads_smart_lists_manage", "leads_campaigns_manage", "deals_delete", "companies_delete",
        "route_leads", "leads_view_all",
      ],
    },
  },
  {
    id: "field",
    label: "Field (Pickup & Drop)",
    blurb: "Pickup/drop logistics, ninjas and field jobs.",
    icon: "Truck",
    levels: {
      view: ["view_field_jobs", "view_field_reports"],
      work: [
        "field_pickup_status_change", "field_drop_status_change", "update_pickup",
        "update_drop", "receive_store_handoff",
      ],
      manage: [
        "manage_field_jobs", "route_leads", "assign_ninja", "assign_field_manager",
        "field_view_all",
      ],
    },
  },
  {
    id: "inventory",
    label: "Inventory & Stock",
    blurb: "Stock, items, purchasing, transfers — and who can see cost prices.",
    icon: "Package",
    levels: {
      view: ["view_inventory", "view_inventory_reports"],
      work: [
        "create_item", "edit_item", "inventory_item_duplicate", "adjust_stock",
        "stock_movement", "manage_barcode", "inventory_print_labels", "inventory_bulk_update",
        "edit_parts_pricing", "import_data", "import_inventory", "export_reports",
        // Cost/buying price visibility is opt-in: a normal stock-worker sees
        // stock but NOT purchase cost unless granted.
        "inventory_view_cost",
      ],
      manage: [
        "delete_item", "approve_inventory", "inventory_reject", "manage_inventory",
        "manage_purchases", "purchases_approve", "purchases_receive", "manage_vendors",
        "transfer_inventory", "inventory_transfer_receive", "inventory_edit_cost",
      ],
    },
  },
  {
    id: "catalog",
    label: "Price List & Catalog",
    blurb: "Device catalog, brands, models and pricing.",
    icon: "ClipboardList",
    levels: {
      view: ["view_device_catalog"],
      work: [
        "create_category", "edit_category", "create_brand", "edit_brand",
        "create_model", "edit_model", "upload_images", "import_csv", "export_csv",
      ],
      manage: [
        "delete_category", "delete_brand", "delete_model", "manage_categories",
        "manage_brands", "manage_models", "manage_price_list",
      ],
      full: ["catalog_reset"],
    },
  },
  {
    id: "customers",
    label: "Customers",
    blurb: "Customer records, history and groups.",
    icon: "BookUser",
    levels: {
      view: ["view_customers", "view_customer_history"],
      work: ["create_customer", "edit_customer", "manage_customers", "assign_customer_groups", "import_customers"],
      manage: ["delete_customer", "merge_customer", "export_customers", "manage_customer_groups", "customers_view_all"],
    },
  },
  {
    id: "loyalty",
    label: "Loyalty & Points",
    blurb: "Customer loyalty program, points and tiers.",
    icon: "Gift",
    levels: {
      view: ["view_loyalty", "loyalty_view_points"],
      work: ["loyalty_award_points", "loyalty_redeem_points"],
      manage: ["manage_loyalty", "loyalty_tier_change"],
    },
  },
  {
    id: "employees",
    label: "Employees & Payroll",
    blurb: "Staff records, salary, payroll and advances.",
    icon: "UsersRound",
    levels: {
      view: ["view_employees", "view_payouts", "view_login_activity"],
      work: ["create_employee", "edit_employee", "assign_salary"],
      manage: [
        "delete_employee", "process_payroll", "export_payroll", "manage_advance_salary",
        "manage_attendance",
      ],
    },
  },
  {
    id: "accounts",
    label: "Accounts & Expenses",
    blurb: "Expenses, ledger, banking and settlements.",
    icon: "IndianRupee",
    levels: {
      view: ["view_expenses", "view_ledger", "view_transaction_details", "view_financial_reports"],
      work: ["create_expense", "edit_expense", "post_to_ledger", "manual_ledger_entry"],
      manage: [
        "delete_expense", "close_day", "reopen_day", "bank_transfer", "cash_settlement",
      ],
    },
  },
  {
    id: "reports",
    label: "Reports",
    blurb: "Business reports, exports, analytics, audit logs — and profit/revenue visibility.",
    icon: "BarChart3",
    levels: {
      view: [
        "view_reports", "view_ticket_reports", "view_sales_reports", "view_inventory_reports",
        "view_audit_logs",
        // Money-sensitive figures are opt-in even within reports access.
        "view_profit_margin", "view_revenue_totals",
      ],
      work: ["reports_builder_use", "reports_comparison_use", "reports_saved_manage", "manage_saved_filters"],
      manage: ["export_reports", "reports_print", "manage_reports", "reports_scheduled_manage", "import_data", "audit_export"],
    },
  },
  {
    id: "stores",
    label: "Multi-Store & Owner",
    blurb: "Owner Dashboard, All Shops, store creation & admin.",
    icon: "Building2",
    levels: {
      view: [
        "stores_list_view", "stores_switch", "stores_reports_view", "stores_users_view",
      ],
      work: [
        "multi_store_access", "stores_view_all", "stores_multi_select", "owner_dashboard_view",
        "owner_performance_view", "owner_consolidated_reports_view", "owner_export",
      ],
      manage: [
        "stores_create", "stores_edit", "stores_deactivate", "stores_environment_set",
        "stores_prefixes_manage", "stores_settings_manage", "stores_credentials_manage",
        "stores_users_assign", "stores_users_remove", "stores_roles_assign",
        "stores_roles_assign_per_store", "manage_branches",
      ],
      full: ["stores_delete"],
    },
  },
  {
    id: "employees_admin",
    label: "Roles & Users Admin",
    blurb: "Add users (Work) vs. redesign roles & permissions (Manage) — kept separate.",
    icon: "ShieldCheck",
    levels: {
      // View — see the user directory only.
      view: ["view_users"],
      // Work = "ADD USER". Can create/add staff and assign an EXISTING role +
      // authorized store(s), reset their password. Does NOT include the ability
      // to redesign roles or change what permissions a role has. This is the
      // exact separation the RepairOX authorization standard requires: Add User
      // must be grantable WITHOUT Manage Roles & Permissions.
      work: ["add_user", "create_users", "edit_users", "assign_roles", "reset_passwords"],
      // Manage = "MANAGE ROLES & PERMISSIONS". The full administrative tier:
      // create/edit roles, change permission grants, delete users, etc. Adding
      // this tier is what turns on permission administration.
      manage: [
        "manage_roles", "manage_permissions", "manage_users",
        "delete_users", "deactivate_accounts", "roles_preview",
      ],
    },
  },
  {
    id: "settings",
    label: "Settings",
    blurb: "Store, invoice, ticket, notifications and system configuration.",
    icon: "Settings",
    levels: {
      view: ["view_settings", "notifications_view"],
      work: ["notifications_mark_read", "upload_files"],
      manage: [
        "edit_org_profile", "edit_store_details", "edit_invoice_settings", "edit_ticket_settings",
        "edit_numbering", "edit_printing_settings", "settings_qc_configure",
        "settings_workflow_configure", "settings_walkin_fields_configure", "settings_inventory_edit",
        "settings_customer_edit", "settings_financial_edit", "settings_device_categories_manage",
        "settings_device_colours_manage", "settings_barcode_edit", "settings_dashboard_configure",
        "manage_settings", "manage_notifications",
        // Finer settings sections surfaced by the gap audit.
        "settings_invoice_tax_edit", "settings_payment_modes_manage",
        "settings_ticket_assignees_manage",
      ],
      full: [
        "manage_integrations", "settings_feature_visibility_manage",
        "settings_system_manage", "manage_subscription", "backup_restore",
        "access_api", "system_administrator", "manage_webhooks",
      ],
    },
  },
  {
    id: "account",
    label: "My Account",
    blurb: "Self-service password, PIN and sessions.",
    icon: "UserCog",
    levels: {
      work: ["account_password_change", "account_pin_manage", "account_sessions_manage"],
    },
  },
];

export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(
  PERMISSION_MODULES.map((m) => [m.id, m])
);

/** Expand a module + level to the exact set of keys granted (cumulative). */
export function levelToKeys(module: ModuleDef, level: AccessLevel): PermissionKey[] {
  if (level === "none") return [];
  const out: PermissionKey[] = [];
  for (const lv of ACCESS_LEVEL_ORDER) {
    const keys = module.levels[lv];
    if (keys) out.push(...keys);
    if (lv === level) break;
  }
  return out;
}

/** Every key this module can ever grant (the "full" bundle). */
export function allModuleKeys(module: ModuleDef): PermissionKey[] {
  return levelToKeys(module, "full");
}

/** The list of levels a module actually supports (skips undefined tiers). */
export function supportedLevels(module: ModuleDef): AccessLevel[] {
  const has = (lv: AccessLevel) => lv === "none" || (module.levels[lv]?.length ?? 0) > 0;
  return ACCESS_LEVEL_ORDER.filter(has);
}

/** Given the role's granted key set, resolve a module to its CLOSEST level for
 *  display in the simple UI. Returns the highest level whose full bundle is
 *  satisfied; "custom" when the selection doesn't match any clean level. */
export function keysToLevel(module: ModuleDef, granted: Set<PermissionKey>): AccessLevel | "custom" {
  const levels = supportedLevels(module).filter((l) => l !== "none");
  // Walk from highest supported level down; first fully-satisfied wins.
  for (let i = levels.length - 1; i >= 0; i--) {
    const need = levelToKeys(module, levels[i]);
    if (need.length > 0 && need.every((k) => granted.has(k))) {
      // Ensure nothing ABOVE this level is partially set beyond it (still fine —
      // higher keys simply aren't required). This is the highest clean match.
      return levels[i];
    }
  }
  // Nothing granted for this module → none. Partial → custom.
  const anyGranted = allModuleKeys(module).some((k) => granted.has(k));
  return anyGranted ? "custom" : "none";
}

/* ── ROLE PRESETS ───────────────────────────────────────────────────────────
   Ready-made templates expressed in the simple { moduleId: level } language.
   Applying a preset expands to the underlying keys. These map to the proposed
   final role list; a Master Owner can start from one and fine-tune. */
export interface RolePreset {
  id: string;
  label: string;
  icon: string;
  summary: string;
  /** Suggested store scope shown alongside (informational for the UI). */
  scope: "store" | "assigned" | "all_shops" | "platform";
  levels: Record<string, AccessLevel>;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "preset_owner",
    label: "Master Shop Owner",
    icon: "Crown",
    summary: "Runs the whole business — all stores, staff, reports and settings.",
    scope: "all_shops",
    levels: {
      dashboard: "full", tickets: "full", invoices: "full", walkin: "manage", leads: "manage",
      field: "manage", inventory: "manage", catalog: "manage", customers: "manage", loyalty: "manage",
      employees: "manage", accounts: "manage", reports: "manage", stores: "full",
      employees_admin: "manage", settings: "full", account: "work",
    },
  },
  {
    id: "preset_store_manager",
    label: "Store Manager",
    icon: "Store",
    summary: "Full control of their assigned store — not the whole organization.",
    scope: "assigned",
    levels: {
      dashboard: "manage", tickets: "manage", invoices: "manage", walkin: "manage", leads: "work",
      field: "manage", inventory: "manage", catalog: "work", customers: "manage", loyalty: "manage",
      employees: "view", accounts: "work", reports: "manage", stores: "view",
      employees_admin: "view", settings: "view", account: "work",
    },
  },
  {
    id: "preset_reception",
    label: "Reception / Front Desk",
    icon: "Footprints",
    summary: "Creates tickets, bills customers, handles walk-ins in their store.",
    scope: "store",
    levels: {
      dashboard: "view", tickets: "work", invoices: "work", walkin: "work", leads: "none",
      field: "view", inventory: "view", catalog: "view", customers: "work", loyalty: "view",
      employees: "none", accounts: "none", reports: "view", stores: "none",
      employees_admin: "none", settings: "none", account: "work",
    },
  },
  {
    id: "preset_technician",
    label: "Technician",
    icon: "Wrench",
    summary: "Works assigned repair jobs and updates status — nothing financial.",
    scope: "assigned",
    levels: {
      dashboard: "view", tickets: "work", invoices: "none", walkin: "none", leads: "none",
      field: "none", inventory: "view", catalog: "view", customers: "view", loyalty: "view",
      employees: "none", accounts: "none", reports: "none", stores: "none",
      employees_admin: "none", settings: "none", account: "work",
    },
  },
  {
    id: "preset_senior_tech",
    label: "Senior Technician",
    icon: "Wrench",
    summary: "Technician plus QC, technician assignment and stock adjustment.",
    scope: "assigned",
    levels: {
      dashboard: "view", tickets: "manage", invoices: "view", walkin: "none", leads: "none",
      field: "view", inventory: "work", catalog: "view", customers: "view", loyalty: "view",
      employees: "none", accounts: "none", reports: "view", stores: "none",
      employees_admin: "none", settings: "none", account: "work",
    },
  },
  {
    id: "preset_sales",
    label: "Sales Executive",
    icon: "TrendingUp",
    summary: "Works leads and quotations, consults the price list, bills sales.",
    scope: "assigned",
    levels: {
      dashboard: "view", tickets: "none", invoices: "work", walkin: "work", leads: "work",
      field: "none", inventory: "none", catalog: "view", customers: "work", loyalty: "work",
      employees: "none", accounts: "none", reports: "view", stores: "none",
      employees_admin: "none", settings: "none", account: "work",
    },
  },
  {
    id: "preset_inventory",
    label: "Inventory Manager",
    icon: "Package",
    summary: "Manages stock, purchasing, transfers and the catalog.",
    scope: "assigned",
    levels: {
      dashboard: "view", tickets: "none", invoices: "none", walkin: "none", leads: "none",
      field: "none", inventory: "manage", catalog: "manage", customers: "none",
      employees: "none", accounts: "none", reports: "view", stores: "none",
      employees_admin: "none", settings: "none", account: "work",
    },
  },
  {
    id: "preset_field",
    label: "Field Manager",
    icon: "Truck",
    summary: "Runs pickup & drop logistics and assigns ninjas.",
    scope: "assigned",
    levels: {
      dashboard: "view", tickets: "view", invoices: "none", walkin: "none", leads: "none",
      field: "manage", inventory: "none", catalog: "none", customers: "view", loyalty: "view",
      employees: "none", accounts: "none", reports: "view", stores: "none",
      employees_admin: "none", settings: "none", account: "work",
    },
  },
  {
    id: "preset_cashier",
    label: "Cashier / Accounts",
    icon: "Wallet",
    summary: "Handles billing, payments and daily accounts.",
    scope: "store",
    levels: {
      dashboard: "view", tickets: "view", invoices: "manage", walkin: "none", leads: "none",
      field: "none", inventory: "none", catalog: "none", customers: "view", loyalty: "view",
      employees: "none", accounts: "manage", reports: "view", stores: "none",
      employees_admin: "none", settings: "none", account: "work",
    },
  },
  {
    id: "preset_readonly",
    label: "Read Only",
    icon: "Eye",
    summary: "Can see dashboards, records and reports — cannot change anything.",
    scope: "store",
    levels: {
      dashboard: "view", tickets: "view", invoices: "view", walkin: "view", leads: "view",
      field: "view", inventory: "view", catalog: "view", customers: "view", loyalty: "view",
      employees: "view", accounts: "view", reports: "view", stores: "none",
      employees_admin: "none", settings: "view", account: "work",
    },
  },
];

/** Expand a full { moduleId: level } map to a flat, de-duped key list. */
export function presetToKeys(levels: Record<string, AccessLevel>): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const [moduleId, level] of Object.entries(levels)) {
    const mod = MODULE_BY_ID[moduleId];
    if (!mod) continue;
    for (const k of levelToKeys(mod, level)) set.add(k);
  }
  return Array.from(set);
}

/** Build the per-module level map for a role from its current granted keys —
 *  used to render the simple matrix from whatever is saved. */
export function grantsToLevelMap(granted: Set<PermissionKey>): Record<string, AccessLevel | "custom"> {
  const out: Record<string, AccessLevel | "custom"> = {};
  for (const mod of PERMISSION_MODULES) out[mod.id] = keysToLevel(mod, granted);
  return out;
}
