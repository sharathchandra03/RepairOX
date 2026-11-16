"use client";
/* "Assigned at | Time left to accept" ticket shown on every unaccepted
   assignment. Display-only countdown from the server-stamped assigned_at;
   it never writes anything and never auto-rejects. */
import { memo, useEffect, useState } from "react";
import { Clock, Timer } from "lucide-react";
import { useStoreSettings } from "@/lib/store-settings";
import { ACCEPT_WINDOW_MIN, acceptDeadlineMs, acceptRemainingMs, assignedAtMs, assignedStamp, clockLabel } from "@/lib/ninja/model";

type T = { assigned_at: string | null; accept_deadline_at?: string | null; updated_at?: string; created_at?: string };

/** One shared 1s clock; only mounted countdowns re-render. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    const vis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return now;
}

function tone(left: number, win: number) {
  const crit = Math.min(3, win * 0.2) * 60_000;
  // Countdown is always red: this is an urgent "respond now" clock.
  if (left < 0) return { digits: "text-[#B42318]", bar: "bg-[#B42318]", track: "bg-[#FBEDF0]", wrap: "bg-[#FEF3F2] ring-[#F5B5AE]", label: "Overdue by" };
  if (left < crit) return { digits: "text-[#D92D20]", bar: "bg-[#D92D20]", track: "bg-[#FBEDF0]", wrap: "bg-[#FEF3F2] ring-[#F5B5AE]", label: "Time left to accept" };
  return { digits: "text-[#E5484D]", bar: "bg-[#E5484D]", track: "bg-[#FBEDF0]", wrap: "bg-[#F3F6FF] ring-[#4361EE]/20", label: "Time left to accept" };
}

function AcceptTicketBase({ t, compact }: { t: T; compact?: boolean }) {
  const now = useNow();
  const { settings } = useStoreSettings();
  const win = settings.fieldAcceptWindowMinutes ?? ACCEPT_WINDOW_MIN;
  const left = acceptRemainingMs(t, now, win);
  const k = tone(left, win);
  const total = Math.max(60_000, acceptDeadlineMs(t, win) - assignedAtMs(t));
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const at = assignedAtMs(t);
  return (
    <div role="timer" aria-label={`${k.label} ${clockLabel(left)}`}
      className={`relative overflow-hidden rounded-2xl ring-1 ${k.wrap}`}>
      {/* ticket notches */}
      <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-card ring-1 ring-[#4361EE]/20" />
      <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-card ring-1 ring-[#4361EE]/20" />
      <div className={`grid grid-cols-[1fr_auto_1fr] items-center ${compact ? "px-4 py-2.5" : "px-5 py-4"}`}>
        <div className="min-w-0 text-center">
          <p className="flex items-center justify-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground"><Clock className="h-3 w-3" />Assigned</p>
          <p className={`mt-1 font-extrabold leading-tight text-[#4361EE] ${compact ? "text-[13px]" : "text-[16px]"}`}>{assignedStamp(at)}</p>
        </div>
        <span className={`w-px self-stretch border-l border-dashed border-[#4361EE]/30 ${compact ? "mx-2" : "mx-3"}`} />
        <div className="min-w-0 text-center">
          <p className="flex items-center justify-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground"><Timer className="h-3 w-3" />{k.label}</p>
          <p className={`mt-0.5 font-display font-extrabold tabular-nums leading-none ${k.digits} ${compact ? "text-[24px]" : "text-[34px]"}`}>{clockLabel(left)}</p>
        </div>
      </div>
      <div className={`h-1 w-full ${k.track}`}><div className={`h-full ${k.bar} transition-[width] duration-1000 ease-linear`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
export const AcceptTicket = memo(AcceptTicketBase, (a, b) => a.t.assigned_at === b.t.assigned_at && a.t.accept_deadline_at === b.t.accept_deadline_at && a.compact === b.compact);
