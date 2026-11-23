/**
 * Shared date-filter transport for the Dashboard → Tickets / Invoices flow.
 *
 * The Dashboard timeline control and the Tickets/Invoices date strips use two
 * slightly different preset vocabularies (the dashboard has "This Month" /
 * "This Year"; the list pages use the 8-option "1 Month / Last Month / 1 Year"
 * strip). Rather than change what any preset MEANS on its own page, this module
 * provides a single canonical mapping + query-param builder so the active
 * dashboard window travels intact when navigating to a destination page.
 *
 * Transport contract (URL query params):
 *   ?dateRange=<destination-preset>
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   (only for custom)
 *
 * The destination pages (Tickets, Invoice) already own the definitions for
 * each preset value, so the receiver just applies the preset it is handed —
 * no duplicate date math is introduced.
 */

/** Dashboard timeline preset vocabulary (as used by the dashboard page). */
export type DashboardDatePreset =
  | "today"
  | "yesterday"
  | "7days"
  | "thismonth"
  | "this_month"
  | "last_month"
  | "thisyear"
  | "this_year"
  | "all"
  | "custom";

/** Destination (Tickets / Invoice) preset vocabulary — the shared 8-option strip. */
export type ListDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "7days"
  | "thismonth"
  | "lastmonth"
  | "thisyear"
  | "custom";

/**
 * THE canonical date-range strip (Tickets / Invoice / Walk-In / Field / Leads /
 * Dashboards / Reports-style strips). Every date-range strip in the app shows
 * exactly these options in this order:
 *   All · Today · Yesterday · This Month · Last Month · This Year · Custom
 * Surfaces with their own value vocabulary map these labels onto their own
 * keys, but the LABELS, ORDER and MEANING stay identical.
 */
export const STANDARD_DATE_STRIP: { label: string; value: ListDatePreset }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Month", value: "thismonth" },
  { label: "Last Month", value: "lastmonth" },
  { label: "This Year", value: "thisyear" },
  { label: "Custom", value: "custom" },
];
/**
 * Map a Dashboard preset to the equivalent destination-page preset so the same
 * time window is applied on Tickets / Invoices. The dashboard "This Month" and
 * "This Year" collapse onto the destination's rolling "This Month" / "This Year"
 * presets — the closest existing definitions on those pages (no new preset is
 * introduced). Custom ranges travel via explicit from/to dates and so are
 * unaffected by this mapping.
 */
export function mapDashboardRangeToListPreset(preset: DashboardDatePreset): ListDatePreset {
  switch (preset) {
    case "today": return "today";
    case "yesterday": return "yesterday";
    case "7days": return "7days";
    case "thismonth":
    case "this_month": return "thismonth";
    case "last_month": return "lastmonth";
    case "thisyear":
    case "this_year": return "thisyear";
    case "all": return "all";
    case "custom": return "custom";
    default: return "all";
  }
}

/** Format a Date as a YYYY-MM-DD string suitable for the custom from/to params. */
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Append the active dashboard date window to a URLSearchParams so a destination
 * page can inherit the exact same range. For custom ranges both `from` and `to`
 * are written; for all other presets a single `dateRange` value is written.
 *
 * Passing preset "all" writes `dateRange=all` explicitly so the destination
 * shows everything rather than falling back to its own "today" default.
 */
export function appendDateFilterParams(
  params: URLSearchParams,
  preset: DashboardDatePreset,
  customRange?: { start: Date | null; end: Date | null }
): URLSearchParams {
  if (preset === "custom") {
    if (customRange?.start && customRange?.end) {
      params.set("dateRange", "custom");
      params.set("from", toDateInputValue(customRange.start));
      params.set("to", toDateInputValue(customRange.end));
    }
    // Incomplete custom range → carry nothing so the destination keeps a sane
    // default rather than an empty window.
    return params;
  }
  params.set("dateRange", mapDashboardRangeToListPreset(preset));
  return params;
}

/**
 * Read date-filter params written by {@link appendDateFilterParams} from a
 * URLSearchParams (or Next.js ReadonlyURLSearchParams). Returns the destination
 * preset plus optional custom from/to, or null when no date param is present
 * (so the caller can keep its own default).
 */
export function readDateFilterParams(
  searchParams: { get: (key: string) => string | null }
): { preset: ListDatePreset; from?: string; to?: string } | null {
  const rawParam = searchParams.get("dateRange");
  if (!rawParam) return null;
  // Legacy vocabulary from older links.
  const raw = rawParam === "1month" || rawParam === "this_month" ? "thismonth" : rawParam === "1year" || rawParam === "this_year" ? "thisyear" : rawParam;
  const valid: ListDatePreset[] = [
    "all", "today", "yesterday", "7days", "thismonth", "lastmonth", "thisyear", "custom",
  ];
  const preset = (valid as string[]).includes(raw) ? (raw as ListDatePreset) : "all";
  if (preset === "custom") {
    return {
      preset,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    };
  }
  return { preset };
}

/* ────────────────────────────────────────────────────────────────────────
 * SHARED DATE-RANGE BOUNDARY LOGIC — single source of truth
 *
 * This is the ONE place that decides what each destination (Tickets / Invoice)
 * preset MEANS in terms of concrete date boundaries. Both the Tickets module
 * and the Dashboard "Critical Tasks" card call `isInListDateRange` so a given
 * window (e.g. "This Month") resolves to the EXACT same set of records on both
 * pages. Do not re-implement this math anywhere else — import this instead.
 *
 * Contract:
 *   • The date field compared is the record's CREATED date (createdAt). This
 *     mirrors the Tickets module, which has always filtered on createdAt.
 *   • Boundaries are computed in the browser's local timezone (IST for this
 *     app) via startOfDay(), matching the Tickets module exactly.
 *   • Ranges are inclusive of both boundaries where a boundary applies.
 * ──────────────────────────────────────────────────────────────────────── */

/** Local-timezone start-of-day (00:00:00.000). */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Return true when `createdAt` falls inside the given destination-page date
 * `preset`. This is the canonical boundary logic shared by the Tickets module
 * and the Dashboard Critical Tasks card.
 *
 * @param createdAt  ISO string of the record's created date.
 * @param preset     A {@link ListDatePreset} value.
 * @param customFrom For "custom": inclusive lower bound (YYYY-MM-DD or ISO).
 * @param customTo   For "custom": inclusive upper bound (YYYY-MM-DD or ISO).
 */
export function isInListDateRange(
  createdAt: string,
  preset: ListDatePreset,
  customFrom?: string,
  customTo?: string
): boolean {
  if (preset === "all") return true;
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return true;
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  switch (preset) {
    case "today":
      return created >= todayStart;
    case "yesterday":
      return created >= todayStart - 86_400_000 && created < todayStart;
    case "7days":
      return created >= todayStart - 7 * 86_400_000;
    case "thismonth": {
      // Calendar month to date (1st of this month → now).
      return created >= startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getTime();
    }
    case "lastmonth": {
      // Previous calendar month (e.g. today in Sep → all of August).
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)).getTime();
      const end = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getTime();
      return created >= start && created < end;
    }
    case "thisyear": {
      // Calendar year to date (1 Jan → now).
      return created >= startOfDay(new Date(now.getFullYear(), 0, 1)).getTime();
    }
    case "custom": {
      if (!customFrom && !customTo) return true;
      const from = customFrom ? startOfDay(new Date(customFrom)).getTime() : -Infinity;
      const to = customTo ? startOfDay(new Date(customTo)).getTime() + 86_400_000 - 1 : Infinity;
      return created >= from && created <= to;
    }
    default:
      return true;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * ORG-TIMEZONE variant (Assigned Leads inbox). Same preset semantics as
 * `isInListDateRange`, but "today" / "yesterday" / month edges are calendar
 * days in the ORGANISATION timezone (organization_settings.timezone) instead
 * of the browser's. Falls back to the local-timezone logic if `tz` is invalid.
 * ──────────────────────────────────────────────────────────────────────── */
function dayKeyInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}
function keyToDayNum(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}
function dayNumFromUtcParts(y: number, monthIndex: number, d: number): number {
  return Math.floor(Date.UTC(y, monthIndex, d) / 86_400_000);
}

export function isInListDateRangeTz(
  iso: string,
  preset: ListDatePreset,
  customFrom: string | undefined,
  customTo: string | undefined,
  tz: string,
  nowMs: number = Date.now(),
): boolean {
  if (preset === "all") return true;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return true;
  let todayKey: string;
  let rowKey: string;
  try {
    todayKey = dayKeyInTz(nowMs, tz);
    rowKey = dayKeyInTz(t, tz);
  } catch {
    return isInListDateRange(iso, preset, customFrom, customTo);
  }
  const today = keyToDayNum(todayKey);
  const n = keyToDayNum(rowKey);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  switch (preset) {
    case "today": return n === today;
    case "yesterday": return n === today - 1;
    case "7days": return n >= today - 7 && n <= today;
    case "thismonth": return n >= dayNumFromUtcParts(ty, tm - 1, 1) && n <= today;
    case "lastmonth": {
      const start = dayNumFromUtcParts(ty, tm - 2, 1);
      const end = dayNumFromUtcParts(ty, tm - 1, 1);
      return n >= start && n < end;
    }
    case "thisyear": return n >= dayNumFromUtcParts(ty, 0, 1) && n <= today;
    case "custom": {
      if (!customFrom && !customTo) return true;
      const from = customFrom ? keyToDayNum(customFrom.slice(0, 10)) : -Infinity;
      const to = customTo ? keyToDayNum(customTo.slice(0, 10)) : Infinity;
      return n >= from && n <= to;
    }
    default: return true;
  }
}

/**
 * Convenience: apply a DASHBOARD preset (this_month / this_year / …) using the
 * SAME boundary logic as the destination pages, by first mapping it to the
 * canonical {@link ListDatePreset}. This is what the Dashboard Critical Tasks
 * card uses so its window matches the Tickets module exactly.
 *
 * @param createdAt   ISO string of the record's created date.
 * @param preset      A {@link DashboardDatePreset} value.
 * @param customRange For "custom": {start, end} Date objects (or nulls).
 */
export function isInDashboardDateRange(
  createdAt: string,
  preset: DashboardDatePreset,
  customRange?: { start: Date | null; end: Date | null }
): boolean {
  if (preset === "custom") {
    // A custom range needs an explicit start/end; incomplete → match all so the
    // card doesn't blank out while the user is still picking dates.
    if (!customRange?.start || !customRange?.end) return true;
    return isInListDateRange(
      createdAt,
      "custom",
      customRange.start.toISOString(),
      customRange.end.toISOString()
    );
  }
  return isInListDateRange(createdAt, mapDashboardRangeToListPreset(preset));
}
