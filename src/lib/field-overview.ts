/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field overview intelligence (pure, no React, no I/O).

   Everything the Field command-centre shows is computed here from REAL trips so
   the numbers can be tested and so a click-through (`/field?attn=<key>`) filters
   with the SAME predicate that produced the count:

     • attention queue   — what needs a human right now
     • today's schedule  — trips due today, in time order
     • workload          — open trips per Field Engineer (+ who is free)
     • daily series      — last N days: scheduled / completed / business
     • month vs month    — trips, business, completion rate and the change
     • insights          — short, factual sentences (only when data supports them)

   Business = FINALIZED invoices only (see lib/field-dashboard.ts).
   ────────────────────────────────────────────────────────────────────────── */
import type { FieldJob, FieldJobEvent } from "@/lib/field-data";
import { FIELD_EVENT_LABEL, isDelayed, isTerminal } from "@/lib/field-data";
import {
  tripDateOf, isAssigned, isCompleted, boundsForPreset, buildSummaryRows, sumRows,
  type AggregateCtx, type DashRow,
} from "@/lib/field-dashboard";

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ─── Attention queue ─────────────────────────────────────────────────── */

export type AttentionKey = "delayed" | "unassigned" | "failed" | "no_ticket" | "drop_unassigned" | "no_date";
export type AttentionTone = "rose" | "amber" | "violet" | "sky" | "slate";

export interface AttentionDef {
  key: AttentionKey;
  label: string;
  hint: string;
  tone: AttentionTone;
  /** Higher = shown first. */
  priority: number;
  match: (j: FieldJob, now: Date) => boolean;
}

const open = (j: FieldJob) => !isTerminal(j.status) && j.status !== "delivered";

export const ATTENTION_DEFS: AttentionDef[] = [
  { key: "delayed", label: "Delayed trips", hint: "Scheduled date has passed and the leg isn't done.", tone: "rose", priority: 100,
    match: (j, now) => isDelayed(j, now) },
  { key: "failed", label: "Failed pickup / drop", hint: "A visit failed and needs rescheduling.", tone: "rose", priority: 90,
    match: (j) => j.status === "failed_pickup" || j.status === "failed_drop" },
  { key: "unassigned", label: "Waiting for an engineer", hint: "No Field Engineer assigned yet.", tone: "amber", priority: 80,
    match: (j) => j.status === "pending_assignment" },
  { key: "no_ticket", label: "At store, no ticket", hint: "Device received but no repair ticket created.", tone: "violet", priority: 70,
    match: (j) => j.status === "at_store" && !j.linkedTicketId },
  { key: "drop_unassigned", label: "Ready to drop, no driver", hint: "Repair is done; nobody is assigned to deliver it.", tone: "sky", priority: 60,
    match: (j) => j.status === "ready_for_drop" && !j.dropNinjaId },
  { key: "no_date", label: "No trip date set", hint: "Open trip with no scheduled date.", tone: "slate", priority: 40,
    match: (j) => open(j) && j.status !== "pending_assignment" && !j.pickupDate && !j.dropDate },
];

export interface AttentionItem { key: AttentionKey; label: string; hint: string; tone: AttentionTone; count: number; jobIds: string[] }

export function attentionItems(jobs: FieldJob[], now = new Date()): AttentionItem[] {
  return ATTENTION_DEFS
    .map((d) => {
      const hits = jobs.filter((j) => j.status !== "cancelled" && d.match(j, now));
      return { def: d, hits };
    })
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => b.def.priority - a.def.priority)
    .map(({ def, hits }) => ({ key: def.key, label: def.label, hint: def.hint, tone: def.tone, count: hits.length, jobIds: hits.map((h) => h.id) }));
}

export function attentionMatches(key: string, j: FieldJob, now = new Date()): boolean {
  const d = ATTENTION_DEFS.find((x) => x.key === key);
  return !!d && j.status !== "cancelled" && d.match(j, now);
}

/* ─── Today's schedule ────────────────────────────────────────────────── */

export interface ScheduleEntry { job: FieldJob; leg: "pickup" | "drop"; time: string }

export function todaySchedule(jobs: FieldJob[], today = new Date()): ScheduleEntry[] {
  const t = ymd(today);
  const out: ScheduleEntry[] = [];
  for (const j of jobs) {
    if (j.status === "cancelled") continue;
    if (j.pickupDate === t) out.push({ job: j, leg: "pickup", time: j.pickupTime || "" });
    // A drop is its own entry only when it has its own date.
    if (j.dropDate === t && j.dropDate !== j.pickupDate) out.push({ job: j, leg: "drop", time: j.dropTime || "" });
  }
  // Timed entries first (ascending), untimed last.
  return out.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.job.jobNo.localeCompare(b.job.jobNo));
}

/* ─── Engineer workload ───────────────────────────────────────────────── */

export interface WorkloadRow { id: string; name: string; open: number; today: number; doneThisMonth: number; free: boolean }

export function engineerWorkload(
  jobs: FieldJob[], roster: { id: string; name: string }[] = [], today = new Date(),
): { rows: WorkloadRow[]; unassigned: number } {
  const t = ymd(today);
  const month = t.slice(0, 7);
  const map = new Map<string, WorkloadRow>();
  const get = (id: string, name: string) => {
    let r = map.get(id);
    if (!r) { r = { id, name, open: 0, today: 0, doneThisMonth: 0, free: false }; map.set(id, r); }
    return r;
  };
  for (const e of roster) get(e.id, e.name);
  let unassigned = 0;
  for (const j of jobs) {
    if (j.status === "cancelled") continue;
    if (j.status === "pending_assignment" && !isAssigned(j)) { unassigned += 1; continue; }
    const who = j.ninjaId ? { id: j.ninjaId, name: j.ninjaName } : j.dropNinjaId ? { id: j.dropNinjaId, name: j.dropNinjaName } : null;
    if (!who) continue;
    const r = get(who.id, who.name || "Field Engineer");
    if (open(j)) r.open += 1;
    if (open(j) && (j.pickupDate === t || j.dropDate === t)) r.today += 1;
    if (isCompleted(j) && tripDateOf(j).startsWith(month)) r.doneThisMonth += 1;
  }
  const rows = [...map.values()].map((r) => ({ ...r, free: r.open === 0 }))
    .sort((a, b) => b.open - a.open || b.today - a.today || a.name.localeCompare(b.name));
  return { rows, unassigned };
}

/* ─── Daily series ────────────────────────────────────────────────────── */

export interface DayPoint { date: string; label: string; scheduled: number; completed: number; business: number }

export function dailySeries(jobs: FieldJob[], ctx: Pick<AggregateCtx, "finalizedInvoiceOf">, days = 14, today = new Date()): DayPoint[] {
  const pts: DayPoint[] = [];
  const idx = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const p: DayPoint = { date: ymd(d), label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), scheduled: 0, completed: 0, business: 0 };
    pts.push(p); idx.set(p.date, p);
  }
  const seen = new Set<string>();
  for (const j of jobs) {
    if (j.status === "cancelled") continue;
    const p = idx.get(tripDateOf(j));
    if (!p) continue;
    p.scheduled += 1;
    if (isCompleted(j)) p.completed += 1;
    const inv = ctx.finalizedInvoiceOf(j);
    if (inv && !seen.has(inv.id)) { seen.add(inv.id); p.business += inv.total; }
  }
  return pts;
}

/* ─── Month vs previous month ─────────────────────────────────────────── */

export interface MonthStats { trips: number; completed: number; assigned: number; business: number | null; completionRate: number | null }
export interface MonthCompare { current: MonthStats; previous: MonthStats; tripsDelta: number | null; businessDelta: number | null; rateDeltaPts: number | null }

function monthStats(jobs: FieldJob[], preset: "month" | "lastmonth", ctx: AggregateCtx, today: Date): MonthStats {
  const rows = buildSummaryRows(jobs, "store", boundsForPreset(preset, "", "", today), ctx);
  const t = sumRows(rows);
  const completed = t.onsite.completed + t.pickup.completed + t.drop.completed;
  const assigned = t.onsite.assigned + t.pickup.assigned + t.drop.assigned;
  return { trips: t.totalTrips, completed, assigned, business: t.business, completionRate: t.totalTrips ? Math.round((completed / t.totalTrips) * 100) : null };
}
const pctChange = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 100));

export function monthCompare(jobs: FieldJob[], ctx: AggregateCtx, today = new Date()): MonthCompare {
  const current = monthStats(jobs, "month", ctx, today);
  const previous = monthStats(jobs, "lastmonth", ctx, today);
  return {
    current, previous,
    tripsDelta: pctChange(current.trips, previous.trips),
    businessDelta: pctChange(current.business, previous.business),
    rateDeltaPts: current.completionRate != null && previous.completionRate != null ? current.completionRate - previous.completionRate : null,
  };
}

/* ─── Leaderboards ────────────────────────────────────────────────────── */

export type LeaderPeriod = "month" | "lastmonth" | "year" | "all";
export type LeaderMetric = "business" | "trips" | "rate";

export function completionRateOf(r: DashRow): number | null {
  const done = r.onsite.completed + r.pickup.completed + r.drop.completed;
  return r.totalTrips ? Math.round((done / r.totalTrips) * 100) : null;
}

export function leaderboard(jobs: FieldJob[], by: "store" | "engineer", ctx: AggregateCtx, today = new Date(), limit = 5,
  period: LeaderPeriod = "month", metric: LeaderMetric = "business"): DashRow[] {
  const rows = buildSummaryRows(jobs, by, boundsForPreset(period, "", "", today), ctx).filter((r) => r.key !== "unassigned");
  const val = (r: DashRow) => metric === "trips" ? r.totalTrips : metric === "rate" ? (completionRateOf(r) ?? -1) : (r.business ?? -1);
  return rows.sort((a, b) => val(b) - val(a) || b.totalTrips - a.totalTrips || a.label.localeCompare(b.label)).slice(0, limit);
}

/* ─── Insights ────────────────────────────────────────────────────────── */

export interface Insight { tone: "good" | "warn" | "info"; text: string }
const inrShort = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function buildInsights(args: {
  attention: AttentionItem[]; compare: MonthCompare; workload: { rows: WorkloadRow[]; unassigned: number }; today: ScheduleEntry[];
}): Insight[] {
  const out: Insight[] = [];
  const { attention, compare, workload } = args;
  const delayed = attention.find((a) => a.key === "delayed");
  if (delayed) out.push({ tone: "warn", text: `${delayed.count} trip${delayed.count > 1 ? "s are" : " is"} delayed — clear these first.` });
  if (workload.unassigned > 0) {
    const free = workload.rows.filter((r) => r.free);
    out.push({ tone: "warn", text: `${workload.unassigned} trip${workload.unassigned > 1 ? "s are" : " is"} waiting for an engineer${free.length ? `; ${free.slice(0, 2).map((f) => f.name).join(" and ")} ${free.length > 1 ? "have" : "has"} no open trips` : ""}.` });
  }
  if (args.today.length > 0) out.push({ tone: "info", text: `${args.today.length} visit${args.today.length > 1 ? "s" : ""} scheduled today.` });
  const c = compare.current;
  if (c.completionRate != null && c.trips >= 3) {
    const d = compare.rateDeltaPts;
    out.push({ tone: d != null && d < 0 ? "warn" : "good", text: `Completion rate this month is ${c.completionRate}%${d != null && d !== 0 ? ` (${d > 0 ? "+" : ""}${d} pts vs last month)` : ""}.` });
  }
  if (c.business != null) {
    const d = compare.businessDelta;
    out.push({ tone: d != null && d < 0 ? "warn" : "good", text: `${inrShort(c.business)} finalized business this month${d != null ? ` (${d > 0 ? "+" : ""}${d}% vs last month)` : ""}.` });
  } else if (c.trips > 0) {
    out.push({ tone: "info", text: "No finalized invoices linked to this month's trips yet." });
  }
  return out.slice(0, 5);
}

/* ─── Activity feed ───────────────────────────────────────────────────── */

export interface FeedItem { id: string; jobId: string; jobNo: string; title: string; detail: string; actor: string; at: string }

/** Newest-first feed from the append-only trip events (no invented entries). */
export function activityFeed(events: FieldJobEvent[], describe: (e: FieldJobEvent) => string, limit = 8): FeedItem[] {
  return [...events]
    .filter((e) => e.kind !== "created" || true)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit)
    .map((e) => ({ id: e.id, jobId: e.jobId, jobNo: e.jobNo, title: FIELD_EVENT_LABEL[e.kind], detail: describe(e), actor: e.actorName, at: e.occurredAt }));
}
