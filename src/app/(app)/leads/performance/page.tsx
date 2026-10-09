"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance (Lead Management).

   TWO views, ONE reporting engine (lib/agent-performance.ts):

     • ALL AGENTS   → the owner leaderboard: one row per eligible Sales Agent,
       ranked with medals, with a TOTAL footer. Owner-only.
     • INDIVIDUAL   → one Sales Agent's performance workspace: six KPI cards
       (trend pill + real sparkline), a month-by-month table, a Conversion
       Summary, a Lead Conversion Funnel and a Lead Mix (by service route) +
       Top Source. This is the signed-in agent's OWN view; an owner may open
       any agent's view WITHOUT impersonation (analytical scope only).

   Scope & security:
     • A Sales Agent (own-scope) only ever sees their OWN data — the agent
       selector is hidden and the scope is forced to currentUserId. `useLeads`
       is already RLS-scoped; this page never widens it.
     • An owner (CAP.lead.performanceAll) may switch tabs and, in Individual
       mode, pick which agent to analyse. The session/user/role never change.
     • ONE period + store + filter state drives EVERY section of the page, so
       the KPIs, table, funnel, route mix and source analysis can never
       disagree (spec: no "KPI = This Month, table = All Time").

   Everything is DERIVED from real Lead + follow-up + finalized-invoice
   records — no dummy values, no fabricated trends.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock, ChevronDown, Trophy, Users, IndianRupee, Target, CalendarClock,
  UserCheck, Megaphone, Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { RoxFilterPanelHeader, ActiveFilterChip } from "@/components/ui/rox-filter";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { cn, formatINR, initials } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useStoreContext } from "@/lib/store-context";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { allow, CAP } from "@/lib/capabilities";
import { agentsForStore, type SalesAgent } from "@/lib/sales-agents";
import {
  computeOwnerPerformance, computeAgentPerformance, computeAgentMonthlyPerformance,
  sumPerfRows, applyPerfFilters,
  RANKING_EXPLANATION, EMPTY_PERF_FILTERS, type PerfFilters, type PerfDateRange,
} from "@/lib/agent-performance";
import { PerformanceTable } from "@/components/leads/performance-table";
import {
  PerfKpiRow, ConversionSummarySection, LeadConversionFunnelSection,
  LeadRouteMixSection, type KpiSpec,
} from "@/components/leads/individual-performance";

const DATE_OPTIONS: { label: string; value: PerfDateRange }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7days" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function Restricted() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Lead Management" title="Agent Performance" />
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Performance is restricted</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your role doesn&apos;t have permission to view sales performance. Ask an administrator to
          grant the appropriate permission.
        </p>
      </div>
    </div>
  );
}

/* Summary total card (the boxes above the All-Agents leaderboard). */
/* ── Summary KPI card (All-Agents) ──────────────────────────────────────────
   A properly COLOURED executive KPI tile. Each metric carries a semantic tone
   (a soft tinted icon chip, a matching left accent bar and a value colour)
   so the row reads at a glance — acquisition / qualification / success /
   revenue / rate — instead of a flat monochrome strip. Shares the elevated
   card treatment (rounded-2xl, soft border, hover lift) with the Individual
   view's KPI cards so both views feel like one family. */
type KpiTone = "blue" | "indigo" | "amber" | "emerald" | "violet";

const KPI_TONE: Record<KpiTone, { chip: string; bar: string; value: string; glow: string }> = {
  blue:    { chip: "bg-[#EEF1FD] text-[#4361EE]", bar: "bg-[#4361EE]", value: "text-[#2A3BA3]", glow: "hover:shadow-[0_8px_24px_-10px_rgba(67,97,238,0.3)] hover:border-[#4361EE]/40" },
  indigo:  { chip: "bg-indigo-50 text-indigo-600", bar: "bg-indigo-500", value: "text-indigo-700", glow: "hover:shadow-[0_8px_24px_-10px_rgba(99,102,241,0.3)] hover:border-indigo-400/50" },
  amber:   { chip: "bg-amber-50 text-amber-600", bar: "bg-amber-500", value: "text-amber-700", glow: "hover:shadow-[0_8px_24px_-10px_rgba(245,158,11,0.3)] hover:border-amber-400/50" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500", value: "text-emerald-700", glow: "hover:shadow-[0_8px_24px_-10px_rgba(16,185,129,0.3)] hover:border-emerald-400/50" },
  violet:  { chip: "bg-violet-50 text-violet-600", bar: "bg-violet-500", value: "text-violet-700", glow: "hover:shadow-[0_8px_24px_-10px_rgba(139,92,246,0.3)] hover:border-violet-400/50" },
};

function TotalCard({
  label, value, sub, icon: Icon, tone = "blue",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: KpiTone;
}) {
  const t = KPI_TONE[tone];
  return (
    <div className={cn(
      "group relative flex flex-col overflow-hidden rounded-2xl border border-[#B3BFF6]/50 bg-card p-4 pl-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5",
      t.glow,
    )}>
      {/* Semantic left accent bar */}
      <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
      <div className="flex items-center gap-2">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", t.chip)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <p className={cn("mt-2.5 font-display text-[26px] font-extrabold leading-none tracking-tight tabular-nums", t.value)}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub ?? "\u00A0"}</p>
    </div>
  );
}

/* Owner-only agent picker shown in the Individual header (analytical scope —
   never impersonation). A Sales Agent never sees this. */
function AgentScopePicker({
  agents, selectedId, onSelect,
}: {
  agents: SalesAgent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = agents.find((a) => a.id === selectedId);
  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="inline-flex h-[34px] items-center gap-2 rounded-xl border border-[#4361EE]/30 bg-card px-3 text-[12px] font-semibold text-zinc-700 transition hover:bg-muted"
        >
          <UserCheck className="h-3.5 w-3.5 text-[#4361EE]" />
          <span className="max-w-[140px] truncate">{selected?.name ?? "Select agent"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    >
      {(close) => (
        <div className="py-0.5">
          {agents.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">No sales agents available</p>
          ) : (
            agents.map((a) => (
              <MenuItem key={a.id} onClick={() => { onSelect(a.id); close(); }} className={a.id === selectedId ? "bg-[#EEF1FD]" : ""}>
                <span className="flex flex-1 items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#4361EE] text-[9px] font-bold text-white">{initials(a.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{a.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{a.roleLabel}</span>
                    </span>
                  </span>
                  {a.id === selectedId && <Check className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />}
                </span>
              </MenuItem>
            ))
          )}
        </div>
      )}
    </Dropdown>
  );
}

export default function AgentPerformancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  const { stores, isAllShops } = useStoreContext();
  // In Single-Store Lead mode there is only ONE lead store, so a store filter is
  // meaningless clutter — hide it. Multi-Store mode keeps the full filter.
  const leadMode = useLeadStoreMode();
  const { salesAgents, leads, followUps, viewAsAgentId, setViewAsAgent } = useLeads();
  const { tickets, invoices } = useStore();

  // Agent Performance is the ONE surface where everyone — owner AND individual
  // Sales Agent — gets the same experience: the "All Agents" ranked comparison
  // + the "Individual" toggle + per-row View Details. Unlike the Dashboard /
  // Deals / Quotations / Contacts (which stay strictly own-scoped for a Sales
  // Agent), the performance leaderboard is intentionally shared so an agent can
  // see where they rank. Gated by the own/all performance keys only.
  const canAll = allow(can, CAP.lead.performanceAll);
  const canOwn = allow(can, CAP.lead.performanceOwn);

  // A deep link (?agent=<id>&view=individual) opens the Individual view for a
  // specific agent — used by the drill-down route and external links. Only an
  // owner may target an agent OTHER than themselves; the own-scope guard below
  // still forces a Sales Agent to their own data regardless of the param.
  const initialAgentParam = searchParams.get("agent") ?? "";
  const initialViewParam = searchParams.get("view");

  // Role-driven default view: owners land on the aggregate leaderboard; a Sales
  // Agent (own-scope) lands directly on their own Individual workspace. A
  // ?view=individual (or an ?agent= deep link) opens Individual immediately.
  const [tab, setTab] = useState<"individual" | "all">(
    // An active owner lens (viewAsAgentId) forces the Individual view on that
    // agent; otherwise owners default to the All-Agents table, agents to self.
    viewAsAgentId || initialViewParam === "individual" || initialAgentParam ? "individual" : (canAll ? "all" : "individual"),
  );

  /* ── ONE shared filter state drives BOTH tabs + EVERY Individual section ── */
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [perf, setPerf] = useState<PerfFilters>(EMPTY_PERF_FILTERS);
  const [agentFilter, setAgentFilter] = useState<string>("");   // All-Agents row filter
  const [showFilters, setShowFilters] = useState(false);
  // Owner's Individual analytical subject. "" → resolve to self (or first
  // agent). Seeded from the ?agent= deep link when present.
  const [scopeAgentId, setScopeAgentId] = useState<string>(viewAsAgentId || initialAgentParam);

  /* Keep the page in lockstep with the global Agents-dropdown lens: when the
     owner picks an agent in the topbar, this page follows into that agent's
     Individual view; when they clear it ("All Agents"), it returns to the
     combined leaderboard. Scope-only — never navigates. */
  useEffect(() => {
    if (!canAll) return;
    if (viewAsAgentId) { setScopeAgentId(viewAsAgentId); setTab("individual"); }
    else { setTab("all"); }
  }, [viewAsAgentId, canAll]);

  const revenue = useMemo(() => ({ tickets, invoices }), [tickets, invoices]);

  /* Eligible agents in the active store scope (org-wide in All Shops). */
  const eligibleAgents = useMemo(
    () => agentsForStore(salesAgents, isAllShops ? undefined : (stores[0]?.id ?? undefined)),
    [salesAgents, isAllShops, stores],
  );

  /* The signed-in agent's own identity row. */
  const selfAgent = useMemo<Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">>(
    () => salesAgents.find((a) => a.id === currentUserId)
      ?? { id: currentUserId ?? "", name: currentUserName, roleLabel: "Sales Agent" },
    [salesAgents, currentUserId, currentUserName],
  );

  /* The agent being ANALYSED in the Individual view:
       • Sales Agent (own-scope) → ALWAYS themselves (scope is forced; the
         picker is hidden). This is the security boundary at the UI layer; RLS
         is the real one.
       • Owner → the selected agent, defaulting to self when they are an agent,
         else the first eligible agent. */
  const scopedAgent = useMemo<Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">>(() => {
    if (!canAll) return selfAgent;
    const pick = scopeAgentId || selfAgent.id;
    return eligibleAgents.find((a) => a.id === pick)
      ?? (eligibleAgents.find((a) => a.id === selfAgent.id) ?? eligibleAgents[0] ?? selfAgent);
  }, [canAll, scopeAgentId, selfAgent, eligibleAgents]);

  /* Store + performance-filtered lead set (shared by both tabs). */
  const scopedLeads = useMemo(() => {
    let l = leads;
    if (storeFilter.length > 0) l = l.filter((x) => matchesStoreSelection(x.branchId, storeFilter));
    return applyPerfFilters(l, perf);
  }, [leads, storeFilter, perf]);

  /* ── INDIVIDUAL: the analysed agent's own leads (within the shared scope). ── */
  const agentLeads = useMemo(
    () => scopedLeads.filter((l) => l.assignedTo === scopedAgent.id),
    [scopedLeads, scopedAgent.id],
  );
  const agentPerf = useMemo(
    () => computeAgentPerformance(scopedAgent, agentLeads, followUps, revenue),
    [scopedAgent, agentLeads, followUps, revenue],
  );
  // Month rows (newest-first) — drive the monthly table AND the KPI sparklines.
  const agentMonths = useMemo(
    () => computeAgentMonthlyPerformance(scopedAgent, scopedLeads, followUps, revenue),
    [scopedAgent, scopedLeads, followUps, revenue],
  );

  /* ── ALL AGENTS: ranked rows + totals. ── */
  const rankedRows = useMemo(() => {
    const rows = computeOwnerPerformance({ agents: eligibleAgents, leads: scopedLeads, followUps, revenue });
    return agentFilter ? rows.filter((r) => r.agentId === agentFilter) : rows;
  }, [eligibleAgents, scopedLeads, followUps, revenue, agentFilter]);
  const boardTotals = useMemo(() => sumPerfRows(rankedRows), [rankedRows]);

  if (!canAll && !canOwn) return <Restricted />;

  /* The All Agents / Individual toggle — owners only. */
  const tabToggle = canAll ? (
    <SegmentedTabs
      size="sm"
      value={tab}
      onChange={(v) => {
        const next = v as "individual" | "all";
        setTab(next);
        // Switching to the combined table clears the owner lens so the whole
        // module (dashboard/deals/quotations/contacts) returns to combined too.
        if (next === "all") setViewAsAgent("");
      }}
      options={[
        { label: "All Agents", value: "all" },
        { label: "Individual", value: "individual" },
      ]}
    />
  ) : null;

  /* The date control (right of the header) — mirrors the secondary strip. */
  const dateControl = (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <SegmentedTabs
        size="sm"
        options={DATE_OPTIONS}
        value={perf.dateRange}
        onChange={(v) => setPerf((p) => ({ ...p, dateRange: v as PerfDateRange }))}
      />
    </div>
  );

  /* Active filter chips (shared). */
  const activeChips: { label?: string; value: string; onClear: () => void }[] = [];
  if (perf.dateRange !== "all") activeChips.push({ label: "Date", value: DATE_OPTIONS.find((d) => d.value === perf.dateRange)?.label ?? perf.dateRange, onClear: () => setPerf((p) => ({ ...p, dateRange: "all" })) });
  if (storeFilter.length > 0) activeChips.push({ label: "Stores", value: `${storeFilter.length} selected`, onClear: () => setStoreFilter([]) });
  if (tab === "all" && agentFilter) activeChips.push({ label: "Agent", value: eligibleAgents.find((a) => a.id === agentFilter)?.name ?? agentFilter, onClear: () => setAgentFilter("") });
  if (perf.source) activeChips.push({ label: "Source", value: perf.source, onClear: () => setPerf((p) => ({ ...p, source: "" })) });
  if (perf.status) activeChips.push({ label: "Status", value: perf.status, onClear: () => setPerf((p) => ({ ...p, status: "" })) });
  if (perf.priority) activeChips.push({ label: "Priority", value: perf.priority, onClear: () => setPerf((p) => ({ ...p, priority: "" })) });
  if (perf.route) activeChips.push({ label: "Route", value: perf.route, onClear: () => setPerf((p) => ({ ...p, route: "" })) });

  const sourceOptions = distinct(leads.map((l) => l.source));
  const statusOptions = distinct(leads.map((l) => l.status));
  const priorityOptions = distinct(leads.map((l) => l.priority));
  const reset = () => { setPerf(EMPTY_PERF_FILTERS); setStoreFilter([]); setAgentFilter(""); };

  /* Build a Lead-Table deep link scoped to an agent + optional month + store +
     filters so a drilldown opens exactly the underlying leads. */
  const leadListHref = (opts: { month?: string }) => {
    const p = new URLSearchParams();
    p.set("agent", scopedAgent.id);
    if (opts.month) p.set("month", opts.month);
    if (storeFilter.length > 0) p.set("stores", storeFilter.join(","));
    if (perf.source) p.set("source", perf.source);
    if (perf.status) p.set("status", perf.status);
    if (perf.priority) p.set("priority", perf.priority);
    if (perf.route) p.set("route", perf.route);
    return `/leads/list?${p.toString()}`;
  };

  /* The shared Store + Filters control row (used by both tabs). */
  const filterControls = (
    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
      {leadMode.isMulti && <StoreMultiSelect value={storeFilter} onChange={setStoreFilter} />}
      <button
        onClick={() => setShowFilters((s) => !s)}
        className={cn(
          "inline-flex h-[34px] items-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition",
          showFilters || activeChips.length > 0
            ? "border-[#4361EE] bg-[#EEF1FD] text-[#3A4DBB]"
            : "border-[#4361EE]/30 bg-card text-zinc-600 hover:bg-muted",
        )}
      >
        Filters
        {activeChips.length > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-bold text-white">
            {activeChips.length}
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showFilters && "rotate-180")} />
      </button>
    </div>
  );

  const filterPanel = showFilters && (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <RoxFilterPanelHeader title="Filter leads" onClose={() => setShowFilters(false)} onReset={reset} showReset={activeChips.length > 0} />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tab === "all" && (
          <SelectField label="Agent" value={agentFilter} onChange={setAgentFilter}
            options={eligibleAgents.map((a) => ({ label: a.name, value: a.id }))} allLabel="All agents" />
        )}
        <SelectField label="Source" value={perf.source} onChange={(v) => setPerf((p) => ({ ...p, source: v }))}
          options={sourceOptions.map((s) => ({ label: s, value: s }))} allLabel="All sources" />
        <SelectField label="Lead Status" value={perf.status} onChange={(v) => setPerf((p) => ({ ...p, status: v }))}
          options={statusOptions.map((s) => ({ label: s, value: s }))} allLabel="All statuses" />
        <SelectField label="Priority" value={perf.priority} onChange={(v) => setPerf((p) => ({ ...p, priority: v }))}
          options={priorityOptions.map((s) => ({ label: s, value: s }))} allLabel="All priorities" />
        <SelectField label="Route" value={perf.route} onChange={(v) => setPerf((p) => ({ ...p, route: v as PerfFilters["route"] }))}
          options={[{ label: "Walk-In", value: "STORE_VISIT" }, { label: "Pickup & Drop", value: "PICKUP_DROP" }, { label: "On-Site", value: "ON_SITE" }]}
          allLabel="All routes" />
      </div>
    </div>
  );

  const chipsRow = activeChips.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      {activeChips.map((c, i) => (
        <ActiveFilterChip key={i} label={c.label} value={c.value} onClear={c.onClear} />
      ))}
      <button onClick={reset} className="text-[12px] font-medium text-[#4361EE] hover:underline">Clear all</button>
    </div>
  );

  /* ══════════════════════════ INDIVIDUAL VIEW ══════════════════════════ */
  if (tab === "individual") {
    // KPI card specs — every value from agentPerf (already scope+filter bound);
    // trend + sparkline come from the agent's REAL month rows.
    const kpis: KpiSpec[] = [
      {
        label: "Leads", tone: "blue", icon: Users, metric: "leads",
        value: String(agentPerf.leads),
        sub: agentPerf.leads > 0 ? "Total handled" : undefined,
        onClick: () => router.push(leadListHref({})),
      },
      {
        label: "Qualified", tone: "violet", icon: UserCheck, metric: "qualified",
        value: String(agentPerf.qualified),
        sub: agentPerf.leads > 0 ? `${pct(agentPerf.qualified / agentPerf.leads)} of total` : undefined,
      },
      {
        label: "Converted", tone: "amber", icon: Trophy, metric: "converted",
        value: String(agentPerf.convertedAgentDriven),
        sub: `${pct(agentPerf.conversionRate)} conversion rate`,
      },
      {
        label: "Revenue Won", tone: "emerald", icon: IndianRupee, metric: "revenueWon",
        value: formatINR(agentPerf.revenueWonAgentDriven),
        sub: `From ${agentPerf.invoiceCount} ${agentPerf.invoiceCount === 1 ? "invoice" : "invoices"}`,
        onClick: () => router.push(leadListHref({})),
      },
      {
        label: "Conversion", tone: "blue", icon: Target, metric: "conversionRate",
        value: pct(agentPerf.conversionRate),
        sub: agentPerf.leads > 0 ? `${agentPerf.convertedAgentDriven}/${agentPerf.leads} leads` : undefined,
      },
      {
        label: "Follow-up", tone: agentPerf.overdueFollowUp > 0 ? "overdue" : "amber",
        icon: CalendarClock, metric: "pendingFollowUp", higherIsBetter: false,
        value: String(agentPerf.pendingFollowUp),
        sub: agentPerf.overdueFollowUp > 0 ? `${agentPerf.overdueFollowUp} overdue` : "Pending action",
        onClick: () => router.push(leadListHref({})),
      },
    ];

    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Lead Management"
          title={`Agent Performance — ${scopedAgent.name}`}
          subtitle="Sales performance across authorized stores — derived from real records."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canAll && <AgentScopePicker agents={eligibleAgents} selectedId={scopedAgent.id} onSelect={(id) => { setScopeAgentId(id); setViewAsAgent(id); }} />}
              {tabToggle}
            </div>
          }
        />

        {/* KPI cards */}
        <PerfKpiRow specs={kpis} months={agentMonths} />

        {/* Secondary date strip + Store/Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {dateControl}
          {filterControls}
        </div>
        {chipsRow}
        {filterPanel}

        {/* Monthly performance table */}
        <PerformanceTable
          rows={agentMonths}
          rowKind="period"
          firstColLabel="Month"
          showReport
          reportHref={(r) => leadListHref({ month: (r as { periodKey?: string }).periodKey })}
          emptyText="No leads captured yet. Monthly performance appears as soon as this agent owns real leads."
        />

        {/* Conversion Summary · Funnel · Route Mix */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ConversionSummarySection
            perf={agentPerf}
            icons={{ qualified: UserCheck, revenue: IndianRupee, followUp: CalendarClock }}
          />
          <LeadConversionFunnelSection perf={agentPerf} />
          <LeadRouteMixSection perf={agentPerf} sourceIcon={Megaphone} />
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 text-[#4361EE]" />
          Revenue Won = finalized (paid) invoices linked via Lead → Ticket → Invoice. Projection = probability-weighted open pipeline. Walk-In Visited counts a real linked walk-in, not route assignment.
        </p>
      </div>
    );
  }

  /* ══════════════════════════ ALL AGENTS VIEW ══════════════════════════ */
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Lead Management"
        title={canAll ? "Agent Performance — All Agents" : "Sales Leaderboard"}
        subtitle={canAll
          ? "Ranked salesperson analytics across your authorized stores — derived from real records."
          : "How the sales team is performing. Your row is highlighted — derived from real records."}
        actions={tabToggle}
      />

      {/* Summary totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TotalCard label="Agents" tone="blue" value={String(rankedRows.length)} icon={Users} />
        <TotalCard label="Leads" tone="indigo" value={String(boardTotals.leads)} icon={Users} />
        <TotalCard label="Qualified" tone="violet" value={String(boardTotals.qualified)} sub={boardTotals.leads > 0 ? `${pct(boardTotals.qualified / boardTotals.leads)} of total` : undefined} icon={UserCheck} />
        <TotalCard label="Converted" tone="amber" value={String(boardTotals.convertedAgentDriven)} sub={boardTotals.convertedSelfInitiated > 0 ? `+${boardTotals.convertedSelfInitiated} self` : undefined} icon={Trophy} />
        <TotalCard label="Revenue Won" tone="emerald" value={formatINR(boardTotals.revenueWonAgentDriven)} sub={boardTotals.revenueWonSelfInitiated > 0 ? `+${formatINR(boardTotals.revenueWonSelfInitiated)} self` : undefined} icon={IndianRupee} />
        <TotalCard label="Conversion" tone="blue" value={pct(boardTotals.conversionRate)} icon={Target} />
      </div>

      {/* Owner-only filters (a Sales Agent gets a read-only leaderboard). */}
      {canAll && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {dateControl}
            {filterControls}
          </div>
          {chipsRow}
          {filterPanel}
        </div>
      )}

      <PerformanceTable
        rows={rankedRows}
        rowKind="agent"
        firstColLabel="Agent Name"
        showReport={canAll}
        // Owner "View Details" → open that agent's Individual view in-place,
        // preserving the current period/store/filter context (no navigation,
        // no impersonation — just a scope switch).
        onReport={canAll ? (r) => { setScopeAgentId(r.agentId); setTab("individual"); setViewAsAgent(r.agentId); } : undefined}
        highlightAgentId={currentUserId ?? undefined}
        emptyText="No Sales Agents match the current filters. Metrics appear as soon as agents own real leads."
      />

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Trophy className="h-3.5 w-3.5 text-[#4361EE]" />
        {RANKING_EXPLANATION}
      </p>
    </div>
  );
}

/* ─── local helpers ─── */

function distinct(values: (string | undefined | null)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function SelectField({
  label, value, onChange, options, allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  allLabel: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[34px] rounded-xl border border-input bg-card px-2.5 text-[13px] text-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
