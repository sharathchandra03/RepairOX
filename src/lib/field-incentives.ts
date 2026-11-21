/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Engineer (Ninja) salary + incentive engine (pure, tested).
   Everything is calculated from what the Ninja actually did, never typed per day:
     trips (completed legs) · shift + leave status · odometer km · verified reviews · devices.
   EFFECTIVE DATING: each day is paid with the salary and the plan in force ON THAT DAY, so a change
   starts from its effective date and never touches earlier days. Month-level items follow the same
   rule by being earned on the day the threshold is crossed (slab trips, review bonus).

   Rules (defaults = the company sheet; every number is editable in a plan):
     BASIC       monthly salary / days in month, per day, x pay factor (present 1, half day 0.5, week off 1,
                 casual 1, festival 1, absent 0)
     DAILY       a day with 6+ completed trips earns 200, 9+ earns 300 (highest tier; days, not trips).
                 Postponed / cancelled / failed trips never count.
     MONTHLY     below 60 trips in the month: no incentive except petrol. Above it, trips #61-80 earn 30,
                 #81-100 earn 50, #101+ earn 70 (slab-wise). Optional: needs N verified reviews.
     LONG TRIP   a trip counts as several trips by one-way distance (<=20 km 1, 21-30 2, 31-40 3, 41-50 4, +-1.5 km)
     REVIEWS     verified 5-star reviews in the month: 15-20 -> 500, 21-30 -> 1000, 31+ -> 2000 (flat)
     DEVICES     latest MacBook 200 / iPhone above 14 -> 50 per device repair, only for models on the
                 Cluster Manager's list while it is valid (90 days)
     ORGANIC     billed organic leads: up to 10 -> 100 each, 11+ -> 200 each (count entered monthly)
     PETROL      3.50 per odometer km (always paid, even below the monthly target)
     SUNDAY      300 per Sunday worked, only if the month has no absence
   ────────────────────────────────────────────────────────────────────────── */
import { isMacBook, isNewerIphone } from "@/lib/field-daily-activity";
import { monthDays, type DayStatus, type NinjaMonth } from "@/lib/field-attendance";
import { localDateKey } from "@/lib/work-session";

export interface DailyTier { minTrips: number; amount: number }
/** Trips numbered ABOVE `above` in the month earn `rate` each (the highest matching slab applies). */
export interface SlabTier { above: number; rate: number }
export interface ReviewTier { min: number; amount: number }
export interface LeadTier { min: number; perLead: number }
export interface DistanceTier { upToKm: number; trips: number }
export interface PayPlan {
  dailyTiers: DailyTier[];
  monthlyMinTrips: number;
  slabs: SlabTier[];
  /** Verified reviews needed to release the slab money (0 = not required). */
  slabMinReviews: number;
  reviewTiers: ReviewTier[];
  leadTiers: LeadTier[];
  leadGiftAt: number;
  macbookPerRepair: number; iphonePerRepair: number; iphoneAboveModel: number;
  distanceEnabled: boolean; distanceTiers: DistanceTier[]; distanceToleranceKm: number;
  /** Straight-line km between store and customer x this = estimated road km (one way). */
  roadFactor: number;
  petrolPerKm: number;
  sundayBonus: number; sundayNeedsNoAbsent: boolean;
  /** Sunday has its own structure: the 6+/9+ daily bonus is not paid on a Sunday. */
  sundayReplacesDaily: boolean;
  halfDayFactor: number;
  /** Casual leave should be requested this many days ahead (flag only). */
  casualNoticeDays: number;

  /* ── Which trips count (all rules below use only these) ── */
  countPickup: boolean; countDrop: boolean; countOnsite: boolean; countBuyback: boolean;
  /* ── Daily ── */
  /** true: every tier reached is added (6+ and 9+ = 200 + 300). false: only the highest tier is paid. */
  dailyStack: boolean;
  /** Long trips that count as several trips also count extra toward the day's 6+/9+. */
  dailyUsesLongTrips: boolean;
  /** The daily bonus is paid only on a present / half day (not on a leave day the Ninja worked anyway). */
  dailyNeedsPresent: boolean;
  /* ── Monthly target ── */
  /** Lower the target for approved leave days and for days before the Ninja joined (first salary date). */
  gateProrate: boolean;
  /** Which money waits for the monthly target. Anything not held is paid even below the target. */
  gateHolds: { daily: boolean; slab: boolean; reviews: boolean; devices: boolean; sunday: boolean; leads: boolean; petrol: boolean };
  /** marginal: each trip is paid at its own slab (61-80 at 30, 81-100 at 50…). whole: every trip above the first slab is paid at the highest slab reached. */
  slabMode: "marginal" | "whole";
  /* ── Reviews ── */
  /** Lowest star rating that counts (5 = only 5★). */
  reviewMinRating: number;
  /** Count only reviews on a trip that has a ticket. */
  reviewNeedsTicket: boolean;
  /** flat: one amount for the tier reached. perReview: the tier amount is paid for every review. */
  reviewMode: "flat" | "perReview";
  /* ── Organic leads ── */
  /** whole: all leads at the rate of the tier reached (12 leads = 12 × 200). slab: each lead at its own tier (10 × 100 + 2 × 200). */
  leadMode: "whole" | "slab";
  /* ── Devices ── */
  /** Also count devices on drop trips (off by default so one device is not paid twice). */
  devicesOnDrop: boolean;
  /* ── Long trips ── */
  /** Beyond the last km row, add one more trip for every this many km (0 = stop at the last row). */
  distanceExtraEveryKm: number;
  /* ── Sunday ── */
  /** Completed trips needed on a Sunday to earn the Sunday money (0 = being present is enough). */
  sundayMinTrips: number;
  /** A half day on Sunday also earns the Sunday money. */
  sundayHalfDayCounts: boolean;
  /** When "needs no absence" is on: how many absences are still allowed (0 = none). */
  sundayAbsentAllowed: number;
  /* ── Basic salary ── */
  /** Divide the monthly salary by this many days (0 = the real days in the month, e.g. 30 / 31 / 28). */
  salaryDays: number;
  weekOffPaid: boolean; casualPaid: boolean; festivalPaid: boolean;
  /** Extra amount deducted for every absent day, on top of losing that day's basic (0 = none). */
  absentFine: number;
  /* ── Petrol ── */
  /** Most km paid in one day (0 = no limit). */
  petrolMaxKmPerDay: number;
  /* ── Totals ── */
  /** Most incentive money in a month, petrol and basic not included (0 = no limit). */
  incentiveCap: number;
  /** Round the month total to the nearest (0 = no rounding, 1 = rupee, 10 = ten rupees). */
  roundTotal: number;
}
export const DEFAULT_PLAN: PayPlan = {
  dailyTiers: [{ minTrips: 6, amount: 200 }, { minTrips: 9, amount: 300 }],
  monthlyMinTrips: 60,
  slabs: [{ above: 60, rate: 30 }, { above: 80, rate: 50 }, { above: 100, rate: 70 }],
  slabMinReviews: 0,
  reviewTiers: [{ min: 15, amount: 500 }, { min: 21, amount: 1000 }, { min: 31, amount: 2000 }],
  leadTiers: [{ min: 1, perLead: 100 }, { min: 11, perLead: 200 }],
  leadGiftAt: 20,
  macbookPerRepair: 200, iphonePerRepair: 50, iphoneAboveModel: 14,
  distanceEnabled: true,
  distanceTiers: [{ upToKm: 20, trips: 1 }, { upToKm: 30, trips: 2 }, { upToKm: 40, trips: 3 }, { upToKm: 50, trips: 4 }],
  distanceToleranceKm: 1.5, roadFactor: 1.3,
  petrolPerKm: 3.5,
  sundayBonus: 300, sundayNeedsNoAbsent: true, sundayReplacesDaily: true,
  halfDayFactor: 0.5,
  casualNoticeDays: 7,
  countPickup: true, countDrop: true, countOnsite: true, countBuyback: true,
  dailyStack: false, dailyUsesLongTrips: true, dailyNeedsPresent: false,
  gateProrate: false,
  gateHolds: { daily: true, slab: true, reviews: true, devices: true, sunday: true, leads: true, petrol: false },
  slabMode: "marginal",
  reviewMinRating: 5, reviewNeedsTicket: true, reviewMode: "flat",
  leadMode: "whole",
  devicesOnDrop: false,
  distanceExtraEveryKm: 0,
  sundayMinTrips: 0, sundayHalfDayCounts: false, sundayAbsentAllowed: 0,
  salaryDays: 0, weekOffPaid: true, casualPaid: true, festivalPaid: true, absentFine: 0,
  petrolMaxKmPerDay: 0,
  incentiveCap: 0, roundTotal: 0,
};

/* ─── Effective-dated lookups ─────────────────────────────────────────── */
export interface PlanRow { id?: string; staffId: string | null; effectiveFrom: string; config: Partial<PayPlan>; note?: string | null }
export interface SalaryRow { id?: string; staffId: string; effectiveFrom: string; monthlySalary: number; note?: string | null }
export interface DeviceListRow { id?: string; kind: "macbook" | "iphone"; pattern: string; validFrom: string; validUntil: string }
const latest = <T extends { effectiveFrom: string }>(rows: T[], day: string): T | null => {
  let best: T | null = null;
  for (const r of rows) if (r.effectiveFrom <= day && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  return best;
};
/** The plan in force for one Ninja on one day: their own override if they have one, else the company plan. */
export function planRowFor(plans: PlanRow[], staffId: string, day: string): PlanRow | null {
  const own = latest(plans.filter((p) => p.staffId === staffId), day);
  // a Ninja row marked `useCompany` hands the Ninja back to the company plan from its date
  if (own && !(own.config as { useCompany?: boolean }).useCompany) return own;
  return latest(plans.filter((p) => p.staffId == null), day);
}
export function planFor(plans: PlanRow[], staffId: string, day: string): PayPlan {
  const row = planRowFor(plans, staffId, day);
  const c = (row?.config ?? {}) as Partial<PayPlan>;
  // older saved plans don't have the newer switches: they fall back to the defaults (= the old behaviour)
  return { ...DEFAULT_PLAN, ...c, gateHolds: { ...DEFAULT_PLAN.gateHolds, ...(c.gateHolds ?? {}) } };
}
export function salaryFor(rows: SalaryRow[], staffId: string, day: string): number {
  return latest(rows.filter((r) => r.staffId === staffId), day)?.monthlySalary ?? 0;
}

/* ─── Small rules ───────────────────────────────────────────────────── */
/** How many trips a trip counts as, from its estimated one-way road km. Unknown distance counts as 1. */
export function tripWeight(plan: PayPlan, oneWayKm: number | null): number {
  if (!plan.distanceEnabled || oneWayKm == null || !plan.distanceTiers.length) return 1;
  const tiers = [...plan.distanceTiers].sort((a, b) => a.upToKm - b.upToKm);
  for (const t of tiers) if (oneWayKm <= t.upToKm + plan.distanceToleranceKm) return t.trips;
  const last = tiers[tiers.length - 1];
  if (plan.distanceExtraEveryKm > 0) return last.trips + Math.ceil((oneWayKm - last.upToKm - plan.distanceToleranceKm) / plan.distanceExtraEveryKm);
  return last.trips;
}
export const dailyBonusFor = (plan: PayPlan, trips: number): number => {
  const tiers = [...plan.dailyTiers].sort((a, b) => a.minTrips - b.minTrips).filter((t) => t.minTrips > 0 && trips >= t.minTrips);
  if (!tiers.length) return 0;
  return plan.dailyStack ? tiers.reduce((a, t) => a + t.amount, 0) : tiers[tiers.length - 1].amount;
};
/** Is this trip counted at all under the plan? */
export const tripCounts = (plan: PayPlan, t: PayTrip): boolean =>
  t.buyback ? plan.countBuyback : t.type === "drop" ? plan.countDrop : t.type === "onsite" ? plan.countOnsite : plan.countPickup;
/** Does this review count toward the review bonus / slab requirement? */
export const reviewCounts = (plan: PayPlan, r: PayReview): boolean =>
  r.rating >= plan.reviewMinRating && (plan.reviewNeedsTicket ? r.verified : r.fromCustomer !== false);
/** Organic lead money for `n` leads. */
export function leadMoney(plan: PayPlan, n: number): number {
  if (n <= 0) return 0;
  if (plan.leadMode === "whole") return n * leadRateAt(plan, n);
  let t = 0; for (let k = 1; k <= n; k++) t += leadRateAt(plan, k); return t;
}
/** Review money once `n` counted reviews are reached. */
export const reviewMoney = (plan: PayPlan, n: number): number => {
  const amt = reviewBonusAt(plan, n);
  return plan.reviewMode === "perReview" ? amt * n : amt;
};
export const slabRateFor = (plan: PayPlan, tripNo: number): number =>
  [...plan.slabs].sort((a, b) => a.above - b.above).reduce((r, s) => (tripNo > s.above ? s.rate : r), 0);
export const reviewBonusAt = (plan: PayPlan, n: number): number =>
  [...plan.reviewTiers].sort((a, b) => a.min - b.min).reduce((amt, t) => (n >= t.min ? t.amount : amt), 0);
export const leadRateAt = (plan: PayPlan, n: number): number =>
  [...plan.leadTiers].sort((a, b) => a.min - b.min).reduce((r, t) => (n >= t.min ? t.perLead : r), 0);
export const payFactor = (s: DayStatus, plan: PayPlan): number =>
  s === "present" ? 1 : s === "half_day" ? plan.halfDayFactor
  : s === "week_off" ? (plan.weekOffPaid ? 1 : 0) : s === "casual_leave" ? (plan.casualPaid ? 1 : 0) : s === "festival_leave" ? (plan.festivalPaid ? 1 : 0) : 0;

/** Straight-line km between two coordinates. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Is this device on the Cluster Manager's list for `kind` on `day`? With no list ever entered for the kind, fall back to the plain rule. */
export function deviceEligible(kind: "macbook" | "iphone", label: string, day: string, lists: DeviceListRow[], plan: PayPlan): boolean {
  const mine = lists.filter((l) => l.kind === kind);
  if (mine.length === 0) return kind === "macbook" ? isMacBook(label) : isNewerIphone(label, plan.iphoneAboveModel);
  const l = label.toLowerCase();
  return mine.some((e) => e.validFrom <= day && day <= e.validUntil && l.includes(e.pattern.toLowerCase()));
}

/* ─── Inputs ────────────────────────────────────────────────────────── */
export interface PayTrip {
  id: string; staffId: string; /** local day it was completed */ date: string;
  type: "pickup" | "drop" | "onsite";
  /** Straight-line km between the store and the customer (null = unknown). */
  crowKm: number | null;
  devices: string[];
  /** A buyback job (lead type), counted by the "buyback" switch instead of pickup. */
  buyback?: boolean;
}
export interface PayReview {
  staffId: string; date: string; rating: number;
  /** Has a ticket AND came from the customer (or a manager), at any rating. */
  verified: boolean;
  /** Came from the customer / a manager, ticket or not (missing = yes). */
  fromCustomer?: boolean;
}
export interface Adjustment { amount: number; reason: string }
export interface PayInput {
  staffId: string; ym: string; tz: string; nowMs: number;
  month: NinjaMonth;
  trips: PayTrip[]; reviews: PayReview[];
  plans: PlanRow[]; salaries: SalaryRow[]; deviceLists: DeviceListRow[];
  organicLeads: number; adjustments: Adjustment[];
}
export interface PayDay {
  date: string; status: DayStatus; planFrom: string | null;
  trips: number; tripsCounted: number; extraFromDistance: number;
  basic: number; daily: number; slab: number; reviews: number; macbook: number; iphone: number; sunday: number; petrol: number;
  macbookRepairs: number; iphoneRepairs: number; km: number | null;
  /** Absent-day fine (a positive number that is deducted). */
  fine: number;
  /** km paid after the daily petrol limit. */
  kmPaid: number | null;
}
export interface PaySummary {
  days: PayDay[];
  /** Completed trips counted (long trips count as several). */
  trips: number; rawTrips: number; extraFromDistance: number;
  verifiedReviews: number; organicLeads: number; leadGift: boolean;
  /** Month target gate: below it only petrol (and basic) is paid. */
  gateTrips: number; gatePassed: boolean; tripsToGate: number;
  reviewsOk: boolean;
  nextSlab: { atTrip: number; rate: number; tripsAway: number } | null;
  basic: number; basicProjected: number;
  daily: number;
  /** Days that reached the lowest / the highest daily tier (the default plan: 6+ and 9+). */
  dailyDays6: number; dailyDays9: number;
  dailyTierDays: { minTrips: number; days: number }[];
  /** Target before leave / joining is taken off. */
  gateBase: number;
  fines: number;
  /** Incentive money cut by the monthly limit. */
  capped: number;
  /** Rounding difference added to the total. */
  rounding: number;
  slab: number; slabHeld: number; reviews: number; devices: number; macbookRepairs: number; iphoneRepairs: number;
  leads: number; sunday: number; sundaysWorked: number; petrol: number; km: number;
  adjustments: number;
  /** Incentives that are earned but locked by the monthly gate / review requirement. */
  locked: number;
  incentives: number; total: number;
  absences: number;
}

/** Salary + incentive for one Ninja for one month, up to today (or the whole month if it is over).
 *  Day-level money (basic, daily, slab, devices, Sunday, petrol, fines) uses the plan in force ON that day.
 *  Month-level switches (target, what the target holds, leads, cap, rounding) use the plan in force on the
 *  last day counted, so a change made mid-month decides how that month is settled. */
export function computeNinjaPay(i: PayInput): PaySummary {
  const dates = monthDays(i.ym);
  const today = localDateKey(i.nowMs, i.tz);
  const through = dates.filter((d) => d <= today);
  const lastDay = through[through.length - 1] ?? dates[0];
  const planLast = planFor(i.plans, i.staffId, lastDay);
  const absences = i.month.days.filter((d) => d.status === "absent").length;
  const tripsBy = new Map<string, PayTrip[]>();
  for (const t of i.trips) if (t.staffId === i.staffId) { const a = tripsBy.get(t.date) ?? []; a.push(t); tripsBy.set(t.date, a); }
  const revBy = new Map<string, PayReview[]>();
  for (const r of i.reviews) if (r.staffId === i.staffId) { const a = revBy.get(r.date) ?? []; a.push(r); revBy.set(r.date, a); }

  let cum = 0, cumRev = 0, reviewPaid = 0;
  const days: PayDay[] = [];
  let basicProjected = 0;
  for (const date of dates) {
    const cell = i.month.days.find((d) => d.date === date)!;
    const plan = planFor(i.plans, i.staffId, date);
    const salary = salaryFor(i.salaries, i.staffId, date);
    const perDay = salary / (plan.salaryDays > 0 ? plan.salaryDays : dates.length);
    if (date > today) { basicProjected += perDay; continue; }
    const trips = (tripsBy.get(date) ?? []).filter((t) => tripCounts(plan, t));
    const weights = trips.map((t) => tripWeight(plan, t.crowKm == null ? null : t.crowKm * plan.roadFactor));
    const w = weights.reduce((a, b) => a + b, 0);
    const forDaily = plan.dailyUsesLongTrips ? w : trips.length;
    const isSunday = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8))).getDay() === 0;
    // slab: each counted trip is numbered through the month and paid at that day's slab
    let slab = 0;
    for (let n = 1; n <= w; n++) slab += slabRateFor(plan, cum + n);
    cum += w;
    // review money is earned the day the threshold is crossed, at that day's tiers
    cumRev += (revBy.get(date) ?? []).filter((r) => reviewCounts(plan, r)).length;
    const reviews = Math.max(0, reviewMoney(plan, cumRev) - reviewPaid);
    reviewPaid += reviews;
    // devices (pickup / on-site legs by default, so a drop never counts the same device twice)
    let mb = 0, ip = 0;
    for (const t of trips) {
      if (t.type === "drop" && !plan.devicesOnDrop) continue;
      for (const d of t.devices) {
        if (deviceEligible("macbook", d, date, i.deviceLists, plan)) mb++;
        else if (deviceEligible("iphone", d, date, i.deviceLists, plan)) ip++;
      }
    }
    const working = cell.status === "present" || cell.status === "half_day";
    const dailyBonus = (isSunday && plan.sundayReplacesDaily) || (plan.dailyNeedsPresent && !working) ? 0 : dailyBonusFor(plan, forDaily);
    const sundayWorked = (cell.status === "present" || (plan.sundayHalfDayCounts && cell.status === "half_day")) && w >= plan.sundayMinTrips;
    const sunday = isSunday && sundayWorked && (!plan.sundayNeedsNoAbsent || absences <= plan.sundayAbsentAllowed) ? plan.sundayBonus : 0;
    const km = cell.km;
    const kmPaid = km == null ? null : plan.petrolMaxKmPerDay > 0 ? Math.min(km, plan.petrolMaxKmPerDay) : km;
    const fine = cell.status === "absent" ? plan.absentFine : 0;
    days.push({
      date, status: cell.status, planFrom: planRowFor(i.plans, i.staffId, date)?.effectiveFrom ?? null,
      trips: trips.length, tripsCounted: w, extraFromDistance: w - trips.length,
      basic: perDay * payFactor(cell.status, plan), daily: dailyBonus, slab, reviews,
      macbook: mb * plan.macbookPerRepair, iphone: ip * plan.iphonePerRepair, macbookRepairs: mb, iphoneRepairs: ip,
      sunday, petrol: (kmPaid ?? 0) * plan.petrolPerKm, km, kmPaid, fine,
    });
    basicProjected += perDay * payFactor(cell.status, plan);
  }
  const sum = (f: (d: PayDay) => number) => days.reduce((a, d) => a + f(d), 0);
  const trips = cum;
  // monthly target, optionally lowered for approved leave and for days before joining
  const gateBase = planLast.monthlyMinTrips;
  let gate = gateBase;
  if (planLast.gateProrate && gateBase > 0) {
    const firstSalary = i.salaries.filter((x) => x.staffId === i.staffId).map((x) => x.effectiveFrom).sort()[0];
    const before = firstSalary ? dates.filter((d) => d < firstSalary).length : 0;
    const leave = i.month.days.filter((d) => d.status === "casual_leave" || d.status === "festival_leave").length;
    gate = Math.ceil(gateBase * Math.max(0, dates.length - before - leave) / dates.length);
  }
  const gatePassed = trips >= gate;
  const verifiedReviews = cumRev;
  const reviewsOk = planLast.slabMinReviews <= 0 || verifiedReviews >= planLast.slabMinReviews;
  const rawLeads = i.organicLeads;
  const leads = leadMoney(planLast, rawLeads);
  let slabAcc = sum((d) => d.slab);
  if (planLast.slabMode === "whole") {
    const first = [...planLast.slabs].sort((a, b) => a.above - b.above)[0];
    slabAcc = first && trips > first.above ? (trips - first.above) * slabRateFor(planLast, trips) : 0;
  }
  const dailyAcc = sum((d) => d.daily), revAcc = sum((d) => d.reviews);
  const devAcc = sum((d) => d.macbook + d.iphone), sunAcc = sum((d) => d.sunday), petrolAcc = sum((d) => d.petrol);
  const h = planLast.gateHolds;
  const pay = (acc: number, held: boolean) => (held && !gatePassed ? 0 : acc);
  const slabPaid = reviewsOk ? pay(slabAcc, h.slab) : 0;
  const dailyPaid = pay(dailyAcc, h.daily), revPaid = pay(revAcc, h.reviews), devPaid = pay(devAcc, h.devices);
  const sunPaid = pay(sunAcc, h.sunday), leadPaid = pay(leads, h.leads), petrol = pay(petrolAcc, h.petrol);
  const rawIncentives = slabPaid + dailyPaid + revPaid + devPaid + sunPaid + leadPaid;
  const incentives = planLast.incentiveCap > 0 ? Math.min(rawIncentives, planLast.incentiveCap) : rawIncentives;
  const capped = rawIncentives - incentives;
  const locked = (slabAcc - slabPaid) + (dailyAcc - dailyPaid) + (revAcc - revPaid) + (devAcc - devPaid) + (sunAcc - sunPaid) + (leads - leadPaid) + (petrolAcc - petrol);
  const basic = sum((d) => d.basic), fines = sum((d) => d.fine);
  const adj = i.adjustments.reduce((a, x) => a + x.amount, 0);
  const sorted = [...planLast.slabs].sort((a, b) => a.above - b.above);
  const next = sorted.find((s) => trips < s.above + 1);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const raw = r2(basic + incentives + petrol + adj - fines);
  const total = planLast.roundTotal > 0 ? Math.round(raw / planLast.roundTotal) * planLast.roundTotal : raw;
  const tiersSorted = [...planLast.dailyTiers].filter((t) => t.minTrips > 0).sort((a, b) => a.minTrips - b.minTrips);
  const dailyTierDays = tiersSorted.map((t) => ({ minTrips: t.minTrips, days: days.filter((d) => (planLast.dailyUsesLongTrips ? d.tripsCounted : d.trips) >= t.minTrips && d.daily > 0).length }));
  return {
    days, trips, rawTrips: sum((d) => d.trips), extraFromDistance: sum((d) => d.extraFromDistance),
    verifiedReviews, organicLeads: rawLeads, leadGift: rawLeads >= planLast.leadGiftAt && planLast.leadGiftAt > 0,
    gateTrips: gate, gateBase, gatePassed, tripsToGate: Math.max(0, gate - trips), reviewsOk,
    nextSlab: next ? { atTrip: next.above + 1, rate: next.rate, tripsAway: next.above + 1 - trips } : null,
    basic: r2(basic), basicProjected: r2(basicProjected),
    daily: r2(dailyPaid), dailyTierDays,
    dailyDays6: dailyTierDays[0]?.days ?? 0, dailyDays9: dailyTierDays[dailyTierDays.length - 1]?.days ?? 0,
    slab: r2(slabPaid), slabHeld: r2(slabAcc - slabPaid), reviews: r2(revPaid), devices: r2(devPaid),
    macbookRepairs: sum((d) => d.macbookRepairs), iphoneRepairs: sum((d) => d.iphoneRepairs),
    leads: r2(leadPaid), sunday: r2(sunPaid), sundaysWorked: days.filter((d) => d.sunday > 0).length,
    petrol: r2(petrol), km: sum((d) => d.km ?? 0), adjustments: r2(adj), locked: r2(locked),
    fines: r2(fines), capped: r2(capped), rounding: r2(total - raw),
    incentives: r2(incentives), total, absences,
  };
}

/** Plain-language lines describing a plan (shown to the Ninja and in the editor). */
export function describePlan(p: PayPlan): string[] {
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const out: string[] = [];
  const types = [p.countPickup && "pickup", p.countDrop && "drop", p.countOnsite && "on-site", p.countBuyback && "buyback"].filter(Boolean).join(", ");
  out.push(`Trips that count: ${types || "none"} (completed only; postponed and cancelled never count).`);
  out.push(`Daily: ${[...p.dailyTiers].sort((a, b) => a.minTrips - b.minTrips).map((t) => `${t.minTrips}+ trips = ${inr(t.amount)}`).join(", ")} per day, ${p.dailyStack ? "tiers add up" : "highest tier only"}${p.dailyNeedsPresent ? ", only on a working day" : ""}.`);
  const held = Object.entries(p.gateHolds).filter(([, v]) => v).map(([k]) => k).join(", ");
  out.push(`Monthly target: at least ${p.monthlyMinTrips} trips${p.gateProrate ? " (lowered for leave and for joining mid-month)" : ""}. Until then these wait: ${held || "nothing"}.`);
  out.push(`Slab: ${[...p.slabs].sort((a, b) => a.above - b.above).map((s) => `trips above ${s.above} = ${inr(s.rate)} each`).join(", ")}${p.slabMode === "whole" ? " (all trips above the first slab at the highest rate reached)" : ""}${p.slabMinReviews > 0 ? `; needs ${p.slabMinReviews} reviews` : ""}.`);
  out.push(`Petrol: ${inr(p.petrolPerKm)} per km on your odometer${p.petrolMaxKmPerDay > 0 ? `, up to ${p.petrolMaxKmPerDay} km a day` : ""}.`);
  out.push(`Reviews (${p.reviewMinRating}★ and above${p.reviewNeedsTicket ? ", on a ticket" : ""}): ${[...p.reviewTiers].sort((a, b) => a.min - b.min).map((t) => `${t.min}+ = ${inr(t.amount)}`).join(", ")}${p.reviewMode === "perReview" ? " per review" : ""}.`);
  out.push(`Devices: MacBook ${inr(p.macbookPerRepair)}, iPhone above ${p.iphoneAboveModel} ${inr(p.iphonePerRepair)} per repair (listed models only).`);
  if (p.distanceEnabled) out.push(`Long trips count extra: ${[...p.distanceTiers].sort((a, b) => a.upToKm - b.upToKm).map((t) => `up to ${t.upToKm} km = ${t.trips}`).join(", ")} (one way, ±${p.distanceToleranceKm} km${p.distanceExtraEveryKm > 0 ? `, +1 every ${p.distanceExtraEveryKm} km beyond` : ""}).`);
  out.push(`Sunday: ${inr(p.sundayBonus)} per Sunday worked${p.sundayMinTrips > 0 ? ` with ${p.sundayMinTrips}+ trips` : ""}${p.sundayNeedsNoAbsent ? (p.sundayAbsentAllowed > 0 ? `, if you have at most ${p.sundayAbsentAllowed} absence${p.sundayAbsentAllowed === 1 ? "" : "s"} that month` : ", if you have no absence that month") : ""}.`);
  out.push(`Organic billed leads: ${[...p.leadTiers].sort((a, b) => a.min - b.min).map((t) => `${t.min}+ = ${inr(t.perLead)} each`).join(", ")}${p.leadMode === "slab" ? " (each lead at its own tier)" : ""}${p.leadGiftAt ? `; ${p.leadGiftAt} leads earns a gift` : ""}.`);
  if (p.absentFine > 0) out.push(`Absent day: ${inr(p.absentFine)} is deducted on top of that day's salary.`);
  if (p.incentiveCap > 0) out.push(`Incentives are capped at ${inr(p.incentiveCap)} a month.`);
  return out;
}
