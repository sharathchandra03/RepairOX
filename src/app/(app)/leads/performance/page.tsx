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
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, ChevronDown, Trophy, IndianRupee, CalendarClock,
  UserCheck, Megaphone, Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceCollapseBar } from "@/components/common/workspace-collapse-bar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { RoxFilterPanelHeader, ActiveFilterChip } from "@/components/ui/rox-filter";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { cn, initials } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useWorkspaceCollapsed } from "@/hooks/use-workspace-collapsed";
import { useStoreContext } from "@/lib/store-context";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { allow, CAP } from "@/lib/capabilities";
import { agentsForStore, type SalesAgent } from "@/lib/sales-agents";
import {
  computeOwnerPerformance, computeAgentPerformance, computeAgentMonthlyPerformance,
  sumPerfRows, applyPerfFilters, kpiSummaryForAgent, kpiSummaryFromTotals,
  RANKING_EXPLANATION, EMPTY_PERF_FILTERS, type PerfFilters, type PerfDateRange,
} from "@/lib/agent-performance";
import { PerformanceTable } from "@/components/leads/performance-table";
import {
  KpiSummaryRow, ConversionSummarySection, LeadConversionFunnelSection,
  LeadRouteMixSection, type KpiCardDrilldowns,
} from "@/components/leads/individual-performance";

const DATE_OPTIONS: { label: string; value: PerfDateRange }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7days" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "Custom", value: "custom" },
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
            // Cap the agent list to ~half the viewport with internal scroll so a
            // long roster never grows the dropdown very tall (matches the topbar
            // AgentScopeSelector's max-h scroll pattern). rox-rail-scroll = the
            // thin brand-blue scrollbar utility.
            <div className="max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll">
              {agents.map((a) => (
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
              ))}
            </div>
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
  const { activeStoreId, isAllShops } = useStoreContext();
  // In Single-Store Lead mode there is only ONE lead store, so a store filter is
  // meaningless clutter — hide it. Multi-Store mode keeps the full filter.
  const leadMode = useLeadStoreMode();
  const { salesAgents, leads, followUps, viewAsAgentId, setViewAsAgent, currentUserIsSalesAgent } = useLeads();
  const { tickets, invoices, invoiceRefunds } = useStore();

  // Agent Performance is the ONE surface where everyone — owner AND individual
  // Sales Agent — gets the same experience: the "All Agents" ranked comparison
  // + the "Individual" toggle + per-row View Details. Unlike the Dashboard /
  // Deals / Quotations / Contacts (which stay strictly own-scoped for a Sales
  // Agent), the performance leaderboard is intentionally shared so an agent can
  // see where they rank. Gated by the own/all performance keys only.
  const canAll = allow(can, CAP.lead.performanceAll);
  const canOwn = allow(can, CAP.lead.performanceOwn);
  // A user who is themselves an eligible Sales Agent never gets cross-agent
  // SCOPE controls on this page (the agent picker + the All/Individual toggle),
  // even if their role carries a coarse reporting key (e.g. view_sales_reports
  // from the Leads "view" tier). Mirrors the topbar AgentScopeSelector guard.
  // They still see the shared read-only leaderboard; they just can't switch
  // agents or scope to the All-Agents comparison.
  const canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId);
  // Everyone past the Restricted guard can see the SHARED leaderboard + toggle
  // to the All-Agents ranked table (including an individual Sales Agent, so
  // they can see where they rank). This is distinct from canCrossAgent, which
  // only gates picking/drilling into ANOTHER agent's individual data.
  const canViewLeaderboard = canAll || canOwn;

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
    // Role-driven DEFAULT only — never a pin. An individual Sales Agent lands
    // on their own Individual workspace; an owner lands on the All-Agents table
    // (unless an owner lens / ?view=individual / ?agent= deep link opens
    // Individual immediately). Individual agents may still freely toggle to the
    // shared All-Agents table — the toggle below is gated on canViewLeaderboard,
    // not on canCrossAgent.
    !canCrossAgent
      ? "individual"
      : (viewAsAgentId || initialViewParam === "individual" || initialAgentParam ? "individual" : "all"),
  );

  /* ── ONE shared filter state drives BOTH tabs + EVERY Individual section ── */
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [perf, setPerf] = useState<PerfFilters>(EMPTY_PERF_FILTERS);
  const [agentFilter, setAgentFilter] = useState<string>("");   // All-Agents row filter
  const [showFilters, setShowFilters] = useState(false);
  // Per-user Collapse/Expand of the control area ABOVE the filter strip (page
  // header + the four KPI cards) so the agent table can fill the viewport.
  // Presentation only — never touches period/store/filter state.
  const workspace = useWorkspaceCollapsed("agent_performance", currentUserId);
  // Owner's Individual analytical subject. "" → resolve to self (or first
  // agent). Seeded from the ?agent= deep link when present.
  const [scopeAgentId, setScopeAgentId] = useState<string>(viewAsAgentId || initialAgentParam);

  /* Keep the page in lockstep with the global Agents-dropdown lens: when the
     owner picks an agent in the topbar, this page follows into that agent's
     Individual view; when they clear it ("All Agents"), it returns to the
     combined leaderboard. Scope-only — never navigates. */
  useEffect(() => {
    // Only the OWNER lens drives the tab here. An individual Sales Agent has no
    // lens (canViewAsAgent is false in the context), so leave their own toggle
    // choice alone — they may sit on All Agents or Individual as they please.
    if (!canCrossAgent) return;
    if (viewAsAgentId) { setScopeAgentId(viewAsAgentId); setTab("individual"); }
    else { setTab("all"); }
  }, [viewAsAgentId, canCrossAgent]);

  // Net Revenue Won subtracts only finalized-parent succeeded refunds (gross
  // revenueWon stays unchanged — see agent-performance.ts).
  const revenue = useMemo(() => ({ tickets, invoices, refunds: invoiceRefunds }), [tickets, invoices, invoiceRefunds]);

  /* Eligible agents in the active store scope (org-wide in All Shops).
     Match against the CURRENTLY-SELECTED store (activeStoreId), not stores[0]
     (the first of the accessible-stores list, which need not be the selected
     one). An agent whose authorized stores include the active store — e.g.
     their home store = Indiranagar when Indiranagar is selected — is included.
     In All Shops (activeStoreId null) the scope is org-wide. */
  const eligibleAgents = useMemo(
    () => agentsForStore(salesAgents, isAllShops ? undefined : (activeStoreId ?? undefined)),
    [salesAgents, isAllShops, activeStoreId],
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
    // Forced own-scope (no all-perf key, OR an individual Sales Agent) always
    // resolves to self — a ?agent=<other> deep link still renders THEIR data.
    if (!canCrossAgent) return selfAgent;
    const pick = scopeAgentId || selfAgent.id;
    return eligibleAgents.find((a) => a.id === pick)
      ?? (eligibleAgents.find((a) => a.id === selfAgent.id) ?? eligibleAgents[0] ?? selfAgent);
  }, [canCrossAgent, scopeAgentId, selfAgent, eligibleAgents]);

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

  /* The All Agents / Individual toggle — the SHARED leaderboard control,
     available to EVERYONE who can view the page (owner AND individual Sales
     Agent). An individual agent uses it to toggle between their own Individual
     report and the ranked All-Agents table (read-only, their row highlighted);
     they still cannot pick/drill into another agent (that is canCrossAgent). */
  const tabToggle = canViewLeaderboard ? (
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

  /* The date control (right of the header) — mirrors the secondary strip. The
     mandatory "All" (clears the constraint) and "Custom" (opens the shared
     calendar range picker) segments are both present per the design-system
     date-strip standard. Picking "Custom" auto-opens the calendar below the
     strip; the chosen from/to drive perf.customFrom / perf.customTo. */
  const dateControl = (
    <div className="flex flex-col gap-2">
      <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedTabs
          size="sm"
          options={DATE_OPTIONS}
          value={perf.dateRange}
          onChange={(v) => setPerf((p) => ({ ...p, dateRange: v as PerfDateRange }))}
        />
      </div>
      <DateRangePicker
        open={perf.dateRange === "custom"}
        from={perf.customFrom ?? ""}
        to={perf.customTo ?? ""}
        onFromChange={(v) => setPerf((p) => ({ ...p, customFrom: v }))}
        onToChange={(v) => setPerf((p) => ({ ...p, customTo: v }))}
      />
    </div>
  );

  /* Active filter chips (shared). */
  const activeChips: { label?: string; value: string; onClear: () => void }[] = [];
  if (perf.dateRange !== "all") activeChips.push({
    label: "Date",
    value: perf.dateRange === "custom"
      ? (perf.customFrom && perf.customTo ? `${perf.customFrom} → ${perf.customTo}` : "Custom range")
      : (DATE_OPTIONS.find((d) => d.value === perf.dateRange)?.label ?? perf.dateRange),
    onClear: () => setPerf((p) => ({ ...p, dateRange: "all", customFrom: "", customTo: "" })),
  });
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
    // The four consolidated KPI cards — every value derived from agentPerf
    // (already scope + filter bound) through the ONE shared kpiSummary engine.
    const summary = kpiSummaryForAgent(agentPerf);
    const drilldowns: KpiCardDrilldowns = {
      onRevenue: () => router.push(leadListHref({})),
      onInvoices: () => router.push(leadListHref({})),
      onTotalLeads: () => router.push(leadListHref({})),
      onQualified: () => router.push(leadListHref({})),
      onConverted: () => router.push(leadListHref({})),
      onFollowUps: () => router.push(leadListHref({})),
      onOverdue: () => router.push(leadListHref({})),
    };

    return (
      <div className="space-y-5">
        {/* Collapsible control area (page header + KPI cards). Stays MOUNTED —
            only its height animates — so collapsing never resets scope/period/
            filter state. */}
        <AnimatePresence initial={false}>
          {!workspace.collapsed && (
            <motion.div
              key="perf-header-individual"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-5">
                <PageHeader
                  eyebrow="Lead Management"
                  title={`Agent Performance — ${scopedAgent.name}`}
                  subtitle="Sales performance for the selected agent across authorized stores — derived from real records."
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      {canCrossAgent && <AgentScopePicker agents={eligibleAgents} selectedId={scopedAgent.id} onSelect={(id) => { setScopeAgentId(id); setViewAsAgent(id); }} />}
                      {tabToggle}
                    </div>
                  }
                />

                {/* Four consolidated KPI cards */}
                <KpiSummaryRow summary={summary} drilldowns={drilldowns} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Secondary date strip + Store/Filters + the ONE Collapse control */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {dateControl}
          <div className="flex flex-wrap items-center gap-2">
            {filterControls}
            <WorkspaceCollapseBar
              collapsed={workspace.collapsed}
              onToggle={workspace.toggle}
              labelCollapsed="Show Header"
              labelExpanded="Collapse Header"
              noun="header"
              className="h-[34px] py-0"
            />
          </div>
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
          fillViewport={workspace.collapsed}
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
  const boardSummary = kpiSummaryFromTotals(boardTotals);
  const agentCount = rankedRows.length;
  const boardDrilldowns: KpiCardDrilldowns = {
    onTotalLeads: () => router.push(`/leads/list${storeFilter.length > 0 ? `?stores=${storeFilter.join(",")}` : ""}`),
  };
  return (
    <div className="space-y-5">
      {/* Collapsible control area (page header + KPI cards). Stays MOUNTED —
          only its height animates — so collapsing never resets filter state. */}
      <AnimatePresence initial={false}>
        {!workspace.collapsed && (
          <motion.div
            key="perf-header-all"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-5">
              <PageHeader
                eyebrow="Lead Management"
                title={canAll ? "Agent Performance — All Agents" : "Sales Leaderboard"}
                subtitle={canAll
                  ? `Sales performance across your authorized stores — derived from real records${agentCount > 0 ? ` (${agentCount} ${agentCount === 1 ? "agent" : "agents"})` : ""}.`
                  : "How the sales team is performing. Your row is highlighted — derived from real records."}
                actions={tabToggle}
              />

              {/* Four consolidated KPI cards — aggregated across all eligible agents */}
              <KpiSummaryRow summary={boardSummary} drilldowns={boardDrilldowns} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Owner filters + the ONE Collapse control. A Sales Agent gets a
          read-only leaderboard (no filters) but still gets the Collapse
          control so they can maximize the table too. */}
      {canAll ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {dateControl}
            <div className="flex flex-wrap items-center gap-2">
              {filterControls}
              <WorkspaceCollapseBar
              collapsed={workspace.collapsed}
              onToggle={workspace.toggle}
              labelCollapsed="Show Header"
              labelExpanded="Collapse Header"
              noun="header"
              className="h-[34px] py-0"
            />
            </div>
          </div>
          {chipsRow}
          {filterPanel}
        </div>
      ) : (
        <div className="flex justify-end">
          <WorkspaceCollapseBar
            collapsed={workspace.collapsed}
            onToggle={workspace.toggle}
            labelCollapsed="Show Header"
            labelExpanded="Collapse Header"
            noun="header"
            className="h-[34px] py-0"
          />
        </div>
      )}

      <PerformanceTable
        rows={rankedRows}
        rowKind="agent"
        firstColLabel="Agent Name"
        fillViewport={workspace.collapsed}
        showReport={canCrossAgent}
        // Owner "View Details" → open that agent's Individual view in-place,
        // preserving the current period/store/filter context (no navigation,
        // no impersonation — just a scope switch). Gated on canCrossAgent so an
        // individual Sales Agent on the leaderboard can NEVER drill into another
        // agent's data (even with a coarse performanceAll key) — they get a
        // read-only ranked table with their own row highlighted only.
        onReport={canCrossAgent ? (r) => { setScopeAgentId(r.agentId); setTab("individual"); setViewAsAgent(r.agentId); } : undefined}
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
