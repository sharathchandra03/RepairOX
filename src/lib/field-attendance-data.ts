/* Data access for Ninja attendance / odometer / leave. One place so the Ninja app (own data, RLS)
   and the CRM grid (all Ninjas, via the gated roster RPC) read identical shapes into the pure engine
   in field-attendance.ts. */
import { supabase } from "@/lib/supabase";
import type { WorkSessionRecord } from "@/lib/work-session";
import { DEFAULT_POLICY, gpsKmByDay, monthDays, type GpsTripRow, type DayLog, type Mark, type MarkKind, type Policy } from "@/lib/field-attendance";

export const LOG_COLS = "staff_id,day,start_reading,end_reading,travelled_km,start_photo,end_photo";
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const rowToPolicy = (r: any): Policy => !r ? DEFAULT_POLICY : ({
  fuelRatePerKm: num(r.fuel_rate_per_km, DEFAULT_POLICY.fuelRatePerKm),
  festivalLeavePerYear: num(r.festival_leave_per_year, DEFAULT_POLICY.festivalLeavePerYear),
  casualLeavePerMonth: num(r.casual_leave_per_month, DEFAULT_POLICY.casualLeavePerMonth),
  weekOffPerMonth: num(r.week_off_per_month, DEFAULT_POLICY.weekOffPerMonth),
  halfDayHours: num(r.half_day_hours, DEFAULT_POLICY.halfDayHours),
  odometerPhotoRequired: r.odometer_photo_required ?? DEFAULT_POLICY.odometerPhotoRequired,
});
export const rowToLog = (r: any): DayLog => ({
  staffId: r.staff_id, day: String(r.day).slice(0, 10), startReading: r.start_reading,
  endReading: r.end_reading ?? null, travelledKm: r.travelled_km ?? null,
  startPhoto: r.start_photo ?? null, endPhoto: r.end_photo ?? null,
});
export const rowToMark = (r: any): Mark => ({
  id: r.id, staffId: r.staff_id, day: String(r.day).slice(0, 10), kind: r.kind as MarkKind, status: r.status, reason: r.reason ?? null, requestedAt: r.created_at ?? null,
});
export const rowToSession = (r: any): WorkSessionRecord => ({
  id: r.id, staffId: r.staff_id, branchId: r.branch_id ?? null, startedAt: r.started_at, endedAt: r.ended_at ?? null,
  status: r.status, lastSeenAt: r.last_seen_at ?? r.started_at,
  breaks: ((r.breaks ?? r.work_session_breaks ?? []) as any[]).map((b) => ({ startedAt: b.started_at, endedAt: b.ended_at ?? null })),
});

export interface RangeData { sessions: WorkSessionRecord[]; logs: DayLog[]; marks: Mark[]; weeklyOff: Map<string, number>; policy: Policy }
const range = (from: string, to: string) => ({ from, to });
export const ymRange = (ym: string) => { const d = monthDays(ym); return range(d[0], d[d.length - 1]); };
const winStart = (from: string) => new Date(new Date(`${from}T00:00:00`).getTime() - 864e5).toISOString();
const winEnd = (to: string) => new Date(new Date(`${to}T00:00:00`).getTime() + 2 * 864e5).toISOString();

export async function fetchPolicy(): Promise<Policy> {
  if (!supabase) return DEFAULT_POLICY;
  const { data } = await supabase.from("field_policy").select("*").maybeSingle();
  return rowToPolicy(data);
}

/** The signed-in Ninja's own data (RLS keeps it to their rows). */
export async function fetchOwnRange(staffId: string, from: string, to: string): Promise<RangeData> {
  if (!supabase) return { sessions: [], logs: [], marks: [], weeklyOff: new Map(), policy: DEFAULT_POLICY };
  const [s, l, m, w, p] = await Promise.all([
    supabase.from("work_sessions").select("id,staff_id,branch_id,started_at,ended_at,status,last_seen_at,work_session_breaks(started_at,ended_at)")
      .eq("staff_id", staffId).gte("started_at", winStart(from)).lt("started_at", winEnd(to)).limit(2000),
    supabase.from("ninja_day_logs").select(LOG_COLS).eq("staff_id", staffId).gte("day", from).lte("day", to),
    supabase.from("field_attendance_marks").select("id,staff_id,day,kind,status,reason,created_at").eq("staff_id", staffId).gte("day", from).lte("day", to),
    supabase.from("field_weekly_off").select("staff_id,weekday").eq("staff_id", staffId),
    fetchPolicy(),
  ]);
  return {
    sessions: (s.data ?? []).map(rowToSession), logs: (l.data ?? []).map(rowToLog), marks: (m.data ?? []).map(rowToMark),
    weeklyOff: new Map((w.data ?? []).map((x: any) => [x.staff_id as string, x.weekday as number])), policy: p,
  };
}

/** GPS-tracked km per `${staffId}|${day}` for the range (RLS: managers see their stores' trips). */
export async function fetchGpsKm(from: string, to: string, dayOf: (ms: number) => string): Promise<Map<string, number>> {
  if (!supabase) return new Map();
  const { data } = await supabase.from("field_ninja_trip_stats_v").select("ninja_id,distance_m,tracked_points,completed_at,arrived_at,journey_started_at,accepted_at")
    .gt("tracked_points", 0).gte("assigned_at", new Date(new Date(`${from}T00:00:00`).getTime() - 2 * 864e5).toISOString())
    .lt("assigned_at", new Date(new Date(`${to}T00:00:00`).getTime() + 3 * 864e5).toISOString()).limit(20000);
  return gpsKmByDay((data ?? []) as GpsTripRow[], dayOf);
}

export interface RosterNinja { id: string; name: string; branchId: string | null; status: string }
/** All Ninjas in the caller's stores (needs a field report / manager key). */
export async function fetchRoster(from: string, to: string): Promise<RangeData & { ninjas: RosterNinja[] }> {
  const empty = { sessions: [], logs: [], marks: [], weeklyOff: new Map<string, number>(), policy: DEFAULT_POLICY, ninjas: [] as RosterNinja[] };
  if (!supabase) return empty;
  const [r, l, m, w, p] = await Promise.all([
    supabase.rpc("field_attendance_roster", { p_from: from, p_to: to }),
    supabase.from("ninja_day_logs").select(LOG_COLS).gte("day", from).lte("day", to).limit(20000),
    supabase.from("field_attendance_marks").select("id,staff_id,day,kind,status,reason,created_at").gte("day", from).lte("day", to).limit(20000),
    supabase.from("field_weekly_off").select("staff_id,weekday"),
    fetchPolicy(),
  ]);
  if (r.error) throw new Error(r.error.message);
  const j = (r.data ?? {}) as { ninjas?: any[]; sessions?: any[] };
  return {
    ninjas: (j.ninjas ?? []).map((n) => ({ id: n.id, name: n.name, branchId: n.branch_id ?? null, status: n.status })),
    sessions: (j.sessions ?? []).map(rowToSession), logs: (l.data ?? []).map(rowToLog), marks: (m.data ?? []).map(rowToMark),
    weeklyOff: new Map((w.data ?? []).map((x: any) => [x.staff_id as string, x.weekday as number])), policy: p,
  };
}

/** A Ninja's last recorded END reading before `day` (for the start-reading sanity check). */
export async function fetchLastEndReading(staffId: string, day: string): Promise<number | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("ninja_day_logs").select("end_reading").eq("staff_id", staffId).lt("day", day)
    .not("end_reading", "is", null).order("day", { ascending: false }).limit(1);
  return (data?.[0] as { end_reading: number } | undefined)?.end_reading ?? null;
}
