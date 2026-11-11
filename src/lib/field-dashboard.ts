/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field dashboard aggregation (pure, no React, no I/O).

   DEFINITIONS (documented once, used everywhere — dashboards, drill-down and
   the on-screen table reconcile because they share these predicates):

   • Trip date      = scheduled date (pickupDate || dropDate), else created date.
   • Trip group     = On-Site (onsite, warranty_onsite) · Pickup (pickup,
                      warranty_pickup) · Drop (drop).
   • ASSIGNED       = a non-cancelled trip that has a Field Engineer.
   • COMPLETED      = status "completed" (delivered-and-closed). Cancelled trips
                      are neither assigned nor completed.
   • BUSINESS       = sum of FINALIZED (paid, non-proforma) invoice totals linked
                      to the trips, each invoice counted ONCE. Estimates, draft,
                      unpaid, proforma and cancelled invoices contribute nothing.
                      No finalized invoice => null ("—"), never a fabricated ₹0.
   ────────────────────────────────────────────────────────────────────────── */
import type { FieldJob } from "@/lib/field-data";
import { normaliseLeadType } from "@/lib/field-data";

export type TripGroup = "onsite" | "pickup" | "drop";
export const TRIP_GROUP_LABEL: Record<TripGroup, string> = { onsite: "On-Site", pickup: "Pickup", drop: "Drop" };

export function tripGroupOf(j: Pick<FieldJob, "leadType">): TripGroup {
  switch (normaliseLeadType(j.leadType)) {
    case "onsite": case "warranty_onsite": return "onsite";
    case "drop": return "drop";
    default: return "pickup";
  }
}

export const tripDateOf = (j: Pick<FieldJob, "pickupDate" | "dropDate" | "createdAt">): string =>
  j.pickupDate || j.dropDate || (j.createdAt || "").slice(0, 10);

export const isAssigned = (j: Pick<FieldJob, "status" | "ninjaId" | "dropNinjaId">) =>
  j.status !== "cancelled" && !!(j.ninjaId || j.dropNinjaId);
export const isCompleted = (j: Pick<FieldJob, "status">) => j.status === "completed";
export const isWarranty = (j: Pick<FieldJob, "leadType">) => normaliseLeadType(j.leadType).startsWith("warranty_");

/* ─── Date range ──────────────────────────────────────────────────────── */

export type DashPreset = "all" | "today" | "7days" | "month" | "lastmonth" | "year" | "custom";
export interface DateBounds { from: string | null; to: string | null } // inclusive YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function boundsForPreset(preset: DashPreset, customFrom: string, customTo: string, today = new Date()): DateBounds {
  switch (preset) {
    case "today": return { from: ymd(today), to: ymd(today) };
    case "7days": return { from: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), to: ymd(today) };
    case "year": return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` };
    case "month": return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    case "lastmonth": return { from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case "custom": return { from: customFrom || null, to: customTo || null };
    default: return { from: null, to: null };
  }
}
export const inBounds = (date: string, b: DateBounds) =>
  !!date && (!b.from || date >= b.from) && (!b.to || date <= b.to);

/* ─── Aggregation ─────────────────────────────────────────────────────── */

/** `warranty` = trips of this group that are warranty trips; NEW = total - warranty. */
export interface Bucket { assigned: number; completed: number; total: number; warranty: number }
const emptyBucket = (): Bucket => ({ assigned: 0, completed: 0, total: 0, warranty: 0 });
export const newCount = (b: Bucket) => b.total - b.warranty;
export type GroupMoney = Record<TripGroup, number | null>;
const emptyMoney = (): GroupMoney => ({ onsite: null, pickup: null, drop: null });

export interface DashRow {
  key: string;
  label: string;
  /** Finalized-invoice business, or null when none. */
  business: number | null;
  /** Business split by trip group (sums to `business`; null = none). */
  groupBusiness: GroupMoney;
  totalTrips: number;
  onsite: Bucket;
  pickup: Bucket;
  drop: Bucket;
  /** Exact trip ids behind the row (drill-down reconciles by construction). */
  jobIds: string[];
}

export type GroupBy = "store" | "engineer";
export interface AggregateCtx {
  /** Finalized invoice for a trip: stable invoice id + total, or null. */
  finalizedInvoiceOf: (j: FieldJob) => { id: string; total: number } | null;
  storeKeyOf: (j: FieldJob) => { key: string; label: string };
}

const engineerOf = (j: FieldJob) =>
  j.ninjaId ? { key: j.ninjaId, label: j.ninjaName || "Field Engineer" }
    : j.dropNinjaId ? { key: j.dropNinjaId, label: j.dropNinjaName || "Field Engineer" }
    : { key: "unassigned", label: "Unassigned" };

function groupKey(j: FieldJob, by: GroupBy, ctx: AggregateCtx) {
  return by === "store" ? ctx.storeKeyOf(j) : engineerOf(j);
}

function foldRows(jobs: FieldJob[], by: GroupBy, ctx: AggregateCtx): DashRow[] {
  const map = new Map<string, DashRow & { _inv: Set<string>; _sum: number }>();
  for (const j of jobs) {
    const { key, label } = groupKey(j, by, ctx);
    let r = map.get(key);
    if (!r) { r = { key, label, business: null, groupBusiness: emptyMoney(), totalTrips: 0, onsite: emptyBucket(), pickup: emptyBucket(), drop: emptyBucket(), jobIds: [], _inv: new Set(), _sum: 0 }; map.set(key, r); }
    const grp = tripGroupOf(j);
    const b = r[grp];
    b.total += 1;
    if (isWarranty(j)) b.warranty += 1;
    if (isAssigned(j)) b.assigned += 1;
    if (isCompleted(j)) b.completed += 1;
    r.totalTrips += 1;
    r.jobIds.push(j.id);
    const inv = ctx.finalizedInvoiceOf(j);
    if (inv && !r._inv.has(inv.id)) { r._inv.add(inv.id); r._sum += inv.total; r.groupBusiness[grp] = (r.groupBusiness[grp] ?? 0) + inv.total; }
  }
  return [...map.values()].map(({ _inv, _sum, ...row }) => ({ ...row, business: _inv.size > 0 ? _sum : null }))
    .sort((a, b) => (b.business ?? -1) - (a.business ?? -1) || b.totalTrips - a.totalTrips || a.label.localeCompare(b.label));
}

/** Store / FE summary for a date range (cancelled trips are excluded from
 *  trip totals — they are neither work done nor work pending). */
export function buildSummaryRows(jobs: FieldJob[], by: GroupBy, bounds: DateBounds, ctx: AggregateCtx): DashRow[] {
  return foldRows(jobs.filter((j) => j.status !== "cancelled" && inBounds(tripDateOf(j), bounds)), by, ctx);
}

export function sumRows(rows: DashRow[]): Omit<DashRow, "key" | "label" | "jobIds"> & { jobIds: string[] } {
  const t = { business: null as number | null, groupBusiness: emptyMoney(), totalTrips: 0, onsite: emptyBucket(), pickup: emptyBucket(), drop: emptyBucket(), jobIds: [] as string[] };
  for (const r of rows) {
    if (r.business != null) t.business = (t.business ?? 0) + r.business;
    t.totalTrips += r.totalTrips;
    for (const g of ["onsite", "pickup", "drop"] as const) {
      t[g].assigned += r[g].assigned; t[g].completed += r[g].completed; t[g].total += r[g].total; t[g].warranty += r[g].warranty;
      if (r.groupBusiness[g] != null) t.groupBusiness[g] = (t.groupBusiness[g] ?? 0) + (r.groupBusiness[g] as number);
    }
    t.jobIds.push(...r.jobIds);
  }
  return t;
}

/* ─── Monthly master ──────────────────────────────────────────────────── */

export interface MonthCell { month: number; totalTrips: number; business: number | null; groupBusiness: GroupMoney; onsite: Bucket; pickup: Bucket; drop: Bucket; jobIds: string[] }
export interface MasterRow { key: string; label: string; months: MonthCell[]; yearTrips: number; yearBusiness: number | null; yearGroups: DashRow | null }

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Years that have at least one trip, plus the current year; newest first. */
export function availableYears(jobs: FieldJob[], today = new Date()): number[] {
  const ys = new Set<number>([today.getFullYear()]);
  for (const j of jobs) { const y = Number(tripDateOf(j).slice(0, 4)); if (y > 1999) ys.add(y); }
  return [...ys].sort((a, b) => b - a);
}

export function buildMasterRows(jobs: FieldJob[], by: GroupBy, year: number, ctx: AggregateCtx): MasterRow[] {
  const inYear = jobs.filter((j) => j.status !== "cancelled" && tripDateOf(j).startsWith(`${year}-`));
  const keys = new Map<string, string>();
  for (const j of inYear) { const g = groupKey(j, by, ctx); keys.set(g.key, g.label); }
  const rows: MasterRow[] = [];
  for (const [key, label] of keys) {
    const mine = inYear.filter((j) => groupKey(j, by, ctx).key === key);
    const months: MonthCell[] = [];
    for (let m = 0; m < 12; m++) {
      const prefix = `${year}-${pad(m + 1)}-`;
      const part = mine.filter((j) => tripDateOf(j).startsWith(prefix));
      const folded = foldRows(part, by, ctx)[0];
      months.push(folded
        ? { month: m, totalTrips: folded.totalTrips, business: folded.business, groupBusiness: folded.groupBusiness, onsite: folded.onsite, pickup: folded.pickup, drop: folded.drop, jobIds: folded.jobIds }
        : { month: m, totalTrips: 0, business: null, groupBusiness: emptyMoney(), onsite: emptyBucket(), pickup: emptyBucket(), drop: emptyBucket(), jobIds: [] });
    }
    const yr = foldRows(mine, by, ctx)[0];
    rows.push({ key, label, months, yearTrips: mine.length, yearBusiness: yr?.business ?? null, yearGroups: yr ?? null });
  }
  return rows.sort((a, b) => (b.yearBusiness ?? -1) - (a.yearBusiness ?? -1) || b.yearTrips - a.yearTrips || a.label.localeCompare(b.label));
}
