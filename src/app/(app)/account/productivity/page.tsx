"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — My Productivity (self-service work-session page).

   Gated by CAP.workSession.viewOwn; the data is ALWAYS self-scoped (RLS + the
   self-service /api/work-session/* routes). Built from the shared view-page
   primitives (DetailHero + DetailSection + SummaryCard + SegmentedTabs +
   Reveal). All durations come from the ONE pure engine (work-session.ts) over
   the persisted timestamps; the live timer is DISPLAY-ONLY and never feeds any
   persisted number. Calendar colours are NEUTRAL activity indicators, never an
   absence/leave judgment.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Coffee, Timer, CalendarDays, ListChecks, BarChart3, Hourglass } from "lucide-react";
import { DetailHero, DetailSection, SummaryCard } from "@/components/common/detail-page";
import { Reveal } from "@/components/common/reveal";
import { SegmentedTabs } from "@/components/ui/tabs";
import { DateTimeField } from "@/components/ui/date-time-picker";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useStoreSettings } from "@/lib/store-settings";
import { allow, CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { useWorkSession, type WorkStatus } from "@/lib/work-session-context";
import {
  STALE_MS,
  type WorkSessionRecord,
  summarize,
  sessionDurations,
  calendarCells,
  dailyBuckets,
  weeklyBuckets,
  monthlyBuckets,
  aggregateDay,
  localDateKey,
  localDateStartMs,
  formatHm,
  type CellTone,
} from "@/lib/work-session";

type RangeMode = "daily" | "weekly" | "monthly" | "custom";

const WORK_STATUS_META: Record<WorkStatus, { label: string; dot: string; text: string }> = {
  working: { label: "Working", dot: "bg-emerald-500", text: "text-emerald-700" },
  on_break: { label: "On Break", dot: "bg-amber-500", text: "text-amber-700" },
  interrupted: { label: "Needs Review", dot: "bg-rose-500", text: "text-rose-700" },
  logged_out: { label: "Not Working", dot: "bg-zinc-400", text: "text-zinc-600" },
};

const TONE_CLASS: Record<CellTone, string> = {
  green: "bg-emerald-50 border-emerald-200 text-emerald-800",
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  gray: "bg-card border-border text-muted-foreground",
  blue: "bg-[#EEF1FD] border-[#4361EE]/30 text-[#4361EE]",
};

const MS_DAY = 24 * 60 * 60 * 1000;

/** Compute the ISO [from, to] range for the active mode, around an anchor. */
function rangeFor(mode: RangeMode, anchorMs: number, tz: string, customFrom: string, customTo: string): { fromISO: string; toISO: string } {
  if (mode === "custom") {
    return {
      fromISO: customFrom || new Date(anchorMs - 30 * MS_DAY).toISOString(),
      toISO: customTo || new Date(anchorMs + MS_DAY).toISOString(),
    };
  }
  const todayKey = localDateKey(anchorMs, tz);
  if (mode === "daily") {
    const from = localDateStartMs(todayKey, tz);
    return { fromISO: new Date(from).toISOString(), toISO: new Date(from + MS_DAY).toISOString() };
  }
  if (mode === "weekly") {
    // Monday-start week containing the anchor.
    const [y, m, d] = todayKey.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const mondayOffset = (dow + 6) % 7;
    const start = localDateStartMs(todayKey, tz) - mondayOffset * MS_DAY;
    return { fromISO: new Date(start).toISOString(), toISO: new Date(start + 7 * MS_DAY).toISOString() };
  }
  // monthly
  const monthStartKey = `${todayKey.slice(0, 7)}-01`;
  const start = localDateStartMs(monthStartKey, tz);
  return { fromISO: new Date(start - 2 * MS_DAY).toISOString(), toISO: new Date(start + 32 * MS_DAY).toISOString() };
}

export default function MyProductivityPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const { name } = useSession();

  // Prefer real browser history so the user returns exactly where they were;
  // fall back to My Account when the page was opened directly.
  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/account");
    }
  }, [router]);
  const { settings } = useStoreSettings();
  const tz = settings.timeZone || "Asia/Kolkata";
  const { status, openSession, rangeSessions } = useWorkSession();

  const canView = allow(can, CAP.workSession.viewOwn);

  const [mode, setMode] = useState<RangeMode>("daily");
  const [anchorMs, setAnchorMs] = useState<number>(() => Date.now());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sessions, setSessions] = useState<WorkSessionRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Live clock for the display-only timer + read-time interrupted detection.
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { fromISO, toISO } = useMemo(
    () => rangeFor(mode, anchorMs, tz, customFrom, customTo),
    [mode, anchorMs, tz, customFrom, customTo],
  );

  // Load the range (plus a wider window for the calendar) from the self API.
  useEffect(() => {
    if (!canView) return;
    let active = true;
    // Widen the fetch to the whole surrounding month so the calendar always has
    // data regardless of the active tab.
    const monthFrom = new Date(localDateStartMs(`${localDateKey(anchorMs, tz).slice(0, 7)}-01`, tz) - 2 * MS_DAY).toISOString();
    const monthTo = new Date(localDateStartMs(`${localDateKey(anchorMs, tz).slice(0, 7)}-01`, tz) + 34 * MS_DAY).toISOString();
    const lo = fromISO < monthFrom ? fromISO : monthFrom;
    const hi = toISO > monthTo ? toISO : monthTo;
    void rangeSessions(lo, hi).then((rows) => {
      if (active) setSessions(rows);
    });
    return () => {
      active = false;
    };
  }, [canView, fromISO, toISO, anchorMs, tz, rangeSessions]);

  // Range-scoped sessions (overlap the active window).
  const inRange = useMemo(() => {
    const lo = new Date(fromISO).getTime();
    const hi = new Date(toISO).getTime();
    return sessions.filter((s) => {
      const start = new Date(s.startedAt).getTime();
      const end = s.endedAt ? new Date(s.endedAt).getTime() : nowMs;
      return end >= lo && start <= hi;
    });
  }, [sessions, fromISO, toISO, nowMs]);

  // Today's totals (always for the current local day).
  const todayKey = localDateKey(nowMs, tz);
  const todayAgg = useMemo(
    () => aggregateDay(sessions, todayKey, tz, nowMs, STALE_MS),
    [sessions, todayKey, tz, nowMs],
  );

  // Range summary.
  const summary = useMemo(() => summarize(inRange, nowMs, STALE_MS, tz), [inRange, nowMs, tz]);

  // Calendar cells for the anchor month.
  const calCells = useMemo(() => {
    const monthStartKey = `${localDateKey(anchorMs, tz).slice(0, 7)}-01`;
    const start = localDateStartMs(monthStartKey, tz);
    const nextMonth = localDateStartMs(`${localDateKey(start + 32 * MS_DAY, tz).slice(0, 7)}-01`, tz);
    return calendarCells(sessions, start, nextMonth, tz, nowMs, STALE_MS);
  }, [sessions, anchorMs, tz, nowMs]);

  const dayDetail = useMemo(() => {
    const key = selectedDate ?? todayKey;
    const daySessions = sessions.filter((s) =>
      aggregateDay([s], key, tz, nowMs, STALE_MS).sessionCount > 0,
    );
    return { key, daySessions };
  }, [selectedDate, todayKey, sessions, tz, nowMs]);

  const weekly = useMemo(() => weeklyBuckets(inRange, tz, nowMs, STALE_MS), [inRange, tz, nowMs]);
  const monthly = useMemo(() => monthlyBuckets(inRange, tz, nowMs, STALE_MS), [inRange, tz, nowMs]);
  const daily = useMemo(() => dailyBuckets(inRange, tz, nowMs, STALE_MS), [inRange, tz, nowMs]);

  // Live timer (display only) for an open, healthy session.
  const liveMs = openSession && openSession.endedAt === null && status !== "interrupted"
    ? Math.max(0, nowMs - new Date(openSession.startedAt).getTime())
    : null;

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <button
          type="button"
          onClick={handleBack}
          className="group mb-6 inline-flex items-center gap-1.5 rounded-full bg-[#4361EE] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.5)] ring-1 ring-inset ring-white/10 transition-all duration-200 hover:bg-[#3A56D4] hover:shadow-[0_6px_16px_-4px_rgba(67,97,238,0.6)] active:scale-[0.97]"
          aria-label="Go back"
          title="Go back"
        >
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          Back
        </button>
        <h1 className="text-lg font-bold text-foreground">My Productivity</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to view productivity data.
        </p>
      </div>
    );
  }

  const workMeta = WORK_STATUS_META[status];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      {/* Hero */}
      <DetailHero>
        <button
          type="button"
          onClick={handleBack}
          className="group mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#4361EE] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.5)] ring-1 ring-inset ring-white/10 transition-all duration-200 hover:bg-[#3A56D4] hover:shadow-[0_6px_16px_-4px_rgba(67,97,238,0.6)] active:scale-[0.97]"
          aria-label="Go back"
          title="Go back"
        >
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          Back
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Account / My Productivity
            </p>
            <h1 className="mt-1 text-xl font-bold text-foreground">My Productivity</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Your work sessions, breaks and net productive time — {name}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/70 px-3 py-1.5 text-[12px] font-semibold">
              <span className={cn("h-1.5 w-1.5 rounded-full", workMeta.dot)} />
              <span className={workMeta.text}>{workMeta.label}</span>
            </span>
            {liveMs != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4361EE]/30 bg-[#EEF1FD] px-3 py-1.5 text-[12px] font-semibold text-[#4361EE] tabular-nums">
                <Timer className="h-3.5 w-3.5" /> {formatHm(liveMs)} <span className="font-normal">in progress</span>
              </span>
            )}
          </div>
        </div>

        {/* TODAY KPI cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Total Session (today)" value={formatHm(todayAgg.elapsedMs)} />
          <SummaryCard label="Total Break (today)" value={formatHm(todayAgg.breakMs)} />
          <SummaryCard label="Net Working (today)" value={formatHm(todayAgg.netMs)} tone="text-emerald-600" />
          <SummaryCard label="Sessions (today)" value={todayAgg.sessionCount} />
          <SummaryCard
            label="In Progress"
            value={liveMs != null ? formatHm(liveMs) : "—"}
            tone="text-[#4361EE]"
          />
        </div>
      </DetailHero>

      {/* Range control */}
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as RangeMode)}
            options={[
              { label: "Daily", value: "daily" },
              { label: "Weekly", value: "weekly" },
              { label: "Monthly", value: "monthly" },
              { label: "Custom", value: "custom" },
            ]}
          />
          {mode !== "custom" ? (
            <div className="flex items-center gap-2 text-[12px]">
              <button
                onClick={() => setAnchorMs((m) => m - (mode === "weekly" ? 7 : mode === "monthly" ? 30 : 1) * MS_DAY)}
                className="rounded-lg border border-border px-2.5 py-1 font-medium text-foreground transition hover:bg-muted"
              >
                ← Prev
              </button>
              <span className="min-w-[120px] text-center font-semibold text-foreground">
                {localDateKey(anchorMs, tz)}
              </span>
              <button
                onClick={() => setAnchorMs((m) => m + (mode === "weekly" ? 7 : mode === "monthly" ? 30 : 1) * MS_DAY)}
                className="rounded-lg border border-border px-2.5 py-1 font-medium text-foreground transition hover:bg-muted"
              >
                Next →
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <DateTimeField value={customFrom} onChange={setCustomFrom} placeholder="From" className="w-[200px]" />
              <DateTimeField value={customTo} onChange={setCustomTo} placeholder="To" className="w-[200px]" />
            </div>
          )}
        </div>
      </Reveal>

      {/* Range summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total Session" value={formatHm(summary.totalElapsedMs)} />
        <SummaryCard label="Total Break" value={formatHm(summary.totalBreakMs)} />
        <SummaryCard label="Net Working" value={formatHm(summary.totalNetMs)} tone="text-emerald-600" />
        <SummaryCard label="Workdays" value={summary.workdays} />
        <SummaryCard label="Sessions" value={summary.sessionCount} />
        <SummaryCard label="Needs Review" value={summary.interruptedCount} tone={summary.interruptedCount ? "text-rose-600" : undefined} />
      </div>

      {/* Calendar */}
      <DetailSection icon={CalendarDays} title="Activity Calendar" accent="violet">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <Legend tone="green" label="Recorded" />
          <Legend tone="amber" label="Needs review" />
          <Legend tone="blue" label="In progress" />
          <Legend tone="gray" label="No record" />
          <span className="italic">Colours are activity indicators only — not absence / leave.</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {calCells.map((cell) => (
            <button
              key={cell.date}
              onClick={() => setSelectedDate(cell.date)}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border px-1 py-2 text-[11px] transition hover:ring-2 hover:ring-[#4361EE]/20",
                TONE_CLASS[cell.tone],
                selectedDate === cell.date && "ring-2 ring-[#4361EE]/50",
                cell.isToday && "font-bold",
              )}
              title={`${cell.date}: ${cell.hasRecord ? formatHm(cell.netMs) + " net" : "No record"}`}
            >
              <span>{cell.date.slice(8)}</span>
              <span className="mt-0.5 tabular-nums">{cell.hasRecord ? formatHm(cell.netMs) : "—"}</span>
            </button>
          ))}
        </div>
      </DetailSection>

      {/* Daily detail timeline */}
      <DetailSection icon={ListChecks} title={`Daily Detail — ${dayDetail.key}`} accent="blue">
        {dayDetail.daySessions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">No work sessions on this day.</p>
        ) : (
          <div className="space-y-3">
            {dayDetail.daySessions.map((s) => {
              const d = sessionDurations(s, nowMs, STALE_MS);
              return (
                <div key={s.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                      <Clock className="h-4 w-4 text-[#4361EE]" />
                      {new Date(s.startedAt).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: tz })}
                      {" — "}
                      {s.endedAt
                        ? new Date(s.endedAt).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: tz })
                        : d.isInterrupted
                          ? "(interrupted)"
                          : "(in progress)"}
                    </div>
                    <ConfidenceBadge confidence={d.confidence} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
                    <Stat icon={Hourglass} label="Session" value={formatHm(d.elapsedMs)} />
                    <Stat icon={Coffee} label="Break" value={formatHm(d.breakMs)} />
                    <Stat icon={BarChart3} label="Net" value={formatHm(d.netMs)} tone="text-emerald-600" />
                  </div>
                  {s.breaks.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Breaks
                      </p>
                      <div className="space-y-1">
                        {s.breaks.map((b, i) => (
                          <p key={i} className="text-[12px] text-muted-foreground tabular-nums">
                            {new Date(b.startedAt).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: tz })}
                            {" → "}
                            {b.endedAt
                              ? new Date(b.endedAt).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: tz })
                              : "ongoing"}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DetailSection>

      {/* Weekly / Monthly summaries */}
      {mode === "weekly" && (
        <DetailSection icon={CalendarDays} title="Weekly Summary" accent="emerald">
          <BucketTable rows={daily.map((d) => ({ label: d.date, elapsed: d.elapsedMs, brk: d.breakMs, net: d.netMs, sessions: d.sessionCount, interrupted: d.interruptedCount }))} />
          {weekly.map((w) => (
            <p key={w.weekStart} className="mt-3 text-[12px] text-muted-foreground">
              Week of {w.weekStart}: <span className="font-semibold text-emerald-600">{formatHm(w.totals.totalNetMs)}</span> net ·
              {" "}{w.totals.sessionCount} sessions · {w.totals.interruptedCount} needs review
            </p>
          ))}
        </DetailSection>
      )}
      {mode === "monthly" && (
        <DetailSection icon={CalendarDays} title="Monthly Summary" accent="emerald">
          <BucketTable rows={daily.map((d) => ({ label: d.date, elapsed: d.elapsedMs, brk: d.breakMs, net: d.netMs, sessions: d.sessionCount, interrupted: d.interruptedCount }))} />
          {monthly.map((mo) => (
            <p key={mo.month} className="mt-3 text-[12px] text-muted-foreground">
              {mo.month}: <span className="font-semibold text-emerald-600">{formatHm(mo.totals.totalNetMs)}</span> net ·
              {" "}{mo.totals.workdays} workdays · {mo.totals.sessionCount} sessions · {mo.totals.interruptedCount} needs review
            </p>
          ))}
        </DetailSection>
      )}
    </div>
  );
}

function Legend({ tone, label }: { tone: CellTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-3 w-3 rounded border", TONE_CLASS[tone])} />
      {label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "confirmed" | "provisional" | "estimated" }) {
  const map = {
    confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    provisional: { label: "In progress", cls: "bg-[#EEF1FD] text-[#4361EE] border-[#4361EE]/30" },
    estimated: { label: "Estimated (needs review)", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  } as const;
  const m = map[confidence];
  return <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", m.cls)}>{m.label}</span>;
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className={cn("mt-0.5 text-[14px] font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function BucketTable({ rows }: { rows: { label: string; elapsed: number; brk: number; net: number; sessions: number; interrupted: number }[] }) {
  if (rows.length === 0) return <p className="py-4 text-center text-[13px] text-muted-foreground">No sessions in this range.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-[12px]">
        <thead className="bg-muted/60">
          <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2 text-right">Session</th>
            <th className="px-3 py-2 text-right">Break</th>
            <th className="px-3 py-2 text-right">Net</th>
            <th className="px-3 py-2 text-right">Sessions</th>
            <th className="px-3 py-2 text-right">Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-foreground">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatHm(r.elapsed)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatHm(r.brk)}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-600 tabular-nums">{formatHm(r.net)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.sessions}</td>
              <td className={cn("px-3 py-2 text-right tabular-nums", r.interrupted ? "text-rose-600 font-semibold" : "")}>{r.interrupted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
