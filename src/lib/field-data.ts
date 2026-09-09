/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Management (Pickup & Drop) data model.

   Field Management is the LOGISTICS layer that moves a device physically:

       CUSTOMER → NINJA → STORE → REPAIR → NINJA → CUSTOMER

   It is NOT another ticket system. A FieldJob is created when a Sales person
   routes a Lead to "Pickup & Drop". It references the SHARED master data
   (Customer Master, Employee/User Master, Device Catalog, Branch/Store) by id
   and links to the Lead it came from and the Ticket it eventually produces.

   IMPORTANT boundaries (see the workflow spec):
     • FieldJob status is its OWN lifecycle — never a Ticket status.
     • FieldJob references customerId — it never creates a duplicate customer.
     • FieldJob references linkedTicketId / linkedLeadId — one operational route.

   No React in this file — pure types + helpers shared by the context, the
   Field pages, notifications and reporting.
   ────────────────────────────────────────────────────────────────────────── */

/* ─── Fulfilment route (lives on the Lead, mirrored onto the FieldJob) ──── */

/** Internal, stable route values. Display labels are separate (below). */
export type FulfilmentRoute = "STORE_VISIT" | "PICKUP_DROP";

export const FULFILMENT_ROUTE_LABEL: Record<FulfilmentRoute, string> = {
  STORE_VISIT: "Store-to-Store",
  PICKUP_DROP: "Pickup & Drop",
};

export const FULFILMENT_ROUTES: { value: FulfilmentRoute; label: string; hint: string }[] = [
  { value: "STORE_VISIT", label: "Store-to-Store", hint: "Customer visits a store; handled as a Walk-In." },
  { value: "PICKUP_DROP", label: "Pickup & Drop",  hint: "Device is picked up from the customer by a field agent." },
];

/** Normalise any stored value (label or internal) to a stable route value. */
export function normaliseRoute(v: string | null | undefined): FulfilmentRoute | "" {
  if (!v) return "";
  const s = String(v).trim().toLowerCase();
  if (s === "store_visit" || s === "store-to-store" || s === "store to store") return "STORE_VISIT";
  if (s === "pickup_drop" || s === "pickup & drop" || s === "pickup and drop" || s === "pickup&drop") return "PICKUP_DROP";
  return "";
}

/* ─── Field Job status — its OWN lifecycle (distinct from Ticket status) ── */

export type FieldJobStatus =
  | "pending_assignment"   // routed by Sales, no Field Manager / Ninja yet
  | "assigned"             // Ninja assigned for pickup
  | "pickup_scheduled"     // pickup date/time set
  | "out_for_pickup"       // Ninja en route to customer
  | "picked_up"            // device collected from customer
  | "at_store"             // device handed over & received at store
  | "in_repair"            // linked Ticket is being worked on
  | "ready_for_drop"       // repair complete, awaiting return leg
  | "drop_scheduled"       // drop date/time set
  | "out_for_drop"         // Ninja en route to customer with device
  | "delivered"            // device physically delivered
  | "completed"            // job closed (delivered + any collection done)
  | "cancelled"            // customer cancelled / job voided
  | "failed_pickup"        // could not collect
  | "failed_drop";         // could not deliver

export const FIELD_STATUS_LABEL: Record<FieldJobStatus, string> = {
  pending_assignment: "Pending Assignment",
  assigned: "Assigned",
  pickup_scheduled: "Pickup Scheduled",
  out_for_pickup: "Out for Pickup",
  picked_up: "Picked Up",
  at_store: "At Store",
  in_repair: "In Repair",
  ready_for_drop: "Ready for Drop",
  drop_scheduled: "Drop Scheduled",
  out_for_drop: "Out for Drop",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  failed_pickup: "Failed Pickup",
  failed_drop: "Failed Drop",
};

/** Tailwind chip tones per status (matches the RepairOX pill palette). */
export const FIELD_STATUS_TONE: Record<FieldJobStatus, string> = {
  pending_assignment: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  assigned:           "bg-sky-50 text-sky-700 ring-sky-200",
  pickup_scheduled:   "bg-sky-50 text-sky-700 ring-sky-200",
  out_for_pickup:     "bg-violet-50 text-violet-700 ring-violet-200",
  picked_up:          "bg-indigo-50 text-indigo-700 ring-indigo-200",
  at_store:           "bg-amber-50 text-amber-700 ring-amber-200",
  in_repair:          "bg-amber-50 text-amber-700 ring-amber-200",
  ready_for_drop:     "bg-teal-50 text-teal-700 ring-teal-200",
  drop_scheduled:     "bg-teal-50 text-teal-700 ring-teal-200",
  out_for_drop:       "bg-violet-50 text-violet-700 ring-violet-200",
  delivered:          "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed:          "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled:          "bg-rose-50 text-rose-600 ring-rose-200",
  failed_pickup:      "bg-rose-50 text-rose-600 ring-rose-200",
  failed_drop:        "bg-rose-50 text-rose-600 ring-rose-200",
};

/** Terminal statuses — a job here needs no further field action. */
export const FIELD_TERMINAL_STATUSES: FieldJobStatus[] = ["completed", "cancelled"];

/** Statuses that belong to the PICKUP leg (customer → store). */
export const PICKUP_LEG_STATUSES: FieldJobStatus[] = [
  "pending_assignment", "assigned", "pickup_scheduled", "out_for_pickup", "picked_up", "failed_pickup",
];

/** Statuses that belong to the DROP leg (store → customer). */
export const DROP_LEG_STATUSES: FieldJobStatus[] = [
  "ready_for_drop", "drop_scheduled", "out_for_drop", "delivered", "failed_drop",
];

/* ─── Proof of service (reuses generic upload/signature data) ─────────── */

export interface FieldProof {
  /** ISO timestamp the leg was confirmed. */
  at: string;
  /** Employee id of the Ninja who confirmed. */
  byId?: string;
  byName?: string;
  /** Free-text device condition / notes captured at handover. */
  condition?: string;
  notes?: string;
  /** Optional data-URL / storage refs for photos (reuses upload architecture). */
  photos?: string[];
  /** Optional signature data-URL. */
  signature?: string;
}

/* ─── The Field Job record ────────────────────────────────────────────── */

export interface FieldJob {
  /** Stable primary key. */
  id: string;
  /** Human business id, e.g. FJ-001. */
  jobNo: string;

  /* ── Links to shared master data / other modules (ids only) ── */
  leadId: string;          // originating Lead (Lead.id) — "" if created ad-hoc
  leadNo: string;          // cached Lead business no for display
  customerId: string;      // Customer Master id — never duplicated
  linkedTicketId: string;  // repair Ticket id once created ("" until then)
  linkedInvoiceId: string; // cached for display convenience ("" until billed)

  /* ── Denormalised display fields (cached; master data stays source of truth) ── */
  customer: string;        // customer name
  phone: string;
  email: string;
  device: string;          // model name
  modelId: string;         // Device Catalog DeviceModel.id (if resolved)
  category: string;        // Device Catalog category id
  issue: string;

  /* ── Branch / store scope ── */
  branch: string;          // one of BRANCHES (store handling the repair)

  /* ── People (Employee/User Master ids) ── */
  salesPersonId: string;   // who routed the lead
  salesPersonName: string;
  fieldManagerId: string;  // assigned Field Manager
  fieldManagerName: string;
  ninjaId: string;         // assigned pickup Ninja
  ninjaName: string;
  dropNinjaId: string;     // assigned drop Ninja (may differ from pickup)
  dropNinjaName: string;

  /* ── Pickup leg ── */
  pickupAddress: string;
  pickupDate: string;      // YYYY-MM-DD or ""
  pickupTime: string;      // HH:MM or ""
  pickupProof?: FieldProof;

  /* ── Drop leg ── */
  dropAddress: string;
  dropDate: string;
  dropTime: string;
  dropProof?: FieldProof;

  /* ── Lifecycle ── */
  status: FieldJobStatus;
  notes: string;

  /* ── Delivery vs payment kept separate (payment lives on the Invoice) ── */
  deliveryConfirmed: boolean;

  /* ── Audit ── */
  createdAt: string;
  updatedAt: string;
}

/** Fields the creator supplies; identity/timestamps are auto-filled. */
export type FieldJobDraft = Partial<Omit<FieldJob, "id" | "jobNo" | "createdAt" | "updatedAt">>;

/* ─── ID helpers ──────────────────────────────────────────────────────── */

export function formatFieldJobNo(seq: number): string {
  return `FJ-${String(seq).padStart(3, "0")}`;
}

export function fieldJobSeq(jobNo: string): number {
  const m = /(\d+)\s*$/.exec(jobNo || "");
  return m ? Number(m[1]) : 0;
}

/** Next business number given the existing jobs (max + 1). */
export function nextFieldJobNo(existing: FieldJob[]): string {
  const max = existing.reduce((acc, j) => Math.max(acc, fieldJobSeq(j.jobNo)), 0);
  return formatFieldJobNo(max + 1);
}

export function genFieldJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `fj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ─── Status helpers ──────────────────────────────────────────────────── */

export function isPickupLeg(status: FieldJobStatus): boolean {
  return PICKUP_LEG_STATUSES.includes(status);
}
export function isDropLeg(status: FieldJobStatus): boolean {
  return DROP_LEG_STATUSES.includes(status);
}
export function isTerminal(status: FieldJobStatus): boolean {
  return FIELD_TERMINAL_STATUSES.includes(status);
}

/** A job is "delayed" when its scheduled pickup/drop date is in the past and
 *  the leg has not completed. Pure — takes a reference date for testability. */
export function isDelayed(job: FieldJob, now: Date = new Date()): boolean {
  if (isTerminal(job.status)) return false;
  const today = now.toISOString().slice(0, 10);
  // Pickup overdue
  if (isPickupLeg(job.status) && job.pickupDate && job.pickupDate < today
      && job.status !== "picked_up") return true;
  // Drop overdue
  if (isDropLeg(job.status) && job.dropDate && job.dropDate < today
      && job.status !== "delivered") return true;
  return false;
}

/** Whether a status transition is a leg that a Ninja can act on. */
export function ninjaActionable(status: FieldJobStatus): boolean {
  return ["assigned", "pickup_scheduled", "out_for_pickup",
          "drop_scheduled", "out_for_drop"].includes(status);
}

/* ─── Field Job queues (operational views) ────────────────────────────── */

export type FieldQueue =
  | "all"
  | "today_pickup"
  | "upcoming_pickup"
  | "pending_assignment"
  | "in_transit"
  | "at_store"
  | "ready_for_drop"
  | "today_drop"
  | "delayed"
  | "completed";

export const FIELD_QUEUES: { value: FieldQueue; label: string }[] = [
  { value: "all",                label: "All Jobs" },
  { value: "today_pickup",       label: "Today's Pickup" },
  { value: "upcoming_pickup",    label: "Upcoming Pickup" },
  { value: "pending_assignment", label: "Pending Assignment" },
  { value: "in_transit",         label: "In Transit" },
  { value: "at_store",           label: "At Store" },
  { value: "ready_for_drop",     label: "Ready for Drop" },
  { value: "today_drop",         label: "Today's Drop" },
  { value: "delayed",            label: "Delayed" },
  { value: "completed",          label: "Completed" },
];

export function jobMatchesQueue(job: FieldJob, queue: FieldQueue, now: Date = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  switch (queue) {
    case "all": return true;
    case "today_pickup": return isPickupLeg(job.status) && job.pickupDate === today && job.status !== "picked_up";
    case "upcoming_pickup": return isPickupLeg(job.status) && !!job.pickupDate && job.pickupDate > today;
    case "pending_assignment": return job.status === "pending_assignment";
    case "in_transit": return job.status === "out_for_pickup" || job.status === "out_for_drop";
    case "at_store": return job.status === "at_store" || job.status === "in_repair";
    case "ready_for_drop": return job.status === "ready_for_drop" || job.status === "drop_scheduled";
    case "today_drop": return isDropLeg(job.status) && job.dropDate === today && job.status !== "delivered";
    case "delayed": return isDelayed(job, now);
    case "completed": return job.status === "completed";
    default: return true;
  }
}

/* ─── Search / filter ─────────────────────────────────────────────────── */

export interface FieldJobFilters {
  query: string;
  status: FieldJobStatus | "";
  branch: string;
  fieldManagerId: string;
  ninjaId: string;
  leg: "" | "pickup" | "drop";
  delayed: boolean;
  hasTicket: "" | "yes" | "no";
}

export const EMPTY_FIELD_FILTERS: FieldJobFilters = {
  query: "", status: "", branch: "", fieldManagerId: "", ninjaId: "", leg: "", delayed: false, hasTicket: "",
};

export function searchFieldJob(job: FieldJob, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  const hay = [
    job.jobNo, job.leadNo, job.customer, job.phone, job.device,
    job.linkedTicketId, job.ninjaName, job.fieldManagerName,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(needle);
}

export function applyFieldFilters(jobs: FieldJob[], filters: FieldJobFilters, now: Date = new Date()): FieldJob[] {
  return jobs.filter((j) => {
    if (!searchFieldJob(j, filters.query)) return false;
    if (filters.status && j.status !== filters.status) return false;
    if (filters.branch && j.branch !== filters.branch) return false;
    if (filters.fieldManagerId && j.fieldManagerId !== filters.fieldManagerId) return false;
    if (filters.ninjaId && j.ninjaId !== filters.ninjaId && j.dropNinjaId !== filters.ninjaId) return false;
    if (filters.leg === "pickup" && !isPickupLeg(j.status)) return false;
    if (filters.leg === "drop" && !isDropLeg(j.status)) return false;
    if (filters.delayed && !isDelayed(j, now)) return false;
    if (filters.hasTicket === "yes" && !j.linkedTicketId) return false;
    if (filters.hasTicket === "no" && j.linkedTicketId) return false;
    return true;
  });
}

export function hasActiveFieldFilters(f: FieldJobFilters): boolean {
  return !!(f.query || f.status || f.branch || f.fieldManagerId || f.ninjaId || f.leg || f.delayed || f.hasTicket);
}

/* ─── Visual helpers (deterministic accent colours) ───────────────────── */

/** A small, stable palette used for the coloured DEVICE strip and STORE dot.
 *  Deterministic (hash of the label) so the same device/store always gets the
 *  same colour without storing anything. */
const STRIP_COLORS = [
  "#4361EE", "#7C5CFC", "#0EA5E9", "#10B981", "#F59E0B",
  "#EF4444", "#EC4899", "#14B8A6", "#8B5CF6", "#F97316",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/** Hex accent colour for a label (device model / store name). */
export function accentColor(label: string): string {
  if (!label) return "#94A3B8"; // slate for empty/N-A
  return STRIP_COLORS[hashString(label) % STRIP_COLORS.length];
}

/** Two-letter initials from a name, e.g. "Rahul Singh" → "RS". */
export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─── Field date range (reuses the shared list date-range vocabulary) ──── */
export type FieldDateRange =
  | "all" | "today" | "yesterday" | "7days" | "1month" | "lastmonth" | "1year" | "custom";

export const FIELD_DATE_RANGES: { label: string; value: FieldDateRange }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 Days", value: "7days" },
  { label: "1 Month", value: "1month" },
  { label: "Last Month", value: "lastmonth" },
  { label: "1 Year", value: "1year" },
  { label: "Custom", value: "custom" },
];
