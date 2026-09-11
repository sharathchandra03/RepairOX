"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up Cell — the interactive Follow-Up pill + popover.

   Renders the compact Follow-Up pill for a walk-in and, on click, a small
   state-aware popover to manage the multi-stage (max 3) follow-up lifecycle:

     • No Follow-Up      → Set Follow-Up · View History
     • Scheduled          → Reschedule · Mark Contacted · Complete Follow-Up · View History
     • Due Today/Overdue  → Mark Contacted · Complete Follow-Up · Reschedule · View History
     • Completing         → pick an outcome (+ optional comment) → the attempt is
                            pushed into followUpHistory; if the outcome continues
                            and attempts remain (<3) the user is offered "Schedule
                            Next Follow-Up"; after the 3rd attempt only a final
                            outcome (Converted / Lost / Not Interested) is offered.

   All state changes are emitted through a single `onUpdate(patch)` callback so
   the parent (which owns the store's updateWalkIn) persists them. No parallel
   store — history + active schedule live on the walk-in record.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarPlus, CalendarClock, PhoneCall, CheckCheck, History, ChevronDown, X, XCircle,
} from "lucide-react";
import {
  type WalkIn,
  type FollowUpOutcome,
  type FollowUpRecord,
  FOLLOWUP_OUTCOME_LABEL,
  FOLLOWUP_CONTINUE_OUTCOMES,
  FOLLOWUP_TERMINAL_OUTCOMES,
  MAX_FOLLOWUP_ATTEMPTS,
  followUpDueAt,
  isFollowUpTerminated,
} from "@/lib/mock-data";
import { followUpPill, followUpState, ordinal } from "@/lib/walk-in-data";
import { cn } from "@/lib/utils";

type Mode = "menu" | "schedule" | "reschedule" | "complete" | "schedule-next" | "history";

export function WalkInFollowUpCell({
  walkIn,
  currentUserId,
  currentUserName,
  onUpdate,
  onConvert,
  align = "left",
}: {
  walkIn: WalkIn;
  currentUserId?: string;
  currentUserName?: string;
  /** Persist a patch to this walk-in (parent calls store.updateWalkIn). */
  onUpdate: (patch: Partial<WalkIn>) => void;
  /** Route into the existing Convert-to-Ticket flow (terminal "Converted"). */
  onConvert?: (w: WalkIn) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const now = new Date();
  const pill = followUpPill(walkIn, now);
  const state = followUpState(walkIn, now);
  const terminated = isFollowUpTerminated(walkIn);
  const historyCount = walkIn.followUpHistory?.length ?? 0;
  const hasActive = !!walkIn.followUpDate && walkIn.followUpStatus !== "done" && !terminated;
  const attemptsUsed = historyCount + (hasActive ? 1 : 0);
  const attemptsRemaining = MAX_FOLLOWUP_ATTEMPTS - historyCount;

  /* Position the portal popover relative to the pill, flipping it ABOVE when a
     row near the bottom of the table/viewport wouldn't leave room below (this is
     what made the popover get clipped for lower rows). It's a fixed-position
     portal on document.body, so it's never clipped by the table's overflow —
     we just keep it inside the viewport and cap its height so content scrolls
     instead of overflowing off-screen. Reposition on open, mode change (height
     changes per view), and on scroll/resize while open. */
  useEffect(() => {
    if (!open) return;
    const GAP = 6;
    const MARGIN = 8;
    const WIDTH = 288;

    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Measured popover height (after render) — fall back to a sensible estimate.
      const popH = popRef.current?.offsetHeight || 320;

      const spaceBelow = vh - r.bottom - GAP - MARGIN;
      const spaceAbove = r.top - GAP - MARGIN;

      let top: number;
      let maxHeight: number;
      // Prefer below; flip above only when below can't fit AND above has more room.
      if (spaceBelow >= popH || spaceBelow >= spaceAbove) {
        top = r.bottom + GAP;
        maxHeight = Math.max(160, spaceBelow);
      } else {
        maxHeight = Math.max(160, spaceAbove);
        const h = Math.min(popH, maxHeight);
        top = r.top - GAP - h;
      }
      // Final clamp so it can never sit off the top/bottom edge.
      top = Math.max(MARGIN, Math.min(top, vh - MARGIN - Math.min(popH, maxHeight)));

      const left = align === "right" ? r.right - WIDTH : r.left;
      setPos({ top, left: Math.max(MARGIN, Math.min(left, vw - WIDTH - MARGIN)), maxHeight });
    };

    // Place now, then again on the next frame once the popover has real height.
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, mode, align]);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function openMenu() {
    if (terminated) { setMode("history"); } else { setMode("menu"); }
    setOpen(true);
  }
  function close() { setOpen(false); setMode("menu"); }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); open ? close() : openMenu(); }}
        title="Manage follow-up"
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset whitespace-nowrap transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
          pill.tone,
        )}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        <span className="truncate">{pill.label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={popRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 288, maxHeight: pos.maxHeight }}
              className="z-[9999] flex flex-col overflow-hidden rounded-2xl border border-zinc-300/80 bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <PopoverHeader
                title={
                  mode === "schedule" ? "Set Follow-Up"
                  : mode === "reschedule" ? "Reschedule Follow-Up"
                  : mode === "complete" ? `Complete ${ordinal(attemptsUsed || 1)} Follow-Up`
                  : mode === "schedule-next" ? `Schedule ${ordinal(historyCount + 1)} Follow-Up`
                  : mode === "history" ? "Follow-Up History"
                  : "Follow-Up"
                }
                subtitle={mode === "menu" && attemptsUsed > 0 ? `Attempt ${Math.min(attemptsUsed, MAX_FOLLOWUP_ATTEMPTS)} of ${MAX_FOLLOWUP_ATTEMPTS}` : undefined}
                onClose={close}
                onBack={mode !== "menu" && mode !== "history" ? () => setMode("menu") : undefined}
              />

              {/* Scrollable body — keeps the popover within the viewport height so
                  long content (outcome grid, history) scrolls instead of being
                  clipped for rows near the bottom of the table. */}
              <div className="min-h-0 flex-1 overflow-y-auto">
              {mode === "menu" && (
                <MenuView
                  state={state}
                  hasActive={hasActive}
                  terminated={terminated}
                  attemptsRemaining={attemptsRemaining}
                  historyCount={historyCount}
                  onSet={() => setMode("schedule")}
                  onReschedule={() => setMode("reschedule")}
                  onMarkContacted={() => { onUpdate({ followUpReadAt: new Date().toISOString() }); close(); }}
                  onComplete={() => setMode("complete")}
                  onCancel={() => {
                    onUpdate({ followUpDate: undefined, followUpTime: undefined, followUpStatus: undefined, followUpReadAt: undefined, followUpAttempt: undefined, followUpComments: undefined });
                    close();
                  }}
                  onHistory={() => setMode("history")}
                />
              )}

              {(mode === "schedule" || mode === "reschedule") && (
                <ScheduleView
                  initialDate={mode === "reschedule" ? walkIn.followUpDate : undefined}
                  initialTime={mode === "reschedule" ? walkIn.followUpTime : undefined}
                  initialComment={mode === "reschedule" ? walkIn.followUpComments : undefined}
                  saveLabel="Save Follow-Up"
                  onSave={(date, time, comment) => {
                    onUpdate({
                      followUpDate: date,
                      followUpTime: time || undefined,
                      followUpStatus: "pending",
                      // First-time schedule → attempt 1; reschedule keeps the active
                      // attempt (history length + 1). Rescheduling REPLACES the active
                      // schedule (no duplicate), and re-arms notifications (unread).
                      followUpAttempt: historyCount + 1,
                      followUpComments: comment || undefined,
                      followUpReadAt: undefined,
                    });
                    close();
                  }}
                />
              )}

              {mode === "complete" && (
                <CompleteView
                  finalOnly={historyCount + 1 >= MAX_FOLLOWUP_ATTEMPTS}
                  onDone={(outcome, comment) => {
                    completeAttempt(walkIn, outcome, comment, { id: currentUserId, name: currentUserName }, onUpdate, onConvert, () => close(), () => setMode("schedule-next"));
                  }}
                />
              )}

              {mode === "schedule-next" && (
                <ScheduleView
                  saveLabel={`Schedule ${ordinal(historyCount + 1)} Follow-Up`}
                  onSave={(date, time, comment) => {
                    onUpdate({
                      followUpDate: date,
                      followUpTime: time || undefined,
                      followUpStatus: "pending",
                      followUpAttempt: historyCount + 1,
                      followUpComments: comment || undefined,
                      followUpReadAt: undefined,
                    });
                    close();
                  }}
                />
              )}

              {mode === "history" && <HistoryView walkIn={walkIn} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* ─── Complete an attempt: push to history, then branch on outcome ─────────── */
function completeAttempt(
  walkIn: WalkIn,
  outcome: FollowUpOutcome,
  comment: string,
  user: { id?: string; name?: string },
  onUpdate: (patch: Partial<WalkIn>) => void,
  onConvert: ((w: WalkIn) => void) | undefined,
  close: () => void,
  goScheduleNext: () => void,
) {
  const attempt = (walkIn.followUpHistory?.length ?? 0) + 1;
  const record: FollowUpRecord = {
    attempt,
    scheduledDate: walkIn.followUpDate || new Date().toISOString().slice(0, 10),
    scheduledTime: walkIn.followUpTime,
    completedAt: new Date().toISOString(),
    completedById: user.id,
    completedByName: user.name,
    outcome,
    comment: comment.trim() || undefined,
  };
  const history = [...(walkIn.followUpHistory ?? []), record];

  // Clear the active schedule (this attempt is now completed history).
  const base: Partial<WalkIn> = {
    followUpHistory: history,
    followUpStatus: "done",
    followUpReadAt: walkIn.followUpReadAt || new Date().toISOString(),
    followUpDate: undefined,
    followUpTime: undefined,
    followUpAttempt: undefined,
    followUpComments: undefined,
  };

  // Terminal outcome → close the lifecycle. "Converted" routes into the real
  // conversion flow (a ticket must be created), so we don't flip status here.
  if (FOLLOWUP_TERMINAL_OUTCOMES.includes(outcome)) {
    if (outcome === "converted") {
      onUpdate(base);
      close();
      onConvert?.(walkIn);
      return;
    }
    // Lost / Not Interested → reflect on Final Status too (Lost is a real status).
    onUpdate({ ...base, ...(outcome === "lost" ? { status: "lost" as WalkIn["status"] } : {}) });
    close();
    return;
  }

  // Continuing outcome: if attempts remain, offer to schedule the next attempt;
  // otherwise (3rd already done) just record completion.
  onUpdate(base);
  if (attempt < MAX_FOLLOWUP_ATTEMPTS && FOLLOWUP_CONTINUE_OUTCOMES.includes(outcome)) {
    goScheduleNext();
  } else {
    close();
  }
}

/* ─── Sub-views ───────────────────────────────────────────────────────────── */

function PopoverHeader({ title, subtitle, onClose, onBack }: { title: string; subtitle?: string; onClose: () => void; onBack?: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground" aria-label="Back">
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-none">{title}</p>
          {subtitle && <p className="mt-0.5 text-[10.5px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function MenuAction({ icon: Icon, label, onClick, tone }: { icon: any; label: string; onClick: () => void; tone?: "danger" | "default" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] font-medium transition hover:bg-muted/60",
        tone === "danger" ? "text-rose-600" : "text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" /> {label}
    </button>
  );
}

function MenuView({
  state, hasActive, terminated, attemptsRemaining, historyCount,
  onSet, onReschedule, onMarkContacted, onComplete, onCancel, onHistory,
}: {
  state: string; hasActive: boolean; terminated: boolean; attemptsRemaining: number; historyCount: number;
  onSet: () => void; onReschedule: () => void; onMarkContacted: () => void; onComplete: () => void; onCancel: () => void; onHistory: () => void;
}) {
  const due = state === "today" || state === "overdue";
  return (
    <div className="py-1">
      {terminated ? (
        <p className="px-3.5 py-2 text-[11.5px] text-muted-foreground">Follow-up is closed for this walk-in.</p>
      ) : hasActive ? (
        <>
          {due && <MenuAction icon={PhoneCall} label="Mark Contacted" onClick={onMarkContacted} />}
          <MenuAction icon={CheckCheck} label="Complete Follow-Up" onClick={onComplete} />
          <MenuAction icon={CalendarClock} label="Reschedule" onClick={onReschedule} />
          {!due && <MenuAction icon={PhoneCall} label="Mark Contacted" onClick={onMarkContacted} />}
          <MenuAction icon={XCircle} label="Cancel Follow-Up" onClick={onCancel} tone="danger" />
        </>
      ) : attemptsRemaining > 0 ? (
        <MenuAction icon={CalendarPlus} label={historyCount > 0 ? `Schedule ${ordinal(historyCount + 1)} Follow-Up` : "Set Follow-Up"} onClick={onSet} />
      ) : (
        <p className="px-3.5 py-2 text-[11.5px] text-muted-foreground">All {historyCount} follow-up attempts used. Choose a final outcome from Final Status.</p>
      )}
      <div className="my-1 h-px bg-border" />
      <MenuAction icon={History} label={`View History${historyCount ? ` (${historyCount})` : ""}`} onClick={onHistory} />
    </div>
  );
}

function ScheduleView({
  initialDate, initialTime, initialComment, saveLabel, onSave,
}: {
  initialDate?: string; initialTime?: string; initialComment?: string; saveLabel: string;
  onSave: (date: string, time: string, comment: string) => void;
}) {
  const [date, setDate] = useState(initialDate || "");
  const [time, setTime] = useState(initialTime || "");
  const [comment, setComment] = useState(initialComment || "");
  return (
    <div className="space-y-3 p-3.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10.5px] font-medium text-muted-foreground">Follow-Up Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
        </div>
        <div className="space-y-1">
          <label className="text-[10.5px] font-medium text-muted-foreground">Time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20 disabled:opacity-50" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Comment <span className="font-normal">(optional)</span></label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
          placeholder="e.g. Customer asked to call after 2 days…"
          className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
      </div>
      <button
        onClick={() => date && onSave(date, time, comment)}
        disabled={!date}
        className="w-full rounded-lg bg-[#4361EE] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8] disabled:opacity-50"
      >
        {saveLabel}
      </button>
    </div>
  );
}

function CompleteView({ finalOnly, onDone }: { finalOnly: boolean; onDone: (outcome: FollowUpOutcome, comment: string) => void }) {
  const [outcome, setOutcome] = useState<FollowUpOutcome | null>(null);
  const [comment, setComment] = useState("");
  const options: FollowUpOutcome[] = finalOnly
    ? ["converted", "lost", "not_interested"]
    : ["interested", "call_again", "need_more_time", "no_response", "converted", "lost", "not_interested"];
  return (
    <div className="space-y-3 p-3.5">
      {finalOnly && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
          Final attempt reached — choose a final outcome.
        </p>
      )}
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Outcome</label>
        <div className="grid grid-cols-2 gap-1.5">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-[11.5px] font-medium transition",
                outcome === o ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-input text-foreground hover:bg-muted/60",
              )}
            >
              {FOLLOWUP_OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Comment <span className="font-normal">(optional)</span></label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
          placeholder="What happened on this attempt…"
          className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
      </div>
      <button
        onClick={() => outcome && onDone(outcome, comment)}
        disabled={!outcome}
        className="w-full rounded-lg bg-[#4361EE] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8] disabled:opacity-50"
      >
        Save Outcome
      </button>
    </div>
  );
}

function HistoryView({ walkIn }: { walkIn: WalkIn }) {
  const history = walkIn.followUpHistory ?? [];
  const activeDue = walkIn.followUpStatus !== "done" && walkIn.followUpDate ? followUpDueAt(walkIn) : null;
  return (
    <div className="p-3.5">
      {history.length === 0 && !activeDue && (
        <p className="py-4 text-center text-[12px] text-muted-foreground">No follow-up history yet.</p>
      )}
      <ol className="space-y-3">
        {history.map((r) => (
          <li key={r.attempt} className="relative pl-4">
            <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-[12px] font-semibold">{ordinal(r.attempt)} Follow-Up</p>
            <p className="text-[11px] text-muted-foreground">
              {new Date(`${r.scheduledDate}T${r.scheduledTime || "09:00"}`).toLocaleString("en-IN", { dateStyle: "medium", ...(r.scheduledTime ? { timeStyle: "short" } : {}) })}
            </p>
            <p className="mt-0.5 text-[11.5px]"><span className="font-medium">Outcome:</span> {FOLLOWUP_OUTCOME_LABEL[r.outcome]}</p>
            {r.comment && <p className="text-[11.5px] text-muted-foreground">“{r.comment}”</p>}
            {r.completedByName && <p className="text-[10.5px] text-muted-foreground">by {r.completedByName}</p>}
          </li>
        ))}
        {activeDue && (
          <li className="relative pl-4">
            <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#4361EE]" />
            <p className="text-[12px] font-semibold">{ordinal(walkIn.followUpAttempt ?? history.length + 1)} Follow-Up · Scheduled</p>
            <p className="text-[11px] text-muted-foreground">
              {activeDue.toLocaleString("en-IN", { dateStyle: "medium", ...(walkIn.followUpTime ? { timeStyle: "short" } : {}) })}
            </p>
            {walkIn.followUpComments && <p className="text-[11.5px] text-muted-foreground">“{walkIn.followUpComments}”</p>}
          </li>
        )}
      </ol>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   WalkInFollowUpCompleteModal — the SAFE, explicit completion flow.

   Opened from the Walk-In notification bell (and reusable elsewhere). Unlike the
   old one-click "Complete", this NEVER silently closes a lead. It shows the
   context (customer / ID / attempt / schedule), requires an Outcome + optional
   comment, then asks "What's next?" — Schedule Next / Converted / Lost / Close.
   It reuses the exact same completeAttempt() logic as the inline cell so history
   is preserved and the lifecycle rules (3-attempt max, terminal outcomes) hold.
   ────────────────────────────────────────────────────────────────────────── */
export function WalkInFollowUpCompleteModal({
  walkIn,
  displayId,
  currentUserId,
  currentUserName,
  onUpdate,
  onConvert,
  onClose,
}: {
  walkIn: WalkIn | null;
  displayId: (w: WalkIn) => string;
  currentUserId?: string;
  currentUserName?: string;
  onUpdate: (w: WalkIn, patch: Partial<WalkIn>) => void;
  onConvert: (w: WalkIn) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"complete" | "schedule-next">("complete");
  // After completing an attempt we advance to schedule-next in the same modal,
  // but the passed `walkIn` prop is the pre-completion snapshot. Remember how
  // many attempts are now recorded so the NEXT attempt gets the correct number.
  const [completedCount, setCompletedCount] = useState<number | null>(null);

  useEffect(() => { if (walkIn) { setStep("complete"); setCompletedCount(null); } }, [walkIn]);

  if (!walkIn || typeof document === "undefined") return null;
  const w = walkIn;
  const historyCount = completedCount ?? (w.followUpHistory?.length ?? 0);
  const attempt = historyCount + 1;
  const due = followUpDueAt(w);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[10000] bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      >
        <div
          role="dialog" aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-300/80 bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.35)]"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              {step === "schedule-next" && (
                <button onClick={() => setStep("complete")} className="text-muted-foreground hover:text-foreground" aria-label="Back">
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </button>
              )}
              <div>
                <p className="text-[14px] font-semibold leading-none">
                  {step === "complete" ? `Complete ${ordinal(attempt)} Follow-Up` : `Schedule ${ordinal(historyCount + 1)} Follow-Up`}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {w.customer || "Walk-in"} · {displayId(w)}{w.model ? ` · ${w.model}` : ""}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>

          {/* Context strip */}
          <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2.5 text-[11.5px] text-muted-foreground">
            <span className="font-medium text-foreground">Scheduled:</span>{" "}
            {due ? due.toLocaleString("en-IN", { dateStyle: "medium", ...(w.followUpTime ? { timeStyle: "short" } : {}) }) : "—"}
            {" · "}<span className="font-medium text-foreground">Attempt</span> {Math.min(attempt, MAX_FOLLOWUP_ATTEMPTS)} of {MAX_FOLLOWUP_ATTEMPTS}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {step === "complete" ? (
              <CompleteView
                finalOnly={attempt >= MAX_FOLLOWUP_ATTEMPTS}
                onDone={(outcome, comment) => {
                  completeAttempt(
                    w, outcome, comment,
                    { id: currentUserId, name: currentUserName },
                    (patch) => onUpdate(w, patch),
                    (ww) => onConvert(ww),
                    onClose,
                    () => { setCompletedCount((w.followUpHistory?.length ?? 0) + 1); setStep("schedule-next"); },
                  );
                }}
              />
            ) : (
              <ScheduleView
                saveLabel={`Schedule ${ordinal(historyCount + 1)} Follow-Up`}
                onSave={(date, time, comment) => {
                  onUpdate(w, {
                    followUpDate: date,
                    followUpTime: time || undefined,
                    followUpStatus: "pending",
                    followUpAttempt: historyCount + 1,
                    followUpComments: comment || undefined,
                    followUpReadAt: undefined,
                  });
                  onClose();
                }}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/* Reusable read-only Follow-Up history timeline (Edit Walk-In, View drawer). */
export function FollowUpHistoryTimeline({ walkIn }: { walkIn: WalkIn }) {
  return <HistoryView walkIn={walkIn} />;
}
