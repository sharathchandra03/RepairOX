import { test } from "node:test";
import assert from "node:assert/strict";
import { avgRating, isXlLeg, ninjaDayRows, ninjaPeriodRows, storeDayRows, sumDayRows, pickableDays, isNewerIphone, isMacBook, type Leg } from "./field-daily-activity";

const L = (o: Partial<Leg>): Leg => ({ id: Math.random().toString(), jobId: "j", type: "pickup", status: "completed", ninjaId: "n1", date: "2026-11-17",
  storeKey: "s1", storeLabel: "Koramangala", warranty: false, device: "", distanceM: null, ...o });
const name = (id: string) => id;

test("device matchers", () => {
  assert.equal(isMacBook("Apple MacBook Air M2"), true);
  assert.equal(isNewerIphone("iPhone 15 Pro"), true);
  assert.equal(isNewerIphone("iPhone 14"), false);
  assert.equal(isNewerIphone("iPhone 11"), false);
  assert.equal(isNewerIphone("Galaxy S23"), false);
});

test("day row: new vs warranty, completed, total, cancelled ignored, 6+ flag", () => {
  const legs = [
    ...Array.from({ length: 3 }, () => L({ type: "pickup" })),
    L({ type: "drop" }), L({ type: "drop", status: "assigned" }),
    L({ type: "pickup", warranty: true }),
    L({ type: "onsite", status: "cancelled" }),
    L({ type: "pickup", date: "2026-11-16" }),
    L({ ninjaId: "n2", type: "drop" }),
  ];
  const rows = ninjaDayRows(legs, "2026-11-17", name);
  const a = rows.find((r) => r.ninjaId === "n1")!;
  assert.deepEqual([a.pickup.assigned, a.pickup.completed, a.drop.assigned, a.drop.completed, a.warrantyPickup, a.onsite.assigned], [3, 3, 2, 1, 1, 0]);
  assert.equal(a.total, 6); assert.equal(a.hit6, true); assert.equal(a.hit9, false);
  assert.equal(rows[0].ninjaId, "n1"); // busiest first
  assert.equal(sumDayRows(rows).total, 7);
});

test("km: null when untracked, summed and rounded when tracked", () => {
  assert.equal(ninjaDayRows([L({})], "2026-11-17", name)[0].km, null);
  const r = ninjaDayRows([L({ distanceM: 12400 }), L({ distanceM: 30000 })], "2026-11-17", name)[0];
  assert.equal(r.km, 42);
});

test("period row counts qualifying days and device buckets", () => {
  const day = (d: string, n: number) => Array.from({ length: n }, () => L({ date: d, device: "iPhone 15" }));
  const legs = [...day("2026-11-01", 9), ...day("2026-11-02", 6), ...day("2026-11-03", 2), L({ date: "2026-12-01" }), L({ date: "2026-11-04", device: "MacBook Pro" })];
  const r = ninjaPeriodRows(legs, "2026-11-01", "2026-11-30", name)[0];
  assert.equal(r.total, 18); assert.equal(r.days6, 2); assert.equal(r.days9, 1); assert.equal(r.activeDays, 4);
  assert.equal(r.iphone, 17); assert.equal(r.macbook, 1);
});

test("store day rows", () => {
  const rows = storeDayRows([L({}), L({ type: "drop", status: "assigned" }), L({ storeKey: "s2", storeLabel: "Indiranagar", type: "onsite" }), L({ status: "cancelled" })], "2026-11-17");
  const k = rows.find((r) => r.key === "s1")!;
  assert.deepEqual([k.total, k.completed, k.pickup.completed, k.drop.assigned], [2, 1, 1, 1]);
});

test("pickable days are clipped to today and newest first", () => {
  const d = pickableDays("2026-11-01", "2026-11-30", new Date(2026, 10, 3));
  assert.deepEqual(d, ["2026-11-03", "2026-11-02", "2026-11-01"]);
});

test("buyback is its own column and still counts in the total", () => {
  const r = ninjaDayRows([L({ type: "pickup", buyback: true }), L({ type: "pickup", buyback: true, status: "assigned" }), L({ type: "pickup" })], "2026-11-17", name)[0];
  assert.deepEqual([r.buyback.assigned, r.buyback.completed, r.pickup.assigned, r.total], [2, 1, 1, 3]);
});

test("XL = tracked distance above 40 km; untracked is never XL", () => {
  assert.equal(isXlLeg({ distanceM: 40000 }), false);
  assert.equal(isXlLeg({ distanceM: 40100 }), true);
  assert.equal(isXlLeg({ distanceM: null }), false);
  const r = ninjaDayRows([L({ distanceM: 55000 }), L({ distanceM: 12000 }), L({ distanceM: null })], "2026-11-17", name)[0];
  assert.equal(r.xl, 1);
});

test("reviews: count and average stars", () => {
  const r = ninjaDayRows([L({ rating: 5 }), L({ rating: 4 }), L({ rating: null }), L({})], "2026-11-17", name)[0];
  assert.deepEqual([r.reviews, avgRating(r)], [2, 4.5]);
  assert.equal(avgRating(ninjaDayRows([L({})], "2026-11-17", name)[0]), null);
  const t = sumDayRows(ninjaDayRows([L({ rating: 5 }), L({ ninjaId: "n2", rating: 3 })], "2026-11-17", name));
  assert.equal(avgRating(t), 4);
});
