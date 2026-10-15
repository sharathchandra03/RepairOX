import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type WorkSessionRecord,
  STALE_MS,
  elapsedMs,
  breakMs,
  netMs,
  sessionDurations,
  splitAcrossLocalDates,
  aggregateDay,
  summarize,
} from "./work-session";

const HOUR = 3_600_000;
const MIN = 60_000;
const IST = "Asia/Kolkata"; // UTC+5:30, no DST
const NY = "America/New_York"; // UTC-5/-4

function session(patch: Partial<WorkSessionRecord> = {}): WorkSessionRecord {
  return {
    id: "s1",
    staffId: "staff-1",
    branchId: "store-a",
    startedAt: "2026-01-10T09:00:00.000Z",
    endedAt: null,
    status: "open",
    breaks: [],
    lastSeenAt: "2026-01-10T09:00:00.000Z",
    ...patch,
  };
}

// 1. Single session, no breaks → elapsed = net.
test("single completed session, no breaks → elapsed == net", () => {
  const s = session({
    startedAt: "2026-01-10T09:00:00.000Z",
    endedAt: "2026-01-10T17:00:00.000Z",
    status: "completed",
    lastSeenAt: "2026-01-10T17:00:00.000Z",
  });
  const nowMs = new Date("2026-01-10T20:00:00.000Z").getTime();
  const d = sessionDurations(s, nowMs, STALE_MS);
  assert.equal(d.elapsedMs, 8 * HOUR);
  assert.equal(d.breakMs, 0);
  assert.equal(d.netMs, 8 * HOUR);
  assert.equal(d.confidence, "confirmed");
  assert.equal(d.isInterrupted, false);
  assert.equal(d.isOpen, false);
});

// 2. Worked example §23: 09:00 start, breaks 11:00–11:15 & 14:00–14:30, 18:00 end.
test("worked example → elapsed 9h / break 45m / net 8h15m (exact)", () => {
  const s = session({
    startedAt: "2026-01-10T09:00:00.000Z",
    endedAt: "2026-01-10T18:00:00.000Z",
    status: "completed",
    lastSeenAt: "2026-01-10T18:00:00.000Z",
    breaks: [
      { startedAt: "2026-01-10T11:00:00.000Z", endedAt: "2026-01-10T11:15:00.000Z" },
      { startedAt: "2026-01-10T14:00:00.000Z", endedAt: "2026-01-10T14:30:00.000Z" },
    ],
  });
  const nowMs = new Date("2026-01-11T00:00:00.000Z").getTime();
  const d = sessionDurations(s, nowMs, STALE_MS);
  assert.equal(d.elapsedMs, 9 * HOUR);
  assert.equal(d.breakMs, 45 * MIN);
  assert.equal(d.netMs, 8 * HOUR + 15 * MIN);
});

// 3. Multiple sessions same day → aggregated; no double count.
test("multiple sessions same local day aggregate without double counting", () => {
  const a = session({
    id: "a",
    startedAt: "2026-01-10T09:00:00.000Z",
    endedAt: "2026-01-10T12:00:00.000Z",
    status: "completed",
    lastSeenAt: "2026-01-10T12:00:00.000Z",
  });
  const b = session({
    id: "b",
    startedAt: "2026-01-10T13:00:00.000Z",
    endedAt: "2026-01-10T17:00:00.000Z",
    status: "completed",
    lastSeenAt: "2026-01-10T17:00:00.000Z",
  });
  const nowMs = new Date("2026-01-11T06:00:00.000Z").getTime();
  // 2026-01-10 UTC 09:00 == IST 14:30 → local date 2026-01-10.
  const agg = aggregateDay([a, b, a], "2026-01-10", IST, nowMs, STALE_MS);
  assert.equal(agg.sessionCount, 2); // de-duped
  assert.equal(agg.elapsedMs, 3 * HOUR + 4 * HOUR);
  assert.equal(agg.netMs, 7 * HOUR);
});

// 4. Multiple breaks summed; an open break contributes 0 to persisted break.
test("open break contributes 0 to persisted break total", () => {
  const s = session({
    startedAt: "2026-01-10T09:00:00.000Z",
    endedAt: null,
    status: "open",
    lastSeenAt: "2026-01-10T12:00:00.000Z",
    breaks: [
      { startedAt: "2026-01-10T10:00:00.000Z", endedAt: "2026-01-10T10:20:00.000Z" }, // 20m closed
      { startedAt: "2026-01-10T11:30:00.000Z", endedAt: null }, // open → 0
    ],
  });
  assert.equal(breakMs(s), 20 * MIN);
  // net uses elapsed − closed-break only.
  const nowMs = new Date("2026-01-10T12:10:00.000Z").getTime();
  assert.equal(netMs(elapsedMs(s, nowMs, STALE_MS), breakMs(s)), (nowMs - new Date(s.startedAt).getTime()) - 20 * MIN);
});

// 5. Open session (healthy) → provisional, elapsed = now − start.
test("open healthy session → provisional, elapsed = now − start", () => {
  const start = "2026-01-10T09:00:00.000Z";
  const s = session({ startedAt: start, endedAt: null, status: "open", lastSeenAt: "2026-01-10T11:55:00.000Z" });
  const nowMs = new Date("2026-01-10T12:00:00.000Z").getTime(); // 5m since lastSeen < STALE
  const d = sessionDurations(s, nowMs, STALE_MS);
  assert.equal(d.isOpen, true);
  assert.equal(d.isInterrupted, false);
  assert.equal(d.confidence, "provisional");
  assert.equal(d.elapsedMs, nowMs - new Date(start).getTime());
});

// 6. Midnight crossing (local) split across two local dates in IST.
test("midnight crossing splits across two local dates; sum == whole", () => {
  // IST local 23:00 2026-01-10 → UTC 17:30; IST local 02:00 2026-01-11 → UTC 20:30.
  const s = session({
    startedAt: "2026-01-10T17:30:00.000Z",
    endedAt: "2026-01-10T20:30:00.000Z",
    status: "completed",
    lastSeenAt: "2026-01-10T20:30:00.000Z",
  });
  const nowMs = new Date("2026-01-12T00:00:00.000Z").getTime();
  const parts = splitAcrossLocalDates(s, IST, nowMs, STALE_MS);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.date), ["2026-01-10", "2026-01-11"]);
  const whole = new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime();
  assert.equal(parts.reduce((a, p) => a + p.elapsedMs, 0), whole);
  assert.equal(parts[0].elapsedMs, 1 * HOUR); // 23:00 → midnight
  assert.equal(parts[1].elapsedMs, 2 * HOUR); // midnight → 02:00
});

// 7a. Explicit interrupted (endedAt=null) → cutoff is lastSeenAt, NOT now.
test("explicit interrupted session uses lastSeenAt cutoff, never now", () => {
  const start = "2026-01-10T09:00:00.000Z";
  const lastSeen = "2026-01-10T12:00:00.000Z"; // 3h after start
  const s = session({ startedAt: start, endedAt: null, status: "interrupted", lastSeenAt: lastSeen });
  const nowMs = new Date("2026-01-10T20:00:00.000Z").getTime(); // far past lastSeen
  const d = sessionDurations(s, nowMs, STALE_MS);
  assert.equal(d.isInterrupted, true);
  assert.equal(d.confidence, "estimated");
  assert.equal(d.elapsedMs, new Date(lastSeen).getTime() - new Date(start).getTime());
  assert.equal(d.elapsedMs, 3 * HOUR);
  assert.notEqual(d.elapsedMs, nowMs - new Date(start).getTime());
});

// 7b. Derived interrupted (open + stale) → same lastSeenAt cutoff.
test("derived interrupted (open & stale) uses lastSeenAt cutoff", () => {
  const start = "2026-01-10T09:00:00.000Z";
  const lastSeen = "2026-01-10T11:00:00.000Z"; // 2h after start
  const s = session({ startedAt: start, endedAt: null, status: "open", lastSeenAt: lastSeen });
  // now is 2h past lastSeen → > STALE_MS (30m).
  const nowMs = new Date("2026-01-10T13:00:00.000Z").getTime();
  const d = sessionDurations(s, nowMs, STALE_MS);
  assert.equal(d.isInterrupted, true);
  assert.equal(d.confidence, "estimated");
  assert.equal(d.elapsedMs, new Date(lastSeen).getTime() - new Date(start).getTime());
  assert.equal(d.elapsedMs, 2 * HOUR);
});

// 8. Open & NOT stale → provisional, elapsed = now − start (proves healthy path).
test("open and not stale → provisional path uses now", () => {
  const start = "2026-01-10T09:00:00.000Z";
  const lastSeen = "2026-01-10T09:50:00.000Z";
  const s = session({ startedAt: start, endedAt: null, status: "open", lastSeenAt: lastSeen });
  const nowMs = new Date("2026-01-10T10:00:00.000Z").getTime(); // 10m since lastSeen < STALE
  const d = sessionDurations(s, nowMs, STALE_MS);
  assert.equal(d.isInterrupted, false);
  assert.equal(d.confidence, "provisional");
  assert.equal(d.elapsedMs, nowMs - new Date(start).getTime());
});

// 9. tz sensitivity: same UTC span splits differently under two tz strings.
test("tz sensitivity: same span splits differently per IANA tz", () => {
  // UTC 20:00 2026-01-10 → 22:00 same day NY (-?) vs 01:30 next day IST.
  const s = session({
    startedAt: "2026-01-10T20:00:00.000Z",
    endedAt: "2026-01-10T23:00:00.000Z",
    status: "completed",
    lastSeenAt: "2026-01-10T23:00:00.000Z",
  });
  const nowMs = new Date("2026-01-12T00:00:00.000Z").getTime();
  const ist = splitAcrossLocalDates(s, IST, nowMs, STALE_MS);
  const ny = splitAcrossLocalDates(s, NY, nowMs, STALE_MS);
  // IST: 20:00Z=01:30 IST(11th), 23:00Z=04:30 IST(11th) → one local date.
  assert.deepEqual(ist.map((p) => p.date), ["2026-01-11"]);
  // NY (EST -5): 20:00Z=15:00(10th), 23:00Z=18:00(10th) → one local date (the 10th).
  assert.deepEqual(ny.map((p) => p.date), ["2026-01-10"]);
  assert.notDeepEqual(ist.map((p) => p.date), ny.map((p) => p.date));
});

// 10. Interrupted + midnight crossing → split up to lastSeenAt, never now.
test("interrupted + midnight: split up to lastSeenAt, never now, no fabricated end", () => {
  // IST local start 23:00 2026-01-10 → UTC 17:30 2026-01-10.
  // lastSeen IST 01:30 2026-01-11 → UTC 20:00 2026-01-10. (2h30m span)
  const start = "2026-01-10T17:30:00.000Z";
  const lastSeen = "2026-01-10T20:00:00.000Z";
  const s = session({ startedAt: start, endedAt: null, status: "open", lastSeenAt: lastSeen });
  // now is far later (+12h) and > STALE → derived interrupted.
  const nowMs = new Date("2026-01-11T08:00:00.000Z").getTime();
  const parts = splitAcrossLocalDates(s, IST, nowMs, STALE_MS);
  assert.deepEqual(parts.map((p) => p.date), ["2026-01-10", "2026-01-11"]);
  const estimatedSpan = new Date(lastSeen).getTime() - new Date(start).getTime();
  assert.equal(estimatedSpan, 2 * HOUR + 30 * MIN);
  assert.equal(parts.reduce((a, p) => a + p.elapsedMs, 0), estimatedSpan);
  assert.equal(parts[0].elapsedMs, 1 * HOUR); // 23:00 → midnight IST
  assert.equal(parts[1].elapsedMs, 1 * HOUR + 30 * MIN); // midnight → 01:30 IST
  // Confirm none of the parts reaches `now`.
  const fabricated = new Date(start).getTime() + (nowMs - new Date(start).getTime());
  assert.notEqual(parts.reduce((a, p) => a + p.elapsedMs, 0), fabricated - new Date(start).getTime());
});

// Bonus: summarize across interrupted + completed sessions.
test("summarize counts completed vs interrupted and workdays", () => {
  const a = session({
    id: "a",
    startedAt: "2026-01-10T09:00:00.000Z",
    endedAt: "2026-01-10T17:00:00.000Z",
    status: "completed",
    lastSeenAt: "2026-01-10T17:00:00.000Z",
  });
  const b = session({
    id: "b",
    startedAt: "2026-01-11T09:00:00.000Z",
    endedAt: null,
    status: "interrupted",
    lastSeenAt: "2026-01-11T11:00:00.000Z",
  });
  const nowMs = new Date("2026-01-12T00:00:00.000Z").getTime();
  const sum = summarize([a, b], nowMs, STALE_MS, IST);
  assert.equal(sum.sessionCount, 2);
  assert.equal(sum.completedCount, 1);
  assert.equal(sum.interruptedCount, 1);
  assert.equal(sum.totalNetMs, 8 * HOUR + 2 * HOUR);
  assert.ok(sum.workdays >= 2);
});
