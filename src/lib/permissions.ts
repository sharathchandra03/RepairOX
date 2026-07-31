/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Role & Permission model
   Single source of truth for workspaces, permission capabilities and roles.
   This is UI-side and permission-ready: swap `CURRENT_USER` for a real
   session payload from the backend (profile, org, branch, role, allowed
   workspaces/pages/actions) without touching any consuming component.
   ────────────────────────────────────────────────────────────────────────── */

/* ── Workspaces ──────────────────────────────────────────────────────────
   RepairOX is organised into exactly 3 top-level workspaces. A business may
   use one, two or all three — the shell adapts based on what the signed-in
   user's role is allowed to access. */
export type WorkspaceId = "leads" | "shop" | "operations";

export interface WorkspaceDef {
  id: WorkspaceId;
  label: string;
  /** Compact label for tight 3-across UI (sidebar pill switcher) — falls back to `label` */
  navLabel?: string;
  short: string;
  tagline: string;
  /** Tailwind text/bg classes used for badges & topbar chip — kept within the existing palette */
  color: string;
  bg: string;
  /** First page to land on when this workspace is opened */
  homeHref: string;
}

export const WORKSPACES: WorkspaceDef[] = [
  {
    id: "shop",
    label: "Shop Management",
    navLabel: "Shop",
    tagline: "Tickets, billing and customers — end to end",
    short: "SH",
    color: "text-[#4361EE]",
    bg: "bg-[#EEF1FD]",
    homeHref: "/dashboard",
  },
  {
    id: "leads",
    label: "Sales Management",
    navLabel: "Leads",
    tagline: "Capture, score and convert every enquiry",
    short: "SA",
    color: "text-violet-700",
    bg: "bg-violet-50",
    homeHref: "/lead-management",
  },
  {
    id: "operations",
    label: "Field Management",
    navLabel: "Field",
    tagline: "Technicians, field visits and route planning",
    short: "FM",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    homeHref: "/operations",
  },
];

export const WORKSPACE_MAP: Record<WorkspaceId, WorkspaceDef> = Object.fromEntries(
  WORKSPACES.map((w) => [w.id, w])
) as Record<WorkspaceId, WorkspaceDef>;

/* ── Permission capabilities ─────────────────────────────────────────────
   The full catalogue of capabilities the Super Admin / Master Shop Owner
   can grant per role. Grouped for a scannable permission matrix UI.
   Expanded for enterprise-grade access control across all RepairOX modules. */
export type PermissionKey =
  /* Access Levels */
  | "full_access"
  | "view_only"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "assign"
  /* Account / Auth */
  | "view_users"
  | "create_users"
  | "edit_users"
  | "delete_users"
  | "manage_users"
  | "manage_roles"
  | "assign_roles"
  | "reset_passwords"
  | "deactivate_accounts"
  | "view_login_activity"
  | "manage_branches"
  /* Dashboard */
  | "view_dashboard"
  | "view_kpi_cards"
  | "reorder_widgets"
  | "view_charts"
  | "view_activity_log"
  | "export_dashboard"
  | "edit_dashboard_targets"
  /* Tickets */
  | "create_ticket"
  | "edit_ticket"
  | "delete_ticket"
  | "view_ticket"
  | "assign_technician"
  | "change_ticket_status"
  | "add_parts"
  | "remove_parts"
  | "view_qc"
  | "perform_qc"
  | "view_internal_notes"
  | "view_customer_details"
  | "view_device_details"
  | "push_to_invoice"
  | "manage_repair_jobs"
  | "update_repair_status"
  | "assign_technicians"
  /* Invoices */
  | "create_invoice"
  | "edit_invoice"
  | "delete_invoice"
  | "view_invoice"
  | "print_invoice"
  | "update_payment"
  | "mark_overdue"
  | "share_invoice"
  | "convert_from_ticket"
  | "view_payment_history"
  | "manage_invoices"
  | "manage_payments"
  | "manage_refunds"
  | "manage_warranties"
  /* Inventory */
  | "view_inventory"
  | "create_item"
  | "edit_item"
  | "delete_item"
  | "adjust_stock"
  | "stock_movement"
  | "approve_inventory"
  | "manage_barcode"
  | "manage_categories"
  | "manage_brands"
  | "manage_models"
  | "manage_price_list"
  | "manage_inventory"
  | "manage_purchases"
  | "manage_vendors"
  | "transfer_inventory"
  /* Customers */
  | "view_customers"
  | "create_customer"
  | "edit_customer"
  | "delete_customer"
  | "view_customer_history"
  | "merge_customer"
  | "export_customers"
  | "manage_customers"
  /* Expenses / Accounts */
  | "view_expenses"
  | "create_expense"
  | "edit_expense"
  | "delete_expense"
  | "post_to_ledger"
  | "view_ledger"
  | "manual_ledger_entry"
  | "close_day"
  | "reopen_day"
  | "bank_transfer"
  | "cash_settlement"
  | "view_transaction_details"
  | "view_financial_reports"
  /* Payroll / HR */
  | "view_employees"
  | "create_employee"
  | "edit_employee"
  | "delete_employee"
  | "assign_salary"
  | "process_payroll"
  | "view_payouts"
  | "manage_advance_salary"
  | "manage_attendance"
  | "manage_permissions"
  /* Sales / POS */
  | "manage_sales"
  | "use_pos"
  | "send_communications"
  /* Price List / Device Catalog */
  | "view_device_catalog"
  | "create_category"
  | "edit_category"
  | "delete_category"
  | "create_brand"
  | "edit_brand"
  | "delete_brand"
  | "create_model"
  | "edit_model"
  | "delete_model"
  | "upload_images"
  | "import_csv"
  | "export_csv"
  | "edit_parts_pricing"
  /* Settings */
  | "view_settings"
  | "edit_org_profile"
  | "edit_store_details"
  | "edit_invoice_settings"
  | "edit_ticket_settings"
  | "edit_numbering"
  | "edit_printing_settings"
  | "manage_integrations"
  | "manage_notifications"
  | "manage_settings"
  | "manage_subscription"
  /* Reports */
  | "view_reports"
  | "export_reports"
  | "view_inventory_reports"
  | "view_sales_reports"
  | "view_ticket_reports"
  | "view_audit_logs"
  | "manage_reports"
  | "import_data"
  /* Documents & Communication */
  | "print_documents"
  | "upload_files"
  /* System */
  | "access_api"
  | "backup_restore"
  | "system_administrator";

export interface PermissionDef {
  key: PermissionKey;
  label: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  description: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "access",
    label: "Access Levels",
    description: "Baseline capability level applied across allowed workspaces",
    permissions: [
      { key: "full_access", label: "Full Access" },
      { key: "view_only", label: "View Only" },
      { key: "create", label: "Create" },
      { key: "edit", label: "Edit" },
      { key: "delete", label: "Delete" },
      { key: "approve", label: "Approve" },
      { key: "assign", label: "Assign" },
    ],
  },
  {
    id: "admin",
    label: "Account & Auth",
    description: "User accounts, role assignment and authentication controls",
    permissions: [
      { key: "view_users", label: "View Users" },
      { key: "create_users", label: "Create Users" },
      { key: "edit_users", label: "Edit Users" },
      { key: "delete_users", label: "Delete Users" },
      { key: "manage_users", label: "Manage Users" },
      { key: "manage_roles", label: "Manage Roles & Permissions" },
      { key: "assign_roles", label: "Assign Roles" },
      { key: "reset_passwords", label: "Reset Passwords" },
      { key: "deactivate_accounts", label: "Deactivate Accounts" },
      { key: "view_login_activity", label: "View Login Activity" },
      { key: "manage_branches", label: "Manage Branches" },
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Dashboard visibility, widgets and data export",
    permissions: [
      { key: "view_dashboard", label: "View Dashboard" },
      { key: "view_kpi_cards", label: "View KPI Cards" },
      { key: "reorder_widgets", label: "Reorder Widgets" },
      { key: "view_charts", label: "View Charts" },
      { key: "view_activity_log", label: "View Activity Log" },
      { key: "export_dashboard", label: "Export Dashboard Data" },
      { key: "edit_dashboard_targets", label: "Edit Dashboard Targets" },
    ],
  },
  {
    id: "tickets",
    label: "Tickets & Repairs",
    description: "Repair job lifecycle — creation, assignment, QC and status tracking",
    permissions: [
      { key: "create_ticket", label: "Create Ticket" },
      { key: "edit_ticket", label: "Edit Ticket" },
      { key: "delete_ticket", label: "Delete Ticket" },
      { key: "view_ticket", label: "View Ticket" },
      { key: "assign_technician", label: "Assign Technician" },
      { key: "assign_technicians", label: "Assign Technicians (Bulk)" },
      { key: "change_ticket_status", label: "Change Status" },
      { key: "update_repair_status", label: "Update Repair Status" },
      { key: "add_parts", label: "Add Parts" },
      { key: "remove_parts", label: "Remove Parts" },
      { key: "view_qc", label: "View QC" },
      { key: "perform_qc", label: "Perform QC" },
      { key: "view_internal_notes", label: "View Internal Notes" },
      { key: "view_customer_details", label: "View Customer Details" },
      { key: "view_device_details", label: "View Device Details" },
      { key: "push_to_invoice", label: "Push to Invoice" },
      { key: "manage_repair_jobs", label: "Manage Repair Jobs" },
    ],
  },
  {
    id: "invoices",
    label: "Invoices & Billing",
    description: "Invoice lifecycle, payments and financial operations",
    permissions: [
      { key: "create_invoice", label: "Create Invoice" },
      { key: "edit_invoice", label: "Edit Invoice" },
      { key: "delete_invoice", label: "Delete Invoice" },
      { key: "view_invoice", label: "View Invoice" },
      { key: "print_invoice", label: "Print Invoice" },
      { key: "update_payment", label: "Update Payment" },
      { key: "mark_overdue", label: "Mark Overdue" },
      { key: "share_invoice", label: "Share Invoice" },
      { key: "convert_from_ticket", label: "Convert from Ticket" },
      { key: "view_payment_history", label: "View Payment History" },
      { key: "manage_invoices", label: "Manage Invoices" },
      { key: "manage_payments", label: "Manage Payments" },
      { key: "manage_refunds", label: "Manage Refunds" },
      { key: "manage_warranties", label: "Manage Warranties" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory & Stock",
    description: "Stock management, transfers, approvals and cataloguing",
    permissions: [
      { key: "view_inventory", label: "View Inventory" },
      { key: "create_item", label: "Create Item" },
      { key: "edit_item", label: "Edit Item" },
      { key: "delete_item", label: "Delete Item" },
      { key: "adjust_stock", label: "Adjust Stock" },
      { key: "stock_movement", label: "Stock Movement" },
      { key: "approve_inventory", label: "Approve Inventory" },
      { key: "manage_barcode", label: "Manage Barcode" },
      { key: "manage_categories", label: "Manage Categories" },
      { key: "manage_brands", label: "Manage Brands" },
      { key: "manage_models", label: "Manage Models" },
      { key: "manage_price_list", label: "Manage Price List" },
      { key: "manage_inventory", label: "Manage Inventory" },
      { key: "manage_purchases", label: "Manage Purchases" },
      { key: "manage_vendors", label: "Manage Vendors" },
      { key: "transfer_inventory", label: "Transfer Inventory" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    description: "Customer records, history and data management",
    permissions: [
      { key: "view_customers", label: "View Customers" },
      { key: "create_customer", label: "Create Customer" },
      { key: "edit_customer", label: "Edit Customer" },
      { key: "delete_customer", label: "Delete Customer" },
      { key: "view_customer_history", label: "View History" },
      { key: "merge_customer", label: "Merge Customer" },
      { key: "export_customers", label: "Export Customers" },
      { key: "manage_customers", label: "Manage Customers" },
    ],
  },
  {
    id: "expenses",
    label: "Expenses & Accounts",
    description: "Expense tracking, ledger management and financial controls",
    permissions: [
      { key: "view_expenses", label: "View Expenses" },
      { key: "create_expense", label: "Create Expense" },
      { key: "edit_expense", label: "Edit Expense" },
      { key: "delete_expense", label: "Delete Expense" },
      { key: "post_to_ledger", label: "Post to Ledger" },
      { key: "view_ledger", label: "View Ledger" },
      { key: "manual_ledger_entry", label: "Manual Ledger Entry" },
      { key: "close_day", label: "Close Day" },
      { key: "reopen_day", label: "Reopen Day" },
      { key: "bank_transfer", label: "Bank Transfer" },
      { key: "cash_settlement", label: "Cash Settlement" },
      { key: "view_transaction_details", label: "View Transaction Details" },
      { key: "view_financial_reports", label: "View Financial Reports" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll & HR",
    description: "Employee management, compensation and attendance",
    permissions: [
      { key: "view_employees", label: "View Employees" },
      { key: "create_employee", label: "Create Employee" },
      { key: "edit_employee", label: "Edit Employee" },
      { key: "delete_employee", label: "Delete Employee" },
      { key: "assign_salary", label: "Assign Salary" },
      { key: "process_payroll", label: "Process Payroll" },
      { key: "view_payouts", label: "View Payouts" },
      { key: "manage_advance_salary", label: "Manage Advance Salary" },
      { key: "manage_attendance", label: "Manage Attendance" },
      { key: "manage_permissions", label: "Manage Permissions" },
    ],
  },
  {
    id: "sales",
    label: "Sales & POS",
    description: "Point-of-sale, sales management and communications",
    permissions: [
      { key: "manage_sales", label: "Manage Sales" },
      { key: "use_pos", label: "Use POS" },
      { key: "send_communications", label: "Send SMS / Email / WhatsApp" },
    ],
  },
  {
    id: "catalog",
    label: "Price List & Device Catalog",
    description: "Device categories, brands, models and pricing",
    permissions: [
      { key: "view_device_catalog", label: "View Device Catalog" },
      { key: "create_category", label: "Create Category" },
      { key: "edit_category", label: "Edit Category" },
      { key: "delete_category", label: "Delete Category" },
      { key: "create_brand", label: "Create Brand" },
      { key: "edit_brand", label: "Edit Brand" },
      { key: "delete_brand", label: "Delete Brand" },
      { key: "create_model", label: "Create Model" },
      { key: "edit_model", label: "Edit Model" },
      { key: "delete_model", label: "Delete Model" },
      { key: "upload_images", label: "Upload Images" },
      { key: "import_csv", label: "Import CSV" },
      { key: "export_csv", label: "Export CSV" },
      { key: "edit_parts_pricing", label: "Edit Parts Pricing" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    description: "Organisation, store, invoice and system configuration",
    permissions: [
      { key: "view_settings", label: "View Settings" },
      { key: "edit_org_profile", label: "Edit Organization Profile" },
      { key: "edit_store_details", label: "Edit Store Details" },
      { key: "edit_invoice_settings", label: "Edit Invoice Settings" },
      { key: "edit_ticket_settings", label: "Edit Ticket Settings" },
      { key: "edit_numbering", label: "Edit Numbering" },
      { key: "edit_printing_settings", label: "Edit Printing Settings" },
      { key: "manage_integrations", label: "Manage Integrations" },
      { key: "manage_notifications", label: "Manage Notifications" },
      { key: "manage_settings", label: "Manage Settings" },
      { key: "manage_subscription", label: "Manage Subscription" },
    ],
  },
  {
    id: "reports",
    label: "Reports & Data",
    description: "Reports, audit logs, data import/export",
    permissions: [
      { key: "view_reports", label: "View Reports" },
      { key: "export_reports", label: "Export Reports" },
      { key: "view_inventory_reports", label: "View Inventory Reports" },
      { key: "view_sales_reports", label: "View Sales Reports" },
      { key: "view_ticket_reports", label: "View Ticket Reports" },
      { key: "view_audit_logs", label: "View Audit Logs" },
      { key: "manage_reports", label: "Manage Reports" },
      { key: "import_data", label: "Import Data" },
    ],
  },
  {
    id: "communication",
    label: "Communication & Documents",
    description: "Customer-facing outputs and document management",
    permissions: [
      { key: "print_documents", label: "Print Documents" },
      { key: "upload_files", label: "Upload Files" },
    ],
  },
  {
    id: "system",
    label: "System & Platform",
    description: "Platform-level technical and administrative controls",
    permissions: [
      { key: "access_api", label: "Access API" },
      { key: "backup_restore", label: "Backup & Restore" },
      { key: "system_administrator", label: "System Administrator" },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionDef[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);
export const PERMISSION_LABEL: Record<PermissionKey, string> = Object.fromEntries(
  ALL_PERMISSIONS.map((p) => [p.key, p.label])
) as Record<PermissionKey, string>;

/* ── Roles ───────────────────────────────────────────────────────────────
   Permissions are assigned by the Super Admin / Master Shop Owner — end
   users never choose their own role. `permissions: "all"` grants every
   capability in the catalogue (Platform Owner). */
export interface RoleDef {
  id: string;
  label: string;
  summary: string;
  workspaces: WorkspaceId[];
  permissions: PermissionKey[] | "all";
}

export const ROLES: RoleDef[] = [
  {
    id: "platform_owner",
    label: "Platform Owner",
    summary: "Full access to every business on the platform.",
    workspaces: ["leads", "shop", "operations"],
    permissions: "all",
  },
  {
    id: "developer_admin",
    label: "Developer / Admin",
    summary: "Platform maintenance and troubleshooting.",
    workspaces: ["leads", "shop", "operations"],
    permissions: [
      "view_dashboard", "view_kpi_cards", "view_charts", "view_activity_log", "export_dashboard",
      "view_audit_logs", "view_reports", "manage_reports", "export_reports", "import_data",
      "manage_users", "manage_roles", "manage_branches", "assign_roles", "reset_passwords",
      "deactivate_accounts", "view_login_activity", "view_users", "create_users", "edit_users", "delete_users",
      "manage_settings", "manage_integrations", "manage_notifications",
      "access_api", "backup_restore", "system_administrator",
      "upload_files", "print_documents",
    ],
  },
  {
    id: "master_shop_owner",
    label: "Master Shop Owner",
    summary: "Full access to all branches, billing, reports, employees, and settings.",
    workspaces: ["leads", "shop", "operations"],
    permissions: [
      "full_access", "create", "edit", "delete", "approve", "assign",
      "view_users", "create_users", "edit_users", "delete_users",
      "manage_users", "manage_roles", "manage_branches", "assign_roles", "reset_passwords",
      "deactivate_accounts", "view_login_activity",
      "view_dashboard", "view_kpi_cards", "reorder_widgets", "view_charts", "view_activity_log", "export_dashboard", "edit_dashboard_targets",
      "create_ticket", "edit_ticket", "delete_ticket", "view_ticket", "assign_technician",
      "assign_technicians", "change_ticket_status", "update_repair_status",
      "add_parts", "remove_parts", "view_qc", "perform_qc",
      "view_internal_notes", "view_customer_details", "view_device_details", "push_to_invoice",
      "manage_repair_jobs",
      "create_invoice", "edit_invoice", "delete_invoice", "view_invoice", "print_invoice",
      "update_payment", "mark_overdue", "share_invoice", "convert_from_ticket", "view_payment_history",
      "manage_invoices", "manage_payments", "manage_refunds", "manage_warranties",
      "view_inventory", "create_item", "edit_item", "delete_item", "adjust_stock", "stock_movement",
      "approve_inventory", "manage_barcode", "manage_categories", "manage_brands", "manage_models", "manage_price_list",
      "manage_inventory", "manage_purchases", "manage_vendors", "transfer_inventory",
      "view_customers", "create_customer", "edit_customer", "delete_customer",
      "view_customer_history", "merge_customer", "export_customers", "manage_customers",
      "view_expenses", "create_expense", "edit_expense", "delete_expense",
      "post_to_ledger", "view_ledger", "manual_ledger_entry", "close_day", "reopen_day",
      "bank_transfer", "cash_settlement", "view_transaction_details", "view_financial_reports",
      "view_employees", "create_employee", "edit_employee", "delete_employee",
      "assign_salary", "process_payroll", "view_payouts", "manage_advance_salary", "manage_attendance", "manage_permissions",
      "manage_sales", "use_pos", "send_communications",
      "view_device_catalog", "create_category", "edit_category", "delete_category",
      "create_brand", "edit_brand", "delete_brand", "create_model", "edit_model", "delete_model",
      "upload_images", "import_csv", "export_csv", "edit_parts_pricing",
      "view_settings", "edit_org_profile", "edit_store_details", "edit_invoice_settings",
      "edit_ticket_settings", "edit_numbering", "edit_printing_settings",
      "manage_integrations", "manage_notifications", "manage_settings", "manage_subscription",
      "view_reports", "export_reports", "view_inventory_reports", "view_sales_reports",
      "view_ticket_reports", "view_audit_logs", "manage_reports", "import_data",
      "print_documents", "upload_files",
    ],
  },
  {
    id: "shop_owner_branch_manager",
    label: "Shop Owner / Branch Manager",
    summary: "Full control of their assigned branch.",
    workspaces: ["leads", "shop", "operations"],
    permissions: [
      "create", "edit", "delete", "approve", "assign",
      "view_dashboard", "view_kpi_cards", "view_charts", "view_activity_log", "export_dashboard",
      "create_ticket", "edit_ticket", "delete_ticket", "view_ticket",
      "assign_technician", "assign_technicians", "change_ticket_status", "update_repair_status",
      "add_parts", "remove_parts", "view_qc", "perform_qc",
      "view_internal_notes", "view_customer_details", "view_device_details", "push_to_invoice",
      "manage_repair_jobs",
      "create_invoice", "edit_invoice", "delete_invoice", "view_invoice", "print_invoice",
      "update_payment", "mark_overdue", "share_invoice", "convert_from_ticket", "view_payment_history",
      "manage_invoices", "manage_payments", "manage_refunds", "manage_warranties",
      "view_inventory", "create_item", "edit_item", "delete_item", "adjust_stock", "stock_movement",
      "approve_inventory", "manage_barcode", "manage_categories", "manage_brands", "manage_models", "manage_price_list",
      "manage_inventory", "manage_purchases", "manage_vendors", "transfer_inventory",
      "view_customers", "create_customer", "edit_customer", "delete_customer",
      "view_customer_history", "merge_customer", "export_customers", "manage_customers",
      "view_expenses", "create_expense", "edit_expense", "delete_expense",
      "post_to_ledger", "view_ledger", "manual_ledger_entry", "close_day",
      "bank_transfer", "cash_settlement", "view_transaction_details", "view_financial_reports",
      "view_employees", "create_employee", "edit_employee", "assign_salary", "view_payouts",
      "manage_sales", "use_pos", "send_communications",
      "view_device_catalog", "edit_parts_pricing",
      "view_settings", "edit_store_details", "edit_invoice_settings", "edit_ticket_settings",
      "edit_printing_settings", "manage_settings",
      "view_reports", "export_reports", "view_inventory_reports", "view_sales_reports",
      "view_ticket_reports", "manage_reports",
      "print_documents", "upload_files",
    ],
  },
  {
    id: "reception",
    label: "Reception",
    summary: "Create repair jobs, manage customers, create tickets, and collect payments.",
    workspaces: ["shop", "leads"],
    permissions: [
      "create", "edit",
      "view_dashboard", "view_kpi_cards", "view_charts",
      "create_ticket", "edit_ticket", "view_ticket", "change_ticket_status",
      "add_parts", "view_customer_details", "view_device_details", "push_to_invoice",
      "manage_repair_jobs",
      "create_invoice", "view_invoice", "print_invoice", "update_payment", "convert_from_ticket",
      "manage_invoices", "manage_payments", "use_pos",
      "view_customers", "create_customer", "edit_customer", "view_customer_history", "manage_customers",
      "view_inventory",
      "print_documents", "upload_files", "send_communications",
    ],
  },
  {
    id: "technician",
    label: "Technician",
    summary: "View assigned jobs, update repair status, add notes, and record parts used.",
    workspaces: ["shop"],
    permissions: [
      "view_only",
      "view_dashboard",
      "view_ticket", "change_ticket_status", "update_repair_status",
      "add_parts", "view_internal_notes", "view_device_details",
      "view_inventory",
      "upload_files",
    ],
  },
  {
    id: "senior_technician",
    label: "Senior Technician",
    summary: "Technician responsibilities plus assign jobs and approve repairs.",
    workspaces: ["shop"],
    permissions: [
      "view_only", "approve", "assign",
      "view_dashboard", "view_kpi_cards",
      "view_ticket", "assign_technician", "change_ticket_status", "update_repair_status",
      "add_parts", "remove_parts", "view_qc", "perform_qc",
      "view_internal_notes", "view_device_details",
      "assign_technicians",
      "view_inventory", "adjust_stock",
      "upload_files",
    ],
  },
  {
    id: "inventory_manager",
    label: "Inventory Manager",
    summary: "Manage stock, vendors, purchase orders, and parts transfers.",
    workspaces: ["operations"],
    permissions: [
      "create", "edit",
      "view_dashboard", "view_kpi_cards",
      "view_inventory", "create_item", "edit_item", "delete_item", "adjust_stock", "stock_movement",
      "approve_inventory", "manage_barcode", "manage_categories", "manage_brands", "manage_models", "manage_price_list",
      "manage_inventory", "manage_purchases", "manage_vendors", "transfer_inventory",
      "view_device_catalog", "create_category", "edit_category", "create_brand", "edit_brand",
      "create_model", "edit_model", "upload_images", "import_csv", "export_csv", "edit_parts_pricing",
      "export_reports", "view_inventory_reports",
      "print_documents", "upload_files",
    ],
  },
  {
    id: "sales_executive",
    label: "Sales Executive",
    summary: "Manage device sales, accessory sales, and invoicing.",
    workspaces: ["leads", "shop"],
    permissions: [
      "create", "edit",
      "view_dashboard", "view_kpi_cards", "view_charts",
      "view_customers", "create_customer", "edit_customer", "view_customer_history", "manage_customers",
      "create_invoice", "edit_invoice", "view_invoice", "print_invoice", "update_payment",
      "share_invoice", "manage_invoices",
      "manage_sales", "use_pos", "send_communications",
      "view_device_catalog",
      "view_sales_reports",
      "print_documents",
    ],
  },
  {
    id: "cashier_accounts",
    label: "Cashier / Accounts",
    summary: "Manage billing, payments, refunds, and financial reports.",
    workspaces: ["shop"],
    permissions: [
      "view_only",
      "view_dashboard", "view_kpi_cards",
      "create_invoice", "edit_invoice", "view_invoice", "print_invoice",
      "update_payment", "mark_overdue", "view_payment_history",
      "manage_invoices", "manage_payments", "manage_refunds",
      "view_expenses", "create_expense", "edit_expense",
      "post_to_ledger", "view_ledger", "close_day", "cash_settlement", "view_transaction_details",
      "view_financial_reports",
      "use_pos", "export_reports",
      "print_documents",
    ],
  },
  {
    id: "read_only_user",
    label: "Read Only User",
    summary: "View reports, dashboards, and permitted data only.",
    workspaces: ["leads", "shop", "operations"],
    permissions: [
      "view_only",
      "view_dashboard", "view_kpi_cards", "view_charts",
      "view_ticket", "view_invoice", "view_inventory", "view_customers",
      "view_expenses", "view_ledger", "view_employees",
      "view_financial_reports", "view_reports", "view_inventory_reports", "view_sales_reports", "view_ticket_reports",
      "view_device_catalog", "view_settings",
    ],
  },
];

export const ROLE_MAP: Record<string, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.id, r]));

export function getRole(roleId: string): RoleDef | undefined {
  return ROLE_MAP[roleId];
}

export function hasPermission(roleId: string, key: PermissionKey): boolean {
  const role = getRole(roleId);
  if (!role) return false;
  if (role.permissions === "all") return true;
  return role.permissions.includes(key) || role.permissions.includes("full_access");
}

export function getAllowedWorkspaces(roleId: string): WorkspaceDef[] {
  const role = getRole(roleId);
  if (!role) return [];
  return WORKSPACES.filter((w) => role.workspaces.includes(w.id));
}

/* ── Session defaults (local-mode fallback) ──────────────────────────────
   When Supabase is NOT configured (local/demo mode), these defaults are used
   as the "signed-in user". In production (Supabase mode), the real session is
   loaded from `auth.users` → `staff` by `permissions-context.tsx` and the
   `CURRENT_USER` constant below is only used as a last-resort fallback when
   the session is still loading or unavailable.

   Consuming components should use `usePermissions().currentUser` instead of
   importing CURRENT_USER directly. The context provides the real DB-backed
   session in production and falls back to this constant in local mode. */
export const CURRENT_USER = {
  name: "Sharath K.",
  email: "ksharath2003@gmail.com",
  organization: "RepairOX – BTM Layout",
  branch: "BTM Layout (HQ)",
  roleId: "platform_owner",
};

/** @deprecated Use `usePermissions().role` instead for context-aware role. */
export function currentRole(): RoleDef {
  return getRole(CURRENT_USER.roleId) ?? ROLES[ROLES.length - 1];
}

/** @deprecated Use `usePermissions().allowedWorkspaces` instead. */
export function currentAllowedWorkspaces(): WorkspaceDef[] {
  return getAllowedWorkspaces(CURRENT_USER.roleId);
}
