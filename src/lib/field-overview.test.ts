import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionItems, attentionMatches, todaySchedule, engineerWorkload, dailySeries, monthCompare, buildInsights, leaderboard, activityFeed, ymd } from "./field-overview";
import type { FieldJob, FieldJobEvent } from "./field-data";
import type { AggregateCtx } from "./field-dashboard";

let n = 0;
const job = (o: Partial<FieldJob>): FieldJob => ({
  id: `j${++n}`, jobNo: `FJ-${String(n).padStart(3, "0")}`, leadId: "", leadNo: "", customerId: "", linkedTicketId: "", linkedTicketDeviceId: "", linkedInvoiceId: "",
  leadType: "pickup", source: "", customer: "C", phone: "", email: "", device: "", modelId: "", category: "", issue: "", branch: "KOR",
  salesPersonId: "", salesPersonName: "", fieldManagerId: "", fieldManagerName: "", ninjaId: "", ninjaName: "", dropNinjaId: "", dropNinjaName: "",
  pickupAddress: "", pickupDate: "", pickupTime: "", dropAddress: "", dropDate: "", dropTime: "", status: "pending_assignment",
  notes: "", deliveryConfirmed: false, createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z", ...o,
});
const NOW = new Date(2026, 4, 15, 12, 0); // 15 May 2026
const inv: Record<string, { id: string; total: number }> = {};
const ctx: AggregateCtx = { finalizedInvoiceOf: (j) => inv[j.id] ?? null, storeKeyOf: (j) => ({ key: j.branch, label: j.branch }) };

test("attention: each rule, ordering by priority, cancelled ignored, ids reconcile with predicate", () => {
  const jobs = [
    job({ status: "out_for_pickup", pickupDate: "2026-05-10", ninjaId: "a", ninjaName: "Biju" }),     // delayed
    job({ status: "failed_drop", dropDate: "2026-05-15" }),                                           // failed
    job({ status: "pending_assignment" }),                                                            // unassigned
    job({ status: "at_store" }),                                                                      // no ticket
    job({ status: "at_store", linkedTicketId: "t1" }),                                                // ok
    job({ status: "ready_for_drop" }),                                                                // drop unassigned
    job({ status: "assigned", ninjaId: "a" }),                                                        // no date
    job({ status: "cancelled", pickupDate: "2026-05-01" }),                                           // ignored
  ];
  const items = attentionItems(jobs, NOW);
  assert.deepEqual(items.map((i) => i.key), ["delayed", "failed", "unassigned", "no_ticket", "drop_unassigned", "no_date"]);
  for (const it of items) {
    assert.equal(it.count, jobs.filter((j) => attentionMatches(it.key, j, NOW)).length, it.key);
    assert.equal(it.jobIds.length, it.count);
  }
  assert.equal(items.find((i) => i.key === "no_ticket")!.count, 1);
});

test("today's schedule: only today, time-ordered, untimed last, cancelled excluded", () => {
  const jobs = [
    job({ pickupDate: "2026-05-15", pickupTime: "15:00" }),
    job({ pickupDate: "2026-05-15", pickupTime: "09:30" }),
    job({ pickupDate: "2026-05-15" }),
    job({ pickupDate: "2026-05-16", pickupTime: "08:00" }),
    job({ pickupDate: "2026-05-15", status: "cancelled" }),
    job({ pickupDate: "2026-05-10", dropDate: "2026-05-15", dropTime: "11:00" }),
  ];
  const s = todaySchedule(jobs, NOW);
  assert.deepEqual(s.map((e) => e.time), ["09:30", "11:00", "15:00", ""]);
  assert.equal(s.find((e) => e.time === "11:00")!.leg, "drop");
});

test("workload: open per engineer, idle roster engineers are free, unassigned counted", () => {
  const jobs = [
    job({ ninjaId: "a", ninjaName: "Biju", status: "assigned", pickupDate: "2026-05-15" }),
    job({ ninjaId: "a", ninjaName: "Biju", status: "picked_up" }),
    job({ ninjaId: "a", ninjaName: "Biju", status: "completed", pickupDate: "2026-05-03" }),
    job({ ninjaId: "b", ninjaName: "Irfan", status: "assigned" }),
    job({ status: "pending_assignment" }),
  ];
  const w = engineerWorkload(jobs, [{ id: "c", name: "Chandru" }], NOW);
  assert.equal(w.unassigned, 1);
  const biju = w.rows.find((r) => r.id === "a")!;
  assert.equal(biju.open, 2); assert.equal(biju.today, 1); assert.equal(biju.doneThisMonth, 1);
  assert.equal(w.rows.find((r) => r.id === "c")!.free, true);
  assert.equal(w.rows[0].id, "a");
});

test("daily series: 14 days, buckets by trip date, business once per invoice", () => {
  const a = job({ pickupDate: "2026-05-15", status: "completed" });
  const b = job({ pickupDate: "2026-05-15", status: "completed" });
  const c = job({ pickupDate: "2026-05-01", status: "completed" }); // outside the 14-day window
  inv[a.id] = { id: "I1", total: 1000 }; inv[b.id] = { id: "I1", total: 1000 };
  const s = dailySeries([a, b, c], ctx, 14, NOW);
  assert.equal(s.length, 14);
  assert.equal(s[13].date, "2026-05-15");
  assert.equal(s[13].scheduled, 2); assert.equal(s[13].completed, 2); assert.equal(s[13].business, 1000);
  assert.equal(s.reduce((x, p) => x + p.scheduled, 0), 2);
});

test("month compare: deltas computed only when a previous value exists", () => {
  const cur1 = job({ pickupDate: "2026-05-05", status: "completed", ninjaId: "a" });
  const cur2 = job({ pickupDate: "2026-05-06", status: "assigned", ninjaId: "a" });
  const prev1 = job({ pickupDate: "2026-04-05", status: "completed", ninjaId: "a" });
  inv[cur1.id] = { id: "C1", total: 1500 }; inv[prev1.id] = { id: "P1", total: 1000 };
  const m = monthCompare([cur1, cur2, prev1], ctx, NOW);
  assert.equal(m.current.trips, 2); assert.equal(m.previous.trips, 1);
  assert.equal(m.tripsDelta, 100); assert.equal(m.businessDelta, 50);
  assert.equal(m.current.completionRate, 50); assert.equal(m.previous.completionRate, 100); assert.equal(m.rateDeltaPts, -50);
  const none = monthCompare([cur1], ctx, NOW);
  assert.equal(none.tripsDelta, null);
});

test("insights are factual and bounded", () => {
  const jobs = [job({ status: "pending_assignment" }), job({ status: "out_for_pickup", pickupDate: "2026-05-01" })];
  const attention = attentionItems(jobs, NOW);
  const compare = monthCompare(jobs, ctx, NOW);
  const wl = engineerWorkload(jobs, [{ id: "z", name: "Zed" }], NOW);
  const ins = buildInsights({ attention, compare, workload: wl, today: [] });
  assert.ok(ins.some((i) => /delayed/.test(i.text)));
  assert.ok(ins.some((i) => /waiting for an engineer/.test(i.text) && /Zed/.test(i.text)));
  assert.ok(ins.length <= 5);
  assert.deepEqual(buildInsights({ attention: [], compare: monthCompare([], ctx, NOW), workload: { rows: [], unassigned: 0 }, today: [] }), []);
});

test("leaderboard excludes the Unassigned bucket; activity feed newest first", () => {
  const rows = leaderboard([job({ status: "completed", ninjaId: "a", ninjaName: "Biju", pickupDate: "2026-05-02" }), job({ pickupDate: "2026-05-03" })], "engineer", ctx, NOW);
  assert.deepEqual(rows.map((r) => r.label), ["Biju"]);
  const ev = (id: string, at: string): FieldJobEvent => ({ id, jobId: "j", jobNo: "FJ-1", leadId: "", kind: "status_changed", previous: null, next: null, note: "", source: "", actorId: "", actorName: "Ann", occurredAt: at });
  assert.deepEqual(activityFeed([ev("a", "2026-05-01"), ev("b", "2026-05-03"), ev("c", "2026-05-02")], () => "x", 2).map((f) => f.id), ["b", "c"]);
  assert.equal(ymd(NOW), "2026-05-15");
});
