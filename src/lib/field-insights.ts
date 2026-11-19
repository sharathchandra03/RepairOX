/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Insights engine (pure, no React, no I/O).
   One place that turns the RLS/store-scoped trips into:
     • rows per dimension (Store · Field Engineer · Sales Agent · Lead Source ·
       Trip type) with counts, rates and finalized business,
     • the previous comparable window (for "vs previous period"),
     • a time series per entity for the trend comparison.
   It reuses the canonical predicates (summarize / tripGroupOf / groupKey /
   tripDateOf), so every number agrees with the trip list and the overview.
   Business = finalized (paid, non-proforma) invoices, each counted once.
   ────────────────────────────────────────────────────────────────────────── */
import type { FieldJob } from "@/lib/field-data";
import { summarize } from "@/lib/field-reports";
import {
  groupKey, tripDateOf, tripGroupOf, TRIP_GROUP_LABEL, GROUP_BY_LABEL, isCompleted,
  type AggregateCtx, type DateBounds, type DashPreset, type GroupBy, type TripGroup,
} from "@/lib/field-dashboard";

export type InsightBy = GroupBy | "type";
export const INSIGHT_BY_LABEL: Record<InsightBy, string> = { ...GROUP_BY_LABEL, type: "Trip type" };

export type MetricKey = "trips" | "completed" | "business" | "failed" | "delayed" | "completionRate" | "onTimeRate" | "avgPickupHours";
export interface MetricDef { key: MetricKey; label: string; short: string; kind: "count" | "money" | "pct" | "hours"; color: string; higherIsBetter: boolean }
export const METRICS: MetricDef[] = [
  { key: "trips", label: "Trips", short: "Trips", kind: "count", color: "#4361EE", higherIsBetter: true },
  { key: "completed", label: "Completed", short: "Done", kind: "count", color: "#10B981", higherIsBetter: true },
  { key: "business", label: "Business", short: "Business", kind: "money", color: "#F59E0B", higherIsBetter: true },
  { key: "completionRate", label: "Completion %", short: "Done %", kind: "pct", color: "#8B5CF6", higherIsBetter: true },
  { key: "onTimeRate", label: "On-time %", short: "On-time", kind: "pct", color: "#14B8A6", higherIsBetter: true },
  { key: "failed", label: "Failed", short: "Failed", kind: "count", color: "#E11D48", higherIsBetter: false },
  { key: "delayed", label: "Delayed", short: "Delayed", kind: "count", color: "#F97316", higherIsBetter: false },
  { key: "avgPickupHours", label: "Avg pickup time", short: "Avg pickup", kind: "hours", color: "#0EA5E9", higherIsBetter: false },
];
export const metricDef = (k: MetricKey) => METRICS.find((m) => m.key === k)!;

export interface InsightRow {
  key: string; label: string;
  trips: number; pickup: number; onsite: number; drop: number;
  completed: number; failed: number; delayed: number; unassigned: number; cancelled: number;
  completionRate: number | null; onTimeRate: number | null; avgPickupHours: number | null;
  business: number | null; invoices: number;
  leadTrips: number; ticketed: number;
  jobIds: string[];
}

export function keyOf(j: FieldJob, by: InsightBy, ctx: AggregateCtx): { key: string; label: string } {
  if (by === "type") { const g = tripGroupOf(j); return { key: g, label: TRIP_GROUP_LABEL[g] }; }
  return groupKey(j, by, ctx);
}

function rowOf(key: string, label: string, jobs: FieldJob[], ctx: AggregateCtx, now: Date): InsightRow {
  const s = summarize(jobs, ctx, now);
  const live = jobs.filter((j) => j.status !== "cancelled");
  const cnt = (g: TripGroup) => live.filter((j) => tripGroupOf(j) === g).length;
  return {
    key, label, trips: s.total, pickup: cnt("pickup"), onsite: cnt("onsite"), drop: cnt("drop"),
    completed: s.completed, failed: s.failedPickup + s.failedDrop, delayed: s.delayed, unassigned: s.unassigned, cancelled: s.cancelled,
    completionRate: s.completionRate, onTimeRate: s.onTimeRate, avgPickupHours: s.avgPickupHours,
    business: s.business, invoices: s.invoices,
    leadTrips: live.filter((j) => !!j.leadId).length, ticketed: live.filter((j) => !!j.linkedTicketId).length,
    jobIds: jobs.map((j) => j.id),
  };
}

/** One row per entity of `by` (cancelled-only entities kept so nothing vanishes). */
export function insightRows(jobs: FieldJob[], by: InsightBy, ctx: AggregateCtx, now = new Date()): InsightRow[] {
  const groups = new Map<string, { label: string; jobs: FieldJob[] }>();
  for (const j of jobs) {
    const { key, label } = keyOf(j, by, ctx);
    const g = groups.get(key) ?? { label, jobs: [] };
    g.jobs.push(j); groups.set(key, g);
  }
  return [...groups].map(([k, g]) => rowOf(k, g.label, g.jobs, ctx, now))
    .sort((a, b) => (b.business ?? -1) - (a.business ?? -1) || b.trips - a.trips || a.label.localeCompare(b.label));
}
export const totalRow = (jobs: FieldJob[], ctx: AggregateCtx, now = new Date()) => rowOf("__total", "Total", jobs, ctx, now);

export const metricValue = (r: InsightRow | null | undefined, k: MetricKey): number | null => (r ? (r[k] as number | null) : null);

export function formatMetric(v: number | null, k: MetricKey): string {
  if (v == null) return "—";
  const d = metricDef(k);
  if (d.kind === "money") return `₹${Math.round(v).toLocaleString("en-IN")}`;
  if (d.kind === "pct") return `${v}%`;
  if (d.kind === "hours") return `${v}h`;
  return String(v);
}
/** Compact money for chart labels (₹1.2L, ₹45k). */
export function shortMetric(v: number | null, k: MetricKey): string {
  if (v == null) return "—";
  if (metricDef(k).kind !== "money") return formatMetric(v, k);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}

/* ─── Previous comparable window ─────────────────────────────────────── */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

/** The window just before `b` with the same shape (calendar month/year when the
 *  preset is a month/year, else the same number of days). Null for "All". */
export function previousBounds(preset: DashPreset, b: DateBounds): DateBounds | null {
  if (!b.from || !b.to) return null;
  const f = parse(b.from), t = parse(b.to);
  if (preset === "month" || preset === "lastmonth") {
    return { from: ymd(new Date(f.getFullYear(), f.getMonth() - 1, 1)), to: ymd(new Date(f.getFullYear(), f.getMonth(), 0)) };
  }
  if (preset === "year") return { from: `${f.getFullYear() - 1}-01-01`, to: `${f.getFullYear() - 1}-12-31` };
  const days = Math.round((t.getTime() - f.getTime()) / 864e5) + 1;
  return { from: ymd(new Date(f.getFullYear(), f.getMonth(), f.getDate() - days)), to: ymd(new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1)) };
}
export function boundsLabel(b: DateBounds | null): string {
  if (!b || !b.from || !b.to) return "All time";
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const f = parse(b.from), t = parse(b.to);
  return b.from === b.to ? f.toLocaleDateString("en-IN", { ...o, year: "numeric" })
    : `${f.toLocaleDateString("en-IN", o)} – ${t.toLocaleDateString("en-IN", { ...o, year: "numeric" })}`;
}
export function pctDelta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/* ─── Time series per entity ─────────────────────────────────────────── */
export interface TrendBucket { key: string; label: string; from: string; to: string }
/** Day buckets for windows up to 62 days, else month buckets. "All" spans the data. */
export function trendBuckets(jobs: FieldJob[], b: DateBounds, today = new Date()): TrendBucket[] {
  let from = b.from, to = b.to;
  if (!from || !to) {
    const ds = jobs.map(tripDateOf).filter(Boolean).sort();
    from = from ?? ds[0] ?? ymd(today); to = to ?? (ds[ds.length - 1] && ds[ds.length - 1] > ymd(today) ? ds[ds.length - 1] : ymd(today));
  }
  const f = parse(from), t = parse(to);
  const days = Math.round((t.getTime() - f.getTime()) / 864e5) + 1;
  const out: TrendBucket[] = [];
  if (days <= 62) {
    for (let i = 0; i < days; i++) {
      const d = new Date(f.getFullYear(), f.getMonth(), f.getDate() + i);
      out.push({ key: ymd(d), label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), from: ymd(d), to: ymd(d) });
    }
  } else {
    let d = new Date(f.getFullYear(), f.getMonth(), 1);
    while (d <= t && out.length < 36) {
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), from: ymd(d), to: ymd(end) });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }
  return out;
}
/** value[entityKey][bucketIndex] for one metric. */
export function trendSeries(jobs: FieldJob[], by: InsightBy, keys: string[], metric: MetricKey, buckets: TrendBucket[], ctx: AggregateCtx, now = new Date()): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  const want = new Set(keys);
  const per = new Map<string, FieldJob[][]>();
  for (const k of keys) per.set(k, buckets.map(() => []));
  for (const j of jobs) {
    const k = keyOf(j, by, ctx).key;
    if (!want.has(k)) continue;
    const d = tripDateOf(j);
    const i = buckets.findIndex((b) => d >= b.from && d <= b.to);
    if (i >= 0) per.get(k)![i].push(j);
  }
  for (const k of keys) out[k] = per.get(k)!.map((js) => (js.length ? metricValue(rowOf(k, k, js, ctx, now), metric) : metric === "trips" || metric === "completed" || metric === "failed" || metric === "delayed" ? 0 : null));
  return out;
}

export const completedOf = (jobs: FieldJob[]) => jobs.filter(isCompleted).length;
