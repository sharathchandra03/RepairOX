/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Ninja attendance, odometer KM and fuel engine (pure, tested).
   Replaces the "Availability / KM Reading / Timing" Google Sheet.
   Nothing here is typed in by hand:
     PUNCH IN / OUT  = first start / last end of the Ninja's Work Sessions that day
     KM              = end reading - start reading from the Ninja app (ninja_day_logs)
     FUEL            = KM x the fuel rate in field_policy (sheet: 3.5 / km)
     STATUS per day  = derived (below), with approved marks for leave / week off
   Day status, first match wins:
     1. worked (a session that day)  -> Present, or Half Day when net time < half_day_hours
                                        (an approved Half-Day mark also gives Half Day)
     2. approved mark                -> Week Off / Casual / Festival / Half Day / Absent
     3. pending leave request        -> Requested
     4. default weekly off weekday   -> Week Off
     5. today, nothing yet           -> Pending      6. later days -> Future
     7. otherwise (a past day)       -> Absent
   Durations come from the shared work-session engine, never a second timer.
   ────────────────────────────────────────────────────────────────────────── */
import { STALE_MS, aggregateDay, localDateKey, splitAcrossLocalDates, type WorkSessionRecord } from "@/lib/work-session";

export type DayStatus = "present" | "half_day" | "absent" | "week_off" | "casual_leave" | "festival_leave" | "requested" | "pending" | "future";
export type MarkKind = "week_off" | "casual_leave" | "festival_leave" | "half_day" | "absent";
export interface Mark { staffId: string; day: string; kind: MarkKind; status: "requested" | "approved" | "rejected"; reason?: string | null; id?: string; requestedAt?: string | null }
export interface DayLog { staffId: string; day: string; startReading: number; endReading: number | null; travelledKm: number | null; startPhoto?: string | null; endPhoto?: string | null }
export interface Policy {
  fuelRatePerKm: number; festivalLeavePerYear: number; casualLeavePerMonth: number; weekOffPerMonth: number; halfDayHours: number;
  /** The Ninja must photograph the odometer for every start / end reading. */
  odometerPhotoRequired: boolean;
}
export const DEFAULT_POLICY: Policy = { fuelRatePerKm: 3.5, festivalLeavePerYear: 8, casualLeavePerMonth: 1, weekOffPerMonth: 4, halfDayHours: 4, odometerPhotoRequired: true };

/* ─── GPS vs odometer cross-check ───────────────────────────────────────────
   GPS distance only covers tracked trips (accepted job → handover), so it is normally LOWER than the
   odometer, which also counts riding between jobs and to / from the store. So:
     • odometer clearly BELOW the GPS distance  -> the reading is wrong (cannot ride more than the meter)
     • odometer far ABOVE the GPS distance       -> most of the distance was not tracked
   Neither blocks anything; they flag the day for a manager to look at. */
export type KmCheck = "odo_below_gps" | "low_coverage";
export const GPS_MIN_KM = 10;          // ignore GPS totals below this (too little to compare)
export const GPS_BELOW_RATIO = 0.9;    // odometer < 90% of GPS  => flag
export const COVERAGE_MIN_ODO_KM = 50; // only judge coverage on a real day
export const COVERAGE_RATIO = 0.3;     // GPS < 30% of odometer  => flag
export function kmCrossCheck(odoKm: number | null, gpsKm: number | null): KmCheck | null {
  if (odoKm == null || gpsKm == null || gpsKm < GPS_MIN_KM) return null;
  if (odoKm < gpsKm * GPS_BELOW_RATIO) return "odo_below_gps";
  if (odoKm >= COVERAGE_MIN_ODO_KM && gpsKm / odoKm < COVERAGE_RATIO) return "low_coverage";
  return null;
}
export const KM_CHECK_LABEL: Record<KmCheck, string> = {
  odo_below_gps: "Odometer is lower than the GPS-tracked distance — the reading may be wrong.",
  low_coverage: "Very little of this distance was GPS-tracked — please confirm the reading.",
};
export interface GpsTripRow { ninja_id: string | null; distance_m: number | null; tracked_points: number | null; completed_at: string | null; arrived_at: string | null; journey_started_at: string | null; accepted_at: string | null }
/** Tracked km per `${staffId}|${day}` from the trip stats view (only trips that actually have GPS points). */
export function gpsKmByDay(rows: GpsTripRow[], dayOf: (ms: number) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.ninja_id || !r.tracked_points || !r.distance_m) continue;
    const at = r.completed_at ?? r.arrived_at ?? r.journey_started_at ?? r.accepted_at;
    if (!at) continue;
    const k = `${r.ninja_id}|${dayOf(new Date(at).getTime())}`;
    out.set(k, (out.get(k) ?? 0) + r.distance_m / 1000);
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 10) / 10);
  return out;
}
/** A single day above this many km looks wrong and is flagged for a manager to check. */
export const HIGH_KM_FLAG = 300;

export const STATUS_LABEL: Record<DayStatus, string> = {
  present: "Present", half_day: "Half Day", absent: "Absent", week_off: "Week Off", casual_leave: "Casual Leave",
  festival_leave: "Festival Leave", requested: "Leave requested", pending: "Not started", future: "—",
};
export const MARK_LABEL: Record<MarkKind, string> = {
  week_off: "Week Off", casual_leave: "Casual Leave", festival_leave: "Festival Leave", half_day: "Half Day", absent: "Absent",
};

export interface DayCell {
  date: string;
  status: DayStatus;
  /** Epoch ms of the first punch-in / last punch-out that day (out = null while on duty). */
  punchIn: number | null; punchOut: number | null;
  netMs: number;
  /** Time is an estimate (interrupted / still open session). */
  estimated: boolean;
  startReading: number | null; endReading: number | null; km: number | null;
  /** Worked although a leave / week off was planned. */
  workedOnOff: boolean;
  /** Present or half day but no complete odometer log. */
  missingReading: boolean;
  /** Distance looks wrong (very high). */
  kmFlag: boolean;
  /** GPS-tracked km that day (null = none tracked) and the cross-check result vs the odometer. */
  gpsKm: number | null; kmCheck: KmCheck | null;
  startPhoto: string | null; endPhoto: string | null;
  /** A reading exists but a required photo is missing. */
  missingPhoto: boolean;
  markId?: string;
  markKind?: MarkKind;
}
export interface MonthSummary {
  present: number; absent: number; weekOff: number; casualLeave: number; festivalLeave: number; halfDay: number; requested: number;
  totalKm: number; fuel: number; missingReadings: number; flaggedDays: number; kmChecks: number; missingPhotos: number;
}
export interface NinjaMonth { staffId: string; days: DayCell[]; summary: MonthSummary }

const pad = (n: number) => String(n).padStart(2, "0");
export const monthDays = (ym: string): string[] => {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
};
const weekdayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).getDay(); };

export interface MonthInput {
  staffId: string; ym: string; tz: string; nowMs: number;
  sessions: WorkSessionRecord[]; logs: DayLog[]; marks: Mark[];
  weeklyOff: number | null; policy: Policy;
  /** `${staffId}|${day}` -> GPS-tracked km (from gpsKmByDay). */
  gps?: Map<string, number>;
}
export function buildNinjaMonth(i: MonthInput): NinjaMonth {
  const today = localDateKey(i.nowMs, i.tz);
  const mine = i.sessions.filter((s) => s.staffId === i.staffId);
  const logBy = new Map(i.logs.filter((l) => l.staffId === i.staffId).map((l) => [l.day, l]));
  const markBy = new Map(i.marks.filter((m) => m.staffId === i.staffId && m.status !== "rejected").map((m) => [m.day, m]));
  const days: DayCell[] = monthDays(i.ym).map((date) => {
    const agg = aggregateDay(mine, date, i.tz, i.nowMs, STALE_MS);
    const worked = agg.sessionCount > 0 && agg.netMs > 0;
    const mark = markBy.get(date);
    const approved = mark && mark.status === "approved" ? mark : undefined;
    // punches: sessions that START on this local date
    const starts = mine.filter((s) => localDateKey(new Date(s.startedAt).getTime(), i.tz) === date);
    const punchIn = starts.length ? Math.min(...starts.map((s) => new Date(s.startedAt).getTime())) : null;
    const anyOpen = starts.some((s) => s.endedAt === null);
    const punchOut = starts.length && !anyOpen ? Math.max(...starts.map((s) => new Date(s.endedAt as string).getTime())) : null;
    const log = logBy.get(date);
    let status: DayStatus;
    if (worked) {
      const halfByTime = date < today && agg.netMs < i.policy.halfDayHours * 3_600_000;
      status = approved?.kind === "half_day" || halfByTime ? "half_day" : "present";
    } else if (approved) {
      status = approved.kind === "week_off" || approved.kind === "casual_leave" || approved.kind === "festival_leave" || approved.kind === "half_day" || approved.kind === "absent"
        ? (approved.kind as DayStatus) : "absent";
    } else if (mark && mark.status === "requested") status = "requested";
    else if (i.weeklyOff != null && weekdayOf(date) === i.weeklyOff) status = "week_off";
    else if (date === today) status = "pending";
    else if (date > today) status = "future";
    else status = "absent";
    const km = log && log.travelledKm != null ? log.travelledKm : null;
    const isWork = status === "present" || status === "half_day";
    const gpsKm = i.gps?.get(`${i.staffId}|${date}`) ?? null;
    return {
      date, status, punchIn, punchOut, netMs: agg.netMs,
      estimated: agg.interruptedCount > 0 || starts.some((s) => s.endedAt === null),
      startReading: log?.startReading ?? null, endReading: log?.endReading ?? null, km,
      workedOnOff: worked && !!approved && approved.kind !== "half_day",
      missingReading: isWork && date < today && km == null,
      kmFlag: km != null && km > HIGH_KM_FLAG,
      gpsKm, kmCheck: kmCrossCheck(km, gpsKm),
      startPhoto: log?.startPhoto ?? null, endPhoto: log?.endPhoto ?? null,
      missingPhoto: !!log && i.policy.odometerPhotoRequired && (!log.startPhoto || (log.endReading != null && !log.endPhoto)),
      markId: mark?.id, markKind: mark?.kind,
    };
  });
  const c = (s: DayStatus) => days.filter((d) => d.status === s).length;
  const totalKm = days.reduce((a, d) => a + (d.km ?? 0), 0);
  return {
    staffId: i.staffId, days,
    summary: {
      present: c("present"), absent: c("absent"), weekOff: c("week_off"), casualLeave: c("casual_leave"), festivalLeave: c("festival_leave"),
      halfDay: c("half_day"), requested: c("requested"), totalKm, fuel: Math.round(totalKm * i.policy.fuelRatePerKm * 100) / 100,
      missingReadings: days.filter((d) => d.missingReading).length, flaggedDays: days.filter((d) => d.kmFlag).length,
      kmChecks: days.filter((d) => d.kmCheck).length, missingPhotos: days.filter((d) => d.missingPhoto).length,
    },
  };
}

/** Festival leave: approved this calendar year vs the yearly quota. */
export function festivalBalance(marks: Mark[], staffId: string, year: number, policy: Policy) {
  const mine = marks.filter((m) => m.staffId === staffId && m.kind === "festival_leave" && m.day.startsWith(`${year}-`));
  const taken = mine.filter((m) => m.status === "approved").length;
  const requested = mine.filter((m) => m.status === "requested").length;
  return { applicable: policy.festivalLeavePerYear, taken, requested, available: Math.max(0, policy.festivalLeavePerYear - taken) };
}
/** Casual leave used in one month (approved) vs the monthly quota. */
export function casualBalance(marks: Mark[], staffId: string, ym: string, policy: Policy) {
  const used = marks.filter((m) => m.staffId === staffId && m.kind === "casual_leave" && m.status === "approved" && m.day.startsWith(ym)).length;
  return { applicable: policy.casualLeavePerMonth, used, available: Math.max(0, policy.casualLeavePerMonth - used) };
}

/** Km per month (Jan-Dec) for one Ninja from the odometer logs — the sheet's "Monthly Summary". */
export function monthlyKm(logs: DayLog[], staffId: string, year: number): number[] {
  const out = Array<number>(12).fill(0);
  for (const l of logs) if (l.staffId === staffId && l.day.startsWith(`${year}-`) && l.travelledKm != null) out[Number(l.day.slice(5, 7)) - 1] += l.travelledKm;
  return out;
}

/** Validation for the Ninja app odometer prompts. Returns an error, a soft warning, or null. */
export function checkStartReading(reading: number, lastEnd: number | null): { error?: string; warn?: string } {
  if (!Number.isFinite(reading) || reading < 0 || !Number.isInteger(reading)) return { error: "Enter the reading shown on your odometer (whole number)." };
  if (lastEnd != null && reading < lastEnd) return { warn: `Your last end reading was ${lastEnd}. This is lower — continue only if the meter was reset or the vehicle changed.` };
  if (lastEnd != null && reading - lastEnd > 300) return { warn: `This is ${reading - lastEnd} km above your last end reading (${lastEnd}). Please check it.` };
  return {};
}
export function checkEndReading(reading: number, start: number): { error?: string; warn?: string } {
  if (!Number.isFinite(reading) || !Number.isInteger(reading) || reading < 0) return { error: "Enter the reading shown on your odometer (whole number)." };
  if (reading < start) return { error: `End reading cannot be lower than your start reading (${start}).` };
  if (reading - start > 1000) return { error: "That is more than 1000 km in a day. Please re-check the reading." };
  if (reading - start > HIGH_KM_FLAG) return { warn: `${reading - start} km in one day is high. Continue only if it is correct.` };
  return {};
}

export { splitAcrossLocalDates };
