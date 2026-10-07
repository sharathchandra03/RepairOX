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

import { CAP, allow } from "@/lib/capabilities";
import type { PermissionKey } from "@/lib/permissions";
import { isInListDateRange, type ListDatePreset } from "@/lib/date-filter";

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
  source: string;         // acquisition source (Google / Meta / GMB / …)
  modeOfContact: string;  // preferred contact mode (Call / WhatsApp / Email / …) — configurable
  captureChannel: string; // HOW it was captured (IVR / Form / Chat / Email / …) — separate from source
  agent: string;
  qualification: string;  // Qualified Lead / Not Qualified Lead — configurable
  name: string;
  number: string;
  alternateNumber: string;  // secondary phone — persisted + flows to Customer Master (altMobile).
  email: string;
  location: string;         // free-text address / landmark (unchanged)
  locationUnit: string;     // door / flat / house no. — the exact unit ("" = none).
                            // Additive; complements `location` so the field team
                            // knows exactly which door to reach.
  /* Exact map pin (Leaflet + OpenStreetMap picker). Additive — complements the
     free-text `location` so the field team gets a navigable point. */
  locationLat: number | null;  // decimal latitude ("" → null on persist)
  locationLng: number | null;  // decimal longitude
  locationMapsUrl: string;     // shareable maps URL for the picked point ("" = none)

  /* ── Stage 2: Qualification ── */
  device: string;           // cached display label (brand + model, or free text)
  /* Device Catalog references (canonical; reuse the catalog, never duplicate).
     Category → Brand → Model ids from useCatalog(). "" when not resolved. */
  deviceCategoryId: string; // DeviceCategory.id (cat-…)
  deviceBrandId: string;    // PriceListBrand.id (plb-…)
  deviceModelId: string;    // PriceListModel.id (plm-…)
  issue: string;
  category: string;         // issue/service category (lead_options master)
  subCategory: string;      // more specific category under `category` (lead_options master)
  estimate: number | null;  // pipeline / expected value (NOT revenue)
  discount: number | null;  // structured numeric value; unit in discountType
  discountType: "amount" | "percent"; // how `discount` is expressed
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
  followUpAgent: string;     // cached display name of the follow-up agent
  followUpAgentId: string;   // staff id of the follow-up agent (may differ from owner)
  finalResult: string;
  followUpComments: string;

  /* ── Not-Contacted lock (§ Not-Contacted accountability) ──
     When a lead sits at contactStatus "Not Contacted" it is on a countdown.
     `notContactedSince` is the ISO instant the lead ENTERED (or last re-entered)
     the Not-Contacted state — set on create for a fresh Not-Contacted lead, and
     re-stamped whenever contactStatus is set back to Not Contacted. Cleared ("")
     the moment the lead is contacted (any other contactStatus).

     After NOT_CONTACTED_LOCK_MS (48h) with no contact, the lead is LOCKED: it
     leaves the owning Sales Agent's working set (they can no longer see the
     flow — only that it exists as Not Contacted, every other column N/A) and
     waits in the "Not Contacted" view for a senior/owner to REASSIGN it. A
     reassignment (owner change) clears the lock and restarts the clock fresh
     for the new owner. */
  notContactedSince: string;  // ISO instant the lead entered Not-Contacted ("" = not in that state)

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
  companyId?: string;       // Company Master reference for commercial leads

  /* Normalized analytical facts. These are event-derived DB columns, never
     manual KPIs. Empty means the historical event is unavailable — analytics
     must show a data-quality state rather than infer a timestamp. */
  expectedValue?: number | null; // canonical open-pipeline value; estimate is fallback
  firstContactedAt?: string;     // first successful contact activity
  qualifiedAt?: string;          // first time the lead reached qualification
  convertedAt?: string;          // terminal WON / converted timestamp
  lostAt?: string;               // terminal LOST timestamp
  lostReason?: string;           // structured reason when available
  nextFollowUpAt?: string;       // normalized next due instant cache
  convertedBy?: string;          // staff id that promoted/linked the customer
  conversionSource?: "ticket" | "invoice" | "walk_in" | "field" | "manual" | string;
  /* ── Attribution mode (effort-based agent credit) ──
     How the downstream operational record became attached to this lead:
       • "agent_routed"  → the agent WORKED the lead and routed it forward
         (agent-driven). The conversion COUNTS toward the agent's credit.
       • "back_matched"  → a SELF-INITIATED operational record (customer came
         in on their own) was later linked to this lead by the attribution
         safety net. Kept for history/reporting, but does NOT count toward the
         agent's headline credit — the agent didn't drive it.
     Empty/undefined on an unconverted lead. Defaults to "agent_routed" for a
     lead the agent routed forward (routedAt set) when unspecified. */
  attributionMode?: "agent_routed" | "back_matched" | "";

  /* ── Audit ── */
  /** staff id of the user who CREATED the lead (DB-stamped, immutable). */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A partial lead used while capturing — everything optional except what the
 *  create flow fills in. The AGENTS field (primary owner) is captured on the
 *  draft as `assignedTo`/`assignedToName` (the picker stores the USER ID); the
 *  DB stamps `createdBy`/`assignedBy`/`assignedByName`/`assignedAt` at save. */
export type LeadDraft = Partial<Omit<Lead,
  | "id" | "leadNo" | "date" | "time" | "month" | "createdAt" | "updatedAt" | "createdBy"
  | "assignedBy" | "assignedByName" | "assignedAt"
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
  | "modeOfContact"
  | "agent"
  | "qualification"
  | "contactStatus"
  | "device"
  | "category"
  | "subCategory"
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
  { key: "modeOfContact", label: "Mode of Contact",hint: "How the lead prefers to be reached.",       defaults: ["Call", "WhatsApp", "Email", "SMS", "Walk-In", "Chat"] },
  { key: "region",        label: "Region",         hint: "City / area the lead belongs to.",          defaults: ["Bangalore", "Chennai", "Hyderabad", "Mumbai", "Delhi"] },
  { key: "agent",         label: "Agent",          hint: "Sales agent who owns the lead.",            defaults: [], usesStaff: true },
  // LEAD CATEGORY is the lead's qualification state. It keeps the underlying
  // `qualification` field KEY (so the entire qualification GATE — gating N/A,
  // the mandatory Not-Qualified reason, isQualifiedLead / isLeadPipelineEligible
  // and the DB lead_qualification_guard trigger — keeps working unchanged); only
  // the user-facing LABEL is "Lead Category". The old business-type leadCategory
  // field (Repair / Accessory / …) has been removed — there is now ONE Lead
  // Category showing Qualified Lead / Not Qualified Lead.
  { key: "qualification", label: "Lead Category",  hint: "Whether the lead is qualified (Qualified / Not Qualified).", defaults: ["Qualified Lead", "Not Qualified Lead"] },
  { key: "contactStatus", label: "Contact Status", hint: "Whether the lead has been reached.",        defaults: ["Not Contacted", "Contacted", "RNR", "Busy", "Switched Off"] },
  { key: "device",        label: "Device",         hint: "Device the enquiry is about.",              defaults: ["iPhone", "Android", "iPad", "MacBook", "Laptop", "Smart Watch", "Other"] },
  { key: "category",      label: "Category",       hint: "Repair / product category.",                defaults: ["Screen", "Battery", "Motherboard", "Water Damage", "Software", "Accessory"] },
  { key: "subCategory",   label: "Subcategory",    hint: "More specific category under Category.",     defaults: ["Display Replacement", "Glass Only", "Battery Replacement", "Charging Port", "Data Recovery", "Diagnostics"] },
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

/* ─── Lead devices (for the shared Device & Issue details popup) ─────────
   A lead currently captures ONE device (flat catalog-reference fields on the
   Lead). This helper normalises that into an ARRAY so the Device Details popup
   renders identically whether a lead has one device or, in future, several —
   exactly like the Ticket / Walk-In "Device N" overlay. It never invents data:
   if there is no device at all it returns []. */

export interface LeadDevice {
  id: string;
  /** Cached display label (brand + model, or free text). */
  label: string;
  categoryId: string;
  brandId: string;
  modelId: string;
  issue: string;
  /** Issue/service category (lead_options master). */
  category: string;
}

/** The lead's device(s), normalised to an array (one entry today). Returns []
 *  when the lead has captured no device/issue information at all. */
export function getLeadDevices(lead: Pick<Lead,
  "id" | "device" | "deviceCategoryId" | "deviceBrandId" | "deviceModelId" | "issue" | "category"
>): LeadDevice[] {
  const hasAny = !!(lead.device || lead.deviceModelId || lead.deviceBrandId || lead.deviceCategoryId || lead.issue || lead.category);
  if (!hasAny) return [];
  return [{
    id: `${lead.id}-dev-1`,
    label: lead.device || "",
    categoryId: lead.deviceCategoryId || "",
    brandId: lead.deviceBrandId || "",
    modelId: lead.deviceModelId || "",
    issue: lead.issue || "",
    category: lead.category || "",
  }];
}

/** The lead's FULL human location for handoff/display: the exact door/flat/house
 *  number (`locationUnit`) prefixed onto the free-text address (`location`).
 *  Use this whenever a lead's location travels to a Field Job, Walk-In, Ticket,
 *  Customer Master address, or a detail view — so the field team always sees the
 *  exact unit, not just the street/landmark. Empty parts are skipped. */
export function fullLeadLocation(
  lead: Pick<Lead, "location" | "locationUnit">
): string {
  return [lead.locationUnit, lead.location]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/* ─── Validation ──────────────────────────────────────────────────────── */

export interface LeadValidation {
  ok: boolean;
  errors: Partial<Record<keyof Lead, string>>;
}

/** Minimum required fields to create a lead + format checks. Kept intentionally
 *  light so sales can capture fast. `requireOwner` (default true) enforces the
 *  AGENTS owner on the Lead Form; section quick-edits of an EXISTING lead pass
 *  false because ownership is changed only through the Assignment control. */
export function validateLead(draft: LeadDraft, opts: { requireOwner?: boolean } = {}): LeadValidation {
  const errors: Partial<Record<keyof Lead, string>> = {};
  const requireOwner = opts.requireOwner ?? true;

  if (!draft.name?.trim()) errors.name = "Name is required.";
  if (!draft.number?.trim()) errors.number = "Phone number is required.";
  else if (!isValidPhone(draft.number)) errors.number = "Enter a valid phone number.";
  if (!draft.source?.trim()) errors.source = "Source is required.";
  // AGENTS = the owner's USER ID (a Sales Agent), never a typed/cached name.
  if (requireOwner && !draft.assignedTo?.trim()) errors.assignedTo = "Select the lead owner (Sales Agent).";

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
    modeOfContact: "",
    captureChannel: "",
    agent,
    qualification: "",
    name: "",
    number: "",
    alternateNumber: "",
    email: "",
    location: "",
    locationUnit: "",
    locationLat: null,
    locationLng: null,
    locationMapsUrl: "",
    device: "",
    deviceCategoryId: "",
    deviceBrandId: "",
    deviceModelId: "",
    issue: "",
    category: "",
    subCategory: "",
    estimate: null,
    discount: null,
    discountType: "amount",
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
    followUpAgentId: "",
    finalResult: "",
    followUpComments: "",
  };
}

/* ─── Assignment capability ───────────────────────────────────────────── */

/** Given a permission checker (usePermissions().can), can this user assign or
 *  reassign leads? Resolved through the central CAP entries — the SAME keys the
 *  DB ownership guard (migration 0049) checks — never an ad-hoc key list. */
export function canAssignLeads(can: (key: PermissionKey) => boolean): boolean {
  return allow(can, CAP.lead.assign) || allow(can, CAP.lead.reassign);
}

/* ─── Shared filter model (used by BOTH the list and the dashboard) ─────── */

/** Leads reuse the SHARED 8-option date-range vocabulary (the same one Tickets,
 *  Walk-In, Field and the Dashboard use) so the strip + boundaries are
 *  identical everywhere. See ListDatePreset / isInListDateRange in date-filter.ts. */
export type LeadDateRange = ListDatePreset;

/** The canonical date-range strip options (matches Tickets / Dashboard exactly). */
export const LEAD_DATE_RANGES: { value: LeadDateRange; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "7 Days" },
  { value: "1month", label: "1 Month" },
  { value: "lastmonth", label: "Last Month" },
  { value: "1year", label: "1 Year" },
  { value: "custom", label: "Custom" },
];

/** Fields that can be filtered by an exact configured value. */
export type LeadFilterField =
  | "region" | "source" | "agent" | "assignedToName" | "contactStatus"
  | "leadCategory" | "status" | "leadNature" | "result" | "priority"
  | "device" | "category" | "subCategory" | "modeOfContact" | "qualification"
  | "deviceCategoryId" | "deviceBrandId" | "fulfilmentRoute"
  | "followUpAgent" | "finalResult"
  /* People filters match the structured USER ID (never the rendered name). */
  | "assignedTo" | "followUpAgentId";

/** The complete, shared lead filter state. `field` holds per-field exact
 *  matches; `query` is the free-text search; `dateRange` filters by creation
 *  date; `followUp` narrows by follow-up timing. */
/** The primary segment strip on the Lead Table.
 *  - "all"          → the normal working table (excludes LOCKED not-contacted
 *                     leads, which have aged out to the "notContacted" view).
 *  - "notContacted" → leads currently at contactStatus "Not Contacted"
 *                     (whether inside the grace window or locked). This is the
 *                     accountability queue where seniors reassign stale leads.
 *  - "followUps"    → leads with follow-up activity (mirrors Walk-In's
 *                     Active/History follow-up view + calendar). */
export type LeadView = "all" | "notContacted" | "followUps";

export interface LeadFilters {
  query: string;
  /** Primary segment: all / notContacted / followUps. */
  view: LeadView;
  status: string;              // "" = all (also drives the status tabs)
  dateRange: LeadDateRange;
  /** Custom range bounds (YYYY-MM-DD), only used when dateRange === "custom". */
  customFrom?: string;
  customTo?: string;
  followUp: "any" | "has" | "overdue" | "today" | "upcoming" | "none";
  /** Customer Master linkage. "existing" = the lead is linked to a Customer
   *  Master record (lead.customerId set); "new" = fresh prospect, not yet a
   *  customer (customerId empty). Presence/absence check — not a `fields`
   *  exact match, so it lives as its own axis like dateRange/followUp. */
  customerLink: "any" | "existing" | "new";
  fields: Partial<Record<LeadFilterField, string>>;
  /** Exact traceability cohort from Lead Intelligence. Hidden from the normal
   * filter UI; every id still passes through RLS before it can appear. */
  evidenceIds?: string[];
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  query: "",
  view: "all",
  status: "",
  dateRange: "all",
  customFrom: "",
  customTo: "",
  followUp: "any",
  customerLink: "any",
  fields: {},
};

export function hasActiveLeadFilters(f: LeadFilters): boolean {
  return (
    !!f.query.trim() || !!f.status || f.dateRange !== "all" || f.followUp !== "any" ||
    f.customerLink !== "any" || !!f.evidenceIds?.length ||
    Object.values(f.fields).some(Boolean)
  );
}

/** A lead is an EXISTING customer when it is linked to a Customer Master record
 *  (customerId set) or has been promoted (convertedAt). Otherwise it's a NEW /
 *  unlinked prospect. This mirrors the capture flow's Review semantics
 *  ("Linked" vs "New / unlinked"). */
export function leadIsExistingCustomer(l: Lead): boolean {
  return !!(l.customerId && l.customerId.trim()) || !!l.convertedAt;
}

/** True if an ISO/date string falls within the given creation-date range.
 *  Delegates to the SHARED boundary logic (isInListDateRange) so Leads resolve
 *  every preset (Today / 1 Month / Last Month / …) to the EXACT same window as
 *  Tickets and the Dashboard. */
export function leadInDateRange(createdAt: string, range: LeadDateRange, customFrom?: string, customTo?: string): boolean {
  return isInListDateRange(createdAt, range, customFrom, customTo);
}

/**
 * The single filtering function used by BOTH the list table and the dashboard,
 * so they always reflect the same dataset. Applies (in AND): status, per-field
 * exact matches, date range, follow-up timing, and free-text search across the
 * key identifying fields.
 */
export function applyLeadFilters(
  leads: Lead[],
  f: LeadFilters,
  /** Optional map of leadId → its OPEN structured follow-up. When supplied, the
   *  follow-up filter uses the datetime-precise lifecycle from the real
   *  lead_followup_history records (Overdue/Due/Upcoming); otherwise it falls
   *  back to the flat `followUpDate` calendar-date classification. */
  openFollowUpsByLead?: Map<string, LeadFollowUp>,
): Lead[] {
  const q = f.query.trim().toLowerCase();
  const evidence = f.evidenceIds?.length ? new Set(f.evidenceIds) : null;
  const asOf = Date.now();
  const view: LeadView = f.view ?? "all";
  return leads.filter((l) => {
    if (evidence && !evidence.has(l.id)) return false;
    // ── Primary segment (view) ──────────────────────────────────────────────
    // notContacted: leads still at "Not Contacted" (grace window OR locked).
    // all: the normal working table — a LOCKED not-contacted lead has aged out
    //      to the notContacted queue and is hidden here. Follow-ups view keeps
    //      only leads with any follow-up activity.
    // Exact Intelligence evidence cohorts bypass normal operational view
    // segmentation (including the stale Not-Contacted queue) but never bypass
    // RLS. This keeps "View leads" numerators/denominators traceable.
    if (!evidence && view === "notContacted") {
      if (!isNotContactedStatus(l.contactStatus)) return false;
    } else if (!evidence && view === "all") {
      if (isNotContactedLocked(l, asOf)) return false;
    } else if (!evidence && view === "followUps") {
      const hasFu = openFollowUpsByLead
        ? openFollowUpRowState(openFollowUpsByLead.get(l.id), asOf) !== "none"
        : followUpState(l.followUpDate) !== "none";
      if (!hasFu) return false;
    }

    if (f.status && l.status !== f.status) return false;
    for (const [k, v] of Object.entries(f.fields)) {
      if (v && String((l as any)[k] ?? "") !== v) return false;
    }
    if (!leadInDateRange(l.createdAt || l.date, f.dateRange, f.customFrom, f.customTo)) return false;

    if (f.customerLink !== "any") {
      const existing = leadIsExistingCustomer(l);
      if (f.customerLink === "existing" && !existing) return false;
      if (f.customerLink === "new" && existing) return false;
    }

    if (f.followUp !== "any") {
      // Prefer the structured open follow-up (datetime-precise). Fall back to
      // the flat followUpDate when no records are threaded through.
      const state: FollowUpState = openFollowUpsByLead
        ? openFollowUpRowState(openFollowUpsByLead.get(l.id), asOf)
        : followUpState(l.followUpDate);
      if (f.followUp === "has" && state === "none") return false;
      if (f.followUp === "none" && state !== "none") return false;
      if (f.followUp === "overdue" && state !== "overdue") return false;
      if (f.followUp === "today" && state !== "today") return false;
      if (f.followUp === "upcoming" && state !== "upcoming") return false;
    }

    if (q) {
      const hay = [
        l.leadNo, l.name, l.number, l.alternateNumber, l.email, l.device, l.source, l.agent,
        // Lead Category = qualification (Qualified / Not Qualified).
        l.status, l.qualification, l.priority, l.assignedToName, l.region,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   NOT-CONTACTED LOCK (accountability countdown)
   A lead left at "Not Contacted" for longer than NOT_CONTACTED_LOCK_MS is
   locked away from its Sales Agent and surfaced (Not Contacted, everything
   else N/A) in the "Not Contacted" view for a senior/owner to reassign.
   Pure, derived — never a stored "locked" flag; computed live from
   contactStatus + notContactedSince so it always reflects reality.
   ═══════════════════════════════════════════════════════════════════════ */

/** 48 hours (2 days) — the grace period before a Not-Contacted lead is locked. */
export const NOT_CONTACTED_LOCK_MS = 48 * 60 * 60 * 1000;

/** True when a contactStatus value means the lead has NOT been contacted yet.
 *  Case-insensitive so an admin-renamed "not contacted" style value still
 *  classifies (e.g. "Not Contacted", "Not contacted yet"). An empty status is
 *  treated as not-contacted (a brand-new lead nobody has touched). */
export function isNotContactedStatus(contactStatus: string): boolean {
  const s = (contactStatus || "").trim().toLowerCase();
  return s === "" || s.startsWith("not contacted") || s === "not contacted";
}

/** The instant the Not-Contacted lock trips for a lead, or null when the lead
 *  is not on the countdown (already contacted). Uses `notContactedSince` when
 *  present, else falls back to the lead's creation time so legacy rows still
 *  age correctly. */
export function notContactedLockAt(lead: Pick<Lead, "contactStatus" | "notContactedSince" | "createdAt" | "date">): number | null {
  if (!isNotContactedStatus(lead.contactStatus)) return null;
  const since = lead.notContactedSince || lead.createdAt || lead.date;
  const t = since ? new Date(since).getTime() : NaN;
  if (isNaN(t)) return null;
  return t + NOT_CONTACTED_LOCK_MS;
}

/** True when a Not-Contacted lead has passed its 48h grace period and is now
 *  LOCKED (must be reassigned by a senior before work continues). */
export function isNotContactedLocked(
  lead: Pick<Lead, "contactStatus" | "notContactedSince" | "createdAt" | "date">,
  asOf: number = Date.now(),
): boolean {
  const at = notContactedLockAt(lead);
  return at != null && asOf >= at;
}

/** Milliseconds remaining before a Not-Contacted lead locks (negative once
 *  locked, null when not on the countdown). Drives the "locks in Xh" hint. */
export function notContactedLockRemainingMs(
  lead: Pick<Lead, "contactStatus" | "notContactedSince" | "createdAt" | "date">,
  asOf: number = Date.now(),
): number | null {
  const at = notContactedLockAt(lead);
  return at == null ? null : at - asOf;
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
export function followUpLifecycle(fu: Pick<LeadFollowUp, "status" | "dueAt">, asOf: number = Date.now()): LeadFollowUpState {
  if (fu.status === "completed") return "Completed";
  if (fu.status === "cancelled") return "Cancelled";
  const due = fu.dueAt ? new Date(fu.dueAt).getTime() : NaN;
  // OVERDUE is DATETIME-PRECISE (§6): a follow-up scheduled for 6:00 PM is
  // overdue at 6:01 PM — never based purely on the calendar date. `missed`
  // also maps to Overdue.
  if (fu.status === "missed") return "Overdue";
  if (!isNaN(due) && due <= asOf) return "Overdue";
  // Not yet past. "Due" = still scheduled for TODAY (same calendar day) so the
  // agent sees it needs attention today; anything later is "Pending" (upcoming).
  if (!isNaN(due) && isSameCalendarDay(due, asOf)) return "Due";
  return "Pending";
}

/** True when two epoch-ms instants fall on the same local calendar day. */
function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
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

/**
 * Map a structured follow-up's live lifecycle to the compact `FollowUpState`
 * used for the Lead table row tint / chip (so the table shares ONE overdue
 * language with the Ticket table). Only an OPEN (scheduled) follow-up drives the
 * row's urgency — a completed/cancelled follow-up leaves the row neutral.
 * Datetime-precise via {@link followUpLifecycle}.
 */
export function openFollowUpRowState(open: LeadFollowUp | undefined, asOf: number = Date.now()): FollowUpState {
  if (!open) return "none";
  const life = followUpLifecycle(open, asOf);
  if (life === "Overdue") return "overdue";
  if (life === "Due") return "today";
  if (life === "Pending") return "upcoming";
  return "none"; // Completed / Cancelled → not urgent
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
  return s.includes("qualified") && !s.includes("not qualified");
}
/** Canonical qualification fact. Historical milestone/qualification survives a
 * later status change to Won/Lost, so funnel counts remain cumulative. */
export function isQualifiedLead(lead: Pick<Lead, "status" | "qualification" | "qualifiedAt" | "convertedAt" | "finalResult">): boolean {
  const q = (lead.qualification || "").toLowerCase();
  return !!lead.qualifiedAt
    || !!lead.convertedAt
    || (q.includes("qualified") && !q.includes("not qualified"))
    || isQualifiedStatus(lead.status)
    || isWonStatus(lead.status, lead.finalResult);
}
export function isWonStatus(status: string, finalResult = ""): boolean {
  const s = `${status} ${finalResult}`.toLowerCase();
  return s.includes("won") || s.includes("convert");
}
export function isLostStatus(status: string, finalResult = ""): boolean {
  const s = `${status} ${finalResult}`.toLowerCase();
  return s.includes("lost") || s.includes("dropped") || s.includes("not eligible");
}
/** Pipeline values are valid only after contact and never for explicitly
 * Not-Qualified leads. Mirrors the qualification gate without importing the
 * workflow module (which depends on this data module). */
export function isLeadPipelineEligible(lead: Pick<Lead, "contactStatus" | "qualification">): boolean {
  const contact = (lead.contactStatus || "").trim().toLowerCase();
  const qualification = (lead.qualification || "").trim().toLowerCase();
  if (!contact || /not\s*contacted/.test(contact)) return false;
  if (/not\s*qualified/.test(qualification)) return false;
  return true;
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
  converted: number;       // won / converted (ALL — agent-driven + self-initiated)
  lost: number;
  pipelineValue: number;   // Σ expected value of OPEN (non-terminal) leads
  revenueWon: number;      // Σ FINALIZED (paid) invoice totals linked to the leads (ALL)
  ticketsWon: number;      // leads that produced a linked operational ticket (ALL)
  conversionRate: number;  // converted / total (0..1)
  /** Per-route conversion counts (walk-in / pickup / on-site), from real links. */
  routeConversions: RouteConversionCounts;

  /* ── Effort-based agent credit split ─────────────────────────────────────
     The headline agent metrics that carry CREDIT are split into what the agent
     actually DROVE ("agentDriven") vs what was SELF-INITIATED and only linked
     back ("selfInitiated"). The sales-agent dashboard credits agentDriven*
     numbers; selfInitiated* are shown separately so nothing is hidden.
     `converted`/`ticketsWon`/`revenueWon` above stay the ALL totals. */
  convertedAgentDriven: number;
  convertedSelfInitiated: number;
  ticketsWonAgentDriven: number;
  ticketsWonSelfInitiated: number;
  revenueWonAgentDriven: number;
  revenueWonSelfInitiated: number;
  /** converted (agent-driven) / total — the agent's earned conversion rate. */
  conversionRateAgentDriven: number;

  /* ── Follow-up engine metrics (Phase 2) — ALL derived from the structured
     lead_followup_history records, never a manual counter. Populated only when
     the full follow-up list is passed to computeLeadMetrics; 0 otherwise. ── */
  /** Open follow-ups that are DUE today (datetime-precise, not yet past). */
  followUpsDueToday: number;
  /** Open follow-ups whose time has passed (datetime-precise). */
  followUpsOverdue: number;
  /** Open follow-ups scheduled for a future day (Pending / upcoming). */
  followUpsUpcoming: number;
  /** Follow-ups that have been completed (historical, never deleted). */
  followUpsCompleted: number;
  /** Total scheduled/completed follow-ups (excludes cancelled). */
  followUpsTotal: number;
  /** completed / (completed + open) — 0..1. */
  followUpCompletionRate: number;
}

/** Expected/pipeline value of a lead: expectedValue if present, else estimate. */
export function leadExpectedValue(lead: Pick<Lead, "estimate"> & { expectedValue?: number | null }): number {
  const v = (lead as any).expectedValue;
  return typeof v === "number" && !isNaN(v) ? v : (lead.estimate ?? 0) || 0;
}

/* ── Effort-based agent credit ───────────────────────────────────────────
   A conversion counts for the sales agent ONLY when the agent actually drove
   it. The agent drove it when they WORKED the lead and routed it forward
   (routedAt set), or the attribution was explicitly marked "agent_routed". A
   SELF-INITIATED conversion — the customer came in on their own and the record
   was later "back_matched" to an old lead — does NOT count toward the agent's
   credit, even though the link is kept for history/reporting.

   This is deliberately about ATTRIBUTION EFFORT, not customer newness: an old/
   returning customer the agent actively pursues still counts; a customer who
   walks in themselves does not, just because a stale lead exists in their name. */
export function isAgentDrivenLead(lead: Pick<Lead, "attributionMode" | "routedAt">): boolean {
  if (lead.attributionMode === "back_matched") return false;
  if (lead.attributionMode === "agent_routed") return true;
  // Unmarked (legacy) leads: a routing decision (routedAt) is the agent's work.
  return !!lead.routedAt;
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
  /** Optional FULL follow-up record set (scoped to these leads). When supplied,
   *  the follow-up engine metrics (Due Today / Overdue / Upcoming / Completed /
   *  Completion Rate) are derived from the real records — no manual counters. */
  allFollowUps?: LeadFollowUp[],
): LeadMetrics {
  let qualified = 0, pendingFollowUp = 0, overdue = 0, converted = 0, lost = 0;
  let pipelineValue = 0, revenueWon = 0, ticketsWon = 0;
  // Effort-based credit split.
  let convertedAgentDriven = 0, convertedSelfInitiated = 0;
  let ticketsWonAgentDriven = 0, ticketsWonSelfInitiated = 0;
  let revenueWonAgentDriven = 0, revenueWonSelfInitiated = 0;

  for (const l of leads) {
    const won = isWonStatus(l.status, l.finalResult);
    const lostL = isLostStatus(l.status, l.finalResult);
    const agentDriven = isAgentDrivenLead(l);   // did the agent actually drive it?
    const rev = revenue ? revenueWonForLead(l, revenue.tickets, revenue.invoices) : 0;

    if (isQualifiedLead(l)) qualified += 1;
    if (won) { converted += 1; if (agentDriven) convertedAgentDriven += 1; else convertedSelfInitiated += 1; }
    if (l.linkedTicketId) { ticketsWon += 1; if (agentDriven) ticketsWonAgentDriven += 1; else ticketsWonSelfInitiated += 1; } // Ticket Won = a real linked ticket
    if (lostL) lost += 1;
    if (!won && !lostL && isLeadPipelineEligible(l)) pipelineValue += leadExpectedValue(l);  // gated leads never inflate pipeline
    // Revenue Won = FINALIZED invoices only (never estimate/proforma/pipeline).
    if (revenue) { revenueWon += rev; if (agentDriven) revenueWonAgentDriven += rev; else revenueWonSelfInitiated += rev; }
  }

  for (const l of leads) {
    const fu = openFollowUpsByLead.get(l.id);
    if (fu) {
      pendingFollowUp += 1;
      if (followUpLifecycle(fu) === "Overdue") overdue += 1;
    }
  }

  // ── Follow-up engine metrics (all derived from the structured records) ──
  const asOf = Date.now();
  let followUpsDueToday = 0, followUpsOverdue = 0, followUpsUpcoming = 0, followUpsCompleted = 0;
  if (allFollowUps) {
    const leadIds = new Set(leads.map((l) => l.id));
    for (const fu of allFollowUps) {
      if (!leadIds.has(fu.leadId)) continue;   // stay within the scoped lead set
      if (fu.status === "cancelled") continue; // cancelled don't count toward the load/rate
      if (fu.status === "completed") { followUpsCompleted += 1; continue; }
      // scheduled / missed → derive the live lifecycle (datetime-precise).
      const state = followUpLifecycle(fu, asOf);
      if (state === "Overdue") followUpsOverdue += 1;
      else if (state === "Due") followUpsDueToday += 1;
      else if (state === "Pending") followUpsUpcoming += 1;
    }
  }
  const followUpsOpen = followUpsDueToday + followUpsOverdue + followUpsUpcoming;
  const followUpsTotal = followUpsCompleted + followUpsOpen;

  return {
    total: leads.length,
    qualified, pendingFollowUp, overdue, converted, lost,
    pipelineValue, revenueWon, ticketsWon,
    conversionRate: leads.length > 0 ? converted / leads.length : 0,
    routeConversions: computeRouteConversions(leads),
    convertedAgentDriven, convertedSelfInitiated,
    ticketsWonAgentDriven, ticketsWonSelfInitiated,
    revenueWonAgentDriven, revenueWonSelfInitiated,
    conversionRateAgentDriven: leads.length > 0 ? convertedAgentDriven / leads.length : 0,
    followUpsDueToday, followUpsOverdue, followUpsUpcoming, followUpsCompleted, followUpsTotal,
    followUpCompletionRate: followUpsTotal > 0 ? followUpsCompleted / followUpsTotal : 0,
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

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOMER SALES ATTRIBUTION (derived, read-only)
   A single Customer may be worked by MANY Sales Agents across MANY leads
   (spec §19/§20/§52/§97). This derives that history STRICTLY from the leads
   that reference the customer (lead.customerId) — the lead owns sales
   attribution, never the Customer Master. The customer's record CREATOR is
   irrelevant here (spec §21/§85/§98). Nothing is stored; it's computed live.
   ═══════════════════════════════════════════════════════════════════════ */

export interface CustomerSalesAttributionRow {
  leadId: string;
  leadNo: string;
  /** Sales Agent user id that OWNS this lead ("" = unassigned). */
  agentId: string;
  /** Cached display name of the sales agent. */
  agentName: string;
  /** When the lead was created (its sales date). */
  date: string;
  /** The highest real outcome word for this lead: "Invoice" | "Ticket" |
   *  "Lead Won" | "In Pipeline" | "Lost" | "Open". */
  result: string;
  /** Finalized-invoice revenue attributed to this lead (0 when none). */
  revenue: number;
  /** The lead's store scope (branch id) for display context. */
  branchId: string;
}

/**
 * Build a customer's sales-attribution history from the leads referencing it.
 * `revenue` (store tickets+invoices) lets each row carry the FINALIZED revenue
 * reachable from that lead (Lead→Ticket→Invoice). Ordered newest-first.
 *
 * A customer with multiple leads shows multiple agents — the history is NEVER
 * collapsed onto a single "customer agent" (spec §19). An existing customer's
 * old agent is NOT applied to a new lead; each row is that lead's own owner.
 */
export function customerSalesAttribution(
  customerId: string,
  leads: Lead[],
  revenue?: { tickets: RevenueTicketLike[]; invoices: RevenueInvoiceLike[] },
): CustomerSalesAttributionRow[] {
  if (!customerId) return [];
  const rows = leads
    .filter((l) => l.customerId === customerId)
    .map((l) => {
      const rev = revenue ? revenueWonForLead(l, revenue.tickets, revenue.invoices) : 0;
      let result: string;
      if (rev > 0 || l.linkedInvoiceId) result = "Invoice";
      else if (l.linkedTicketId) result = "Ticket";
      else if (isWonStatus(l.status, l.finalResult)) result = "Lead Won";
      else if (isLostStatus(l.status, l.finalResult)) result = "Lost";
      else if (l.routedAt || l.linkedWalkInId || l.linkedFieldJobId) result = "In Pipeline";
      else result = "Open";
      return {
        leadId: l.id,
        leadNo: l.leadNo || l.id,
        agentId: l.assignedTo || "",
        agentName: l.assignedToName || l.agent || "",
        date: l.date || (l.createdAt || "").slice(0, 10),
        result,
        revenue: rev,
        branchId: l.branchId || "",
      } as CustomerSalesAttributionRow;
    });
  rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return rows;
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
