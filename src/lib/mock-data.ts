import type { PermissionKey, WorkspaceId } from "@/lib/permissions";
import { hashPassword, DEFAULT_SEED_PASSWORD, type SalaryType } from "@/lib/auth";

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

/* ─── Multi-Device Support ────────────────────────────────────────── */

export type DeviceRecord = {
  id: string;
  /** Device identity */
  brand: string;
  model: string;
  imei: string;
  imeiType: "imei1" | "imei2" | "serial";
  category: string;
  type: string;
  /** Intake / assignment */
  source: string;
  assignedBy: string;
  assignedTo: string;
  /** Job details */
  issue: string;
  description: string;
  jobType: string;
  priority: TicketPriority;
  warranty: string;
  resolutionMinutes: number;
  accessories: string;
  notes: string;
  estimate: number;
  /** Parts assigned to this device */
  parts: TicketPart[];
  /** QC results for this device */
  qc: Record<string, "ok" | "no" | "na" | undefined>;
  /** Status tracking per device */
  status: TicketStatus;
};

/** Helper: create a blank DeviceRecord with defaults */
export function createDeviceRecord(overrides?: Partial<DeviceRecord>): DeviceRecord {
  return {
    id: `DEV-${Math.floor(1000 + Math.random() * 9000)}`,
    brand: "",
    model: "",
    imei: "",
    imeiType: "imei1",
    category: "",
    type: "",
    source: "",
    assignedBy: "",
    assignedTo: "",
    issue: "",
    description: "",
    jobType: "service",
    priority: "normal",
    warranty: "",
    resolutionMinutes: 59,
    accessories: "",
    notes: "",
    estimate: 0,
    parts: [],
    qc: {},
    status: "received",
    ...overrides,
  };
}

/**
 * Unified accessor: returns DeviceRecord[] for any ticket.
 * If the ticket has devices[], returns those.
 * Otherwise, synthesizes a single DeviceRecord from legacy flat fields.
 */
export function getTicketDevices(ticket: Ticket): DeviceRecord[] {
  if (ticket.devices && ticket.devices.length > 0) {
    return ticket.devices;
  }
  // Legacy single-device ticket — synthesize one DeviceRecord
  return [
    createDeviceRecord({
      id: `DEV-legacy-${ticket.id}`,
      brand: ticket.device || "",
      model: ticket.model || "",
      imei: ticket.items?.[0]?.serial || "",
      imeiType: ticket.imeiType || "imei1",
      category: ticket.device || "",
      source: ticket.source || "",
      assignedTo: ticket.technician || "",
      issue: ticket.issue || "",
      description: ticket.issue || "",
      priority: ticket.priority || "normal",
      resolutionMinutes: ticket.resolutionMinutes || 59,
      notes: ticket.internalNotes || "",
      estimate: ticket.amount || 0,
      parts: ticket.parts || [],
      status: ticket.status,
    }),
  ];
}

/**
 * Derive overall ticket status from device statuses.
 * Rules:
 * - If all devices are "delivered" → delivered
 * - If all devices are "completed" or "delivered" → completed
 * - If any device is "repairing" → repairing
 * - If any device is "qc" → qc
 * - If any device is "diagnosis" → diagnosis
 * - Otherwise → received
 */
export function deriveTicketStatus(devices: DeviceRecord[]): TicketStatus {
  if (devices.length === 0) return "received";
  const statuses = devices.map((d) => d.status);
  if (statuses.every((s) => s === "delivered")) return "delivered";
  if (statuses.every((s) => s === "completed" || s === "delivered")) return "completed";
  if (statuses.some((s) => s === "qc")) return "qc";
  if (statuses.some((s) => s === "repairing")) return "repairing";
  if (statuses.some((s) => s === "diagnosis")) return "diagnosis";
  return "received";
}

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
  customerId?: string;
  /** Multi-device support — when present, each device has its own record */
  devices?: DeviceRecord[];
};

/** Helper: generate a createdAt timestamp N minutes ago from now */
function minsAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

// Real data lives in Supabase — see store.tsx cloud sync. No demo seeds.
export const tickets: Ticket[] = [];
export const revenueMonthly: { m: string; v: number }[] = [];
export const ordersStatus: { detail: string; assigned: number; received: number }[] = [];
export const todos: { id: number; title: string; desc: string; flag: "info" | "danger" | "warn" }[] = [];

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

/** Expandable nav group — a parent item that collapses/expands to reveal children.
 *  Used for Administration sections like Employees and Accounts. */
export type ExpandableNavGroup = {
  id: string;
  label: string;
  icon: string;
  permission?: PermissionKey | PermissionKey[];
  children: NavItem[];
};

export const navItems: NavItem[] = [
  // Shop Management
  { href: "/dashboard",        label: "Dashboard",     icon: "Home", permission: "view_dashboard" },
  { href: "/tickets",          label: "Tickets",       icon: "Ticket", permission: ["view_only", "manage_repair_jobs"] },
  { href: "/shop/technicians", label: "Employees",     icon: "Users", permission: ["assign_technicians", "manage_repair_jobs"] },
  { href: "/shop/notes",       label: "Notes",         icon: "FileText", permission: ["upload_files", "manage_repair_jobs"] },
  { href: "/contacts",         label: "Accounts",      icon: "BookUser", permission: "manage_customers" },
  { href: "/invoice",          label: "Invoice",       icon: "FileText", permission: "manage_invoices" },
  { href: "/shop/payments",    label: "Payments",      icon: "Wallet", permission: "manage_payments" },
  { href: "/walk-in",          label: "Walk-In",       icon: "Store", permission: "use_pos" },
  { href: "/price-list",       label: "Price List",    icon: "ClipboardList", permission: ["manage_sales", "manage_repair_jobs"] },
  { href: "/expenses",         label: "Expenses",      icon: "IndianRupee", permission: "manage_payments" },

  // Employee sub-pages
  { href: "/employees/directory",      label: "Employee Directory", icon: "Users", permission: ["manage_users", "assign_technicians"] },
  { href: "/employees/payroll",        label: "Payroll & Salary",   icon: "Banknote", permission: "manage_payments" },
  { href: "/employees/salary-advances", label: "Salary Advances",  icon: "WalletCards", permission: "manage_payments" },

  // Administration — single entry point for all employee access / role management
  { href: "/roles-permissions",        label: "Roles & Permissions", icon: "ShieldCheck", permission: ["manage_roles", "manage_users"] },

  // Accounts sub-pages
  { href: "/accounts/ledger",          label: "Daily Ledger",        icon: "BookOpen", permission: "view_financial_reports" },
  { href: "/accounts/banking",         label: "Banking & Transfers", icon: "Landmark", permission: "manage_payments" },
  { href: "/accounts/management",      label: "Account Management",  icon: "FolderTree", permission: "manage_payments" },

  // Operations
  { href: "/operations",             label: "Dashboard",       icon: "Home", permission: "view_dashboard" },
  { href: "/stock",                  label: "Stock Levels",    icon: "Boxes", permission: "manage_inventory" },
  { href: "/inventory",              label: "Inventory",       icon: "Package", permission: "manage_inventory" },
  { href: "/operations/vendors",     label: "Vendors",         icon: "Truck", permission: "manage_vendors" },
  { href: "/operations/purchase-orders", label: "Purchase Orders", icon: "ClipboardList", permission: "manage_purchases" },
  { href: "/operations/transfers",   label: "Parts Transfers", icon: "Recycle", permission: "transfer_inventory" },
  { href: "/operations/products",    label: "Product Items",   icon: "Package", permission: "manage_inventory" },
  { href: "/operations/reports",    label: "Reports",         icon: "BarChart3", permission: ["manage_reports", "view_financial_reports"] },

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
  { href: "/leads/reports",    label: "Reports",      icon: "BarChart3", permission: ["manage_reports", "view_sales_reports", "view_financial_reports"] },
  { href: "/leads/campaigns", label: "Campaigns",    icon: "Boxes", permission: "manage_sales" },
  { href: "/leads/settings",   label: "Settings",     icon: "Settings", permission: "manage_settings" },

  // Shared / general (present in every workspace)
  { href: "/activity",         label: "Activity Log", icon: "Activity", permission: "view_audit_logs" },
  { href: "/reports",          label: "Reports",      icon: "BarChart3", permission: ["manage_reports", "view_financial_reports"] },
  { href: "/settings",         label: "Settings",     icon: "Settings", permission: "manage_settings" },
];

/** Expandable navigation groups for the Administration section */
export const expandableNavGroups: Record<WorkspaceId, ExpandableNavGroup[]> = {
  shop: [
    {
      id: "employees",
      label: "Employees",
      icon: "UsersRound",
      permission: ["manage_users", "assign_technicians", "manage_roles"],
      children: [
        { href: "/employees/directory",      label: "Employee Directory", icon: "Users", permission: ["manage_users", "assign_technicians"] },
        { href: "/employees/payroll",        label: "Payroll & Salary",   icon: "Banknote", permission: "manage_payments" },
        { href: "/employees/salary-advances", label: "Salary Advances",  icon: "WalletCards", permission: "manage_payments" },
      ],
    },
    {
      id: "accounts",
      label: "Accounts",
      icon: "BookOpen",
      permission: ["manage_payments", "view_financial_reports"],
      children: [
        { href: "/accounts/ledger",          label: "Daily Ledger",        icon: "BookOpen", permission: "view_financial_reports" },
        { href: "/accounts/banking",         label: "Banking & Transfers", icon: "Landmark", permission: "manage_payments" },
        { href: "/accounts/management",      label: "Account Management",  icon: "FolderTree", permission: "manage_payments" },
      ],
    },
  ],
  operations: [],
  leads: [],
};

export type StaffStatus = "active" | "invited" | "suspended";

/** Staff member — the unified record that links an employee's HR profile,
 *  their RepairOX login (auth account) and their compensation. A single
 *  source of truth consumed by:
 *    • Roles & Permissions → Users tab (who can log in, their role/branch)
 *    • Employee Directory (HR profile, salary)
 *    • Payroll (base salary per person)
 *    • The permission context (who's using a role — for reassignment/deletes)
 *    • Login (email + passwordHash + loginEnabled + status)
 *
 *  Kept here (not in a page) because the permission context owns the live,
 *  persisted list. `TeamMember` is retained as the type name for backward
 *  compatibility with existing consumers. */
export type TeamMember = {
  /** Stable employee id (also used as the password salt). */
  id: string;
  name: string;
  email: string;
  phone?: string;
  /** Profile picture — a data URL (self-uploaded) or a storage URL. */
  avatarUrl?: string;
  roleId: string;
  branch: string;
  status: StaffStatus;

  /* ── Auth account ── */
  /** Whether this staff member has login credentials at all. */
  loginEnabled: boolean;
  /** Salted hash of the password (see lib/auth.ts). Absent when no login. */
  passwordHash?: string;

  /* ── HR profile ── */
  department?: string;
  designation?: string;
  joiningDate?: string;

  /* ── Compensation ── */
  salaryType?: SalaryType;
  salaryAmount?: number;

  /* ── Audit ── */
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
};

/** Build a seeded staff account with a known default password so the demo is
 *  immediately usable. Real accounts are created through the Add Staff form. */
function seedStaff(m: Omit<TeamMember, "loginEnabled" | "passwordHash" | "createdAt"> & { loginEnabled?: boolean }): TeamMember {
  const loginEnabled = m.loginEnabled ?? m.status === "active";
  return {
    ...m,
    loginEnabled,
    passwordHash: loginEnabled ? hashPassword(DEFAULT_SEED_PASSWORD, m.id) : undefined,
    createdAt: m.joiningDate ? new Date(m.joiningDate).toISOString() : new Date().toISOString(),
    createdBy: "System",
  };
}

// The platform owner is always seeded so they can log in immediately.
export const TEAM_SEED: TeamMember[] = [
  seedStaff({
    id: "EMP-001",
    name: "Sharath K.",
    email: "ksharath2003@gmail.com",
    phone: "",
    roleId: "platform_owner",
    branch: "BTM Layout (HQ)",
    status: "active",
    department: "Management",
    designation: "Platform Owner",
    joiningDate: "2024-01-01",
  }),
];

// Override the platform owner's password hash to use the custom password
// instead of DEFAULT_SEED_PASSWORD.
TEAM_SEED[0].passwordHash = hashPassword("creator123", "EMP-001");

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

/* ─── Invoice Multi-Device Support ───────────────────────────────────── */

/**
 * An invoice device record — mirrors the Ticket DeviceRecord structure
 * so that multi-device invoices preserve per-device details.
 */
export type InvoiceDeviceRecord = {
  id: string;
  /** Device identity */
  brand: string;
  model: string;
  imei: string;
  imeiType: "imei1" | "imei2" | "serial";
  /** Job details */
  issue: string;
  description: string;
  jobType: string;
  priority: string;
  warranty: string;
  /** Assignment */
  technician: string;
  /** Parts assigned to this device */
  parts: InvoiceLineItem[];
  /** Notes specific to this device */
  notes: string;
  /** Device-level subtotal (sum of parts totals) */
  subtotal: number;
};

/** Helper: create a blank InvoiceDeviceRecord */
export function createInvoiceDeviceRecord(overrides?: Partial<InvoiceDeviceRecord>): InvoiceDeviceRecord {
  return {
    id: `IDEV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    brand: "",
    model: "",
    imei: "",
    imeiType: "imei1",
    issue: "",
    description: "",
    jobType: "service",
    priority: "normal",
    warranty: "",
    technician: "",
    parts: [],
    notes: "",
    subtotal: 0,
    ...overrides,
  };
}

/**
 * Convert a Ticket DeviceRecord to an InvoiceDeviceRecord,
 * mapping parts from TicketPart to InvoiceLineItem.
 */
export function ticketDeviceToInvoiceDevice(dev: DeviceRecord): InvoiceDeviceRecord {
  const parts: InvoiceLineItem[] = dev.parts.map((p, i) => ({
    id: `li-${dev.id}-${i}`,
    sku: p.sku,
    name: p.name,
    description: "",
    qty: p.qty,
    price: p.unitPrice,
    discount: 0,
    total: p.total,
  }));

  // If device has estimate exceeding parts total, add a service/labour line
  const partsTotal = parts.reduce((s, p) => s + p.total, 0);
  const labourAmount = dev.estimate - partsTotal;
  if (labourAmount > 0 || parts.length === 0) {
    parts.push({
      id: `li-${dev.id}-labour`,
      name: dev.issue || "Repair Service",
      description: [dev.brand, dev.model].filter(Boolean).join(" "),
      qty: 1,
      price: Math.max(labourAmount, dev.estimate || 0),
      discount: 0,
      total: Math.max(labourAmount, dev.estimate || 0),
    });
  }

  const subtotal = parts.reduce((s, p) => s + p.total, 0);

  return {
    id: `IDEV-${dev.id}`,
    brand: dev.brand,
    model: dev.model,
    imei: dev.imei,
    imeiType: dev.imeiType,
    issue: dev.issue || dev.description,
    description: dev.description,
    jobType: dev.jobType,
    priority: dev.priority,
    warranty: dev.warranty,
    technician: dev.assignedTo,
    parts,
    notes: dev.notes,
    subtotal,
  };
}

/**
 * Unified accessor: returns InvoiceDeviceRecord[] for any invoice.
 * If the invoice has devices[], returns those.
 * Otherwise, synthesizes a single device from the flat items list.
 */
export function getInvoiceDevices(invoice: Invoice): InvoiceDeviceRecord[] {
  if (invoice.devices && invoice.devices.length > 0) {
    return invoice.devices;
  }
  // Legacy flat invoice — wrap items into a single device record
  return [
    createInvoiceDeviceRecord({
      id: `IDEV-legacy-${invoice.id}`,
      issue: "Service",
      technician: invoice.employee || "",
      parts: invoice.items,
      subtotal: invoice.subtotal,
    }),
  ];
}

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
  /** Flat line items — kept for backward compatibility with legacy invoices */
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
  /** Mode of payment (cash, upi, card, etc.) */
  paymentMode?: string;
  /** Service category — "service" or "accessories" */
  serviceCategory?: "service" | "accessories";
  /** Multi-device support — when present, each device has its own parts/job/technician */
  devices?: InvoiceDeviceRecord[];
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const invoices: Invoice[] = [];

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

export const walkIns: WalkIn[] = [];

export const navGroups: Record<WorkspaceId, { label: string; items: string[] }[]> = {
  shop: [
    { label: "MODULE",         items: ["/dashboard", "/tickets", "/invoice", "/walk-in", "/price-list"] },
    { label: "INVENTORY",      items: ["/inventory"] },
    // Expenses remains standalone for daily operational quick-access.
    // Employees and Accounts are now expandable groups rendered separately.
    // Roles & Permissions is the single, dedicated access-control workspace.
    { label: "ADMINISTRATION", items: ["/expenses", "/roles-permissions"] },
    { label: "BILLING",        items: ["/shop/payments"] },
    { label: "GENERAL",        items: ["/activity", "/reports", "/settings"] },
  ],
  operations: [
    { label: "MODULE",     items: ["/operations", "/stock"] },
    { label: "PURCHASING", items: ["/operations/vendors", "/operations/purchase-orders", "/operations/transfers", "/operations/products"] },
    { label: "GENERAL",    items: ["/operations/reports", "/settings"] },
  ],
  leads: [
    { label: "PIPELINE",       items: ["/lead-management", "/leads/list", "/leads/kanban", "/leads/contacts", "/leads/companies"] },
    { label: "DEALS",          items: ["/leads/deals", "/leads/quotations"] },
    { label: "COMMUNICATE",    items: ["/leads/inbox", "/leads/tasks", "/leads/meetings", "/leads/activities", "/leads/calls", "/leads/email", "/leads/whatsapp"] },
    { label: "VIEWS",          items: ["/leads/smart-lists", "/leads/map-view", "/leads/campaigns"] },
    { label: "GENERAL",        items: ["/leads/reports", "/leads/settings"] },
  ],
};
