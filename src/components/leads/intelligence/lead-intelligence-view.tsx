"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarClock,
  Clock3, Compass, IndianRupee, Info, Layers3, Lightbulb, Lock,
  MapPin, Package, Target, Timer, TrendingDown, TrendingUp, UserRoundCheck,
  Users, Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { IntelligenceFilters } from "@/components/leads/intelligence/intelligence-filters";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { useCatalog } from "@/lib/catalog-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { cn, formatINR } from "@/lib/utils";
import {
  calculateLeadIntelligence,
  EMPTY_INTELLIGENCE_FILTERS,
  type EvidenceInsight,
  type IntelligenceDimension,
  type IntelligenceScopeMode,
  type LeadIntelligenceFilters,
  type LeadIntelligenceResult,
  type SegmentPerformance,
} from "@/lib/lead-intelligence";
import { calculateLeadSalesMix, type LeadSalesMixResult, type SalesMixRow } from "@/lib/lead-sales-mix";
import { buildLeadEvidenceHref } from "@/lib/lead-intelligence-url";
import type { SalesAgent } from "@/lib/sales-agents";

/* Dimensions available in the Segment Explorer, in presentation order. Only
   dimensions that actually carry data in the cohort are offered. */
const DIMENSION_META: { key: IntelligenceDimension; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "source", label: "Lead Source", icon: Compass },
  { key: "region", label: "Region", icon: MapPin },
  { key: "deviceCategory", label: "Device Category", icon: Package },
  { key: "route", label: "Sales / Fulfilment Mode", icon: ArrowRight },
  { key: "priority", label: "Lead Type", icon: TrendingUp },
  { key: "leadCategory", label: "Qualification", icon: UserRoundCheck },
  { key: "subCategory", label: "Repair Category", icon: Wrench },
  { key: "deviceBrand", label: "Device Brand", icon: Package },
  { key: "modeOfLead", label: "Mode of Lead", icon: Compass },
  { key: "store", label: "Store", icon: Layers3 },
];
const DIMENSION_TITLE: Record<string, string> = Object.fromEntries(DIMENSION_META.map((d) => [d.key, d.label]));
type SegmentSort = "conversion" | "revenue" | "volume" | "qualification";

export function LeadIntelligenceView({
  agent,
  initialFilters = EMPTY_INTELLIGENCE_FILTERS,
  ownerContext = false,
  backHref,
  scope = "assigned",
}: {
  agent: Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">;
  initialFilters?: LeadIntelligenceFilters;
  ownerContext?: boolean;
  backHref?: string;
  /** "permitted" = My Lead Intelligence (owned/created/follow-up); "assigned" =
   *  owner analysing a specific agent (owned only). */
  scope?: IntelligenceScopeMode;
}) {
  const { leads, followUps, hydrated, loadErrors } = useLeads();
  const store = useStore();
  const { stores, activeStoreId } = useStoreContext();
  const catalog = useCatalog();
  const { can } = usePermissions();
  const canViewAgents = !ownerContext && allow(can, CAP.lead.performanceAll);
  const [filters, setFilters] = useState<LeadIntelligenceFilters>(initialFilters);
  // Force the Lead cohort onto the loaded store scope so counts and finalized
  // revenue can never describe different scopes.
  const effectiveFilters = useMemo<LeadIntelligenceFilters>(
    () => activeStoreId ? { ...filters, storeIds: [activeStoreId] } : filters,
    [filters, activeStoreId],
  );

  const labels = useMemo(() => ({
    stores: Object.fromEntries(stores.map((s) => [s.id, s.name])),
    deviceCategories: Object.fromEntries(catalog.categories.map((c) => [c.id, c.name])),
    deviceBrands: Object.fromEntries(catalog.brands.map((b) => [b.id, b.name])),
  }), [stores, catalog.categories, catalog.brands]);

  const result = useMemo(() => calculateLeadIntelligence({
    leads,
    followUps,
    revenue: { tickets: store.tickets, invoices: store.invoices },
    filters: effectiveFilters,
    agentUserId: agent.id,
    followUpUserId: agent.id,
    scope,
    labels,
  }), [leads, followUps, store.tickets, store.invoices, effectiveFilters, agent.id, scope, labels]);

  const salesMix = useMemo(() => calculateLeadSalesMix({
    cohort: result.cohort,
    tickets: store.tickets,
    invoices: store.invoices,
    inventory: store.inventory,
    refunds: store.invoiceRefunds,
    refundAllocations: store.invoiceRefundAllocations,
  }), [result.cohort, store.tickets, store.invoices, store.inventory, store.invoiceRefunds, store.invoiceRefundAllocations]);

  if (!hydrated || !store.hydrated || !catalog.hydrated) return <IntelligenceSkeleton name={agent.name} />;
  const criticalErrors = [...loadErrors, ...(store.loadErrors ?? [])];
  if (criticalErrors.length) return <DataUnavailable sources={criticalErrors} />;

  const evidenceHref = (ids: string[]) => buildLeadEvidenceHref(ids, effectiveFilters, result.period, agent.id);
  const previous = result.trend.previous;

  return (
    <div className="space-y-5 pb-10">
      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6D28D9] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Team Lead Intelligence
        </Link>
      )}
      {ownerContext && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12px] text-amber-800">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">Read-only analysis.</span> You&apos;re analysing {agent.name}&apos;s leads — your
            session identity is unchanged and nothing here can be edited.
          </span>
        </div>
      )}

      <PageHeader
        eyebrow={ownerContext ? "Team Lead Intelligence" : "Personal Sales Intelligence"}
        title={ownerContext ? `${agent.name} — Lead Intelligence` : "My Lead Intelligence"}
        subtitle="Discover which leads convert, what drives your sales, and where to improve."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-card px-3 py-2">
            <Avatar name={agent.name} src={agent.avatarUrl} size={30} />
            <div className="min-w-0">
              <p className="max-w-[170px] truncate text-[12px] font-semibold text-foreground">{agent.name}</p>
              <p className="text-[10px] text-muted-foreground">{agent.roleLabel || "Sales Agent"}</p>
            </div>
          </div>
        }
      />

      <IntelligenceFilters filters={effectiveFilters} onChange={setFilters} leads={result.scopeLeads} categories={catalog.categories} brands={catalog.brands} lockedStoreName={activeStoreId ? stores.find((s) => s.id === activeStoreId)?.name || "Current store" : undefined} />

      <CohortContext
        result={result}
        storeLabel={activeStoreId ? (stores.find((s) => s.id === activeStoreId)?.name || "Current store") : (effectiveFilters.storeIds.length ? `${effectiveFilters.storeIds.length} store(s)` : "All authorized stores")}
        scopeLabel={ownerContext ? `${agent.name} (owned leads)` : "My permitted leads"}
      />

      {result.cohort.length === 0 ? (
        <EmptyIntelligence
          result={result}
          scope={scope}
          onReset={() => setFilters({ ...EMPTY_INTELLIGENCE_FILTERS, storeIds: activeStoreId ? [activeStoreId] : [] })}
          filters={effectiveFilters}
          canViewAgents={canViewAgents}
        />
      ) : (
        <>
          <SummaryGrid result={result} previous={previous} salesMix={salesMix} evidenceHref={evidenceHref} />
          <ConversionSignature result={result} evidenceHref={evidenceHref} />
          <SegmentExplorer result={result} evidenceHref={evidenceHref} />
          <SalesMixSection result={salesMix} evidenceHref={evidenceHref} cohortIds={result.summaryEvidence.revenueWon} />
          <ConversionHealth result={result} evidenceHref={evidenceHref} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <PatternCard result={result} evidenceHref={evidenceHref} />
            <StallCard result={result} evidenceHref={evidenceHref} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <FollowUpCard result={result} evidenceHref={evidenceHref} />
            <PipelineHealthCard result={result} evidenceHref={evidenceHref} />
          </div>

          <SalesCycleCard result={result} evidenceHref={evidenceHref} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <LossCard result={result} evidenceHref={evidenceHref} />
            <ValueCard result={result} evidenceHref={evidenceHref} />
          </div>

          <WeakPatternsCard result={result} evidenceHref={evidenceHref} />
          <FocusCard result={result} evidenceHref={evidenceHref} />
          <DataQualityCard result={result} salesMix={salesMix} />
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Cohort context ─────────────────────────── */

function CohortContext({ result, storeLabel, scopeLabel }: { result: LeadIntelligenceResult; storeLabel: string; scopeLabel: string }) {
  const items = [
    { label: "Reporting period", value: result.period.label },
    { label: "Store scope", value: storeLabel },
    { label: "Analytical subject", value: scopeLabel },
    { label: "Leads in cohort", value: String(result.cohort.length) },
  ];
  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-[#F5F3FF] via-[#EEF1FD]/60 to-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6D28D9]/80">{item.label}</p>
            <p className="mt-0.5 truncate text-[14px] font-bold text-foreground" title={item.value}>{item.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-indigo-100 pt-2.5 text-[11px] text-[#5B21B6]">
        <span className="inline-flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />Lead-created cohort: leads created in {result.period.label.toLowerCase()}; outcomes and finalized revenue observed through {new Date(result.asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Not period-specific conversions.</span>
        <span className="font-semibold">Insight threshold: {result.minSample}+ leads per segment</span>
      </div>
    </section>
  );
}

/* ───────────────────────── Summary grid ───────────────────────────── */

function SummaryGrid({ result, previous, salesMix, evidenceHref }: { result: LeadIntelligenceResult; previous: LeadIntelligenceResult["summary"] | null; salesMix: LeadSalesMixResult; evidenceHref: (ids: string[]) => string }) {
  const s = result.summary;
  const notConverted = Math.max(0, s.totalLeads - s.converted);
  const delta = (cur?: number, prev?: number) => (prev != null && cur != null && prev !== 0 ? (cur - prev) / Math.abs(prev) : null);
  const conversionTiming = result.timing.find((t) => t.key === "conversion");
  const conversionMedian = conversionTiming?.sufficient ? conversionTiming.medianHours : null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1 — Lead Performance */}
      <KpiCard
        label="Lead Performance" icon={Users} accent="blue"
        primaryValue={String(s.totalLeads)} primaryDescription="Total Leads"
        trend={delta(s.totalLeads, previous?.totalLeads)}
        progress={s.totalLeads ? s.qualified / s.totalLeads : 0}
        href={evidenceHref(result.summaryEvidence.total)}
        title="Total Leads = distinct leads in this cohort. Qualified = leads meeting the canonical qualification rule."
        support={[
          { label: "Qualified", value: String(s.qualified), href: evidenceHref(result.summaryEvidence.qualified) },
          { label: "Qualification Rate", value: s.totalLeads ? pct(s.qualified / s.totalLeads) : "—" },
        ]}
      />
      {/* 2 — Conversion Performance */}
      <KpiCard
        label="Conversion Performance" icon={Target} accent="indigo"
        primaryValue={String(s.converted)} primaryDescription="Converted Leads"
        trend={delta(s.converted, previous?.converted)}
        progress={s.conversionRate}
        href={evidenceHref(result.summaryEvidence.converted)}
        title="Converted = distinct leads that reached the canonical won/converted outcome. Conversion Rate = converted ÷ total leads."
        support={[
          { label: "Conversion Rate", value: s.totalLeads ? pct(s.conversionRate) : "—" },
          { label: "Not Converted", value: String(notConverted) },
        ]}
      />
      {/* 3 — Sales Mix: what was actually sold and what it's worth */}
      <KpiCard
        label="Sales Mix" icon={IndianRupee} accent="emerald"
        primaryValue={formatINR(salesMix.netRevenue)} primaryDescription="Net Revenue Won"
        trend={delta(salesMix.netRevenue, previous?.revenueWon)}
        href={evidenceHref(result.summaryEvidence.revenueWon)}
        title={`Net Revenue = finalized (paid, non-proforma) invoices minus completed refunds. Gross ${formatINR(salesMix.grossRevenue)}.`}
        support={[
          { label: "Avg / Invoice", value: salesMix.finalizedInvoices ? formatINR(Math.round(salesMix.averageInvoiceValue)) : "—" },
          { label: "Units Sold", value: salesMix.totalUnits ? `${salesMix.totalUnits} (${salesMix.productUnits}P · ${salesMix.serviceUnits}S)` : "—" },
        ]}
      />
      {/* 4 — Velocity & Pipeline: how fast leads convert and what's still open.
          This is the intelligence-specific velocity/value signature — NOT the
          operational follow-up load (that lives on the dashboard). */}
      <KpiCard
        label="Velocity & Pipeline" icon={Timer} accent="amber"
        primaryValue={conversionMedian != null ? formatHours(conversionMedian) : "—"}
        primaryDescription="Median Lead → conversion"
        href={evidenceHref(conversionTiming?.evidenceIds ?? result.summaryEvidence.converted)}
        title="Median time from lead creation to the canonical conversion, over leads with reliable timestamps. Pipeline = expected value of open leads."
        support={[
          { label: "Open Pipeline", value: formatINR(s.pipelineValue), href: evidenceHref(result.summaryEvidence.pipelineValue) },
          { label: "Avg Lead Value", value: s.totalLeads ? formatINR(Math.round(s.averageLeadValue)) : "—" },
        ]}
      />
    </div>
  );
}

/* Consolidated KPI card — mirrors the Agent Performance KpiPerformanceCard
   (semantic accent strip + chip, prominent primary metric, two supporting
   metrics, a thin progress indicator) but adds evidence drill-through. */
type KpiAccent = "blue" | "indigo" | "emerald" | "amber";
const KPI_ACCENT: Record<KpiAccent, { bar: string; chip: string; value: string; fill: string; glow: string; wash: string }> = {
  blue: { bar: "bg-[#4361EE]", chip: "bg-[#EEF1FD] text-[#4361EE]", value: "text-[#2A3BA3]", fill: "bg-[#4361EE]", glow: "hover:shadow-[0_10px_30px_-14px_rgba(67,97,238,0.4)] hover:border-[#4361EE]/50", wash: "from-[#4361EE]/[0.07]" },
  indigo: { bar: "bg-[#6D28D9]", chip: "bg-[#EDE9FE] text-[#6D28D9]", value: "text-[#5B21B6]", fill: "bg-[#6D28D9]", glow: "hover:shadow-[0_10px_30px_-14px_rgba(109,40,217,0.4)] hover:border-[#6D28D9]/50", wash: "from-[#6D28D9]/[0.07]" },
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600", value: "text-emerald-700", fill: "bg-emerald-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(16,185,129,0.4)] hover:border-emerald-400/60", wash: "from-emerald-500/[0.07]" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-600", value: "text-amber-700", fill: "bg-amber-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(245,158,11,0.4)] hover:border-amber-400/60", wash: "from-amber-500/[0.07]" },
};
interface KpiSupport { label: string; value: string; href?: string; alert?: boolean }
function KpiCard({ label, icon: Icon, accent, primaryValue, primaryDescription, support, progress, progressAlert, trend, title, href }: {
  label: string; icon: React.ComponentType<{ className?: string }>; accent: KpiAccent;
  primaryValue: string; primaryDescription: string; support: [KpiSupport, KpiSupport];
  progress?: number; progressAlert?: boolean; trend?: number | null; title?: string; href: string;
}) {
  const a = KPI_ACCENT[accent];
  const showProgress = typeof progress === "number";
  const clamped = showProgress ? Math.max(0, Math.min(1, progress!)) : 0;
  return (
    <Link href={href} title={title} className={cn("group relative flex min-h-[140px] flex-col overflow-hidden rounded-2xl border-2 border-zinc-300 bg-card p-4 pl-5 shadow-card transition duration-200 hover:-translate-y-0.5", a.glow)}>
      <span className={cn("absolute inset-y-0 left-0 w-1", a.bar)} aria-hidden />
      {/* Soft tone-tinted top wash — the colour-shade matching the Lead Dashboard KPI cards. */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent", a.wash)} />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", a.chip)}><Icon className="h-3.5 w-3.5" /></span>
          <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        </div>
        {trend != null && Math.abs(trend) >= 0.01 && <span className={cn("shrink-0 text-[10px] font-semibold tabular-nums", trend > 0 ? "text-emerald-600" : "text-rose-600")}>{trend > 0 ? "+" : ""}{Math.round(trend * 100)}%</span>}
      </div>
      <p className={cn("relative mt-2.5 font-display text-[26px] font-extrabold leading-none tracking-tight tabular-nums", a.value)}>{primaryValue}</p>
      <p className="relative mt-1 text-[11px] font-medium text-muted-foreground">{primaryDescription}</p>
      <div className="relative mt-auto space-y-1.5 pt-3">
        {showProgress && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden><div className={cn("h-full rounded-full transition-all duration-500", progressAlert ? "bg-[#D96A82]" : a.fill)} style={{ width: `${clamped > 0 ? Math.max(clamped * 100, 2) : 0}%` }} /></div>
        )}
        <div className="space-y-1">
          {support.map((sup) => (
            <div key={sup.label} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-muted-foreground">{sup.label}</span>
              <span className={cn("shrink-0 font-bold tabular-nums", sup.alert ? "text-[#B42318]" : "text-foreground")}>{sup.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}

/* ───────────────────── Conversion signature ───────────────────────── */

function ConversionSignature({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  // Pick the single most informative supported dimension (most sufficient
  // segments, then widest conversion spread) so the headline is evidence-led.
  const best = useMemo(() => {
    let chosen: { dimension: IntelligenceDimension; rows: SegmentPerformance[] } | null = null;
    let bestScore = -1;
    for (const meta of DIMENSION_META) {
      const rows = (result.segments[meta.key] || []).filter((r) => r.sufficient);
      if (rows.length < 2) continue;
      const spread = Math.max(...rows.map((r) => r.conversionRate)) - Math.min(...rows.map((r) => r.conversionRate));
      const score = rows.length + spread;
      if (score > bestScore) { bestScore = score; chosen = { dimension: meta.key, rows }; }
    }
    return chosen;
  }, [result.segments]);

  return (
    <Card accent="violet">
      <SectionHeading icon={TrendingUp} title="Your conversion signature" subtitle="The dimension that most separates what you convert from what you don't. Compared with your overall cohort rate." accent="violet" />
      {best ? (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#6D28D9]">{DIMENSION_TITLE[best.dimension]} · baseline {pct(result.summary.conversionRate)} overall</p>
          <div className="mt-3 space-y-2.5">
            {best.rows.sort((a, b) => b.conversionRate - a.conversionRate).slice(0, 6).map((row) => (
              <SignatureBar key={row.key} row={row} overall={result.summary.conversionRate} href={evidenceHref(row.evidenceIds)} />
            ))}
          </div>
        </>
      ) : <div className="mt-3"><Insufficient text={`Need at least two segments with ${result.minSample}+ leads each before a conversion signature can be shown. Keep working the cohort.`} /></div>}
    </Card>
  );
}

function SignatureBar({ row, overall, href }: { row: SegmentPerformance; overall: number; href: string }) {
  const max = Math.max(overall, row.conversionRate, 0.01);
  const lift = row.conversionRate - overall;
  return (
    <Link href={href} className="block rounded-xl border border-zinc-300 px-3 py-2.5 transition hover:border-[#C4B5FD] hover:bg-[#F5F3FF]/60" title={`${row.converted} converted / ${row.leads} leads`}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[13px] font-semibold text-foreground">{row.label}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-[#6D28D9]">{pct(row.conversionRate)}</span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-to-r from-[#6D28D9] to-[#4361EE]" style={{ width: `${Math.max(4, (row.conversionRate / max) * 100)}%` }} />
        <div className="absolute inset-y-0 w-px bg-zinc-500/70" style={{ left: `${(overall / max) * 100}%` }} title={`Overall ${pct(overall)}`} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
        <span>{row.leads} leads · {row.converted} converted · {formatINR(row.revenueWon)}</span>
        <span className={cn("font-semibold", lift >= 0 ? "text-emerald-600" : "text-rose-600")}>{lift >= 0 ? "+" : ""}{Math.round(lift * 100)} pts</span>
      </div>
    </Link>
  );
}

/* ───────────────────── Segment explorer ───────────────────────────── */

function SegmentExplorer({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const available = useMemo(
    () => DIMENSION_META.filter((meta) => (result.segments[meta.key] || []).some((r) => r.leads > 0)),
    [result.segments],
  );
  const [dimension, setDimension] = useState<IntelligenceDimension>(available[0]?.key ?? "source");
  const [sort, setSort] = useState<SegmentSort>("conversion");
  const activeDimension = available.some((a) => a.key === dimension) ? dimension : (available[0]?.key ?? "source");

  const rows = useMemo(() => {
    const list = [...(result.segments[activeDimension] || [])];
    const cmp: Record<SegmentSort, (a: SegmentPerformance, b: SegmentPerformance) => number> = {
      conversion: (a, b) => b.conversionRate - a.conversionRate || b.leads - a.leads,
      revenue: (a, b) => b.revenueWon - a.revenueWon || b.leads - a.leads,
      volume: (a, b) => b.leads - a.leads || b.conversionRate - a.conversionRate,
      qualification: (a, b) => b.qualificationRate - a.qualificationRate || b.leads - a.leads,
    };
    return list.sort(cmp[sort]);
  }, [result.segments, activeDimension, sort]);

  const maxConversion = Math.max(0.01, ...rows.map((r) => r.conversionRate));
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenueWon));

  if (!available.length) return null;
  return (
    <Card accent="violet">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SectionHeading icon={Compass} title="Segment explorer" subtitle="Switch the dimension, sort by what matters, and drill into the exact leads behind any segment." accent="violet" />
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" value={sort} onChange={(v) => setSort(v as SegmentSort)} options={[
            { label: "Conversion", value: "conversion" },
            { label: "Revenue", value: "revenue" },
            { label: "Volume", value: "volume" },
            { label: "Qualification", value: "qualification" },
          ]} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {available.map((meta) => (
          <button
            key={meta.key}
            type="button"
            onClick={() => setDimension(meta.key)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
              activeDimension === meta.key ? "border-[#6D28D9] bg-[#6D28D9] text-white" : "border-zinc-300 bg-card text-muted-foreground hover:border-[#C4B5FD] hover:text-foreground")}
          >
            <meta.icon className="h-3.5 w-3.5" /> {meta.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-300">
        <table className="w-full table-fixed text-[13px]">
          <colgroup><col style={{ width: "28%" }} /><col style={{ width: "32%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /></colgroup>
          <thead className="bg-[#F5F3FF]"><tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[#6D28D9]">
            <th className="px-3 py-2.5">Segment</th><th className="px-3 py-2.5">Conversion</th><th className="px-3 py-2.5 text-right">Leads</th><th className="px-3 py-2.5 text-right">Won</th><th className="px-3 py-2.5 text-right">Revenue</th>
          </tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-zinc-300 transition hover:bg-[#F5F3FF]/50">
                <td className="px-3 py-2.5">
                  <Link href={evidenceHref(row.evidenceIds)} className="block truncate font-semibold text-foreground hover:text-[#6D28D9] hover:underline" title={row.label}>{row.label || "—"}</Link>
                  {!row.sufficient && <span className="text-[10px] font-medium text-amber-600">Early signal · {row.leads} lead{row.leads === 1 ? "" : "s"}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", row.sufficient ? "bg-[#6D28D9]" : "bg-zinc-300")} style={{ width: `${(row.conversionRate / maxConversion) * 100}%` }} /></div>
                    <span className="w-9 shrink-0 text-right text-[12px] font-bold tabular-nums text-foreground">{pct(row.conversionRate)}</span>
                  </div>
                  {sort === "revenue" && <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${(row.revenueWon / maxRevenue) * 100}%` }} /></div>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{row.leads}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{row.converted}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">{formatINR(row.revenueWon)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-[12px] text-muted-foreground">No {DIMENSION_TITLE[activeDimension]?.toLowerCase()} values recorded in this cohort.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">Segments below {result.minSample} leads are early signals, never ranked as strengths. Click a segment to open its exact leads.</p>
    </Card>
  );
}

/* ───────────────────── Product & service sales ────────────────────── */

function SalesMixSection({ result, evidenceHref, cohortIds }: { result: LeadSalesMixResult; evidenceHref: (ids: string[]) => string; cohortIds: string[] }) {
  const [tab, setTab] = useState<"products" | "services" | "categories">("products");
  const hasSales = result.finalizedInvoices > 0;
  return (
    <Card accent="emerald">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SectionHeading icon={Package} title="What you actually sold" subtitle="Real finalized invoice line items reachable from your leads — products, services, units and net revenue. Not ticket counts." accent="emerald" />
        {hasSales && (
          <SegmentedTabs size="sm" value={tab} onChange={(v) => setTab(v as typeof tab)} options={[
            { label: "Products", value: "products" }, { label: "Services", value: "services" }, { label: "Categories", value: "categories" },
          ]} />
        )}
      </div>
      {!hasSales ? (
        <div className="mt-4"><Insufficient text="No finalized (paid, non-proforma) invoices are linked to this cohort yet, so there is no product or service sales data. Estimates, proformas and unpaid invoices never count." /></div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MixMetric label="Net Sales" value={formatINR(result.netRevenue)} sub={`${formatINR(result.grossRevenue)} gross`} tone="emerald" />
            <MixMetric label="Product / Service" value={`${formatINR(result.productNetRevenue)} / ${formatINR(result.serviceNetRevenue)}`} sub={`${result.productUnits} / ${result.serviceUnits} units`} />
            <MixMetric label="Avg Invoice" value={formatINR(result.averageInvoiceValue)} sub={`${result.finalizedInvoices} invoices`} />
            <MixMetric label="Refunds Netted" value={formatINR(result.refunded)} sub={result.refunded > 0 ? "succeeded refunds only" : "none"} tone={result.refunded > 0 ? "rose" : undefined} />
          </div>

          <div className="mt-4">
            {tab === "categories" ? (
              <div className="space-y-2">
                {result.categories.slice(0, 8).map((cat) => (
                  <div key={cat.key} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-300 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", cat.kind === "service" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700")}>{cat.kind === "service" ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />}</span>
                      <span className="truncate text-[13px] font-semibold text-foreground" title={cat.label}>{cat.label}</span>
                    </div>
                    <div className="shrink-0 text-right"><p className="text-[13px] font-bold tabular-nums text-foreground">{formatINR(cat.netRevenue)}</p><p className="text-[10px] text-muted-foreground">{cat.units} units · {cat.invoices} inv</p></div>
                  </div>
                ))}
              </div>
            ) : (
              <MixTable rows={tab === "products" ? result.topProducts : result.topServices} href={evidenceHref(cohortIds)} emptyKind={tab} />
            )}
          </div>
          {result.repairChargeRevenue > 0 && <p className="mt-3 text-[10.5px] text-muted-foreground">Plus {formatINR(result.repairChargeRevenue)} in repair / labour charges billed on these invoices (not itemised as product lines).</p>}
        </>
      )}
    </Card>
  );
}

function MixTable({ rows, href, emptyKind }: { rows: SalesMixRow[]; href: string; emptyKind: string }) {
  if (!rows.length) return <Insufficient text={`No ${emptyKind} were sold on this cohort's finalized invoices.`} />;
  const max = Math.max(1, ...rows.map((r) => r.netRevenue));
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Link key={row.key} href={href} className="block rounded-xl border border-zinc-300 px-3 py-2.5 transition hover:border-[#6EE7B7] hover:bg-emerald-50/40">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[13px] font-semibold text-foreground" title={row.label}>{row.label}</span>
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">{formatINR(row.netRevenue)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (row.netRevenue / max) * 100)}%` }} /></div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
            <span>{row.category} · {row.units} units · {row.invoices} invoice{row.invoices === 1 ? "" : "s"}</span>
            {row.refunded > 0 && <span className="text-rose-600">−{formatINR(row.refunded)} refunded</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}

function MixMetric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "emerald" | "rose" }) {
  return (
    <div className="rounded-xl border border-zinc-300 bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[15px] font-extrabold tabular-nums", tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-600" : "text-foreground")}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ───────────────────── Conversion health funnel ───────────────────── */

function ConversionHealth({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card accent="blue">
      <SectionHeading icon={Layers3} title="Lead progression funnel" subtitle="Cumulative Lead → contact → qualification → service → Ticket → finalized Invoice. Each stage is a LEAD COUNT; revenue is the separate KPI above." />
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        {result.funnel.map((stage, index) => (
          <div key={stage.key} className="relative">
            <Link href={evidenceHref(stage.evidenceIds)} className="block rounded-xl border border-zinc-300 bg-muted/20 p-3 transition hover:border-[#C4B5FD] hover:bg-[#F5F3FF]/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{stage.label}</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-2xl font-extrabold tabular-nums text-foreground">{stage.count}</p>
                {stage.fromPreviousRate != null && <span className="pb-0.5 text-[11px] font-semibold text-[#6D28D9]">{pct(stage.fromPreviousRate)}</span>}
              </div>
            </Link>
            {index < result.funnel.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-card text-zinc-400 md:block" />}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-zinc-300 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        {result.leakage ? (
          <>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Biggest drop-off</p>
              <p className="mt-0.5 text-[13px] font-semibold text-foreground">{result.leakage.from} → {result.leakage.to}</p>
              <EvidenceLink href={evidenceHref(result.leakage.evidenceIds)} />
            </div>
            <p className="text-[12px] text-muted-foreground"><span className="font-bold text-rose-600">{result.leakage.lost} dropped</span> · {pct(result.leakage.passRate)} progressed</p>
          </>
        ) : <Insufficient text={`Need ${result.minSample} leads at a stage before naming the largest leakage.`} />}
      </div>
    </Card>
  );
}

/* ───────────────────── Strongest / stalls ─────────────────────────── */

function PatternCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const pattern = result.strongestProfile;
  return (
    <Card accent="violet">
      <SectionHeading icon={TrendingUp} title="Your strongest multi-attribute pattern" accent="violet" />
      {pattern ? (
        <div className="mt-4">
          <p className="text-lg font-bold text-foreground">{pattern.label}</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div><p className="text-3xl font-extrabold tabular-nums text-[#6D28D9]">{pct(pattern.conversionRate)}</p><p className="text-[10px] uppercase text-muted-foreground">observed conversion</p></div>
            <div><p className="text-lg font-bold tabular-nums">{pattern.leads}</p><p className="text-[10px] uppercase text-muted-foreground">leads</p></div>
            <div><p className="text-lg font-bold tabular-nums">{formatINR(pattern.revenueWon)}</p><p className="text-[10px] uppercase text-muted-foreground">revenue won</p></div>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">{signedPoints(pattern.liftVsOverall)} vs your overall cohort. Observed association, not a prediction.</p>
          <EvidenceLink href={evidenceHref(pattern.evidenceIds)} />
        </div>
      ) : <div className="mt-4"><Insufficient text={`Need at least ${result.minSample} leads in the same multi-attribute segment and multiple completed outcomes.`} /></div>}
    </Card>
  );
}

function StallCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const s = result.stalls;
  const ids = s.highValueStalled.map((l) => l.id);
  return (
    <Card accent="amber">
      <SectionHeading icon={AlertTriangle} title="Where leads are stalling" accent="amber" />
      {ids.length ? (
        <div className="mt-4">
          <p className="text-3xl font-extrabold tabular-nums text-amber-700">{formatINR(s.highValueStalledValue)}</p>
          <p className="mt-1 text-[13px] font-semibold text-foreground">{ids.length} high-value qualified lead{ids.length === 1 ? "" : "s"} need attention</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Overdue, no future follow-up, or no recent activity. High value = above the cohort&apos;s upper-quartile cutoff.</p>
          <EvidenceLink href={evidenceHref(ids)} />
        </div>
      ) : <div className="mt-4"><Insufficient text={s.highValueThreshold == null ? "Need more valued qualified leads to establish a high-value threshold." : "No high-value stalls were detected in this cohort."} /></div>}
    </Card>
  );
}

function FollowUpCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const f = result.followUp;
  return (
    <Card accent="amber">
      <SectionHeading icon={CalendarClock} title="Follow-up effectiveness" subtitle="Structured follow-up records inside this lead cohort. Association, not causation." />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniMetric label="Scheduled" value={String(f.scheduled)} />
        <MiniMetric label="Completed" value={String(f.completed)} />
        <MiniMetric label="Overdue" value={String(f.overdue)} attention={f.overdue > 0} />
        <MiniMetric label="Completion" value={pct(f.completionRate)} />
      </div>
      <div className="mt-4 rounded-xl border border-zinc-300 bg-muted/20 p-3">
        {f.associationSupported ? (
          <>
            <div className="flex items-center justify-between gap-3"><span className="text-[12px] font-semibold">With completed follow-up</span><span className="text-base font-bold text-[#6D28D9]">{pct(f.conversionWithCompletedRate)}</span></div>
            <div className="mt-1 flex items-center justify-between gap-3"><span className="text-[12px] text-muted-foreground">Without completed follow-up</span><span className="text-[13px] font-semibold text-muted-foreground">{pct(f.conversionWithoutCompletedRate)}</span></div>
            <p className="mt-2 text-[10.5px] text-muted-foreground">Observed association only; follow-up completion is not asserted to cause conversion.</p>
            <div className="flex flex-wrap items-center gap-3"><EvidenceLink href={evidenceHref(f.withCompletedEvidenceIds)} /><Link href={evidenceHref(f.withoutCompletedEvidenceIds)} className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6D28D9] hover:underline">View comparison <ArrowRight className="h-3 w-3" /></Link></div>
          </>
        ) : <Insufficient text={`Need ${result.minSample} leads in both completed-follow-up and comparison cohorts.`} />}
      </div>
    </Card>
  );
}

function PipelineHealthCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const s = result.stalls;
  const rows = [
    { label: "Active pipeline", value: result.summary.pipelineValue, ids: result.summaryEvidence.pipelineValue },
    { label: "Qualified without next follow-up", value: s.qualifiedWithoutFollowUpValue, ids: s.qualifiedWithoutFutureFollowUp.map((l) => l.id) },
    { label: "Overdue qualified value", value: s.overdueQualifiedValue, ids: s.overdueQualified.map((l) => l.id) },
    { label: "Stale value (7+ days)", value: s.stalePipelineValue, ids: s.stalePipeline.map((l) => l.id) },
  ];
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <Card accent="violet">
      <SectionHeading icon={Target} title="Pipeline health" subtitle="Value placement, not a financial forecast." />
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <Link key={row.label} href={evidenceHref(row.ids)} className="block">
            <div className="flex items-center justify-between gap-3 text-[12px]"><span className="text-muted-foreground">{row.label}</span><span className="font-bold tabular-nums text-foreground">{formatINR(row.value)}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#6D28D9]" style={{ width: `${Math.max(row.value ? 4 : 0, (row.value / max) * 100)}%` }} /></div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ───────────────────── Sales cycle (aging + timing + contact) ─────── */

/* Aging buckets are color-coded by freshness: fresher = cooler/positive,
   older = warmer/attention. The scale is fixed so colour carries meaning. */
const AGING_TONE: Record<string, { bar: string; chip: string; surface: string }> = {
  "0-1": { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", surface: "hover:border-emerald-300 hover:bg-emerald-50/40" },
  "2-3": { bar: "bg-sky-500", chip: "bg-sky-50 text-sky-700", surface: "hover:border-sky-300 hover:bg-sky-50/40" },
  "4-7": { bar: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700", surface: "hover:border-indigo-300 hover:bg-indigo-50/40" },
  "8-14": { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700", surface: "hover:border-amber-300 hover:bg-amber-50/40" },
  "15+": { bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700", surface: "hover:border-rose-300 hover:bg-rose-50/40" },
};
/* Contact-speed tiers: faster is better (emerald) → slower worse (rose). */
const SPEED_TONE = ["bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500"];

function SalesCycleCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const maxAging = Math.max(1, ...result.aging.map((b) => b.leads));
  const maxSpeedConv = Math.max(0.01, ...result.contactSpeed.map((r) => r.conversionRate));
  return (
    <Card accent="indigo">
      <SectionHeading icon={Clock3} title="Sales-cycle & stagnation" subtitle="How fast leads move and where they sit. Converted leads use age at conversion; open leads use age today. Medians reduce outlier distortion." />
      <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lead aging</p>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {result.aging.map((bucket) => {
                const t = AGING_TONE[bucket.key] ?? AGING_TONE["4-7"];
                return (
                  <Link key={bucket.key} href={evidenceHref(bucket.evidenceIds)} className={cn("flex flex-col rounded-xl border border-zinc-300 p-2.5 transition", t.surface)}>
                    <span className={cn("w-fit rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", t.chip)}>{bucket.label}</span>
                    <p className="mt-1.5 text-lg font-extrabold tabular-nums text-foreground">{bucket.leads}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", t.bar)} style={{ width: `${bucket.leads ? Math.max(6, (bucket.leads / maxAging) * 100) : 0}%` }} /></div>
                    <p className="mt-1.5 text-[9.5px] font-medium text-muted-foreground">{pct(bucket.conversionRate)} won</p>
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">First-contact speed vs conversion</p>
            <div className="mt-2 space-y-1.5">
              {result.contactSpeed.map((row, i) => {
                const tone = SPEED_TONE[i] ?? "bg-zinc-400";
                return (
                  <Link key={row.key} href={evidenceHref(row.evidenceIds)} className="group flex items-center gap-3 rounded-xl border border-zinc-300 px-3 py-2 transition hover:border-[#C4B5FD] hover:bg-[#F5F3FF]/40">
                    <span className={cn("h-7 w-1 shrink-0 rounded-full", tone)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-foreground">{row.label}</span>
                        <span className="text-[12px] font-bold tabular-nums text-foreground">{row.sufficient ? pct(row.conversionRate) : <span className="text-[10.5px] font-medium text-zinc-400">{row.leads} leads</span>}</span>
                      </div>
                      {row.sufficient && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(4, (row.conversionRate / maxSpeedConv) * 100)}%` }} /></div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Median time through the funnel</p>
          <div className="mt-2 space-y-2">
            {result.timing.map((row) => {
              const ready = row.sufficient && row.medianHours != null;
              return (
                <Link key={row.key} href={evidenceHref(row.evidenceIds)} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition", ready ? "border-zinc-300 hover:border-[#C4B5FD] hover:bg-[#F5F3FF]/40" : "border-dashed border-zinc-300 bg-muted/20")}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", ready ? "bg-[#EDE9FE] text-[#6D28D9]" : "bg-zinc-100 text-zinc-400")}><Timer className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold text-foreground">{row.label}</p><p className="text-[10.5px] text-muted-foreground">{row.samples} reliable timestamp{row.samples === 1 ? "" : "s"}</p></div>
                  </div>
                  {ready
                    ? <span className="shrink-0 rounded-lg bg-[#EDE9FE] px-2 py-1 text-[13px] font-bold tabular-nums text-[#5B21B6]">{formatHours(row.medianHours as number)}</span>
                    : <span className="shrink-0 text-[11px] font-medium text-zinc-400">Not enough data</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────── Loss / value / weak ────────────────────────── */

function LossCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const maxShare = Math.max(0.01, ...result.lossReasons.map((r) => r.share));
  return (
    <Card accent="rose">
      <SectionHeading icon={TrendingDown} title="Loss / disqualification" subtitle="Exact stored reasons only; free text is not recategorised." accent="rose" />
      <div className="mt-4 space-y-2">
        {result.lossReasons.length ? result.lossReasons.slice(0, 5).map((row) => (
          <Link key={row.reason} href={evidenceHref(row.evidenceIds)} className="block rounded-xl border border-zinc-300 px-3 py-2.5 transition hover:border-rose-300 hover:bg-rose-50/40">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[12.5px] font-semibold text-foreground">{row.reason}</p>
              <span className="shrink-0 text-[12px] font-bold tabular-nums text-rose-700">{formatINR(row.potentialValue)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rose-100"><div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(4, (row.share / maxShare) * 100)}%` }} /></div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">{row.count} lead{row.count === 1 ? "" : "s"} · {pct(row.share)} of closed outcomes</p>
          </Link>
        )) : <Insufficient text="No lost or disqualified outcomes with a stored reason in this cohort." />}
      </div>
    </Card>
  );
}

/* Value tiers get a cool→warm gradient so higher-value bands read as richer. */
const VALUE_TONE: Record<string, { chip: string; bar: string }> = {
  "0-5k": { chip: "bg-sky-50 text-sky-700", bar: "bg-sky-500" },
  "5k-15k": { chip: "bg-indigo-50 text-indigo-700", bar: "bg-indigo-500" },
  "15k+": { chip: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
};

function ValueCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const maxConv = Math.max(0.01, ...result.valueSegments.map((r) => r.conversionRate));
  return (
    <Card accent="emerald">
      <SectionHeading icon={IndianRupee} title="Lead value behaviour" subtitle="Estimate is pipeline; Revenue is finalized invoices only." accent="emerald" />
      <div className="mt-4 space-y-2">
        {result.valueSegments.map((row) => {
          const t = VALUE_TONE[row.key] ?? VALUE_TONE["0-5k"];
          return (
            <Link key={row.key} href={evidenceHref(row.evidenceIds)} className="block rounded-xl border border-zinc-300 px-3 py-2.5 transition hover:border-[#C4B5FD] hover:bg-[#F5F3FF]/40">
              <div className="flex items-center justify-between gap-3">
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", t.chip)}>{row.label}</span>
                <div className="flex items-center gap-4 text-right">
                  <div><p className={cn("text-[12px] font-bold tabular-nums", row.sufficient ? "text-foreground" : "text-zinc-400")}>{row.sufficient ? pct(row.conversionRate) : "—"}</p><p className="text-[9px] uppercase tracking-wide text-muted-foreground">conversion</p></div>
                  <div className="min-w-[72px]"><p className="text-[12px] font-bold tabular-nums text-emerald-700">{formatINR(row.revenueWon)}</p><p className="text-[9px] uppercase tracking-wide text-muted-foreground">revenue</p></div>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", row.sufficient ? t.bar : "bg-zinc-300")} style={{ width: `${row.sufficient ? Math.max(4, (row.conversionRate / maxConv) * 100) : 0}%` }} /></div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{row.leads} lead{row.leads === 1 ? "" : "s"}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function WeakPatternsCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card accent="rose">
      <SectionHeading icon={TrendingDown} title="Where outcomes are weaker" subtitle="Neutral wording; compared only with your overall cohort rate." />
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {result.weakestPatterns.length ? result.weakestPatterns.map((row) => (
          <Link key={`${row.dimension}-${row.key}`} href={evidenceHref(row.evidenceIds)} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-300 px-3 py-2.5 transition hover:border-rose-300 hover:bg-rose-50/40" title={`${row.converted}/${row.leads}; overall ${pct(result.summary.conversionRate)}`}>
            <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{row.label}</p><p className="text-[10.5px] text-muted-foreground">{DIMENSION_TITLE[row.dimension] || row.dimension} · {row.leads} leads</p></div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-rose-600">{pct(row.conversionRate)}</span>
          </Link>
        )) : <div className="sm:col-span-2"><Insufficient text={`No below-baseline segment has at least ${result.minSample} leads and a material difference.`} /></div>}
      </div>
    </Card>
  );
}

function FocusCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card accent="violet">
      <SectionHeading icon={Lightbulb} title="Evidence-based focus" subtitle="Observation → evidence → comparison → next step. Not a task list or generic advice." accent="violet" />
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {result.focusInsights.length ? result.focusInsights.map((insight) => <InsightCard key={insight.id} insight={insight} href={evidenceHref(insight.evidenceIds)} />) : <div className="lg:col-span-3"><Insufficient text="Need more completed outcomes or actionable pipeline signals before generating focus insights." /></div>}
      </div>
    </Card>
  );
}

function InsightCard({ insight, href }: { insight: EvidenceInsight; href: string }) {
  return (
    <div className={cn("rounded-xl border p-3.5", insight.tone === "attention" ? "border-amber-200 bg-amber-50/40" : insight.tone === "positive" ? "border-emerald-200 bg-emerald-50/30" : "border-zinc-300 bg-muted/15")} title={`${insight.numerator}/${insight.denominator}; sample ${insight.sampleSize}; baseline ${insight.baseline == null ? "n/a" : pct(insight.baseline)}; ${insight.periodLabel}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{insight.category}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{insight.metric}</p>
      <p className="mt-1 text-[12px] font-semibold text-foreground">{insight.title}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{insight.interpretation}</p>
      <p className="mt-2 text-[10px] text-muted-foreground">Evidence: {insight.numerator}/{insight.denominator} · sample {insight.sampleSize}{insight.baseline != null ? ` · baseline ${pct(insight.baseline)}` : ""} · {insight.periodLabel}</p>
      <EvidenceLink href={href} />
    </div>
  );
}

function DataQualityCard({ result, salesMix }: { result: LeadIntelligenceResult; salesMix: LeadSalesMixResult }) {
  const warnings = [...result.dataQualityWarnings];
  if (salesMix.unclassifiedLines > 0) warnings.push(`${salesMix.unclassifiedLines} invoice line${salesMix.unclassifiedLines === 1 ? "" : "s"} could not be matched to an Inventory Master item and were treated as products by their line type.`);
  if (!warnings.length) return null;
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/35 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div><p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Data quality notes</p><ul className="mt-1 space-y-0.5 text-[11px] text-amber-800/85">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div>
      </div>
    </div>
  );
}

/* ───────────────────── Shared primitives ──────────────────────────── */

const ACCENT_CHIP: Record<string, string> = {
  blue: "bg-[#EEF1FD] text-[#4361EE]",
  violet: "bg-[#EDE9FE] text-[#6D28D9]",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
};

/* Semantic left-accent bar colours for inner boxes (the thick coloured strip
   on the left edge, matching the KPI cards). Pick the one that fits the box's
   meaning. */
export type BoxAccent = "violet" | "blue" | "emerald" | "amber" | "rose" | "sky" | "indigo" | "zinc";
const ACCENT_BAR: Record<BoxAccent, string> = {
  violet: "bg-[#6D28D9]",
  blue: "bg-[#4361EE]",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  zinc: "bg-zinc-300",
};

/* Main section card — a visibly bordered container with a semantic coloured
   left-accent bar (the thick strip on the outer box). Inner rows stay quiet. */
function Card({ children, className, accent = "violet" }: { children: React.ReactNode; className?: string; accent?: BoxAccent }) {
  return (
    <section className={cn("relative overflow-hidden rounded-2xl border border-zinc-300 bg-card p-5 pl-6 shadow-card", className)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", ACCENT_BAR[accent])} />
      {children}
    </section>
  );
}
function SectionHeading({ icon: Icon, title, subtitle, accent = "blue" }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; accent?: keyof typeof ACCENT_CHIP }) {
  return <div className="flex items-start gap-2.5"><span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", ACCENT_CHIP[accent])}><Icon className="h-4 w-4" /></span><div><h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>{subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}</div></div>;
}
function MiniMetric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <div className="rounded-xl border border-zinc-300 bg-muted/15 p-2.5"><p className={cn("text-lg font-bold tabular-nums", attention ? "text-rose-600" : "text-foreground")}>{value}</p><p className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p></div>; }
function EvidenceLink({ href }: { href: string }) { return <Link href={href} className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6D28D9] hover:underline">View supporting leads <ArrowRight className="h-3 w-3" /></Link>; }
function Insufficient({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-zinc-300 bg-muted/15 px-3 py-4 text-center text-[11px] text-muted-foreground">{text}</div>; }

function EmptyIntelligence({ result, scope, onReset, filters, canViewAgents }: { result: LeadIntelligenceResult; scope: IntelligenceScopeMode; onReset: () => void; filters: LeadIntelligenceFilters; canViewAgents?: boolean }) {
  const filtered = JSON.stringify({ ...filters, storeIds: [] }) !== JSON.stringify({ ...EMPTY_INTELLIGENCE_FILTERS, storeIds: [] });
  const hasAnyLeads = result.scopeLeads.length > 0;
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#EDE9FE] text-[#6D28D9]"><Target className="h-5 w-5" /></span>
      <h2 className="mt-3 text-base font-bold">No leads in this intelligence cohort</h2>
      <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
        {scope === "permitted"
          ? "This analyses the leads you own, created, or follow up on."
          : "This analyses leads owned by this agent."}
        {" "}For <span className="font-semibold">{result.period.label}</span>{filters.storeIds.length ? " in the selected store" : ""}, none match.
        {hasAnyLeads
          ? " You have leads in other periods — try a wider date range or clear filters."
          : canViewAgents
            ? " As an owner/manager you may not own leads directly; use Team Lead Intelligence to analyse your Sales Agents."
            : " No leads are visible in your scope yet."}
      </p>
      <div className="mt-3 flex items-center justify-center gap-4">
        {filtered && <button onClick={onReset} className="text-[12px] font-semibold text-[#6D28D9] hover:underline">Reset filters</button>}
        {canViewAgents && <Link href="/leads/intelligence/agents" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6D28D9] hover:underline">Open Team Lead Intelligence <ArrowRight className="h-3.5 w-3.5" /></Link>}
      </div>
    </div>
  );
}

function DataUnavailable({ sources }: { sources: string[] }) {
  const unique = [...new Set(sources)];
  return <div className="space-y-5"><PageHeader eyebrow="Lead Intelligence" title="Analysis temporarily unavailable" /><div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-8 text-center shadow-card"><AlertTriangle className="mx-auto h-6 w-6 text-amber-700" /><h2 className="mt-3 text-base font-bold">Required data did not finish loading</h2><p className="mx-auto mt-1 max-w-lg text-[12px] text-muted-foreground">RepairOX will not present missing {unique.join(", ")} data as zero. Refresh after the data connection is restored.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#6D28D9] px-4 py-2 text-[12px] font-semibold text-white">Retry</button></div></div>;
}

function IntelligenceSkeleton({ name }: { name: string }) { return <div className="space-y-5"><PageHeader eyebrow="Lead Intelligence" title={name ? `${name} — Lead Intelligence` : "Lead Intelligence"} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-zinc-300 bg-muted/30" />)}</div><div className="h-64 animate-pulse rounded-2xl border border-zinc-300 bg-muted/25" /></div>; }
function pct(v: number): string { return `${Math.round(v * 100)}%`; }
function signedPoints(v: number): string { return `${v >= 0 ? "+" : ""}${Math.round(v * 100)} percentage points`; }
function formatHours(hours: number): string { return hours < 1 ? `${Math.round(hours * 60)} min` : hours < 48 ? `${hours.toFixed(hours < 10 ? 1 : 0)} hr` : `${(hours / 24).toFixed(1)} days`; }
