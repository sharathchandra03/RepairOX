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
   can grant per role. Grouped for a scannable permission matrix UI. */
export type PermissionKey =
  | "full_access"
  | "view_only"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "assign"
  | "manage_users"
  | "manage_roles"
  | "manage_branches"
  | "manage_customers"
  | "manage_repair_jobs"
  | "manage_inventory"
  | "manage_purchases"
  | "manage_sales"
  | "manage_vendors"
  | "transfer_inventory"
  | "assign_technicians"
  | "update_repair_status"
  | "use_pos"
  | "manage_invoices"
  | "manage_payments"
  | "manage_refunds"
  | "manage_warranties"
  | "view_financial_reports"
  | "manage_reports"
  | "export_reports"
  | "import_data"
  | "view_dashboard"
  | "view_audit_logs"
  | "print_documents"
  | "upload_files"
  | "send_communications"
  | "manage_settings"
  | "manage_subscription"
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
    label: "User & Role Management",
    description: "Controls who can configure the organisation itself",
    permissions: [
      { key: "manage_users", label: "Manage Users" },
      { key: "manage_roles", label: "Manage Roles & Permissions" },
      { key: "manage_branches", label: "Manage Branches" },
    ],
  },
  {
    id: "operations",
    label: "Business Operations",
    description: "Day-to-day shop, repair and stock operations",
    permissions: [
      { key: "manage_customers", label: "Manage Customers" },
      { key: "manage_repair_jobs", label: "Manage Repair Jobs" },
      { key: "manage_inventory", label: "Manage Inventory" },
      { key: "manage_purchases", label: "Manage Purchases" },
      { key: "manage_sales", label: "Manage Sales" },
      { key: "manage_vendors", label: "Manage Vendors" },
      { key: "transfer_inventory", label: "Transfer Inventory" },
      { key: "assign_technicians", label: "Assign Technicians" },
      { key: "update_repair_status", label: "Update Repair Status" },
      { key: "use_pos", label: "Use POS" },
    ],
  },
  {
    id: "financial",
    label: "Financial",
    description: "Billing, collections and money-sensitive actions",
    permissions: [
      { key: "manage_invoices", label: "Manage Invoices" },
      { key: "manage_payments", label: "Manage Payments" },
      { key: "manage_refunds", label: "Manage Refunds" },
      { key: "manage_warranties", label: "Manage Warranties" },
      { key: "view_financial_reports", label: "View Financial Reports" },
    ],
  },
  {
    id: "reports",
    label: "Reports & Data",
    description: "Visibility and portability of business data",
    permissions: [
      { key: "manage_reports", label: "Manage Reports" },
      { key: "export_reports", label: "Export Reports" },
      { key: "import_data", label: "Import Data" },
      { key: "view_dashboard", label: "View Dashboard" },
      { key: "view_audit_logs", label: "View Audit Logs" },
    ],
  },
  {
    id: "communication",
    label: "Communication & Documents",
    description: "Customer-facing outputs and messaging",
    permissions: [
      { key: "print_documents", label: "Print Documents" },
      { key: "upload_files", label: "Upload Files" },
      { key: "send_communications", label: "Send SMS / Email / WhatsApp" },
    ],
  },
  {
    id: "system",
    label: "System & Settings",
    description: "Platform-level and technical controls",
    permissions: [
      { key: "manage_settings", label: "Manage Settings" },
      { key: "manage_subscription", label: "Manage Subscription" },
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
      "view_dashboard", "view_audit_logs", "manage_users", "manage_roles", "manage_branches",
      "manage_settings", "import_data", "export_reports", "manage_reports",
      "access_api", "backup_restore", "system_administrator", "upload_files", "print_documents",
    ],
  },
  {
    id: "master_shop_owner",
    label: "Master Shop Owner",
    summary: "Full access to all branches, billing, reports, employees, and settings.",
    workspaces: ["leads", "shop", "operations"],
    permissions: [
      "full_access", "create", "edit", "delete", "approve", "assign",
      "manage_users", "manage_roles", "manage_branches",
      "manage_customers", "manage_repair_jobs", "manage_inventory", "manage_purchases",
      "manage_sales", "manage_vendors", "transfer_inventory", "assign_technicians",
      "update_repair_status", "use_pos",
      "manage_invoices", "manage_payments", "manage_refunds", "manage_warranties",
      "view_financial_reports", "manage_reports", "export_reports", "import_data",
      "view_dashboard", "view_audit_logs",
      "print_documents", "upload_files", "send_communications",
      "manage_settings", "manage_subscription",
    ],
  },
  {
    id: "shop_owner_branch_manager",
    label: "Shop Owner / Branch Manager",
    summary: "Full control of their assigned branch.",
    workspaces: ["leads", "shop", "operations"],
    permissions: [
      "create", "edit", "delete", "approve", "assign",
      "manage_customers", "manage_repair_jobs", "manage_inventory", "manage_purchases",
      "manage_sales", "manage_vendors", "transfer_inventory", "assign_technicians",
      "update_repair_status", "use_pos",
      "manage_invoices", "manage_payments", "manage_refunds", "manage_warranties",
      "view_financial_reports", "manage_reports", "export_reports",
      "view_dashboard", "print_documents", "upload_files", "send_communications",
      "manage_settings",
    ],
  },
  {
    id: "reception",
    label: "Reception",
    summary: "Create repair jobs, manage customers, create tickets, and collect payments.",
    workspaces: ["shop", "leads"],
    permissions: [
      "create", "edit", "manage_customers", "manage_repair_jobs",
      "manage_invoices", "manage_payments", "use_pos",
      "print_documents", "upload_files", "send_communications", "view_dashboard",
    ],
  },
  {
    id: "technician",
    label: "Technician",
    summary: "View assigned jobs, update repair status, add notes, and record parts used.",
    workspaces: ["shop"],
    permissions: ["view_only", "update_repair_status", "upload_files", "view_dashboard"],
  },
  {
    id: "senior_technician",
    label: "Senior Technician",
    summary: "Technician responsibilities plus assign jobs and approve repairs.",
    workspaces: ["shop"],
    permissions: [
      "view_only", "update_repair_status", "upload_files", "view_dashboard",
      "assign", "approve", "assign_technicians",
    ],
  },
  {
    id: "inventory_manager",
    label: "Inventory Manager",
    summary: "Manage stock, vendors, purchase orders, and parts transfers.",
    workspaces: ["operations"],
    permissions: [
      "create", "edit", "manage_inventory", "manage_purchases", "manage_vendors",
      "transfer_inventory", "export_reports", "view_dashboard", "print_documents", "upload_files",
    ],
  },
  {
    id: "sales_executive",
    label: "Sales Executive",
    summary: "Manage device sales, accessory sales, and invoicing.",
    workspaces: ["leads", "shop"],
    permissions: [
      "create", "edit", "manage_sales", "manage_invoices", "manage_customers",
      "use_pos", "view_dashboard", "send_communications", "print_documents",
    ],
  },
  {
    id: "cashier_accounts",
    label: "Cashier / Accounts",
    summary: "Manage billing, payments, refunds, and financial reports.",
    workspaces: ["shop"],
    permissions: [
      "view_only", "manage_invoices", "manage_payments", "manage_refunds",
      "view_financial_reports", "export_reports", "use_pos", "print_documents", "view_dashboard",
    ],
  },
  {
    id: "read_only_user",
    label: "Read Only User",
    summary: "View reports, dashboards, and permitted data only.",
    workspaces: ["leads", "shop", "operations"],
    permissions: ["view_only", "view_dashboard", "view_financial_reports"],
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

/* ── Current session (mock) ──────────────────────────────────────────────
   Replace with the backend session payload. Everything above renders
   dynamically off `roleId`, so swapping this is the entire integration. */
export const CURRENT_USER = {
  name: "Kalai S.",
  email: "abc@gmail.com",
  organization: "RepairOX – BTM Layout",
  branch: "BTM Layout (HQ)",
  roleId: "master_shop_owner",
};

export function currentRole(): RoleDef {
  return getRole(CURRENT_USER.roleId) ?? ROLES[ROLES.length - 1];
}

export function currentAllowedWorkspaces(): WorkspaceDef[] {
  return getAllowedWorkspaces(CURRENT_USER.roleId);
}
