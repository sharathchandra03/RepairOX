"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up Bell — a page-scoped notification bell for the Walk-In
   module. It is NOT the global notification system; it derives its list purely
   from the walk-in records that have a scheduled, incomplete follow-up whose
   due date/time has arrived. State (read/complete) is persisted ON the walk-in
   record (followUpReadAt / followUpStatus) via the store, so it survives
   reloads and stays in sync with the table — no parallel notification store.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Check, CheckCheck, ExternalLink, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { type WalkIn, followUpDueAt, isFollowUpDue } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function fmtDue(w: WalkIn): string {
  const due = followUpDueAt(w);
  if (!due) return "";
  const now = new Date();
  const sameDay = due.toDateString() === now.toDateString();
  const datePart = sameDay ? "Today" : due.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  const timePart = w.followUpTime ? due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";
  return timePart ? `${datePart} · ${timePart}` : datePart;
}

export function WalkInFollowUpBell({
  walkIns,
  displayId,
  onOpenWalkIn,
  onMarkRead,
  onMarkComplete,
}: {
  walkIns: WalkIn[];
  displayId: (w: WalkIn) => string;
  onOpenWalkIn: (w: WalkIn) => void;
  onMarkRead: (w: WalkIn) => void;
  onMarkComplete: (w: WalkIn) => void;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);

  // Re-evaluate "due" on a light interval (60s) and when the tab refocuses, so
  // the bell reflects a follow-up becoming due without a heavy polling loop.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Due follow-ups (date/time arrived, not completed), soonest first.
  const dueList = useMemo(() => {
    const asOf = new Date(now);
    return walkIns
      .filter((w) => isFollowUpDue(w, asOf))
      .sort((a, b) => (followUpDueAt(a)?.getTime() ?? 0) - (followUpDueAt(b)?.getTime() ?? 0));
  }, [walkIns, now]);

  // Unread = due and not yet marked read → drives the badge + animation.
  // The notification sound + durable topbar notification are fired centrally in
  // the Walk-In page's due-detection effect (so they work regardless of which
  // view is open), keeping this bell purely presentational.
  const unread = useMemo(() => dueList.filter((w) => !w.followUpReadAt), [dueList]);
  const unreadCount = unread.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Walk-In Follow-Ups"
        title="Walk-In Follow-Ups"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#4361EE] bg-[#4361EE] text-white shadow-sm ring-1 ring-inset ring-[#4361EE]/40 transition hover:bg-[#3550d8] hover:text-white hover:ring-[#4361EE]/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/60",
          open && "bg-[#3550d8] text-white ring-[#4361EE]/60",
        )}
      >
        <motion.span
          animate={unreadCount > 0 ? { rotate: [0, -12, 12, -8, 8, 0] } : { rotate: 0 }}
          transition={unreadCount > 0 ? { duration: 1.1, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" } : { duration: 0.2 }}
          style={{ transformOrigin: "50% 15%" }}
        >
          <Bell className="h-[18px] w-[18px]" />
        </motion.span>
        {unreadCount > 0 && (
          /* Rose badge on the blue bell so the count is clearly visible (a blue
             badge would blend into the blue button). White ring lifts it off. */
          <span className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-label="Walk-In follow-up notifications"
            className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
                  <Bell className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold leading-none">Follow-Ups</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{dueList.length} due</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {dueList.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Bell className="h-5 w-5" />
                  </span>
                  <p className="text-[13px] font-medium">You're all caught up</p>
                  <p className="text-[11px] text-muted-foreground">No walk-in follow-ups are due right now.</p>
                </div>
              ) : (
                dueList.map((w) => (
                  <div
                    key={w.id}
                    className={cn(
                      "flex gap-2.5 border-b border-border px-4 py-3 last:border-b-0",
                      !w.followUpReadAt && "bg-indigo-50/40",
                    )}
                  >
                    <Avatar name={w.customer} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {!w.followUpReadAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4361EE]" />}
                        <p className="truncate text-[13px] font-semibold">{w.customer || "Walk-in"}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {displayId(w)}{w.model ? ` · ${w.model}` : ""}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#4361EE]">
                        <Clock className="h-3 w-3" /> {fmtDue(w)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => { onOpenWalkIn(w); setOpen(false); }}
                          className="inline-flex items-center gap-1 rounded-md bg-[#EEF1FD] px-2 py-1 text-[11px] font-medium text-[#4361EE] transition hover:bg-indigo-100"
                        >
                          <ExternalLink className="h-3 w-3" /> Open
                        </button>
                        {!w.followUpReadAt && (
                          <button
                            onClick={() => onMarkRead(w)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
                          >
                            <Check className="h-3 w-3" /> Mark read
                          </button>
                        )}
                        <button
                          onClick={() => onMarkComplete(w)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 transition hover:text-emerald-700"
                        >
                          <CheckCheck className="h-3 w-3" /> Complete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
