"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance (Lead Management Phase 3).

   TWO tabs, ONE reporting engine (lib/agent-performance.ts):

     • INDIVIDUAL  → the signed-in agent's OWN performance, as a month-by-month
       table (one row per month) with summary totals on top.
     • ALL AGENTS  → the owner leaderboard: one row per eligible Sales Agent,
       ranked with medals.
         - Owner (CAP.lead.performanceAll): filters + a REPORT drill-down.
         - Sales Agent (own only): READ-ONLY visibility — no drill-down, no
           filters, no export (just healthy competitive comparison).

   Everything is DERIVED from real Lead + follow-up + finalized-invoice records.
   No dummy/static values. This is DISTINCT from the operational Lead Dashboard
   (/lead-management), which stays the daily "what do I work on" workspace.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Lock, ChevronDown, Trophy, Users, Route as RouteIcon, IndianRupee, Ticket as TicketIcon, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SegmentedTabs } from "@/components/ui/tabs";
import { RoxFilterPanelHeader, ActiveFilterChip } from "@/components/ui/rox-filter";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { cn, formatINR } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useStoreContext } from "@/lib/store-context";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { allow, CAP } from "@/lib/capabilities";
import { agentsForStore } from "@/lib/sales-agents";
import {
  computeOwnerPerformance, sumPerfRows,
  computeAgentMonthlyPerformance, applyPerfFilters,
  RANKING_EXPLANATION, EMPTY_PERF_FILTERS, type PerfFilters, type PerfDateRange,
} from "@/lib/agent-performance";
import { PerformanceTable } from "@/components/leads/performance-table";

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

/* Summary total card (the boxes above the individual table). */
function TotalCard({
  label, value, sub, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2.5 text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AgentPerformancePage() {
  const { can } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  const { stores, isAllShops } = useStoreContext();
  const { salesAgents, leads, followUps } = useLeads();
  const { tickets, invoices } = useStore();

  const canAll = allow(can, CAP.lead.performanceAll);
  const canOwn = allow(can, CAP.lead.performanceOwn);

  const [tab, setTab] = useState<"individual" | "all">("individual");

  /* ── All-Agents filters (owner-only) ── */
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [perf, setPerf] = useState<PerfFilters>(EMPTY_PERF_FILTERS);
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const revenue = useMemo(() => ({ tickets, invoices }), [tickets, invoices]);

  /* Eligible agents in the active store scope (org-wide in All Shops). */
  const eligibleAgents = useMemo(
    () => agentsForStore(salesAgents, isAllShops ? undefined : (stores[0]?.id ?? undefined)),
    [salesAgents, isAllShops, stores],
  );

  /* The signed-in agent's own identity row. */
  const selfAgent = useMemo(
    () => salesAgents.find((a) => a.id === currentUserId)
      ?? { id: currentUserId ?? "", name: currentUserName, roleLabel: "Sales Agent" },
    [salesAgents, currentUserId, currentUserName],
  );

  /* INDIVIDUAL: this agent's month-by-month rows + all-time totals. */
  const myMonths = useMemo(
    () => computeAgentMonthlyPerformance(selfAgent, leads, followUps, revenue),
    [selfAgent, leads, followUps, revenue],
  );
  // Totals are summed from the EXACT month rows shown, so the header cards can
  // never disagree with the table.
  const myTotals = useMemo(() => sumPerfRows(myMonths), [myMonths]);

  /* ALL AGENTS: store + performance-filtered lead set → ranked rows. */
  const boardLeads = useMemo(() => {
    let l = leads;
    if (canAll && storeFilter.length > 0) l = l.filter((x) => matchesStoreSelection(x.branchId, storeFilter));
    return canAll ? applyPerfFilters(l, perf) : l;
  }, [leads, canAll, storeFilter, perf]);

  const rankedRows = useMemo(() => {
    const rows = computeOwnerPerformance({ agents: eligibleAgents, leads: boardLeads, followUps, revenue });
    return canAll && agentFilter ? rows.filter((r) => r.agentId === agentFilter) : rows;
  }, [eligibleAgents, boardLeads, followUps, revenue, canAll, agentFilter]);

  // Sum the EXACT rows the leaderboard renders so the header cards match.
  const boardTotals = useMemo(() => sumPerfRows(rankedRows), [rankedRows]);
  const boardAgentCount = rankedRows.length;

  if (!canAll && !canOwn) return <Restricted />;

  const tabToggle = (
    <SegmentedTabs
      size="sm"
      value={tab}
      onChange={(v) => setTab(v as "individual" | "all")}
      options={[
        { label: "Individual", value: "individual" },
        { label: "All Agents", value: "all" },
      ]}
    />
  );

  /* ══════════════════ INDIVIDUAL TAB — month-by-month table ══════════════════ */
  if (tab === "individual") {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Lead Management"
          title={`${selfAgent.name} — Sales Performance`}
          subtitle="Your month-by-month performance — every value derived from your real records."
          actions={tabToggle}
        />

        {/* Summary totals (the boxes above the table) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <TotalCard label="Leads" value={String(myTotals.leads)} sub={`${myTotals.qualified} qualified`} icon={Users} />
          <TotalCard label="Walk-In" value={String(myTotals.walkIn)} sub={`${myTotals.routeAssigned} assigned`} icon={RouteIcon} />
          <TotalCard label="Pickup / On-Site" value={String(myTotals.pickup + myTotals.onSite)} sub={`${myTotals.pickupCompleted + myTotals.onSiteCompleted} done`} icon={RouteIcon} />
          <TotalCard label="Revenue Won" value={formatINR(myTotals.revenueWon)} sub={`${myTotals.invoiceCount} invoices`} icon={IndianRupee} />
          <TotalCard label="Ticket Won" value={String(myTotals.ticketsWon)} icon={TicketIcon} />
          <TotalCard label="Follow-up" value={String(myTotals.pendingFollowUp)} sub={myTotals.overdueFollowUp > 0 ? `${myTotals.overdueFollowUp} overdue` : "pending"} icon={CalendarClock} />
        </div>

        <PerformanceTable
          rows={myMonths}
          rowKind="period"
          firstColLabel="Month"
          showReport
          reportHref={() => "/leads/list"}
          emptyText="No leads captured yet. Your monthly performance appears as soon as you own real leads."
        />

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 text-[#4361EE]" />
          Revenue Won = finalized (paid) invoices linked via Lead → Ticket → Invoice. Projection = probability-weighted open pipeline.
        </p>
      </div>
    );
  }

  /* ══════════════════ ALL AGENTS TAB — leaderboard ══════════════════ */
  const activeChips: { label?: string; value: string; onClear: () => void }[] = [];
  if (perf.dateRange !== "all") activeChips.push({ label: "Date", value: DATE_OPTIONS.find((d) => d.value === perf.dateRange)?.label ?? perf.dateRange, onClear: () => setPerf((p) => ({ ...p, dateRange: "all" })) });
  if (storeFilter.length > 0) activeChips.push({ label: "Stores", value: `${storeFilter.length} selected`, onClear: () => setStoreFilter([]) });
  if (agentFilter) activeChips.push({ label: "Agent", value: eligibleAgents.find((a) => a.id === agentFilter)?.name ?? agentFilter, onClear: () => setAgentFilter("") });
  if (perf.source) activeChips.push({ label: "Source", value: perf.source, onClear: () => setPerf((p) => ({ ...p, source: "" })) });
  if (perf.status) activeChips.push({ label: "Status", value: perf.status, onClear: () => setPerf((p) => ({ ...p, status: "" })) });
  if (perf.priority) activeChips.push({ label: "Priority", value: perf.priority, onClear: () => setPerf((p) => ({ ...p, priority: "" })) });
  if (perf.route) activeChips.push({ label: "Route", value: perf.route, onClear: () => setPerf((p) => ({ ...p, route: "" })) });

  const sourceOptions = distinct(leads.map((l) => l.source));
  const statusOptions = distinct(leads.map((l) => l.status));
  const priorityOptions = distinct(leads.map((l) => l.priority));
  const reset = () => { setPerf(EMPTY_PERF_FILTERS); setStoreFilter([]); setAgentFilter(""); };

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
        <TotalCard label="Agents" value={String(boardAgentCount)} icon={Users} />
        <TotalCard label="Leads" value={String(boardTotals.leads)} icon={Users} />
        <TotalCard label="Qualified" value={String(boardTotals.qualified)} icon={Users} />
        <TotalCard label="Converted" value={String(boardTotals.converted)} icon={Trophy} />
        <TotalCard label="Revenue Won" value={formatINR(boardTotals.revenueWon)} icon={IndianRupee} />
        <TotalCard label="Conversion" value={pct(boardTotals.conversionRate)} icon={Trophy} />
      </div>

      {/* Owner-only filters (a Sales Agent gets a read-only leaderboard). */}
      {canAll && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <SegmentedTabs
                size="sm"
                options={DATE_OPTIONS}
                value={perf.dateRange}
                onChange={(v) => setPerf((p) => ({ ...p, dateRange: v as PerfDateRange }))}
              />
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <StoreMultiSelect value={storeFilter} onChange={setStoreFilter} />
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
          </div>

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeChips.map((c, i) => (
                <ActiveFilterChip key={i} label={c.label} value={c.value} onClear={c.onClear} />
              ))}
              <button onClick={reset} className="text-[12px] font-medium text-[#4361EE] hover:underline">Clear all</button>
            </div>
          )}

          {showFilters && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <RoxFilterPanelHeader title="Filter agents" onClose={() => setShowFilters(false)} onReset={reset} showReset={activeChips.length > 0} />
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField label="Agent" value={agentFilter} onChange={setAgentFilter}
                  options={eligibleAgents.map((a) => ({ label: a.name, value: a.id }))} allLabel="All agents" />
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
          )}
        </div>
      )}

      <PerformanceTable
        rows={rankedRows}
        rowKind="agent"
        firstColLabel="Agent Name"
        showReport={canAll}
        reportHref={(r) => `/leads/performance/${encodeURIComponent(r.agentId)}`}
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
