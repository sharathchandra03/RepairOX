/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead WORKFLOW DERIVATION (system-derived Action & Result).

   A Lead's ACTION and RESULT are NEVER stored, never manually editable. They
   are DERIVED at read time from the REAL operational records the lead is linked
   to — Walk-In, Field Job, Ticket, finalized Invoice — plus the lead's own
   lifecycle status and its open follow-up. This mirrors `field-resolve.ts`
   (which derives a Field Job's Ticket/Invoice columns live) so nothing ever
   goes stale and no user can fabricate a Ticket / Invoice / "Won".

   The single source of truth for the derivation is the linked-record graph:

       Lead → { linkedWalkInId → WalkIn ;
                linkedFieldJobId → FieldJob ;
                linkedTicketId → Ticket ;
                linkedInvoiceId → Invoice }
       Ticket ← Invoice (invoice.ticketId)         (revenue bridge)

   Pure functions, no React — reused by the Lead Table, Lead Detail and
   (future) reporting so every surface shows the SAME resolved values.

   IMPORTANT SEPARATIONS (never merged):
     • STATUS  = the lead's current lifecycle state (user/authoritative-event).
     • ACTION  = the LATEST meaningful operational event (system-derived).
     • RESULT  = the business/financial OUTCOME summary (system-derived).
     • Lead Won ≠ Revenue Won. "Lead Won" = a successful accepted operational
       path (routed to Walk-In / Field). Revenue = a FINALIZED (paid,
       non-proforma) invoice only.
   ────────────────────────────────────────────────────────────────────────── */

import type { Lead } from "@/lib/leads-data";
import { isFinalizedInvoice, isLostStatus, isNotContactedStatus } from "@/lib/leads-data";
import type { WalkIn, Ticket, Invoice } from "@/lib/mock-data";
import type { FieldJob, FieldJobStatus } from "@/lib/field-data";
import { FIELD_STATUS_LABEL, FIELD_STATUS_TONE } from "@/lib/field-data";
import type { LeadDeal, DealStatus } from "@/lib/lead-deals";

/** The minimal quotation shape the derivation needs (status + whether it was
 *  actually sent). Supplied by the Lead Table from the lead's current quotation
 *  so Action can read "Quotation Created" / "Quotation Sent" — never fabricated,
 *  always below a real ticket/invoice/field record. */
export interface LeadWorkflowQuotation {
  status: string;   // quotation lifecycle status
  sentAt: string;   // ISO instant it was sent ("" = created but not sent)
}

/* ─── Contact / qualification gate ─────────────────────────────────────────
   A progressive data-capture gate. Downstream workflow fields (device, value,
   status, action, result, store …) are only meaningful once the lead has been
   contacted AND is not explicitly Not-Qualified. */

export type LeadGateState = "not_contacted" | "contacted" | "qualified" | "not_qualified";

/** True when a (configurable) qualification value reads as "not qualified".
 *  Matches "Not Qualified" / "Not Qualified Lead" / "unqualified" etc. — an
 *  empty value is NOT treated as not-qualified (it's simply undecided). */
export function isNotQualified(qualification: string): boolean {
  const q = (qualification || "").trim().toLowerCase();
  if (!q) return false;
  return q.startsWith("not qualified") || q.startsWith("not-qualified") || q === "unqualified" || q === "disqualified";
}

/** True when a (configurable) qualification value reads as "qualified" (and not
 *  the negative form). */
export function isQualifiedValue(qualification: string): boolean {
  const q = (qualification || "").trim().toLowerCase();
  if (!q || isNotQualified(qualification)) return false;
  return q.includes("qualif");
}

/**
 * Resolve the lead's contact/qualification GATE from its structured fields.
 * Precedence: Not-Qualified (explicit) → Not-Contacted → Qualified → Contacted.
 *   • not_qualified → downstream workflow is closed (only the reason survives).
 *   • not_contacted → downstream not yet applicable.
 *   • qualified     → full workflow available.
 *   • contacted     → contacted; qualification pending (workflow can proceed).
 */
export function leadGateState(lead: Pick<Lead, "contactStatus" | "qualification">): LeadGateState {
  if (isNotQualified(lead.qualification)) return "not_qualified";
  if (isNotContactedStatus(lead.contactStatus)) return "not_contacted";
  if (isQualifiedValue(lead.qualification)) return "qualified";
  return "contacted";
}

/**
 * Downstream (qualification-dependent) fields are GATED — shown as N/A and
 * never editable — when the lead is Not-Contacted or Not-Qualified. Core
 * identity (id/date/region/source/agent/contact) is never gated.
 */
export function isDownstreamGated(lead: Pick<Lead, "contactStatus" | "qualification">): boolean {
  const g = leadGateState(lead);
  return g === "not_contacted" || g === "not_qualified";
}

/* ─── Field status → lead milestone mapping ────────────────────────────────
   The Field module is the operational authority once a lead is routed to
   Pickup / On-Site. These buckets translate a Field Job's status into the
   coarse lead-facing milestone the Action/Result derivation reads. */

/** Field statuses that mean the Ninja is actively MOVING / working the job
 *  (device in transit or being repaired on-site) — the lead reads "In Transit". */
const FIELD_IN_TRANSIT: FieldJobStatus[] = [
  "out_for_pickup", "picked_up", "out_for_drop", "in_repair",
];
/** Field statuses that mean the job is merely ASSIGNED/scheduled but movement
 *  has not started — the lead reads "Field Assigned". */
const FIELD_ASSIGNED_ONLY: FieldJobStatus[] = [
  "pending_assignment", "assigned", "pickup_scheduled", "drop_scheduled", "ready_for_drop", "failed_pickup", "failed_drop",
];

export type FieldMilestone = "assigned" | "in_transit" | "at_store" | "completed" | "cancelled" | "none";

/** Coarse lead-facing milestone for a Field Job status. */
export function fieldMilestone(status: FieldJobStatus | ""): FieldMilestone {
  if (!status) return "none";
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "at_store" || status === "delivered") return "at_store";
  if (FIELD_IN_TRANSIT.includes(status)) return "in_transit";
  if (FIELD_ASSIGNED_ONLY.includes(status)) return "assigned";
  return "none";
}

/* ─── Status-selected routing INTENT ───────────────────────────────────────
   When a user sets the lead's STATUS to a routing value — "Pickup Assigned",
   "On site Assigned" or "Walkin Assigned" — that is an authoritative intent
   that drives the derived Action/Result BEFORE any real operational record is
   linked. The REAL linked records (field job / ticket / invoice) always win
   over this intent once they exist (so the real field status / ticket / invoice
   takes over). Match is case-insensitive substring so admin-renamed status
   values (via lead_options) still classify. */

export type LeadStatusIntent = "pickup" | "onsite" | "walkin" | "none";

export function leadStatusIntent(status: string): LeadStatusIntent {
  const s = (status || "").trim().toLowerCase();
  if (!s) return "none";
  // Walk-in intent — the customer will visit the store.
  if (/walk\s*-?\s*in/.test(s)) return "walkin";
  // Pickup & Drop intent — a field pickup is assigned.
  if (/pick\s*-?\s*up/.test(s)) return "pickup";
  // On-site / on site intent — a field on-site visit is assigned.
  if (/on\s*-?\s*site/.test(s)) return "onsite";
  return "none";
}

/* ─── The derived Result ───────────────────────────────────────────────────
   The Result cell evolves as the lead progresses and always reflects the
   HIGHEST-priority real outcome:
     invoice (₹value + Ticket + Invoice) > ticket created (Ticket id)
       > lead won (routed/assigned) > lost > pipeline > N/A. */

export type LeadResultKind =
  | "na"          // not applicable yet / gated
  | "pipeline"    // progressing, no operational completion yet
  | "lead_won"    // accepted operational path (routed / field assigned) — NOT revenue
  | "ticket"      // a real linked Ticket exists (no finalized invoice yet)
  | "invoice"     // a FINALIZED invoice exists → revenue realized
  | "lost";       // permanently closed without conversion

export interface LeadResult {
  kind: LeadResultKind;
  /** Primary line — money for an invoice, else a short label. */
  primary: string;
  /** The finalized invoice value (₹), only when kind === "invoice". */
  invoiceValue: number | null;
  /** Linked ticket display id (ticketNo) when known. */
  ticketNo: string;
  /** Linked ticket stable id (for click-through). */
  ticketId: string;
  /** Finalized invoice display id when known. */
  invoiceNo: string;
  /** Finalized invoice stable id (for click-through). */
  invoiceId: string;
}

export type LeadActionKind =
  | "na"
  | "not_contacted"
  | "follow_up"
  | "in_pipeline"
  | "deal"
  | "discount_approval"   // a Deal (discount approval) is pending / in review
  | "quotation_created"   // a quotation exists for the lead (not yet sent)
  | "quotation_sent"      // a quotation has been sent to the customer
  | "field_assigned"
  | "walkin_assigned"   // walk-in routed/assigned, customer not yet arrived
  | "visited_store"     // walk-in customer has arrived (ticket/invoice exists)
  | "in_transit"
  | "ticket_created"
  | "invoice_created"
  | "lost";

export interface LeadWorkflow {
  /** The gate (contact/qualification) — drives table N/A masking. */
  gate: LeadGateState;
  /** Whether downstream columns should render N/A (gated). */
  gated: boolean;
  /** System-derived ACTION — the latest meaningful operational event. */
  action: LeadActionKind;
  actionLabel: string;
  /** When the Action is driven by a LIVE Field Job (Pickup & Drop), the exact
   *  field service status + its tone — so the Lead Table mirrors the Field
   *  module's "Service Status" verbatim (e.g. "Out for Pickup", "At Store").
   *  Null when the Action is not field-driven (invoice/ticket/pipeline/etc.). */
  fieldStatus: FieldJobStatus | null;
  /** Tailwind ring+bg+text tone for the field status chip, when present. */
  fieldStatusTone: string;
  /** Human label for the field status, when present. */
  fieldStatusLabel: string;
  /** System-derived RESULT — the highest-priority real outcome. */
  result: LeadResult;
  /** A short human explanation of WHY this action/result was derived (tooltip
   *  / "why is this?" — keeps the read-only cell explainable, spec §31/§46). */
  reason: string;
}

/** The live business slice the derivation reads from (a slice of the store +
 *  field context). All arrays already store-scoped by the caller. */
export interface LeadWorkflowSources {
  walkIns: WalkIn[];
  fieldJobs: FieldJob[];
  tickets: Ticket[];
  invoices: Invoice[];
}

const NA_RESULT: LeadResult = {
  kind: "na", primary: "N/A", invoiceValue: null,
  ticketNo: "", ticketId: "", invoiceNo: "", invoiceId: "",
};

/** True when the lead's status/route reads as a Deal (the separate Deal path).
 *  The Deal module owns its own logic; here we only surface the link. */
function isDealLead(lead: Pick<Lead, "status" | "fulfilmentRoute">): boolean {
  const s = `${lead.status}`.toLowerCase();
  return s.includes("deal");
}

/** Resolve the linked Ticket for a lead (id or ticketNo), or null. */
export function resolveLeadTicket(lead: Lead, tickets: Ticket[]): Ticket | null {
  if (!lead.linkedTicketId) return null;
  return tickets.find((t) => t.id === lead.linkedTicketId || t.ticketNo === lead.linkedTicketId) ?? null;
}

/** Resolve the FINALIZED invoice for a lead, LIVE. Order:
 *   1) the lead's explicit linkedInvoiceId (if that invoice is finalized),
 *   2) a finalized invoice whose ticketId matches the lead's linked ticket.
 *  Only a FINALIZED (paid, non-proforma) invoice counts as revenue. */
export function resolveLeadFinalizedInvoice(lead: Lead, ticket: Ticket | null, invoices: Invoice[]): Invoice | null {
  const finalized = invoices.filter((inv) => isFinalizedInvoice({
    id: inv.id, ticketId: inv.ticketId, total: Number(inv.total || 0), status: inv.status, documentType: inv.documentType,
  }));
  if (lead.linkedInvoiceId) {
    const direct = finalized.find((inv) => inv.id === lead.linkedInvoiceId);
    if (direct) return direct;
  }
  if (ticket) {
    const viaTicket = finalized.find((inv) => inv.ticketId && (inv.ticketId === ticket.id || inv.ticketId === ticket.ticketNo));
    if (viaTicket) return viaTicket;
  }
  return null;
}

/** Resolve the Field Job for a lead, LIVE. Matches BOTH directions of the
 *  two-way link so the lead reflects the field service status even if one side
 *  of the link is momentarily missing:
 *    1) the lead's explicit `linkedFieldJobId`, else
 *    2) a Field Job whose `leadId` back-references this lead.
 *  Prefers a non-cancelled job; a cancelled job is only returned if it's the
 *  only match (so the "Lost" state still surfaces). */
export function resolveLeadFieldJob(lead: Lead, fieldJobs: FieldJob[]): FieldJob | null {
  // 1) Explicit forward link by id.
  if (lead.linkedFieldJobId) {
    const byId = fieldJobs.find((j) => j.id === lead.linkedFieldJobId);
    if (byId) return byId;
  }
  // 2) Reverse link by the field job's own leadId back-reference.
  const matches = fieldJobs.filter((j) => j.leadId && j.leadId === lead.id);
  if (matches.length === 0) return null;
  const active = matches.find((j) => j.status !== "cancelled");
  return active ?? matches[0];
}

/** Resolve the linked Walk-In for a lead, or null. */
export function resolveLeadWalkIn(lead: Lead, walkIns: WalkIn[]): WalkIn | null {
  if (!lead.linkedWalkInId) return null;
  return walkIns.find((w) => w.id === lead.linkedWalkInId) ?? null;
}

/* ─── ACTION / RESULT labels ───────────────────────────────────────────── */

export const LEAD_ACTION_LABEL: Record<LeadActionKind, string> = {
  na: "N/A",
  not_contacted: "Not Contacted",
  follow_up: "Follow-up",
  in_pipeline: "In Pipeline",
  deal: "Deal",
  discount_approval: "Discount Approval",
  quotation_created: "Quotation Created",
  quotation_sent: "Quotation Sent",
  field_assigned: "Field Assigned",
  walkin_assigned: "Walkin Assigned",
  visited_store: "Visited Store",
  in_transit: "In Transit",
  ticket_created: "Ticket Created",
  invoice_created: "Invoice Created",
  lost: "Lost",
};

/**
 * THE derivation. Given a lead and the live operational records, compute the
 * gate, the system Action and the system Result — never reading any stored
 * action/result field. Priority is highest-real-outcome first so an invoice
 * always wins over a ticket, which wins over "lead won"/pipeline (spec §36).
 *
 * `openFollowUpDue` (optional) tells us the lead has a due/overdue follow-up so
 * the Action can read "Follow-up" when nothing more advanced has happened.
 */
export function deriveLeadWorkflow(
  lead: Lead,
  src: LeadWorkflowSources,
  opts?: { openFollowUpDue?: boolean; deal?: LeadDeal | null; quotation?: LeadWorkflowQuotation | null },
): LeadWorkflow {
  const gate = leadGateState(lead);

  // Builder that fills the common fields + the field-status defaults so each
  // return stays terse. Pass `fieldStatus` only on the live field-job branch.
  const mk = (
    action: LeadActionKind,
    result: LeadResult,
    reason: string,
    actionLabel?: string,
    fieldStatus: FieldJobStatus | null = null,
  ): LeadWorkflow => ({
    gate,
    gated: gate === "not_contacted" || gate === "not_qualified",
    action,
    actionLabel: actionLabel ?? LEAD_ACTION_LABEL[action],
    result,
    reason,
    fieldStatus,
    fieldStatusTone: fieldStatus ? FIELD_STATUS_TONE[fieldStatus] : "",
    fieldStatusLabel: fieldStatus ? FIELD_STATUS_LABEL[fieldStatus] : "",
  });

  // ── Gated (Not-Contacted / Not-Qualified): no operational workflow. ──
  if (gate === "not_contacted") {
    return mk("not_contacted", NA_RESULT, "Lead has not been contacted yet — downstream workflow not started.");
  }
  if (gate === "not_qualified") {
    return mk("na", NA_RESULT, "Lead was marked Not Qualified — it never entered the operational workflow.");
  }

  // ── Resolve the linked-record graph (live). ──
  const ticket = resolveLeadTicket(lead, src.tickets);
  const invoice = resolveLeadFinalizedInvoice(lead, ticket, src.invoices);
  const fieldJob = resolveLeadFieldJob(lead, src.fieldJobs);
  const walkIn = resolveLeadWalkIn(lead, src.walkIns);
  const fm = fieldMilestone((fieldJob?.status ?? "") as FieldJobStatus | "");

  // The authoritative routing intent the user picked in Status
  // (Pickup Assigned / On site Assigned / Walkin Assigned). It drives the
  // Action/Result until a real operational record (field/ticket/invoice)
  // supersedes it. A walk-in intent routes the "ticket exists" branch to
  // "Visited Store" instead of the generic "Ticket Created".
  const intent = leadStatusIntent(lead.status);
  const isWalkinPath = intent === "walkin"
    || (lead.fulfilmentRoute || "").toUpperCase() === "STORE_VISIT"
    || !!(walkIn || lead.linkedWalkInId);

  const ticketNo = ticket ? (ticket.ticketNo || ticket.id) : (lead.linkedTicketId || "");
  const ticketId = ticket?.id || lead.linkedTicketId || "";

  // ── 1) FINALIZED INVOICE — highest priority (revenue realized). ──
  // This is the FINAL RESULT for every path (pickup / on-site / walk-in):
  // ₹invoice value highlighted, with the Ticket ID + Invoice ID beneath.
  if (invoice) {
    const value = Number(invoice.total || 0);
    const invoiceNo = invoice.id; // invoices use their id as the display number
    // A walk-in lead that reached payment has "Visited Store" as its action;
    // pickup / on-site stay "Invoice Created".
    const action: LeadActionKind = isWalkinPath ? "visited_store" : "invoice_created";
    return mk(
      action,
      {
        kind: "invoice",
        primary: `₹${value.toLocaleString("en-IN")}`,
        invoiceValue: value,
        ticketNo, ticketId,
        invoiceNo, invoiceId: invoice.id,
      },
      `Finalized invoice ${invoiceNo}${ticketNo ? ` (from ticket ${ticketNo})` : ""} — revenue realized${isWalkinPath ? " after the store visit" : ""}.`,
    );
  }

  // ── 2) REAL LINKED TICKET (no finalized invoice yet). ──
  // For a walk-in lead a ticket means the customer HAS arrived → "Visited
  // Store". For pickup / on-site it reads "Ticket Created".
  if (ticketId) {
    const action: LeadActionKind = isWalkinPath ? "visited_store" : "ticket_created";
    return mk(
      action,
      { ...NA_RESULT, kind: "ticket", primary: "Ticket Created", ticketNo, ticketId },
      isWalkinPath
        ? `Customer visited the store — ticket ${ticketNo} created, awaiting a finalized invoice.`
        : `Ticket ${ticketNo} created — awaiting a finalized invoice.`,
    );
  }

  // ── 3) LIVE FIELD JOB — reflect the EXACT field "Service Status". ──
  //   Once a Field Job (Pickup & Drop / On-Site) is linked, its OWN service
  //   status is the authority. The Action column mirrors the Field module's
  //   Service Status VERBATIM (e.g. "Out for Pickup", "At Store", "In Repair")
  //   so the sales agent sees the live progress. A cancelled job → Lost; every
  //   other live status keeps the Result at "Lead Won" (no revenue until an
  //   invoice). A completed job (no ticket yet) still shows "Completed".
  if (fieldJob) {
    const fieldStatus = fieldJob.status as FieldJobStatus;
    if (fm === "cancelled") {
      return mk("lost", { ...NA_RESULT, kind: "lost", primary: "Lost" }, "Linked field job was cancelled.", undefined, fieldStatus);
    }
    // The Action KIND is a coarse bucket (for the fallback label/tone), but the
    // cell will prefer the exact field status label+tone we carry here.
    const action: LeadActionKind =
      fm === "in_transit" || fm === "at_store" ? "in_transit" : "field_assigned";
    return mk(
      action,
      { ...NA_RESULT, kind: "lead_won", primary: "Lead Won" },
      `Field service status: ${FIELD_STATUS_LABEL[fieldStatus]}${fieldJob.ninjaName ? ` · ${fieldJob.ninjaName}` : ""} — live from Pickup & Drop.`,
      FIELD_STATUS_LABEL[fieldStatus], // actionLabel = the exact field status
      fieldStatus,
    );
  }

  // ── 4) PICKUP / ON-SITE status intent (no field job linked yet). ──
  //   Status set to "Pickup Assigned" / "On site Assigned" → the device is
  //   being collected / serviced in the field: Action = "In Transit",
  //   Result = "Lead Won" (until a ticket / invoice is generated). Once the
  //   Field module is linked, the real field status (section 3) takes over.
  if (intent === "pickup" || intent === "onsite") {
    const label = intent === "pickup" ? "Pickup" : "On-site";
    return mk(
      "in_transit",
      { ...NA_RESULT, kind: "lead_won", primary: "Lead Won" },
      `${label} assigned — device is being handled in the field; awaiting a ticket / invoice.`,
    );
  }

  // ── 5) WALK-IN assigned / routed but customer not yet arrived. ──
  //   Status set to "Walkin Assigned" (or routed STORE_VISIT / a linked
  //   walk-in) with no ticket/invoice yet → Action = "Walkin Assigned",
  //   Result = "Lead Won". When the customer visits (ticket/invoice created)
  //   section 1/2 flips the Action to "Visited Store".
  if (isWalkinPath) {
    return mk(
      "walkin_assigned",
      { ...NA_RESULT, kind: "lead_won", primary: "Lead Won" },
      "Walk-in assigned — awaiting the customer's store visit (ticket / invoice).",
    );
  }

  // ── 6) DEAL / DISCOUNT APPROVAL (real Deal record attached to the lead). ──
  //   A pending / changes-requested discount approval surfaces as the lead's
  //   current meaningful action. It sits BELOW real operational records (a
  //   ticket/invoice/field job always wins, §28) and does NOT win or lose the
  //   lead: Result stays "In Pipeline". An approved/rejected deal with no
  //   operational record yet falls through to the normal pipeline (approval is
  //   not a conversion — the agent must still convert the customer, §24/§25).
  const deal = opts?.deal ?? null;
  if (deal && (deal.status === "pending_approval" || deal.status === "changes_requested")) {
    const label = deal.status === "changes_requested" ? "Changes Requested" : "Pending Approval";
    return mk(
      "discount_approval",
      { ...NA_RESULT, kind: "pipeline", primary: label },
      `Discount approval ${deal.dealNo} is ${label.toLowerCase()} — the lead is in the Deal approval workflow.`,
      "Discount Approval",
    );
  }
  // An APPROVED / REJECTED deal reflects the manager's decision back on the
  // lead (so the queue decision is visible in the Lead Table). It is NOT a
  // conversion — approval only authorises the exception, rejection does NOT
  // lose the lead (§24/§25) — so Result stays "In Pipeline" and a more
  // advanced operational record above still wins.
  if (deal && (deal.status === "approved" || deal.status === "rejected")) {
    const approved = deal.status === "approved";
    return mk(
      "discount_approval",
      { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" },
      `Discount approval ${deal.dealNo} was ${approved ? "approved" : "rejected"} by the manager.`,
      approved ? "Deal Approved" : "Deal Rejected",
    );
  }

  // ── 6b) DEAL path by status label (link only; no real deal record). ──
  if (isDealLead(lead)) {
    return mk("deal", { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" }, "Lead is on the Deal path — see the linked Deal.");
  }

  // ── 6c) QUOTATION (a customer-facing offer exists). ──
  //   A quotation sits BELOW every real operational record (ticket / invoice /
  //   field job / walk-in) and below the Deal approval workflow — those always
  //   win (§62). It surfaces only when nothing more advanced has happened. A
  //   quotation is an OFFER, never revenue: Result stays "In Pipeline". It is
  //   derived from the lead's actual quotation record (never fabricated / never
  //   manually typed), so a user can't fake "Quotation Sent".
  const quotation = opts?.quotation ?? null;
  if (quotation && !isLostStatus(lead.status, lead.finalResult)) {
    const sent = !!(quotation.sentAt && quotation.sentAt.trim());
    return mk(
      sent ? "quotation_sent" : "quotation_created",
      { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" },
      sent
        ? "A quotation has been sent to the customer — awaiting their decision."
        : "A quotation has been created for this lead — review and send it.",
    );
  }

  // ── 7) LOST / terminal negative. ──
  if (isLostStatus(lead.status, lead.finalResult)) {
    return mk("lost", { ...NA_RESULT, kind: "lost", primary: "Lost" }, "Lead is lost / dropped / not eligible.");
  }

  // ── 8) FOLLOW-UP due (no operational record yet). ──
  if (opts?.openFollowUpDue) {
    return mk("follow_up", { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" }, "A follow-up is due — the lead is being actively worked.");
  }

  // ── 9) Default: contacted/qualified, in the pipeline. ──
  return mk("in_pipeline", { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" }, "Lead is qualified and progressing — no operational record yet.");
}

/* ─── Store derivation ─────────────────────────────────────────────────────
   The Store column reflects the store of the actual OPERATIONAL record, not a
   manually typed value. Priority: Ticket → Invoice → Field Job → the lead's own
   store scope. Returns a branch id (or "" when none is established yet). */
export function deriveLeadStoreBranchId(lead: Lead, src: LeadWorkflowSources): string {
  const ticket = resolveLeadTicket(lead, src.tickets);
  if (ticket?.branchId) return String(ticket.branchId);
  const invoice = resolveLeadFinalizedInvoice(lead, ticket, src.invoices)
    ?? src.invoices.find((inv) => lead.linkedInvoiceId && inv.id === lead.linkedInvoiceId) ?? null;
  if (invoice?.branchId) return String(invoice.branchId);
  const fieldJob = resolveLeadFieldJob(lead, src.fieldJobs);
  // Field jobs store the branch as a name/id string in `branch`.
  if (fieldJob?.branch) return String(fieldJob.branch);
  const walkIn = resolveLeadWalkIn(lead, src.walkIns);
  if (walkIn?.branchId) return String(walkIn.branchId);
  return lead.branchId || "";
}

/* ─── Action tone (read-only visual) ───────────────────────────────────────
   Action is SYSTEM-DERIVED and read-only. Restrained tones — gray for N/A,
   never the editable-dropdown look. */
export function leadActionTone(kind: LeadActionKind): string {
  switch (kind) {
    case "invoice_created": return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "ticket_created":  return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "in_transit":      return "bg-violet-50 text-violet-700 ring-violet-200";
    case "visited_store":   return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "walkin_assigned": return "bg-sky-50 text-sky-700 ring-sky-200";
    case "field_assigned":  return "bg-sky-50 text-sky-700 ring-sky-200";
    case "in_pipeline":     return "bg-sky-50 text-sky-700 ring-sky-200";
    case "follow_up":       return "bg-orange-50 text-orange-700 ring-orange-200";
    case "deal":            return "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200";
    case "discount_approval": return "bg-amber-50 text-amber-700 ring-amber-200";
    case "quotation_sent":    return "bg-blue-50 text-blue-700 ring-blue-200";
    case "quotation_created": return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "lost":            return "bg-rose-50 text-rose-600 ring-rose-200";
    case "not_contacted":   return "bg-zinc-100 text-zinc-500 ring-zinc-200";
    case "na":
    default:                return "bg-zinc-100 text-zinc-400 ring-zinc-200";
  }
}

/** Result tone for the primary line. */
export function leadResultTone(kind: LeadResultKind): string {
  switch (kind) {
    case "invoice":  return "text-emerald-700";
    case "ticket":   return "text-indigo-700";
    case "lead_won": return "text-emerald-700";
    case "lost":     return "text-rose-600";
    case "pipeline": return "text-sky-700";
    case "na":
    default:         return "text-zinc-400";
  }
}
