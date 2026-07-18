import type { PermissionKey, WorkspaceId } from "@/lib/permissions";

export type TicketStatus =
  | "received"
  | "diagnosis"
  | "repairing"
  | "qc"
  | "completed"
  | "delivered";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  received: "Received",
  diagnosis: "Diagnosis",
  repairing: "Repairing",
  qc: "Quality Check",
  completed: "Completed",
  delivered: "Delivered",
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  received: "bg-info/10 text-info ring-info/20",
  diagnosis: "bg-warning/10 text-amber-700 ring-warning/30",
  repairing: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  qc: "bg-violet-50 text-violet-700 ring-violet-200",
  completed: "bg-success/10 text-emerald-700 ring-success/30",
  delivered: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export type Ticket = {
  id: string;
  customer: string;
  device: string;
  model: string;
  issue: string;
  status: TicketStatus;
  priority: "low" | "med" | "high" | "urgent";
  technician: string;
  createdAt: string;
  amount: number;
};

export const tickets: Ticket[] = [
  { id: "T-1837", customer: "Rahul Kapoor", device: "iPhone", model: "iPhone 16 Pro Max", issue: "Display replacement", status: "diagnosis", priority: "high", technician: "Anand", createdAt: "13/01/2026", amount: 22500 },
  { id: "T-8624", customer: "Manoj S.", device: "iPhone", model: "iPhone 14", issue: "Liquid damage logic board", status: "repairing", priority: "urgent", technician: "Vikas", createdAt: "11/01/2026", amount: 18999 },
  { id: "T-456",  customer: "Ajay Verma", device: "MacBook", model: "MacBook Air M4", issue: "Battery service", status: "qc", priority: "med", technician: "Pooja", createdAt: "13/01/2026", amount: 12999 },
  { id: "T-156",  customer: "Radha Iyer", device: "iWatch", model: "Watch S8 45mm", issue: "Glass replacement", status: "completed", priority: "low", technician: "Shubham", createdAt: "12/01/2026", amount: 6499 },
  { id: "T-911",  customer: "Vikas Nair", device: "iPad", model: "iPad Air 11”", issue: "Touch panel calibration", status: "received", priority: "med", technician: "Anand", createdAt: "14/01/2026", amount: 4999 },
  { id: "T-204",  customer: "Sneha P.", device: "Android", model: "Pixel 9", issue: "Charging port repair", status: "delivered", priority: "low", technician: "Ravi", createdAt: "10/01/2026", amount: 3499 },
  { id: "T-732",  customer: "Imran Khan", device: "iPhone", model: "iPhone 13", issue: "Speaker no audio", status: "repairing", priority: "high", technician: "Pooja", createdAt: "12/01/2026", amount: 2899 },
  { id: "T-621",  customer: "Anjali R.", device: "Windows", model: "Lenovo Yoga 9i", issue: "Hinge replacement", status: "diagnosis", priority: "med", technician: "Shubham", createdAt: "13/01/2026", amount: 8999 },
];

export const revenueMonthly = [
  { m: "Jan", v: 162 }, { m: "Feb", v: 198 }, { m: "Mar", v: 255 },
  { m: "Apr", v: 220 }, { m: "May", v: 245 }, { m: "Jun", v: 240 },
  { m: "Jul", v: 250 }, { m: "Aug", v: 305 }, { m: "Sep", v: 268 },
  { m: "Oct", v: 285 }, { m: "Nov", v: 232 }, { m: "Dec", v: 290 },
];

export const ordersStatus = [
  { detail: "On Site", assigned: 2, received: 2 },
  { detail: "Pick Up", assigned: 2, received: 2 },
  { detail: "Walk-in", assigned: 2, received: 2 },
];

export const todos = [
  { id: 1, title: "Update Anand (Inventory Team)", desc: "Order 16 Pro Max display for Ticket 1837", flag: "info" as const },
  { id: 2, title: "Send Quotation to Ticket 8624", desc: "Replace T2 IC due to liquid damage on the M3", flag: "info" as const },
  { id: 3, title: "Manoj’s iPhone 14", desc: "Overdue since Dec 2025, update customer & attempt delivery", flag: "danger" as const },
  { id: 4, title: "AC Service due", desc: "Take approval from owner & schedule", flag: "warn" as const },
  { id: 5, title: "Office stock audit", desc: "Check Mobile and Laptop stock in office", flag: "warn" as const },
  { id: 6, title: "Accessories refilling", desc: "Tempered glass & latest mobile pouches to be ordered", flag: "warn" as const },
];

/** Nav item shape. `permission` is optional — omit it for pages every role in
 *  the item's workspace should see (general activity/browse views). When
 *  present, the sidebar only renders the item if the active role is granted
 *  at least one of the listed keys (see `Sidebar` / `usePermissions().can`). */
export type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: PermissionKey | PermissionKey[];
};

export const navItems: NavItem[] = [
  // Shop Management
  { href: "/dashboard",        label: "Dashboard",     icon: "Home", permission: "view_dashboard" },
  { href: "/tickets",          label: "Tickets",       icon: "Ticket", permission: ["view_only", "manage_repair_jobs"] },
  { href: "/shop/technicians", label: "Technicians",   icon: "Wrench", permission: ["assign_technicians", "manage_repair_jobs"] },
  { href: "/shop/notes",       label: "Notes",         icon: "FileText", permission: ["upload_files", "manage_repair_jobs"] },
  { href: "/contacts",         label: "Customers",     icon: "Users", permission: "manage_customers" },
  { href: "/invoice",          label: "Invoice",       icon: "FileText", permission: "manage_invoices" },
  { href: "/shop/payments",    label: "Payments",      icon: "Wallet", permission: "manage_payments" },
  { href: "/walk-in",          label: "Walk-In",       icon: "Store", permission: "use_pos" },
  { href: "/buy-back",         label: "Buy-Back",      icon: "Recycle", permission: "manage_sales" },
  { href: "/price-list",       label: "Price List",    icon: "ClipboardList", permission: ["manage_sales", "manage_repair_jobs"] },
  { href: "/expenses",         label: "Expenses",      icon: "Wallet", permission: "manage_payments" },

  // Operations
  { href: "/operations",             label: "Dashboard",       icon: "Home", permission: "view_dashboard" },
  { href: "/stock",                  label: "Stock Levels",    icon: "Boxes", permission: "manage_inventory" },
  { href: "/inventory",              label: "Inventory",       icon: "Package", permission: "manage_inventory" },
  { href: "/operations/vendors",     label: "Vendors",         icon: "Truck", permission: "manage_vendors" },
  { href: "/operations/purchase-orders", label: "Purchase Orders", icon: "ClipboardList", permission: "manage_purchases" },
  { href: "/operations/transfers",   label: "Parts Transfers", icon: "Recycle", permission: "transfer_inventory" },
  { href: "/operations/products",    label: "Product Items",   icon: "Package", permission: "manage_inventory" },

  // Leads
  { href: "/lead-management",  label: "Dashboard",    icon: "Home", permission: "view_dashboard" },
  { href: "/leads/list",       label: "Leads",        icon: "Users", permission: "manage_sales" },
  { href: "/leads/kanban",     label: "Kanban",       icon: "ClipboardList", permission: "manage_sales" },
  { href: "/leads/contacts",   label: "Contacts",     icon: "BookUser", permission: "manage_customers" },
  { href: "/leads/companies",  label: "Companies",    icon: "Store", permission: "manage_customers" },
  { href: "/leads/deals",      label: "Deals",        icon: "ClipboardList", permission: "manage_sales" },
  { href: "/leads/quotations", label: "Quotations",   icon: "FileText", permission: "manage_sales" },
  { href: "/leads/inbox",      label: "Inbox",        icon: "Boxes", permission: "send_communications" },
  { href: "/leads/tasks",      label: "Tasks",        icon: "Ticket" },
  { href: "/leads/meetings",   label: "Meetings",     icon: "BookUser" },
  { href: "/leads/activities", label: "Activities",   icon: "BarChart3" },
  { href: "/leads/calls",      label: "Calls",        icon: "Boxes", permission: "send_communications" },
  { href: "/leads/email",      label: "Email",        icon: "FileText", permission: "send_communications" },
  { href: "/leads/whatsapp",   label: "WhatsApp",     icon: "BookUser", permission: "send_communications" },
  { href: "/leads/smart-lists", label: "Smart Lists", icon: "ClipboardList" },
  { href: "/leads/map-view",   label: "Map View",     icon: "Map" },
  { href: "/leads/reports",    label: "Reports",      icon: "BarChart3", permission: ["manage_reports", "view_financial_reports"] },
  { href: "/leads/report-builder", label: "Report Builder", icon: "BarChart3", permission: "manage_reports" },
  { href: "/leads/campaigns", label: "Campaigns",    icon: "Boxes", permission: "manage_sales" },
  { href: "/leads/settings",   label: "Settings",     icon: "Settings", permission: "manage_settings" },

  // Shared / general (present in every workspace)
  { href: "/reports",          label: "Reports",      icon: "BarChart3", permission: ["manage_reports", "view_financial_reports"] },
  { href: "/settings",         label: "Settings",     icon: "Settings", permission: "manage_settings" },
];

/** Team member — who has a RepairOX login, their assigned role, branch and
 *  status. Lives here (not in a page) because role deletion/reassignment in
 *  the Permissions context needs to know who's currently using a role. */
export type TeamMember = {
  name: string;
  email: string;
  roleId: string;
  branch: string;
  status: "active" | "invited" | "suspended";
};

export const TEAM_SEED: TeamMember[] = [
  { name: "Kalai S.",      email: "abc@gmail.com",           roleId: "master_shop_owner",       branch: "BTM Layout (HQ)", status: "active" },
  { name: "Ritesh Kumar",  email: "ritesh@repairox.in",       roleId: "shop_owner_branch_manager", branch: "Koramangala",     status: "active" },
  { name: "Anjali R.",     email: "anjali@repairox.in",       roleId: "reception",               branch: "BTM Layout (HQ)", status: "active" },
  { name: "Anand Rao",     email: "anand@repairox.in",        roleId: "senior_technician",       branch: "BTM Layout (HQ)", status: "active" },
  { name: "Pooja Iyer",    email: "pooja@repairox.in",        roleId: "technician",              branch: "Koramangala",     status: "active" },
  { name: "Vikas Nair",    email: "vikas@repairox.in",        roleId: "inventory_manager",       branch: "Warehouse A",     status: "active" },
  { name: "Manoj S.",      email: "manoj@repairox.in",        roleId: "sales_executive",         branch: "HSR Layout",      status: "invited" },
  { name: "Radha Iyer",    email: "radha@repairox.in",        roleId: "cashier_accounts",        branch: "BTM Layout (HQ)", status: "active" },
  { name: "Imran Khan",    email: "imran@repairox.in",        roleId: "read_only_user",          branch: "HSR Layout",      status: "suspended" },
];

export const navGroups: Record<WorkspaceId, { label: string; items: string[] }[]> = {
  shop: [
    { label: "MODULE",     items: ["/dashboard", "/tickets", "/invoice", "/walk-in", "/buy-back", "/price-list"] },
    { label: "MANAGE",     items: ["/shop/technicians", "/shop/notes", "/contacts"] },
    { label: "INVENTORY",  items: ["/inventory"] },
    { label: "BILLING",    items: ["/shop/payments", "/expenses"] },
    { label: "GENERAL",    items: ["/reports", "/settings"] },
  ],
  operations: [
    { label: "MODULE",     items: ["/operations", "/stock"] },
    { label: "PURCHASING", items: ["/operations/vendors", "/operations/purchase-orders", "/operations/transfers", "/operations/products"] },
    { label: "GENERAL",    items: ["/reports", "/settings"] },
  ],
  leads: [
    { label: "PIPELINE",       items: ["/lead-management", "/leads/list", "/leads/kanban", "/leads/contacts", "/leads/companies"] },
    { label: "DEALS",          items: ["/leads/deals", "/leads/quotations"] },
    { label: "COMMUNICATE",    items: ["/leads/inbox", "/leads/tasks", "/leads/meetings", "/leads/activities", "/leads/calls", "/leads/email", "/leads/whatsapp"] },
    { label: "VIEWS",          items: ["/leads/smart-lists", "/leads/map-view", "/leads/reports", "/leads/report-builder", "/leads/campaigns"] },
    { label: "GENERAL",        items: ["/leads/settings"] },
  ],
};
