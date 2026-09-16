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
  | "this_month"
  | "this_year"
  | "all"
  | "custom";

/** Destination (Tickets / Invoice) preset vocabulary — the shared 8-option strip. */
export type ListDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "7days"
  | "1month"
  | "lastmonth"
  | "1year"
  | "custom";

/**
 * Map a Dashboard preset to the equivalent destination-page preset so the same
 * time window is applied on Tickets / Invoices. The dashboard "This Month" and
 * "This Year" collapse onto the destination's rolling "1 Month" / "1 Year"
 * presets — the closest existing definitions on those pages (no new preset is
 * introduced). Custom ranges travel via explicit from/to dates and so are
 * unaffected by this mapping.
 */
export function mapDashboardRangeToListPreset(preset: DashboardDatePreset): ListDatePreset {
  switch (preset) {
    case "today": return "today";
    case "yesterday": return "yesterday";
    case "this_month": return "1month";
    case "this_year": return "1year";
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
  const raw = searchParams.get("dateRange");
  if (!raw) return null;
  const valid: ListDatePreset[] = [
    "all", "today", "yesterday", "7days", "1month", "lastmonth", "1year", "custom",
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
 * window (e.g. "1 Month") resolves to the EXACT same set of records on both
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
    case "1month": {
      // Rolling one month relative to today.
      const from = new Date(now);
      from.setMonth(from.getMonth() - 1);
      return created >= startOfDay(from).getTime();
    }
    case "lastmonth": {
      // Previous calendar month (e.g. today in Sep → all of August).
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)).getTime();
      const end = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getTime();
      return created >= start && created < end;
    }
    case "1year": {
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 1);
      return created >= startOfDay(from).getTime();
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
