"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up Bell — a page-scoped notification bell for the Walk-In
   module. It is NOT the global notification system; it derives its list purely
   from the walk-in records that have a scheduled, incomplete follow-up whose
   due date/time has arrived. State (read/complete) is persisted ON the walk-in
   record (followUpReadAt / followUpStatus) via the store, so it survives
   reloads and stays in sync with the table — no parallel notification store.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCheck, ExternalLink, Clock, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { type WalkIn, followUpDueAt } from "@/lib/mock-data";
import { useFollowUpClock, dueFollowUps } from "@/lib/walk-in-followup-engine";
import { cn } from "@/lib/utils";

/* ─── Dismissed due-events (Clear all) ──────────────────────────────────────
   "Clear all" empties the bell by DISMISSING each currently-due follow-up from
   the panel. Dismissal is keyed by (walk-in id + exact due instant) and
   persisted per browser, so a cleared item stays gone across reloads — but if
   the follow-up is later RESCHEDULED to a new time (new instant) it re-appears,
   and completing/rescheduling on the Walk-In page is unaffected. This ONLY hides
   the bell entry; it never changes the walk-in record. A tiny external store so
   every bell mount re-renders when the set changes. */
const DISMISSED_KEY = "repairox-walkin-followup-dismissed";
let dismissed: Set<string> | null = null;
const dismissListeners = new Set<() => void>();

function loadDismissed(): Set<string> {
  if (dismissed) return dismissed;
  if (typeof window === "undefined") { dismissed = new Set(); return dismissed; }
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    dismissed = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { dismissed = new Set(); }
  return dismissed;
}

function persistDismissed() {
  if (!dismissed || typeof window === "undefined") return;
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(dismissed).slice(-300))); } catch { /* quota */ }
}

/** Stable key for a specific due event — matches the watcher's dueKey shape. */
function dueEventKey(w: WalkIn): string {
  const due = followUpDueAt(w);
  return `${w.id}@${due ? due.getTime() : 0}`;
}

function dismissEvents(keys: string[]) {
  const set = loadDismissed();
  let changed = false;
  for (const k of keys) { if (!set.has(k)) { set.add(k); changed = true; } }
  if (changed) { persistDismissed(); dismissListeners.forEach((l) => l()); }
}

function subscribeDismissed(cb: () => void): () => void {
  dismissListeners.add(cb);
  return () => { dismissListeners.delete(cb); };
}
function getDismissedSnapshot(): number { return loadDismissed().size; }
/** Re-render hook: returns the dismissed-set size (changes when it mutates). */
function useDismissedVersion(): number {
  return useSyncExternalStore(subscribeDismissed, getDismissedSnapshot, () => 0);
}

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
  onMarkAllRead,
  onCompleteFollowUp,
}: {
  walkIns: WalkIn[];
  displayId: (w: WalkIn) => string;
  onOpenWalkIn: (w: WalkIn) => void;
  /** Clear the unread badge on ALL currently-due follow-ups at once (does NOT
   *  complete any follow-up — it only marks the notifications as seen). */
  onMarkAllRead: (walkIns: WalkIn[]) => void;
  /** Open the SAFE completion dialog (outcome + next action) — never a silent close. */
  onCompleteFollowUp: (w: WalkIn) => void;
}) {
  const [open, setOpen] = useState(false);
  // The SAME shared clock the global watcher/bell uses — driven by a precise
  // timer scheduled to each follow-up's exact due instant. This is what removes
  // the old 30–40s gap: both bells re-evaluate on the identical tick.
  const now = useFollowUpClock();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Re-render whenever the dismissed set changes (Clear all).
  const dismissedVersion = useDismissedVersion();

  // Due follow-ups (date/time arrived, ACTIVE only), soonest first — derived
  // with the shared engine helper so it matches the global watcher exactly.
  // Events the user has "Cleared" are hidden until the follow-up is rescheduled
  // to a new time (which yields a new due-event key).
  const dueList = useMemo(() => {
    const set = loadDismissed();
    return dueFollowUps(walkIns, new Date(now)).filter((w) => !set.has(dueEventKey(w)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkIns, now, dismissedVersion]);

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
            className="absolute right-0 z-50 mt-2 w-[384px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
          >
            {/* Header — title on ONE line with the close button; the bulk
                actions sit on their own row below so nothing wraps or cramps. */}
            <div className="border-b border-border px-4 pt-3 pb-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
                    <Bell className="h-3.5 w-3.5" />
                  </span>
                  <p className="truncate text-[14px] font-semibold leading-none">Follow-Ups</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {dueList.length} due
                  </span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Bulk actions row:
                  • Mark all read — clears the unread dot on every due follow-up
                    (marks them seen; never completes or moves to History).
                  • Clear all — DISMISSES every shown follow-up from the bell so
                    the panel empties. It only hides the bell entries; the
                    follow-ups stay on the Walk-In page and re-appear if
                    rescheduled to a new time. */}
              {dueList.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => onMarkAllRead(unread)}
                      title="Mark all follow-up notifications as read"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF1FD] px-2.5 py-1.5 text-[12px] font-medium text-[#4361EE] transition hover:bg-indigo-100"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => dismissEvents(dueList.map(dueEventKey))}
                    title="Clear all follow-up notifications from the bell"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground ring-1 ring-inset ring-border transition hover:bg-muted hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear all
                  </button>
                </div>
              )}
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
                        {/* "Mark read" removed as a Walk-In follow-up action —
                            reading a notification is not a follow-up outcome. The
                            completion workflow below is the only action. */}
                        <button
                          onClick={() => { onCompleteFollowUp(w); setOpen(false); }}
                          title="Record the outcome of this follow-up attempt"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 transition hover:text-emerald-700"
                        >
                          <CheckCheck className="h-3 w-3" /> Complete Follow-Up
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
