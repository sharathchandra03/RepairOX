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

  /* ── Store scope (which store owns this lead) ── */
  branchId: string;      // branches.id — "" when org-wide / unscoped

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

  /* ── Fulfilment routing (the operational decision Sales makes) ──
     Separate from status/source/leadCategory. Internal values are
     "STORE_VISIT" | "PICKUP_DROP" (see FulfilmentRoute in field-data). */
  fulfilmentRoute: string;  // "STORE_VISIT" | "PICKUP_DROP" | "ON_SITE" | "" (not yet routed)
  assignedStore: string;    // Branch/Store handling a Store-to-Store lead ("" otherwise)
  routedAt: string;         // ISO timestamp the routing decision was made ("" = never)

  /* ── Downstream links (nullable — historical leads keep working) ── */
  linkedWalkInId: string;   // Walk-In created for a Store-to-Store lead
  linkedFieldJobId: string; // Field Job created for a Pickup & Drop / On-Site lead
  linkedTicketId: string;   // eventual repair Ticket (cached for progress display)
  linkedInvoiceId: string;  // eventual finalized Invoice (cached; revenue resolved live)
  contactId: string;        // CRM Contact identity (prospect stage; always preferred before promotion)
  customerId: string;       // Customer Master link once commercial/service business begins
  convertedAt?: string;     // ISO timestamp of Contact/Lead → Customer promotion
  convertedBy?: string;     // staff id that promoted/linked the customer
  conversionSource?: "ticket" | "invoice" | "walk_in" | "field" | "manual" | string;

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

/* ─── CRM Contact (linked to Customer Master) ──────────────────────────── */

export interface Contact {
  id: string;
  customerId?: string;      // Customer Master link after promotion; null/undefined = prospect
  companyId?: string;       // Link to Company (if available)
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  designation?: string;
  department?: string;
  role?: string;
  source?: string;
  status?: "active" | "inactive" | string;
  owner?: string;
  address?: string;
  city?: string;
  lastContactAt?: string;
  communicationPreferences?: {
    email?: boolean;
    phone?: boolean;
    whatsapp?: boolean;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

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
      return { chip: "bg-red-100 text-[#B42318] ring-red-300", rowTint: "bg-red-100/90", text: "text-[#B42318] font-semibold" };
    case "today":
      return { chip: "bg-red-100 text-[#B42318] ring-red-300", rowTint: "bg-red-100/70", text: "text-[#B42318] font-semibold" };
    case "upcoming":
      return { chip: "bg-red-50 text-[#C0392B] ring-red-200", rowTint: "bg-red-100/60", text: "text-[#C0392B]" };
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

/* ═══════════════════════════════════════════════════════════════════════
   LEAD OWNERSHIP & FOLLOW-UP MODEL
   (Phase 2 — builds on migration 0045 history tables. See the
   `lead-data-foundation` steering for the ownership standard.)
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Structured follow-up ──────────────────────────────────────────────
   A follow-up is its OWN historical record (public.lead_followup_history),
   never just a scalar `next_followup_date` on the lead. Completing a follow-up
   only records that the activity happened — it does NOT win/close the lead. */

/** Persisted follow-up status. `scheduled` is the stored state; `Due`/`Overdue`
 *  are DERIVED from `dueAt` for display (see followUpLifecycle). */
export type LeadFollowUpStatus = "scheduled" | "completed" | "cancelled" | "rescheduled" | "missed";

/** The user-facing lifecycle label a follow-up is shown as. */
export type LeadFollowUpState = "Pending" | "Due" | "Overdue" | "Completed" | "Cancelled";

/** Structured outcome captured when a follow-up is COMPLETED. Reuses existing
 *  sales terminology; extend via lead_options if an org needs more. Completing
 *  with "Converted"/"Lost" signals intent but the LEAD status is changed
 *  separately (completing a follow-up never auto-wins the lead). */
export const LEAD_FOLLOWUP_OUTCOMES = [
  "Interested",
  "Needs More Time",
  "Quotation Requested",
  "No Response",
  "Not Interested",
  "Converted",
  "Lost",
  "Other",
] as const;
export type LeadFollowUpOutcome = (typeof LEAD_FOLLOWUP_OUTCOMES)[number];

/** A single follow-up record (one row of lead_followup_history). */
export interface LeadFollowUp {
  id: string;
  leadId: string;
  /** Sequence number within the lead (Follow-up #1, #2, …) — display only. */
  seq: number;
  /** When the follow-up is due. ISO string. */
  dueAt: string;
  /** The user responsible for THIS follow-up (may differ from the lead owner). */
  followUpUserId: string;
  followUpUserName: string;
  /** Who scheduled it. */
  createdBy: string;
  createdByName: string;
  status: LeadFollowUpStatus;
  /** Set when completed. */
  completedAt?: string;
  /** Structured disposition captured on completion. */
  outcome?: LeadFollowUpOutcome | string;
  comments?: string;
  createdAt: string;
}

/** Input to schedule a follow-up. */
export interface LeadFollowUpDraft {
  dueAt: string;
  followUpUserId?: string;
  followUpUserName?: string;
  comments?: string;
}

/**
 * Derive the user-facing lifecycle state of a follow-up. A scheduled follow-up
 * is Pending until its due time is within today (Due) or past (Overdue).
 * Completed/Cancelled are terminal. `missed`/`rescheduled` map to their intent.
 */
export function followUpLifecycle(fu: Pick<LeadFollowUp, "status" | "dueAt">): LeadFollowUpState {
  if (fu.status === "completed") return "Completed";
  if (fu.status === "cancelled") return "Cancelled";
  const state = followUpState(fu.dueAt ? fu.dueAt.slice(0, 10) : "");
  if (fu.status === "missed" || state === "overdue") return "Overdue";
  if (state === "today") return "Due";
  return "Pending";
}

/** Tone classes for a follow-up lifecycle chip (reuses the follow-up palette). */
export function followUpStateTone(state: LeadFollowUpState): string {
  switch (state) {
    case "Overdue": return "bg-red-100 text-[#B42318] ring-red-300";
    case "Due":     return "bg-red-50 text-[#C0392B] ring-red-200";
    case "Pending": return "bg-amber-50 text-amber-700 ring-amber-200";
    case "Completed": return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "Cancelled": return "bg-zinc-100 text-zinc-500 ring-zinc-200";
  }
}

/** The single open (scheduled) follow-up for a lead, if any — the "next" one. */
export function openFollowUp(followUps: LeadFollowUp[]): LeadFollowUp | undefined {
  return followUps
    .filter((f) => f.status === "scheduled")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];
}

/* ─── Lead assignment history (one row of lead_assignment_history) ──────── */

export interface LeadAssignmentEvent {
  id: string;
  leadId: string;
  fromUserId?: string;
  fromUserName?: string;
  toUserId?: string;
  toUserName?: string;
  assignedBy?: string;
  assignedByName?: string;
  reason?: string;
  createdAt: string;
}

/* ─── Lead conversion / handoff history (one row of lead_conversion_history) ─
   The operational trail: routed → walk-in/field job created → ticket created →
   invoice created → won/lost. Each is an append-only event referencing the
   created/linked record by (target_type, target_id). Never duplicates those
   records — it points at them. */

export type LeadConversionEventType =
  | "routed"
  | "walk_in_created"
  | "field_job_created"
  | "ticket_created"
  | "invoice_created"
  | "customer_linked"
  | "won"
  | "lost";

export type LeadConversionTargetType =
  | "walk_in" | "field_job" | "ticket" | "invoice" | "customer" | "company";

export interface LeadConversionEvent {
  id: string;
  leadId: string;
  eventType: LeadConversionEventType;
  targetType?: LeadConversionTargetType;
  targetId?: string;
  targetLabel?: string;      // cached human ref (FJ-001 / T-074 / INV-…) for display
  value?: number | null;     // realized/attributed value where applicable
  note?: string;
  actorName?: string;
  occurredAt: string;
}

export const LEAD_CONVERSION_EVENT_LABEL: Record<LeadConversionEventType, string> = {
  routed: "Route chosen",
  walk_in_created: "Walk-In created",
  field_job_created: "Field Job created",
  ticket_created: "Ticket created",
  invoice_created: "Invoice created",
  customer_linked: "Customer linked",
  won: "Converted (Won)",
  lost: "Lost",
};

/* ─── Lead status / conversion terminal helpers ─────────────────────────
   Which lead status values count as a terminal WON / LOST / QUALIFIED for
   derived reporting. Case-insensitive substring match so admin-renamed values
   (via lead_options) still classify sensibly. */

export function isQualifiedStatus(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("qualified");
}
export function isWonStatus(status: string, finalResult = ""): boolean {
  const s = `${status} ${finalResult}`.toLowerCase();
  return s.includes("won") || s.includes("convert");
}
export function isLostStatus(status: string, finalResult = ""): boolean {
  const s = `${status} ${finalResult}`.toLowerCase();
  return s.includes("lost") || s.includes("dropped") || s.includes("not eligible");
}

/* ═══════════════════════════════════════════════════════════════════════
   SALESPERSON DASHBOARD METRICS (DERIVED — never stored counters)
   Pure functions computed from Lead + follow-up records so numbers always
   reflect reality. The dashboard/report layer calls these; it must NEVER
   maintain a manual counter. (See the lead-data-foundation steering.)
   ═══════════════════════════════════════════════════════════════════════ */

export interface LeadMetrics {
  total: number;          // My Leads (scoped set size)
  qualified: number;
  pendingFollowUp: number; // leads with an open (scheduled) follow-up
  overdue: number;         // leads with an overdue open follow-up
  converted: number;       // won / converted
  lost: number;
  pipelineValue: number;   // Σ expected value of OPEN (non-terminal) leads
  revenueWon: number;      // Σ FINALIZED (paid) invoice totals linked to the leads
  ticketsWon: number;      // leads that produced a linked operational ticket
  conversionRate: number;  // converted / total (0..1)
  /** Per-route conversion counts (walk-in / pickup / on-site), from real links. */
  routeConversions: RouteConversionCounts;
}

/** Expected/pipeline value of a lead: expectedValue if present, else estimate. */
export function leadExpectedValue(lead: Pick<Lead, "estimate"> & { expectedValue?: number | null }): number {
  const v = (lead as any).expectedValue;
  return typeof v === "number" && !isNaN(v) ? v : (lead.estimate ?? 0) || 0;
}

/**
 * Compute salesperson dashboard metrics from the given leads + their follow-ups.
 * Pass the ALREADY-SCOPED lead set (e.g. only the user's own, or the team's, or
 * all — resolved by permission upstream). `openFollowUpsByLead` maps leadId →
 * its open (scheduled) follow-up so pending/overdue are derived from real
 * follow-up records, not a scalar. Everything here is derived.
 */
export function computeLeadMetrics(
  leads: Lead[],
  openFollowUpsByLead: Map<string, LeadFollowUp>,
  /** Optional finalized-revenue sources. When provided, revenueWon is derived
   *  from FINALIZED invoices (Lead→Ticket→Invoice); omitted → revenueWon = 0. */
  revenue?: { tickets: RevenueTicketLike[]; invoices: RevenueInvoiceLike[] },
): LeadMetrics {
  let qualified = 0, pendingFollowUp = 0, overdue = 0, converted = 0, lost = 0;
  let pipelineValue = 0, revenueWon = 0, ticketsWon = 0;

  for (const l of leads) {
    const won = isWonStatus(l.status, l.finalResult);
    const lostL = isLostStatus(l.status, l.finalResult);
    if (isQualifiedStatus(l.status)) qualified += 1;
    if (won) converted += 1;
    if (l.linkedTicketId) ticketsWon += 1;          // Ticket Won = a real linked ticket
    if (lostL) lost += 1;
    if (!won && !lostL) pipelineValue += leadExpectedValue(l);  // pipeline = expected value of open leads
    // Revenue Won = FINALIZED invoices only (never estimate/proforma/pipeline).
    if (revenue) revenueWon += revenueWonForLead(l, revenue.tickets, revenue.invoices);
  }

  for (const l of leads) {
    const fu = openFollowUpsByLead.get(l.id);
    if (fu) {
      pendingFollowUp += 1;
      if (followUpLifecycle(fu) === "Overdue") overdue += 1;
    }
  }

  return {
    total: leads.length,
    qualified, pendingFollowUp, overdue, converted, lost,
    pipelineValue, revenueWon, ticketsWon,
    conversionRate: leads.length > 0 ? converted / leads.length : 0,
    routeConversions: computeRouteConversions(leads),
  };
}

/** Scope a lead set to a specific owner (My Leads). */
export function leadsOwnedBy(leads: Lead[], userId: string): Lead[] {
  return leads.filter((l) => l.assignedTo === userId);
}

/* ─── Revenue attribution + route conversion metrics ─────────────────────
   Revenue Won is derived from FINALIZED (paid, non-proforma) invoices linked to
   the lead via Lead → Ticket → Invoice. Never from estimate/proforma/draft.
   These take minimal structural params so leads-data stays free of cross-module
   imports (the caller passes the store's tickets/invoices + predicates). */

/** Minimal invoice shape needed for revenue attribution. */
export interface RevenueInvoiceLike {
  id: string;
  ticketId?: string;
  total: number;
  status: string;                 // "paid" = realized
  documentType?: "invoice" | "proforma";
}
/** Minimal ticket shape needed to bridge lead → invoice. */
export interface RevenueTicketLike { id: string; ticketNo?: string }

/** True when an invoice is FINALIZED revenue (a real, paid invoice). */
export function isFinalizedInvoice(inv: RevenueInvoiceLike): boolean {
  return (inv.documentType ?? "invoice") !== "proforma" && inv.status === "paid";
}

/**
 * Revenue Won for a single lead: sum of finalized invoices reachable from the
 * lead's linked ticket (linked_ticket_id) — matched on invoice.ticketId (id or
 * ticketNo). Falls back to the lead's own linked_invoice_id. Returns 0 when
 * nothing is finalized yet (pipeline ≠ revenue).
 */
export function revenueWonForLead(
  lead: Lead,
  tickets: RevenueTicketLike[],
  invoices: RevenueInvoiceLike[],
): number {
  const finalized = invoices.filter(isFinalizedInvoice);
  let total = 0;
  const seen = new Set<string>();

  if (lead.linkedTicketId) {
    const ticket = tickets.find((t) => t.id === lead.linkedTicketId || t.ticketNo === lead.linkedTicketId);
    if (ticket) {
      for (const inv of finalized) {
        if (inv.ticketId && (inv.ticketId === ticket.id || inv.ticketId === ticket.ticketNo)) {
          if (!seen.has(inv.id)) { seen.add(inv.id); total += Number(inv.total || 0); }
        }
      }
    }
  }
  if (lead.linkedInvoiceId) {
    const direct = finalized.find((inv) => inv.id === lead.linkedInvoiceId);
    if (direct && !seen.has(direct.id)) { seen.add(direct.id); total += Number(direct.total || 0); }
  }
  return total;
}

/** Per-route conversion counts for a lead set — based on the ROUTE + a real
 *  linked operational event, never on merely selecting a route. */
export interface RouteConversionCounts {
  walkIn: number;   // Store / Walk-In leads that produced a linked walk-in
  pickup: number;   // Pickup & Drop leads that produced a linked field job
  onSite: number;   // On-Site leads that produced a linked field job
}

export function computeRouteConversions(leads: Lead[]): RouteConversionCounts {
  let walkIn = 0, pickup = 0, onSite = 0;
  for (const l of leads) {
    const route = (l.fulfilmentRoute || "").toUpperCase();
    if (route === "STORE_VISIT" && l.linkedWalkInId) walkIn += 1;
    else if (route === "PICKUP_DROP" && l.linkedFieldJobId) pickup += 1;
    else if (route === "ON_SITE" && l.linkedFieldJobId) onSite += 1;
  }
  return { walkIn, pickup, onSite };
}

/* ═══════════════════════════════════════════════════════════════════════
   OPEN-LEAD DETECTION (attribution safety net)
   Given a walk-in/ticket's customer identity (phone/email/customerId), find a
   matching OPEN lead so an operational record created downstream can be linked
   back — so sales attribution is never lost. Never matches on name alone.
   ═══════════════════════════════════════════════════════════════════════ */

/** Normalize a phone for comparison: digits only, last 10 (mirrors the
 *  Customer Master matcher so "+91 98…", "098…" and "98…" all compare equal). */
function normalizeLeadPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * An OPEN lead is one still in play for attribution: not already linked to a
 * ticket, not terminally lost/dropped, and not already converted. Such a lead
 * is a candidate to attribute a new walk-in/ticket to.
 */
export function isOpenLead(lead: Lead): boolean {
  if (lead.linkedTicketId) return false;               // already produced a ticket
  if (isLostStatus(lead.status, lead.finalResult)) return false;
  const fr = (lead.finalResult || "").toLowerCase();
  if (fr.includes("convert")) return false;             // final result says converted
  return true;
}

export interface OpenLeadMatch {
  lead: Lead;
  matchedOn: "Customer" | "Phone" | "Email";
  confidence: "high" | "medium";
}

/**
 * Find OPEN leads matching a customer identity. Ranked: exact Customer Master
 * id (high) → phone (high) → email (medium). Never matches on name alone. The
 * caller uses the top match to preselect, or shows the candidates when unsure.
 */
export function findOpenLeadMatches(
  leads: Lead[],
  ident: { customerId?: string; phone?: string; email?: string },
): OpenLeadMatch[] {
  const open = leads.filter(isOpenLead);
  const matches: OpenLeadMatch[] = [];
  const seen = new Set<string>();
  const add = (lead: Lead, matchedOn: OpenLeadMatch["matchedOn"], confidence: OpenLeadMatch["confidence"]) => {
    if (seen.has(lead.id)) return;
    seen.add(lead.id);
    matches.push({ lead, matchedOn, confidence });
  };

  if (ident.customerId) {
    for (const l of open) if (l.customerId && l.customerId === ident.customerId) add(l, "Customer", "high");
  }
  const phone = normalizeLeadPhone(ident.phone || "");
  if (phone) {
    for (const l of open) if (normalizeLeadPhone(l.number) === phone) add(l, "Phone", "high");
  }
  const email = (ident.email || "").trim().toLowerCase();
  if (email) {
    for (const l of open) if ((l.email || "").trim().toLowerCase() === email) add(l, "Email", "medium");
  }
  // Newest first within the ranked order already applied by push sequence.
  return matches;
}

/** True when an operational record is already attributed to a different lead. */
export function operationalRecordAttributedElsewhere(
  leads: Lead[],
  kind: "walk_in" | "field_job" | "ticket" | "invoice",
  recordId: string,
  exceptLeadId?: string,
): Lead | undefined {
  const field: keyof Lead = kind === "walk_in" ? "linkedWalkInId" : kind === "field_job" ? "linkedFieldJobId" : kind === "ticket" ? "linkedTicketId" : "linkedInvoiceId";
  return leads.find((l) => l.id !== exceptLeadId && (l[field] as string) === recordId);
}
