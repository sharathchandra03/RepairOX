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
  | "field_assigned"
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

/** Resolve the linked Field Job for a lead, or null. */
export function resolveLeadFieldJob(lead: Lead, fieldJobs: FieldJob[]): FieldJob | null {
  if (!lead.linkedFieldJobId) return null;
  return fieldJobs.find((j) => j.id === lead.linkedFieldJobId) ?? null;
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
  field_assigned: "Field Assigned",
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
  opts?: { openFollowUpDue?: boolean },
): LeadWorkflow {
  const gate = leadGateState(lead);

  // ── Gated (Not-Contacted / Not-Qualified): no operational workflow. ──
  if (gate === "not_contacted") {
    return { gate, gated: true, action: "not_contacted", actionLabel: LEAD_ACTION_LABEL.not_contacted, result: NA_RESULT, reason: "Lead has not been contacted yet — downstream workflow not started." };
  }
  if (gate === "not_qualified") {
    return { gate, gated: true, action: "na", actionLabel: LEAD_ACTION_LABEL.na, result: NA_RESULT, reason: "Lead was marked Not Qualified — it never entered the operational workflow." };
  }

  // ── Resolve the linked-record graph (live). ──
  const ticket = resolveLeadTicket(lead, src.tickets);
  const invoice = resolveLeadFinalizedInvoice(lead, ticket, src.invoices);
  const fieldJob = resolveLeadFieldJob(lead, src.fieldJobs);
  const walkIn = resolveLeadWalkIn(lead, src.walkIns);
  const fm = fieldMilestone((fieldJob?.status ?? "") as FieldJobStatus | "");

  const ticketNo = ticket ? (ticket.ticketNo || ticket.id) : (lead.linkedTicketId || "");
  const ticketId = ticket?.id || lead.linkedTicketId || "";

  // ── 1) FINALIZED INVOICE — highest priority (revenue realized). ──
  if (invoice) {
    const value = Number(invoice.total || 0);
    const invoiceNo = invoice.id; // invoices use their id as the display number
    return {
      gate, gated: false,
      action: "invoice_created", actionLabel: LEAD_ACTION_LABEL.invoice_created,
      result: {
        kind: "invoice",
        primary: `₹${value.toLocaleString("en-IN")}`,
        invoiceValue: value,
        ticketNo, ticketId,
        invoiceNo, invoiceId: invoice.id,
      },
      reason: `Finalized invoice ${invoiceNo}${ticketNo ? ` (from ticket ${ticketNo})` : ""} — revenue realized.`,
    };
  }

  // ── 2) REAL LINKED TICKET (no finalized invoice yet). ──
  if (ticketId) {
    return {
      gate, gated: false,
      action: "ticket_created", actionLabel: LEAD_ACTION_LABEL.ticket_created,
      result: { ...NA_RESULT, kind: "ticket", primary: "Ticket Created", ticketNo, ticketId },
      reason: `Ticket ${ticketNo} created — awaiting a finalized invoice.`,
    };
  }

  // ── 3) FIELD JOB milestones (Pickup / On-Site operational authority). ──
  if (fieldJob) {
    if (fm === "cancelled") {
      return { gate, gated: false, action: "lost", actionLabel: LEAD_ACTION_LABEL.lost, result: { ...NA_RESULT, kind: "lost", primary: "Lost" }, reason: "Linked field job was cancelled." };
    }
    if (fm === "in_transit") {
      return { gate, gated: false, action: "in_transit", actionLabel: LEAD_ACTION_LABEL.in_transit, result: { ...NA_RESULT, kind: "lead_won", primary: "Lead Won" }, reason: "Field Ninja is in transit / servicing — device in motion." };
    }
    // at_store / completed (no ticket yet) or assigned → the field job is the
    // accepted operational path: Lead Won, action = Field Assigned/In Transit.
    if (fm === "at_store") {
      return { gate, gated: false, action: "in_transit", actionLabel: LEAD_ACTION_LABEL.in_transit, result: { ...NA_RESULT, kind: "lead_won", primary: "Lead Won" }, reason: "Device reached the store via the field job — awaiting ticket." };
    }
    // assigned / completed-without-ticket
    return { gate, gated: false, action: "field_assigned", actionLabel: LEAD_ACTION_LABEL.field_assigned, result: { ...NA_RESULT, kind: "lead_won", primary: "Lead Won" }, reason: "Field job assigned to a Ninja — sales opportunity accepted into service." };
  }

  // ── 4) WALK-IN routed but customer not yet arrived (no field job/ticket). ──
  if (walkIn || (lead.linkedWalkInId) || (lead.fulfilmentRoute || "").toUpperCase() === "STORE_VISIT") {
    // A converted walk-in without a ticket still reads as pipeline/lead-won.
    return {
      gate, gated: false,
      action: "in_pipeline", actionLabel: LEAD_ACTION_LABEL.in_pipeline,
      result: { ...NA_RESULT, kind: "lead_won", primary: "Lead Won" },
      reason: "Routed to a Walk-In — sales intent accepted; awaiting the store visit.",
    };
  }

  // ── 5) DEAL path (link only; Deal module owns its logic). ──
  if (isDealLead(lead)) {
    return { gate, gated: false, action: "deal", actionLabel: LEAD_ACTION_LABEL.deal, result: { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" }, reason: "Lead is on the Deal path — see the linked Deal." };
  }

  // ── 6) LOST / terminal negative. ──
  if (isLostStatus(lead.status, lead.finalResult)) {
    return { gate, gated: false, action: "lost", actionLabel: LEAD_ACTION_LABEL.lost, result: { ...NA_RESULT, kind: "lost", primary: "Lost" }, reason: "Lead is lost / dropped / not eligible." };
  }

  // ── 7) FOLLOW-UP due (no operational record yet). ──
  if (opts?.openFollowUpDue) {
    return { gate, gated: false, action: "follow_up", actionLabel: LEAD_ACTION_LABEL.follow_up, result: { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" }, reason: "A follow-up is due — the lead is being actively worked." };
  }

  // ── 8) Default: contacted/qualified, in the pipeline. ──
  return {
    gate, gated: false,
    action: "in_pipeline", actionLabel: LEAD_ACTION_LABEL.in_pipeline,
    result: { ...NA_RESULT, kind: "pipeline", primary: "In Pipeline" },
    reason: "Lead is qualified and progressing — no operational record yet.",
  };
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
    case "field_assigned":  return "bg-sky-50 text-sky-700 ring-sky-200";
    case "in_pipeline":     return "bg-sky-50 text-sky-700 ring-sky-200";
    case "follow_up":       return "bg-orange-50 text-orange-700 ring-orange-200";
    case "deal":            return "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200";
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
