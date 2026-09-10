/* ──────────────────────────────────────────────────────────────────────────
   Walk-In module — shared data helpers (single source of truth)

   Everything the Shop → Walk-In table, create/edit flow, report, CSV import and
   export rely on lives here so the numbers can never diverge between views:
     • WK-### business number generation
     • Source master (configurable, localStorage-backed, historically safe)
     • Import normalization for TYPE / SOURCE / FINAL STATUS / DATE / CONTACT
     • Date-range filtering (identical philosophy to Tickets/Invoice)
     • CSV parsing + header recognition + row → WalkIn mapping + validation

   This module contains only pure helpers plus one small React hook for the
   source master; it deliberately avoids duplicating Customer, Employee or
   Device Catalog data — those come from the central store.
   ────────────────────────────────────────────────────────────────────────── */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type WalkIn,
  type WalkInType,
  type WalkInStatus,
  WALKIN_STATUS_LABEL,
  followUpDueAt,
} from "@/lib/mock-data";

/* ─── WK-### business number ─────────────────────────────────────────────── */

/** Format a sequence number as the visible Walk-In identifier, e.g. "WK-001". */
export function formatWalkInNumber(n: number): string {
  return `WK-${String(n).padStart(3, "0")}`;
}

/** Extract the numeric part of a "WK-###" value, or 0 when it doesn't match. */
export function walkInSeq(value: string | null | undefined): number {
  const m = String(value ?? "").match(/^WK-(\d+)$/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Next sequential WK number derived from the existing walk-ins. Considers each
 * record's `walkInNumber` (and its legacy `id` when it happens to be WK-shaped)
 * so historical/imported numbers are never re-used. Returns the display string.
 */
export function nextWalkInNumber(existing: WalkIn[]): string {
  let max = 0;
  for (const w of existing) {
    max = Math.max(max, walkInSeq(w.walkInNumber), walkInSeq(w.id));
  }
  return formatWalkInNumber(max + 1);
}

/** Generate a unique primary-key id for a new walk-in (never the WK number). */
export function genWalkInId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `WK-${time}-${rand}`;
}

/** The identifier shown to users: prefer the WK number, else the raw id. */
export function walkInDisplayId(w: WalkIn): string {
  return w.walkInNumber || (walkInSeq(w.id) ? formatWalkInNumber(walkInSeq(w.id)) : w.id);
}

/**
 * Map a Walk-In handling type to the Customer's ORIGIN source, used when a
 * brand-new customer master record is created from a walk-in (both quick-create
 * in the form and bulk import). Direct → "Direct Walk-In", Sales → "Sales".
 * Single source of truth so the form and the importer tag customers identically.
 * An existing customer's own source is never overwritten.
 */
export function walkInTypeToCustomerSource(t: WalkInType | undefined): "direct_walkin" | "sales" {
  return t === "sales" ? "sales" : "direct_walkin";
}

/* ─── Source master (configurable, historically safe) ────────────────────── */

const SOURCES_STORAGE_KEY = "repairox-walkin-sources";
export const DEFAULT_WALKIN_SOURCES = ["GMB", "META", "REFERENCE", "Other"];

function loadSources(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_WALKIN_SOURCES];
  try {
    const raw = localStorage.getItem(SOURCES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_WALKIN_SOURCES];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string") && parsed.length) {
      return parsed;
    }
  } catch { /* ignore */ }
  return [...DEFAULT_WALKIN_SOURCES];
}

/**
 * React hook exposing the configurable Walk-In source master. Persists to
 * localStorage so administrators can add sources without a code change and the
 * list survives reloads. Archiving (removing) a source only affects NEW
 * walk-ins — historical records keep whatever source string they were saved
 * with, so no historical data is ever lost.
 */
export function useWalkInSources() {
  const [sources, setSources] = useState<string[]>(() => [...DEFAULT_WALKIN_SOURCES]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSources(loadSources());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources)); } catch { /* ignore */ }
  }, [sources, hydrated]);

  const addSource = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setSources((prev) => (prev.some((s) => s.toLowerCase() === clean.toLowerCase()) ? prev : [...prev, clean]));
  }, []);

  const removeSource = useCallback((name: string) => {
    setSources((prev) => prev.filter((s) => s !== name));
  }, []);

  const renameSource = useCallback((from: string, to: string) => {
    const clean = to.trim();
    if (!clean) return;
    setSources((prev) => prev.map((s) => (s === from ? clean : s)));
  }, []);

  const resetSources = useCallback(() => setSources([...DEFAULT_WALKIN_SOURCES]), []);

  return { sources, hydrated, addSource, removeSource, renameSource, resetSources };
}

/** Read the source master outside React (e.g. during import). */
export function getWalkInSources(): string[] {
  return loadSources();
}

/* ─── Sales-assignment behaviour (configurable) ──────────────────────────── */

const REQUIRE_SALES_KEY = "repairox-walkin-require-sales";

function loadRequireSales(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(REQUIRE_SALES_KEY) === "1"; } catch { return false; }
}

/** Hook exposing whether a Sales walk-in must have a sales person assigned. */
export function useWalkInRequireSalesPerson() {
  const [value, setValue] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setValue(loadRequireSales()); setHydrated(true); }, []);

  const set = useCallback((next: boolean) => {
    setValue(next);
    try { localStorage.setItem(REQUIRE_SALES_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  return { requireSalesPerson: value, setRequireSalesPerson: set, hydrated };
}

/* ─── Follow-Up view helpers ─────────────────────────────────────────────────
   The Follow-Up view surfaces walk-ins that ACTUALLY have a scheduled follow-up
   still pending. State is derived purely from the walk-in record (followUpDate/
   followUpTime/followUpStatus) — no parallel reminder engine. These helpers
   classify each pending follow-up as Overdue / Today / Upcoming and provide the
   intelligent ordering the view uses (overdue first, then today, then upcoming;
   nearest due first within each bucket). "done" follow-ups are treated as
   Completed and excluded from the pending list (history is preserved on the
   record). */

export type FollowUpState = "overdue" | "today" | "upcoming" | "completed";

/** Does this walk-in have a follow-up scheduled that is still pending? */
export function isPendingFollowUp(w: Pick<WalkIn, "followUpDate" | "followUpStatus">): boolean {
  return !!w.followUpDate && w.followUpStatus !== "done";
}

/** Classify a walk-in's follow-up into a display state, relative to `now`. */
export function followUpState(
  w: Pick<WalkIn, "followUpDate" | "followUpTime" | "followUpStatus">,
  now: Date = new Date(),
): FollowUpState | null {
  if (!w.followUpDate) return null;
  if (w.followUpStatus === "done") return "completed";
  const due = followUpDueAt(w);
  if (!due) return null;
  // Same calendar day → "Today" (even if the exact time has passed today).
  if (due.toDateString() === now.toDateString()) return "today";
  return due.getTime() < now.getTime() ? "overdue" : "upcoming";
}

/** Sort weight so overdue floats above today above upcoming. */
const FOLLOWUP_ORDER: Record<FollowUpState, number> = { overdue: 0, today: 1, upcoming: 2, completed: 3 };

/**
 * The pending follow-up list for the Follow-Up view: only walk-ins with a
 * pending follow-up, ordered overdue → today → upcoming, then nearest due
 * date/time first within the same bucket.
 */
export function pendingFollowUps(rows: WalkIn[], now: Date = new Date()): WalkIn[] {
  return rows
    .filter((w) => isPendingFollowUp(w))
    .sort((a, b) => {
      const sa = followUpState(a, now) ?? "upcoming";
      const sb = followUpState(b, now) ?? "upcoming";
      if (FOLLOWUP_ORDER[sa] !== FOLLOWUP_ORDER[sb]) return FOLLOWUP_ORDER[sa] - FOLLOWUP_ORDER[sb];
      return (followUpDueAt(a)?.getTime() ?? 0) - (followUpDueAt(b)?.getTime() ?? 0);
    });
}

/* ─── Import normalization ───────────────────────────────────────────────── */

/** Normalize a raw TYPE cell to Direct / Sales. Defaults to "direct". */
export function normalizeWalkInType(raw: string | undefined | null): WalkInType {
  const v = (raw || "").trim().toLowerCase();
  if (v === "sales" || v === "sale") return "sales";
  return "direct";
}

/**
 * Normalize a raw FINAL STATUS cell to a WalkInStatus, tolerating the common
 * spelling / capitalization variants seen in the sales team's spreadsheet.
 * Returns null when the value is unrecognised (surfaced during validation).
 */
export function normalizeWalkInStatus(raw: string | undefined | null): WalkInStatus | null {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return "visitor";
  if (["visitor", "visiter", "visit"].includes(v)) return "visitor";
  if (["enquiry", "enqury", "enquiry ", "inquiry", "enq"].includes(v)) return "enquiry";
  if (["converted ticket", "converted", "ticket", "tickets", "converted_ticket"].includes(v)) return "converted_ticket";
  // Tolerate the exact stored labels too.
  const byLabel = (Object.entries(WALKIN_STATUS_LABEL) as [WalkInStatus, string][])
    .find(([, label]) => label.toLowerCase() === v);
  return byLabel ? byLabel[0] : null;
}

/**
 * Normalize a raw SOURCE cell against the configured source master. Case is
 * normalized to a known source when possible; unknown values are returned
 * verbatim (and flagged during validation) so a row is never silently dropped.
 */
export function normalizeWalkInSource(raw: string | undefined | null, known: string[]): { value: string; known: boolean } {
  const v = (raw || "").trim();
  if (!v) return { value: "", known: false };
  const match = known.find((s) => s.toLowerCase() === v.toLowerCase());
  return match ? { value: match, known: true } : { value: v, known: false };
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Parse a spreadsheet date cell into an ISO `YYYY-MM-DD` string, preserving the
 * historical date. Supports:
 *   • ISO (2026-03-14)             • DD/MM/YYYY or MM/DD/YYYY (14/03/2026)
 *   • "2-Jan" / "14-Mar" (year inferred from `fallbackYear`)
 * Returns null when the value cannot be parsed as a date.
 */
export function parseWalkInDate(raw: string | undefined | null, fallbackYear = new Date().getFullYear()): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  // ISO already.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // "2-Jan" / "14 Mar" style.
  const dm = v.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})/);
  if (dm) {
    const day = dm[1].padStart(2, "0");
    const mon = MONTHS[dm[2].slice(0, 3).toLowerCase()];
    if (mon) return `${fallbackYear}-${mon}-${day}`;
  }
  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM/YYYY (India), fall back sensibly.
  const slash = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (slash) {
    let [, a, b, y] = slash;
    if (y.length === 2) y = `20${y}`;
    let day = a, mon = b;
    // If the first part can't be a day but the second can, swap (MM/DD).
    if (Number(a) > 12 && Number(b) <= 12) { day = a; mon = b; }
    else if (Number(a) <= 12 && Number(b) > 12) { day = b; mon = a; }
    return `${y}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  // "14 March 2026" / "March 14, 2026" style (long month names).
  const long = v.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/) || v.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
  if (long) {
    // Figure out which capture group is the day vs the month name.
    const nums = [long[1], long[2], long[3]];
    const monToken = nums.find((t) => /[A-Za-z]/.test(t));
    const dayToken = nums.find((t) => /^\d{1,2}$/.test(t));
    const yearToken = nums.find((t) => /^\d{4}$/.test(t));
    const mon = monToken ? MONTHS[monToken.slice(0, 3).toLowerCase()] : undefined;
    if (mon && dayToken && yearToken) {
      return `${yearToken}-${mon}-${dayToken.padStart(2, "0")}`;
    }
  }
  // Last resort — let Date try, then build the ISO date from LOCAL components so
  // a timezone offset can never shift the calendar day (which would corrupt a
  // historical import).
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

/** Basic Indian mobile validation used elsewhere: 10–13 digits after cleanup. */
export function isValidContact(raw: string | undefined | null): boolean {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

/* ─── Date-range filtering (same philosophy as Tickets / Invoice) ─────────── */

export type WalkInDateRange =
  | "all" | "today" | "yesterday" | "7days" | "1month" | "lastmonth" | "1year" | "custom";

export const WALKIN_DATE_RANGES: { label: string; value: WalkInDateRange }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 Days", value: "7days" },
  { label: "1 Month", value: "1month" },
  { label: "Last Month", value: "lastmonth" },
  { label: "1 Year", value: "1year" },
  { label: "Custom", value: "custom" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * True when `dateStr` (a walk-in's stored `date`, ISO `YYYY-MM-DD`) falls inside
 * the selected range. Mirrors the Tickets/Invoice `isInDateRange` semantics
 * (rolling windows, previous-calendar-month for "lastmonth", inclusive custom).
 */
export function isWalkInInDateRange(
  dateStr: string,
  range: WalkInDateRange,
  customFrom?: string,
  customTo?: string,
): boolean {
  if (range === "all") return true;
  if (!dateStr) return false;
  const d = startOfDay(new Date(dateStr));
  if (Number.isNaN(d.getTime())) return false;
  const today = startOfDay(new Date());

  switch (range) {
    case "today":
      return d.getTime() === today.getTime();
    case "yesterday": {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return d.getTime() === y.getTime();
    }
    case "7days": {
      const from = new Date(today); from.setDate(from.getDate() - 6);
      return d >= from && d <= today;
    }
    case "1month": {
      const from = new Date(today); from.setMonth(from.getMonth() - 1);
      return d >= from && d <= today;
    }
    case "lastmonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return d >= startOfDay(first) && d <= startOfDay(last);
    }
    case "1year": {
      const from = new Date(today); from.setFullYear(from.getFullYear() - 1);
      return d >= from && d <= today;
    }
    case "custom": {
      const from = customFrom ? startOfDay(new Date(customFrom)) : null;
      const to = customTo ? startOfDay(new Date(customTo)) : null;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }
    default:
      return true;
  }
}

/* ─── Comparison periods (Month-over-Month / Year-over-Year / equal-duration) ──
   These helpers resolve the SELECTED range to concrete [from,to] day bounds and
   compute the correct PREVIOUS comparison window. They reuse the exact same
   calendar semantics as `isWalkInInDateRange` so the report and its comparisons
   can never diverge. All bounds are start-of-day; both ends are inclusive.
   ────────────────────────────────────────────────────────────────────────── */

export type WalkInComparisonMode =
  | "mom"        // Month-over-Month
  | "yoy"        // Year-over-Year
  | "trend"      // no comparison — trend view
  | "source"     // no comparison — source view
  | "conversion"; // no comparison — conversion view

export type DayRange = { from: Date; to: Date };

function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addYears(d: Date, n: number): Date { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function dayCount(r: DayRange): number {
  return Math.floor((startOfDay(r.to).getTime() - startOfDay(r.from).getTime()) / 86_400_000) + 1;
}

/**
 * Resolve the selected date-range pill to a concrete inclusive [from,to] window
 * of calendar days. Returns null for "all" (unbounded) so callers can fall back
 * to the data's own min/max dates. Mirrors `isWalkInInDateRange` exactly.
 */
export function resolveWalkInRange(
  range: WalkInDateRange,
  customFrom?: string,
  customTo?: string,
): DayRange | null {
  const today = startOfDay(new Date());
  switch (range) {
    case "all":
      return null;
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "7days":
      return { from: addDays(today, -6), to: today };
    case "1month":
      return { from: addMonths(today, -1), to: today };
    case "lastmonth": {
      const first = startOfDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      const last = startOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
      return { from: first, to: last };
    }
    case "1year":
      return { from: addYears(today, -1), to: today };
    case "custom": {
      const from = customFrom ? startOfDay(new Date(customFrom)) : today;
      const to = customTo ? startOfDay(new Date(customTo)) : today;
      // Guard against inverted custom ranges.
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default:
      return { from: today, to: today };
  }
}

/**
 * Given a CURRENT window, compute the equivalent PREVIOUS window for the chosen
 * comparison mode:
 *   • mom  → shift back one month (same day span)
 *   • yoy  → shift back one year (same day span)
 * For "trend"/"source"/"conversion" there is no comparison, so this returns
 * null. When the current window is unbounded ("all", current === null) there is
 * likewise nothing meaningful to compare against.
 *
 * The previous window ALWAYS preserves the current window's exact duration, so a
 * 7-day range is compared with the immediately-preceding equal 7-day span — we
 * never compare a 7-day range against a whole month.
 */
export function previousWalkInPeriod(
  current: DayRange | null,
  mode: WalkInComparisonMode,
): DayRange | null {
  if (!current) return null;
  if (mode === "mom") {
    return { from: addMonths(current.from, -1), to: addMonths(current.to, -1) };
  }
  if (mode === "yoy") {
    return { from: addYears(current.from, -1), to: addYears(current.to, -1) };
  }
  return null;
}

/** True when an ISO `YYYY-MM-DD` date falls inside an inclusive DayRange. */
export function isInDayRange(dateStr: string, r: DayRange | null): boolean {
  if (!r) return true; // unbounded (e.g. "all")
  if (!dateStr) return false;
  const d = startOfDay(new Date(dateStr));
  if (Number.isNaN(d.getTime())) return false;
  return d >= startOfDay(r.from) && d <= startOfDay(r.to);
}

/** Human label for a DayRange, e.g. "1 Sep – 9 Sep 26". Compact, en-IN. */
export function fmtRangeLabel(r: DayRange | null): string {
  if (!r) return "All time";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "2-digit" };
  const from = r.from.toLocaleDateString("en-IN", opts);
  const to = r.to.toLocaleDateString("en-IN", opts);
  return from === to ? from : `${from} – ${to}`;
}

export { dayCount as walkInDayCount };

/* ─── Spreadsheet reading (CSV + Excel) ───────────────────────────────────── */

/** File extensions the importer accepts. */
export const WALKIN_IMPORT_ACCEPT = ".csv,.xlsx,.xls,.xlsm,.xlsb,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** True when the file looks like a spreadsheet workbook (not plain CSV). */
function isWorkbookFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return /\.(xlsx|xls|xlsm|xlsb|ods)$/.test(name);
}

/**
 * Read a user-selected file into CSV text so the same parser (`parseWalkInCsv`)
 * handles CSV and Excel identically. CSV files are read as text; Excel/ODS
 * workbooks are parsed with SheetJS and the FIRST non-empty sheet is converted
 * to CSV. This keeps all column-recognition, normalization and validation in
 * one place regardless of the source format.
 */
export async function readSpreadsheetToCsvText(file: File): Promise<string> {
  if (!isWorkbookFile(file)) {
    // Plain CSV / text.
    return await file.text();
  }
  // Excel / ODS workbook — parse with SheetJS (loaded lazily so it never bloats
  // the initial bundle for users who only ever import CSV).
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  // cellDates keeps date cells as real dates; dateNF forces them to a clean,
  // timezone-safe ISO string (yyyy-mm-dd) in the CSV so historical dates are
  // captured exactly as entered — never coerced to today.
  const wb = XLSX.read(buf, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });

  // Pick the first sheet that actually has rows.
  let sheet = null as ReturnType<typeof pickFirstNonEmptySheet>;
  sheet = pickFirstNonEmptySheet(XLSX, wb);
  if (!sheet) return "";

  // Convert to CSV. Date cells emit as yyyy-mm-dd (via dateNF) which
  // parseWalkInDate accepts directly.
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false, forceQuotes: false, dateNF: "yyyy-mm-dd" });
}

function pickFirstNonEmptySheet(
  XLSX: typeof import("xlsx"),
  wb: import("xlsx").WorkBook,
): import("xlsx").WorkSheet | null {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    // A sheet with a range beyond a single empty cell is considered non-empty.
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim().length > 0) return ws;
  }
  // Fall back to the first sheet even if it looks empty.
  const first = wb.SheetNames[0];
  return first ? wb.Sheets[first] ?? null : null;
}

/* ─── CSV parsing + import mapping ────────────────────────────────────────── */

/** Parse a single CSV line, respecting simple double-quoted fields. */
export function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Logical columns the importer understands. */
export type WalkInColumnKey =
  | "date" | "id" | "type" | "source" | "name" | "contact" | "email" | "model" | "issue" | "finalStatus" | "action";

/** Human labels for the recognised columns (used in the mapping UI). */
export const WALKIN_COLUMN_LABELS: Record<WalkInColumnKey, string> = {
  date: "Date", id: "ID", type: "Type", source: "Source", name: "Name",
  contact: "Contact", email: "Email", model: "Model", issue: "Issue", finalStatus: "Final Status", action: "Action",
};

/** Header aliases → logical column. Matched case-insensitively, spaces/underscores ignored. */
const HEADER_ALIASES: Record<WalkInColumnKey, string[]> = {
  date: ["date", "walkindate", "visitdate", "day"],
  id: ["id", "walkinid", "wid", "wkno", "walkinno", "srno", "sno", "sl", "slno"],
  type: ["type", "walkintype", "handledby", "mode"],
  source: ["source", "lead", "leadsource", "channel"],
  name: ["name", "customer", "customername", "person", "client"],
  contact: ["contact", "number", "phone", "mobile", "phoneno", "contactno", "phonenumber"],
  email: ["email", "emailid", "emailaddress", "mail", "mailid"],
  model: ["model", "device", "devicemodel", "product"],
  issue: ["issue", "reason", "problem", "walkinreason", "complaint", "enquiry", "remark", "remarks"],
  finalStatus: ["finalstatus", "status", "outcome", "result", "state"],
  action: ["action", "actions"],
};

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_\-.]/g, "");

/**
 * Recognise spreadsheet headers, returning a map of logical column → source
 * column index, plus the list of unmapped source headers (never discarded
 * silently — surfaced to the user).
 */
export function recognizeColumns(headers: string[]): {
  mapping: Partial<Record<WalkInColumnKey, number>>;
  unmapped: string[];
} {
  const mapping: Partial<Record<WalkInColumnKey, number>> = {};
  const usedKeys = new Set<WalkInColumnKey>();
  const unmapped: string[] = [];

  headers.forEach((raw, idx) => {
    const n = normHeader(raw);
    let matched: WalkInColumnKey | null = null;
    for (const key of Object.keys(HEADER_ALIASES) as WalkInColumnKey[]) {
      if (usedKeys.has(key)) continue;
      if (HEADER_ALIASES[key].includes(n)) { matched = key; break; }
    }
    if (matched) { mapping[matched] = idx; usedKeys.add(matched); }
    else if (raw.trim()) unmapped.push(raw.trim());
  });

  return { mapping, unmapped };
}

export type ParsedWalkInRow = {
  raw: string[];
  data: Partial<WalkIn>;
  /** Detected historical WK id from the file, if any (preserved on import). */
  sourceId?: string;
  issues: string[];
  unknownSource: boolean;
  unknownType: boolean;
  invalidDate: boolean;
  invalidContact: boolean;
};

/** Parse full CSV text into headers + recognised columns + validated rows. */
export function parseWalkInCsv(text: string, knownSources: string[]): {
  headers: string[];
  mapping: Partial<Record<WalkInColumnKey, number>>;
  unmapped: string[];
  rows: ParsedWalkInRow[];
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], mapping: {}, unmapped: [], rows: [] };
  }
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  const { mapping, unmapped } = recognizeColumns(headers);

  const at = (cols: string[], key: WalkInColumnKey): string => {
    const idx = mapping[key];
    return idx == null ? "" : (cols[idx] ?? "").trim();
  };

  const rows: ParsedWalkInRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    // Skip fully blank rows.
    if (cols.every((c) => !c.trim())) continue;

    const issues: string[] = [];

    const name = at(cols, "name");
    const contact = at(cols, "contact");
    const email = at(cols, "email");
    const model = at(cols, "model");
    const issueText = at(cols, "issue");

    const rawType = at(cols, "type");
    const type = normalizeWalkInType(rawType);
    const unknownType = Boolean(rawType) && !["direct", "sales"].includes(rawType.trim().toLowerCase());

    const rawSource = at(cols, "source");
    const srcResult = normalizeWalkInSource(rawSource, knownSources);
    const unknownSource = Boolean(rawSource) && !srcResult.known;

    const rawStatus = at(cols, "finalStatus");
    const status = normalizeWalkInStatus(rawStatus);
    if (rawStatus && status === null) issues.push(`Unknown Final Status "${rawStatus}"`);

    const rawDate = at(cols, "date");
    const parsedDate = parseWalkInDate(rawDate);
    const invalidDate = Boolean(rawDate) && parsedDate === null;
    if (invalidDate) issues.push(`Invalid date "${rawDate}"`);

    const invalidContact = Boolean(contact) && !isValidContact(contact);
    if (invalidContact) issues.push(`Invalid contact "${contact}"`);

    if (!name && !contact && !model) issues.push("Missing name, contact and model");
    if (unknownType) issues.push(`Unknown Type "${rawType}"`);
    if (unknownSource) issues.push(`Unknown Source "${rawSource}"`);

    const sourceId = at(cols, "id") || undefined;

    rows.push({
      raw: cols,
      sourceId,
      unknownSource,
      unknownType,
      invalidDate,
      invalidContact,
      issues,
      data: {
        // Preserve the historical date from the file. Fall back to today ONLY
        // when the date cell is genuinely blank — never overwrite a real (even
        // if oddly-formatted, still-flagged) date with today's date.
        date: parsedDate ?? (rawDate ? "" : new Date().toISOString().slice(0, 10)),
        type,
        source: srcResult.value,
        customer: name || "Unknown",
        phone: contact,
        email,
        model,
        issue: issueText,
        status: status ?? "visitor",
      },
    });
  }

  return { headers, mapping, unmapped, rows };
}

/** A row is importable when it has no blocking issues. */
export function isRowValid(row: ParsedWalkInRow): boolean {
  return row.issues.length === 0;
}
