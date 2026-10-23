/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Work Session time-calculation engine (PURE, tested)

   NO DB imports. NO React imports. Just pure functions over plain data, so the
   math is unit-testable in isolation and shared verbatim by:
     • the "My Productivity" page (self-service),
     • the owner "Sales Agent Productivity" report,
     • the HR/payroll export row-builder.

   There is exactly ONE place that computes durations and interrupted-ness (this
   module), so the exported counts/totals are provably identical to the
   on-screen values (export == on-screen by construction).

   Core formulas (design §3):
     elapsed = end − start, where
         isInterrupted = status === 'interrupted'
                         || (endedAt === null && (now − lastSeenAt) > STALE_MS)
         end           = endedAt ?? (isInterrupted ? lastSeenAt : now)
     break   = Σ (endedAt − startedAt) over CLOSED break intervals only
     net     = max(0, elapsed − break)

   A closed session computes to endedAt (confirmed); a healthy open session
   computes to now (provisional); an open-but-stale (interrupted) session
   computes to lastSeenAt — never to now, never to a fabricated end.
   ────────────────────────────────────────────────────────────────────────── */

/** Staleness threshold for interrupted detection — a tunable CODE constant,
 *  not an admin setting in this phase. Chosen > the presence tracker's
 *  IDLE_MS (5 min) so a normal idle period never flips a session to
 *  "interrupted". Passed into the pure functions so detection stays testable
 *  without any wall-clock dependency. */
export const STALE_MS = 30 * 60 * 1000; // 30 minutes

/** Maximum span a SINGLE open session may ever accrue (a tunable CODE constant,
 *  not an admin setting this phase). This is the safety cap that stops an
 *  ABANDONED session — the browser left open/running, a crash, a machine that
 *  never slept — from silently counting toward `now` day after day (the
 *  "24h 0m every day" runaway). A real human workday never exceeds this, so any
 *  open session older than MAX_OPEN_SESSION_MS is, by definition, no longer a
 *  trustworthy live session: it is treated as interrupted and its elapsed is
 *  capped at start + MAX_OPEN_SESSION_MS (estimated), never `now`, never a
 *  fabricated end. Chosen generously (16h) so a long-but-real shift is still
 *  honoured in full; only clearly-abandoned sessions are capped. */
export const MAX_OPEN_SESSION_MS = 16 * 60 * 60 * 1000; // 16 hours

export type WorkSessionStatus = "open" | "completed" | "interrupted";
export type Confidence = "confirmed" | "provisional" | "estimated";
export type CellTone = "green" | "amber" | "gray" | "blue";

export interface BreakInterval {
  startedAt: string; // ISO
  endedAt: string | null; // ISO | null (open break)
}

export interface WorkSessionRecord {
  id: string;
  staffId: string;
  branchId: string | null;
  startedAt: string; // ISO
  endedAt: string | null; // ISO | null (open session)
  status: WorkSessionStatus;
  breaks: BreakInterval[];
  lastSeenAt: string; // ISO — presence heartbeat; NEVER a persisted duration
}

export interface SessionDurations {
  elapsedMs: number;
  breakMs: number;
  netMs: number;
  isOpen: boolean;
  isInterrupted: boolean;
  confidence: Confidence;
}

export interface DaySplitPart {
  date: string; // local YYYY-MM-DD (in the org tz)
  elapsedMs: number;
  breakMs: number;
  netMs: number;
}

export interface DayAggregate {
  date: string; // local YYYY-MM-DD
  elapsedMs: number;
  breakMs: number;
  netMs: number;
  sessionCount: number;
  completedCount: number;
  interruptedCount: number;
}

export interface SummaryTotals {
  totalElapsedMs: number;
  totalBreakMs: number;
  totalNetMs: number;
  sessionCount: number;
  completedCount: number;
  interruptedCount: number;
  workdays: number;
}

export interface CalendarCell {
  date: string; // local YYYY-MM-DD
  netMs: number;
  hasRecord: boolean;
  hasInterrupted: boolean;
  isToday: boolean;
  isOpen: boolean;
  tone: CellTone;
}

export interface WeekBucket {
  weekStart: string; // local YYYY-MM-DD of the week's Monday
  days: DayAggregate[];
  totals: SummaryTotals;
}

export interface MonthBucket {
  month: string; // YYYY-MM (local)
  days: DayAggregate[];
  totals: SummaryTotals;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

/** Is this session interrupted? Explicit status OR open-and-stale OR
 *  open-and-over-cap. Pure: every decision is derived from data (now,
 *  lastSeenAt, start, staleMs), never from a wall-clock call inside. An open
 *  session is "no longer live" when EITHER the heartbeat went stale (left) OR
 *  it has been running past the single-session cap (abandoned/never closed). */
export function isSessionInterrupted(session: WorkSessionRecord, nowMs: number, staleMs: number): boolean {
  if (session.status === "interrupted") return true;
  if (session.endedAt === null) {
    const stale = nowMs - toMs(session.lastSeenAt) > staleMs;
    const overCap = nowMs - toMs(session.startedAt) > MAX_OPEN_SESSION_MS;
    return stale || overCap;
  }
  return false;
}

/** The single authoritative END instant used for an OPEN session's duration.
 *  Takes the EARLIEST trustworthy cutoff so an abandoned session can never
 *  inflate the day:
 *    • lastSeenAt   — the true last-active moment (heartbeat / leave stamp),
 *    • start + cap  — the hard safety ceiling for a single session.
 *  A healthy, recently-seen session simply computes to `now`. The result is
 *  always clamped to [start, now] and is an ESTIMATE (never a fabricated end). */
function openSessionEndMs(session: WorkSessionRecord, nowMs: number, staleMs: number): number {
  const start = toMs(session.startedAt);
  if (session.endedAt !== null) return toMs(session.endedAt);
  const capEnd = start + MAX_OPEN_SESSION_MS;
  if (isSessionInterrupted(session, nowMs, staleMs)) {
    // Estimated: never `now`. Cap at the earlier of lastSeenAt / hard ceiling.
    return Math.min(toMs(session.lastSeenAt), capEnd, nowMs);
  }
  // Healthy & live → now, but never beyond the hard ceiling.
  return Math.min(nowMs, capEnd);
}

/** Elapsed duration with the CONDITIONAL end cutoff (design §3.2). */
export function elapsedMs(session: WorkSessionRecord, nowMs: number, staleMs: number): number {
  const start = toMs(session.startedAt);
  const end = openSessionEndMs(session, nowMs, staleMs);
  return Math.max(0, end - start);
}

/** Total break = sum of CLOSED break intervals. An open break contributes 0. */
export function breakMs(session: WorkSessionRecord): number {
  let total = 0;
  for (const b of session.breaks) {
    if (b.endedAt !== null) {
      total += Math.max(0, toMs(b.endedAt) - toMs(b.startedAt));
    }
  }
  return total;
}

/** Live-display only: break total INCLUDING the currently-open break
 *  (now − openBreak.start). NEVER persisted — presentation only. */
export function provisionalBreakMs(session: WorkSessionRecord, nowMs: number): number {
  let total = breakMs(session);
  for (const b of session.breaks) {
    if (b.endedAt === null) {
      total += Math.max(0, nowMs - toMs(b.startedAt));
    }
  }
  return total;
}

export function netMs(elapsed: number, brk: number): number {
  return Math.max(0, elapsed - brk);
}

export function sessionConfidence(session: WorkSessionRecord, nowMs: number, staleMs: number): Confidence {
  if (session.status === "completed" && session.endedAt !== null) return "confirmed";
  if (isSessionInterrupted(session, nowMs, staleMs)) return "estimated";
  return "provisional";
}

/** The full duration breakdown for one session. */
export function sessionDurations(session: WorkSessionRecord, nowMs: number, staleMs: number): SessionDurations {
  const interrupted = isSessionInterrupted(session, nowMs, staleMs);
  const elapsed = elapsedMs(session, nowMs, staleMs);
  const brk = breakMs(session);
  return {
    elapsedMs: elapsed,
    breakMs: brk,
    netMs: netMs(elapsed, brk),
    isOpen: session.endedAt === null,
    isInterrupted: interrupted,
    confidence: sessionConfidence(session, nowMs, staleMs),
  };
}

/* ── Timezone-aware local-date helpers (no external tz library) ───────────── */

/** The local YYYY-MM-DD of an instant, computed in the given IANA tz. */
export function localDateKey(ms: number, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD.
  return fmt.format(new Date(ms));
}

/** The UTC instant (ms) of local midnight that STARTS the local day
 *  containing `ms`, computed in the given tz. */
function localMidnightStart(ms: number, tz: string): number {
  const key = localDateKey(ms, tz);
  return localDateStartMs(key, tz);
}

/** The UTC instant (ms) of local midnight that starts a given local date key
 *  (YYYY-MM-DD) in the given tz. */
export function localDateStartMs(dateKey: string, tz: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Find the UTC instant whose local (tz) wall-clock is y-m-d 00:00:00.
  // Guess UTC midnight, then correct by the tz offset at that instant.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMs(guess, tz);
  let candidate = guess - offset;
  // Re-check once (handles DST transitions near midnight).
  const offset2 = tzOffsetMs(candidate, tz);
  if (offset2 !== offset) candidate = guess - offset2;
  return candidate;
}

/** The tz offset (ms east of UTC) at a given instant: localWallClock − UTC. */
function tzOffsetMs(ms: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(ms));
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // Note: hour "24" can appear in some engines at midnight; normalise to 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUtc - ms;
}

/* ── Multi-session aggregation + midnight split ───────────────────────────── */

/** Split a session's elapsed/break/net across the LOCAL calendar dates it
 *  touches (midnight boundaries in the org tz). It apportions the already-
 *  recorded span (up to the interrupted/healthy end cutoff); it NEVER invents
 *  login/logout events. Breaks are apportioned to the local date they fall in. */
export function splitAcrossLocalDates(
  session: WorkSessionRecord,
  tz: string,
  nowMs: number,
  staleMs: number,
): DaySplitPart[] {
  const start = toMs(session.startedAt);
  const end = openSessionEndMs(session, nowMs, staleMs);
  const spanEnd = Math.max(start, end);

  // Build the ordered list of local-day boundaries within [start, spanEnd].
  const parts: DaySplitPart[] = [];
  let cursor = start;
  while (cursor < spanEnd) {
    const dateKey = localDateKey(cursor, tz);
    const dayStart = localMidnightStart(cursor, tz);
    const nextMidnight = localDateStartMs(localDateKey(dayStart + MS_PER_DAY + MS_PER_DAY / 2, tz), tz);
    const segmentEnd = Math.min(spanEnd, nextMidnight);
    const elapsed = Math.max(0, segmentEnd - cursor);

    // Breaks that overlap this [cursor, segmentEnd) window (closed breaks only).
    let brk = 0;
    for (const b of session.breaks) {
      if (b.endedAt === null) continue;
      const bStart = toMs(b.startedAt);
      const bEnd = toMs(b.endedAt);
      const lo = Math.max(bStart, cursor);
      const hi = Math.min(bEnd, segmentEnd);
      if (hi > lo) brk += hi - lo;
    }

    parts.push({
      date: dateKey,
      elapsedMs: elapsed,
      breakMs: brk,
      netMs: Math.max(0, elapsed - brk),
    });
    cursor = segmentEnd;
  }

  // A zero-length session (start === end) still yields one 0-duration part so
  // callers see the date it belongs to.
  if (parts.length === 0) {
    const dateKey = localDateKey(start, tz);
    parts.push({ date: dateKey, elapsedMs: 0, breakMs: 0, netMs: 0 });
  }
  return parts;
}

/** Aggregate all sessions attributed to one LOCAL calendar date. De-dupes by
 *  session id defensively (sessions don't overlap by construction). */
export function aggregateDay(
  sessions: WorkSessionRecord[],
  dateKey: string,
  tz: string,
  nowMs: number,
  staleMs: number,
): DayAggregate {
  const seen = new Set<string>();
  let elapsed = 0;
  let brk = 0;
  let net = 0;
  let sessionCount = 0;
  let completedCount = 0;
  let interruptedCount = 0;

  for (const s of sessions) {
    if (seen.has(s.id)) continue;
    const parts = splitAcrossLocalDates(s, tz, nowMs, staleMs);
    const part = parts.find((p) => p.date === dateKey);
    if (!part) continue;
    seen.add(s.id);
    elapsed += part.elapsedMs;
    brk += part.breakMs;
    net += part.netMs;
    sessionCount += 1;
    if (s.status === "completed") completedCount += 1;
    if (isSessionInterrupted(s, nowMs, staleMs)) interruptedCount += 1;
  }

  return {
    date: dateKey,
    elapsedMs: elapsed,
    breakMs: brk,
    netMs: net,
    sessionCount,
    completedCount,
    interruptedCount,
  };
}

/** Overall totals across a set of sessions (whole sessions, not split). */
export function summarize(sessions: WorkSessionRecord[], nowMs: number, staleMs: number, tz: string): SummaryTotals {
  let totalElapsedMs = 0;
  let totalBreakMs = 0;
  let totalNetMs = 0;
  let completedCount = 0;
  let interruptedCount = 0;
  const workdaySet = new Set<string>();
  const seen = new Set<string>();

  for (const s of sessions) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const d = sessionDurations(s, nowMs, staleMs);
    totalElapsedMs += d.elapsedMs;
    totalBreakMs += d.breakMs;
    totalNetMs += d.netMs;
    if (s.status === "completed") completedCount += 1;
    if (d.isInterrupted) interruptedCount += 1;
    // Attribute workdays by every local date the session touches.
    for (const part of splitAcrossLocalDates(s, tz, nowMs, staleMs)) {
      if (part.elapsedMs > 0 || part.netMs > 0) workdaySet.add(part.date);
      else workdaySet.add(part.date); // a session on a date still counts as a workday
    }
  }

  return {
    totalElapsedMs,
    totalBreakMs,
    totalNetMs,
    sessionCount: seen.size,
    completedCount,
    interruptedCount,
    workdays: workdaySet.size,
  };
}

/** Distinct local dates (ascending) in a half-open [fromMs, toMs) range. */
function datesInRange(fromMs: number, toMs: number, tz: string): string[] {
  const out: string[] = [];
  let cursor = localMidnightStart(fromMs, tz);
  const guard = 400; // safety cap (> a year)
  let n = 0;
  while (cursor < toMs && n < guard) {
    out.push(localDateKey(cursor, tz));
    const next = localDateStartMs(localDateKey(cursor + MS_PER_DAY + MS_PER_DAY / 2, tz), tz);
    cursor = next;
    n += 1;
  }
  return out;
}

/** Per-day calendar cells for a month range, each with a neutral activity
 *  tone + the net number. Tone is NEVER an absence/leave judgment. */
export function calendarCells(
  sessions: WorkSessionRecord[],
  rangeFromMs: number,
  rangeToMs: number,
  tz: string,
  nowMs: number,
  staleMs: number,
): CalendarCell[] {
  const todayKey = localDateKey(nowMs, tz);
  const dates = datesInRange(rangeFromMs, rangeToMs, tz);
  return dates.map((dateKey) => {
    const agg = aggregateDay(sessions, dateKey, tz, nowMs, staleMs);
    const isToday = dateKey === todayKey;
    const hasRecord = agg.sessionCount > 0;
    const hasInterrupted = agg.interruptedCount > 0;
    const isOpen = sessions.some(
      (s) =>
        s.endedAt === null &&
        !isSessionInterrupted(s, nowMs, staleMs) &&
        splitAcrossLocalDates(s, tz, nowMs, staleMs).some((p) => p.date === dateKey),
    );
    let tone: CellTone;
    if (!hasRecord) tone = "gray";
    else if (isOpen && isToday) tone = "blue";
    else if (hasInterrupted) tone = "amber";
    else tone = "green";
    return { date: dateKey, netMs: agg.netMs, hasRecord, hasInterrupted, isToday, isOpen, tone };
  });
}

/** Monday-based week start (local) for a date key. */
function weekStartKey(dateKey: string, tz: string): string {
  const startMs = localDateStartMs(dateKey, tz);
  // JS getUTCDay on the LOCAL wall-clock date: reconstruct from the key.
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7; // days since Monday
  const mondayMs = startMs - mondayOffset * MS_PER_DAY;
  return localDateKey(mondayMs + MS_PER_DAY / 2, tz);
}

/** Group sessions into per-day aggregates for each distinct local date present. */
export function dailyBuckets(
  sessions: WorkSessionRecord[],
  tz: string,
  nowMs: number,
  staleMs: number,
): DayAggregate[] {
  const dateSet = new Set<string>();
  for (const s of sessions) {
    for (const part of splitAcrossLocalDates(s, tz, nowMs, staleMs)) dateSet.add(part.date);
  }
  return Array.from(dateSet)
    .sort()
    .map((dateKey) => aggregateDay(sessions, dateKey, tz, nowMs, staleMs));
}

function totalsFromDays(days: DayAggregate[]): SummaryTotals {
  let totalElapsedMs = 0;
  let totalBreakMs = 0;
  let totalNetMs = 0;
  let sessionCount = 0;
  let completedCount = 0;
  let interruptedCount = 0;
  for (const d of days) {
    totalElapsedMs += d.elapsedMs;
    totalBreakMs += d.breakMs;
    totalNetMs += d.netMs;
    sessionCount += d.sessionCount;
    completedCount += d.completedCount;
    interruptedCount += d.interruptedCount;
  }
  return {
    totalElapsedMs,
    totalBreakMs,
    totalNetMs,
    sessionCount,
    completedCount,
    interruptedCount,
    workdays: days.filter((d) => d.sessionCount > 0).length,
  };
}

export function weeklyBuckets(
  sessions: WorkSessionRecord[],
  tz: string,
  nowMs: number,
  staleMs: number,
): WeekBucket[] {
  const days = dailyBuckets(sessions, tz, nowMs, staleMs);
  const byWeek = new Map<string, DayAggregate[]>();
  for (const d of days) {
    const wk = weekStartKey(d.date, tz);
    const arr = byWeek.get(wk) ?? [];
    arr.push(d);
    byWeek.set(wk, arr);
  }
  return Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, wkDays]) => ({
      weekStart,
      days: wkDays.sort((a, b) => a.date.localeCompare(b.date)),
      totals: totalsFromDays(wkDays),
    }));
}

export function monthlyBuckets(
  sessions: WorkSessionRecord[],
  tz: string,
  nowMs: number,
  staleMs: number,
): MonthBucket[] {
  const days = dailyBuckets(sessions, tz, nowMs, staleMs);
  const byMonth = new Map<string, DayAggregate[]>();
  for (const d of days) {
    const month = d.date.slice(0, 7); // YYYY-MM
    const arr = byMonth.get(month) ?? [];
    arr.push(d);
    byMonth.set(month, arr);
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, mDays]) => ({
      month,
      days: mDays.sort((a, b) => a.date.localeCompare(b.date)),
      totals: totalsFromDays(mDays),
    }));
}

/* ── Formatting helpers (presentation; used by the pages + export) ────────── */

/** "Hh Mm" HR-friendly display of a duration. */
export function formatHm(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

/** Decimal hours (2 dp) for a numeric payroll column. */
export function toDecimalHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}
