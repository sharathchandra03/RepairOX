import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNinjaPay, DEFAULT_PLAN, deviceEligible, planFor, salaryFor, tripWeight, type PayInput, type PayPlan, type PayTrip, type PlanRow, type SalaryRow } from "./field-incentives";
import { monthDays, type DayCell, type DayStatus, type NinjaMonth } from "./field-attendance";

const YM = "2026-01"; // 1 Jan 2026 is a Thursday; Sundays: 4, 11, 18, 25
const NOW = new Date("2026-01-31T20:00:00+05:30").getTime();
const cell = (date: string, status: DayStatus = "present", km: number | null = null): DayCell => ({
  date, status, punchIn: null, punchOut: null, netMs: 0, estimated: false, startReading: null, endReading: null, km, workedOnOff: false,
  missingReading: false, kmFlag: false, gpsKm: null, kmCheck: null, startPhoto: null, endPhoto: null, missingPhoto: false });
const month = (o: Record<string, Partial<DayCell>> = {}, status: DayStatus = "present"): NinjaMonth => ({
  staffId: "n1", summary: {} as NinjaMonth["summary"], days: monthDays(YM).map((d) => ({ ...cell(d, status), ...(o[d] ?? {}) })) });
let id = 0;
const trip = (date: string, o: Partial<PayTrip> = {}): PayTrip => ({ id: String(++id), staffId: "n1", date, type: "pickup", crowKm: 5, devices: [], ...o });
const tripsOn = (date: string, n: number, o: Partial<PayTrip> = {}) => Array.from({ length: n }, () => trip(date, o));
const base = (o: Partial<PayInput> = {}): PayInput => ({
  staffId: "n1", ym: YM, tz: "Asia/Kolkata", nowMs: NOW, month: month(), trips: [], reviews: [], plans: [], salaries: [], deviceLists: [],
  organicLeads: 0, adjustments: [], ...o });
/** Filler trips on days 13-30 (never a Sunday), 3 a day, so tests can reach the monthly target without touching days 1-12. */
const filler = (total: number): PayTrip[] => {
  const ds = monthDays(YM).filter((d) => Number(d.slice(8)) >= 13 && ![18, 25].includes(Number(d.slice(8))));
  const out: PayTrip[] = []; for (let k = 0; out.length < total; k++) out.push(...tripsOn(ds[k % ds.length], Math.min(3, total - out.length))); return out;
};
const spread = (total: number, perDay: number): PayTrip[] => { // `perDay` trips per weekday-ish day until `total`
  const out: PayTrip[] = []; const ds = monthDays(YM).filter((d) => ![4, 11, 18, 25].includes(Number(d.slice(8))));
  for (let k = 0; out.length < total; k++) out.push(...tripsOn(ds[k % ds.length], Math.min(perDay, total - out.length))); return out;
};

test("slab trips are paid slab-wise from trip 61", () => {
  const p100 = computeNinjaPay(base({ trips: spread(100, 4) }));
  assert.equal(p100.gatePassed, true); assert.equal(p100.slab, 20 * 30 + 20 * 50);
  const p110 = computeNinjaPay(base({ trips: spread(110, 4) }));
  assert.equal(p110.slab, 20 * 30 + 20 * 50 + 10 * 70);
  assert.equal(computeNinjaPay(base({ trips: spread(60, 4) })).slab, 0); // 60 is eligible but earns nothing beyond
});

test("below the monthly target only petrol is paid; the rest is shown as locked", () => {
  const m = month({ "2026-01-05": { km: 90 } });
  const p = computeNinjaPay(base({ month: m, trips: [...tripsOn("2026-01-05", 9), ...spread(30, 3)] }));
  assert.equal(p.gatePassed, false); assert.equal(p.tripsToGate, 60 - p.trips);
  assert.equal(p.incentives, 0); assert.equal(p.daily, 0); assert.equal(p.petrol, 315);
  assert.ok(p.locked >= 300);
});

test("daily 6+/9+ pays per DAY at the highest tier; Sunday has its own structure", () => {
  const trips = [...tripsOn("2026-01-05", 6), ...tripsOn("2026-01-06", 9), ...tripsOn("2026-01-07", 5), ...tripsOn("2026-01-11", 9), ...filler(40)];
  const p = computeNinjaPay(base({ trips }));
  const d = (x: string) => p.days.find((y) => y.date === x)!;
  assert.equal(d("2026-01-05").daily, 200); assert.equal(d("2026-01-06").daily, 300); assert.equal(d("2026-01-07").daily, 0);
  assert.equal(d("2026-01-11").daily, 0); assert.equal(d("2026-01-11").sunday, 300); // Sunday: 300 flat, no 6+/9+
  const off = computeNinjaPay(base({ trips, plans: [{ staffId: null, effectiveFrom: "2026-01-01", config: { sundayReplacesDaily: false } }] }));
  assert.equal(off.days.find((y) => y.date === "2026-01-11")!.daily, 300);
});

test("Sunday money needs a month with no absence", () => {
  const trips = [...tripsOn("2026-01-04", 3), ...spread(60, 4)];
  const ok = computeNinjaPay(base({ trips }));
  assert.equal(ok.sundaysWorked, 4); assert.equal(ok.sunday, 1200); // every Sunday of the month was worked
  const bad = computeNinjaPay(base({ trips, month: month({ "2026-01-02": { status: "absent" } }) }));
  assert.equal(bad.sunday, 0); assert.equal(bad.absences, 1);
});

test("long trips count as several trips (one way, with the 1.5 km tolerance)", () => {
  const p = DEFAULT_PLAN;
  assert.equal(tripWeight(p, 21.5), 1); assert.equal(tripWeight(p, 22), 2);
  assert.equal(tripWeight(p, 31.5), 2); assert.equal(tripWeight(p, 41.5), 3); assert.equal(tripWeight(p, 41.6), 4); assert.equal(tripWeight(p, 90), 4);
  assert.equal(tripWeight(p, null), 1);
  // 20 km straight line x 1.3 road factor = 26 km -> 2 trips; counts toward the day
  const s = computeNinjaPay(base({ trips: [trip("2026-01-05", { crowKm: 20 }), ...tripsOn("2026-01-05", 4)] }));
  const d = s.days.find((x) => x.date === "2026-01-05")!;
  assert.equal(d.trips, 5); assert.equal(d.tripsCounted, 6); assert.equal(d.extraFromDistance, 1); assert.equal(d.daily, 200);
});

test("review bonus is a flat tier, earned the day the threshold is crossed", () => {
  const rev = (date: string, n: number, rating = 5, verified = true) => Array.from({ length: n }, () => ({ staffId: "n1", date, rating, verified }));
  const trips = spread(70, 4);
  const p = computeNinjaPay(base({ trips, reviews: [...rev("2026-01-10", 15), ...rev("2026-01-20", 6), ...rev("2026-01-21", 5, 4), ...rev("2026-01-22", 5, 5, false)] }));
  assert.equal(p.verifiedReviews, 21); assert.equal(p.reviews, 1000);
  assert.equal(p.days.find((d) => d.date === "2026-01-10")!.reviews, 500);
  assert.equal(p.days.find((d) => d.date === "2026-01-20")!.reviews, 500); // 500 -> 1000 pays the difference
  assert.equal(computeNinjaPay(base({ trips, reviews: rev("2026-01-10", 14) })).reviews, 0);
});

test("slab money can require a minimum of verified reviews", () => {
  const plans: PlanRow[] = [{ staffId: null, effectiveFrom: "2026-01-01", config: { slabMinReviews: 5 } }];
  const trips = spread(80, 4);
  const held = computeNinjaPay(base({ trips, plans }));
  assert.equal(held.slab, 0); assert.equal(held.slabHeld, 600);
  const rev = Array.from({ length: 5 }, () => ({ staffId: "n1", date: "2026-01-12", rating: 5, verified: true }));
  assert.equal(computeNinjaPay(base({ trips, plans, reviews: rev })).slab, 600);
});

test("a plan or salary change starts on its date and never touches earlier days", () => {
  const km = (d: number) => ({ [`2026-01-${String(d).padStart(2, "0")}`]: { km: 100 } });
  const m = month({ ...km(5), ...km(10), ...km(20), ...km(25) });
  const plans: PlanRow[] = [{ staffId: null, effectiveFrom: "2026-01-01", config: {} }, { staffId: null, effectiveFrom: "2026-01-16", config: { petrolPerKm: 4 } }];
  const salaries: SalaryRow[] = [{ staffId: "n1", effectiveFrom: "2026-01-01", monthlySalary: 31000 }, { staffId: "n1", effectiveFrom: "2026-01-16", monthlySalary: 62000 }];
  const p = computeNinjaPay(base({ month: m, plans, salaries }));
  const d = (x: string) => p.days.find((y) => y.date === x)!;
  assert.equal(d("2026-01-05").petrol, 350); assert.equal(d("2026-01-10").petrol, 350);
  assert.equal(d("2026-01-20").petrol, 400); assert.equal(d("2026-01-25").petrol, 400);
  assert.equal(d("2026-01-05").basic, 1000); assert.equal(d("2026-01-20").basic, 2000);
  assert.equal(p.basic, 15 * 1000 + 16 * 2000);
  // moving the change to later changes only the days in between
  const later = computeNinjaPay(base({ month: m, plans: [{ staffId: null, effectiveFrom: "2026-01-01", config: {} }, { staffId: null, effectiveFrom: "2026-01-22", config: { petrolPerKm: 4 } }], salaries }));
  assert.equal(later.days.find((y) => y.date === "2026-01-20")!.petrol, 350);
  assert.equal(later.days.find((y) => y.date === "2026-01-05")!.petrol, 350);
});

test("a per-Ninja plan overrides the company plan only for that Ninja", () => {
  const plans: PlanRow[] = [
    { staffId: null, effectiveFrom: "2026-01-01", config: { petrolPerKm: 3.5 } },
    { staffId: "n1", effectiveFrom: "2026-01-10", config: { petrolPerKm: 5 } },
  ];
  assert.equal(planFor(plans, "n1", "2026-01-09").petrolPerKm, 3.5);
  assert.equal(planFor(plans, "n1", "2026-01-10").petrolPerKm, 5);
  assert.equal(planFor(plans, "n2", "2026-01-20").petrolPerKm, 3.5);
  assert.equal(salaryFor([], "n1", "2026-01-10"), 0);
  // handing the Ninja back to the company plan from a date
  const back: PlanRow[] = [...plans, { staffId: "n1", effectiveFrom: "2026-01-20", config: { useCompany: true } as Partial<PayPlan> }];
  assert.equal(planFor(back, "n1", "2026-01-19").petrolPerKm, 5);
  assert.equal(planFor(back, "n1", "2026-01-20").petrolPerKm, 3.5);
});

test("basic salary is paid per day by status", () => {
  const m = month({ "2026-01-02": { status: "absent" }, "2026-01-03": { status: "half_day" }, "2026-01-04": { status: "festival_leave" }, "2026-01-05": { status: "requested" } });
  const p = computeNinjaPay(base({ month: m, salaries: [{ staffId: "n1", effectiveFrom: "2026-01-01", monthlySalary: 31000 }] }));
  assert.equal(p.basic, 31000 - 1000 - 500 - 1000); // absent, half day, pending request
  assert.equal(p.basicProjected, p.basic);          // month is over: nothing left to project
  const mid = computeNinjaPay(base({ nowMs: new Date("2026-01-10T12:00:00+05:30").getTime(), salaries: [{ staffId: "n1", effectiveFrom: "2026-01-01", monthlySalary: 31000 }] }));
  assert.equal(mid.basic, 10000); assert.equal(mid.basicProjected, 31000);
});

test("device incentives follow the Cluster Manager's list and its 90-day validity", () => {
  const lists = [{ kind: "macbook" as const, pattern: "A2337", validFrom: "2026-01-01", validUntil: "2026-03-31" }];
  assert.equal(deviceEligible("macbook", "MacBook Air A2337", "2026-02-01", lists, DEFAULT_PLAN), true);
  assert.equal(deviceEligible("macbook", "MacBook Pro A1708", "2026-02-01", lists, DEFAULT_PLAN), false);
  assert.equal(deviceEligible("macbook", "MacBook Air A2337", "2026-04-02", lists, DEFAULT_PLAN), false); // list expired
  assert.equal(deviceEligible("macbook", "MacBook Pro", "2026-02-01", [], DEFAULT_PLAN), true);            // no list ever: plain rule
  assert.equal(deviceEligible("iphone", "iPhone 15 Pro", "2026-02-01", [], DEFAULT_PLAN), true);
  assert.equal(deviceEligible("iphone", "iPhone 14", "2026-02-01", [], DEFAULT_PLAN), false);
  const trips = [...spread(60, 4), trip("2026-01-12", { devices: ["MacBook Air A2337", "iPhone 15"] }), trip("2026-01-12", { type: "drop", devices: ["MacBook Air A2337"] })];
  const p = computeNinjaPay(base({ trips, deviceLists: lists }));
  assert.equal(p.macbookRepairs, 1); assert.equal(p.iphoneRepairs, 1); assert.equal(p.devices, 250); // no iPhone list was ever entered, so the plain rule (above iPhone 14) applies
});

test("organic leads, adjustments and the grand total", () => {
  const p = computeNinjaPay(base({ trips: spread(60, 4), organicLeads: 12, adjustments: [{ amount: 500, reason: "Gift" }, { amount: -100, reason: "Late" }], month: month({ "2026-01-05": { km: 100 } }), salaries: [{ staffId: "n1", effectiveFrom: "2026-01-01", monthlySalary: 31000 }] }));
  assert.equal(p.leads, 12 * 200); assert.equal(p.adjustments, 400);
  assert.equal(computeNinjaPay(base({ trips: spread(60, 4), organicLeads: 10 })).leads, 1000);
  assert.equal(computeNinjaPay(base({ trips: spread(60, 4), organicLeads: 20 })).leadGift, true);
  assert.equal(p.total, p.basic + p.incentives + p.petrol + 400);
});

/* ─── Adjustable rules (every switch is dated like the rest of the plan) ─── */
const plan = (config: Partial<PayPlan>, from = "2026-01-01"): PlanRow[] => [{ staffId: null, effectiveFrom: from, config }];
const dayOf = (p: ReturnType<typeof computeNinjaPay>, d: string) => p.days.find((x) => x.date === d)!;

test("daily tiers can add up instead of paying the highest only", () => {
  const trips = [...tripsOn("2026-01-06", 9), ...filler(60)];
  assert.equal(dayOf(computeNinjaPay(base({ trips })), "2026-01-06").daily, 300);
  assert.equal(dayOf(computeNinjaPay(base({ trips, plans: plan({ dailyStack: true }) })), "2026-01-06").daily, 500);
});

test("trip types can be switched off and long trips can be kept out of the daily count", () => {
  const trips = [...tripsOn("2026-01-05", 6, { type: "drop" }), ...filler(60)];
  assert.equal(dayOf(computeNinjaPay(base({ trips, plans: plan({ countDrop: false }) })), "2026-01-05").trips, 0);
  const bb = [...tripsOn("2026-01-05", 6, { buyback: true }), ...filler(60)];
  assert.equal(dayOf(computeNinjaPay(base({ trips: bb, plans: plan({ countBuyback: false }) })), "2026-01-05").daily, 0);
  const long = [trip("2026-01-05", { crowKm: 20 }), ...tripsOn("2026-01-05", 4), ...filler(60)];
  assert.equal(dayOf(computeNinjaPay(base({ trips: long, plans: plan({ dailyUsesLongTrips: false }) })), "2026-01-05").daily, 0);
});

test("what waits for the monthly target is configurable", () => {
  const trips = [...tripsOn("2026-01-05", 9), ...spread(20, 3)];
  const held = computeNinjaPay(base({ trips }));
  assert.equal(held.daily, 0);
  const free = computeNinjaPay(base({ trips, plans: plan({ gateHolds: { ...DEFAULT_PLAN.gateHolds, daily: false } }) }));
  assert.equal(free.daily, 300); assert.equal(free.gatePassed, false);
});

test("the target can be lowered for leave days", () => {
  const m = month({ "2026-01-06": { status: "casual_leave" }, "2026-01-07": { status: "casual_leave" }, "2026-01-08": { status: "festival_leave" } });
  const p = computeNinjaPay(base({ month: m, plans: plan({ gateProrate: true }) }));
  assert.equal(p.gateBase, 60); assert.equal(p.gateTrips, Math.ceil(60 * 28 / 31));
});

test("slabs can pay every trip at the highest slab reached", () => {
  const p = computeNinjaPay(base({ trips: spread(110, 4), plans: plan({ slabMode: "whole" }) }));
  assert.equal(p.slab, 50 * 70);
});

test("reviews: minimum stars, ticket rule and per-review money", () => {
  const rv = (n: number, rating: number, verified = true) => Array.from({ length: n }, () => ({ staffId: "n1", date: "2026-01-10", rating, verified }));
  const trips = spread(60, 4);
  assert.equal(computeNinjaPay(base({ trips, reviews: rv(15, 4) })).reviews, 0);
  assert.equal(computeNinjaPay(base({ trips, reviews: rv(15, 4), plans: plan({ reviewMinRating: 4 }) })).reviews, 500);
  assert.equal(computeNinjaPay(base({ trips, reviews: rv(15, 5, false), plans: plan({ reviewNeedsTicket: false }) })).reviews, 500);
  assert.equal(computeNinjaPay(base({ trips, reviews: rv(15, 5), plans: plan({ reviewTiers: [{ min: 15, amount: 40 }], reviewMode: "perReview" }) })).reviews, 600);
});

test("organic leads can be paid each at its own row", () => {
  assert.equal(computeNinjaPay(base({ trips: spread(60, 4), organicLeads: 12, plans: plan({ leadMode: "slab" }) })).leads, 10 * 100 + 2 * 200);
});

test("long trips beyond the last row can keep adding trips", () => {
  const p = { ...DEFAULT_PLAN, distanceExtraEveryKm: 10 };
  assert.equal(tripWeight(p, 51.5), 4); assert.equal(tripWeight(p, 60), 5); assert.equal(tripWeight(p, 62), 6);
});

test("Sunday: trips needed, half day, absences allowed", () => {
  const trips = [...tripsOn("2026-01-04", 2), ...spread(60, 4)];
  const need3 = computeNinjaPay(base({ trips, plans: plan({ sundayMinTrips: 3 }) }));
  assert.equal(dayOf(need3, "2026-01-04").sunday, 0);
  const one = month({ "2026-01-02": { status: "absent" } });
  assert.ok(computeNinjaPay(base({ trips, month: one, plans: plan({ sundayAbsentAllowed: 1 }) })).sunday > 0);
  const half = month({ "2026-01-04": { status: "half_day" } });
  assert.equal(dayOf(computeNinjaPay(base({ trips, month: half })), "2026-01-04").sunday, 0);
  assert.equal(dayOf(computeNinjaPay(base({ trips, month: half, plans: plan({ sundayHalfDayCounts: true }) })), "2026-01-04").sunday, 300);
});

test("salary divisor, unpaid leave types and absent fine", () => {
  const salaries: SalaryRow[] = [{ staffId: "n1", effectiveFrom: "2026-01-01", monthlySalary: 30000 }];
  const m = month({ "2026-01-02": { status: "absent" }, "2026-01-03": { status: "casual_leave" } });
  const p = computeNinjaPay(base({ month: m, salaries, plans: plan({ salaryDays: 30, casualPaid: false, absentFine: 200 }) }));
  assert.equal(p.basic, 29 * 1000); assert.equal(p.fines, 200);
  assert.equal(p.total, p.basic + p.incentives + p.petrol + p.adjustments - 200);
});

test("petrol km limit, incentive cap and rounding", () => {
  const m = month({ "2026-01-05": { km: 150 } });
  const p = computeNinjaPay(base({ month: m, trips: spread(110, 4), plans: plan({ petrolMaxKmPerDay: 100, incentiveCap: 1000, roundTotal: 100 }) }));
  assert.equal(p.petrol, 350); assert.equal(p.incentives, 1000); assert.ok(p.capped > 0);
  assert.equal(p.total % 100, 0);
});

test("older saved plans without the new switches behave as before", () => {
  const p = planFor([{ staffId: null, effectiveFrom: "2026-01-01", config: { petrolPerKm: 4, gateHolds: { petrol: true } as PayPlan["gateHolds"] } }], "n1", "2026-01-05");
  assert.equal(p.dailyStack, false); assert.equal(p.gateHolds.daily, true); assert.equal(p.gateHolds.petrol, true);
});
