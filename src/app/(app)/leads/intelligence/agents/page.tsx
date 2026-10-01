"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarClock, IndianRupee, Trophy, UserRoundCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { NoPermission } from "@/components/common/no-permission";
import { Avatar } from "@/components/ui/avatar";
import { ActiveFilterChip } from "@/components/ui/rox-filter";
import { IntelligenceFilters } from "@/components/leads/intelligence/intelligence-filters";
import { usePermissions } from "@/lib/permissions-context";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { useCatalog } from "@/lib/catalog-context";
import { allow, CAP } from "@/lib/capabilities";
import { calculateLeadIntelligence, type LeadIntelligenceFilters } from "@/lib/lead-intelligence";
import { buildAgentIntelligenceHref, parseIntelligenceFilters } from "@/lib/lead-intelligence-url";
import { medalFor } from "@/lib/agent-performance";
import { formatINR } from "@/lib/utils";

export default function AgentIntelligencePage() {
  const params = useSearchParams();
  const { can } = usePermissions();
  const { salesAgents, salesAgentsReady, leads, followUps, hydrated, loadErrors } = useLeads();
  const store = useStore();
  const storeContext = useStoreContext();
  const catalog = useCatalog();
  const initial = useMemo(() => parseIntelligenceFilters(params), [params]);
  const [filters, setFilters] = useState<LeadIntelligenceFilters>(initial);
  const effectiveFilters = useMemo<LeadIntelligenceFilters>(
    () => storeContext.activeStoreId ? { ...filters, storeIds: [storeContext.activeStoreId] } : filters,
    [filters, storeContext.activeStoreId],
  );
  const [agentFilter, setAgentFilter] = useState("");
  const canAll = allow(can, CAP.lead.performanceAll);

  const labels = useMemo(() => ({
    stores: Object.fromEntries(storeContext.stores.map((s) => [s.id, s.name])),
    deviceCategories: Object.fromEntries(catalog.categories.map((c) => [c.id, c.name])),
    deviceBrands: Object.fromEntries(catalog.brands.map((b) => [b.id, b.name])),
  }), [storeContext.stores, catalog.categories, catalog.brands]);

  const eligibleAgents = useMemo(() => salesAgents.filter((agent) =>
    effectiveFilters.storeIds.length === 0 || agent.anyStore || effectiveFilters.storeIds.some((id) => agent.storeIds.includes(id)),
  ), [salesAgents, effectiveFilters.storeIds]);

  const rows = useMemo(() => eligibleAgents.map((agent) => ({
    agent,
    intelligence: calculateLeadIntelligence({
      leads, followUps, revenue: { tickets: store.tickets, invoices: store.invoices }, filters: effectiveFilters,
      agentUserId: agent.id, followUpUserId: agent.id, labels,
    }),
  })).sort((a, b) =>
    b.intelligence.summary.revenueWon - a.intelligence.summary.revenueWon
    || b.intelligence.summary.converted - a.intelligence.summary.converted
    || b.intelligence.summary.conversionRate - a.intelligence.summary.conversionRate
    || b.intelligence.summary.qualified - a.intelligence.summary.qualified
    || b.intelligence.summary.totalLeads - a.intelligence.summary.totalLeads
    || a.agent.name.localeCompare(b.agent.name, undefined, { sensitivity: "base" }),
  ), [eligibleAgents, leads, followUps, store.tickets, store.invoices, effectiveFilters, labels]);

  const visibleRows = agentFilter ? rows.filter((row) => row.agent.id === agentFilter) : rows;
  const totals = useMemo(() => visibleRows.reduce((total, row) => ({
    agents: total.agents + 1,
    leads: total.leads + row.intelligence.summary.totalLeads,
    qualified: total.qualified + row.intelligence.summary.qualified,
    converted: total.converted + row.intelligence.summary.converted,
    revenue: total.revenue + row.intelligence.summary.revenueWon,
    pipeline: total.pipeline + row.intelligence.summary.pipelineValue,
    pending: total.pending + row.intelligence.summary.pendingFollowUps,
    overdue: total.overdue + row.intelligence.summary.overdueFollowUps,
  }), { agents: 0, leads: 0, qualified: 0, converted: 0, revenue: 0, pipeline: 0, pending: 0, overdue: 0 }), [visibleRows]);

  if (!canAll) return <NoPermission title="Agent Intelligence is restricted" subtitle="Cross-agent analysis requires the all-agent performance permission. Store scope is enforced separately." />;
  if (!hydrated || !salesAgentsReady || !store.hydrated || !catalog.hydrated) return <div className="space-y-5"><PageHeader eyebrow="Lead Management" title="Agent Intelligence" /><div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{[1, 2, 3].map((n) => <div key={n} className="h-64 animate-pulse rounded-2xl border border-border bg-muted/25" />)}</div></div>;
  const criticalErrors = [...loadErrors, ...(store.loadErrors ?? [])];
  if (criticalErrors.length) return <div className="space-y-5"><PageHeader eyebrow="Agent Intelligence" title="Analysis temporarily unavailable" /><div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-8 text-center text-[13px] text-muted-foreground">RepairOX will not present missing {criticalErrors.join(", ")} data as zero. Restore the data connection and refresh.</div></div>;

  const conversion = totals.leads ? totals.converted / totals.leads : 0;
  return (
    <div className="space-y-5 pb-8">
      <PageHeader eyebrow="Lead Management" title="Agent Intelligence" subtitle="Compare authorized Sales Agents, then open the same evidence-based analysis without changing your session identity." />

      <IntelligenceFilters filters={effectiveFilters} onChange={setFilters} leads={leads} categories={catalog.categories} brands={catalog.brands} lockedStoreName={storeContext.activeStoreId ? storeContext.getStore(storeContext.activeStoreId)?.name || "Current store" : undefined} />

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="space-y-1 sm:w-72">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Agent</span>
          <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} className="h-[36px] w-full rounded-xl border border-input bg-card px-2.5 text-[13px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15">
            <option value="">All authorized Sales Agents</option>
            {rows.map((row) => <option key={row.agent.id} value={row.agent.id}>{row.agent.name}</option>)}
          </select>
        </label>
        {agentFilter && <ActiveFilterChip label="Agent" value={rows.find((row) => row.agent.id === agentFilter)?.agent.name || agentFilter} onClear={() => setAgentFilter("")} />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Summary label="Agents" value={String(totals.agents)} icon={Users} />
        <Summary label="Leads" value={String(totals.leads)} icon={Users} />
        <Summary label="Qualified" value={String(totals.qualified)} icon={UserRoundCheck} />
        <Summary label="Converted" value={String(totals.converted)} icon={Trophy} />
        <Summary label="Conversion" value={`${Math.round(conversion * 100)}%`} icon={Trophy} />
        <Summary label="Revenue Won" value={formatINR(totals.revenue)} icon={IndianRupee} />
        <Summary label="Pipeline" value={formatINR(totals.pipeline)} icon={IndianRupee} />
        <Summary label="Overdue" value={String(totals.overdue)} icon={CalendarClock} attention={totals.overdue > 0} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Sales Agents</h2><p className="text-[11px] text-muted-foreground">Ranked by actual Revenue Won; ties use converted count, conversion rate, qualified count, then lead volume.</p></div>
      </div>

      {visibleRows.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleRows.map((row) => {
            const rank = rows.findIndex((item) => item.agent.id === row.agent.id) + 1;
            const s = row.intelligence.summary;
            const topSource = row.intelligence.segments.source.filter((segment) => segment.sufficient).sort((a, b) => b.conversionRate - a.conversionRate)[0];
            return (
              <article key={row.agent.id} className="rounded-2xl border border-border bg-card p-5 shadow-card transition hover:border-[#B3BFF6] hover:shadow-card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3"><Avatar name={row.agent.name} src={row.agent.avatarUrl} size={42} /><div className="min-w-0"><h3 className="truncate text-[15px] font-bold">{row.agent.name}</h3><p className="text-[11px] text-muted-foreground">{row.agent.roleLabel}</p></div></div>
                  <span className="text-xl" aria-label={`Rank ${rank}`}>{medalFor(rank) || <span className="grid h-7 w-7 place-items-center rounded-lg bg-muted text-[11px] font-bold text-muted-foreground">{rank}</span>}</span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 border-y border-border py-3">
                  <AgentMetric label="Leads" value={s.totalLeads} />
                  <AgentMetric label="Qualified" value={s.qualified} />
                  <AgentMetric label="Converted" value={s.converted} />
                  <AgentMetric label="Conversion" value={`${Math.round(s.conversionRate * 100)}%`} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenue Won</p><p className="mt-0.5 text-lg font-extrabold tabular-nums">{formatINR(s.revenueWon)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pipeline Value</p><p className="mt-0.5 text-lg font-extrabold tabular-nums">{formatINR(s.pipelineValue)}</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  <span>{s.pendingFollowUps} pending · <span className={s.overdueFollowUps ? "font-semibold text-rose-600" : ""}>{s.overdueFollowUps} overdue</span></span>
                  <span>{topSource ? `Top observed: ${topSource.label}` : `Need ${row.intelligence.minSample}+ / source`}</span>
                </div>
                <Link href={buildAgentIntelligenceHref(row.agent.id, effectiveFilters)} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#B3BFF6] bg-[#EEF1FD]/55 px-3 py-2 text-[12px] font-semibold text-[#3A4DBB] transition hover:bg-[#EEF1FD]">View Analysis <ArrowRight className="h-3.5 w-3.5" /></Link>
              </article>
            );
          })}
        </div>
      ) : <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-[13px] text-muted-foreground">No authorized Sales Agents match the selected filters.</div>}

      <p className="text-[10.5px] text-muted-foreground">Opening an agent changes only the analytics subject in the URL. Your account, role, permissions, and session remain unchanged.</p>
    </div>
  );
}

function Summary({ label, value, icon: Icon, attention = false }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; attention?: boolean }) {
  return <div className="rounded-xl border border-border/70 bg-card/90 p-3 shadow-card"><span className={`grid h-7 w-7 place-items-center rounded-lg ${attention ? "bg-red-50 text-rose-600" : "bg-[#EEF1FD] text-[#4361EE]"}`}><Icon className="h-3.5 w-3.5" /></span><p className="mt-2 text-xl font-extrabold tabular-nums">{value}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}
function AgentMetric({ label, value }: { label: string; value: string | number }) { return <div className="text-center"><p className="text-sm font-bold tabular-nums">{value}</p><p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p></div>; }
