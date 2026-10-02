"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Individual Sales Agent Performance (reusable sections).

   The analytical surfaces BELOW the page header + filters of the Individual
   Agent Performance view:
     • PerfKpiRow        — the six headline KPI cards (trend pill + sparkline).
     • ConversionSummary — Qualified→Converted, Revenue/Converted, Pending F/U.
     • LeadConversionFunnel — Total → Qualified → Converted → Revenue Won bars.
     • LeadRouteMix      — donut of CONVERTED operations by service route +
                           Top Source.

   Every value is passed in already-derived from real records
   (AgentPerformance + the agent's real month rows). These components NEVER
   fetch, NEVER fabricate a number, and honour the zero-vs-"not enough data"
   distinction (see agent-performance.ts helpers). Brand palette only
   (#4361EE / #EEF1FD / emerald / amber / overdue-rose).
   ────────────────────────────────────────────────────────────────────────── */

import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Sparkline, DonutSplit } from "@/components/reports/mini-charts";
import {
  conversionSummary, funnelStages, convertedRouteMix, topSourceByVolume,
  perfSparkline, perfLatestVsPrevious, perfDelta,
  type AgentPerformance, type PeriodPerformance, type PerfSeriesMetric,
} from "@/lib/agent-performance";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/* ── Section frame (shared with the page's other blocks) ───────────────── */
export function PerfSection({
  title, subtitle, children, className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      <div className="mb-4">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   KPI CARD — compact card with icon chip, trend pill and a real sparkline.
   Matches the reference row (six balanced cards). The trend pill + sparkline
   only render when a VALID comparison / ≥2 months of real data exist.
   ════════════════════════════════════════════════════════════════════════ */

type Tone = "blue" | "emerald" | "amber" | "violet" | "rose" | "overdue";

const TONE: Record<Tone, { chip: string; icon: string; spark: string; pillUp: string; pillDown: string }> = {
  blue:    { chip: "bg-[#EEF1FD] text-[#4361EE]", icon: "#4361EE", spark: "#4361EE", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", icon: "#10B981", spark: "#10B981", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  amber:   { chip: "bg-amber-50 text-amber-600", icon: "#F59E0B", spark: "#F59E0B", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  violet:  { chip: "bg-violet-50 text-violet-600", icon: "#8B5CF6", spark: "#8B5CF6", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  rose:    { chip: "bg-[#FBEDF0] text-[#C4506B]", icon: "#D96A82", spark: "#D96A82", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  overdue: { chip: "bg-[#FBEDF0] text-[#C4506B]", icon: "#D96A82", spark: "#D96A82", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
};

export interface KpiSpec {
  label: string;
  value: string;             // formatted display value
  sub?: string;              // supporting line (e.g. "75% of total", "From 21 invoices")
  tone: Tone;
  icon: React.ComponentType<{ className?: string }>;
  metric: PerfSeriesMetric;  // which real series drives trend + sparkline
  higherIsBetter?: boolean;  // false for overdue-type metrics
  onClick?: () => void;      // optional drilldown
}

function KpiCard({ spec, months }: { spec: KpiSpec; months: PeriodPerformance[] }) {
  const t = TONE[spec.tone];
  const Icon = spec.icon;
  const series = perfSparkline(months, spec.metric);
  const { current, previous } = perfLatestVsPrevious(months, spec.metric);
  const delta = perfDelta(current, previous, spec.higherIsBetter ?? true);

  return (
    <div
      onClick={spec.onClick}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-[#B3BFF6]/50 bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-[#4361EE]/40 hover:shadow-[0_8px_24px_-10px_rgba(67,97,238,0.25)]",
        spec.onClick && "cursor-pointer",
      )}
      style={{ containerType: "inline-size" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", t.chip)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{spec.label}</span>
        </span>
        {delta && (
          <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset", delta.up ? t.pillUp : t.pillDown)}>
            {delta.up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
            {Math.abs(delta.pct)}%
          </span>
        )}
      </div>

      <p className="mt-2.5 font-display text-[26px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
        {spec.value}
      </p>

      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{spec.sub ?? "\u00A0"}</p>
        {series.length >= 2 && (
          <div className="h-7 w-20 shrink-0">
            <Sparkline data={series} color={t.spark} height={28} />
          </div>
        )}
      </div>
    </div>
  );
}

export function PerfKpiRow({ specs, months }: { specs: KpiSpec[]; months: PeriodPerformance[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {specs.map((s) => <KpiCard key={s.label} spec={s} months={months} />)}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CONVERSION SUMMARY — three insight cards (distinct from the top KPIs).
   ════════════════════════════════════════════════════════════════════════ */

function InsightCard({
  icon: Icon, label, value, sub, delta, tone = "blue",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  delta?: { pct: number; up: boolean } | null;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={cn("grid h-7 w-7 place-items-center rounded-lg", t.chip)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        </span>
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset", delta.up ? t.pillUp : t.pillDown)}>
            {delta.up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
            {Math.abs(delta.pct)}%
          </span>
        )}
      </div>
      <p className="mt-2.5 font-display text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ConversionSummarySection({
  perf, icons,
}: {
  perf: AgentPerformance;
  icons: { qualified: React.ComponentType<{ className?: string }>; revenue: React.ComponentType<{ className?: string }>; followUp: React.ComponentType<{ className?: string }> };
}) {
  const cs = conversionSummary(perf);
  return (
    <PerfSection title="Conversion Summary" subtitle="Key metrics for your lead performance">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InsightCard
          icon={icons.qualified}
          label="Qualified → Converted"
          tone="blue"
          value={cs.qualifiedToConverted == null ? "N/A" : pct(cs.qualifiedToConverted)}
          sub={cs.qualifiedToConverted == null ? "No qualified leads yet" : `${cs.convertedFromQualified} of ${cs.qualified} qualified leads`}
        />
        <InsightCard
          icon={icons.revenue}
          label="Revenue per Converted Lead"
          tone="emerald"
          value={cs.revenuePerConverted == null ? "N/A" : formatINR(Math.round(cs.revenuePerConverted))}
          sub={cs.revenuePerConverted == null ? "No conversions yet" : `From ${cs.converted} conversions`}
        />
        <InsightCard
          icon={icons.followUp}
          label="Pending Follow-ups"
          tone={cs.overdueFollowUp > 0 ? "overdue" : "amber"}
          value={String(cs.pendingFollowUp)}
          sub={cs.overdueFollowUp > 0 ? `${cs.overdueFollowUp} overdue` : (cs.pendingFollowUp > 0 ? "Action required" : "All caught up")}
        />
      </div>
    </PerfSection>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   LEAD CONVERSION FUNNEL — horizontal bars, each labelled with count + share.
   ════════════════════════════════════════════════════════════════════════ */

const FUNNEL_TONE: Record<string, string> = {
  total: "bg-[#4361EE]",
  qualified: "bg-sky-400",
  converted: "bg-violet-500",
  revenue: "bg-emerald-500",
};

export function LeadConversionFunnelSection({ perf }: { perf: AgentPerformance }) {
  const stages = funnelStages(perf);
  const empty = perf.funnel.total === 0;
  return (
    <PerfSection title="Lead Conversion Funnel" subtitle="From total leads to closed revenue">
      {empty ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">No lead data yet.</p>
      ) : (
        <div className="space-y-3">
          {stages.map((s) => (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[12px] font-medium text-muted-foreground">{s.label}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted">
                <div
                  className={cn("h-full rounded-md transition-all", FUNNEL_TONE[s.key])}
                  style={{ width: `${Math.max(s.shareOfTotal * 100, s.count > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-[13px] font-bold tabular-nums text-foreground">{s.count}</span>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{pct(s.shareOfTotal)}</span>
            </div>
          ))}
          <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-emerald-600">{formatINR(perf.revenueWonAgentDriven)}</span>
            revenue from {perf.funnel.invoice} finalized {perf.funnel.invoice === 1 ? "invoice" : "invoices"}
          </div>
        </div>
      )}
    </PerfSection>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   LEAD MIX (by service route) — donut of CONVERTED operations + Top Source.
   ════════════════════════════════════════════════════════════════════════ */

const ROUTE_COLORS = ["#4361EE", "#8B5CF6", "#10B981"]; // Walk-In / Pickup / On-Site

export function LeadRouteMixSection({
  perf, sourceIcon,
}: {
  perf: AgentPerformance;
  sourceIcon?: React.ComponentType<{ className?: string }>;
}) {
  const mix = convertedRouteMix(perf);
  const top = topSourceByVolume(perf);
  const SourceIcon = sourceIcon;

  const donutData = mix.rows.map((r) => ({ key: r.route, label: r.label, value: r.converted }));

  return (
    <PerfSection title="Lead Mix (by Service Route)" subtitle="Distribution of your converted leads">
      {mix.convertedTotal === 0 ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">No converted leads yet.</p>
      ) : (
        <>
          <DonutSplit
            data={donutData}
            currency={false}
            height={150}
            colors={ROUTE_COLORS}
            centerLabel={{ value: String(mix.convertedTotal), label: "Converted" }}
          />
          <div className="mt-3 space-y-1.5">
            {mix.rows.map((r, i) => (
              <div key={r.route} className="flex items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                <span className="flex-1 text-muted-foreground">{r.label}</span>
                <span className="font-bold tabular-nums text-foreground">{r.converted}</span>
                <span className="w-10 text-right tabular-nums text-muted-foreground">{pct(r.share)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Top Source — honest "top by volume"; hidden when sample too small. */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Top Source</p>
        {top ? (
          <div className="mt-1.5 flex items-center gap-2.5">
            {SourceIcon && (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                <SourceIcon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-foreground">{top.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {top.leads} leads ({pct(top.share)}) · {pct(top.conversionRate)} conversion
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-[12px] text-muted-foreground">Not enough data</p>
        )}
      </div>
    </PerfSection>
  );
}
