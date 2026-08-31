/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Management data model.

   The Excel spreadsheet the sales team uses today is the SOURCE OF TRUTH for
   the fields and terminology. This file defines:
     • The canonical `Lead` type (camelCase) mirroring every spreadsheet column.
     • The `LeadOption` type for admin-configurable dropdown values.
     • `LEAD_DROPDOWN_FIELDS` — which fields are selection-based (configurable
       from Settings) and their default seed values.
     • Pure helpers (month derivation, validation, formatting) shared by the
       capture flow, list, detail drawer and settings pages. No React here.
   ────────────────────────────────────────────────────────────────────────── */

/* ─── Lead ────────────────────────────────────────────────────────────── */

export interface Lead {
  /** Stable primary key (uuid in DB, or a local uid in prototype mode). */
  id: string;

  /* ── Automatic identity / timestamps (never manually entered) ── */
  leadNo: string;        // L-001, L-002 …
  date: string;          // YYYY-MM-DD (creation date)
  time: string;          // HH:MM (24h, creation time)
  month: string;         // derived from date, e.g. "August"

  /* ── Stage 1: Quick capture ── */
  region: string;
  source: string;
  agent: string;
  name: string;
  number: string;
  email: string;
  location: string;

  /* ── Stage 2: Qualification ── */
  device: string;
  issue: string;
  category: string;
  estimate: number | null;
  discount: number | null;
  leadCategory: string;
  leadNature: string;
  priority: string;
  comments: string;

  /* ── Stage 3: Contact / follow-up / result ── */
  contactStatus: string;
  status: string;
  result: string;
  finalRemarks: string;
  followUpDate: string;      // YYYY-MM-DD or ""
  followUpAgent: string;
  finalResult: string;
  followUpComments: string;

  /* ── Assignment (owner responsible for working the lead) ── */
  assignedTo: string;       // staff id of the assignee ("" = unassigned)
  assignedToName: string;   // cached display name of the assignee
  assignedBy: string;       // staff id of who assigned it
  assignedByName: string;   // cached display name of who assigned it
  assignedAt: string;       // ISO timestamp of the assignment ("" = never)

  /* ── Pin (floats the lead to the top of the list) ── */
  pinnedAt: string;         // ISO timestamp; "" = not pinned

  /* ── Audit ── */
  createdAt: string;
  updatedAt: string;
}

/** A partial lead used while capturing — everything optional except what the
 *  create flow fills in. */
export type LeadDraft = Partial<Omit<Lead,
  | "id" | "leadNo" | "date" | "time" | "month" | "createdAt" | "updatedAt"
  | "assignedTo" | "assignedToName" | "assignedBy" | "assignedByName" | "assignedAt"
>>;

/* ─── Configurable dropdown option ────────────────────────────────────── */

export interface LeadOption {
  id: string;
  /** Which lead field this option belongs to (see LeadFieldKey). */
  field: LeadFieldKey;
  /** The stored / displayed value (e.g. "WhatsApp", "Bangalore"). */
  value: string;
  sortOrder: number;
  /** false = archived: hidden from NEW dropdowns, but existing leads keep it. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ─── Configurable field catalog ──────────────────────────────────────── */

export type LeadFieldKey =
  | "region"
  | "source"
  | "agent"
  | "contactStatus"
  | "device"
  | "category"
  | "leadCategory"
  | "status"
  | "leadNature"
  | "result"
  | "priority"
  | "followUpAgent"
  | "finalResult";

export interface LeadFieldDef {
  key: LeadFieldKey;
  /** Human label used in Settings and forms. */
  label: string;
  /** Short helper text shown in Settings. */
  hint: string;
  /** Default option values seeded when a field has no configured options yet. */
  defaults: string[];
  /** When true, the field is populated from the live staff/agent list rather
   *  than (or in addition to) the configured options. */
  usesStaff?: boolean;
}

/**
 * The lead fields that are SELECTION-BASED (dropdowns). Admin/Owner manages
 * their values from Settings. Order here drives the Settings page order.
 * `defaults` are safe starting values based on the Excel structure — admins
 * can rename/disable/add. Descriptive fields (name, number, email, issue,
 * estimate, discount, comments, location, remarks) are deliberately NOT here:
 * they stay free-text / numeric.
 */
export const LEAD_DROPDOWN_FIELDS: LeadFieldDef[] = [
  { key: "source",        label: "Source",         hint: "Where the lead came from.",                 defaults: ["Forms", "WhatsApp", "Website", "Referral", "Walk-In", "Google", "Meta", "Instagram"] },
  { key: "region",        label: "Region",         hint: "City / area the lead belongs to.",          defaults: ["Bangalore", "Chennai", "Hyderabad", "Mumbai", "Delhi"] },
  { key: "agent",         label: "Agent",          hint: "Sales agent who owns the lead.",            defaults: [], usesStaff: true },
  { key: "contactStatus", label: "Contact Status", hint: "Whether the lead has been reached.",        defaults: ["Not Contacted", "Contacted", "RNR", "Busy", "Switched Off"] },
  { key: "device",        label: "Device",         hint: "Device the enquiry is about.",              defaults: ["iPhone", "Android", "iPad", "MacBook", "Laptop", "Smart Watch", "Other"] },
  { key: "category",      label: "Category",       hint: "Repair / product category.",                defaults: ["Screen", "Battery", "Motherboard", "Water Damage", "Software", "Accessory"] },
  { key: "leadCategory",  label: "Lead Category",  hint: "Type of business for this lead.",           defaults: ["Repair", "Accessory", "Service", "Buy-Back", "Sales"] },
  { key: "status",        label: "Status",         hint: "Lead lifecycle stage.",                     defaults: ["New Lead", "Contacted", "Follow-Up", "Qualified", "Won", "Lost"] },
  { key: "leadNature",    label: "Lead Nature",    hint: "How warm the lead is.",                     defaults: ["Hot", "Warm", "Cold"] },
  { key: "result",        label: "Result",         hint: "Outcome of the contact.",                   defaults: ["Interested", "Not Interested", "RNR", "Follow-Up", "Converted"] },
  { key: "priority",      label: "Priority",       hint: "How urgent the lead is.",                   defaults: ["Normal", "High", "Urgent", "Low"] },
  { key: "followUpAgent", label: "Follow-Up Agent",hint: "Agent responsible for follow-up.",          defaults: [], usesStaff: true },
  { key: "finalResult",   label: "Final Result",   hint: "The final closed outcome.",                 defaults: ["Won", "Lost", "Dropped", "Converted to Ticket"] },
];

export const LEAD_FIELD_BY_KEY: Record<LeadFieldKey, LeadFieldDef> =
  Object.fromEntries(LEAD_DROPDOWN_FIELDS.map((f) => [f.key, f])) as Record<LeadFieldKey, LeadFieldDef>;

/** Smart defaults used when creating a new lead (only where a safe existing
 *  value exists — never invents business values). */
export const LEAD_SMART_DEFAULTS: Partial<Record<LeadFieldKey, string>> = {
  priority: "Normal",
  status: "New Lead",
  contactStatus: "Not Contacted",
};

/* ─── Month derivation ────────────────────────────────────────────────── */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Derive the month name from a YYYY-MM-DD date string. */
export function monthFromDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return "";
  return MONTHS[d.getMonth()] ?? "";
}

/* ─── Follow-up helpers ───────────────────────────────────────────────── */

export type FollowUpState = "none" | "overdue" | "today" | "upcoming";

/** Classify a follow-up date relative to today. */
export function followUpState(followUpDate: string): FollowUpState {
  if (!followUpDate) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(followUpDate + "T00:00:00");
  if (isNaN(d.getTime())) return "none";
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return "upcoming";
}

/**
 * Visual tones for a follow-up state, mirroring the Ticket due-date language
 * (maroon #922B21 on soft red). Upcoming is subtle (not an error), Today is
 * stronger, Overdue is strongest. `chip` = pill classes, `rowTint` = row bg,
 * `text` = plain text colour.
 */
export function followUpTone(state: FollowUpState): { chip: string; rowTint: string; text: string } {
  switch (state) {
    case "overdue":
      return { chip: "bg-red-50 text-[#922B21] ring-red-300", rowTint: "bg-red-50/80", text: "text-[#922B21] font-semibold" };
    case "today":
      return { chip: "bg-red-50 text-[#922B21] ring-red-200/70", rowTint: "bg-red-50/50", text: "text-[#922B21] font-semibold" };
    case "upcoming":
      return { chip: "bg-red-50/60 text-[#922B21]/80 ring-red-200/50", rowTint: "bg-red-50/25", text: "text-[#922B21]/70" };
    default:
      return { chip: "bg-zinc-50 text-zinc-500 ring-zinc-200", rowTint: "", text: "text-muted-foreground" };
  }
}

/** A result / status that indicates a follow-up is needed. */
export function needsFollowUp(lead: Pick<Lead, "result" | "status">): boolean {
  const needle = `${lead.result} ${lead.status}`.toLowerCase();
  return needle.includes("follow") || needle.includes("rnr") || needle.includes("busy");
}

/* ─── Validation ──────────────────────────────────────────────────────── */

export interface LeadValidation {
  ok: boolean;
  errors: Partial<Record<keyof Lead, string>>;
}

/** Minimum required fields to create a lead + format checks. Kept intentionally
 *  light so sales can capture fast. */
export function validateLead(draft: LeadDraft): LeadValidation {
  const errors: Partial<Record<keyof Lead, string>> = {};

  if (!draft.name?.trim()) errors.name = "Name is required.";
  if (!draft.number?.trim()) errors.number = "Phone number is required.";
  else if (!isValidPhone(draft.number)) errors.number = "Enter a valid phone number.";
  if (!draft.source?.trim()) errors.source = "Source is required.";
  if (!draft.agent?.trim()) errors.agent = "Agent is required.";

  if (draft.email?.trim() && !isValidEmail(draft.email)) errors.email = "Enter a valid email.";
  if (draft.estimate != null && (isNaN(Number(draft.estimate)) || Number(draft.estimate) < 0)) errors.estimate = "Enter a valid amount.";
  if (draft.discount != null && (isNaN(Number(draft.discount)) || Number(draft.discount) < 0)) errors.discount = "Enter a valid amount.";
  if (draft.followUpDate?.trim() && isNaN(new Date(draft.followUpDate).getTime())) errors.followUpDate = "Enter a valid date.";

  return { ok: Object.keys(errors).length === 0, errors };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/* ─── Empty draft factory ─────────────────────────────────────────────── */

/** A blank draft pre-filled with smart defaults + the given agent. */
export function emptyLeadDraft(agent = ""): LeadDraft {
  return {
    region: "",
    source: "",
    agent,
    name: "",
    number: "",
    email: "",
    location: "",
    device: "",
    issue: "",
    category: "",
    estimate: null,
    discount: null,
    leadCategory: "",
    leadNature: "",
    priority: LEAD_SMART_DEFAULTS.priority ?? "",
    comments: "",
    contactStatus: LEAD_SMART_DEFAULTS.contactStatus ?? "",
    status: LEAD_SMART_DEFAULTS.status ?? "",
    result: "",
    finalRemarks: "",
    followUpDate: "",
    followUpAgent: "",
    finalResult: "",
    followUpComments: "",
  };
}

/* ─── Assignment capability ───────────────────────────────────────────── */

/**
 * Permission keys that let a user assign/reassign leads and see ALL leads
 * (owners/managers). Mirrors the leads_sel / leads_upd RLS policy so the UI
 * gate matches what the database will actually allow. A plain sales user
 * (manage_sales only, without these) can work their own leads but not manage
 * assignment or view everyone else's.
 */
export const LEAD_ASSIGN_PERMISSIONS = [
  "manage_users",
  "manage_reports",
  "view_sales_reports",
  "view_financial_reports",
  "assign",
] as const;

/** Given a permission checker (usePermissions().can), can this user assign leads? */
export function canAssignLeads(can: (key: any) => boolean): boolean {
  return LEAD_ASSIGN_PERMISSIONS.some((k) => can(k));
}

/* ─── Shared filter model (used by BOTH the list and the dashboard) ─────── */

export type LeadDateRange = "all" | "today" | "yesterday" | "7days" | "30days" | "thisMonth";

/** Fields that can be filtered by an exact configured value. */
export type LeadFilterField =
  | "region" | "source" | "agent" | "assignedToName" | "contactStatus"
  | "leadCategory" | "status" | "leadNature" | "result" | "priority"
  | "device" | "category" | "followUpAgent" | "finalResult";

/** The complete, shared lead filter state. `field` holds per-field exact
 *  matches; `query` is the free-text search; `dateRange` filters by creation
 *  date; `followUp` narrows by follow-up timing. */
export interface LeadFilters {
  query: string;
  status: string;              // "" = all (also drives the status tabs)
  dateRange: LeadDateRange;
  followUp: "any" | "has" | "overdue" | "today" | "upcoming" | "none";
  fields: Partial<Record<LeadFilterField, string>>;
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  query: "",
  status: "",
  dateRange: "all",
  followUp: "any",
  fields: {},
};

export function hasActiveLeadFilters(f: LeadFilters): boolean {
  return (
    !!f.query.trim() || !!f.status || f.dateRange !== "all" || f.followUp !== "any" ||
    Object.values(f.fields).some(Boolean)
  );
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** True if an ISO/date string falls within the given creation-date range. */
export function leadInDateRange(createdAt: string, range: LeadDateRange): boolean {
  if (range === "all") return true;
  const t = new Date(createdAt).getTime();
  if (isNaN(t)) return true;
  const today = startOfToday();
  const DAY = 86_400_000;
  switch (range) {
    case "today": return t >= today;
    case "yesterday": return t >= today - DAY && t < today;
    case "7days": return t >= today - 7 * DAY;
    case "30days": return t >= today - 30 * DAY;
    case "thisMonth": {
      const d = new Date();
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return t >= monthStart;
    }
    default: return true;
  }
}

/**
 * The single filtering function used by BOTH the list table and the dashboard,
 * so they always reflect the same dataset. Applies (in AND): status, per-field
 * exact matches, date range, follow-up timing, and free-text search across the
 * key identifying fields.
 */
export function applyLeadFilters(leads: Lead[], f: LeadFilters): Lead[] {
  const q = f.query.trim().toLowerCase();
  return leads.filter((l) => {
    if (f.status && l.status !== f.status) return false;
    for (const [k, v] of Object.entries(f.fields)) {
      if (v && String((l as any)[k] ?? "") !== v) return false;
    }
    if (!leadInDateRange(l.createdAt || l.date, f.dateRange)) return false;

    if (f.followUp !== "any") {
      const state = followUpState(l.followUpDate);
      if (f.followUp === "has" && state === "none") return false;
      if (f.followUp === "none" && state !== "none") return false;
      if (f.followUp === "overdue" && state !== "overdue") return false;
      if (f.followUp === "today" && state !== "today") return false;
      if (f.followUp === "upcoming" && state !== "upcoming") return false;
    }

    if (q) {
      const hay = [
        l.leadNo, l.name, l.number, l.email, l.device, l.source, l.agent,
        l.status, l.leadCategory, l.priority, l.assignedToName, l.region,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Pinned-first ordering (preserves incoming order within each group). */
export function pinnedFirst(leads: Lead[]): Lead[] {
  const pinned = leads.filter((l) => l.pinnedAt);
  const rest = leads.filter((l) => !l.pinnedAt);
  return [...pinned, ...rest];
}
