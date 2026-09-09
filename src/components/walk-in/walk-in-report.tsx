"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Report — an operational + analytics workspace.
   Activity & conversion only. NO revenue / invoice / sales-amount metrics.

   TOP (table sizes to its own content; metrics fill the right):
   ┌──────────────────────────────┬────────────────────────────────┐
   │  Date-wise Breakdown (~58%)  │  Metrics / Insights (~42%)      │
   │  (sharp business table)      │  · Period comparison (MoM/YoY)  │
   │  DATE·DIRECT·MKT·TOT·WON·SR  │  · Best source · Conversion     │
   │                              │  · Trend insight                │
   └──────────────────────────────┴────────────────────────────────┘
   BOTTOM (FULL width — one connected analytics workspace):
   ┌───────────────────────────────────────────────────────────────┐
   │  Walk-In Trend — large horizontal chart                        │
   ├───────────────────────────────┬───────────────────────────────┤
   │  Source Comparison            │  Status Distribution           │
   └───────────────────────────────┴───────────────────────────────┘

   Every panel is derived from the SAME filtered `rows` the table shows, so the
   report can never diverge. WON uses the single shared definition
   `isWalkInWon`. Month-over-Month / Year-over-Year comparisons additionally read
   the full unfiltered dataset (`allRows`) together with the selected range so
   they can compute the correct previous window (see `previousWalkInPeriod`).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import {
  UserCheck, Megaphone, Layers, Trophy, TrendingUp, TrendingDown,
  ArrowRight, Minus, Award, BarChart3, Target, PieChart as PieIcon, CalendarDays,
} from "lucide-react";
import {
  type WalkIn, type WalkInStatus, isWalkInWon, WALKIN_STATUS_LABEL,
} from "@/lib/mock-data";
import {
  type WalkInDateRange, type WalkInComparisonMode, type DayRange,
  resolveWalkInRange, previousWalkInPeriod, isInDayRange, fmtRangeLabel,
} from "@/lib/walk-in-data";
import { LineChartView } from "@/components/reports/report-charts";
import type { SeriesPoint } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/* ─── small formatting helpers ─────────────────────────────────────────── */

/** Success rate — Won ÷ Total × 100, one decimal, with a % sign; "—" when n/a. */
function successRate(won: number, total: number): string {
  if (total <= 0) return "—";
  return `${((won / total) * 100).toFixed(1)}%`;
}
function srValue(won: number, total: number): number {
  return total > 0 ? (won / total) * 100 : 0;
}

/** Compact date label, e.g. "1 Jan 26". */
function fmtDay(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

/* ─── shared metric shape ──────────────────────────────────────────────── */

type Metrics = { direct: number; marketing: number; total: number; won: number; sr: number };

function computeMetrics(rows: WalkIn[]): Metrics {
  const direct = rows.filter((w) => (w.type ?? "direct") === "direct").length;
  const marketing = rows.filter((w) => w.type === "sales").length;
  const won = rows.filter((w) => isWalkInWon(w)).length;
  const total = rows.length;
  return { direct, marketing, total, won, sr: srValue(won, total) };
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════════════════ */

export function WalkInReport({
  rows,
  allRows = rows,
  dateRange = "all",
  customFrom,
  customTo,
  onCustomRangeChange,
}: {
  /** The filtered dataset — same array the table renders. Single source of truth. */
  rows: WalkIn[];
  /** The full unfiltered dataset — used only to compute comparison windows. */
  allRows?: WalkIn[];
  dateRange?: WalkInDateRange;
  customFrom?: string;
  customTo?: string;
  /** Push a custom [from,to] range back up so the LEFT table + KPIs sync. */
  onCustomRangeChange?: (from: string, to: string) => void;
}) {
  const kpis = useMemo(() => computeMetrics(rows), [rows]);

  /* Date-wise breakdown — one row per calendar date, newest first. */
  const byDate = useMemo(() => {
    const map = new Map<string, { date: string; direct: number; marketing: number; total: number; won: number }>();
    for (const w of rows) {
      const key = w.date || "";
      const entry = map.get(key) || { date: key, direct: 0, marketing: 0, total: 0, won: 0 };
      if (w.type === "sales") entry.marketing += 1;
      else entry.direct += 1;
      entry.total += 1;
      if (isWalkInWon(w)) entry.won += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rows]);

  /* Comparison mode + calendar live here so BOTH the top-right metrics and the
     bottom full-width analytics share one control (single filter context). */
  const [mode, setMode] = useState<WalkInComparisonMode>("mom");
  const [showCalendar, setShowCalendar] = useState(dateRange === "custom");

  const currentRange = useMemo(
    () => resolveWalkInRange(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo],
  );
  const prevRange = useMemo(() => previousWalkInPeriod(currentRange, mode), [currentRange, mode]);
  const prevMetrics = useMemo(() => {
    if (!prevRange) return null;
    const prevRows = allRows.filter((w) => isInDayRange(w.date, prevRange));
    return computeMetrics(prevRows);
  }, [allRows, prevRange]);

  return (
    <div className="-mt-1 space-y-5">
      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={UserCheck} label="Direct" value={kpis.direct} tone="sky" share={kpis.total ? kpis.direct / kpis.total : 0} />
        <KpiCard icon={Megaphone} label="Marketing" value={kpis.marketing} tone="violet" share={kpis.total ? kpis.marketing / kpis.total : 0} />
        <KpiCard icon={Layers} label="Total" value={kpis.total} tone="brand" share={1} />
        <KpiCard icon={Trophy} label="Won" value={kpis.won} tone="emerald" share={kpis.total ? kpis.won / kpis.total : 0} />
        <SrCard value={kpis.sr} won={kpis.won} total={kpis.total} />
      </div>

      {/* ── Comparison + date-range control bar (drives comparison + calendar) ── */}
      <ControlBar
        mode={mode}
        onMode={setMode}
        dateRange={dateRange}
        showCalendar={showCalendar}
        onToggleCalendar={() => setShowCalendar((s) => !s)}
        customFrom={customFrom}
        customTo={customTo}
        onCustomRangeChange={onCustomRangeChange}
      />

      {/* ══ TOP — Table (left) + compact metrics/insights (right) ══
          Table sizes to its own content (self-start) so a short table never
          leaves an empty column; the metrics stack fills the right. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
        {/* LEFT — "What happened?" */}
        <BreakdownTable byDate={byDate} kpis={kpis} />

        {/* RIGHT — compact high-value analytical summary */}
        <div className="flex min-w-0 flex-col gap-4 self-start">
          <ComparisonCard
            mode={mode}
            current={kpis}
            previous={prevMetrics}
            currentRange={currentRange}
            prevRange={prevRange}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <BestSourceCard rows={rows} kpis={kpis} />
            <ConversionCard won={kpis.won} total={kpis.total} />
          </div>
          <TrendInsightCard mode={mode} current={kpis} previous={prevMetrics} />
        </div>
      </div>

      {/* ══ BOTTOM — FULL-WIDTH analytics workspace ══
          Spans the entire report width, visually connecting left and right. */}
      <div className="space-y-5">
        {/* Primary large horizontal trend chart */}
        <TrendCard byDate={byDate} large />

        {/* Source comparison + Status distribution side by side */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SourceComparison direct={kpis.direct} marketing={kpis.marketing} />
          <StatusDistribution rows={rows} />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Control bar — comparison mode + custom-date calendar (shared context)
   ══════════════════════════════════════════════════════════════════════════ */

function ControlBar({
  mode, onMode, dateRange, showCalendar, onToggleCalendar, customFrom, customTo, onCustomRangeChange,
}: {
  mode: WalkInComparisonMode;
  onMode: (m: WalkInComparisonMode) => void;
  dateRange: WalkInDateRange;
  showCalendar: boolean;
  onToggleCalendar: () => void;
  customFrom?: string;
  customTo?: string;
  onCustomRangeChange?: (from: string, to: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <BarChart3 className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Walk-In Analytics</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onCustomRangeChange && (
            <button
              type="button"
              onClick={onToggleCalendar}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition",
                dateRange === "custom" || showCalendar
                  ? "border-[#4361EE]/30 bg-[#EEF1FD] text-[#4361EE]"
                  : "border-border bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
              title="Pick a custom date range"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {dateRange === "custom" ? "Custom Range" : "Date Range"}
            </button>
          )}
          <label className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">Comparison</span>
            <select
              value={mode}
              onChange={(e) => onMode(e.target.value as WalkInComparisonMode)}
              className="cursor-pointer bg-transparent text-[12px] font-semibold text-[#4361EE] outline-none"
            >
              {COMPARISON_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {onCustomRangeChange && showCalendar && (
        <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Select date range
            </span>
            <span className="text-[11px] text-muted-foreground">Syncs table + KPIs + charts</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom ?? ""}
              max={customTo || undefined}
              onChange={(e) => onCustomRangeChange(e.target.value, customTo ?? e.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20"
            />
            <span className="text-[12px] text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo ?? ""}
              min={customFrom || undefined}
              onChange={(e) => onCustomRangeChange(customFrom ?? e.target.value, e.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LEFT — Date-wise Breakdown (sharp business table, Tickets/Invoice edges)
   ══════════════════════════════════════════════════════════════════════════ */

function BreakdownTable({
  byDate, kpis,
}: {
  byDate: { date: string; direct: number; marketing: number; total: number; won: number }[];
  kpis: Metrics;
}) {
  return (
    <section className="flex min-w-0 flex-col self-start overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* compact header */}
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Date-wise Breakdown</h3>
          <p className="text-[11px] text-muted-foreground">Direct + Marketing = Total per day · SR = Won ÷ Total × 100</p>
        </div>
      </div>

      <div className="[overflow-x:clip]">
        <table className="w-full table-fixed text-[13px]">
          <colgroup>
            <col className="w-[34%]" />{/* Date — wider */}
            <col className="w-[13%]" />{/* Direct */}
            <col className="w-[15%]" />{/* Marketing */}
            <col className="w-[12%]" />{/* Total */}
            <col className="w-[11%]" />{/* Won */}
            <col className="w-[15%]" />{/* SR */}
          </colgroup>
          <thead className="bg-[#D6DDFB] border-b-2 border-[#4361EE]/25">
            <tr className="text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-2 py-3 text-right">Direct</th>
              <th className="px-2 py-3 text-right">Mkt</th>
              <th className="px-2 py-3 text-right">Total</th>
              <th className="px-2 py-3 text-right">Won</th>
              <th className="px-4 py-3 text-right">SR</th>
            </tr>
          </thead>
          <tbody>
            {byDate.map((d) => (
              <tr key={d.date || "unknown"} className="border-t border-border transition hover:bg-muted/40">
                <td className="px-4 py-2.5 whitespace-nowrap font-medium text-foreground">{fmtDay(d.date)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{d.direct}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{d.marketing}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-foreground">{d.total}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-medium text-emerald-600">{d.won}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">{successRate(d.won, d.total)}</td>
              </tr>
            ))}
          </tbody>
          {byDate.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#4361EE]/20 bg-[#EEF1FD]/60 font-bold text-[#4361EE]">
                <td className="px-4 py-3 text-left">Total</td>
                <td className="px-2 py-3 text-right tabular-nums">{kpis.direct}</td>
                <td className="px-2 py-3 text-right tabular-nums">{kpis.marketing}</td>
                <td className="px-2 py-3 text-right tabular-nums">{kpis.total}</td>
                <td className="px-2 py-3 text-right tabular-nums">{kpis.won}</td>
                <td className="px-4 py-3 text-right tabular-nums">{successRate(kpis.won, kpis.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {byDate.length === 0 && (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-medium text-foreground">No Walk-Ins in this period</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Try a different date range to see the breakdown.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RIGHT — Walk-In Analytics
   ══════════════════════════════════════════════════════════════════════════ */

const COMPARISON_MODES: { label: string; value: WalkInComparisonMode }[] = [
  { label: "Month-over-Month", value: "mom" },
  { label: "Year-over-Year", value: "yoy" },
  { label: "Trend", value: "trend" },
  { label: "Source Comparison", value: "source" },
  { label: "Conversion Analysis", value: "conversion" },
];

/* ─── Comparison card (Month-over-Month / Year-over-Year) ───────────────── */

function pctDelta(cur: number, prev: number): number | null {
  if (prev <= 0) return null; // avoid misleading / infinite percentages
  return ((cur - prev) / prev) * 100;
}

function DeltaPill({ delta, suffix = "%" }: { delta: number | null; suffix?: string }) {
  if (delta === null) {
    return <span className="text-[11px] font-medium text-muted-foreground">—</span>;
  }
  const up = delta > 0.05;
  const down = delta < -0.05;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls = up ? "text-emerald-600 bg-emerald-50" : down ? "text-rose-600 bg-rose-50" : "text-slate-500 bg-slate-100";
  const sign = up ? "+" : "";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", cls)}>
      <Icon className="h-3 w-3" />
      {sign}{delta.toFixed(1)}{suffix}
    </span>
  );
}

function ComparisonCard({
  mode, current, previous, currentRange, prevRange,
}: {
  mode: WalkInComparisonMode;
  current: Metrics;
  previous: Metrics | null;
  currentRange: DayRange | null;
  prevRange: DayRange | null;
}) {
  const isComparable = mode === "mom" || mode === "yoy";
  const title = mode === "yoy" ? "Year-over-Year" : "Month-over-Month";

  // Non-comparison modes (trend / source / conversion) — nudge toward MoM/YoY.
  if (!isComparable) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <h4 className="text-[13px] font-semibold text-foreground">Period Comparison</h4>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Choose <span className="font-medium text-foreground">Month-over-Month</span> or{" "}
          <span className="font-medium text-foreground">Year-over-Year</span> above to compare periods.
        </p>
      </div>
    );
  }

  // No comparison window available ("All" range) or no previous-period data.
  if (!currentRange || !prevRange) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {currentRange
            ? "No previous-period data available for comparison."
            : "Select a specific date range to compare periods."}
        </p>
      </div>
    );
  }

  const hasPrev = previous !== null && previous.total > 0;
  const rows: { label: string; cur: number; prev: number; pp?: boolean }[] = [
    { label: "Total", cur: current.total, prev: previous?.total ?? 0 },
    { label: "Direct", cur: current.direct, prev: previous?.direct ?? 0 },
    { label: "Marketing", cur: current.marketing, prev: previous?.marketing ?? 0 },
    { label: "Won", cur: current.won, prev: previous?.won ?? 0 },
    { label: "Success Rate", cur: current.sr, prev: previous?.sr ?? 0, pp: true },
  ];

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-[#EEF1FD] to-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
      </div>
      <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-md bg-white px-2 py-0.5 font-medium text-foreground shadow-sm">{fmtRangeLabel(currentRange)}</span>
        <ArrowRight className="h-3 w-3 shrink-0 rotate-180" />
        <span className="rounded-md bg-white/70 px-2 py-0.5">{fmtRangeLabel(prevRange)}</span>
      </div>

      {!hasPrev ? (
        <p className="rounded-lg bg-white/60 px-3 py-2 text-[12px] text-muted-foreground">
          No previous-period data available.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-[#EEF1FD]/60 text-[10px] font-bold uppercase tracking-wide text-[#4361EE]">
                <th className="px-3 py-1.5 text-left">Metric</th>
                <th className="px-2 py-1.5 text-right">Current</th>
                <th className="px-2 py-1.5 text-right">Previous</th>
                <th className="px-3 py-1.5 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const curDisplay = r.pp ? `${r.cur.toFixed(1)}%` : String(r.cur);
                const prevDisplay = r.pp ? `${r.prev.toFixed(1)}%` : String(r.prev);
                // Percentage-point delta for Success Rate; percentage delta otherwise.
                const delta = r.pp ? (r.cur - r.prev) : pctDelta(r.cur, r.prev);
                return (
                  <tr key={r.label} className="border-t border-border/70">
                    <td className="px-3 py-1.5 font-medium text-foreground">{r.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-foreground">{curDisplay}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{prevDisplay}</td>
                    <td className="px-3 py-1.5 text-right">
                      <DeltaPill delta={delta} suffix={r.pp ? " pp" : "%"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Chart #1 — Walk-In Volume Trend ──────────────────────────────────── */

function TrendCard({
  byDate, large = false,
}: {
  byDate: { date: string; total: number }[];
  /** When true, renders as the primary full-width bottom chart (taller). */
  large?: boolean;
}) {
  // Oldest → newest for a left-to-right time axis.
  const series: SeriesPoint[] = useMemo(() => {
    return [...byDate]
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .map((d) => ({ key: d.date, label: fmtDay(d.date), value: d.total }));
  }, [byDate]);

  const hasData = series.length > 0;
  const trendUp = series.length >= 2 && series[series.length - 1].value >= series[0].value;
  const chartHeight = large ? 320 : 200;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-[#4361EE]" /> Walk-In Trend
        </h4>
        <span className="text-[11px] text-muted-foreground">Total walk-ins per day · are volumes rising?</span>
      </div>
      {hasData ? (
        series.length === 1 ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <span className="font-display text-4xl font-bold tabular-nums text-[#4361EE]">{series[0].value}</span>
            <span className="text-[13px] text-muted-foreground">walk-in{series[0].value === 1 ? "" : "s"} on {series[0].label}</span>
          </div>
        ) : (
          <LineChartView data={series} height={chartHeight} />
        )
      ) : (
        <EmptyChart label="No walk-ins to chart in this period" tall={large} />
      )}
      {hasData && series.length >= 2 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {trendUp ? "Trending up over the selected period." : "Trending down over the selected period."}
        </p>
      )}
    </div>
  );
}

/* ─── Chart #2 — Direct vs Marketing source comparison ─────────────────── */

function SourceComparison({ direct, marketing }: { direct: number; marketing: number }) {
  const max = Math.max(direct, marketing, 1);
  const total = direct + marketing;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="mb-2 text-[13px] font-semibold text-foreground">Source Comparison</h4>
        <EmptyChart label="No walk-ins to compare" />
      </div>
    );
  }
  const bars = [
    { label: "Direct", value: direct, bar: "bg-sky-500", track: "bg-sky-100" },
    { label: "Marketing", value: marketing, bar: "bg-violet-500", track: "bg-violet-100" },
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <UserCheck className="h-4 w-4 text-[#4361EE]" /> Source Comparison
        </h4>
        <span className="text-[11px] text-muted-foreground">Where are walk-ins coming from?</span>
      </div>
      <div className="space-y-4">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span className="font-medium text-foreground">{b.label}</span>
              <span className="tabular-nums font-semibold text-foreground">
                {b.value}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  ({total ? Math.round((b.value / total) * 100) : 0}%)
                </span>
              </span>
            </div>
            <div className={cn("h-2.5 w-full overflow-hidden rounded-full", b.track)}>
              <div className={cn("h-full rounded-full transition-all duration-500", b.bar)} style={{ width: `${(b.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Chart #3 — Conversion (Total → Won) ──────────────────────────────── */

function ConversionCard({ won, total }: { won: number; total: number }) {
  const rate = srValue(won, total);
  const pct = Math.max(0, Math.min(100, rate));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <Target className="h-4 w-4 text-[#4361EE]" /> Conversion
      </h4>
      {total === 0 ? (
        <EmptyChart label="No walk-ins to convert" />
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Total</p>
              <p className="font-display text-2xl font-bold tabular-nums text-foreground">{total}</p>
            </div>
            <ArrowRight className="mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Won</p>
              <p className="font-display text-2xl font-bold tabular-nums text-emerald-600">{won}</p>
            </div>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-[#4361EE] to-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-center text-[12px] font-semibold text-foreground">
            {rate.toFixed(1)}% <span className="font-normal text-muted-foreground">success rate</span>
          </p>
        </>
      )}
    </div>
  );
}

/* ─── Chart #4 — Status distribution (Visitor / Enquiry / Converted Ticket) ── */

const STATUS_COLOR: Partial<Record<WalkInStatus, string>> = {
  visitor: "bg-slate-400",
  enquiry: "bg-violet-500",
  converted_ticket: "bg-[#4361EE]",
};

function StatusDistribution({ rows }: { rows: WalkIn[] }) {
  const dist = useMemo(() => {
    const counts = new Map<WalkInStatus, number>();
    for (const w of rows) {
      const s = w.status;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const total = rows.length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <PieIcon className="h-4 w-4 text-[#4361EE]" /> Status Distribution
        </h4>
        <span className="text-[11px] text-muted-foreground">What happens to walk-ins?</span>
      </div>
      {total === 0 ? (
        <EmptyChart label="No walk-ins to categorise" />
      ) : (
        <div className="space-y-3">
          {dist.map(({ status, count }) => (
            <div key={status}>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="truncate font-medium text-foreground">{WALKIN_STATUS_LABEL[status] ?? status}</span>
                <span className="tabular-nums font-semibold text-foreground">
                  {count}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({Math.round((count / total) * 100)}%)
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", STATUS_COLOR[status] ?? "bg-slate-400")}
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Insight card — Best performing source (by conversion rate) ───────── */

function BestSourceCard({ rows, kpis }: { rows: WalkIn[]; kpis: Metrics }) {
  const best = useMemo(() => {
    const directRows = rows.filter((w) => (w.type ?? "direct") === "direct");
    const marketingRows = rows.filter((w) => w.type === "sales");
    const stats = [
      { label: "Direct", total: directRows.length, won: directRows.filter(isWalkInWon).length },
      { label: "Marketing", total: marketingRows.length, won: marketingRows.filter(isWalkInWon).length },
    ].filter((s) => s.total > 0);
    if (stats.length === 0) return null;
    // Best is decided by conversion rate; volume is only the tie-breaker.
    stats.sort((a, b) => {
      const ra = srValue(a.won, a.total);
      const rb = srValue(b.won, b.total);
      if (rb !== ra) return rb - ra;
      return b.won - a.won;
    });
    const top = stats[0];
    return { ...top, sr: srValue(top.won, top.total) };
  }, [rows]);

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-[#EEF1FD] to-white p-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <Award className="h-4 w-4 text-amber-500" /> Best Performing Source
      </h4>
      {!best || kpis.won === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {kpis.total === 0 ? "No walk-ins in this period." : "No conversions yet to rank sources."}
        </p>
      ) : (
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-display text-xl font-bold text-[#4361EE]">{best.label}</p>
            <p className="text-[11px] text-muted-foreground">{best.won} won of {best.total}</p>
          </div>
          <p className="font-display text-lg font-bold tabular-nums text-emerald-600">{best.sr.toFixed(1)}%</p>
        </div>
      )}
    </div>
  );
}

/* ─── Insight card — Trend (data-driven, vs previous period) ───────────── */

function TrendInsightCard({
  mode, current, previous,
}: {
  mode: WalkInComparisonMode;
  current: Metrics;
  previous: Metrics | null;
}) {
  const insight = useMemo(() => {
    if ((mode !== "mom" && mode !== "yoy") || !previous || previous.total <= 0) return null;
    const label = mode === "mom" ? "previous month" : "same period last year";
    const totalDelta = pctDelta(current.total, previous.total);
    const wonDelta = pctDelta(current.won, previous.won);
    return { label, totalDelta, wonDelta };
  }, [mode, current, previous]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <TrendingUp className="h-4 w-4 text-[#4361EE]" /> Walk-In Trend
      </h4>
      {!insight ? (
        <p className="text-[12px] text-muted-foreground">
          Select Month-over-Month or Year-over-Year to see trend insights.
        </p>
      ) : (
        <ul className="space-y-1.5 text-[12px]">
          <li className="flex items-center gap-2">
            <DeltaPill delta={insight.totalDelta} />
            <span className="text-muted-foreground">Walk-Ins vs {insight.label}</span>
          </li>
          <li className="flex items-center gap-2">
            <DeltaPill delta={insight.wonDelta} />
            <span className="text-muted-foreground">Won conversions vs {insight.label}</span>
          </li>
        </ul>
      )}
    </div>
  );
}

/* ─── Shared empty-chart placeholder ───────────────────────────────────── */

function EmptyChart({ label, tall = false }: { label: string; tall?: boolean }) {
  return (
    <div className={cn(
      "grid place-items-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center",
      tall ? "py-24" : "py-8",
    )}>
      <BarChart3 className="mb-1 h-5 w-5 text-muted-foreground/50" />
      <p className="text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   KPI cards
   ══════════════════════════════════════════════════════════════════════════ */

const TONES: Record<string, { icon: string; bar: string }> = {
  sky:     { icon: "bg-sky-50 text-sky-600 ring-sky-200",             bar: "bg-sky-500" },
  violet:  { icon: "bg-violet-50 text-violet-600 ring-violet-200",     bar: "bg-violet-500" },
  brand:   { icon: "bg-[#4361EE] text-white ring-[#4361EE]",           bar: "bg-[#4361EE]" },
  emerald: { icon: "bg-emerald-50 text-emerald-600 ring-emerald-200",   bar: "bg-emerald-500" },
};

function KpiCard({
  icon: Icon, label, value, tone, share,
}: {
  icon: any; label: string; value: number; tone: keyof typeof TONES | string; share: number;
}) {
  const t = TONES[tone] ?? TONES.brand;
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl ring-1 ring-inset", t.icon)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight tabular-nums">{value}</span>
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-500", t.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SrCard({ value, won, total }: { value: number; won: number; total: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#4361EE] to-[#6366F1] p-4 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
          <TrendingUp className="h-[18px] w-[18px]" />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight tabular-nums">
          {total > 0 ? `${value.toFixed(1)}%` : "—"}
        </span>
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-white/80">Success Rate</p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-white/70 tabular-nums">{won} won of {total}</p>
    </div>
  );
}
