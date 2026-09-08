import type { PermissionKey, WorkspaceId } from "@/lib/permissions";
import { hashPassword, DEFAULT_SEED_PASSWORD, type SalaryType } from "@/lib/auth";
import { colourLabel } from "@/lib/device-colours";

export type TicketStatus =
  | "in_progress"
  | "waiting_approval"
  | "waiting_parts"
  | "repaired"
  | "repaired_collected"
  | "return"
  | "return_collected";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  in_progress: "In Progress",
  waiting_approval: "Waiting for Approval",
  waiting_parts: "Waiting for Parts",
  repaired: "Repaired",
  repaired_collected: "Repaired & Collected",
  return: "Returned",
  return_collected: "Returned & Collected",
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  in_progress: "bg-info/10 text-info ring-info/20",
  waiting_approval: "bg-warning/10 text-amber-700 ring-warning/30",
  waiting_parts: "bg-orange-50 text-orange-700 ring-orange-200",
  repaired: "bg-success/10 text-emerald-700 ring-success/30",
  repaired_collected: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  return: "bg-rose-50 text-rose-700 ring-rose-200",
  return_collected: "bg-zinc-100 text-zinc-700 ring-zinc-200",
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

/* ─── Device Colour ───────────────────────────────────────────────────
   The list of device colours offered in the Ticket → Job Details step and
   carried through view / edit / print / invoice. Kept as a single source of
   truth here so the list can be extended later (or wired to Settings) without
   touching the Ticket flow. Each entry pairs a stored `value` (persisted on
   the device) with a `label` and a subtle, professional `swatch` colour used
   for visual identification in the dropdown. */
export type DeviceColourOption = { label: string; value: string; swatch: string };

export const DEVICE_COLOUR_OPTIONS: DeviceColourOption[] = [
  { label: "Black", value: "black", swatch: "#2B2B2E" },
  { label: "White", value: "white", swatch: "#E7E7EA" },
  { label: "Red", value: "red", swatch: "#B23B3B" },
  { label: "Blue", value: "blue", swatch: "#3E5C99" },
];

/** Default colour applied to every new device. */
export const DEFAULT_DEVICE_COLOUR = "black";

/** Human-readable label for a stored device colour value. Returns "" when the
 *  value is empty/unknown so historical devices show blank / N/A rather than a
 *  guessed colour.
 *
 *  Resolution order: the Settings-backed colours cache (custom colours added in
 *  Settings → Device Colours) first, then the built-in fallback list, then the
 *  raw value. This keeps every display/print site correct once colours are
 *  managed from Settings without touching each call site. */
export function formatDeviceColour(value?: string): string {
  if (!value) return "";
  const fromSettings = colourLabel(value);
  if (fromSettings && fromSettings !== value) return fromSettings;
  const match = DEVICE_COLOUR_OPTIONS.find((o) => o.value === value);
  return match ? match.label : fromSettings || value;
}

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
  /** Durable Category → Brand → Model relationship ids (Settings-backed
   *  master). Optional so legacy records without them keep working — the
   *  text `brand`/`model`/`category` remain the display source of truth and
   *  the ids are used to re-link dropdowns on edit/view/invoice. */
  brandId?: string;
  modelId?: string;
  categoryId?: string;
  imei: string;
  imeiType: "imei" | "imei1" | "imei2" | "serial";
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
  /** Structured warranty duration (new format). */
  warrantyValue?: number;
  /** Warranty duration unit: "days" | "months" | "years". */
  warrantyUnit?: "days" | "months" | "years";
  /** Selected device colour value (e.g. "black"). Optional so historical
   *  devices without a colour keep working (displayed as blank / N/A). New
   *  devices default to Black. */
  deviceColour?: string;
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
    brandId: undefined,
    modelId: undefined,
    categoryId: undefined,
    imei: "",
    imeiType: "imei",
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
    warrantyValue: undefined,
    warrantyUnit: undefined,
    deviceColour: DEFAULT_DEVICE_COLOUR,
    resolutionMinutes: 59,
    accessories: "",
    notes: "",
    estimate: 0,
    parts: [],
    qc: {},
    status: "in_progress",
    ...overrides,
  };
}

/* ─── Warranty Helpers ─────────────────────────────────────────────── */

export type WarrantyUnit = "days" | "months" | "years";

/** Format structured warranty for display: "6 Months", "30 Days", "2 Years". */
export function formatWarranty(value?: number, unit?: WarrantyUnit, fallbackStr?: string): string {
  if (value && unit) {
    const unitLabel = unit.charAt(0).toUpperCase() + unit.slice(1);
    return `${value} ${unitLabel}`;
  }
  // Fallback to legacy string
  if (fallbackStr) {
    return parseWarrantyLabel(fallbackStr);
  }
  return "";
}

/** Convert a legacy warranty string to a display-friendly label. */
function parseWarrantyLabel(str: string): string {
  switch (str) {
    case "in-warranty": return "In Warranty";
    case "out-warranty": return "Out of Warranty";
    case "extended": return "Extended Warranty";
    default: return str;
  }
}

/** Attempt to parse an old warranty string into value + unit (for migration).
 *  e.g. "6 Months" → { value: 6, unit: "months" }
 *  Returns null if parsing fails. */
export function parseWarrantyString(str: string): { value: number; unit: WarrantyUnit } | null {
  if (!str) return null;
  const match = str.match(/^(\d+)\s*(days?|months?|years?)$/i);
  if (match) {
    const value = parseInt(match[1], 10);
    let unit: WarrantyUnit = "months";
    const raw = match[2].toLowerCase();
    if (raw.startsWith("day")) unit = "days";
    else if (raw.startsWith("month")) unit = "months";
    else if (raw.startsWith("year")) unit = "years";
    return { value, unit };
  }
  return null;
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
      imeiType: ticket.imeiType || "imei",
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

/* ─── Ticket Type (Intake channel) Helpers ───────────────────────────── */

/** The intake channel of a ticket, saved on DeviceRecord.type during creation. */
export type TicketType = "walkin" | "pickup" | "onsite";

/** Short avatar code shown for each intake type: Walk-In → WK, Pick-Up → PD, On-Site → OS. */
export const TICKET_TYPE_CODE: Record<TicketType, string> = {
  walkin: "WK",
  pickup: "PD",
  onsite: "OS",
};

/** Human-readable label per intake type. */
export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  walkin: "Walk-In",
  pickup: "Pick-Up",
  onsite: "On-Site",
};

/**
 * Resolve the SAVED intake Type of a ticket (Walk-In / Pick-Up / On-Site).
 * Reads the first device's `type` value — never inferred from customer data.
 * Returns null when no type has been saved (e.g. legacy tickets), so callers
 * can fall back to the existing avatar behaviour.
 */
export function getTicketType(ticket: Ticket): TicketType | null {
  const devices = getTicketDevices(ticket);
  for (const d of devices) {
    if (d.type === "walkin" || d.type === "pickup" || d.type === "onsite") {
      return d.type;
    }
  }
  return null;
}

/**
 * Derive overall ticket status from device statuses.
 * Rules:
 * - If all devices are "return_collected" → return_collected
 * - If all devices are "repaired_collected" or "return_collected" → repaired_collected
 * - If any device is "return" → return
 * - If any device is "repaired" → repaired
 * - If any device is "waiting_parts" → waiting_parts
 * - If any device is "waiting_approval" → waiting_approval
 * - Otherwise → in_progress
 */
export function deriveTicketStatus(devices: DeviceRecord[]): TicketStatus {
  if (devices.length === 0) return "in_progress";
  const statuses = devices.map((d) => d.status);
  if (statuses.every((s) => s === "return_collected")) return "return_collected";
  if (statuses.every((s) => s === "repaired_collected" || s === "return_collected")) return "repaired_collected";
  if (statuses.some((s) => s === "return")) return "return";
  if (statuses.some((s) => s === "repaired")) return "repaired";
  if (statuses.some((s) => s === "waiting_parts")) return "waiting_parts";
  if (statuses.some((s) => s === "waiting_approval")) return "waiting_approval";
  return "in_progress";
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
  imeiType?: "imei" | "imei1" | "imei2" | "serial";
  qcStatus?: "pending" | "pass" | "fail";
  customerId?: string;
  customerType?: "personal" | "business";
  /** GST Number for Business/GST tickets. */
  gstNumber?: string;
  /** Total GST rate percentage (e.g. 18 → splits into 9% SGST + 9% CGST). */
  gstRate?: number;
  /** SGST rate percentage (half of gstRate). */
  sgstRate?: number;
  /** CGST rate percentage (half of gstRate). */
  cgstRate?: number;
  /** Computed SGST amount. */
  sgst?: number;
  /** Computed CGST amount. */
  cgst?: number;
  /** Multi-device support — when present, each device has its own record */
  devices?: DeviceRecord[];
  /** DB-backed pin marker. Non-null → pinned to the top of the table. */
  pinnedAt?: string;
  /** Human-readable ticket number (e.g. "T-001"). Separate from `id`, which is
   *  the stable database primary key. Displayed everywhere the ticket number is
   *  shown; falls back to `id` when not yet assigned. */
  ticketNo?: string;
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
  { href: "/walk-in",          label: "Walk-In",       icon: "WalkIn", permission: "use_pos" },
  { href: "/price-list",       label: "Price List",    icon: "ClipboardList", permission: ["manage_sales", "manage_repair_jobs"] },
  { href: "/expenses",         label: "Expenses",      icon: "IndianRupee", permission: "manage_payments" },

  // Employee sub-pages
  { href: "/employees/directory",      label: "Employee Directory", icon: "Users", permission: ["manage_users", "assign_technicians"] },
  { href: "/employees/payroll",        label: "Payroll & Salary",   icon: "Banknote", permission: "manage_payments" },
  { href: "/employees/salary-advances", label: "Salary Advances",  icon: "WalletCards", permission: "manage_payments" },

  // Administration — single entry point for all employee access / role management
  { href: "/settings/roles-permissions", label: "Roles & Permissions", icon: "ShieldCheck", permission: ["manage_roles", "manage_users"] },

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

/**
 * Build inline styles for an invoice status pill from a configured hex colour.
 * Mirrors the ticket status-pill approach so Settings → Invoice → Status Colours
 * is the single source of truth. `INVOICE_STATUS_TONE` remains as the Tailwind
 * fallback for any context that has not been wired to settings yet.
 */
export function invoiceStatusPillStyle(hex: string | undefined): {
  backgroundColor: string;
  color: string;
  boxShadow: string;
} {
  const color = hex || "#71717A";
  return {
    backgroundColor: `${color}15`,
    color,
    boxShadow: `inset 0 0 0 1px ${color}30`,
  };
}

/** Muted text colour (for the invoice id) derived from the configured hex. */
export function invoiceIdColorStyle(hex: string | undefined): { color: string | undefined } {
  return { color: hex || undefined };
}

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
  /** Durable Category → Brand → Model relationship ids, inherited from the
   *  linked ticket device (not re-inferred from text). Optional for legacy. */
  brandId?: string;
  modelId?: string;
  imei: string;
  imeiType: "imei" | "imei1" | "imei2" | "serial";
  /** Device category (references the Settings-backed category master by id).
   *  Carried over from the linked ticket device, or selected directly on
   *  invoices created from scratch. Blank when unknown (legacy records). */
  category?: string;
  /** Job details */
  issue: string;
  description: string;
  jobType: string;
  priority: string;
  warranty: string;
  /** Structured warranty duration value (matches ticket model). */
  warrantyValue?: number;
  /** Warranty duration unit: "days" | "months" | "years" (matches ticket model). */
  warrantyUnit?: "days" | "months" | "years";
  /** Device colour carried over from the linked ticket device (matches ticket
   *  model). Optional for legacy records. */
  deviceColour?: string;
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
    brandId: undefined,
    modelId: undefined,
    imei: "",
    imeiType: "imei",
    category: "",
    issue: "",
    description: "",
    jobType: "service",
    priority: "normal",
    warranty: "",
    warrantyValue: undefined,
    warrantyUnit: undefined,
    deviceColour: undefined,
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
    // Inherit the durable relationship ids from the ticket device — do NOT
    // re-infer brand/model from the device name text.
    brandId: dev.brandId,
    modelId: dev.modelId,
    imei: dev.imei,
    imeiType: dev.imeiType,
    category: dev.category || dev.categoryId || "",
    issue: dev.issue || dev.description,
    description: dev.description,
    jobType: dev.jobType,
    priority: dev.priority,
    warranty: dev.warranty,
    warrantyValue: dev.warrantyValue,
    warrantyUnit: dev.warrantyUnit,
    // Copy the persisted colour — do not re-infer it.
    deviceColour: dev.deviceColour,
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
  /** @deprecated Legacy CORP-XXXX reference number. No longer generated or shown.
   *  Kept optional only so existing DB rows with a `reference` value still map
   *  cleanly. The meaningful relationship is now `ticketId` (Linked Ticket). */
  reference?: string;
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
  /** Total GST rate percentage. */
  gstRate?: number;
  /** SGST amount (State GST). */
  sgst?: number;
  /** CGST amount (Central GST). */
  cgst?: number;
  /** SGST rate percentage. */
  sgstRate?: number;
  /** CGST rate percentage. */
  cgstRate?: number;
  /** @deprecated — kept for backward compat with old invoices. */
  igst?: number;
  /** @deprecated */
  igstRate?: number;
  /** GST Number for Business invoices. */
  gstNumber?: string;
  total: number;
  notes?: string;
  terms?: string;
  slogan?: string;
  footer?: string;
  employee?: string;
  ticketId?: string;
  /**
   * Repair/work status — shares the SAME status system as Tickets
   * (see TicketStatus / STATUS_LABEL / STATUS_TONE). This is distinct from the
   * financial `status` field (draft/sent/paid…) which drives payment logic,
   * print templates and reports. Kept in sync with the linked ticket's status.
   */
  repairStatus?: TicketStatus;
  /** Mode of payment (cash, upi, card, etc.) */
  paymentMode?: string;
  /** Service category — "service" or "accessories" */
  serviceCategory?: "service" | "accessories";
  /** Multi-device support — when present, each device has its own parts/job/technician */
  devices?: InvoiceDeviceRecord[];
  /** DB-backed pin marker. Non-null → pinned to the top of the table. */
  pinnedAt?: string;
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const invoices: Invoice[] = [];

/* ─── Walk-In Types & Seed Data ──────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Final Status — the Walk-In outcome state machine.

   The three business values (Visitor / Enquiry / Converted Ticket) are the
   source of truth used by the sales team's spreadsheet. The remaining legacy
   values are preserved so historically-imported / older records never break;
   they are hidden from the create/edit dropdown but still render correctly.
   ────────────────────────────────────────────────────────────────────────── */
export type WalkInStatus =
  /* Primary business outcomes */
  | "visitor"
  | "enquiry"
  | "converted_ticket"
  /* Legacy / historical (kept for backward-compatibility & safe display) */
  | "waiting"
  | "inspection"
  | "quotation_given"
  | "converted_invoice"
  | "closed"
  | "lost"
  | "follow_up";

/** The Final Status values offered in the Walk-In create/edit dropdown. */
export const WALKIN_FINAL_STATUSES: WalkInStatus[] = ["visitor", "enquiry", "converted_ticket"];

export const WALKIN_STATUS_LABEL: Record<WalkInStatus, string> = {
  visitor: "Visitor",
  enquiry: "Enquiry",
  converted_ticket: "Converted Ticket",
  /* legacy */
  waiting: "Waiting",
  inspection: "Inspection",
  quotation_given: "Quotation Given",
  converted_invoice: "Converted to Invoice",
  closed: "Closed",
  lost: "Lost Customer",
  follow_up: "Follow-Up Required",
};

export const WALKIN_STATUS_TONE: Record<WalkInStatus, string> = {
  visitor: "bg-slate-50 text-slate-600 ring-slate-200",
  enquiry: "bg-amber-50 text-amber-700 ring-amber-200",
  converted_ticket: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  /* legacy */
  waiting: "bg-amber-50 text-amber-700 ring-amber-200",
  inspection: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  quotation_given: "bg-violet-50 text-violet-700 ring-violet-200",
  converted_invoice: "bg-sky-50 text-sky-700 ring-sky-200",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  lost: "bg-rose-50 text-rose-600 ring-rose-200",
  follow_up: "bg-orange-50 text-orange-700 ring-orange-200",
};

/** How the Walk-In was handled/assigned. NOT the ticket intake channel. */
export type WalkInType = "direct" | "sales";

export const WALKIN_TYPE_LABEL: Record<WalkInType, string> = {
  direct: "Direct",
  sales: "Sales",
};

export const WALKIN_TYPE_TONE: Record<WalkInType, string> = {
  direct: "bg-sky-50 text-sky-700 ring-sky-200",
  sales: "bg-violet-50 text-violet-700 ring-violet-200",
};

/**
 * The single, shared definition of a "won" Walk-In. Used identically by the
 * table, the report and the export so counts can never diverge. A Walk-In is
 * WON when it has been successfully converted into a repair Ticket.
 */
export function isWalkInWon(w: Pick<WalkIn, "status" | "linkedTicketId">): boolean {
  return w.status === "converted_ticket";
}

export type WalkIn = {
  id: string;
  /** Human-readable sequential business identifier, e.g. "WK-001". */
  walkInNumber?: string;
  date: string;
  time: string;
  /** How the walk-in was handled. */
  type?: WalkInType;
  /** Customer / person name. */
  customer: string;
  /** Phone / contact number. */
  phone: string;
  /** Customer email (optional). */
  email?: string;
  source: string;
  category: string;
  model: string;
  /** Optional link to the device catalog model record. */
  modelId?: string;
  /** Free-text reported issue. */
  issue?: string;
  /** Legacy multi-tag reasons — kept for backward-compat & search. */
  reasons: string[];
  status: WalkInStatus;
  /** Assigned sales person (only when type === "sales"). Reuses the Employee/User master. */
  salesPersonId?: string;
  salesPersonName?: string;
  /** Linked customer master record, when selected/created. */
  customerId?: string;
  /** The repair ticket this walk-in was converted into. */
  linkedTicketId?: string;
  /** @deprecated use linkedTicketId. Retained for older rows. */
  ticketId?: string;
  invoiceValue: number;
  businessValue: number;
  notes?: string;
  /** Float this record to the top of the table when set. */
  pinnedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const walkIns: WalkIn[] = [];

export const navGroups: Record<WorkspaceId, { label: string; items: string[] }[]> = {
  shop: [
    { label: "MODULE",         items: ["/dashboard", "/tickets", "/invoice", "/walk-in", "/price-list"] },
    { label: "INVENTORY",      items: ["/inventory"] },
    // Expenses remains standalone for daily operational quick-access.
    // Employees and Accounts are now expandable groups rendered separately.
    // Roles & Permissions has moved to Settings → Roles & Permissions.
    { label: "ADMINISTRATION", items: ["/expenses"] },
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
