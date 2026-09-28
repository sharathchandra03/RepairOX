/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance Engine (Lead Management Phase 3).

   ONE reusable reporting engine. The SAME logic powers three surfaces; only
   the DATA SCOPE changes:

     1. Individual Sales Agent dashboard   → scope = { agentId: currentUserId }
     2. Owner Agent Performance table      → scope = every eligible agent in the
                                              authorized org/store scope
     3. Agent drill-down / report view     → scope = { agentId: selectedAgentId }

   Everything here is DERIVED from real records (Lead + lead_followup_history +
   finalized invoices via Lead → Ticket → Invoice). There are NO stored
   counters and NO dummy/static values — a source lead, follow-up or invoice
   that does not exist contributes nothing. (See the lead-data-foundation /
   permission-matrix / design-system steering.)

   The engine is intentionally free of React and cross-module imports: callers
   pass in the already-visibility-scoped lead set, the follow-up records, the
   agent directory (eligible Sales Agents), and the store's tickets+invoices
   for revenue attribution. This keeps UI = server = RLS trivially aligned:
   the caller never widens scope beyond what the user may see.
   ────────────────────────────────────────────────────────────────────────── */

import {
  type Lead,
  type LeadFollowUp,
  computeLeadMetrics,
  openFollowUp,
  isQualifiedStatus,
  isWonStatus,
  isLostStatus,
  leadExpectedValue,
  revenueWonForLead,
  type RevenueInvoiceLike,
  type RevenueTicketLike,
} from "@/lib/leads-data";
import type { SalesAgent } from "@/lib/sales-agents";

/* ═══════════════════════════════════════════════════════════════════════
   REVENUE / TICKET / INVOICE INPUTS
   ═══════════════════════════════════════════════════════════════════════ */

/** Finalized-revenue sources passed once by the caller (store tickets+invoices).
 *  Revenue Won is ONLY ever derived from these via revenueWonForLead. */
export interface RevenueSources {
  tickets: RevenueTicketLike[];
  invoices: RevenueInvoiceLike[];
}

/* ═══════════════════════════════════════════════════════════════════════
   PROJECTION MODEL  (transparent, documented — never a manual field)
   ═══════════════════════════════════════════════════════════════════════

   Projection = the weighted expected value of a lead's OPEN pipeline, i.e. how
   much finalized revenue the open pipeline is expected to yield. It is a
   PROBABILITY-WEIGHTED sum of each open lead's expected value:

       projection = Σ  expectedValue(lead) × stageProbability(lead)

   over leads that are NOT yet terminal (not won, not lost). Won leads are
   already counted as Revenue Won; lost leads contribute 0. The stage
   probability is derived from the lead's structured lifecycle signals — it is
   explainable, not an opaque score:

       • has a linked ticket (in fulfilment)      → 0.80
       • qualified                                 → 0.55
       • has been contacted / has an open follow-up→ 0.35
       • brand-new / uncontacted                   → 0.15

   These weights live in ONE place (STAGE_PROBABILITY) so the business can tune
   them without touching the metric code. */
export const STAGE_PROBABILITY = {
  inFulfilment: 0.8, // a real linked ticket exists → far along
  qualified: 0.55,
  contacted: 0.35,
  new: 0.15,
} as const;

/** Explainable stage-probability for a single OPEN lead. */
export function leadStageProbability(lead: Lead, hasOpenFollowUp: boolean): number {
  if (lead.linkedTicketId) return STAGE_PROBABILITY.inFulfilment;
  if (isQualifiedStatus(lead.status)) return STAGE_PROBABILITY.qualified;
  const contacted =
    hasOpenFollowUp ||
    !!lead.followUpDate ||
    (!!lead.contactStatus && !/not\s*contacted/i.test(lead.contactStatus));
  if (contacted) return STAGE_PROBABILITY.contacted;
  return STAGE_PROBABILITY.new;
}

/* ═══════════════════════════════════════════════════════════════════════
   BREAKDOWN SHAPES  (source / status / priority / route / funnel)
   ═══════════════════════════════════════════════════════════════════════ */

/** A generic categorical breakdown row (Source / Status / Priority). */
export interface BreakdownRow {
  key: string;          // the raw structured value ("Google", "Qualified", "Hot")
  label: string;        // display label (same as key unless remapped)
  leads: number;        // lead count in this bucket
  qualified: number;
  converted: number;
  revenueWon: number;   // finalized invoice revenue attributable to this bucket
}

/** Per-route performance (Walk-In / Pickup & Drop / On-Site). */
export interface RoutePerfRow {
  route: "STORE_VISIT" | "PICKUP_DROP" | "ON_SITE";
  label: string;
  leads: number;         // leads routed this way
  conversions: number;   // leads that produced the matching real linked record
  operationalDone: number; // leads whose linked op record + won status completed
  revenueWon: number;    // finalized revenue attributable to this route
}

/** The agent's lead funnel, from structured status/relationships (never UI text). */
export interface LeadFunnel {
  total: number;
  contacted: number;
  qualified: number;
  followUp: number;   // leads with an open follow-up
  converted: number;  // won
  ticket: number;     // leads with a real linked ticket
  invoice: number;    // leads with finalized invoice revenue
}

/** Follow-up load, split by lifecycle (from lead_followup_history records). */
export interface FollowUpBreakdown {
  pending: number;   // scheduled, future day
  dueToday: number;
  overdue: number;
  completed: number;
  total: number;     // scheduled + completed (excludes cancelled)
  completionRate: number; // 0..1
}

/* ═══════════════════════════════════════════════════════════════════════
   AGENT PERFORMANCE — the per-agent record the whole engine produces
   ═══════════════════════════════════════════════════════════════════════ */

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  avatarUrl?: string;
  roleLabel: string;

  /* Headline metrics (all DERIVED) */
  leads: number;
  qualified: number;
  contacted: number;
  converted: number;
  lost: number;
  pendingFollowUp: number; // leads with an open follow-up
  overdueFollowUp: number;
  conversionRate: number;  // converted / leads (0..1)

  /* Money */
  pipelineValue: number;   // Σ expected value of OPEN leads (NOT revenue)
  projection: number;      // probability-weighted open pipeline (see STAGE_PROBABILITY)
  revenueWon: number;      // Σ FINALIZED invoice totals attributable to this agent
  avgLeadValue: number;    // pipelineValue+revenueWon proxy → Σ expected value / leads
  ticketsWon: number;      // leads that produced a real linked ticket

  /* ── Effort-based credit split ──
     The agent EARNS the *AgentDriven values (leads they actually worked +
     routed). The *SelfInitiated values are self-initiated conversions only
     back-linked to an old lead — shown for transparency, NOT counted as the
     agent's earned performance. `converted`/`ticketsWon`/`revenueWon` above are
     the ALL totals (agent-driven + self-initiated). */
  convertedAgentDriven: number;
  convertedSelfInitiated: number;
  ticketsWonAgentDriven: number;
  ticketsWonSelfInitiated: number;
  revenueWonAgentDriven: number;
  revenueWonSelfInitiated: number;
  conversionRateAgentDriven: number;

  /* Route leads + conversions (real links only) */
  routeAssigned: number; // leads ROUTED as STORE_VISIT (assigned to a store)
  walkIn: number;   // STORE_VISIT leads with a linked walk-in
  pickup: number;   // PICKUP_DROP leads (routed count)
  pickupCompleted: number; // PICKUP_DROP leads with a linked field job
  onSite: number;   // ON_SITE leads (routed count)
  onSiteCompleted: number; // ON_SITE leads with a linked field job

  /* Revenue attribution detail */
  invoiceCount: number; // number of finalized invoices attributed to the agent

  /* Follow-up engine */
  followUps: FollowUpBreakdown;

  /* Breakdowns (used by the individual dashboard) */
  bySource: BreakdownRow[];
  byStatus: BreakdownRow[];
  byPriority: BreakdownRow[];
  byRoute: RoutePerfRow[];
  funnel: LeadFunnel;

  /* Average time-to-convert in days (only over leads with reliable timestamps). */
  avgConversionDays: number | null;

  /* Ranking (owner view) — filled by rankAgents. */
  rank: number;        // 1-based; 0 before ranking
  rankScore: number;   // the primary ranking metric value used
}

/* ═══════════════════════════════════════════════════════════════════════
   ROUTE LABELS (kept local to avoid importing the field module into reports)
   ═══════════════════════════════════════════════════════════════════════ */
const ROUTE_LABEL: Record<RoutePerfRow["route"], string> = {
  STORE_VISIT: "Walk-In",
  PICKUP_DROP: "Pickup & Drop",
  ON_SITE: "On-Site",
};

/* ─── small helpers ─── */
function isContactedLead(lead: Lead, hasOpenFollowUp: boolean): boolean {
  if (hasOpenFollowUp) return true;
  if (lead.followUpDate) return true;
  if (lead.linkedTicketId || lead.linkedWalkInId || lead.linkedFieldJobId) return true;
  const cs = (lead.contactStatus || "").toLowerCase();
  return !!cs && !/not\s*contacted|new|^\s*$/.test(cs);
}

function upsert(map: Map<string, BreakdownRow>, key: string, label: string): BreakdownRow {
  let row = map.get(key);
  if (!row) {
    row = { key, label, leads: 0, qualified: 0, converted: 0, revenueWon: 0 };
    map.set(key, row);
  }
  return row;
}

/**
 * Build a leadId → open (scheduled) follow-up map from a flat follow-up list.
 * Shared so every breakdown uses ONE datetime-precise source of urgency.
 */
export function openFollowUpsByLeadId(followUps: LeadFollowUp[]): Map<string, LeadFollowUp> {
  const byLead = new Map<string, LeadFollowUp[]>();
  for (const f of followUps) {
    const arr = byLead.get(f.leadId) ?? [];
    arr.push(f);
    byLead.set(f.leadId, arr);
  }
  const open = new Map<string, LeadFollowUp>();
  for (const [leadId, list] of byLead) {
    const o = openFollowUp(list);
    if (o) open.set(leadId, o);
  }
  return open;
}

/* ═══════════════════════════════════════════════════════════════════════
   CORE: compute one agent's performance from real records
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Compute an AgentPerformance from the agent's OWN leads (already filtered to
 * this agent + any owner date/store filters). `allFollowUps` should be the full
 * loaded follow-up set — it is intersected with these leads internally so the
 * follow-up engine metrics are correct. `revenue` supplies the store's tickets
 * + invoices so Revenue Won derives from FINALIZED invoices only.
 */
export function computeAgentPerformance(
  agent: Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">,
  agentLeads: Lead[],
  allFollowUps: LeadFollowUp[],
  revenue: RevenueSources,
): AgentPerformance {
  const openByLead = openFollowUpsByLeadId(allFollowUps);

  // Base metrics come from the SAME shared engine the lead dashboard uses, so
  // the two surfaces can never disagree.
  const base = computeLeadMetrics(agentLeads, openByLead, revenue, allFollowUps);

  // Categorical breakdowns + funnel, all from structured fields.
  const bySource = new Map<string, BreakdownRow>();
  const byStatus = new Map<string, BreakdownRow>();
  const byPriority = new Map<string, BreakdownRow>();

  let contacted = 0;
  let projection = 0;
  let expectedValueSum = 0;
  let convDaysSum = 0;
  let convDaysCount = 0;
  let invoiceCount = 0;

  const funnel: LeadFunnel = {
    total: agentLeads.length,
    contacted: 0, qualified: 0, followUp: 0, converted: 0, ticket: 0, invoice: 0,
  };

  const routeAgg: Record<RoutePerfRow["route"], RoutePerfRow> = {
    STORE_VISIT: { route: "STORE_VISIT", label: ROUTE_LABEL.STORE_VISIT, leads: 0, conversions: 0, operationalDone: 0, revenueWon: 0 },
    PICKUP_DROP: { route: "PICKUP_DROP", label: ROUTE_LABEL.PICKUP_DROP, leads: 0, conversions: 0, operationalDone: 0, revenueWon: 0 },
    ON_SITE: { route: "ON_SITE", label: ROUTE_LABEL.ON_SITE, leads: 0, conversions: 0, operationalDone: 0, revenueWon: 0 },
  };

  for (const l of agentLeads) {
    const hasOpen = openByLead.has(l.id);
    const won = isWonStatus(l.status, l.finalResult);
    const lost = isLostStatus(l.status, l.finalResult);
    const qualified = isQualifiedStatus(l.status);
    const rev = revenueWonForLead(l, revenue.tickets, revenue.invoices);
    const ev = leadExpectedValue(l);
    expectedValueSum += ev;

    if (isContactedLead(l, hasOpen)) contacted += 1;

    // Projection: probability-weighted expected value of OPEN pipeline only.
    if (!won && !lost) projection += ev * leadStageProbability(l, hasOpen);

    // ── Source breakdown ──
    const srcKey = (l.source || "Unspecified").trim() || "Unspecified";
    const src = upsert(bySource, srcKey, srcKey);
    src.leads += 1;
    if (qualified) src.qualified += 1;
    if (won) src.converted += 1;
    src.revenueWon += rev;

    // ── Status breakdown ──
    const stKey = (l.status || "Unspecified").trim() || "Unspecified";
    const st = upsert(byStatus, stKey, stKey);
    st.leads += 1;
    if (qualified) st.qualified += 1;
    if (won) st.converted += 1;
    st.revenueWon += rev;

    // ── Priority breakdown ──
    const prKey = (l.priority || "Unspecified").trim() || "Unspecified";
    const pr = upsert(byPriority, prKey, prKey);
    pr.leads += 1;
    if (qualified) pr.qualified += 1;
    if (won) pr.converted += 1;
    pr.revenueWon += rev;

    // ── Route breakdown ──
    const route = (l.fulfilmentRoute || "").toUpperCase() as RoutePerfRow["route"] | "";
    if (route === "STORE_VISIT" || route === "PICKUP_DROP" || route === "ON_SITE") {
      const r = routeAgg[route];
      r.leads += 1;
      const realLink = route === "STORE_VISIT" ? !!l.linkedWalkInId : !!l.linkedFieldJobId;
      if (realLink) r.conversions += 1;
      if (realLink && won) r.operationalDone += 1;
      r.revenueWon += rev;
    }

    // ── Funnel (structured) ──
    if (qualified) funnel.qualified += 1;
    if (hasOpen) funnel.followUp += 1;
    if (won) funnel.converted += 1;
    if (l.linkedTicketId) funnel.ticket += 1;
    if (rev > 0) { funnel.invoice += 1; invoiceCount += 1; }

    // ── Avg conversion time (only reliable data: created→converted) ──
    if (won && l.convertedAt && (l.createdAt || l.date)) {
      const start = new Date(l.createdAt || `${l.date}T00:00:00`).getTime();
      const end = new Date(l.convertedAt).getTime();
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        convDaysSum += (end - start) / 86_400_000;
        convDaysCount += 1;
      }
    }
  }
  funnel.contacted = contacted;

  const sortByLeads = (a: BreakdownRow, b: BreakdownRow) => b.leads - a.leads || b.revenueWon - a.revenueWon;

  return {
    agentId: agent.id,
    agentName: agent.name,
    avatarUrl: agent.avatarUrl,
    roleLabel: agent.roleLabel,

    leads: base.total,
    qualified: base.qualified,
    contacted,
    converted: base.converted,
    lost: base.lost,
    pendingFollowUp: base.pendingFollowUp,
    overdueFollowUp: base.overdue,
    conversionRate: base.conversionRate,

    pipelineValue: base.pipelineValue,
    projection,
    revenueWon: base.revenueWon,
    avgLeadValue: agentLeads.length > 0 ? expectedValueSum / agentLeads.length : 0,
    ticketsWon: base.ticketsWon,

    convertedAgentDriven: base.convertedAgentDriven,
    convertedSelfInitiated: base.convertedSelfInitiated,
    ticketsWonAgentDriven: base.ticketsWonAgentDriven,
    ticketsWonSelfInitiated: base.ticketsWonSelfInitiated,
    revenueWonAgentDriven: base.revenueWonAgentDriven,
    revenueWonSelfInitiated: base.revenueWonSelfInitiated,
    conversionRateAgentDriven: base.conversionRateAgentDriven,

    routeAssigned: routeAgg.STORE_VISIT.leads,
    walkIn: base.routeConversions.walkIn,
    pickup: routeAgg.PICKUP_DROP.leads,
    pickupCompleted: base.routeConversions.pickup,
    onSite: routeAgg.ON_SITE.leads,
    onSiteCompleted: base.routeConversions.onSite,
    invoiceCount,

    followUps: {
      pending: base.followUpsUpcoming,
      dueToday: base.followUpsDueToday,
      overdue: base.followUpsOverdue,
      completed: base.followUpsCompleted,
      total: base.followUpsTotal,
      completionRate: base.followUpCompletionRate,
    },

    bySource: [...bySource.values()].sort(sortByLeads),
    byStatus: [...byStatus.values()].sort(sortByLeads),
    byPriority: [...byPriority.values()].sort(sortByLeads),
    byRoute: [routeAgg.STORE_VISIT, routeAgg.PICKUP_DROP, routeAgg.ON_SITE],
    funnel,

    avgConversionDays: convDaysCount > 0 ? convDaysSum / convDaysCount : null,

    rank: 0,
    rankScore: 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   RANKING  (data-driven, transparent — never hard-coded)
   ═══════════════════════════════════════════════════════════════════════

   The primary performance metric is FINALIZED REVENUE WON (the only truly
   realized business outcome). Ties are broken transparently, in order:

       1. Revenue Won (finalized invoices)   — primary, objective
       2. Converted (won) lead count         — realized outcomes
       3. Conversion rate                    — efficiency
       4. Qualified lead count               — pipeline quality
       5. Total leads                        — activity
       6. Agent name (A–Z)                   — stable, deterministic final tiebreak

   `rankScore` exposes the primary metric so the UI can show WHY an agent
   ranks where they do. Nothing about the order is opaque. */
export function rankAgents(agents: AgentPerformance[]): AgentPerformance[] {
  // Rank by EARNED (agent-driven) revenue/conversions — self-initiated
  // conversions the agent didn't drive never inflate their rank.
  const ranked = [...agents].sort((a, b) => {
    if (b.revenueWonAgentDriven !== a.revenueWonAgentDriven) return b.revenueWonAgentDriven - a.revenueWonAgentDriven;
    if (b.convertedAgentDriven !== a.convertedAgentDriven) return b.convertedAgentDriven - a.convertedAgentDriven;
    if (b.conversionRateAgentDriven !== a.conversionRateAgentDriven) return b.conversionRateAgentDriven - a.conversionRateAgentDriven;
    if (b.qualified !== a.qualified) return b.qualified - a.qualified;
    if (b.leads !== a.leads) return b.leads - a.leads;
    return a.agentName.localeCompare(b.agentName, undefined, { sensitivity: "base" });
  });
  ranked.forEach((a, i) => {
    a.rank = i + 1;
    a.rankScore = a.revenueWonAgentDriven;
  });
  return ranked;
}

/** Human explanation of the ranking metric (shown in the UI tooltip/footnote). */
export const RANKING_EXPLANATION =
  "Ranked by EARNED Revenue Won — finalized (paid) invoices from leads the agent actually worked and routed. " +
  "Self-initiated conversions (customer walked in on their own, only linked to an old lead) are shown separately and don't count. " +
  "Ties break by agent-driven conversions, then earned conversion rate, then qualified, then total leads.";

/** The medal for a rank (1/2/3), or "" for the rest. Emoji medals per spec;
 *  callers may map these to icons if preferred. */
export function medalFor(rank: number): "🥇" | "🥈" | "🥉" | "" {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
}

/* ═══════════════════════════════════════════════════════════════════════
   OWNER SCOPE: build the whole ranked table from real records
   ═══════════════════════════════════════════════════════════════════════ */

/** Owner-view options: which agents, and how to slice their leads. */
export interface OwnerPerformanceInput {
  /** The eligible Sales Agents in the authorized org/store scope. */
  agents: Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">[];
  /** The full visible lead set (already scoped by the caller's permission/RLS). */
  leads: Lead[];
  /** The full loaded follow-up set. */
  followUps: LeadFollowUp[];
  /** Finalized-revenue sources. */
  revenue: RevenueSources;
}

/**
 * Compute + rank performance for every agent in scope. Leads are attributed to
 * the agent that OWNS them (assigned_user_id). This is the owner master view
 * and the drill-down source of truth.
 */
export function computeOwnerPerformance(input: OwnerPerformanceInput): AgentPerformance[] {
  const { agents, leads, followUps, revenue } = input;
  const byOwner = new Map<string, Lead[]>();
  for (const l of leads) {
    if (!l.assignedTo) continue;
    const arr = byOwner.get(l.assignedTo) ?? [];
    arr.push(l);
    byOwner.set(l.assignedTo, arr);
  }
  const rows = agents.map((a) =>
    computeAgentPerformance(a, byOwner.get(a.id) ?? [], followUps, revenue),
  );
  return rankAgents(rows);
}

/**
 * Compute a single agent's performance (individual dashboard / owner drill-down).
 * Leads are attributed by ownership. Returns the row with rank/rankScore = 0
 * (ranking is a comparative concept only meaningful in the owner table); when
 * the caller has the full ranked owner list it can look up this agent's rank.
 */
export function computeSingleAgentPerformance(
  agent: Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">,
  leads: Lead[],
  followUps: LeadFollowUp[],
  revenue: RevenueSources,
): AgentPerformance {
  const own = leads.filter((l) => l.assignedTo === agent.id);
  return computeAgentPerformance(agent, own, followUps, revenue);
}

/* ═══════════════════════════════════════════════════════════════════════
   OWNER TOTALS (footer / summary cards) — summed from the per-agent rows so
   the total always equals the visible rows (drilldown consistency).
   ═══════════════════════════════════════════════════════════════════════ */
export interface OwnerTotals {
  agents: number;
  leads: number;
  qualified: number;
  converted: number;
  revenueWon: number;
  projection: number;
  ticketsWon: number;
  pendingFollowUp: number;
  conversionRate: number;
}

export function computeOwnerTotals(rows: AgentPerformance[]): OwnerTotals {
  const t: OwnerTotals = {
    agents: rows.length,
    leads: 0, qualified: 0, converted: 0, revenueWon: 0, projection: 0,
    ticketsWon: 0, pendingFollowUp: 0, conversionRate: 0,
  };
  for (const r of rows) {
    t.leads += r.leads;
    t.qualified += r.qualified;
    t.converted += r.converted;
    t.revenueWon += r.revenueWon;
    t.projection += r.projection;
    t.ticketsWon += r.ticketsWon;
    t.pendingFollowUp += r.pendingFollowUp;
  }
  t.conversionRate = t.leads > 0 ? t.converted / t.leads : 0;
  return t;
}

/* ═══════════════════════════════════════════════════════════════════════
   ROW-SUMMED TOTALS — sum the EXACT rows a table renders so the summary cards
   can never disagree with the visible rows (agent rows OR month rows). This is
   the header-KPI source for BOTH dashboards.
   ═══════════════════════════════════════════════════════════════════════ */
export interface PerfTotals {
  leads: number;
  qualified: number;
  converted: number;
  routeAssigned: number;
  walkIn: number;
  pickup: number;
  onSite: number;
  pickupCompleted: number;
  onSiteCompleted: number;
  revenueWon: number;
  invoiceCount: number;
  projection: number;
  ticketsWon: number;
  pendingFollowUp: number;
  overdueFollowUp: number;
  conversionRate: number;
  /* Effort-based credit split (earned vs self-initiated). */
  convertedAgentDriven: number;
  convertedSelfInitiated: number;
  ticketsWonAgentDriven: number;
  ticketsWonSelfInitiated: number;
  revenueWonAgentDriven: number;
  revenueWonSelfInitiated: number;
}

/** Sum any set of performance rows (agent rows or month rows) into totals that
 *  EXACTLY equal the rendered rows. conversionRate is re-derived from the
 *  summed converted/leads so it stays a true weighted rate. */
export function sumPerfRows(rows: Pick<AgentPerformance,
  | "leads" | "qualified" | "converted" | "routeAssigned" | "walkIn" | "pickup" | "onSite"
  | "pickupCompleted" | "onSiteCompleted" | "revenueWon" | "invoiceCount" | "projection"
  | "ticketsWon" | "pendingFollowUp" | "overdueFollowUp"
  | "convertedAgentDriven" | "convertedSelfInitiated" | "ticketsWonAgentDriven"
  | "ticketsWonSelfInitiated" | "revenueWonAgentDriven" | "revenueWonSelfInitiated">[]): PerfTotals {
  const t: PerfTotals = {
    leads: 0, qualified: 0, converted: 0, routeAssigned: 0, walkIn: 0, pickup: 0, onSite: 0,
    pickupCompleted: 0, onSiteCompleted: 0, revenueWon: 0, invoiceCount: 0, projection: 0,
    ticketsWon: 0, pendingFollowUp: 0, overdueFollowUp: 0, conversionRate: 0,
    convertedAgentDriven: 0, convertedSelfInitiated: 0, ticketsWonAgentDriven: 0,
    ticketsWonSelfInitiated: 0, revenueWonAgentDriven: 0, revenueWonSelfInitiated: 0,
  };
  for (const r of rows) {
    t.leads += r.leads;
    t.qualified += r.qualified;
    t.converted += r.converted;
    t.routeAssigned += r.routeAssigned;
    t.walkIn += r.walkIn;
    t.pickup += r.pickup;
    t.onSite += r.onSite;
    t.pickupCompleted += r.pickupCompleted;
    t.onSiteCompleted += r.onSiteCompleted;
    t.revenueWon += r.revenueWon;
    t.invoiceCount += r.invoiceCount;
    t.projection += r.projection;
    t.ticketsWon += r.ticketsWon;
    t.pendingFollowUp += r.pendingFollowUp;
    t.overdueFollowUp += r.overdueFollowUp;
    t.convertedAgentDriven += r.convertedAgentDriven;
    t.convertedSelfInitiated += r.convertedSelfInitiated;
    t.ticketsWonAgentDriven += r.ticketsWonAgentDriven;
    t.ticketsWonSelfInitiated += r.ticketsWonSelfInitiated;
    t.revenueWonAgentDriven += r.revenueWonAgentDriven;
    t.revenueWonSelfInitiated += r.revenueWonSelfInitiated;
  }
  t.conversionRate = t.leads > 0 ? t.converted / t.leads : 0;
  return t;
}

/* ═══════════════════════════════════════════════════════════════════════
   OWNER FILTERS  (date / store / agent / source / status / priority / route)
   A lead-level predicate reused by both the owner table and the individual
   dashboard so every KPI is drilldown-consistent. Store scope is applied by
   the caller via the shared multi-store predicate; this covers the rest.
   ═══════════════════════════════════════════════════════════════════════ */

/** The date presets shown on the performance strip (mirrors the reference
 *  image: All / Today / This Month / Last Month / Custom). `thisWeek` is used
 *  by the operational Lead Dashboard (current calendar week, Mon–Sun). */
export type PerfDateRange = "all" | "today" | "yesterday" | "thisWeek" | "7days" | "thisMonth" | "lastMonth" | "thisYear" | "custom";

export interface PerfFilters {
  dateRange: PerfDateRange;
  /** Custom range (inclusive), only used when dateRange === "custom". YYYY-MM-DD. */
  customFrom?: string;
  customTo?: string;
  source: string;    // "" = all
  status: string;    // "" = all
  priority: string;  // "" = all
  route: "" | "STORE_VISIT" | "PICKUP_DROP" | "ON_SITE";
}

export const EMPTY_PERF_FILTERS: PerfFilters = {
  dateRange: "all",
  source: "",
  status: "",
  priority: "",
  route: "",
};

export function hasActivePerfFilters(f: PerfFilters): boolean {
  return f.dateRange !== "all" || !!f.source || !!f.status || !!f.priority || !!f.route;
}

/** True if a lead's creation date falls in the given performance date range. */
export function leadInPerfDateRange(lead: Lead, f: PerfFilters, asOf: number = Date.now()): boolean {
  if (f.dateRange === "all") return true;
  const t = new Date(lead.createdAt || `${lead.date}T00:00:00`).getTime();
  if (isNaN(t)) return false;
  const now = new Date(asOf);
  const DAY = 86_400_000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (f.dateRange) {
    case "today":
      return t >= startOfToday;
    case "yesterday":
      return t >= startOfToday - DAY && t < startOfToday;
    case "thisWeek": {
      // Current calendar week starting Monday (locale-independent, matches the
      // "This Week" operational bucket on the Lead Dashboard).
      const dow = now.getDay(); // 0 = Sun … 6 = Sat
      const daysSinceMonday = (dow + 6) % 7;
      const weekStart = startOfToday - daysSinceMonday * DAY;
      return t >= weekStart;
    }
    case "7days":
      return t >= startOfToday - 7 * DAY;
    case "thisMonth":
      return t >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return t >= start && t < end;
    }
    case "thisYear":
      return t >= new Date(now.getFullYear(), 0, 1).getTime();
    case "custom": {
      const from = f.customFrom ? new Date(`${f.customFrom}T00:00:00`).getTime() : -Infinity;
      const to = f.customTo ? new Date(`${f.customTo}T23:59:59`).getTime() : Infinity;
      return t >= from && t <= to;
    }
    default:
      return true;
  }
}

/** Apply the performance filters to a lead set (NOT store scope — the caller
 *  applies the shared multi-store predicate separately). */
export function applyPerfFilters(leads: Lead[], f: PerfFilters): Lead[] {
  if (!hasActivePerfFilters(f)) return leads;
  const asOf = Date.now();
  return leads.filter((l) => {
    if (!leadInPerfDateRange(l, f, asOf)) return false;
    if (f.source && (l.source || "") !== f.source) return false;
    if (f.status && (l.status || "") !== f.status) return false;
    if (f.priority && (l.priority || "") !== f.priority) return false;
    if (f.route && (l.fulfilmentRoute || "").toUpperCase() !== f.route) return false;
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   INDIVIDUAL VIEW: one agent's performance broken down BY PERIOD (month)
   Same columns/shape as the master view, but each row is a time period
   (January, February, …) instead of an agent — so the individual sees how
   their own numbers trend across months. Derived from real records.
   ═══════════════════════════════════════════════════════════════════════ */

/** A single period row for the individual view. Reuses AgentPerformance so the
 *  SAME table renders it — `agentName` carries the period label (e.g. "January
 *  2026") and `agentId` carries a stable period key ("2026-01"). */
export interface PeriodPerformance extends AgentPerformance {
  /** Stable period key, e.g. "2026-01". */
  periodKey: string;
  /** Human label, e.g. "January 2026". */
  periodLabel: string;
  /** Month start (ms) — for sorting / navigation. */
  periodStart: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The `YYYY-MM` key + label for a lead's creation date. */
function monthKeyOf(lead: Lead): { key: string; label: string; start: number } | null {
  const d = new Date(lead.createdAt || `${lead.date}T00:00:00`);
  const t = d.getTime();
  if (isNaN(t)) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  const key = `${y}-${String(m + 1).padStart(2, "0")}`;
  return { key, label: `${MONTH_NAMES[m]} ${y}`, start: new Date(y, m, 1).getTime() };
}

/**
 * Break ONE agent's leads into month rows. Only months that actually have leads
 * appear (no empty/fabricated rows). Newest month first. `allFollowUps` is the
 * full set; it's intersected per-month inside computeAgentPerformance.
 */
export function computeAgentMonthlyPerformance(
  agent: Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">,
  leads: Lead[],
  followUps: LeadFollowUp[],
  revenue: RevenueSources,
): PeriodPerformance[] {
  const own = leads.filter((l) => l.assignedTo === agent.id);
  const byMonth = new Map<string, { label: string; start: number; leads: Lead[] }>();
  for (const l of own) {
    const mk = monthKeyOf(l);
    if (!mk) continue;
    let bucket = byMonth.get(mk.key);
    if (!bucket) { bucket = { label: mk.label, start: mk.start, leads: [] }; byMonth.set(mk.key, bucket); }
    bucket.leads.push(l);
  }

  const rows: PeriodPerformance[] = [];
  for (const [key, bucket] of byMonth) {
    const base = computeAgentPerformance(agent, bucket.leads, followUps, revenue);
    rows.push({
      ...base,
      periodKey: key,
      periodLabel: bucket.label,
      periodStart: bucket.start,
    });
  }
  // Newest month first.
  rows.sort((a, b) => b.periodStart - a.periodStart);
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════
   CONVERSION TIER  (transparent, documented — the Silver/Gold/Diamond badge)
   ═══════════════════════════════════════════════════════════════════════
   A recognition tier derived purely from the conversion rate. Thresholds live
   in ONE place so they can be tuned without touching the UI. Below Silver → no
   tier (kept honest — a low conversion rate earns no badge). */
export type ConversionTier = "Diamond" | "Gold" | "Silver" | "";

export const CONVERSION_TIER_THRESHOLD = {
  Diamond: 0.6, // ≥ 60% conversion
  Gold: 0.4,    // ≥ 40%
  Silver: 0.2,  // ≥ 20%
} as const;

export function conversionTier(conversionRate: number): ConversionTier {
  if (conversionRate >= CONVERSION_TIER_THRESHOLD.Diamond) return "Diamond";
  if (conversionRate >= CONVERSION_TIER_THRESHOLD.Gold) return "Gold";
  if (conversionRate >= CONVERSION_TIER_THRESHOLD.Silver) return "Silver";
  return "";
}
