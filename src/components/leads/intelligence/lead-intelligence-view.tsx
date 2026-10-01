"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeIndianRupee, CalendarClock,
  CheckCircle2, Clock3, IndianRupee, Info, Layers3, Lightbulb, Route,
  Target, Timer, TrendingDown, TrendingUp, UserRoundCheck, Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { IntelligenceFilters } from "@/components/leads/intelligence/intelligence-filters";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { useCatalog } from "@/lib/catalog-context";
import { cn, formatINR } from "@/lib/utils";
import {
  calculateLeadIntelligence,
  EMPTY_INTELLIGENCE_FILTERS,
  type EvidenceInsight,
  type IntelligenceDimension,
  type LeadIntelligenceFilters,
  type LeadIntelligenceResult,
  type SegmentPerformance,
} from "@/lib/lead-intelligence";
import { buildLeadEvidenceHref } from "@/lib/lead-intelligence-url";
import type { SalesAgent } from "@/lib/sales-agents";

const DIMENSION_TITLE: Partial<Record<IntelligenceDimension, string>> = {
  source: "Source segments",
  route: "Route Performance",
  deviceCategory: "Device Categories",
  priority: "Lead Type / Priority",
  leadCategory: "Lead Categories",
  modeOfLead: "Mode of Lead",
};

export function LeadIntelligenceView({
  agent,
  initialFilters = EMPTY_INTELLIGENCE_FILTERS,
  ownerContext = false,
  backHref,
}: {
  agent: Pick<SalesAgent, "id" | "name" | "avatarUrl" | "roleLabel">;
  initialFilters?: LeadIntelligenceFilters;
  ownerContext?: boolean;
  backHref?: string;
}) {
  const { leads, followUps, hydrated, loadErrors } = useLeads();
  const store = useStore();
  const { stores, activeStoreId } = useStoreContext();
  const catalog = useCatalog();
  const [filters, setFilters] = useState<LeadIntelligenceFilters>(initialFilters);
  // Transaction providers load the active store only (or all authorized stores
  // in All Shops). Force the Lead cohort onto that same branch set so counts
  // and finalized revenue can never describe different scopes.
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
    labels,
  }), [leads, followUps, store.tickets, store.invoices, effectiveFilters, agent.id, labels]);

  if (!hydrated || !store.hydrated || !catalog.hydrated) return <IntelligenceSkeleton name={agent.name} />;
  const criticalErrors = [...loadErrors, ...(store.loadErrors ?? [])];
  if (criticalErrors.length) return <DataUnavailable sources={criticalErrors} />;

  const evidenceHref = (ids: string[]) => buildLeadEvidenceHref(ids, effectiveFilters, result.period, agent.id);
  const previous = result.trend.previous;

  return (
    <div className="space-y-5 pb-8">
      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4361EE] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Agent Intelligence
        </Link>
      )}
      <PageHeader
        eyebrow={ownerContext ? "Agent Intelligence" : "Personal Sales Intelligence"}
        title={ownerContext ? `${agent.name} — Lead Intelligence` : "My Lead Intelligence"}
        subtitle="What converted, where leads stalled, and which observed patterns deserve attention."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Avatar name={agent.name} src={agent.avatarUrl} size={30} />
            <div className="min-w-0">
              <p className="max-w-[170px] truncate text-[12px] font-semibold text-foreground">{agent.name}</p>
              <p className="text-[10px] text-muted-foreground">{agent.roleLabel || "Sales Agent"}</p>
            </div>
          </div>
        }
      />

      <IntelligenceFilters filters={effectiveFilters} onChange={setFilters} leads={leads.filter((l) => l.assignedTo === agent.id)} categories={catalog.categories} brands={catalog.brands} lockedStoreName={activeStoreId ? stores.find((store) => store.id === activeStoreId)?.name || "Current store" : undefined} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-[#EEF1FD]/55 px-3 py-2 text-[11px] text-[#3A4DBB]">
        <span className="inline-flex items-center gap-1.5 font-medium"><Info className="h-3.5 w-3.5" />Cohort: leads created in {result.period.label.toLowerCase()}; outcomes and finalized revenue observed through today.</span>
        <span className="font-semibold">Insight threshold: {result.minSample}+ leads per segment</span>
      </div>

      {result.cohort.length === 0 ? (
        <EmptyIntelligence filters={effectiveFilters} onReset={() => setFilters({ ...EMPTY_INTELLIGENCE_FILTERS, storeIds: activeStoreId ? [activeStoreId] : [] })} />
      ) : (
        <>
          <SummaryGrid result={result} previous={previous} evidenceHref={evidenceHref} />
          <TrendStrip result={result} evidenceHref={evidenceHref} />
          <ConversionHealth result={result} evidenceHref={evidenceHref} />

          <section className="space-y-3">
            <SectionHeading icon={TrendingUp} title="What converts for you" subtitle="Only statistically supported segments are ranked; small samples remain visible as insufficient." />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {(["source", "route", "deviceCategory"] as IntelligenceDimension[]).map((dimension) => (
                <SegmentCard key={dimension} title={DIMENSION_TITLE[dimension] || dimension} rows={result.segments[dimension]} minSample={result.minSample} evidenceHref={evidenceHref} />
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <PatternCard result={result} evidenceHref={evidenceHref} />
            <StallCard result={result} evidenceHref={evidenceHref} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <FollowUpCard result={result} evidenceHref={evidenceHref} />
            <PipelineHealthCard result={result} evidenceHref={evidenceHref} />
          </div>

          <AgingCard result={result} evidenceHref={evidenceHref} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <LossCard result={result} evidenceHref={evidenceHref} />
            <ValueCard result={result} evidenceHref={evidenceHref} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TimingCard result={result} evidenceHref={evidenceHref} />
            <WeakPatternsCard result={result} evidenceHref={evidenceHref} />
          </div>

          <FocusCard result={result} evidenceHref={evidenceHref} />
          <DataQualityCard result={result} />
        </>
      )}
    </div>
  );
}

function SummaryGrid({ result, previous, evidenceHref }: { result: LeadIntelligenceResult; previous: LeadIntelligenceResult["summary"] | null; evidenceHref: (ids: string[]) => string }) {
  const s = result.summary;
  const items = [
    { label: "Total Leads", value: String(s.totalLeads), icon: Users, previous: previous?.totalLeads, ids: result.summaryEvidence.total },
    { label: "Qualified", value: String(s.qualified), icon: UserRoundCheck, previous: previous?.qualified, ids: result.summaryEvidence.qualified },
    { label: "Converted", value: String(s.converted), icon: CheckCircle2, previous: previous?.converted, ids: result.summaryEvidence.converted },
    { label: "Conversion", value: pct(s.conversionRate), icon: Target, previous: previous ? previous.conversionRate : undefined, rate: true, ids: result.summaryEvidence.total },
    { label: "Revenue Won", value: formatINR(s.revenueWon), icon: IndianRupee, previous: previous?.revenueWon, ids: result.summaryEvidence.revenueWon },
    { label: "Pipeline Value", value: formatINR(s.pipelineValue), icon: BadgeIndianRupee, previous: previous?.pipelineValue, ids: result.summaryEvidence.pipelineValue },
    { label: "Pending Follow-ups", value: String(s.pendingFollowUps), icon: CalendarClock, ids: result.summaryEvidence.pendingFollowUps },
    { label: "Overdue Follow-ups", value: String(s.overdueFollowUps), icon: AlertTriangle, urgent: s.overdueFollowUps > 0, ids: result.summaryEvidence.overdueFollowUps },
  ];
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {items.map((item) => {
          const current = item.rate ? s.conversionRate : item.label === "Total Leads" ? s.totalLeads : item.label === "Qualified" ? s.qualified : item.label === "Converted" ? s.converted : item.label === "Revenue Won" ? s.revenueWon : item.label === "Pipeline Value" ? s.pipelineValue : undefined;
          const delta = item.previous != null && current != null && item.previous !== 0 ? (current - item.previous) / Math.abs(item.previous) : null;
          return (
            <Link key={item.label} href={evidenceHref(item.ids)} className={cn("rounded-xl border bg-card/90 p-3 shadow-card transition hover:border-[#B3BFF6] hover:bg-[#EEF1FD]/25", item.urgent ? "border-red-200" : "border-border/70") }>
              <div className="flex items-center justify-between gap-2">
                <span className={cn("grid h-7 w-7 place-items-center rounded-lg", item.urgent ? "bg-red-50 text-[#B42318]" : "bg-[#EEF1FD] text-[#4361EE]")}><item.icon className="h-3.5 w-3.5" /></span>
                {delta != null && Math.abs(delta) >= 0.01 && <span className={cn("text-[10px] font-semibold tabular-nums", delta > 0 ? "text-emerald-600" : "text-rose-600")}>{delta > 0 ? "+" : ""}{Math.round(delta * 100)}%</span>}
              </div>
              <p className="mt-2 text-xl font-extrabold tabular-nums text-foreground">{item.value}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TrendStrip({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const previous = result.trend.previous;
  if (!previous) return null;
  const current = result.summary;
  const leadDelta = current.totalLeads - previous.totalLeads;
  const conversionDelta = current.conversionRate - previous.conversionRate;
  const revenueDelta = current.revenueWon - previous.revenueWon;
  const sentence = leadDelta === 0 && Math.abs(conversionDelta) < 0.005 && revenueDelta === 0
    ? "Volume, conversion quality and finalized revenue are unchanged from the comparable prior cohort."
    : `Lead volume ${leadDelta >= 0 ? "increased" : "decreased"} by ${Math.abs(leadDelta)}, while observed conversion ${conversionDelta >= 0 ? "rose" : "fell"} ${Math.abs(Math.round(conversionDelta * 100))} points${revenueDelta ? ` and Revenue Won ${revenueDelta > 0 ? "increased" : "decreased"} by ${formatINR(Math.abs(revenueDelta))}` : ""}.`;
  return (
    <Link href={evidenceHref(result.summaryEvidence.total)} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 transition hover:border-[#B3BFF6] sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Volume vs quality · prior comparable cohort</p><p className="mt-0.5 text-[12px] font-medium text-foreground">{sentence}</p></div>
      <div className="flex shrink-0 items-center gap-4 text-[11px] tabular-nums"><span>{current.totalLeads} vs {previous.totalLeads} leads</span><span className={conversionDelta >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>{conversionDelta >= 0 ? "+" : ""}{Math.round(conversionDelta * 100)} pts</span></div>
    </Link>
  );
}

function ConversionHealth({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card>
      <SectionHeading icon={Layers3} title="Conversion health" subtitle="Cumulative Lead → contact → qualification → service → Ticket → finalized Invoice chain. Terminal Lead conversion remains the separate KPI above." />
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        {result.funnel.map((stage, index) => (
          <div key={stage.key} className="relative">
            <Link href={evidenceHref(stage.evidenceIds)} className="block rounded-xl border border-border bg-muted/20 p-3 transition hover:border-[#B3BFF6] hover:bg-[#EEF1FD]/40">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{stage.label}</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-2xl font-extrabold tabular-nums text-foreground">{stage.count}</p>
                {stage.fromPreviousRate != null && <span className="pb-0.5 text-[11px] font-semibold text-[#4361EE]">{pct(stage.fromPreviousRate)}</span>}
              </div>
            </Link>
            {index < result.funnel.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-card text-zinc-400 md:block" />}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        {result.leakage ? (
          <>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Where leads are dropping</p>
              <p className="mt-0.5 text-[13px] font-semibold text-foreground">{result.leakage.from} → {result.leakage.to}</p>
              <EvidenceLink href={evidenceHref(result.leakage.evidenceIds)} />
            </div>
            <p className="text-[12px] text-muted-foreground"><span className="font-bold text-rose-600">{result.leakage.lost} drop-off</span> · {pct(result.leakage.passRate)} progressed</p>
          </>
        ) : <Insufficient text={`Need ${result.minSample} leads at a stage before naming the largest leakage.`} />}
      </div>
    </Card>
  );
}

function SegmentCard({ title, rows, minSample, evidenceHref }: { title: string; rows: SegmentPerformance[]; minSample: number; evidenceHref: (ids: string[]) => string }) {
  const supported = rows.filter((row) => row.sufficient).sort((a, b) => b.conversionRate - a.conversionRate || b.revenueWon - a.revenueWon).slice(0, 4);
  return (
    <Card>
      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
      <div className="mt-3 space-y-2.5">
        {supported.length ? supported.map((row) => (
          <Link key={row.key} href={evidenceHref(row.evidenceIds)} title={`${row.converted} converted / ${row.leads} leads. Overall baseline ${pct(row.conversionRate - row.liftVsOverall)}.`} className="group block rounded-xl border border-border px-3 py-2.5 transition hover:border-[#B3BFF6] hover:bg-[#EEF1FD]/35">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[13px] font-semibold text-foreground">{row.label}</span>
              <span className="text-sm font-bold tabular-nums text-[#4361EE]">{pct(row.conversionRate)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
              <span>{row.leads} leads · {row.converted} converted</span>
              <span>{formatINR(row.revenueWon)}</span>
            </div>
          </Link>
        )) : <Insufficient text={`Not enough data — each segment needs ${minSample} leads.`} />}
      </div>
    </Card>
  );
}

function PatternCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const pattern = result.strongestProfile;
  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-[#4361EE]" />
      <SectionHeading icon={TrendingUp} title="Your strongest pattern" />
      {pattern ? (
        <div className="mt-4">
          <p className="text-lg font-bold text-foreground">{pattern.label}</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div><p className="text-3xl font-extrabold tabular-nums text-[#4361EE]">{pct(pattern.conversionRate)}</p><p className="text-[10px] uppercase text-muted-foreground">observed conversion</p></div>
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
    <Card className="relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-amber-500" />
      <SectionHeading icon={AlertTriangle} title="Where leads are stalling" />
      {ids.length ? (
        <div className="mt-4">
          <p className="text-3xl font-extrabold tabular-nums text-amber-700">{formatINR(s.highValueStalledValue)}</p>
          <p className="mt-1 text-[13px] font-semibold text-foreground">{ids.length} high-value qualified lead{ids.length === 1 ? "" : "s"} need attention</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Overdue, no future follow-up, or no recent Lead/follow-up timestamp. High value = above the cohort&apos;s upper-quartile cutoff.</p>
          <EvidenceLink href={evidenceHref(ids)} />
        </div>
      ) : <div className="mt-4"><Insufficient text={s.highValueThreshold == null ? "Need more valued qualified leads to establish a high-value threshold." : "No high-value stalls were detected in this cohort."} /></div>}
    </Card>
  );
}

function FollowUpCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const f = result.followUp;
  return (
    <Card>
      <SectionHeading icon={CalendarClock} title="Follow-up effectiveness" subtitle="Your structured follow-up records inside this lead cohort." />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniMetric label="Scheduled" value={String(f.scheduled)} />
        <MiniMetric label="Completed" value={String(f.completed)} />
        <MiniMetric label="Overdue" value={String(f.overdue)} attention={f.overdue > 0} />
        <MiniMetric label="Completion" value={pct(f.completionRate)} />
      </div>
      <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
        {f.associationSupported ? (
          <>
            <div className="flex items-center justify-between gap-3"><span className="text-[12px] font-semibold">With completed follow-up</span><span className="text-base font-bold text-[#4361EE]">{pct(f.conversionWithCompletedRate)}</span></div>
            <div className="mt-1 flex items-center justify-between gap-3"><span className="text-[12px] text-muted-foreground">Without completed follow-up</span><span className="text-[13px] font-semibold text-muted-foreground">{pct(f.conversionWithoutCompletedRate)}</span></div>
            <p className="mt-2 text-[10.5px] text-muted-foreground">Observed association only; follow-up completion is not asserted to cause conversion.</p>
            <div className="flex flex-wrap items-center gap-3"><EvidenceLink href={evidenceHref(f.withCompletedEvidenceIds)} /><Link href={evidenceHref(f.withoutCompletedEvidenceIds)} className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#4361EE] hover:underline">View comparison <ArrowRight className="h-3 w-3" /></Link></div>
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
    <Card>
      <SectionHeading icon={Target} title="Pipeline health" subtitle="Value placement, not a financial forecast." />
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <Link key={row.label} href={evidenceHref(row.ids)} className="block">
            <div className="flex items-center justify-between gap-3 text-[12px]"><span className="text-muted-foreground">{row.label}</span><span className="font-bold tabular-nums text-foreground">{formatINR(row.value)}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#4361EE]" style={{ width: `${Math.max(row.value ? 4 : 0, (row.value / max) * 100)}%` }} /></div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function AgingCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  const max = Math.max(1, ...result.aging.map((b) => b.leads));
  return (
    <Card>
      <SectionHeading icon={Clock3} title="Lead aging" subtitle="Converted leads use age at conversion; open leads use age today." />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        {result.aging.map((bucket) => (
          <Link key={bucket.key} href={evidenceHref(bucket.evidenceIds)} className="rounded-xl border border-border p-3 transition hover:border-[#B3BFF6] hover:bg-[#EEF1FD]/30">
            <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{bucket.label}</span><span className="text-lg font-bold tabular-nums">{bucket.leads}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#4361EE]" style={{ width: `${(bucket.leads / max) * 100}%` }} /></div>
            <p className="mt-2 text-[10.5px] text-muted-foreground">{bucket.openLeads} open · {pct(bucket.conversionRate)} converted</p>
            <p className="mt-0.5 text-[10.5px] font-medium text-foreground">{formatINR(bucket.pipelineValue)} pipeline</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function LossCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card>
      <SectionHeading icon={TrendingDown} title="Loss / disqualification" subtitle="Exact stored reasons only; free text is not recategorized." />
      <div className="mt-4 space-y-2">
        {result.lossReasons.length ? result.lossReasons.slice(0, 5).map((row) => (
          <Link key={row.reason} href={evidenceHref(row.evidenceIds)} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/30">
            <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{row.reason}</p><p className="text-[10.5px] text-muted-foreground">{row.count} leads · {pct(row.share)} of closed outcomes</p></div>
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">{formatINR(row.potentialValue)}</span>
          </Link>
        )) : <Insufficient text="No lost or disqualified outcomes with a stored reason in this cohort." />}
      </div>
    </Card>
  );
}

function ValueCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card>
      <SectionHeading icon={IndianRupee} title="Lead value behavior" subtitle="Estimate is pipeline; Revenue Won comes only from finalized invoices." />
      <div className="mt-4 space-y-2">
        {result.valueSegments.map((row) => (
          <Link key={row.key} href={evidenceHref(row.evidenceIds)} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/30">
            <div><p className="text-[12.5px] font-semibold">{row.label}</p><p className="text-[10.5px] text-muted-foreground">{row.leads} leads</p></div>
            <div className="text-right"><p className="text-[12px] font-bold text-[#4361EE]">{row.sufficient ? pct(row.conversionRate) : "—"}</p><p className="text-[9.5px] text-muted-foreground">conversion</p></div>
            <div className="min-w-[74px] text-right"><p className="text-[12px] font-bold">{formatINR(row.revenueWon)}</p><p className="text-[9.5px] text-muted-foreground">revenue</p></div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function TimingCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card>
      <SectionHeading icon={Timer} title="Time through the funnel" subtitle="Median is used to reduce distortion from extreme durations." />
      <div className="mt-4 space-y-2">
        {result.timing.map((row) => (
          <Link key={row.key} href={evidenceHref(row.evidenceIds)} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition hover:border-[#B3BFF6] hover:bg-[#EEF1FD]/25">
            <div><p className="text-[12.5px] font-semibold">{row.label}</p><p className="text-[10.5px] text-muted-foreground">{row.samples} reliable timestamps</p></div>
            <span className="text-[13px] font-bold tabular-nums text-foreground">{row.sufficient && row.medianHours != null ? formatHours(row.medianHours) : "Not enough data"}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function WeakPatternsCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card>
      <SectionHeading icon={TrendingDown} title="Where outcomes are weaker" subtitle="Neutral wording; compared only with your overall cohort rate." />
      <div className="mt-4 space-y-2">
        {result.weakestPatterns.length ? result.weakestPatterns.map((row) => (
          <Link key={`${row.dimension}-${row.key}`} href={evidenceHref(row.evidenceIds)} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/30" title={`${row.converted}/${row.leads}; overall ${pct(result.summary.conversionRate)}`}>
            <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{row.label}</p><p className="text-[10.5px] text-muted-foreground">{DIMENSION_TITLE[row.dimension] || row.dimension} · {row.leads} leads</p></div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-rose-600">{pct(row.conversionRate)}</span>
          </Link>
        )) : <Insufficient text={`No below-baseline segment has at least ${result.minSample} leads and a material difference.`} />}
      </div>
    </Card>
  );
}

function FocusCard({ result, evidenceHref }: { result: LeadIntelligenceResult; evidenceHref: (ids: string[]) => string }) {
  return (
    <Card>
      <SectionHeading icon={Lightbulb} title="Where to focus" subtitle="Evidence-backed prioritization, not a task list or generic advice." />
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {result.focusInsights.length ? result.focusInsights.map((insight) => <InsightCard key={insight.id} insight={insight} href={evidenceHref(insight.evidenceIds)} />) : <div className="lg:col-span-3"><Insufficient text="Need more completed outcomes or actionable pipeline signals before generating focus insights." /></div>}
      </div>
    </Card>
  );
}

function InsightCard({ insight, href }: { insight: EvidenceInsight; href: string }) {
  return (
    <div className={cn("rounded-xl border p-3.5", insight.tone === "attention" ? "border-amber-200 bg-amber-50/40" : insight.tone === "positive" ? "border-emerald-200 bg-emerald-50/30" : "border-border bg-muted/15")} title={`${insight.numerator}/${insight.denominator}; sample ${insight.sampleSize}; baseline ${insight.baseline == null ? "n/a" : pct(insight.baseline)}; ${insight.periodLabel}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{insight.category}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{insight.metric}</p>
      <p className="mt-1 text-[12px] font-semibold text-foreground">{insight.title}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{insight.interpretation}</p>
      <EvidenceLink href={href} />
    </div>
  );
}

function DataQualityCard({ result }: { result: LeadIntelligenceResult }) {
  if (!result.dataQualityWarnings.length) return null;
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/35 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div><p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Data quality notes</p><ul className="mt-1 space-y-0.5 text-[11px] text-amber-800/85">{result.dataQualityWarnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) { return <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}>{children}</section>; }
function SectionHeading({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string }) {
  return <div className="flex items-start gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-4 w-4" /></span><div><h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>{subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}</div></div>;
}
function MiniMetric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <div className="rounded-xl border border-border bg-muted/15 p-2.5"><p className={cn("text-lg font-bold tabular-nums", attention ? "text-rose-600" : "text-foreground")}>{value}</p><p className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p></div>; }
function EvidenceLink({ href }: { href: string }) { return <Link href={href} className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#4361EE] hover:underline">View leads <ArrowRight className="h-3 w-3" /></Link>; }
function Insufficient({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-border bg-muted/15 px-3 py-4 text-center text-[11px] text-muted-foreground">{text}</div>; }

function EmptyIntelligence({ filters, onReset }: { filters: LeadIntelligenceFilters; onReset: () => void }) {
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_INTELLIGENCE_FILTERS);
  return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><Target className="h-5 w-5" /></span><h2 className="mt-3 text-base font-bold">No leads in this intelligence cohort</h2><p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">Insights appear only from real owned leads. Try another period or remove filters; no placeholder numbers will be shown.</p>{filtered && <button onClick={onReset} className="mt-3 text-[12px] font-semibold text-[#4361EE] hover:underline">Reset filters</button>}</div>;
}
function DataUnavailable({ sources }: { sources: string[] }) {
  const unique = [...new Set(sources)];
  return <div className="space-y-5"><PageHeader eyebrow="Lead Intelligence" title="Analysis temporarily unavailable" /><div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-8 text-center shadow-card"><AlertTriangle className="mx-auto h-6 w-6 text-amber-700" /><h2 className="mt-3 text-base font-bold">Required data did not finish loading</h2><p className="mx-auto mt-1 max-w-lg text-[12px] text-muted-foreground">RepairOX will not present missing {unique.join(", ")} data as zero. Refresh after the data connection is restored.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#4361EE] px-4 py-2 text-[12px] font-semibold text-white">Retry</button></div></div>;
}
function IntelligenceSkeleton({ name }: { name: string }) { return <div className="space-y-5"><PageHeader eyebrow="Lead Intelligence" title={name ? `${name} — Lead Intelligence` : "Lead Intelligence"} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-muted/30" />)}</div><div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/25" /></div>; }
function pct(v: number): string { return `${Math.round(v * 100)}%`; }
function signedPoints(v: number): string { return `${v >= 0 ? "+" : ""}${Math.round(v * 100)} percentage points`; }
function formatHours(hours: number): string { return hours < 1 ? `${Math.round(hours * 60)} min` : hours < 48 ? `${hours.toFixed(hours < 10 ? 1 : 0)} hr` : `${(hours / 24).toFixed(1)} days`; }
