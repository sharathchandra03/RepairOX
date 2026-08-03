/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Date range resolution + bucketing
   ──────────────────────────────────────────────────────────────────────────
   Turns a preset (or custom range) into a concrete {from, to} window, computes
   the *comparable previous period* for deltas & comparisons, and buckets any
   date into day/week/month/quarter/year keys for trend series.

   The financial year follows the Indian convention (1 Apr → 31 Mar).
   ────────────────────────────────────────────────────────────────────────── */

import type { DatePresetId, DateRange, Granularity } from "./types";

export const DATE_PRESETS: { id: DatePresetId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7", label: "Last 7 Days" },
  { id: "last_30", label: "Last 30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "quarter", label: "This Quarter" },
  { id: "financial_year", label: "Financial Year" },
  { id: "custom", label: "Custom Range" },
];

const PRESET_LABEL: Record<DatePresetId, string> = Object.fromEntries(
  DATE_PRESETS.map((p) => [p.id, p.label])
) as Record<DatePresetId, string>;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Financial year start for a given date (India: April 1). */
function financialYearStart(d: Date): Date {
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return startOfDay(new Date(year, 3, 1));
}

/** Resolve a preset (+ optional custom bounds) into a concrete range.
 *  `now` is injectable for testing; defaults to the current time. */
export function resolveDateRange(
  preset: DatePresetId,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date()
): DateRange {
  const today = startOfDay(now);

  const mk = (from: Date, to: Date, label: string): DateRange => ({
    from: startOfDay(from),
    to: endOfDay(to),
    label,
    presetId: preset,
  });

  switch (preset) {
    case "today":
      return mk(today, today, "Today");
    case "yesterday": {
      const y = addDays(today, -1);
      return mk(y, y, "Yesterday");
    }
    case "last_7":
      return mk(addDays(today, -6), today, "Last 7 Days");
    case "last_30":
      return mk(addDays(today, -29), today, "Last 30 Days");
    case "this_month":
      return mk(new Date(today.getFullYear(), today.getMonth(), 1), today, "This Month");
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return mk(first, last, "Last Month");
    }
    case "quarter": {
      const q = Math.floor(today.getMonth() / 3);
      const first = new Date(today.getFullYear(), q * 3, 1);
      return mk(first, today, `Q${q + 1} ${today.getFullYear()}`);
    }
    case "financial_year": {
      const fyStart = financialYearStart(today);
      return mk(fyStart, today, `FY ${fyStart.getFullYear()}-${String(fyStart.getFullYear() + 1).slice(2)}`);
    }
    case "custom": {
      const from = customFrom ? new Date(customFrom) : addDays(today, -29);
      const to = customTo ? new Date(customTo) : today;
      const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      return mk(from, to, `${fmt(from)} — ${fmt(to)}`);
    }
    default:
      return mk(addDays(today, -29), today, PRESET_LABEL[preset] ?? "Last 30 Days");
  }
}

/** The immediately-preceding window of the same length (for delta / comparison).
 *  Special-cased for calendar presets so "This Month" compares to "Last Month". */
export function previousRange(range: DateRange, now: Date = new Date()): DateRange {
  const today = startOfDay(now);

  if (range.presetId === "this_month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: startOfDay(first), to: endOfDay(last), label: "Previous Month", presetId: "last_month" };
  }
  if (range.presetId === "financial_year") {
    const fyStart = financialYearStart(today);
    const prevStart = new Date(fyStart.getFullYear() - 1, 3, 1);
    const prevEnd = new Date(fyStart.getFullYear(), 2, 31);
    return { from: startOfDay(prevStart), to: endOfDay(prevEnd), label: "Previous FY", presetId: "financial_year" };
  }

  // Generic: same duration, immediately before `from`.
  const durationMs = range.to.getTime() - range.from.getTime();
  const prevTo = new Date(range.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return {
    from: startOfDay(prevFrom),
    to: endOfDay(prevTo),
    label: "Previous Period",
    presetId: range.presetId,
  };
}

/** Robustly parse any of the date shapes used across the app
 *  (ISO datetime, `yyyy-mm-dd`, or empty). Returns null when unparseable. */
export function parseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  // Bare date → anchor to local midday to avoid TZ drift across day boundaries.
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T12:00:00` : input;
  const d = new Date(bare);
  return isNaN(d.getTime()) ? null : d;
}

export function inRange(dateStr: string | null | undefined, range: DateRange): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime();
}

/** Number of whole days in a range (min 1). */
export function daysInRange(range: DateRange): number {
  const ms = range.to.getTime() - range.from.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** Choose a sensible bucketing granularity for a range's span. */
export function autoGranularity(range: DateRange): Granularity {
  const days = daysInRange(range);
  if (days <= 1) return "day";
  if (days <= 45) return "day";
  if (days <= 120) return "week";
  if (days <= 730) return "month";
  return "year";
}

function weekKey(d: Date): string {
  // ISO-ish week: anchor to Monday.
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return `${x.getFullYear()}-W${String(getWeekNumber(x)).padStart(2, "0")}`;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = date.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 86_400_000));
}

/** Bucket key for a date at a given granularity (stable, sortable). */
export function bucketKey(d: Date, g: Granularity): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  switch (g) {
    case "day":
      return `${y}-${m}-${String(d.getDate()).padStart(2, "0")}`;
    case "week":
      return weekKey(d);
    case "month":
      return `${y}-${m}`;
    case "quarter":
      return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    case "year":
      return `${y}`;
  }
}

/** Human label for a bucket key. */
export function bucketLabel(key: string, g: Granularity): string {
  switch (g) {
    case "day": {
      const d = parseDate(key);
      return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : key;
    }
    case "week":
      return key.replace(/^\d{4}-/, "");
    case "month": {
      const [y, m] = key.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    }
    case "quarter": {
      const [y, q] = key.split("-");
      return `${q} ${String(y).slice(2)}`;
    }
    case "year":
      return key;
    default:
      return key;
  }
}
