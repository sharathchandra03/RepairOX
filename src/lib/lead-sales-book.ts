/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Sales Book derivation (deterministic, pure, testable).

   This is the operational companion to the descriptive `lead-intelligence.ts`
   engine. Where the intelligence engine answers "what patterns am I seeing",
   the Sales Book answers the OPERATIONAL questions a salesperson / owner works
   from every day:

     • My/team PORTFOLIO — which leads exist, their stage, who owns them.
     • NEXT MOVES — a transparent, rule-based attention queue (never AI).
     • OUTCOME MAP — how leads flow from intake to commercial outcome.
     • FULFILMENT MOTIONS — Walk-In / Pickup / On-Site breakdown.
     • The LEAD LEDGER — one deduplicated row per lead with its real facts.
     • EXPORT rows — one row per lead, refund-aware, invoice/ticket as separate
       reference columns (never a one-to-many row explosion).

   It REUSES the canonical helpers — it never forks the lead model, the
   qualification/revenue rules, or the Action/Result derivation:
     - isQualifiedLead / isWonStatus / isLostStatus / leadExpectedValue
     - revenueWonForLead (gross) + revenueWonNetForLead (net of succeeded refunds)
     - deriveLeadWorkflow (system-derived Action / Result / Store — read-only)
     - followUpLifecycle (datetime-precise follow-up state)

   Nothing here is stored and nothing is fabricated: a missing relationship is
   reported as "not established", never as a zero business result.
   ────────────────────────────────────────────────────────────────────────── */

import {
  followUpLifecycle,
  isFinalizedInvoice,
  isLostStatus,
  isQualifiedLead,
  isWonStatus,
  leadExpectedValue,
  revenueWonForLead,
  revenueWonNetForLead,
  type Lead,
  type LeadFollowUp,
  type RevenueInvoiceLike,
  type RevenueRefundLike,
  type RevenueTicketLike,
} from "@/lib/leads-data";
import { deriveLeadWorkflow, type LeadWorkflowSources } from "@/lib/lead-workflow";
import type { Invoice, Ticket, WalkIn } from "@/lib/mock-data";
import type { FieldJob } from "@/lib/field-data";
import { normaliseRoute, type FulfilmentRoute } from "@/lib/field-data";

const DAY = 86_400_000;

/** Tunable operational constants (documented, not a settings UI). */
export const SALES_BOOK = {
  /** A lead with no recorded activity for this long is "stalled". */
  STALE_DAYS: 8,
  /** A qualified open lead with no progress for this long needs attention. */
  QUALIFIED_STALE_DAYS: 5,
} as const;

/* ═══════════════════════════════════════════════════════════════════════
   LEAD LEDGER ROW — one row per lead, every value real.
   ═══════════════════════════════════════════════════════════════════════ */

/** Mutually-exclusive lifecycle stage (one lead sits in exactly one). */
export type LeadStage =
  | "new" | "in_progress" | "qualified" | "won" | "lost";

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: "New / Uncontacted",
  in_progress: "In Progress",
  qualified: "Qualified",
  won: "Won / Converted",
  lost: "Lost / Disqualified",
};

/** The operational mode of a lead (the Sales routing decision). "" = not yet
 *  routed — surfaced honestly as its own bucket, never guessed. */
export type LeadMode = FulfilmentRoute | "";

export const LEAD_MODE_LABEL: Record<LeadMode, string> = {
  STORE_VISIT: "Walk-In",
  PICKUP_DROP: "Pickup & Drop",
  ON_SITE: "On-Site",
  "": "Not routed",
};

/** A fully-derived ledger row for ONE lead. Pure data — the UI renders it. */
export interface LeadLedgerRow {
  lead: Lead;
  leadNo: string;
  leadId: string;
  name: string;
  createdAt: string;
  agentId: string;
  agentName: string;
  branchId: string;

  /** Lifecycle stage (mutually exclusive). */
  stage: LeadStage;
  /** System-derived Action label (read-only; from deriveLeadWorkflow). */
  actionLabel: string;
  /** System-derived Result summary primary line. */
  resultLabel: string;
  resultKind: string;
  qualified: boolean;
  won: boolean;
  lost: boolean;

  source: string;
  region: string;
  category: string;
  mode: LeadMode;

  /** Expected / pipeline value (never revenue). */
  expectedValue: number;
  /** Finalized gross revenue reachable from this lead. */
  revenueGross: number;
  /** Finalized revenue minus succeeded refunds on its invoices (≥ 0). */
  revenueNet: number;
  /** Gross − Net (refund attributable to this lead), ≥ 0. */
  refundAmount: number;

  /** Linked operational records (ids + display refs). */
  ticketNo: string;
  ticketId: string;
  invoiceNo: string;
  invoiceId: string;
  walkInId: string;
  fieldJobId: string;
  hasTicket: boolean;
  hasInvoice: boolean;

  /** Next open follow-up (if any) + its datetime-precise lifecycle state. */
  nextFollowUpAt: string;
  followUpState: "none" | "Pending" | "Due" | "Overdue";
  /** The most recent recorded activity timestamp (ms), 0 when nothing recorded. */
  lastActivityMs: number;
  /** Whether ANY outreach/activity was recorded in the system (honest). */
  hasRecordedActivity: boolean;
  /** Days since the last recorded activity (or lead creation when none). */
  daysSinceActivity: number;
}

/** Latest recorded activity for a lead from REAL records only (follow-ups +
 *  lead terminal/timing timestamps). Returns 0 when nothing is recorded beyond
 *  creation — the caller distinguishes "no recorded activity". */
function lastRecordedActivityMs(lead: Lead, followUps: LeadFollowUp[]): number {
  const times: number[] = [];
  const push = (v?: string | null) => {
    if (!v) return;
    const t = new Date(v).getTime();
    if (Number.isFinite(t) && t > 0) times.push(t);
  };
  push(lead.firstContactedAt);
  push(lead.qualifiedAt);
  push(lead.convertedAt);
  push(lead.lostAt);
  push(lead.routedAt);
  push(lead.assignedAt);
  for (const f of followUps) {
    if (f.leadId !== lead.id) continue;
    push(f.createdAt);
    push(f.completedAt);
  }
  return times.length ? Math.max(...times) : 0;
}

function leadCreatedMs(lead: Lead): number {
  const t = new Date(lead.createdAt || `${lead.date}T${lead.time || "00:00"}:00`).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Which mutually-exclusive stage a lead occupies. Highest terminal wins. */
export function leadStage(lead: Lead): LeadStage {
  if (isWonStatus(lead.status, lead.finalResult)) return "won";
  if (isLostStatus(lead.status, lead.finalResult) || lead.lostAt) return "lost";
  if (isQualifiedLead(lead)) return "qualified";
  const contact = (lead.contactStatus || "").trim().toLowerCase();
  const contacted = !!lead.firstContactedAt || (!!contact && !/not\s*contacted|^new$/.test(contact));
  return contacted ? "in_progress" : "new";
}

export interface SalesBookSources {
  tickets: Ticket[];
  invoices: Invoice[];
  refunds?: RevenueRefundLike[];
  walkIns?: WalkIn[];
  fieldJobs?: FieldJob[];
}

/** Build the fully-derived ledger row for one lead. */
export function buildLeadLedgerRow(
  lead: Lead,
  followUps: LeadFollowUp[],
  src: SalesBookSources,
  asOf: number = Date.now(),
): LeadLedgerRow {
  const workflowSrc: LeadWorkflowSources = {
    walkIns: src.walkIns ?? [],
    fieldJobs: src.fieldJobs ?? [],
    tickets: src.tickets,
    invoices: src.invoices,
  };
  const leadFollowUps = followUps
    .filter((f) => f.leadId === lead.id)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const openFollowUp = leadFollowUps.find((f) => f.status === "scheduled" || f.status === "missed");
  const followUpState = openFollowUp
    ? (() => { const s = followUpLifecycle(openFollowUp, asOf); return s === "Completed" || s === "Cancelled" ? "none" : s; })()
    : "none";

  const wf = deriveLeadWorkflow(lead, workflowSrc, {
    openFollowUpDue: followUpState === "Due" || followUpState === "Overdue",
  });

  const revenueGross = revenueWonForLead(lead, src.tickets, src.invoices);
  const revenueNet = src.refunds
    ? revenueWonNetForLead(lead, src.tickets, src.invoices, src.refunds)
    : revenueGross;

  const lastActivityMs = lastRecordedActivityMs(lead, leadFollowUps);
  const createdMs = leadCreatedMs(lead);
  const activityBase = lastActivityMs || createdMs;
  const daysSinceActivity = activityBase ? Math.max(0, Math.floor((asOf - activityBase) / DAY)) : 0;

  return {
    lead,
    leadNo: lead.leadNo,
    leadId: lead.id,
    name: lead.name || lead.leadNo,
    createdAt: lead.createdAt || `${lead.date}T${lead.time || "00:00"}:00`,
    agentId: lead.assignedTo || "",
    agentName: lead.assignedToName || "",
    branchId: lead.branchId || "",

    stage: leadStage(lead),
    actionLabel: wf.actionLabel,
    resultLabel: wf.result.primary,
    resultKind: wf.result.kind,
    qualified: isQualifiedLead(lead),
    won: isWonStatus(lead.status, lead.finalResult),
    lost: isLostStatus(lead.status, lead.finalResult) || !!lead.lostAt,

    source: lead.source || "",
    region: lead.region || "",
    category: lead.category || lead.leadCategory || "",
    mode: (normaliseRoute(lead.fulfilmentRoute) || "") as LeadMode,

    expectedValue: Math.max(0, Number(leadExpectedValue(lead) || 0)),
    revenueGross,
    revenueNet,
    refundAmount: Math.max(0, revenueGross - revenueNet),

    ticketNo: wf.result.ticketNo || lead.linkedTicketId || "",
    ticketId: wf.result.ticketId || lead.linkedTicketId || "",
    invoiceNo: wf.result.invoiceNo || "",
    invoiceId: wf.result.invoiceId || lead.linkedInvoiceId || "",
    walkInId: lead.linkedWalkInId || "",
    fieldJobId: lead.linkedFieldJobId || "",
    hasTicket: !!lead.linkedTicketId,
    hasInvoice: revenueGross > 0 || !!lead.linkedInvoiceId,

    nextFollowUpAt: openFollowUp?.dueAt || "",
    followUpState,
    lastActivityMs,
    hasRecordedActivity: lastActivityMs > 0,
    daysSinceActivity,
  };
}

/** Build ledger rows for a scope of leads (already authorized + agent-scoped). */
export function buildLeadLedger(
  leads: Lead[],
  followUps: LeadFollowUp[],
  src: SalesBookSources,
  asOf: number = Date.now(),
): LeadLedgerRow[] {
  return leads
    .map((lead) => buildLeadLedgerRow(lead, followUps, src, asOf))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/* ═══════════════════════════════════════════════════════════════════════
   PORTFOLIO STATUS RAIL — mutually-exclusive stage distribution + flags.
   ═══════════════════════════════════════════════════════════════════════ */

export interface StatusRailSegment {
  key: LeadStage | "all" | "attention";
  label: string;
  count: number;
  /** Lead ids in this segment (evidence). */
  leadIds: string[];
  /** Mutually exclusive stage (true) vs an overlapping flag (false). */
  exclusive: boolean;
}

/** Build the portfolio status rail. The five stages are mutually exclusive;
 *  "All" and "Needs Attention" are separate overlapping views so a lead is
 *  never double-counted inside the exclusive distribution. */
export function buildStatusRail(rows: LeadLedgerRow[]): StatusRailSegment[] {
  const byStage = (stage: LeadStage) => rows.filter((r) => r.stage === stage);
  const attention = rows.filter(
    (r) => r.followUpState === "Overdue"
      || (!r.lost && !r.won && (!r.hasRecordedActivity || r.daysSinceActivity >= SALES_BOOK.STALE_DAYS))
      || (r.qualified && !r.won && !r.lost && r.followUpState === "none"),
  );
  const seg = (key: StatusRailSegment["key"], label: string, list: LeadLedgerRow[], exclusive: boolean): StatusRailSegment => ({
    key, label, count: list.length, leadIds: list.map((r) => r.leadId), exclusive,
  });
  return [
    seg("all", "All Leads", rows, false),
    seg("new", LEAD_STAGE_LABEL.new, byStage("new"), true),
    seg("in_progress", LEAD_STAGE_LABEL.in_progress, byStage("in_progress"), true),
    seg("qualified", LEAD_STAGE_LABEL.qualified, byStage("qualified"), true),
    seg("won", LEAD_STAGE_LABEL.won, byStage("won"), true),
    seg("lost", LEAD_STAGE_LABEL.lost, byStage("lost"), true),
    seg("attention", "Needs Attention", attention, false),
  ];
}

/* ═══════════════════════════════════════════════════════════════════════
   NEXT MOVES — transparent, rule-based attention queue (never AI).
   ═══════════════════════════════════════════════════════════════════════ */

export type NextMoveKind =
  | "follow_up_overdue"
  | "follow_up_due_today"
  | "no_next_follow_up"
  | "no_recorded_outreach"
  | "stalled"
  | "qualified_no_progress"
  | "won_without_invoice";

export interface NextMove {
  kind: NextMoveKind;
  /** Short, human category shown as the item heading prefix. */
  category: string;
  /** The exact supporting record / reason (why it is shown). */
  reason: string;
  /** The recommended next action. */
  action: string;
  /** Severity drives colour: attention (amber) / urgent (rose) / info (blue). */
  tone: "urgent" | "attention" | "info";
  leadId: string;
  leadNo: string;
  leadName: string;
  /** Sort weight (higher = more urgent). */
  weight: number;
}

/** Deterministic rules. Each lead contributes AT MOST ONE move (its most urgent
 *  condition), so the queue is a prioritised to-do list, not a noisy repeat. */
export function buildNextMoves(rows: LeadLedgerRow[], asOf: number = Date.now()): NextMove[] {
  const moves: NextMove[] = [];
  for (const r of rows) {
    const base = { leadId: r.leadId, leadNo: r.leadNo, leadName: r.name };

    // Won lead missing its finalized commercial record (only when a ticket
    // exists — that is the point a finalized invoice is expected).
    if (r.won && r.hasTicket && !r.hasInvoice) {
      moves.push({ ...base, kind: "won_without_invoice", category: "Won, no finalized invoice",
        reason: `Won with Ticket ${r.ticketNo || r.ticketId} but no finalized (paid) invoice yet.`,
        action: "Review the ticket and finalize the invoice.", tone: "attention", weight: 55 });
      continue;
    }
    // Terminal leads need no further moves.
    if (r.won || r.lost) continue;

    if (r.followUpState === "Overdue") {
      const days = r.nextFollowUpAt ? Math.max(0, Math.floor((asOf - new Date(r.nextFollowUpAt).getTime()) / DAY)) : 0;
      moves.push({ ...base, kind: "follow_up_overdue", category: "Follow-up overdue",
        reason: days >= 1 ? `Follow-up was due ${days} day${days === 1 ? "" : "s"} ago.` : "Follow-up is past its scheduled time.",
        action: "Contact the customer and reschedule or complete the follow-up.", tone: "urgent", weight: 100 + days });
      continue;
    }
    if (r.followUpState === "Due") {
      moves.push({ ...base, kind: "follow_up_due_today", category: "Follow-up due today",
        reason: "A follow-up is scheduled for today.",
        action: "Complete today's follow-up.", tone: "attention", weight: 80 });
      continue;
    }
    if (!r.hasRecordedActivity) {
      moves.push({ ...base, kind: "no_recorded_outreach", category: "No recorded outreach",
        reason: "No contact or activity is recorded in the system for this lead.",
        action: "Make first contact (or log the outreach that already happened).", tone: "attention", weight: 70 });
      continue;
    }
    if (r.qualified && r.followUpState === "none" && r.daysSinceActivity >= SALES_BOOK.QUALIFIED_STALE_DAYS) {
      moves.push({ ...base, kind: "qualified_no_progress", category: "Qualified, no recent progress",
        reason: `Qualified lead with no next follow-up and last recorded activity ${r.daysSinceActivity} days ago.`,
        action: "Review the lead and schedule a follow-up.", tone: "attention", weight: 60 });
      continue;
    }
    if (r.followUpState === "none" && !r.qualified) {
      moves.push({ ...base, kind: "no_next_follow_up", category: "No next action",
        reason: "This open lead has no scheduled follow-up.",
        action: "Schedule a follow-up to keep the lead moving.", tone: "info", weight: 40 });
      continue;
    }
    if (r.daysSinceActivity >= SALES_BOOK.STALE_DAYS) {
      moves.push({ ...base, kind: "stalled", category: "Stalled lead",
        reason: `No recorded activity for ${r.daysSinceActivity} days.`,
        action: "Re-engage the customer or review the lead.", tone: "info", weight: 50 });
    }
  }
  return moves.sort((a, b) => b.weight - a.weight || a.leadNo.localeCompare(b.leadNo));
}

/* ═══════════════════════════════════════════════════════════════════════
   PORTFOLIO OUTCOME MAP — lifecycle milestones (counts + evidence).
   ═══════════════════════════════════════════════════════════════════════ */

export interface OutcomeMilestone {
  key: "created" | "assigned" | "qualified" | "progressing" | "won" | "ticket" | "invoice";
  label: string;
  count: number;
  leadIds: string[];
  /** A terminal/commercial milestone (shown distinctly from pipeline stages). */
  commercial: boolean;
}

export function buildOutcomeMap(rows: LeadLedgerRow[]): OutcomeMilestone[] {
  const pick = (fn: (r: LeadLedgerRow) => boolean) => rows.filter(fn);
  const created = rows;
  const assigned = pick((r) => !!r.agentId);
  const qualified = pick((r) => r.qualified);
  const progressing = pick((r) => !r.won && !r.lost && (r.mode !== "" || r.hasTicket || r.qualified));
  const won = pick((r) => r.won);
  const ticket = pick((r) => r.hasTicket);
  const invoice = pick((r) => r.hasInvoice && r.revenueGross > 0);
  const mk = (key: OutcomeMilestone["key"], label: string, list: LeadLedgerRow[], commercial: boolean): OutcomeMilestone =>
    ({ key, label, count: list.length, leadIds: list.map((r) => r.leadId), commercial });
  return [
    mk("created", "Created", created, false),
    mk("assigned", "Assigned", assigned, false),
    mk("qualified", "Qualified", qualified, false),
    mk("progressing", "Progressing", progressing, false),
    mk("won", "Won", won, false),
    mk("ticket", "Ticket", ticket, true),
    mk("invoice", "Finalized invoice", invoice, true),
  ];
}

/* ═══════════════════════════════════════════════════════════════════════
   FULFILMENT & SALES MOTIONS — Walk-In / Pickup / On-Site (+ Not routed).
   ═══════════════════════════════════════════════════════════════════════ */

export interface FulfilmentMotionRow {
  mode: LeadMode;
  label: string;
  leads: number;
  won: number;
  tickets: number;
  invoices: number;
  revenueNet: number;
  refunds: number;
  overdueFollowUps: number;
  leadIds: string[];
}

export function buildFulfilmentMotions(rows: LeadLedgerRow[]): FulfilmentMotionRow[] {
  const order: LeadMode[] = ["STORE_VISIT", "PICKUP_DROP", "ON_SITE", ""];
  return order.map((mode) => {
    const list = rows.filter((r) => r.mode === mode);
    return {
      mode,
      label: LEAD_MODE_LABEL[mode],
      leads: list.length,
      won: list.filter((r) => r.won).length,
      tickets: list.filter((r) => r.hasTicket).length,
      invoices: list.filter((r) => r.hasInvoice && r.revenueGross > 0).length,
      revenueNet: list.reduce((s, r) => s + r.revenueNet, 0),
      refunds: list.reduce((s, r) => s + r.refundAmount, 0),
      overdueFollowUps: list.filter((r) => r.followUpState === "Overdue").length,
      leadIds: list.map((r) => r.leadId),
    };
  }).filter((row) => row.leads > 0);
}

/* ═══════════════════════════════════════════════════════════════════════
   AGENT ROSTER (owner) — one reconciled row per agent.
   ═══════════════════════════════════════════════════════════════════════ */

export interface AgentRosterRow {
  agentId: string;
  activeLeads: number;
  qualified: number;
  won: number;
  revenueNet: number;
  tickets: number;
  invoices: number;
  overdueFollowUps: number;
  noNextAction: number;
  stalled: number;
  lastActivityMs: number;
  totalLeads: number;
}

/** Aggregate an agent's ledger rows into a roster row. Every column is a
 *  reconciled count/sum over unique leads — no composite score. */
export function buildAgentRosterRow(agentId: string, rows: LeadLedgerRow[]): AgentRosterRow {
  return {
    agentId,
    totalLeads: rows.length,
    activeLeads: rows.filter((r) => !r.won && !r.lost).length,
    qualified: rows.filter((r) => r.qualified).length,
    won: rows.filter((r) => r.won).length,
    revenueNet: rows.reduce((s, r) => s + r.revenueNet, 0),
    tickets: rows.filter((r) => r.hasTicket).length,
    invoices: rows.filter((r) => r.hasInvoice && r.revenueGross > 0).length,
    overdueFollowUps: rows.filter((r) => r.followUpState === "Overdue").length,
    noNextAction: rows.filter((r) => !r.won && !r.lost && r.followUpState === "none").length,
    stalled: rows.filter((r) => !r.won && !r.lost && (!r.hasRecordedActivity || r.daysSinceActivity >= SALES_BOOK.STALE_DAYS)).length,
    lastActivityMs: rows.reduce((m, r) => Math.max(m, r.lastActivityMs), 0),
  };
}

export type RosterSortKey =
  | "revenueNet" | "won" | "qualified" | "activeLeads" | "totalLeads"
  | "tickets" | "invoices" | "overdueFollowUps" | "noNextAction" | "stalled" | "lastActivityMs";

export function sortRoster(rows: AgentRosterRow[], key: RosterSortKey, dir: "asc" | "desc" = "desc"): AgentRosterRow[] {
  const mul = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => mul * ((a[key] as number) - (b[key] as number)) || b.revenueNet - a.revenueNet);
}

/* ═══════════════════════════════════════════════════════════════════════
   SAVED LEDGER VIEWS — overlapping, role-aware tabs.
   ═══════════════════════════════════════════════════════════════════════ */

export type LedgerViewKey =
  | "all" | "active" | "won" | "invoice" | "ticket"
  | "onsite" | "pickup" | "store" | "overdue" | "no_action";

export interface LedgerView {
  key: LedgerViewKey;
  label: string;
  predicate: (r: LeadLedgerRow) => boolean;
}

/** The saved views. These DELIBERATELY overlap (an invoiced lead is also a won
 *  lead and a ticket lead) — they are filters, not mutually-exclusive buckets. */
export const LEDGER_VIEWS: LedgerView[] = [
  { key: "all", label: "All Leads", predicate: () => true },
  { key: "active", label: "Active", predicate: (r) => !r.won && !r.lost },
  { key: "won", label: "Won", predicate: (r) => r.won },
  { key: "invoice", label: "Invoice Generated", predicate: (r) => r.hasInvoice && r.revenueGross > 0 },
  { key: "ticket", label: "Ticket Generated", predicate: (r) => r.hasTicket },
  { key: "onsite", label: "On-Site", predicate: (r) => r.mode === "ON_SITE" },
  { key: "pickup", label: "Pickup", predicate: (r) => r.mode === "PICKUP_DROP" },
  { key: "store", label: "Store / Walk-In", predicate: (r) => r.mode === "STORE_VISIT" },
  { key: "overdue", label: "Overdue Follow-ups", predicate: (r) => r.followUpState === "Overdue" },
  { key: "no_action", label: "No Next Action", predicate: (r) => !r.won && !r.lost && r.followUpState === "none" },
];

export function ledgerViewCount(rows: LeadLedgerRow[], key: LedgerViewKey): number {
  const view = LEDGER_VIEWS.find((v) => v.key === key);
  return view ? rows.filter(view.predicate).length : 0;
}

/* ═══════════════════════════════════════════════════════════════════════
   EXPORT ROW-BUILDER — one row per lead, refund-aware, no row explosion.
   ═══════════════════════════════════════════════════════════════════════ */

export const SALES_BOOK_EXPORT_COLUMNS = [
  "Lead No", "Lead ID", "Customer", "Created", "Sales Agent", "Agent ID",
  "Store", "Stage", "Status", "Action", "Result", "Qualified", "Won",
  "Source", "Region", "Category", "Mode",
  "Expected Value", "Revenue (Net)", "Revenue (Gross)", "Refund",
  "Ticket No", "Invoice No", "Walk-In", "Field Job",
  "Next Follow-up", "Follow-up State", "Last Activity", "Days Since Activity",
] as const;

function isoDate(v: string | number): string {
  const t = typeof v === "number" ? v : new Date(v).getTime();
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString().slice(0, 10) : "";
}

/** One export row per lead. Invoice / ticket are SEPARATE reference columns so
 *  a lead with multiple linked records is NEVER duplicated into multiple rows. */
export function buildSalesBookExportRows(
  rows: LeadLedgerRow[],
  storeNames: Record<string, string> = {},
): (string | number)[][] {
  return rows.map((r) => [
    r.leadNo,
    r.leadId,
    r.name,
    isoDate(r.createdAt),
    r.agentName || "Unassigned",
    r.agentId,
    storeNames[r.branchId] || r.branchId || "",
    LEAD_STAGE_LABEL[r.stage],
    r.lead.status || "",
    r.actionLabel,
    r.resultLabel,
    r.qualified ? "Yes" : "No",
    r.won ? "Yes" : "No",
    r.source,
    r.region,
    r.category,
    LEAD_MODE_LABEL[r.mode],
    r.expectedValue,
    r.revenueNet,
    r.revenueGross,
    r.refundAmount,
    r.ticketNo || "",
    r.invoiceNo || "",
    r.walkInId || "",
    r.fieldJobId || "",
    isoDate(r.nextFollowUpAt),
    r.followUpState === "none" ? "" : r.followUpState,
    isoDate(r.lastActivityMs),
    r.daysSinceActivity,
  ]);
}

export type ExportPreset = LedgerViewKey | "current";

export const EXPORT_PRESETS: { key: ExportPreset; label: string }[] = [
  { key: "current", label: "Current view (filtered)" },
  { key: "all", label: "All permitted leads" },
  { key: "won", label: "Won / converted leads" },
  { key: "invoice", label: "Invoice-generated leads" },
  { key: "ticket", label: "Ticket-generated leads" },
  { key: "onsite", label: "On-Site leads" },
  { key: "pickup", label: "Pickup leads" },
  { key: "store", label: "Store / Walk-In leads" },
  { key: "overdue", label: "Overdue follow-ups" },
  { key: "no_action", label: "No next action" },
];

/** Resolve the rows for an export preset. `current` uses the already-filtered
 *  rows the caller passes in; the others filter the full permitted set. */
export function resolveExportRows(
  preset: ExportPreset,
  currentRows: LeadLedgerRow[],
  allRows: LeadLedgerRow[],
): LeadLedgerRow[] {
  if (preset === "current") return currentRows;
  const view = LEDGER_VIEWS.find((v) => v.key === preset);
  return view ? allRows.filter(view.predicate) : allRows;
}

/* Re-export minimal types used by callers so the UI imports one module. */
export type { RevenueRefundLike } from "@/lib/leads-data";
