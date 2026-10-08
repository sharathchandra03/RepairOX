/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Deal / Discount-Approval data model.

   A DEAL is NOT a duplicate Lead. It is the commercial-exception / approval
   workflow ATTACHED to a Lead. The Lead stays the single source of truth for
   the customer opportunity and the Sales Agent attribution; the Deal only
   captures "the customer wants a pricing exception and this needs management
   review", its approval lifecycle, and its immutable audit trail.

       CUSTOMER → LEAD → DEAL (approval, only when required) → continue Lead flow

   This mirrors the lead history model (one append-only event stream +
   revisions), reuses the Lead's store scope / Sales Agent attribution, and is
   derived-only on the Lead Table (Action/Result never store the deal state).

   No React here — pure types, labels, tones and helpers shared by the context,
   the Deal approval queue, the Lead detail Deal panel and the Journey.
   ────────────────────────────────────────────────────────────────────────── */

/* ─── Deal approval status (SEPARATE from Lead Status) ─────────────────────
   These are DEAL APPROVAL states. They are never used as a Lead Status.
     • pending_approval → submitted, waiting on an authorized approver.
     • changes_requested → approver asked the agent to revise & resubmit.
     • approved          → approver authorized the exception (an approved
                           discount may differ from the requested one).
     • rejected          → approver declined the exception (Lead is NOT lost).
     • cancelled         → the agent/manager withdrew the request (kept as
                           history; never deletes the Lead). */
export type DealStatus =
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "cancelled";

export const DEAL_STATUSES: DealStatus[] = [
  "pending_approval",
  "changes_requested",
  "approved",
  "rejected",
  "cancelled",
];

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  pending_approval: "Pending Approval",
  changes_requested: "Changes Requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** A status that is still "open" (awaiting an agent or approver action). */
export function isOpenDealStatus(status: DealStatus): boolean {
  return status === "pending_approval" || status === "changes_requested";
}

/** A terminal status (no further workflow). */
export function isTerminalDealStatus(status: DealStatus): boolean {
  return status === "approved" || status === "rejected" || status === "cancelled";
}

/** Restrained, semantic tones for a Deal status chip (ring + bg + text).
 *  Pending = amber (awaiting), Approved = emerald, Rejected = rose,
 *  Changes = indigo, Cancelled = neutral. */
export function dealStatusTone(status: DealStatus): string {
  switch (status) {
    case "approved":          return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "rejected":          return "bg-rose-50 text-rose-600 ring-rose-200";
    case "changes_requested": return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "cancelled":         return "bg-zinc-100 text-zinc-500 ring-zinc-200";
    case "pending_approval":
    default:                  return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

/* ─── The Deal record ──────────────────────────────────────────────────────
   One active approval request per Lead at a time (an open deal). History is
   preserved via revisions + comments; a resubmission increments `revision`. */

export interface LeadDeal {
  id: string;
  /** Human reference — DA-0001, DA-0002 … (never fabricated; from the DB). */
  dealNo: string;

  /* ── Scope (inherited from the Lead — never a second store list) ── */
  branchId: string;        // branches.id — the Lead's store scope ("" = org-wide)

  /* ── Links (reference, never embed) ── */
  leadId: string;          // the Lead this exception belongs to (required)
  leadNo: string;          // cached Lead reference for display (L-001 …)
  customerId: string;      // Customer Master link (cached from the Lead)
  customerName: string;    // cached display label
  /** The SALES AGENT who owns the opportunity — the Lead's owner. Approval
   *  NEVER changes this (sales credit stays with the agent). */
  salesAgentId: string;    // staff id (the requester / lead owner)
  salesAgentName: string;  // cached display name

  /* ── The discount request (requested vs approved are DISTINCT) ── */
  /** What the agent asked for. */
  requestedDiscount: number | null;
  requestedDiscountType: "amount" | "percent";
  /** Mandatory free-text reason for the exception. */
  requestedReason: string;
  /** The Lead's pipeline value at request time (context for the approver). */
  leadValue: number | null;

  /** What the manager authorized (may differ from requested). Null until
   *  approved. */
  approvedDiscount: number | null;
  approvedDiscountType: "amount" | "percent";

  /* ── Approval lifecycle ── */
  status: DealStatus;
  /** 1, 2, 3 … — incremented on each resubmission (previous kept in history). */
  revision: number;

  /** Who decided (approve / reject / request changes), and when. */
  approverId: string;      // staff id of the approver ("" until decided)
  approverName: string;
  decidedAt: string;       // ISO ("" until decided)
  /** The approver's comment on an approve / request-changes decision. */
  approvalComment: string;
  /** Mandatory reason on a reject. */
  rejectionReason: string;

  /* ── Audit ── */
  createdBy: string;       // staff id of the requester (immutable)
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

/** The agent-supplied request fields (create / resubmit). */
export interface LeadDealRequestDraft {
  requestedDiscount: number | null;
  requestedDiscountType: "amount" | "percent";
  requestedReason: string;
  leadValue?: number | null;
}

/* ─── Deal comment (internal approval conversation) ────────────────────────
   The Deal comment thread is INTERNAL approval communication between the agent
   and the approver — never a customer channel. Chronological, append-only. */

export interface LeadDealComment {
  id: string;
  dealId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/* ─── Deal revision snapshot (full accountability) ─────────────────────────
   Each submission / decision writes an append-only revision so the complete
   "Revision 1: Requested 20% → Changes Requested; Revision 2: Requested 15% →
   Approved" trail is preserved and never overwritten. */

export type DealRevisionAction =
  | "submitted"
  | "resubmitted"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "cancelled";

export const DEAL_REVISION_ACTION_LABEL: Record<DealRevisionAction, string> = {
  submitted: "Submitted for approval",
  resubmitted: "Resubmitted",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export interface LeadDealRevision {
  id: string;
  dealId: string;
  revision: number;
  action: DealRevisionAction;
  /** Snapshot of the request/approval at this revision. */
  requestedDiscount: number | null;
  requestedDiscountType: "amount" | "percent";
  requestedReason: string;
  approvedDiscount: number | null;
  approvedDiscountType: "amount" | "percent";
  statusAfter: DealStatus;
  /** The actor who performed this action + their comment. */
  actorId: string;
  actorName: string;
  comment: string;
  createdAt: string;
}

/* ─── Formatting helpers ───────────────────────────────────────────────────
   A discount is either an absolute amount (₹) or a percent — never silently
   converted between the two. */

export function formatDealDiscount(value: number | null, type: "amount" | "percent"): string {
  if (value == null) return "—";
  return type === "percent" ? `${value}%` : `₹${Number(value).toLocaleString("en-IN")}`;
}

/** Compact elapsed-time since an ISO instant, expressed in HOURS (not a
 *  days+hours mix). Under an hour it falls back to minutes; very old deals roll
 *  up to weeks so the pill stays short. Actual elapsed time only — never an SLA
 *  prediction.
 *    42m · 1h · 5h · 23h · 72h · 2w  */
export function dealAgeLabel(iso: string, asOf: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const ms = Math.max(0, asOf - then);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  // Keep hours readable up to ~2 weeks; beyond that roll up to weeks.
  if (hrs < 24 * 14) return `${hrs}h`;
  const weeks = Math.floor(hrs / (24 * 7));
  return `${weeks}w`;
}

/** The exact age ("3 days, 4 hours, 12 minutes ago") for a hover tooltip, so
 *  the compact hours label never hides the real elapsed time. */
export function dealAgeTooltip(iso: string, asOf: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const ms = Math.max(0, asOf - then);
  const totalMins = Math.floor(ms / 60_000);
  if (totalMins < 1) return "Just now";
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins && !days) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return `${parts.join(", ")} ago`;
}

/* ─── The Deal queue tabs ──────────────────────────────────────────────────
   The approval queue groups deals by status; the default working view is
   Pending Approval. */
export type DealQueueTab = "pending_approval" | "changes_requested" | "approved" | "rejected" | "all";

export const DEAL_QUEUE_TABS: { value: DealQueueTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

/** Does a deal belong in the given queue tab? */
export function dealInQueueTab(deal: LeadDeal, tab: DealQueueTab): boolean {
  if (tab === "all") return true;
  return deal.status === tab;
}

/* ─── Open-deal resolution (one active deal per lead) ──────────────────────
   The CURRENT deal for a lead is its most-recent one. "Open" = pending /
   changes-requested (still in the approval loop). */

/** The most recently created deal for a lead (its current deal), or undefined. */
export function currentDealForLead(deals: LeadDeal[], leadId: string): LeadDeal | undefined {
  return deals
    .filter((d) => d.leadId === leadId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

/** True when a lead already has an OPEN (pending / changes-requested) deal —
 *  the duplicate-request guard uses this so a double-click / retry can't create
 *  two concurrent approval requests. */
export function leadHasOpenDeal(deals: LeadDeal[], leadId: string): boolean {
  return deals.some((d) => d.leadId === leadId && isOpenDealStatus(d.status));
}

/** The agent may edit / resubmit their OWN deal only while it is open and only
 *  when it was returned for changes (or is pending and theirs). */
export function canAgentResubmit(deal: LeadDeal, meId: string): boolean {
  return deal.salesAgentId === meId && (deal.status === "changes_requested");
}

/** A requester may never approve their OWN deal (default) — UNLESS they hold
 *  top authority (a full-access owner / platform owner), who IS the ultimate
 *  approver and may self-approve an exception they raised. An authorized
 *  approver who is NOT the creator may always act on an open deal.
 *  `ownerOverride` = the caller has full_access / is an org admin. */
export function canDecideDeal(deal: LeadDeal, meId: string, ownerOverride = false): boolean {
  if (!meId || !isOpenDealStatus(deal.status)) return false;
  if (deal.createdBy === meId) return ownerOverride;
  return true;
}

/* ─── Business-label constant ──────────────────────────────────────────────
   The Lead-side business label that triggers the Deal workflow. Kept as the
   familiar team term; the approval record/workflow is the "Deal". Matched
   case-insensitively so an admin-renamed lead_option still triggers. */
export const DISCOUNTED_LEAD_LABEL = "Discounted Lead";

/** True when a lead status / lead-category value reads as the Discounted Lead
 *  (a.k.a. "Deal") trigger — substring, tolerant of admin-renamed labels.
 *
 *  Matches both the canonical "Discounted Lead" wording AND the familiar team
 *  term "Deal" (the label actually used in the Lead status options), so moving
 *  a lead's status to "Deal" opens the discount-approval request.
 *
 *  IMPORTANT: a DOWNSTREAM / in-progress value such as "Deal in Progress"
 *  (the state AFTER a deal already exists) must NOT re-open the request modal —
 *  those are explicitly excluded so only the initial trigger fires. */
export function isDiscountedLeadValue(value: string): boolean {
  const v = (value || "").trim().toLowerCase();
  if (!v) return false;
  // Exclude downstream / progress / resolution states that merely mention
  // "deal" but are NOT the initial trigger (e.g. "Deal in Progress",
  // "Deal Approved", "Deal Rejected", "Deal Closed/Won/Lost").
  if (/\b(in progress|progress|approved|rejected|closed|won|lost|cancelled|canceled|done|complete)\b/.test(v)) {
    return false;
  }
  return v.includes("discount") || v.includes("deal");
}

/* ─── Row mappers (snake_case DB ↔ camelCase app) ──────────────────────────
   Mirror the leads-context mapper convention. The DB stamps approval/audit
   columns (approver, decided_at, created_by, deal_no, revision) — the client
   never supplies those on an approval decision. */

export function rowToLeadDeal(r: any): LeadDeal {
  return {
    id: r.id,
    dealNo: r.deal_no ?? "",
    branchId: r.branch_id ?? "",
    leadId: r.lead_id ?? "",
    leadNo: r.lead_no ?? "",
    customerId: r.customer_id ?? "",
    customerName: r.customer_name ?? "",
    salesAgentId: r.sales_agent_id ?? "",
    salesAgentName: r.sales_agent_name ?? "",
    requestedDiscount: r.requested_discount == null ? null : Number(r.requested_discount),
    requestedDiscountType: r.requested_discount_type === "percent" ? "percent" : "amount",
    requestedReason: r.requested_reason ?? "",
    leadValue: r.lead_value == null ? null : Number(r.lead_value),
    approvedDiscount: r.approved_discount == null ? null : Number(r.approved_discount),
    approvedDiscountType: r.approved_discount_type === "percent" ? "percent" : "amount",
    status: (r.status ?? "pending_approval") as DealStatus,
    revision: Number(r.revision ?? 1),
    approverId: r.approver_id ?? "",
    approverName: r.approver_name ?? "",
    decidedAt: r.decided_at ?? "",
    approvalComment: r.approval_comment ?? "",
    rejectionReason: r.rejection_reason ?? "",
    createdBy: r.created_by ?? "",
    createdByName: r.created_by_name ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

/** Build a DB row from a deal (business columns only; identity/audit/approval
 *  columns are DB/caller-stamped). `""` coerces to null. */
export function leadDealToRow(d: Partial<LeadDeal>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (col: string, v: unknown) => { if (v !== undefined) row[col] = v === "" ? null : v; };
  set("branch_id", d.branchId);
  set("lead_id", d.leadId);
  set("lead_no", d.leadNo);
  set("customer_id", d.customerId);
  set("customer_name", d.customerName);
  set("sales_agent_id", d.salesAgentId);
  set("sales_agent_name", d.salesAgentName);
  if (d.requestedDiscount !== undefined) row.requested_discount = d.requestedDiscount;
  set("requested_discount_type", d.requestedDiscountType);
  set("requested_reason", d.requestedReason);
  if (d.leadValue !== undefined) row.lead_value = d.leadValue;
  if (d.approvedDiscount !== undefined) row.approved_discount = d.approvedDiscount;
  set("approved_discount_type", d.approvedDiscountType);
  set("status", d.status);
  if (d.revision !== undefined) row.revision = d.revision;
  set("approval_comment", d.approvalComment);
  set("rejection_reason", d.rejectionReason);
  return row;
}

export function rowToLeadDealComment(r: any): LeadDealComment {
  return {
    id: r.id,
    dealId: r.deal_id,
    authorId: r.author_id ?? "",
    authorName: r.author_name ?? "",
    body: r.body ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

export function rowToLeadDealRevision(r: any): LeadDealRevision {
  return {
    id: r.id,
    dealId: r.deal_id,
    revision: Number(r.revision ?? 1),
    action: (r.action ?? "submitted") as DealRevisionAction,
    requestedDiscount: r.requested_discount == null ? null : Number(r.requested_discount),
    requestedDiscountType: r.requested_discount_type === "percent" ? "percent" : "amount",
    requestedReason: r.requested_reason ?? "",
    approvedDiscount: r.approved_discount == null ? null : Number(r.approved_discount),
    approvedDiscountType: r.approved_discount_type === "percent" ? "percent" : "amount",
    statusAfter: (r.status_after ?? "pending_approval") as DealStatus,
    actorId: r.actor_id ?? "",
    actorName: r.actor_name ?? "",
    comment: r.comment ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}
