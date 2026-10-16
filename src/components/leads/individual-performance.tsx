"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Individual Sales Agent Performance (reusable sections).

   The analytical surfaces of the Agent Performance views:
     • KpiSummaryRow     — the FOUR consolidated KPI cards (Revenue / Lead /
                           Conversion / Follow-up), shared by BOTH the All-Agents
                           aggregate and the Individual agent views.
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

import type { LucideIcon } from "lucide-react";
import { IndianRupee, Users, Target, CalendarClock } from "lucide-react";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import { DonutSplit } from "@/components/reports/mini-charts";
import {
  conversionSummary, funnelStages, funnelRevenueOutcome, convertedRouteMix, topSourceByVolume,
  type AgentPerformance, type KpiSummary,
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
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CONSOLIDATED KPI CARD — the four premium dashboard cards.

   ONE reusable component (<KpiPerformanceCard>) renders Revenue / Lead /
   Conversion / Follow-up identically in BOTH views. Each card carries a
   semantic accent (strip + icon chip + value colour), a prominent primary
   metric + description, two supporting metrics, and a subtle progress
   indicator for the card's related percentage. Values are pre-derived (from
   kpiSummaryForAgent / kpiSummaryFromTotals) — the card NEVER calculates a
   business figure itself. Loading + empty are handled; colour never floods
   the white card body. Click-through is optional per supporting metric.
   ════════════════════════════════════════════════════════════════════════ */

type KpiAccent = "emerald" | "blue" | "indigo" | "amber";

/* Restrained semantic palette — strip + chip + value + progress-fill only. */
const KPI_ACCENT: Record<KpiAccent, { bar: string; chip: string; value: string; fill: string; glow: string }> = {
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600", value: "text-emerald-700", fill: "bg-emerald-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(16,185,129,0.4)] hover:border-emerald-400/50" },
  blue:    { bar: "bg-[#4361EE]",   chip: "bg-[#EEF1FD] text-[#4361EE]", value: "text-[#2A3BA3]", fill: "bg-[#4361EE]", glow: "hover:shadow-[0_10px_30px_-14px_rgba(67,97,238,0.4)] hover:border-[#4361EE]/40" },
  indigo:  { bar: "bg-indigo-500",  chip: "bg-indigo-50 text-indigo-600", value: "text-indigo-700", fill: "bg-indigo-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(99,102,241,0.4)] hover:border-indigo-400/50" },
  amber:   { bar: "bg-amber-500",   chip: "bg-amber-50 text-amber-600", value: "text-amber-700", fill: "bg-amber-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(245,158,11,0.4)] hover:border-amber-400/50" },
};

interface KpiSupport {
  label: string;
  value: string;
  onClick?: () => void;
  /** Tint the value for a genuine alert (e.g. real overdue actions). */
  alert?: boolean;
}

interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  accent: KpiAccent;
  primaryValue: string;
  primaryDescription: string;
  support: [KpiSupport, KpiSupport];
  /** 0..1 for the progress indicator; when provided it renders a thin bar. */
  progress?: number;
  /** Override the progress fill colour for a genuine-alert state. */
  progressAlert?: boolean;
  /** A11y + explanatory tooltip on the whole card. */
  title?: string;
  onClick?: () => void;
  loading?: boolean;
}

function SupportMetric({ s }: { s: KpiSupport }) {
  const cls = cn("tabular-nums font-bold", s.alert ? "text-[#B42318]" : "text-foreground");
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="truncate text-muted-foreground">{s.label}</span>
      {s.onClick ? (
        <button
          onClick={(e) => { e.stopPropagation(); s.onClick!(); }}
          className={cn(cls, "shrink-0 rounded px-1 transition hover:bg-muted hover:underline focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30")}
        >
          {s.value}
        </button>
      ) : (
        <span className={cn(cls, "shrink-0")}>{s.value}</span>
      )}
    </div>
  );
}

export function KpiPerformanceCard({
  label, icon: Icon, accent, primaryValue, primaryDescription, support,
  progress, progressAlert, title, onClick, loading,
}: KpiCardProps) {
  const a = KPI_ACCENT[accent];

  if (loading) {
    return (
      <div className="relative flex h-full min-h-[136px] flex-col overflow-hidden rounded-2xl border border-[#B3BFF6]/40 bg-card p-4 pl-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <span className={cn("absolute inset-y-0 left-0 w-1 opacity-40", a.bar)} aria-hidden />
        <div className="h-7 w-7 animate-pulse rounded-lg bg-muted" />
        <div className="mt-2.5 h-7 w-28 animate-pulse rounded bg-muted" />
        <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-auto space-y-1.5 pt-3">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  const Tag = onClick ? "button" : "div";
  const showProgress = typeof progress === "number";
  const clamped = showProgress ? Math.max(0, Math.min(1, progress!)) : 0;

  return (
    <Tag
      {...(onClick ? { onClick, type: "button" as const } : {})}
      title={title}
      className={cn(
        "group relative flex h-full min-h-[136px] flex-col overflow-hidden rounded-2xl border border-[#B3BFF6]/50 bg-card p-4 pl-5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5",
        a.glow,
        onClick && "cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30",
      )}
    >
      {/* Semantic left accent strip */}
      <span className={cn("absolute inset-y-0 left-0 w-1", a.bar)} aria-hidden />

      {/* Category icon + uppercase label */}
      <div className="flex items-center gap-2">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", a.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      </div>

      {/* Prominent primary metric + short description */}
      <p className={cn("mt-2.5 font-display text-[26px] font-extrabold leading-none tracking-tight tabular-nums transition-colors", a.value)}>
        {primaryValue}
      </p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{primaryDescription}</p>

      {/* Supporting metrics + progress, pinned to the bottom for equal-height cards */}
      <div className="mt-auto space-y-1.5 pt-3">
        {showProgress && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={cn("h-full rounded-full transition-all duration-500", progressAlert ? "bg-[#D96A82]" : a.fill)}
              style={{ width: `${clamped > 0 ? Math.max(clamped * 100, 2) : 0}%` }}
            />
          </div>
        )}
        <div className="space-y-1">
          <SupportMetric s={support[0]} />
          <SupportMetric s={support[1]} />
        </div>
      </div>
    </Tag>
  );
}

/* ── The four consolidated cards, driven by ONE KpiSummary ───────────────── */
export interface KpiCardDrilldowns {
  onRevenue?: () => void;
  onInvoices?: () => void;
  onTotalLeads?: () => void;
  onQualified?: () => void;
  onConverted?: () => void;
  onNotConverted?: () => void;
  onFollowUps?: () => void;
  onOverdue?: () => void;
}

export function KpiSummaryRow({
  summary, loading, drilldowns,
}: {
  summary: KpiSummary;
  loading?: boolean;
  drilldowns?: KpiCardDrilldowns;
}) {
  const d = drilldowns ?? {};
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1 — Revenue Performance */}
      <KpiPerformanceCard
        label="Revenue Performance"
        icon={IndianRupee}
        accent="emerald"
        primaryValue={formatINR(summary.netRevenue)}
        primaryDescription="Net Revenue Won"
        title="Net Revenue Won = finalized (paid) invoices linked via Lead → Ticket → Invoice, minus completed refunds."
        onClick={d.onRevenue}
        loading={loading}
        support={[
          { label: "Invoices", value: formatNumber(summary.invoiceCount), onClick: d.onInvoices },
          { label: "Avg / Invoice", value: summary.invoiceCount > 0 ? formatINR(Math.round(summary.avgRevenuePerInvoice)) : "—" },
        ]}
      />

      {/* 2 — Lead Performance */}
      <KpiPerformanceCard
        label="Lead Performance"
        icon={Users}
        accent="blue"
        primaryValue={formatNumber(summary.totalLeads)}
        primaryDescription="Total Leads"
        title="Total Leads = distinct leads created in the selected period and store scope. Qualified = leads meeting the canonical qualification rule."
        onClick={d.onTotalLeads}
        loading={loading}
        progress={summary.qualificationRate}
        support={[
          { label: "Qualified Leads", value: formatNumber(summary.qualifiedLeads), onClick: d.onQualified },
          { label: "Qualification Rate", value: summary.totalLeads > 0 ? pct(summary.qualificationRate) : "—" },
        ]}
      />

      {/* 3 — Conversion Performance */}
      <KpiPerformanceCard
        label="Conversion Performance"
        icon={Target}
        accent="indigo"
        primaryValue={formatNumber(summary.convertedLeads)}
        primaryDescription="Converted Leads"
        title="Converted = distinct leads that reached the canonical won/converted outcome. Conversion Rate = converted ÷ total leads."
        onClick={d.onConverted}
        loading={loading}
        progress={summary.conversionRate}
        support={[
          { label: "Conversion Rate", value: summary.totalLeads > 0 ? pct(summary.conversionRate) : "—" },
          { label: "Not Converted", value: formatNumber(summary.notConverted), onClick: d.onNotConverted },
        ]}
      />

      {/* 4 — Follow-up Performance */}
      <KpiPerformanceCard
        label="Follow-up Performance"
        icon={CalendarClock}
        accent="amber"
        primaryValue={formatNumber(summary.totalFollowUps)}
        primaryDescription="Total Follow-ups"
        title="Total Follow-ups = distinct follow-up records (scheduled + completed). Overdue = open and past due (datetime-precise)."
        onClick={d.onFollowUps}
        loading={loading}
        progress={summary.overdueRate}
        progressAlert={summary.overdueFollowUps > 0}
        support={[
          { label: "Overdue Follow-ups", value: formatNumber(summary.overdueFollowUps), onClick: d.onOverdue, alert: summary.overdueFollowUps > 0 },
          { label: "Overdue Rate", value: summary.totalFollowUps > 0 ? pct(summary.overdueRate) : "—" },
        ]}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   KPI CARD — compact card with icon chip, trend pill and a real sparkline.
   Matches the reference row (six balanced cards). The trend pill + sparkline
   only render when a VALID comparison / ≥2 months of real data exist.
   ════════════════════════════════════════════════════════════════════════ */

type Tone = "blue" | "emerald" | "amber" | "violet" | "rose" | "overdue";

/* Each tone carries: the icon CHIP (soft tint + icon colour), the sparkline/
   icon stroke colour, a left ACCENT BAR, the headline VALUE colour, a hover
   GLOW, and the trend-pill up/down styles. `bar` + `value` give every card a
   clear semantic colour (not a flat monochrome strip) and keep the Individual
   KPI row visually consistent with the All-Agents summary cards. */
const TONE: Record<Tone, { chip: string; icon: string; spark: string; bar: string; value: string; glow: string; pillUp: string; pillDown: string }> = {
  blue:    { chip: "bg-[#EEF1FD] text-[#4361EE]", icon: "#4361EE", spark: "#4361EE", bar: "bg-[#4361EE]", value: "text-[#2A3BA3]", glow: "hover:shadow-[0_8px_24px_-10px_rgba(67,97,238,0.3)] hover:border-[#4361EE]/40", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", icon: "#10B981", spark: "#10B981", bar: "bg-emerald-500", value: "text-emerald-700", glow: "hover:shadow-[0_8px_24px_-10px_rgba(16,185,129,0.3)] hover:border-emerald-400/50", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  amber:   { chip: "bg-amber-50 text-amber-600", icon: "#F59E0B", spark: "#F59E0B", bar: "bg-amber-500", value: "text-amber-700", glow: "hover:shadow-[0_8px_24px_-10px_rgba(245,158,11,0.3)] hover:border-amber-400/50", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  violet:  { chip: "bg-violet-50 text-violet-600", icon: "#8B5CF6", spark: "#8B5CF6", bar: "bg-violet-500", value: "text-violet-700", glow: "hover:shadow-[0_8px_24px_-10px_rgba(139,92,246,0.3)] hover:border-violet-400/50", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  rose:    { chip: "bg-[#FBEDF0] text-[#C4506B]", icon: "#D96A82", spark: "#D96A82", bar: "bg-[#D96A82]", value: "text-[#C4506B]", glow: "hover:shadow-[0_8px_24px_-10px_rgba(217,106,130,0.3)] hover:border-[#D96A82]/50", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
  overdue: { chip: "bg-[#FBEDF0] text-[#C4506B]", icon: "#D96A82", spark: "#D96A82", bar: "bg-[#D96A82]", value: "text-[#C4506B]", glow: "hover:shadow-[0_8px_24px_-10px_rgba(217,106,130,0.3)] hover:border-[#D96A82]/50", pillUp: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", pillDown: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60" },
};

/* ════════════════════════════════════════════════════════════════════════
   CONVERSION SUMMARY — three insight cards filling the panel vertically.
   The section is designed to match the height of its sibling panels
   (Lead Conversion Funnel + Lead Mix) via flex distribution. Each metric
   block has equal height/width so none dominates visually.
   ════════════════════════════════════════════════════════════════════════ */

function InsightCard({
  icon: Icon, label, value, sub, tone = "blue", overdueSub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  overdueSub?: string;
}) {
  const t = TONE[tone];
  return (
    <div className="flex flex-col rounded-xl border border-border bg-muted/20 p-3.5">
      {/* Icon chip + label on one line; label wraps to at most 2 lines, reserved height keeps all cards aligned */}
      <div className="flex items-start gap-2">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", t.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-h-[2.1em] text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{label}</span>
      </div>
      <p className="mt-2.5 font-display text-[24px] font-extrabold leading-none tabular-nums text-foreground">{value}</p>
      <div className="mt-1.5">
        {sub && <p className="text-[11px] leading-snug text-muted-foreground">{sub}</p>}
        {overdueSub && <p className="mt-0.5 text-[11px] font-semibold text-[#B42318]">{overdueSub}</p>}
      </div>
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
    <PerfSection title="Conversion Summary" subtitle="Key metrics for your lead performance" className="flex flex-col">
      {/* Three equally-weighted, COMPACT metric blocks */}
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
          label="Revenue / Converted Lead"
          tone="emerald"
          value={cs.revenuePerConverted == null ? "N/A" : formatINR(Math.round(cs.revenuePerConverted))}
          sub={cs.revenuePerConverted == null ? "No conversions yet" : `From ${cs.converted} conversion${cs.converted !== 1 ? "s" : ""}`}
        />
        <InsightCard
          icon={icons.followUp}
          label="Pending Follow-ups"
          tone={cs.overdueFollowUp > 0 ? "overdue" : "amber"}
          value={String(cs.pendingFollowUp)}
          sub={cs.pendingFollowUp > 0 ? "Action required" : "All caught up"}
          overdueSub={cs.overdueFollowUp > 0 ? `${cs.overdueFollowUp} overdue` : undefined}
        />
      </div>
      {/* Compact supporting context strip pinned to the bottom to fill the panel */}
      <div className="mt-auto flex items-center gap-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span>Qualified <strong className="ml-0.5 font-bold tabular-nums text-foreground">{cs.qualified}</strong></span>
        <span className="h-3 w-px bg-border" />
        <span>Converted <strong className="ml-0.5 font-bold tabular-nums text-foreground">{cs.convertedFromQualified}</strong></span>
        {cs.overdueFollowUp > 0 && (
          <>
            <span className="h-3 w-px bg-border" />
            <span>Overdue <strong className="ml-0.5 font-bold tabular-nums text-[#B42318]">{cs.overdueFollowUp}</strong></span>
          </>
        )}
      </div>
    </PerfSection>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   LEAD CONVERSION FUNNEL — horizontal bars, each labelled with count + share.
   ════════════════════════════════════════════════════════════════════════ */

/* Coherent colour progression — primary blue → secondary blue → indigo → green.
   NOT a different bright colour per stage; the progression reads as one journey. */
const FUNNEL_TONE: Record<string, string> = {
  total: "bg-[#4361EE]",      // primary blue
  contacted: "bg-[#60A5FA]",  // secondary blue
  qualified: "bg-[#8B5CF6]",  // indigo/violet
  converted: "bg-[#10B981]",  // green (outcome)
};

export function LeadConversionFunnelSection({ perf }: { perf: AgentPerformance }) {
  const stages = funnelStages(perf);
  const revenue = funnelRevenueOutcome(perf);
  const empty = perf.funnel.total === 0;
  return (
    <PerfSection title="Lead Conversion Funnel" subtitle="How leads progress through your pipeline" className="flex flex-col">
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-[12px] text-muted-foreground">No lead activity yet</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {/* Lead-count funnel — fixed alignment columns so counts/percentages line up */}
          <div className="flex-1 space-y-3">
            {stages.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-[72px] shrink-0 text-[11.5px] font-medium text-muted-foreground">{s.label}</span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full transition-all", FUNNEL_TONE[s.key])}
                    style={{ width: `${s.count > 0 ? Math.max(s.shareOfTotal * 100, 3) : 0}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[13px] font-bold tabular-nums text-foreground">{s.count}</span>
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {perf.funnel.total > 0 ? pct(s.shareOfTotal) : "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Commercial outcome — revenue (₹) shown SEPARATELY from the lead-count funnel */}
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Revenue Won</p>
              <p className="mt-1 font-display text-[22px] font-extrabold leading-none tabular-nums text-emerald-600">
                {formatINR(revenue.revenueWon)}
              </p>
            </div>
            <p className="pb-0.5 text-right text-[11px] text-muted-foreground">
              From {revenue.invoiceCount} finalized {revenue.invoiceCount === 1 ? "invoice" : "invoices"}
            </p>
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
    <PerfSection title="Lead Mix (by Service Route)" subtitle="Distribution of your converted leads" className="flex flex-col">
      {mix.convertedTotal === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-[12px] text-muted-foreground">No converted leads yet</p>
        </div>
      ) : (
        <div className="flex-1">
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
        </div>
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
