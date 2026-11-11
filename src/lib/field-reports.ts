/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field reporting (pure, no React, no I/O).

   Everything is derived from the (already store/RLS-scoped) trips in a date
   window; nothing is stored. Shares the Field dashboard predicates so the
   report, dashboards and trip table reconcile.

   • Window      = trip date (tripDateOf) inside the inclusive bounds.
   • Completion  = completed / (total − cancelled).
   • On-time     = pickup proof recorded on or before the scheduled pickup date.
   • Pickup time = createdAt → pickupProof.at (hours), only where both exist.
   • Business    = finalized (paid, non-proforma) invoices only, each once.
   ────────────────────────────────────────────────────────────────────────── */
import type { FieldJob, FieldJobStatus } from "@/lib/field-data";
import { isDelayed } from "@/lib/field-data";
import {
  inBounds, tripDateOf, tripGroupOf, isWarranty, isCompleted, isAssigned, TRIP_GROUP_LABEL,
  type AggregateCtx, type DateBounds, type TripGroup,
} from "@/lib/field-dashboard";

const HOUR = 3600000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

export function jobsInWindow(jobs: FieldJob[], b: DateBounds): FieldJob[] {
  return jobs.filter((j) => inBounds(tripDateOf(j), b));
}

function pickupHours(j: FieldJob): number | null {
  const at = j.pickupProof?.at;
  if (!at || !j.createdAt) return null;
  const d = new Date(at).getTime() - new Date(j.createdAt).getTime();
  return Number.isFinite(d) && d >= 0 ? d / HOUR : null;
}
function onTime(j: FieldJob): boolean | null {
  const at = j.pickupProof?.at;
  if (!at || !j.pickupDate) return null;
  return at.slice(0, 10) <= j.pickupDate;
}

export interface FieldSummary {
  total: number; open: number; completed: number; cancelled: number; assigned: number; unassigned: number;
  failedPickup: number; failedDrop: number; delayed: number;
  completionRate: number | null; onTimeRate: number | null; avgPickupHours: number | null;
  business: number | null; invoices: number; avgBusinessPerCompleted: number | null;
}

export function summarize(jobs: FieldJob[], ctx: Pick<AggregateCtx, "finalizedInvoiceOf">, now = new Date()): FieldSummary {
  const live = jobs.filter((j) => j.status !== "cancelled");
  const completed = live.filter(isCompleted);
  const seen = new Set<string>(); let biz = 0;
  for (const j of live) { const i = ctx.finalizedInvoiceOf(j); if (i && !seen.has(i.id)) { seen.add(i.id); biz += i.total; } }
  const ot = live.map(onTime).filter((x): x is boolean => x !== null);
  const ph = live.map(pickupHours).filter((x): x is number => x !== null);
  const a = avg(ph);
  return {
    total: live.length,
    open: live.filter((j) => !isCompleted(j) && j.status !== "failed_pickup" && j.status !== "failed_drop").length,
    completed: completed.length,
    cancelled: jobs.length - live.length,
    assigned: live.filter(isAssigned).length,
    unassigned: live.filter((j) => !isAssigned(j)).length,
    failedPickup: live.filter((j) => j.status === "failed_pickup").length,
    failedDrop: live.filter((j) => j.status === "failed_drop").length,
    delayed: live.filter((j) => isDelayed(j, now)).length,
    completionRate: pct(completed.length, live.length),
    onTimeRate: pct(ot.filter(Boolean).length, ot.length),
    avgPickupHours: a == null ? null : Math.round(a * 10) / 10,
    business: seen.size ? biz : null,
    invoices: seen.size,
    avgBusinessPerCompleted: seen.size && completed.length ? Math.round(biz / completed.length) : null,
  };
}

/* ─── Breakdowns ─────────────────────────────────────────────────────── */

export interface BreakdownRow {
  key: string; label: string; total: number; completed: number; failed: number; cancelled: number; delayed: number;
  completionRate: number | null; onTimeRate: number | null; avgPickupHours: number | null; business: number | null; jobIds: string[];
}

function breakdown(jobs: FieldJob[], keyOf: (j: FieldJob) => { key: string; label: string }, ctx: Pick<AggregateCtx, "finalizedInvoiceOf">, now: Date): BreakdownRow[] {
  const groups = new Map<string, { label: string; jobs: FieldJob[] }>();
  for (const j of jobs) {
    const { key, label } = keyOf(j);
    const g = groups.get(key) ?? { label, jobs: [] };
    g.jobs.push(j); groups.set(key, g);
  }
  const rows: BreakdownRow[] = [];
  for (const [key, g] of groups) {
    const s = summarize(g.jobs, ctx, now);
    rows.push({
      key, label: g.label, total: s.total, completed: s.completed, failed: s.failedPickup + s.failedDrop, cancelled: s.cancelled,
      delayed: s.delayed, completionRate: s.completionRate, onTimeRate: s.onTimeRate, avgPickupHours: s.avgPickupHours,
      business: s.business, jobIds: g.jobs.map((j) => j.id),
    });
  }
  return rows.sort((a, b) => (b.business ?? -1) - (a.business ?? -1) || b.total - a.total || a.label.localeCompare(b.label));
}

export const byNinja = (jobs: FieldJob[], ctx: Pick<AggregateCtx, "finalizedInvoiceOf">, now = new Date()) =>
  breakdown(jobs, (j) => j.ninjaId ? { key: j.ninjaId, label: j.ninjaName || "Field Engineer" } : j.dropNinjaId ? { key: j.dropNinjaId, label: j.dropNinjaName || "Field Engineer" } : { key: "unassigned", label: "Unassigned" }, ctx, now);

export const byStore = (jobs: FieldJob[], ctx: AggregateCtx, now = new Date()) =>
  breakdown(jobs, (j) => ctx.storeKeyOf(j), ctx, now);

export const byTripType = (jobs: FieldJob[], ctx: Pick<AggregateCtx, "finalizedInvoiceOf">, now = new Date()) =>
  breakdown(jobs, (j) => { const g: TripGroup = tripGroupOf(j); return { key: `${g}${isWarranty(j) ? ":w" : ""}`, label: `${TRIP_GROUP_LABEL[g]}${isWarranty(j) ? " · Warranty" : ""}` }; }, ctx, now);

export const bySource = (jobs: FieldJob[], ctx: Pick<AggregateCtx, "finalizedInvoiceOf">, now = new Date()) =>
  breakdown(jobs, (j) => { const s = (j.source || "").trim(); return { key: s.toLowerCase() || "unknown", label: s || "Unknown" }; }, ctx, now);

/* ─── Status mix & funnel ────────────────────────────────────────────── */

export interface StatusCount { status: FieldJobStatus; count: number }
export function statusMix(jobs: FieldJob[]): StatusCount[] {
  const m = new Map<FieldJobStatus, number>();
  for (const j of jobs) m.set(j.status, (m.get(j.status) ?? 0) + 1);
  return [...m.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
}

const RANK: Record<FieldJobStatus, number> = {
  pending_assignment: 0, assigned: 1, pickup_scheduled: 1, out_for_pickup: 2, picked_up: 2, at_store: 3, in_repair: 3,
  ready_for_drop: 3, drop_scheduled: 3, out_for_drop: 4, delivered: 4, completed: 4, cancelled: -1, failed_pickup: 1, failed_drop: 3,
};
export interface FunnelStep { key: string; label: string; count: number; pctOfTotal: number | null }
/** Lead-count funnel over non-cancelled trips: how far each trip got. */
export function funnel(jobs: FieldJob[]): FunnelStep[] {
  const live = jobs.filter((j) => j.status !== "cancelled");
  const reached = (min: number) => live.filter((j) => RANK[j.status] >= min).length;
  const steps: [string, string, number][] = [
    ["created", "Created", live.length],
    ["assigned", "Engineer assigned", reached(1)],
    ["collected", "Visited / picked up", reached(2)],
    ["store", "At store / in repair", reached(3)],
    ["done", "Delivered / completed", reached(4)],
  ];
  return steps.map(([key, label, count]) => ({ key, label, count, pctOfTotal: pct(count, live.length) }));
}

/* ─── Series ─────────────────────────────────────────────────────────── */

export interface SeriesPoint { key: string; label: string; scheduled: number; completed: number; business: number }
/** Daily points; switches to monthly when the window spans more than 62 days. */
export function series(jobs: FieldJob[], ctx: Pick<AggregateCtx, "finalizedInvoiceOf">): { granularity: "day" | "month"; points: SeriesPoint[] } {
  const live = jobs.filter((j) => j.status !== "cancelled");
  const dates = live.map(tripDateOf).filter(Boolean).sort();
  if (!dates.length) return { granularity: "day", points: [] };
  const span = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000;
  const month = span > 62;
  const map = new Map<string, SeriesPoint>();
  const seen = new Set<string>();
  for (const j of live) {
    const d = tripDateOf(j); if (!d) continue;
    const key = month ? d.slice(0, 7) : d;
    let p = map.get(key);
    if (!p) {
      const dt = new Date(month ? `${key}-01` : key);
      p = { key, label: dt.toLocaleDateString("en-IN", month ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }), scheduled: 0, completed: 0, business: 0 };
      map.set(key, p);
    }
    p.scheduled += 1;
    if (isCompleted(j)) p.completed += 1;
    const i = ctx.finalizedInvoiceOf(j);
    if (i && !seen.has(i.id)) { seen.add(i.id); p.business += i.total; }
  }
  return { granularity: month ? "month" : "day", points: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)) };
}

/* ─── Exceptions ─────────────────────────────────────────────────────── */

export type ExceptionKind = "delayed" | "failed" | "cancelled";
export interface ExceptionRow { job: FieldJob; kind: ExceptionKind; reason: string }
export function exceptions(jobs: FieldJob[], now = new Date()): ExceptionRow[] {
  const out: ExceptionRow[] = [];
  for (const j of jobs) {
    if (j.status === "cancelled") out.push({ job: j, kind: "cancelled", reason: "Cancelled" });
    else if (j.status === "failed_pickup") out.push({ job: j, kind: "failed", reason: "Pickup failed" });
    else if (j.status === "failed_drop") out.push({ job: j, kind: "failed", reason: "Drop failed" });
    else if (isDelayed(j, now)) out.push({ job: j, kind: "delayed", reason: `Overdue since ${(j.pickupDate && j.status.includes("pick")) || !j.dropDate ? j.pickupDate : j.dropDate}` });
  }
  const order: Record<ExceptionKind, number> = { delayed: 0, failed: 1, cancelled: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || tripDateOf(a.job).localeCompare(tripDateOf(b.job)));
}
