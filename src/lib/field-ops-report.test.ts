import { test } from "node:test";
import assert from "node:assert/strict";
import { ninjaRows, storeRows, turnaround, repairTurnaround, median, fmtDur, type RTrip, type RAssignment, type REvent } from "./field-ops-report";

const T = (o: Partial<RTrip>): RTrip => ({ id: "t", job_id: "j", trip_type: "pickup", status: "completed", ninja_id: "n1", branch_id: "b1",
  assigned_at: null, accepted_at: null, journey_started_at: null, arrived_at: null, completed_at: null, created_at: "2026-01-01T10:00:00Z", ...o });

test("median handles even/odd/empty", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("ninja rows: accept/reject/reassign and completion from real rows", () => {
  const trips = [T({ id: "a", status: "completed", journey_started_at: "2026-01-01T10:00:00Z", completed_at: "2026-01-01T11:00:00Z" }), T({ id: "b", status: "failed_attempt" })];
  const asg: RAssignment[] = [
    { trip_id: "a", ninja_id: "n1", outcome: "accepted", assigned_at: "2026-01-01T09:00:00Z", responded_at: "2026-01-01T09:10:00Z" },
    { trip_id: "b", ninja_id: "n1", outcome: "accepted", assigned_at: "2026-01-01T09:00:00Z", responded_at: "2026-01-01T09:30:00Z" },
    { trip_id: "c", ninja_id: "n1", outcome: "rejected", assigned_at: "2026-01-01T09:00:00Z", responded_at: "2026-01-01T09:01:00Z" },
  ];
  const [r] = ninjaRows(trips, asg);
  assert.equal(r.assignments, 3); assert.equal(r.accepted, 2); assert.equal(r.rejected, 1);
  assert.equal(r.completed, 1); assert.equal(r.failed, 1); assert.equal(r.completionRate, 0.5);
  assert.equal(r.medianAcceptMs, 20 * 60000);
  assert.equal(r.medianTripMs, 3600000);
});

test("missing timestamps are excluded, never zero", () => {
  const [r] = ninjaRows([T({ id: "a", status: "completed" })], [{ trip_id: "a", ninja_id: "n1", outcome: "accepted", assigned_at: "2026-01-01T09:00:00Z", responded_at: null }]);
  assert.equal(r.medianAcceptMs, null); assert.equal(r.medianTripMs, null);
  assert.equal(fmtDur(null), "—");
});

test("store business counts only finalized invoices, once per job", () => {
  const trips = [T({ id: "p", job_id: "j1" }), T({ id: "d", job_id: "j1", trip_type: "drop" }), T({ id: "x", job_id: "j2", status: "awaiting_assignment" })];
  const jobs = [{ id: "j1", branch_id: "b1", linked_ticket_id: "tk1" }, { id: "j2", branch_id: "b1", linked_ticket_id: "tk2" }];
  const inv = [{ id: "i1", ticketId: "tk1", total: 1000, status: "paid" }, { id: "i2", ticketId: "tk2", total: 500, status: "draft" }, { id: "i3", ticketId: "tk1", total: 99, status: "paid", documentType: "proforma" }];
  const [r] = storeRows(trips, jobs, inv);
  assert.equal(r.total, 3); assert.equal(r.pickup, 2); assert.equal(r.drop, 1); assert.equal(r.pending, 1);
  assert.equal(r.business, 1000); assert.equal(r.invoices, 1);
});

test("turnaround uses first occurrence and only trips reaching both points", () => {
  const trips = [T({ id: "a" }), T({ id: "b" })];
  const ev: REvent[] = [
    { trip_id: "a", new_status: "assigned", occurred_at: "2026-01-01T10:10:00Z" },
    { trip_id: "a", new_status: "accepted", occurred_at: "2026-01-01T10:20:00Z" },
    { trip_id: "a", new_status: "assigned", occurred_at: "2026-01-01T12:00:00Z" },
    { trip_id: "b", new_status: "assigned", occurred_at: "2026-01-01T10:30:00Z" },
  ];
  const ta = turnaround(trips, ev);
  const ca = ta.find((x) => x.key === "create_assign")!;
  assert.equal(ca.samples, 2); assert.equal(ca.medianMs, 20 * 60000);
  const aa = ta.find((x) => x.key === "assign_accept")!;
  assert.equal(aa.samples, 1); assert.equal(aa.medianMs, 10 * 60000);
});

test("repair turnaround: store received to drop created", () => {
  const trips = [T({ id: "p", job_id: "j" }), T({ id: "d", job_id: "j", trip_type: "drop", created_at: "2026-01-02T10:00:00Z" })];
  const r = repairTurnaround(trips, [{ trip_id: "p", new_status: "store_received", occurred_at: "2026-01-01T10:00:00Z" }]);
  assert.equal(r.samples, 1); assert.equal(r.medianMs, 864e5);
});
