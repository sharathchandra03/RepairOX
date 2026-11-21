/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Ninja Daily Activity engine (pure, no React, no I/O).
   Replaces the manual "Ninja Daily Activity" spreadsheet:
     • Day activity     → one row per Ninja for ONE day
     • Month summary    → one row per Ninja for the selected period
     • Store activity   → one row per store for ONE day
   Unit of work = one trip LEG (field_trips row: pickup | drop | onsite) done by
   one Ninja, so a job with a pickup Ninja and a different drop Ninja credits
   each of them (as the sheet does). Warranty comes from the job's lead type.
   Definitions (same as the sheet):
     ASSIGNED  = leg that is not cancelled        COMPLETED = status "completed"
     BUYBACK   = pickup-style leg of a job whose type is Buyback (its own column, not in Pickup)
     XL        = leg with GPS distance above XL_KM (40 km) — derived, never typed
     REVIEWS   = customer reviews of the Ninja recorded in the Ninja app (count + average stars)
     TOTAL     = all assigned legs (new + warranty + buyback)
     6+ / 9+   = Ninja's TOTAL for the day is ≥ 6 / ≥ 9 (month: number of such days)
     MacBook   = legs whose device name contains "MacBook"
     iPhone>14 = legs whose device name is an iPhone numbered above 14
     KMs       = GPS distance recorded for the leg (null = not tracked)
   Nothing is guessed: XL needs a tracked distance, and a leg without tracking is not XL.
   ────────────────────────────────────────────────────────────────────────── */
export type LegType = "pickup" | "drop" | "onsite";
/** A trip longer than this many km (GPS distance) is an "XL trip". */
export const XL_KM = 40;
export interface Leg {
  id: string;
  jobId: string;
  type: LegType;
  status: string;
  ninjaId: string;
  /** Local calendar day the leg belongs to (YYYY-MM-DD). */
  date: string;
  storeKey: string;
  storeLabel: string;
  warranty: boolean;
  /** Pickup-style leg of a Buyback job. */
  buyback?: boolean;
  /** Customer rating (1-5) recorded for this leg, if any. */
  rating?: number | null;
  device: string;
  /** Tracked GPS distance in metres; null when the trip has no tracking. */
  distanceM: number | null;
}
export const isAssignedLeg = (l: Pick<Leg, "status">) => l.status !== "cancelled";
export const isDoneLeg = (l: Pick<Leg, "status">) => l.status === "completed";
export const isXlLeg = (l: Pick<Leg, "distanceM">) => l.distanceM != null && l.distanceM / 1000 > XL_KM;
export const THRESHOLDS = [6, 9] as const;

export const isMacBook = (device: string) => /mac\s*book/i.test(device);
export function isNewerIphone(device: string, above = 14): boolean {
  const m = /i\s*phone\s*(\d{1,2})/i.exec(device);
  return !!m && Number(m[1]) > above;
}

export interface Cell { assigned: number; completed: number }
const cell = (): Cell => ({ assigned: 0, completed: 0 });
export interface NinjaDayRow {
  ninjaId: string;
  onsite: Cell; pickup: Cell; drop: Cell; buyback: Cell;
  warrantyOnsite: number; warrantyPickup: number; warrantyDrop: number;
  total: number;
  xl: number;
  reviews: number; ratingSum: number;
  macbook: number; iphone: number;
  km: number | null;
  hit6: boolean; hit9: boolean;
}
function add(r: NinjaDayRow, l: Leg) {
  if (!isAssignedLeg(l)) return;
  const done = isDoneLeg(l);
  if (l.buyback) {
    r.buyback.assigned++; if (done) r.buyback.completed++;
  } else if (l.warranty) {
    if (l.type === "onsite") r.warrantyOnsite++; else if (l.type === "pickup") r.warrantyPickup++; else r.warrantyDrop++;
  } else {
    const c = r[l.type];
    c.assigned++; if (done) c.completed++;
  }
  r.total++;
  if (isXlLeg(l)) r.xl++;
  if (l.rating != null) { r.reviews++; r.ratingSum += l.rating; }
  if (isMacBook(l.device)) r.macbook++;
  if (isNewerIphone(l.device)) r.iphone++;
  if (l.distanceM != null) r.km = (r.km ?? 0) + l.distanceM / 1000;
}
const blank = (ninjaId: string): NinjaDayRow => ({
  ninjaId, onsite: cell(), pickup: cell(), drop: cell(), buyback: cell(), warrantyOnsite: 0, warrantyPickup: 0, warrantyDrop: 0,
  total: 0, xl: 0, reviews: 0, ratingSum: 0, macbook: 0, iphone: 0, km: null, hit6: false, hit9: false,
});
const finish = (r: NinjaDayRow): NinjaDayRow => ({
  ...r, km: r.km == null ? null : Math.round(r.km), hit6: r.total >= THRESHOLDS[0], hit9: r.total >= THRESHOLDS[1],
});
const sortRows = <T extends { total: number }>(rows: T[], label: (r: T) => string) =>
  rows.sort((a, b) => b.total - a.total || label(a).localeCompare(label(b)));

/** One row per Ninja for a single day. Ninjas with no legs that day are not listed. */
export function ninjaDayRows(legs: Leg[], date: string, nameOf: (id: string) => string): NinjaDayRow[] {
  const by = new Map<string, NinjaDayRow>();
  for (const l of legs) {
    if (l.date !== date || !l.ninjaId) continue;
    const r = by.get(l.ninjaId) ?? blank(l.ninjaId);
    add(r, l); by.set(l.ninjaId, r);
  }
  return sortRows([...by.values()].map(finish), (r) => nameOf(r.ninjaId));
}

export interface NinjaMonthRow extends Omit<NinjaDayRow, "hit6" | "hit9"> {
  /** Number of days on which the Ninja's total reached 6+ / 9+. */
  days6: number; days9: number; activeDays: number;
}
/** One row per Ninja over [from, to]; the 6+/9+ columns count qualifying days. */
export function ninjaPeriodRows(legs: Leg[], from: string | null, to: string | null, nameOf: (id: string) => string): NinjaMonthRow[] {
  const inRange = legs.filter((l) => l.ninjaId && (!from || l.date >= from) && (!to || l.date <= to));
  const by = new Map<string, { row: NinjaDayRow; perDay: Map<string, number> }>();
  for (const l of inRange) {
    const e = by.get(l.ninjaId) ?? { row: blank(l.ninjaId), perDay: new Map() };
    add(e.row, l);
    if (isAssignedLeg(l)) e.perDay.set(l.date, (e.perDay.get(l.date) ?? 0) + 1);
    by.set(l.ninjaId, e);
  }
  const out = [...by.values()].map(({ row, perDay }) => {
    const { hit6: _a, hit9: _b, ...rest } = finish(row);
    const counts = [...perDay.values()];
    return { ...rest, days6: counts.filter((n) => n >= THRESHOLDS[0]).length, days9: counts.filter((n) => n >= THRESHOLDS[1]).length, activeDays: counts.length };
  });
  return sortRows(out, (r) => nameOf(r.ninjaId));
}

export interface StoreDayRow { key: string; label: string; onsite: Cell; pickup: Cell; drop: Cell; total: number; completed: number }
/** One row per store for a single day (new + warranty legs both counted in `total`). */
export function storeDayRows(legs: Leg[], date: string): StoreDayRow[] {
  const by = new Map<string, StoreDayRow>();
  for (const l of legs) {
    if (l.date !== date || !isAssignedLeg(l)) continue;
    const r = by.get(l.storeKey) ?? { key: l.storeKey, label: l.storeLabel, onsite: cell(), pickup: cell(), drop: cell(), total: 0, completed: 0 };
    const c = r[l.type]; c.assigned++; r.total++;
    if (isDoneLeg(l)) { c.completed++; r.completed++; }
    by.set(l.storeKey, r);
  }
  return sortRows([...by.values()], (r) => r.label);
}

/** One row per store over a whole period (inclusive YYYY-MM-DD bounds; null = unbounded). */
export function storePeriodRows(legs: Leg[], from: string | null, to: string | null): StoreDayRow[] {
  const by = new Map<string, StoreDayRow>();
  for (const l of legs) {
    if (!isAssignedLeg(l) || (from && l.date < from) || (to && l.date > to)) continue;
    const r = by.get(l.storeKey) ?? { key: l.storeKey, label: l.storeLabel, onsite: cell(), pickup: cell(), drop: cell(), total: 0, completed: 0 };
    const c = r[l.type]; c.assigned++; r.total++;
    if (isDoneLeg(l)) { c.completed++; r.completed++; }
    by.set(l.storeKey, r);
  }
  return sortRows([...by.values()], (r) => r.label);
}

/** Average stars, one decimal; null when there are no reviews. */
export const avgRating = (r: { reviews: number; ratingSum: number }): number | null =>
  r.reviews ? Math.round((r.ratingSum / r.reviews) * 10) / 10 : null;

export function sumDayRows(rows: NinjaDayRow[]): NinjaDayRow {
  const t = blank("__total");
  for (const r of rows) {
    for (const k of ["onsite", "pickup", "drop", "buyback"] as const) { t[k].assigned += r[k].assigned; t[k].completed += r[k].completed; }
    t.warrantyOnsite += r.warrantyOnsite; t.warrantyPickup += r.warrantyPickup; t.warrantyDrop += r.warrantyDrop;
    t.total += r.total; t.xl += r.xl; t.reviews += r.reviews; t.ratingSum += r.ratingSum; t.macbook += r.macbook; t.iphone += r.iphone;
    if (r.km != null) t.km = (t.km ?? 0) + r.km;
  }
  return t;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Days offered in the day picker: the period clipped to today, newest first (max 62). "All" = last 31 days. */
export function pickableDays(from: string | null, to: string | null, today = new Date()): string[] {
  const t = ymd(today);
  const end = to && to < t ? to : t;
  const start = from ?? ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
  const out: string[] = [];
  const [y, m, d] = end.split("-").map(Number);
  for (let i = 0; i < 62; i++) {
    const s = ymd(new Date(y, m - 1, d - i));
    if (s < start) break;
    out.push(s);
  }
  return out;
}
