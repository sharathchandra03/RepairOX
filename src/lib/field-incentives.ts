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
  return { ...DEFAULT_PLAN, ...(row?.config ?? {}) };
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
  return tiers[tiers.length - 1].trips;
}
export const dailyBonusFor = (plan: PayPlan, trips: number): number =>
  [...plan.dailyTiers].sort((a, b) => a.minTrips - b.minTrips).reduce((amt, t) => (trips >= t.minTrips ? t.amount : amt), 0);
export const slabRateFor = (plan: PayPlan, tripNo: number): number =>
  [...plan.slabs].sort((a, b) => a.above - b.above).reduce((r, s) => (tripNo > s.above ? s.rate : r), 0);
export const reviewBonusAt = (plan: PayPlan, n: number): number =>
  [...plan.reviewTiers].sort((a, b) => a.min - b.min).reduce((amt, t) => (n >= t.min ? t.amount : amt), 0);
export const leadRateAt = (plan: PayPlan, n: number): number =>
  [...plan.leadTiers].sort((a, b) => a.min - b.min).reduce((r, t) => (n >= t.min ? t.perLead : r), 0);
export const payFactor = (s: DayStatus, plan: PayPlan): number =>
  s === "present" || s === "week_off" || s === "casual_leave" || s === "festival_leave" ? 1 : s === "half_day" ? plan.halfDayFactor : 0;

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
}
export interface PayReview { staffId: string; date: string; rating: number; /** has a ticket + came from the customer */ verified: boolean }
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
  daily: number; dailyDays6: number; dailyDays9: number;
  slab: number; slabHeld: number; reviews: number; devices: number; macbookRepairs: number; iphoneRepairs: number;
  leads: number; sunday: number; sundaysWorked: number; petrol: number; km: number;
  adjustments: number;
  /** Incentives that are earned but locked by the monthly gate / review requirement. */
  locked: number;
  incentives: number; total: number;
  absences: number;
}

/** Salary + incentive for one Ninja for one month, up to today (or the whole month if it is over). */
export function computeNinjaPay(i: PayInput): PaySummary {
  const dates = monthDays(i.ym);
  const today = localDateKey(i.nowMs, i.tz);
  const through = dates.filter((d) => d <= today);
  const lastDay = through[through.length - 1] ?? dates[0];
  const planLast = planFor(i.plans, i.staffId, lastDay);
  const absences = i.month.days.filter((d) => d.status === "absent").length;
  const tripsBy = new Map<string, PayTrip[]>();
  for (const t of i.trips) if (t.staffId === i.staffId) { const a = tripsBy.get(t.date) ?? []; a.push(t); tripsBy.set(t.date, a); }
  const revBy = new Map<string, number>();
  for (const r of i.reviews) if (r.staffId === i.staffId && r.verified && r.rating === 5) revBy.set(r.date, (revBy.get(r.date) ?? 0) + 1);

  let cum = 0, cumRev = 0, reviewPaid = 0;
  const days: PayDay[] = [];
  let basicProjected = 0;
  for (const date of dates) {
    const cell = i.month.days.find((d) => d.date === date)!;
    const plan = planFor(i.plans, i.staffId, date);
    const salary = salaryFor(i.salaries, i.staffId, date);
    const daily = salary / dates.length;
    if (date > today) { basicProjected += daily; continue; }
    const trips = tripsBy.get(date) ?? [];
    const weights = trips.map((t) => tripWeight(plan, t.crowKm == null ? null : t.crowKm * plan.roadFactor));
    const w = weights.reduce((a, b) => a + b, 0);
    const isSunday = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8))).getDay() === 0;
    // slab: each counted trip is numbered through the month and paid at that day's slab
    let slab = 0;
    for (let n = 1; n <= w; n++) slab += slabRateFor(plan, cum + n);
    cum += w;
    // review bonus is earned the day the threshold is crossed, at that day's tiers
    cumRev += revBy.get(date) ?? 0;
    const target = reviewBonusAt(plan, cumRev);
    const reviews = Math.max(0, target - reviewPaid);
    reviewPaid += reviews;
    // devices (pickup / on-site legs only, so a drop never counts the same device twice)
    let mb = 0, ip = 0;
    for (const t of trips) {
      if (t.type === "drop") continue;
      for (const d of t.devices) {
        if (deviceEligible("macbook", d, date, i.deviceLists, plan)) mb++;
        else if (deviceEligible("iphone", d, date, i.deviceLists, plan)) ip++;
      }
    }
    const dailyBonus = isSunday && plan.sundayReplacesDaily ? 0 : dailyBonusFor(plan, w);
    const sunday = isSunday && cell.status === "present" && (!plan.sundayNeedsNoAbsent || absences === 0) ? plan.sundayBonus : 0;
    const km = cell.km;
    days.push({
      date, status: cell.status, planFrom: planRowFor(i.plans, i.staffId, date)?.effectiveFrom ?? null,
      trips: trips.length, tripsCounted: w, extraFromDistance: w - trips.length,
      basic: daily * payFactor(cell.status, plan), daily: dailyBonus, slab, reviews,
      macbook: mb * plan.macbookPerRepair, iphone: ip * plan.iphonePerRepair, macbookRepairs: mb, iphoneRepairs: ip,
      sunday, petrol: (km ?? 0) * plan.petrolPerKm, km,
    });
    basicProjected += daily * payFactor(cell.status, plan);
  }
  // future days of the month are projected as fully paid
  const sum = (f: (d: PayDay) => number) => days.reduce((a, d) => a + f(d), 0);
  const trips = cum;
  const gatePassed = trips >= planLast.monthlyMinTrips;
  const verifiedReviews = cumRev;
  const reviewsOk = planLast.slabMinReviews <= 0 || verifiedReviews >= planLast.slabMinReviews;
  const rawLeads = i.organicLeads;
  const leads = rawLeads * leadRateAt(planLast, rawLeads);
  const slabAcc = sum((d) => d.slab), dailyAcc = sum((d) => d.daily), revAcc = sum((d) => d.reviews);
  const devAcc = sum((d) => d.macbook + d.iphone), sunAcc = sum((d) => d.sunday);
  const slabPaid = gatePassed && reviewsOk ? slabAcc : 0;
  const dailyPaid = gatePassed ? dailyAcc : 0, revPaid = gatePassed ? revAcc : 0, devPaid = gatePassed ? devAcc : 0;
  const sunPaid = gatePassed ? sunAcc : 0, leadPaid = gatePassed ? leads : 0;
  const incentives = slabPaid + dailyPaid + revPaid + devPaid + sunPaid + leadPaid;
  const locked = (slabAcc - slabPaid) + (dailyAcc - dailyPaid) + (revAcc - revPaid) + (devAcc - devPaid) + (sunAcc - sunPaid) + (leads - leadPaid);
  const basic = sum((d) => d.basic), petrol = sum((d) => d.petrol);
  const adj = i.adjustments.reduce((a, x) => a + x.amount, 0);
  const sorted = [...planLast.slabs].sort((a, b) => a.above - b.above);
  const next = sorted.find((s) => trips < s.above + 1);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    days, trips, rawTrips: sum((d) => d.trips), extraFromDistance: sum((d) => d.extraFromDistance),
    verifiedReviews, organicLeads: rawLeads, leadGift: rawLeads >= planLast.leadGiftAt && planLast.leadGiftAt > 0,
    gateTrips: planLast.monthlyMinTrips, gatePassed, tripsToGate: Math.max(0, planLast.monthlyMinTrips - trips), reviewsOk,
    nextSlab: next ? { atTrip: next.above + 1, rate: next.rate, tripsAway: next.above + 1 - trips } : null,
    basic: r2(basic), basicProjected: r2(basicProjected),
    daily: r2(dailyPaid), dailyDays6: days.filter((d) => d.tripsCounted >= 6).length, dailyDays9: days.filter((d) => d.tripsCounted >= 9).length,
    slab: r2(slabPaid), slabHeld: r2(slabAcc - slabPaid), reviews: r2(revPaid), devices: r2(devPaid),
    macbookRepairs: sum((d) => d.macbookRepairs), iphoneRepairs: sum((d) => d.iphoneRepairs),
    leads: r2(leadPaid), sunday: r2(sunPaid), sundaysWorked: days.filter((d) => d.sunday > 0).length,
    petrol: r2(petrol), km: sum((d) => d.km ?? 0), adjustments: r2(adj), locked: r2(locked),
    incentives: r2(incentives), total: r2(basic + incentives + petrol + adj), absences,
  };
}

/** Plain-language lines describing a plan (shown to the Ninja and in the editor). */
export function describePlan(p: PayPlan): string[] {
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const out: string[] = [];
  out.push(`Daily: ${[...p.dailyTiers].sort((a, b) => a.minTrips - b.minTrips).map((t) => `${t.minTrips}+ trips = ${inr(t.amount)}`).join(", ")} (per day, completed trips only).`);
  out.push(`Monthly target: at least ${p.monthlyMinTrips} trips, otherwise only petrol is paid. Then ${[...p.slabs].sort((a, b) => a.above - b.above).map((s) => `trips above ${s.above} = ${inr(s.rate)} each`).join(", ")}.`);
  out.push(`Petrol: ${inr(p.petrolPerKm)} per km on your odometer reading.`);
  out.push(`Reviews (5★, verified): ${[...p.reviewTiers].sort((a, b) => a.min - b.min).map((t) => `${t.min}+ = ${inr(t.amount)}`).join(", ")}.`);
  out.push(`Devices: MacBook ${inr(p.macbookPerRepair)}, iPhone above ${p.iphoneAboveModel} ${inr(p.iphonePerRepair)} per repair (listed models only).`);
  if (p.distanceEnabled) out.push(`Long trips count extra: ${[...p.distanceTiers].sort((a, b) => a.upToKm - b.upToKm).map((t) => `up to ${t.upToKm} km = ${t.trips}`).join(", ")} (one way, ±${p.distanceToleranceKm} km).`);
  out.push(`Sunday: ${inr(p.sundayBonus)} per Sunday worked${p.sundayNeedsNoAbsent ? ", if you have no absence that month" : ""}.`);
  out.push(`Organic billed leads: ${[...p.leadTiers].sort((a, b) => a.min - b.min).map((t) => `${t.min}+ = ${inr(t.perLead)} each`).join(", ")}${p.leadGiftAt ? `; ${p.leadGiftAt} leads earns a gift` : ""}.`);
  return out;
}
