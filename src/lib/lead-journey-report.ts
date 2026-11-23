/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Journey Report (pure, deterministic).
   Answers two questions from the lead's real footprint (history rows, never
   stored counters):
     1. FOLLOW-UP → CONVERSION   how many leads converted, how many completed
        follow-ups they needed first, and which follow-up outcomes were
        followed by a conversion.
     2. LOST → REVIVED           which leads were Lost and later moved on, how
        long they sat Lost, and how many of those went on to convert.
   Part of the Lead Intelligence engine family: same cohort in, same evidence ids
   out, same sample-size protection and descriptive wording (association, not
   causation).

   "Converted" here = the lead reached a REAL operational outcome — Won status, or
   a linked Walk-In / Field Job / Ticket / Invoice. Selecting a route alone is
   not a conversion. Revenue = finalized invoices only (never an estimate).
   ────────────────────────────────────────────────────────────────────────── */
import {
  isLostStatus, isWonStatus, revenueWonForLead, type Lead, type LeadAssignmentEvent, type LeadConversionEvent, type LeadFollowUp,
} from "@/lib/leads-data";
import { normaliseRoute, FULFILMENT_ROUTE_LABEL } from "@/lib/field-data";
import type { LeadDeal } from "@/lib/lead-deals";
import type { Quotation } from "@/lib/quotation-data";
import type { IntelligenceRevenueSources } from "@/lib/lead-intelligence";

const DAY = 86_400_000;
export const JOURNEY_MIN_SAMPLE = 10;

/** One row of lead_status_history (client shape). */
export interface LeadStatusEvent {
  leadId: string;
  fromStatus: string;
  toStatus: string;
  at: string;
  actorName?: string;
}

export interface JourneyReportInput {
  cohort: Lead[];
  followUps: LeadFollowUp[];
  statusEvents: LeadStatusEvent[];
  conversionEvents: LeadConversionEvent[];
  revenue: IntelligenceRevenueSources;
  /** Owner changes (lead_assignment_history). Optional — omitted = report shows "no data". */
  assignmentEvents?: LeadAssignmentEvent[];
  /** Discount-approval requests attached to leads. */
  deals?: LeadDeal[];
  /** Quotations (lead-based ones are matched by leadId). */
  quotations?: Quotation[];
  minSample?: number;
  asOf?: number;
}

/** A "with vs without" comparison: counts always, rate only above the sample floor. */
export interface JourneyCompareRow {
  key: string;
  label: string;
  leads: number;
  converted: number;
  rate: number;
  sufficient: boolean;
  evidenceIds: string[];
}
export interface JourneyTransitionRow { from: string; to: string; moves: number; leads: number; evidenceIds: string[] }
export interface JourneyLostWhereRow { stage: string; count: number; share: number; evidenceIds: string[] }
export interface JourneySpeedRow { key: string; label: string; n: number; medianDays: number | null; evidenceIds: string[] }
export interface JourneyRouteRow {
  route: string; label: string; leads: number; converted: number; rate: number; sufficient: boolean;
  revenue: number; medianDaysToConvert: number | null; evidenceIds: string[];
}
export interface JourneyDealsReport {
  leadsWithDeal: number;
  rows: { key: string; label: string; count: number; evidenceIds: string[] }[];
  compare: JourneyCompareRow[];
}
export interface JourneyQuotationReport {
  leadsQuoted: number;
  sent: number;
  compare: JourneyCompareRow[];
}
export interface JourneyOwnershipReport {
  reassigned: number;
  totalHandoffs: number;
  compare: JourneyCompareRow[];
  hasData: boolean;
}

export interface FollowUpDepthRow {
  key: "0" | "1" | "2" | "3" | "4+";
  label: string;
  leads: number;
  evidenceIds: string[];
}
export interface FollowUpOutcomeRow {
  outcome: string;
  /** Closed follow-ups carrying this outcome. */
  closed: number;
  /** Of those, how many were followed by the lead converting. */
  thenConverted: number;
  rate: number;
  /** Rate is only shown when closed ≥ minSample. */
  sufficient: boolean;
  evidenceIds: string[];
}
export interface RevivedLeadRow {
  leadId: string;
  leadNo: string;
  name: string;
  lostAt: number;
  revivedAt: number;
  daysLost: number;
  lostReason: string;
  revivedTo: string;
  revivedBy: string;
  /** Converted AFTER being revived (needs a reliable conversion time). */
  convertedAfterRevival: boolean;
  revenue: number;
  value: number;
}

export interface LeadJourneyReport {
  minSample: number;
  /** Cohort leads that reached a real operational outcome. */
  converted: number;
  convertedEvidence: string[];
  /** Converted leads with ≥1 completed follow-up BEFORE converting (time known). */
  convertedAfterFollowUp: number;
  convertedAfterFollowUpEvidence: string[];
  /** Converted with no completed follow-up before converting (time known). */
  convertedWithoutFollowUp: number;
  /** Converted leads whose conversion time could not be established. */
  convertedUnknownTime: number;
  depth: FollowUpDepthRow[];
  /** Median completed follow-ups before converting (null below 3 leads). */
  medianFollowUpsToConvert: number | null;
  outcomes: FollowUpOutcomeRow[];
  /** Lost → revived. */
  everLost: number;
  everLostEvidence: string[];
  stillLost: number;
  revived: number;
  revivedEvidence: string[];
  revivedConverted: number;
  revivedConvertedEvidence: string[];
  revivalRate: number;
  revivedRevenue: number;
  medianDaysLost: number | null;
  revivedRows: RevivedLeadRow[];
  /** Follow-up depth + revival rely on lead_status_history / conversion events. */
  hasStatusHistory: boolean;
  /** Where leads were when they were marked Lost (the stage they left). */
  lostWhere: JourneyLostWhereRow[];
  /** Most common stage → stage moves. */
  transitions: JourneyTransitionRow[];
  totalMoves: number;
  /** Days from creation to each milestone. */
  speed: JourneySpeedRow[];
  routes: JourneyRouteRow[];
  deals: JourneyDealsReport;
  quotations: JourneyQuotationReport;
  ownership: JourneyOwnershipReport;
  notes: string[];
}

const ts = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};
function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

const CONVERSION_EVENTS = new Set(["walk_in_created", "field_job_created", "ticket_created", "invoice_created", "won"]);

/** The lead reached a real operational outcome. */
export function isJourneyConverted(lead: Lead, events: LeadConversionEvent[] = []): boolean {
  if (isWonStatus(lead.status, lead.finalResult)) return true;
  if (lead.linkedWalkInId || lead.linkedFieldJobId || lead.linkedTicketId || lead.linkedInvoiceId) return true;
  return events.some((e) => e.leadId === lead.id && CONVERSION_EVENTS.has(e.eventType));
}
/** When the lead first reached that outcome (null when it cannot be established). */
export function journeyConvertedAt(lead: Lead, events: LeadConversionEvent[] = []): number | null {
  const times = [
    ts(lead.convertedAt),
    ...events.filter((e) => e.leadId === lead.id && CONVERSION_EVENTS.has(e.eventType)).map((e) => ts(e.occurredAt)),
  ].filter((t): t is number => t != null);
  return times.length ? Math.min(...times) : null;
}

export function buildLeadJourneyReport(input: JourneyReportInput): LeadJourneyReport {
  const minSample = input.minSample ?? JOURNEY_MIN_SAMPLE;
  const { cohort, followUps, statusEvents, conversionEvents, revenue } = input;
  const ids = new Set(cohort.map((l) => l.id));
  const leadById = new Map(cohort.map((l) => [l.id, l]));
  const fuByLead = new Map<string, LeadFollowUp[]>();
  for (const f of followUps) {
    if (!ids.has(f.leadId)) continue;
    const arr = fuByLead.get(f.leadId) ?? [];
    arr.push(f); fuByLead.set(f.leadId, arr);
  }
  const evByLead = new Map<string, LeadStatusEvent[]>();
  for (const e of statusEvents) {
    if (!ids.has(e.leadId)) continue;
    const arr = evByLead.get(e.leadId) ?? [];
    arr.push(e); evByLead.set(e.leadId, arr);
  }
  for (const arr of evByLead.values()) arr.sort((a, b) => (ts(a.at) ?? 0) - (ts(b.at) ?? 0));

  /* ── 1. Follow-up → conversion ─────────────────────────────────────── */
  const convertedLeads = cohort.filter((l) => isJourneyConverted(l, conversionEvents));
  const convAt = new Map<string, number | null>(convertedLeads.map((l) => [l.id, journeyConvertedAt(l, conversionEvents)]));
  const depthBuckets: Record<FollowUpDepthRow["key"], string[]> = { "0": [], "1": [], "2": [], "3": [], "4+": [] };
  const depthCounts: number[] = [];
  let unknownTime = 0;
  for (const lead of convertedLeads) {
    const at = convAt.get(lead.id) ?? null;
    if (at == null) { unknownTime += 1; continue; }
    const doneBefore = (fuByLead.get(lead.id) ?? []).filter((f) => {
      if (f.status !== "completed") return false;
      const c = ts(f.completedAt) ?? ts(f.dueAt);
      return c != null && c <= at;
    }).length;
    depthCounts.push(doneBefore);
    depthBuckets[doneBefore >= 4 ? "4+" : (String(doneBefore) as FollowUpDepthRow["key"])].push(lead.id);
  }
  const depth: FollowUpDepthRow[] = [
    { key: "0", label: "No follow-up needed" },
    { key: "1", label: "After 1 follow-up" },
    { key: "2", label: "After 2 follow-ups" },
    { key: "3", label: "After 3 follow-ups" },
    { key: "4+", label: "After 4+ follow-ups" },
  ].map((d) => ({ ...d, key: d.key as FollowUpDepthRow["key"], leads: depthBuckets[d.key as FollowUpDepthRow["key"]].length, evidenceIds: depthBuckets[d.key as FollowUpDepthRow["key"]] }));
  const afterFu = depth.slice(1).flatMap((d) => d.evidenceIds);

  // Outcome → was the lead converted AFTER that follow-up closed?
  const byOutcome = new Map<string, { closed: number; then: number; ids: Set<string> }>();
  for (const f of followUps) {
    if (!ids.has(f.leadId) || f.status !== "completed") continue;
    const outcome = String(f.outcome || "").trim() || "No outcome recorded";
    const row = byOutcome.get(outcome) ?? { closed: 0, then: 0, ids: new Set<string>() };
    row.closed += 1; row.ids.add(f.leadId);
    const closedAt = ts(f.completedAt) ?? ts(f.dueAt);
    const at = convAt.get(f.leadId);
    if (at != null && closedAt != null && at >= closedAt) row.then += 1;
    byOutcome.set(outcome, row);
  }
  const outcomes: FollowUpOutcomeRow[] = [...byOutcome.entries()]
    .map(([outcome, r]) => ({ outcome, closed: r.closed, thenConverted: r.then, rate: rate(r.then, r.closed), sufficient: r.closed >= minSample, evidenceIds: [...r.ids] }))
    .sort((a, b) => b.closed - a.closed || a.outcome.localeCompare(b.outcome));

  /* ── 2. Lost → revived ─────────────────────────────────────────────── */
  interface Arc { lostAt: number; revivedAt: number | null; revivedTo: string; revivedBy: string }
  const arcs = new Map<string, Arc>();
  let hasHistory = false;
  for (const lead of cohort) {
    const evs = evByLead.get(lead.id) ?? [];
    if (evs.length) hasHistory = true;
    let lostAt: number | null = null;
    let arc: Arc | null = null;
    for (const e of evs) {
      const t = ts(e.at); if (t == null) continue;
      const toLost = isLostStatus(e.toStatus);
      if (toLost && lostAt == null) lostAt = t;
      if (lostAt != null && !toLost && isLostStatus(e.fromStatus) && !arc) {
        arc = { lostAt, revivedAt: t, revivedTo: e.toStatus, revivedBy: e.actorName || "" };
      }
    }
    if (lostAt != null) arcs.set(lead.id, arc ?? { lostAt, revivedAt: null, revivedTo: "", revivedBy: "" });
    else if (lead.lostAt && ts(lead.lostAt) != null && isLostStatus(lead.status, lead.finalResult)) arcs.set(lead.id, { lostAt: ts(lead.lostAt)!, revivedAt: null, revivedTo: "", revivedBy: "" });
  }
  const everLostIds = [...arcs.keys()];
  const revivedIds = everLostIds.filter((id) => arcs.get(id)!.revivedAt != null);
  const revivedRows: RevivedLeadRow[] = revivedIds.map((id) => {
    const lead = leadById.get(id)!; const a = arcs.get(id)!;
    const at = convAt.get(id);
    const convertedAfter = at != null && at >= (a.revivedAt as number);
    return {
      leadId: id, leadNo: lead.leadNo || lead.id, name: lead.name || "—",
      lostAt: a.lostAt, revivedAt: a.revivedAt as number,
      daysLost: Math.max(0, Math.round(((a.revivedAt as number) - a.lostAt) / DAY)),
      lostReason: lead.lostReason || lead.finalRemarks || "",
      revivedTo: a.revivedTo || lead.status, revivedBy: a.revivedBy,
      convertedAfterRevival: convertedAfter,
      revenue: convertedAfter ? revenueWonForLead(lead, revenue.tickets, revenue.invoices) : 0,
      value: Math.max(0, Number(lead.estimate || 0)),
    };
  }).sort((a, b) => b.revivedAt - a.revivedAt);
  const revivedConvertedRows = revivedRows.filter((r) => r.convertedAfterRevival);
  const stillLost = everLostIds.filter((id) => arcs.get(id)!.revivedAt == null && isLostStatus(leadById.get(id)!.status, leadById.get(id)!.finalResult)).length;

  /* ── 3. Where leads get lost ───────────────────────────────────────── */
  const lostWhereMap = new Map<string, string[]>();
  for (const id of everLostIds) {
    const evs = evByLead.get(id) ?? [];
    const first = evs.find((e) => isLostStatus(e.toStatus));
    const stage = (first?.fromStatus || "").trim() || "Unknown stage";
    lostWhereMap.set(stage, [...(lostWhereMap.get(stage) ?? []), id]);
  }
  const lostWhere: JourneyLostWhereRow[] = [...lostWhereMap.entries()]
    .map(([stage, evidenceIds]) => ({ stage, count: evidenceIds.length, share: rate(evidenceIds.length, everLostIds.length), evidenceIds }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));

  /* ── 4. Stage movement ─────────────────────────────────────────────── */
  const trMap = new Map<string, { from: string; to: string; moves: number; ids: Set<string> }>();
  let totalMoves = 0;
  for (const evs of evByLead.values()) {
    for (const e of evs) {
      const from = (e.fromStatus || "").trim() || "(start)";
      const to = (e.toStatus || "").trim();
      if (!to || from === to) continue;
      totalMoves += 1;
      const k = `${from}→${to}`;
      const row = trMap.get(k) ?? { from, to, moves: 0, ids: new Set<string>() };
      row.moves += 1; row.ids.add(e.leadId); trMap.set(k, row);
    }
  }
  const transitions: JourneyTransitionRow[] = [...trMap.values()]
    .map((t) => ({ from: t.from, to: t.to, moves: t.moves, leads: t.ids.size, evidenceIds: [...t.ids] }))
    .sort((a, b) => b.moves - a.moves || a.from.localeCompare(b.from)).slice(0, 8);

  /* ── 5. Speed through the journey (days from creation) ─────────────── */
  const createdOf = (l: Lead) => ts(l.createdAt) ?? ts(`${l.date}T${l.time || "00:00"}:00`);
  const speedDefs: { key: string; label: string; at: (l: Lead) => number | null }[] = [
    { key: "contact", label: "First contact", at: (l) => ts(l.firstContactedAt) },
    { key: "qualified", label: "Qualified", at: (l) => ts(l.qualifiedAt) },
    { key: "followup", label: "First follow-up done", at: (l) => {
      const t = (fuByLead.get(l.id) ?? []).filter((f) => f.status === "completed").map((f) => ts(f.completedAt) ?? ts(f.dueAt)).filter((x): x is number => x != null);
      return t.length ? Math.min(...t) : null;
    } },
    { key: "routed", label: "Route chosen", at: (l) => {
      const t = [ts(l.routedAt), ...conversionEvents.filter((e) => e.leadId === l.id && e.eventType === "routed").map((e) => ts(e.occurredAt))].filter((x): x is number => x != null);
      return t.length ? Math.min(...t) : null;
    } },
    { key: "converted", label: "Converted", at: (l) => convAt.get(l.id) ?? null },
  ];
  const speed: JourneySpeedRow[] = speedDefs.map((d) => {
    const days: number[] = []; const evidenceIds: string[] = [];
    for (const l of cohort) {
      const c = createdOf(l), a = d.at(l);
      if (c == null || a == null || a < c) continue;
      days.push((a - c) / DAY); evidenceIds.push(l.id);
    }
    return { key: d.key, label: d.label, n: days.length, medianDays: days.length >= 3 ? median(days) : null, evidenceIds };
  });

  /* ── 6. Route outcomes ─────────────────────────────────────────────── */
  const routeGroups = new Map<string, Lead[]>();
  for (const l of cohort) {
    const route = normaliseRoute(l.fulfilmentRoute) || "NONE";
    routeGroups.set(route, [...(routeGroups.get(route) ?? []), l]);
  }
  const routes: JourneyRouteRow[] = [...routeGroups.entries()].map(([route, ls]) => {
    const conv = ls.filter((l) => convAt.has(l.id));
    const days = conv.map((l) => { const c = createdOf(l), a = convAt.get(l.id); return c != null && a != null && a >= c ? (a - c) / DAY : null; }).filter((x): x is number => x != null);
    return {
      route, label: route === "NONE" ? "Not routed yet" : FULFILMENT_ROUTE_LABEL[route as keyof typeof FULFILMENT_ROUTE_LABEL] ?? route,
      leads: ls.length, converted: conv.length, rate: rate(conv.length, ls.length), sufficient: ls.length >= minSample,
      revenue: conv.reduce((sum, l) => sum + revenueWonForLead(l, revenue.tickets, revenue.invoices), 0),
      medianDaysToConvert: days.length >= 3 ? median(days) : null,
      evidenceIds: ls.map((l) => l.id),
    };
  }).sort((a, b) => b.leads - a.leads);

  /* ── 7. Deals + quotations ─────────────────────────────────────────── */
  const compareRow = (key: string, label: string, ls: Lead[]): JourneyCompareRow => {
    const conv = ls.filter((l) => convAt.has(l.id)).length;
    return { key, label, leads: ls.length, converted: conv, rate: rate(conv, ls.length), sufficient: ls.length >= minSample, evidenceIds: ls.map((l) => l.id) };
  };
  const dealsList = (input.deals ?? []).filter((d) => ids.has(d.leadId));
  const dealLeadIds = new Set(dealsList.map((d) => d.leadId));
  const latestDealStatus = new Map<string, string>();
  for (const d of [...dealsList].sort((a, b) => (ts(a.createdAt) ?? 0) - (ts(b.createdAt) ?? 0))) latestDealStatus.set(d.leadId, d.status);
  const dealIdsBy = (pred: (s: string) => boolean) => [...latestDealStatus.entries()].filter(([, s]) => pred(s)).map(([id]) => id);
  const dealRows = [
    { key: "all", label: "Discount requested", ids: [...dealLeadIds] },
    { key: "approved", label: "Approved", ids: dealIdsBy((s) => s === "approved") },
    { key: "rejected", label: "Rejected", ids: dealIdsBy((s) => s === "rejected") },
    { key: "waiting", label: "Awaiting a decision", ids: dealIdsBy((s) => s === "pending_approval" || s === "changes_requested") },
  ].map((x) => ({ key: x.key, label: x.label, count: x.ids.length, evidenceIds: x.ids }));
  const dealsReport: JourneyDealsReport = {
    leadsWithDeal: dealLeadIds.size,
    rows: dealRows,
    compare: [
      compareRow("approved", "Deal approved", cohort.filter((l) => latestDealStatus.get(l.id) === "approved")),
      compareRow("rejected", "Deal rejected", cohort.filter((l) => latestDealStatus.get(l.id) === "rejected")),
      compareRow("none", "No discount request", cohort.filter((l) => !dealLeadIds.has(l.id))),
    ],
  };
  const quoteList = (input.quotations ?? []).filter((q) => q.leadId && ids.has(q.leadId));
  const sentQuotes = quoteList.filter((q) => !!q.sentAt || q.status === "sent" || q.status === "accepted");
  const quotedIds = new Set(sentQuotes.map((q) => q.leadId));
  const quotationsReport: JourneyQuotationReport = {
    leadsQuoted: new Set(quoteList.map((q) => q.leadId)).size,
    sent: sentQuotes.length,
    compare: [
      compareRow("quoted", "Quotation sent", cohort.filter((l) => quotedIds.has(l.id))),
      compareRow("none", "No quotation sent", cohort.filter((l) => !quotedIds.has(l.id))),
    ],
  };

  /* ── 8. Reassignment ───────────────────────────────────────────────── */
  const handoffs = new Map<string, number>();
  for (const e of input.assignmentEvents ?? []) {
    if (!ids.has(e.leadId) || !e.fromUserId || !e.toUserId || e.fromUserId === e.toUserId) continue;
    handoffs.set(e.leadId, (handoffs.get(e.leadId) ?? 0) + 1);
  }
  const ownership: JourneyOwnershipReport = {
    reassigned: handoffs.size,
    totalHandoffs: [...handoffs.values()].reduce((a, b) => a + b, 0),
    hasData: (input.assignmentEvents ?? []).some((e) => ids.has(e.leadId)),
    compare: [
      compareRow("reassigned", "Reassigned at least once", cohort.filter((l) => handoffs.has(l.id))),
      compareRow("kept", "Stayed with one agent", cohort.filter((l) => !handoffs.has(l.id))),
    ],
  };

  const notes: string[] = [];
  if (unknownTime > 0) notes.push(`${unknownTime} converted lead${unknownTime === 1 ? " has" : "s have"} no reliable conversion time and ${unknownTime === 1 ? "is" : "are"} left out of the follow-up breakdown.`);
  if (!hasHistory && cohort.length > 0) notes.push("No status history was found for this cohort, so Lost → Revived cannot be measured yet.");
  if (outcomes.length > 0 && outcomes.every((o) => !o.sufficient)) notes.push(`Outcome conversion rates appear once an outcome has ${minSample}+ closed follow-ups.`);

  return {
    minSample,
    converted: convertedLeads.length,
    convertedEvidence: convertedLeads.map((l) => l.id),
    convertedAfterFollowUp: afterFu.length,
    convertedAfterFollowUpEvidence: afterFu,
    convertedWithoutFollowUp: depthBuckets["0"].length,
    convertedUnknownTime: unknownTime,
    depth,
    medianFollowUpsToConvert: depthCounts.length >= 3 ? median(depthCounts) : null,
    outcomes,
    everLost: everLostIds.length,
    everLostEvidence: everLostIds,
    stillLost,
    revived: revivedIds.length,
    revivedEvidence: revivedIds,
    revivedConverted: revivedConvertedRows.length,
    revivedConvertedEvidence: revivedConvertedRows.map((r) => r.leadId),
    revivalRate: rate(revivedIds.length, everLostIds.length),
    revivedRevenue: revivedConvertedRows.reduce((s, r) => s + r.revenue, 0),
    medianDaysLost: revivedRows.length >= 3 ? median(revivedRows.map((r) => r.daysLost)) : null,
    revivedRows,
    hasStatusHistory: hasHistory,
    lostWhere, transitions, totalMoves, speed, routes,
    deals: dealsReport, quotations: quotationsReport, ownership,
    notes,
  };
}
