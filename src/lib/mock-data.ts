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

export type TicketPriority = "normal" | "high" | "critical";

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  normal: "Normal",
  high: "High Priority",
  critical: "Critical",
};

export const PRIORITY_TONE: Record<TicketPriority, string> = {
  normal: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  high: "bg-amber-50 text-amber-700 ring-amber-200",
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
};

export type TicketItem = {
  device: string;
  model: string;
  serial?: string;
  issue: string;
  service?: string;
};

export type TicketPartStatus = "planned" | "used";

export type TicketPart = {
  inventoryId: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  total: number;
  uom: string;
  status: TicketPartStatus;
};

export type Ticket = {
  id: string;
  customer: string;
  phone: string;
  company?: string;
  device: string;
  model: string;
  issue: string;
  items?: TicketItem[];
  parts?: TicketPart[];
  status: TicketStatus;
  priority: TicketPriority;
  technician: string;
  createdAt: string;
  dueDate?: string;
  resolutionMinutes?: number;
  amount: number;
  service?: string;
  internalNotes?: string;
  email?: string;
  address?: string;
  source?: string;
  discount?: number;
  imeiType?: "imei1" | "imei2" | "serial";
  qcStatus?: "pending" | "pass" | "fail";
};

/** Helper: generate a createdAt timestamp N minutes ago from now */
function minsAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

export const tickets: Ticket[] = [
  { id: "T-1837", customer: "Rahul Kapoor", phone: "+91 98456 12345", company: "Kapoor Electronics", device: "iPhone", model: "iPhone 16 Pro Max", issue: "Display replacement", status: "diagnosis", priority: "high", technician: "Anand", createdAt: minsAgo(120), dueDate: "2026-07-22T14:00:00", resolutionMinutes: 120, amount: 22500, service: "Screen Repair" },
  { id: "T-8624", customer: "Manoj S.", phone: "+91 90876 54321", device: "iPhone", model: "iPhone 14", issue: "Liquid damage logic board", status: "repairing", priority: "critical", technician: "Vikas", createdAt: minsAgo(55), dueDate: "2026-07-23T10:00:00", resolutionMinutes: 240, amount: 18999, service: "Board Repair" },
  { id: "T-456", customer: "Ajay Verma", phone: "+91 87654 32100", company: "Verma & Sons", device: "MacBook", model: "MacBook Air M4", issue: "Battery service", status: "qc", priority: "normal", technician: "Pooja", createdAt: minsAgo(30), dueDate: "2026-07-22T17:00:00", resolutionMinutes: 59, amount: 12999, service: "Battery Replacement" },
  { id: "T-156", customer: "Radha Iyer", phone: "+91 76543 21098", device: "iWatch", model: "Watch S8 45mm", issue: "Glass replacement", status: "completed", priority: "normal", technician: "Shubham", createdAt: minsAgo(10), amount: 6499, service: "Glass Repair" },
  {
    id: "T-7335", customer: "Ravindu Toyota", phone: "+91 99000 56190", company: "iFix India - Koramangala", device: "iPad", model: "iPad Air 2", issue: "Battery bulged, display broken",
    items: [
      { device: "iPad", model: "iPad Air 2", serial: "DMPRT5EKG5VT", issue: "Battery bulged, display broken", service: "Battery + Screen" },
      { device: "iPad", model: "iPad Air 2", serial: "DMPRT4UF05VT", issue: "Battery bulged", service: "Battery Replacement" },
      { device: "iPad", model: "iPad Air 2", serial: "DMPRQ2AYG5VT", issue: "Battery bulged", service: "Battery Replacement" },
      { device: "iPad", model: "iPad Air 2", serial: "DMPRT5K1G5VT", issue: "Battery bulged, display broken", service: "Battery + Screen" },
    ],
    status: "repairing", priority: "critical", technician: "Anand", createdAt: minsAgo(90), dueDate: "2026-07-22T19:00:00", amount: 20000, service: "Bulk Repair"
  },
  { id: "T-911", customer: "Vikas Nair", phone: "+91 65432 10987", company: "NairTech Solutions", device: "iPad", model: "iPad Air 11\u2033", issue: "Touch panel calibration", status: "received", priority: "normal", technician: "Anand", createdAt: minsAgo(45), dueDate: "2026-07-24T12:00:00", amount: 4999, service: "Calibration" },
  { id: "T-204", customer: "Sneha P.", phone: "+91 54321 09876", device: "Android", model: "Pixel 9", issue: "Charging port repair", status: "delivered", priority: "normal", technician: "Ravi", createdAt: minsAgo(5), amount: 3499, service: "Port Repair" },
  { id: "T-732", customer: "Imran Khan", phone: "+91 43210 98765", company: "Khan Mobile Hub", device: "iPhone", model: "iPhone 13", issue: "Speaker no audio", status: "repairing", priority: "high", technician: "Pooja", createdAt: minsAgo(90), dueDate: "2026-07-22T18:00:00", amount: 2899, service: "Speaker Repair" },
  {
    id: "T-621", customer: "Anjali R.", phone: "+91 32109 87654", device: "Windows", model: "Lenovo Yoga 9i", issue: "Hinge replacement",
    items: [
      { device: "Windows", model: "Lenovo Yoga 9i", serial: "PF4KXYZ1", issue: "Hinge replacement", service: "Hardware Repair" },
      { device: "Windows", model: "Lenovo IdeaPad 5", serial: "PF4KABC2", issue: "Keyboard not working", service: "Keyboard Replacement" },
    ],
    status: "diagnosis", priority: "normal", technician: "Shubham", createdAt: minsAgo(42), dueDate: "2026-07-25T11:00:00", amount: 14999, service: "Hardware Repair"
  },
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
  { id: 3, title: "Manoj's iPhone 14", desc: "Overdue since Dec 2025, update customer & attempt delivery", flag: "danger" as const },
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

/* ─── Invoice Types & Seed Data ──────────────────────────────────────── */

export type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  partial: "Partial",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  sent: "bg-info/10 text-info ring-info/20",
  paid: "bg-success/10 text-emerald-700 ring-success/30",
  partial: "bg-warning/10 text-amber-700 ring-warning/30",
  overdue: "bg-rose-50 text-rose-700 ring-rose-200",
  cancelled: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

/** Muted text color for Invoice ID based on status */
export const INVOICE_ID_COLOR: Record<InvoiceStatus, string> = {
  draft: "text-zinc-500",
  sent: "text-amber-600",
  paid: "text-emerald-600",
  partial: "text-blue-600",
  overdue: "text-orange-600",
  cancelled: "text-rose-500",
};

export type InvoiceLineItem = {
  id: string;
  sku?: string;
  name: string;
  description?: string;
  qty: number;
  price: number;
  taxClass?: string;
  discount: number;
  total: number;
};

export type InvoiceType = "retail" | "business";

export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  retail: "Retail Invoice",
  business: "Business Invoice",
};

export type Invoice = {
  id: string;
  reference: string;
  invoiceType: InvoiceType;
  customer: string;
  phone: string;
  email?: string;
  company?: string;
  status: InvoiceStatus;
  createdAt: string;
  dueDate: string;
  paidAmount: number;
  items: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes?: string;
  terms?: string;
  slogan?: string;
  footer?: string;
  employee?: string;
  ticketId?: string;
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const invoices: Invoice[] = [
  {
    id: "INV001", reference: "CORP-1753", invoiceType: "retail", customer: "Rahul Kapoor", phone: "+91 98456 12345", email: "rahul@kapoor.in", company: "Kapoor Electronics",
    status: "paid", createdAt: daysAgo(5), dueDate: daysAgo(-2), paidAmount: 22500,
    items: [
      { id: "li-1", sku: "SCR-IPH16", name: "iPhone 16 Pro Max Display", description: "OLED original assembly", qty: 1, price: 18500, discount: 0, total: 18500 },
      { id: "li-2", name: "Labour & Diagnostics", qty: 1, price: 2500, discount: 0, total: 2500 },
      { id: "li-3", name: "Tempered Glass", qty: 1, price: 1500, discount: 0, total: 1500 },
    ],
    subtotal: 22500, discount: 0, tax: 0, total: 22500, notes: "Display replaced under warranty extension.", terms: "Limited Warranty\nWe stand behind our repair services.", footer: "THANK YOU FOR CHOOSING FIX IND", employee: "Anjali R.", ticketId: "T-1837"
  },
  {
    id: "INVG001", reference: "CORP-1754", invoiceType: "business", customer: "Manoj S.", phone: "+91 90876 54321", email: "manoj@repairox.in",
    status: "sent", createdAt: daysAgo(2), dueDate: daysAgo(-5), paidAmount: 0,
    items: [
      { id: "li-4", sku: "BRD-IPH14", name: "iPhone 14 Logic Board Repair", description: "Liquid damage micro-soldering", qty: 1, price: 15000, discount: 500, total: 14500 },
      { id: "li-5", name: "Ultrasonic Cleaning", qty: 1, price: 2999, discount: 0, total: 2999 },
      { id: "li-6", name: "Waterproof Sealing", qty: 1, price: 1500, discount: 0, total: 1500 },
    ],
    subtotal: 18999, discount: 500, tax: 3418, total: 21917, notes: "Board level repair completed.", terms: "Limited Warranty", footer: "THANK YOU FOR CHOOSING FIX IND", employee: "Vikas", ticketId: "T-8624"
  },
  {
    id: "INV002", reference: "CORP-1755", invoiceType: "retail", customer: "Ajay Verma", phone: "+91 87654 32100", company: "Verma & Sons",
    status: "partial", createdAt: daysAgo(7), dueDate: daysAgo(-1), paidAmount: 7000,
    items: [
      { id: "li-7", sku: "BAT-MBA4", name: "MacBook Air M4 Battery", description: "Original Apple replacement cell", qty: 1, price: 9999, discount: 0, total: 9999 },
      { id: "li-8", name: "Installation & Testing", qty: 1, price: 3000, discount: 0, total: 3000 },
    ],
    subtotal: 12999, discount: 0, tax: 2340, total: 15339, notes: "Customer paid advance. Balance on pickup.", employee: "Pooja", ticketId: "T-456"
  },
  {
    id: "INV003", reference: "CORP-1756", invoiceType: "retail", customer: "Sneha P.", phone: "+91 54321 09876",
    status: "draft", createdAt: daysAgo(0), dueDate: daysAgo(-7), paidAmount: 0,
    items: [
      { id: "li-9", name: "Charging Port Assembly", qty: 1, price: 2499, discount: 0, total: 2499 },
      { id: "li-10", name: "Labour", qty: 1, price: 1000, discount: 0, total: 1000 },
    ],
    subtotal: 3499, discount: 0, tax: 630, total: 4129, employee: "Ravi", ticketId: "T-204"
  },
  {
    id: "INVG002", reference: "CORP-1757", invoiceType: "business", customer: "Imran Khan", phone: "+91 43210 98765", company: "Khan Mobile Hub",
    status: "overdue", createdAt: daysAgo(14), dueDate: daysAgo(4), paidAmount: 0,
    items: [
      { id: "li-11", name: "Speaker Module (iPhone 13)", qty: 1, price: 1899, discount: 0, total: 1899 },
      { id: "li-12", name: "Labour", qty: 1, price: 1000, discount: 0, total: 1000 },
    ],
    subtotal: 2899, discount: 0, tax: 522, total: 3421, notes: "Customer not reachable. Follow up required.", employee: "Pooja", ticketId: "T-732"
  },
];

/* ─── Walk-In Types & Seed Data ──────────────────────────────────────── */

export type WalkInStatus = "waiting" | "inspection" | "quotation_given" | "converted_ticket" | "converted_invoice" | "closed" | "lost" | "follow_up";

export const WALKIN_STATUS_LABEL: Record<WalkInStatus, string> = {
  waiting: "Waiting", inspection: "Inspection", quotation_given: "Quotation Given",
  converted_ticket: "Converted to Ticket", converted_invoice: "Converted to Invoice",
  closed: "Closed", lost: "Lost Customer", follow_up: "Follow-Up Required",
};

export const WALKIN_STATUS_TONE: Record<WalkInStatus, string> = {
  waiting: "bg-amber-50 text-amber-700 ring-amber-200",
  inspection: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  quotation_given: "bg-violet-50 text-violet-700 ring-violet-200",
  converted_ticket: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  converted_invoice: "bg-sky-50 text-sky-700 ring-sky-200",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  lost: "bg-rose-50 text-rose-600 ring-rose-200",
  follow_up: "bg-orange-50 text-orange-700 ring-orange-200",
};

export type WalkIn = {
  id: string;
  date: string;
  time: string;
  customer: string;
  phone: string;
  source: string;
  category: string;
  model: string;
  reasons: string[];
  status: WalkInStatus;
  ticketId?: string;
  invoiceValue: number;
  businessValue: number;
  notes?: string;
};

export const walkIns: WalkIn[] = [
  { id: "WI-001", date: "2026-07-21", time: "09:15", customer: "Rahul Kapoor", phone: "+91 98456 12345", source: "Walk-In", category: "Mobile", model: "iPhone 16 Pro Max", reasons: ["Repair", "Screen Damage"], status: "converted_ticket", ticketId: "T-1837", invoiceValue: 22500, businessValue: 22500 },
  { id: "WI-002", date: "2026-07-21", time: "09:45", customer: "Priya Sharma", phone: "+91 87654 99887", source: "Google", category: "Laptop", model: "MacBook Air M4", reasons: ["Battery Issue"], status: "waiting", invoiceValue: 0, businessValue: 0 },
  { id: "WI-003", date: "2026-07-21", time: "10:10", customer: "Manoj S.", phone: "+91 90876 54321", source: "Existing Customer", category: "Mobile", model: "iPhone 14", reasons: ["Water Damage", "Repair"], status: "inspection", invoiceValue: 0, businessValue: 0 },
  { id: "WI-004", date: "2026-07-21", time: "10:30", customer: "Deepika R.", phone: "+91 77665 44332", source: "Instagram", category: "Mobile", model: "Samsung Galaxy S25", reasons: ["Quotation"], status: "quotation_given", invoiceValue: 0, businessValue: 0 },
  { id: "WI-005", date: "2026-07-21", time: "11:00", customer: "Vikas Nair", phone: "+91 65432 10987", source: "Walk-In", category: "Smart Watch", model: "Apple Watch S9", reasons: ["Accessory Purchase"], status: "converted_invoice", invoiceValue: 1499, businessValue: 1499 },
  { id: "WI-006", date: "2026-07-21", time: "11:20", customer: "Sneha P.", phone: "+91 54321 09876", source: "Reference", category: "Mobile", model: "Pixel 9", reasons: ["General Enquiry"], status: "closed", invoiceValue: 0, businessValue: 0 },
  { id: "WI-007", date: "2026-07-21", time: "11:45", customer: "Amit Joshi", phone: "+91 99887 76655", source: "WhatsApp", category: "Tablet", model: "iPad Air 11", reasons: ["Data Recovery"], status: "follow_up", invoiceValue: 0, businessValue: 0 },
  { id: "WI-008", date: "2026-07-21", time: "12:15", customer: "Unknown", phone: "+91 88776 65544", source: "Walk-In", category: "Mobile", model: "OnePlus 13", reasons: ["Screen Damage"], status: "lost", invoiceValue: 0, businessValue: 0 },
];

export const navGroups: Record<WorkspaceId, { label: string; items: string[] }[]> = {
  shop: [
    { label: "MODULE",     items: ["/dashboard", "/tickets", "/invoice", "/walk-in", "/price-list"] },
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
