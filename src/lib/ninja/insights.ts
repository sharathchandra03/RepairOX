/* Ninja insights engine (pure, no React). Every number comes from a real record:
   trips (status / timestamps), field_assignments (accept / reject / response time),
   field_ninja_trip_stats_v (distance, travel + service time), the invoices the Ninja raised and
   problem events. Nothing is estimated or invented: when the source is empty the metric is null and
   the UI says so. */
import { kindOf, type NinjaTrip, type TripKind } from "./model";

export type Period = "today" | "week" | "month";
export const PERIOD_LABEL: Record<Period, string> = { today: "Today", week: "7 days", month: "30 days" };
export const ON_TIME_GRACE_MIN = 15;

export interface AssignmentRow { trip_id: string; outcome: string; reject_reason: string | null; assigned_at: string; responded_at: string | null }
export interface TripStatRow { trip_id: string; distance_m: number | null; travel_seconds: number | null; service_seconds: number | null }
export interface InvoiceLite { id: string; total: number; paidAmount: number; status: string }
export interface InsightInput {
  trips: NinjaTrip[];
  assignments: AssignmentRow[];
  stats: TripStatRow[] | null;          // null = view unavailable (migration pending)
  invoices: InvoiceLite[];
  problemTimes: string[];               // occurred_at of problem_reported events by this Ninja
  period: Period;
  now?: number;
}

const DAY = 86_400_000;
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function periodRange(p: Period, now: number): { from: number; to: number; prevFrom: number; prevTo: number } {
  const today = startOfDay(now);
  const days = p === "today" ? 1 : p === "week" ? 7 : 30;
  const from = today - (days - 1) * DAY;
  return { from, to: now, prevFrom: from - days * DAY, prevTo: from };
}

const inRange = (iso: string | null | undefined, from: number, to: number) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from && t <= to;
};
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export interface Insights {
  completed: number;
  prevCompleted: number;
  streakDays: number;
  week: { label: string; count: number; today: boolean }[];
  bestDay: { label: string; count: number } | null;
  acceptance: { accepted: number; rejected: number; rate: number | null };
  response: { medianSec: number | null; fastestSec: number | null; n: number };
  onTime: { rate: number | null; n: number };
  road: { km: number | null; travelSec: number | null; avgServiceSec: number | null; trackedTrips: number };
  mix: Record<TripKind, number>;
  docs: { tickets: number; invoices: number; billed: number; collected: number };
  care: { rejected: number; problems: number; topReasons: { reason: string; count: number }[] };
  open: { new: number; active: number; later: number };
}

export function computeInsights(i: InsightInput): Insights {
  const now = i.now ?? Date.now();
  const { from, to, prevFrom, prevTo } = periodRange(i.period, now);

  const done = i.trips.filter((t) => t.status === "completed");
  const completed = done.filter((t) => inRange(t.completed_at, from, to));
  const prevCompleted = done.filter((t) => inRange(t.completed_at, prevFrom, prevTo)).length;

  // last 7 days bars (independent of the selected period)
  const today = startOfDay(now);
  const week = Array.from({ length: 7 }, (_, k) => {
    const day = today - (6 - k) * DAY;
    const count = done.filter((t) => t.completed_at && dayKey(new Date(t.completed_at).getTime()) === dayKey(day)).length;
    return { label: new Date(day).toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 3), count, today: k === 6 };
  });
  const best = week.reduce((b, d) => (d.count > (b?.count ?? 0) ? d : b), null as null | { label: string; count: number; today: boolean });

  // streak: consecutive days with >=1 completed job, ending today (or yesterday if nothing yet today)
  const doneDays = new Set(done.filter((t) => t.completed_at).map((t) => dayKey(new Date(t.completed_at!).getTime())));
  let cursor = doneDays.has(dayKey(today)) ? today : today - DAY, streak = 0;
  while (doneDays.has(dayKey(cursor))) { streak++; cursor -= DAY; }

  // assignments
  const resp = i.assignments.filter((a) => a.responded_at && inRange(a.responded_at, from, to) && (a.outcome === "accepted" || a.outcome === "rejected" || a.outcome === "reassigned"));
  const accepted = resp.filter((a) => a.outcome === "accepted").length;
  const rejectedRows = resp.filter((a) => a.outcome === "rejected");
  const decided = accepted + rejectedRows.length;
  const secs = resp.filter((a) => a.outcome !== "reassigned").map((a) => Math.max(0, (new Date(a.responded_at!).getTime() - new Date(a.assigned_at).getTime()) / 1000));
  const reasonMap = new Map<string, number>();
  for (const a of rejectedRows) { const r = (a.reject_reason || "No reason given").trim(); reasonMap.set(r, (reasonMap.get(r) ?? 0) + 1); }

  // on-time arrival
  const arrived = i.trips.filter((t) => t.arrived_at && t.scheduled_at && inRange(t.arrived_at, from, to));
  const onTimeN = arrived.filter((t) => new Date(t.arrived_at!).getTime() <= new Date(t.scheduled_at!).getTime() + ON_TIME_GRACE_MIN * 60_000).length;

  // road + service
  const inPeriodIds = new Set(i.trips.filter((t) => inRange(t.completed_at ?? t.arrived_at ?? t.journey_started_at, from, to)).map((t) => t.id));
  const st = (i.stats ?? []).filter((s) => inPeriodIds.has(s.trip_id));
  const tracked = st.filter((s) => (s.distance_m ?? 0) > 0);
  const services = st.map((s) => s.service_seconds).filter((x): x is number => x != null && x > 0);

  const mix: Record<TripKind, number> = { pickup: 0, drop: 0, onsite: 0, warranty_pickup: 0, buyback: 0 };
  for (const t of completed) mix[kindOf(t)]++;

  // documents the Ninja raised in the period
  const periodTrips = i.trips.filter((t) => inRange(t.updated_at, from, to) || inRange(t.completed_at, from, to));
  const invIds = new Set(periodTrips.map((t) => t.invoice_id).filter((x): x is string => !!x));
  const ticketCount = new Set(periodTrips.map((t) => t.ticket_id).filter((x): x is string => !!x)).size;
  const invs = i.invoices.filter((v) => invIds.has(v.id) && v.status !== "cancelled");

  const problems = i.problemTimes.filter((x) => inRange(x, from, to)).length;

  return {
    completed: completed.length, prevCompleted, streakDays: streak, week, bestDay: best && best.count > 0 ? { label: best.label, count: best.count } : null,
    acceptance: { accepted, rejected: rejectedRows.length, rate: decided ? accepted / decided : null },
    response: { medianSec: median(secs), fastestSec: secs.length ? Math.min(...secs) : null, n: secs.length },
    onTime: { rate: arrived.length ? onTimeN / arrived.length : null, n: arrived.length },
    road: {
      km: i.stats && tracked.length ? sum(tracked.map((s) => s.distance_m ?? 0)) / 1000 : null,
      travelSec: st.some((s) => (s.travel_seconds ?? 0) > 0) ? sum(st.map((s) => s.travel_seconds ?? 0)) : null,
      avgServiceSec: services.length ? sum(services) / services.length : null,
      trackedTrips: tracked.length,
    },
    mix,
    docs: { tickets: ticketCount, invoices: invs.length, billed: sum(invs.map((v) => v.total)), collected: sum(invs.map((v) => v.paidAmount)) },
    care: { rejected: rejectedRows.length, problems, topReasons: [...reasonMap].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 3) },
    open: {
      new: i.trips.filter((t) => t.status === "assigned").length,
      active: i.trips.filter((t) => !["assigned", "awaiting_assignment", "accepted", "completed", "cancelled", "rescheduled", "failed_attempt", "customer_unavailable", "return_to_store"].includes(t.status)).length,
      later: i.trips.filter((t) => t.status === "accepted").length,
    },
  };
}

export function durationLabel(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
