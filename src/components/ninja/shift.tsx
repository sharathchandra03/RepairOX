"use client";
/* Ninja shift = the shared Work Session (employee-keyed by staff.id, server-stamped
   timestamps, durations from the pure engine). Online presence is NOT used here.
   The live timer is display only. */
import { useEffect, useMemo, useState } from "react";
import { Coffee, Play, Power } from "lucide-react";
import { useWorkSession } from "@/lib/work-session-context";
import { STALE_MS, breakMs, elapsedMs, formatHm, netMs } from "@/lib/work-session";
import { Btn } from "./ui";

/** Heartbeat for an open shift (mirrors useWorkSessionAutoStart's cadence). */
export function useShiftHeartbeat() {
  const { openSession, touch } = useWorkSession();
  useEffect(() => {
    if (!openSession) return;
    const t = window.setInterval(() => void touch(), 60_000);
    return () => window.clearInterval(t);
  }, [openSession, touch]);
}

export function useShift() {
  const ws = useWorkSession();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!ws.openSession) return; const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, [ws.openSession]);
  const worked = useMemo(() => (ws.openSession ? netMs(elapsedMs(ws.openSession, now, STALE_MS), breakMs(ws.openSession)) : 0), [ws.openSession, now]);
  return { ...ws, worked, workedLabel: formatHm(worked) };
}

export function ShiftCard() {
  const { status, hydrated, startWork, startBreak, endBreak, endWork, workedLabel, openSession } = useShift();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } finally { setBusy(null); } };
  if (!hydrated) return <div className="h-[92px] animate-pulse rounded-3xl bg-slate-200/70" />;
  const on = !!openSession && status !== "logged_out";
  const brk = status === "on_break";
  return (
    <div className={`flex items-center gap-3 rounded-3xl p-4 ring-1 ${on ? (brk ? "bg-amber-50 ring-amber-200" : "bg-emerald-50 ring-emerald-200") : "bg-white ring-slate-200"}`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${on ? (brk ? "bg-amber-500 text-white" : "bg-emerald-600 text-white") : "bg-slate-100 text-slate-500"}`}>
        {brk ? <Coffee className="h-6 w-6" /> : on ? <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex h-3 w-3 rounded-full bg-white" /></span> : <Power className="h-6 w-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold">{!on ? "You're off duty" : brk ? "On a break" : "On duty"}</p>
        <p className="text-[12px] font-medium text-slate-500">{on ? `Worked ${workedLabel} today${status === "interrupted" ? " · reconnecting" : ""}` : "Start your shift to begin today's jobs."}</p>
      </div>
      {!on ? (
        <Btn className="!min-h-[44px] !px-4 text-[14px]" loading={busy === "start"} onClick={() => run("start", startWork)}><Play className="h-4 w-4" />Start</Btn>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => run("brk", brk ? endBreak : startBreak)} disabled={!!busy} aria-label={brk ? "End break" : "Take a break"}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-amber-600 ring-1 ring-amber-200 transition active:scale-90 disabled:opacity-50">
            {busy === "brk" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : brk ? <Play className="h-5 w-5" /> : <Coffee className="h-5 w-5" />}
          </button>
          <button onClick={() => { if (window.confirm("End your shift for today?")) void run("end", () => endWork()); }} disabled={!!busy} aria-label="End shift"
            className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-rose-600 ring-1 ring-rose-200 transition active:scale-90 disabled:opacity-50">
            {busy === "end" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Power className="h-5 w-5" />}
          </button>
        </div>
      )}
    </div>
  );
}
