import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNinjaMonth, casualBalance, checkEndReading, gpsKmByDay, kmCrossCheck, checkStartReading, DEFAULT_POLICY, festivalBalance, monthlyKm, type DayLog, type Mark } from "./field-attendance";
import type { WorkSessionRecord } from "./work-session";

const TZ = "Asia/Kolkata";
const at = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+05:30`).toISOString();
const S = (d: string, from: string, to: string | null, o: Partial<WorkSessionRecord> = {}): WorkSessionRecord => ({
  id: `${d}-${from}`, staffId: "n1", branchId: null, startedAt: at(d, from), endedAt: to ? at(d, to) : null, status: to ? "completed" : "open", breaks: [], lastSeenAt: at(d, to ?? from), ...o });
const NOW = new Date("2026-01-20T12:00:00+05:30").getTime();
const base = { staffId: "n1", ym: "2026-01", tz: TZ, nowMs: NOW, weeklyOff: null as number | null, policy: DEFAULT_POLICY };
const day = (m: ReturnType<typeof buildNinjaMonth>, d: string) => m.days.find((x) => x.date === d)!;

test("worked day = present with punches; short day = half day; today is not absent", () => {
  const m = buildNinjaMonth({ ...base, sessions: [S("2026-01-05", "10:46", "20:07"), S("2026-01-06", "10:00", "13:00")], logs: [], marks: [] });
  assert.equal(day(m, "2026-01-05").status, "present");
  assert.equal(day(m, "2026-01-06").status, "half_day");
  assert.equal(day(m, "2026-01-07").status, "absent");
  assert.equal(day(m, "2026-01-20").status, "pending");
  assert.equal(day(m, "2026-01-21").status, "future");
  const d5 = day(m, "2026-01-05");
  assert.equal(new Date(d5.punchIn!).toISOString(), at("2026-01-05", "10:46"));
  assert.equal(new Date(d5.punchOut!).toISOString(), at("2026-01-05", "20:07"));
});

test("marks, weekly off and pending requests", () => {
  const marks: Mark[] = [
    { staffId: "n1", day: "2026-01-08", kind: "casual_leave", status: "approved" },
    { staffId: "n1", day: "2026-01-09", kind: "festival_leave", status: "approved" },
    { staffId: "n1", day: "2026-01-10", kind: "casual_leave", status: "requested" },
    { staffId: "n1", day: "2026-01-12", kind: "casual_leave", status: "rejected" },
  ];
  const m = buildNinjaMonth({ ...base, weeklyOff: 0, sessions: [], logs: [], marks });
  assert.equal(day(m, "2026-01-08").status, "casual_leave");
  assert.equal(day(m, "2026-01-09").status, "festival_leave");
  assert.equal(day(m, "2026-01-10").status, "requested");
  assert.equal(day(m, "2026-01-04").status, "week_off"); // a Sunday
  assert.equal(day(m, "2026-01-12").status, "absent");   // rejected request does not excuse it
  assert.equal(m.summary.casualLeave, 1); assert.equal(m.summary.festivalLeave, 1); assert.equal(m.summary.requested, 1);
});

test("working on a leave day counts as present and is flagged", () => {
  const marks: Mark[] = [{ staffId: "n1", day: "2026-01-08", kind: "casual_leave", status: "approved" }];
  const m = buildNinjaMonth({ ...base, sessions: [S("2026-01-08", "10:00", "19:00")], logs: [], marks });
  assert.equal(day(m, "2026-01-08").status, "present");
  assert.equal(day(m, "2026-01-08").workedOnOff, true);
});

test("km, fuel at the sheet's 3.5 per km, missing readings and flags", () => {
  const logs: DayLog[] = [
    { staffId: "n1", day: "2026-01-05", startReading: 27948, endReading: 28040, travelledKm: 92 },
    { staffId: "n1", day: "2026-01-06", startReading: 28040, endReading: 28127, travelledKm: 87 },
    { staffId: "n1", day: "2026-01-07", startReading: 0, endReading: 400, travelledKm: 400 },
  ];
  const sessions = [S("2026-01-05", "11:00", "20:00"), S("2026-01-06", "11:00", "20:00"), S("2026-01-07", "11:00", "20:00"), S("2026-01-08", "11:00", "20:00")];
  const m = buildNinjaMonth({ ...base, sessions, logs, marks: [] });
  assert.equal(m.summary.totalKm, 579);
  assert.equal(m.summary.fuel, 2026.5);
  assert.equal(m.summary.present, 4);
  assert.equal(m.summary.missingReadings, 1); // 08 Jan has no log
  assert.equal(m.summary.flaggedDays, 1);     // 400 km
});

test("balances and the monthly km matrix", () => {
  const marks: Mark[] = [
    { staffId: "n1", day: "2026-01-02", kind: "festival_leave", status: "approved" },
    { staffId: "n1", day: "2026-03-02", kind: "festival_leave", status: "approved" },
    { staffId: "n1", day: "2026-03-09", kind: "festival_leave", status: "requested" },
    { staffId: "n1", day: "2025-12-25", kind: "festival_leave", status: "approved" },
    { staffId: "n1", day: "2026-01-09", kind: "casual_leave", status: "approved" },
  ];
  assert.deepEqual(festivalBalance(marks, "n1", 2026, DEFAULT_POLICY), { applicable: 8, taken: 2, requested: 1, available: 6 });
  assert.deepEqual(casualBalance(marks, "n1", "2026-01", DEFAULT_POLICY), { applicable: 1, used: 1, available: 0 });
  const logs: DayLog[] = [
    { staffId: "n1", day: "2026-01-05", startReading: 0, endReading: 92, travelledKm: 92 },
    { staffId: "n1", day: "2026-01-06", startReading: 0, endReading: 8, travelledKm: 8 },
    { staffId: "n1", day: "2026-02-06", startReading: 0, endReading: 50, travelledKm: 50 },
    { staffId: "n2", day: "2026-02-06", startReading: 0, endReading: 70, travelledKm: 70 },
  ];
  const k = monthlyKm(logs, "n1", 2026);
  assert.deepEqual([k[0], k[1], k[2]], [100, 50, 0]);
});

test("odometer validation", () => {
  assert.ok(checkStartReading(-1, null).error);
  assert.ok(checkStartReading(100.5, null).error);
  assert.ok(checkStartReading(27000, 27622).warn);
  assert.deepEqual(checkStartReading(27622, 27622), {});
  assert.ok(checkEndReading(27000, 27622).error);
  assert.ok(checkEndReading(29000, 27622).error);
  assert.ok(checkEndReading(28000, 27622).warn);
  assert.deepEqual(checkEndReading(27759, 27622), {});
});

test("GPS vs odometer cross-check", () => {
  assert.equal(kmCrossCheck(100, null), null);          // no GPS: nothing to compare
  assert.equal(kmCrossCheck(100, 5), null);             // too little GPS to judge
  assert.equal(kmCrossCheck(90, 120), "odo_below_gps"); // meter lower than tracked distance
  assert.equal(kmCrossCheck(110, 120), null);           // within tolerance
  assert.equal(kmCrossCheck(150, 30), "low_coverage");  // 20% tracked
  assert.equal(kmCrossCheck(150, 80), null);            // normal: GPS < odometer
  assert.equal(kmCrossCheck(40, 12), null);             // short day: coverage not judged
});

test("GPS km per Ninja per local day, and the check lands on the day cell", () => {
  const dayOf = (ms: number) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);
  const gps = gpsKmByDay([
    { ninja_id: "n1", distance_m: 30000, tracked_points: 40, completed_at: at("2026-01-05", "15:00"), arrived_at: null, journey_started_at: null, accepted_at: null },
    { ninja_id: "n1", distance_m: 20000, tracked_points: 10, completed_at: at("2026-01-05", "18:00"), arrived_at: null, journey_started_at: null, accepted_at: null },
    { ninja_id: "n1", distance_m: 9000, tracked_points: 0, completed_at: at("2026-01-05", "19:00"), arrived_at: null, journey_started_at: null, accepted_at: null }, // no points: ignored
    { ninja_id: "n2", distance_m: 5000, tracked_points: 3, completed_at: at("2026-01-05", "19:00"), arrived_at: null, journey_started_at: null, accepted_at: null },
  ], dayOf);
  assert.equal(gps.get("n1|2026-01-05"), 50);
  const logs: DayLog[] = [{ staffId: "n1", day: "2026-01-05", startReading: 0, endReading: 40, travelledKm: 40 }];
  const m = buildNinjaMonth({ ...base, sessions: [S("2026-01-05", "11:00", "20:00")], logs, marks: [], gps });
  const d = m.days.find((x) => x.date === "2026-01-05")!;
  assert.equal(d.gpsKm, 50); assert.equal(d.kmCheck, "odo_below_gps"); assert.equal(m.summary.kmChecks, 1);
});

test("a required odometer photo that is missing is flagged", () => {
  const logs: DayLog[] = [
    { staffId: "n1", day: "2026-01-05", startReading: 0, endReading: 40, travelledKm: 40, startPhoto: "o/s/5-start.jpg", endPhoto: null },
    { staffId: "n1", day: "2026-01-06", startReading: 0, endReading: 40, travelledKm: 40, startPhoto: "a", endPhoto: "b" },
  ];
  const m = buildNinjaMonth({ ...base, sessions: [], logs, marks: [] });
  assert.equal(m.summary.missingPhotos, 1);
  const off = buildNinjaMonth({ ...base, policy: { ...DEFAULT_POLICY, odometerPhotoRequired: false }, sessions: [], logs, marks: [] });
  assert.equal(off.summary.missingPhotos, 0);
});
