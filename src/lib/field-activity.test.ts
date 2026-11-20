import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttention, isBehindPace, projectedTrips, todayState } from "./field-activity";
import { monthDays, type DayCell, type Mark, type NinjaMonth } from "./field-attendance";

const cell = (date: string, o: Partial<DayCell> = {}): DayCell => ({ date, status: "present", punchIn: null, punchOut: null, netMs: 0, estimated: false, startReading: null, endReading: null, km: null,
  workedOnOff: false, missingReading: false, kmFlag: false, gpsKm: null, kmCheck: null, startPhoto: null, endPhoto: null, missingPhoto: false, ...o });
const month = (o: Record<string, Partial<DayCell>> = {}): NinjaMonth => {
  const days = monthDays("2026-01").map((d) => cell(d, o[d]));
  const c = (f: (d: DayCell) => boolean) => days.filter(f).length;
  return { staffId: "n1", days, summary: { present: 0, absent: 0, weekOff: 0, casualLeave: 0, festivalLeave: 0, halfDay: 0, requested: 0, totalKm: 0, fuel: 0,
    missingReadings: c((d) => d.missingReading), flaggedDays: 0, kmChecks: c((d) => !!d.kmCheck), missingPhotos: c((d) => d.missingPhoto) } };
};
const O = { today: "2026-01-20", ym: "2026-01", hourNow: 15, running: true, elapsedDays: 20, daysInMonth: 31 };

test("today's state", () => {
  assert.equal(todayState(cell("d", { punchIn: 1, punchOut: null })).label, "On duty");
  assert.equal(todayState(cell("d", { punchIn: 1, punchOut: 2 })).label, "Shift ended");
  assert.equal(todayState(cell("d", { status: "pending" })).label, "Not started");
  assert.equal(todayState(cell("d", { status: "festival_leave" })).label, "On leave");
  assert.equal(todayState(undefined).label, "—");
});

test("pace projection and the behind-pace rule", () => {
  assert.equal(projectedTrips(40, 20, 31), 62);
  assert.equal(isBehindPace({ trips: 30, gate: 60, elapsedDays: 20, daysInMonth: 31, running: true }), true);
  assert.equal(isBehindPace({ trips: 45, gate: 60, elapsedDays: 20, daysInMonth: 31, running: true }), false); // projects 70
  assert.equal(isBehindPace({ trips: 5, gate: 60, elapsedDays: 4, daysInMonth: 31, running: true }), false);   // too early to say
  assert.equal(isBehindPace({ trips: 30, gate: 60, elapsedDays: 31, daysInMonth: 31, running: false }), false); // finished month
  assert.equal(isBehindPace({ trips: 60, gate: 60, elapsedDays: 20, daysInMonth: 31, running: true }), false);
});

test("needs-attention inbox: kinds, severity order and short-notice leave", () => {
  const req: Mark = { id: "m1", staffId: "n1", day: "2026-01-22", kind: "casual_leave", status: "requested", requestedAt: "2026-01-20T08:00:00Z" };
  const items = buildAttention([
    { staffId: "n1", name: "Adil", casualNoticeDays: 7, trips: 20, gate: 60, requests: [req],
      month: month({ "2026-01-05": { missingReading: true }, "2026-01-06": { kmCheck: "odo_below_gps" }, "2026-01-07": { missingPhoto: true }, "2026-01-20": { status: "pending" } }) },
    { staffId: "n2", name: "Biju", casualNoticeDays: 7, trips: 55, gate: 60, requests: [], month: month() },
  ], O);
  const kinds = items.map((i) => i.kind);
  assert.deepEqual(new Set(kinds), new Set(["leave_request", "gps_check", "missing_reading", "missing_photo", "no_shift", "behind_pace"]));
  assert.equal(items[0].kind, "gps_check");                       // severity 1 first
  assert.match(items.find((i) => i.kind === "leave_request")!.text, /short notice/);
  assert.equal(items.filter((i) => i.staffId === "n2").length, 0); // Biju is on pace and clean
  assert.equal(buildAttention([{ staffId: "n1", name: "Adil", casualNoticeDays: 7, trips: 60, gate: 60, requests: [], month: month({ "2026-01-20": { status: "pending" } }) }], { ...O, hourNow: 9 }).length, 0); // too early for "not started"
});
