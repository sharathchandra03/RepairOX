"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Lead Follow-Up Cell — the interactive Follow-Up pill + popover for a lead.

   The Leads counterpart of the Walk-In follow-up cell. It renders the compact
   Follow-Up pill and, on click, a state-aware popover to manage the follow-up
   lifecycle inline (without opening the whole lead), reusing the structured
   lead_followup_history actions from the leads context:

     • No open follow-up  → Schedule Follow-Up · View History
     • Scheduled          → Mark Contacted · Complete Follow-Up · Reschedule ·
                            Cancel Follow-Up · View History
     • Due / Overdue      → same, with Mark Contacted surfaced first

   Actions map to the context:
     • Mark Contacted   → updateLead(contactStatus:"Contacted")  (also clears the
                          Not-Contacted lock — see leads-context)
     • Complete         → completeFollowUp(outcome, { comments, next })  — pushes
                          the attempt to history + optionally schedules the next
                          (NEVER wins the lead)
     • Reschedule       → cancel the open one + schedule a new record (history is
                          preserved; a new Follow-up #N is created)
     • Cancel           → cancelFollowUp (kept as cancelled history)
     • Schedule         → scheduleFollowUp

   Every write goes through the leads context (DB + audit + history + notify) —
   no parallel store. Permission-gated by CAP.lead.followup.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarPlus, CalendarClock, PhoneCall, CheckCheck, History, ChevronDown, X, XCircle,
} from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import {
  openFollowUp, followUpLifecycle, followUpStateTone, followUpTone, openFollowUpRowState,
  LEAD_FOLLOWUP_OUTCOMES,
  type Lead, type LeadFollowUp,
} from "@/lib/leads-data";
import { statusTone } from "@/components/leads/lead-pills";

type Mode = "menu" | "schedule" | "reschedule" | "complete" | "history";

/** Combine a YYYY-MM-DD date + HH:mm time into an ISO string (default 10:00). */
function toIso(date: string, time: string): string {
  if (!date) return "";
  return new Date(`${date}T${time || "10:00"}:00`).toISOString();
}
function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function LeadFollowUpCell({
  lead,
  align = "left",
  onOpenLead,
}: {
  lead: Lead;
  align?: "left" | "right";
  /** Optional: open the full lead (used by "Open lead" fallbacks). */
  onOpenLead?: (lead: Lead) => void;
}) {
  const { can } = usePermissions();
  const canFollowUp = allow(can, CAP.lead.followup);
  const {
    followUpsFor, scheduleFollowUp, completeFollowUp, cancelFollowUp, updateLead,
    salesAgentsFor, isEligibleSalesAgent,
  } = useLeads();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const followUps = followUpsFor(lead.id);
  const openFu = openFollowUp(followUps);
  const rowState = openFollowUpRowState(openFu);
  const historyCount = followUps.length;
  const seqCount = followUps.length;

  // Follow-up agents eligible for THIS lead's store (never the whole staff list).
  const agents = salesAgentsFor(lead.branchId || null);
  const defaultAgentName =
    (lead.followUpAgentId && isEligibleSalesAgent(lead.followUpAgentId, lead.branchId || null) && lead.followUpAgent)
    || (lead.assignedTo && isEligibleSalesAgent(lead.assignedTo, lead.branchId || null) && lead.assignedToName)
    || "";

  // Pill label/tone — reuse the shared follow-up palette (matches the row tint).
  const tone = followUpTone(rowState);
  const pillLabel = !openFu
    ? "Set follow-up"
    : rowState === "overdue" ? `Overdue · #${openFu.seq}`
    : rowState === "today" ? `Due today · #${openFu.seq}`
    : `#${openFu.seq} · ${new Date(openFu.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
  const pillTone = openFu ? tone.chip : "bg-zinc-100 text-zinc-500 ring-zinc-200";

  /* Portal positioning — flip above when a bottom row lacks space below. Same
     approach as the Walk-In cell so it's never clipped by table overflow. */
  useEffect(() => {
    if (!open) return;
    const GAP = 6, MARGIN = 8, WIDTH = 300;
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const popH = popRef.current?.offsetHeight || 320;
      const spaceBelow = vh - r.bottom - GAP - MARGIN;
      const spaceAbove = r.top - GAP - MARGIN;
      let top: number, maxHeight: number;
      if (spaceBelow >= popH || spaceBelow >= spaceAbove) {
        top = r.bottom + GAP; maxHeight = Math.max(160, spaceBelow);
      } else {
        maxHeight = Math.max(160, spaceAbove);
        top = r.top - GAP - Math.min(popH, maxHeight);
      }
      top = Math.max(MARGIN, Math.min(top, vh - MARGIN - Math.min(popH, maxHeight)));
      const left = align === "right" ? r.right - WIDTH : r.left;
      setPos({ top, left: Math.max(MARGIN, Math.min(left, vw - WIDTH - MARGIN)), maxHeight });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open, mode, align]);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function openMenu() { setMode("menu"); setOpen(true); }
  function close() { setOpen(false); setMode("menu"); }

  const markContacted = async () => {
    setBusy(true);
    try { await updateLead(lead.id, { contactStatus: "Contacted" }); close(); }
    finally { setBusy(false); }
  };
  const doCancel = async () => {
    if (!openFu) return;
    setBusy(true);
    try { await cancelFollowUp(openFu.id); close(); }
    finally { setBusy(false); }
  };
  const doSchedule = async (date: string, time: string, agentId: string, comment: string) => {
    setBusy(true);
    try {
      const agent = agents.find((a) => a.id === agentId);
      await scheduleFollowUp(lead.id, { dueAt: toIso(date, time), followUpUserId: agentId || undefined, followUpUserName: agent?.name, comments: comment || undefined });
      close();
    } finally { setBusy(false); }
  };
  const doReschedule = async (date: string, time: string, agentId: string, comment: string) => {
    if (!openFu) return;
    setBusy(true);
    try {
      // Preserve history: cancel the open follow-up, then schedule a fresh one
      // (a new Follow-up #N). Keeps the same agent unless changed.
      await cancelFollowUp(openFu.id, "Rescheduled");
      const agent = agents.find((a) => a.id === agentId);
      await scheduleFollowUp(lead.id, {
        dueAt: toIso(date, time),
        followUpUserId: (agentId || openFu.followUpUserId) || undefined,
        followUpUserName: agent?.name || openFu.followUpUserName,
        comments: comment || undefined,
      });
      close();
    } finally { setBusy(false); }
  };
  const doComplete = async (outcome: string, comment: string, next?: { date: string; time: string }) => {
    if (!openFu) return;
    setBusy(true);
    try {
      await completeFollowUp(openFu.id, outcome, {
        comments: comment || undefined,
        next: next?.date
          ? {
              dueAt: toIso(next.date, next.time),
              ...(openFu.followUpUserId && isEligibleSalesAgent(openFu.followUpUserId, lead.branchId || null)
                ? { followUpUserId: openFu.followUpUserId, followUpUserName: openFu.followUpUserName }
                : {}),
            }
          : undefined,
      });
      close();
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); open ? close() : openMenu(); }}
        title="Manage follow-up"
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset whitespace-nowrap transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
          pillTone,
        )}
      >
        {openFu && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
        {!openFu && <CalendarPlus className="h-3 w-3 shrink-0" />}
        <span className="truncate">{pillLabel}</span>
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
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 300, maxHeight: pos.maxHeight }}
              className="z-[9999] flex flex-col overflow-hidden rounded-2xl border border-zinc-300/80 bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <Header
                title={
                  mode === "schedule" ? (seqCount > 0 ? `Schedule Follow-Up #${seqCount + 1}` : "Schedule Follow-Up")
                  : mode === "reschedule" ? "Reschedule Follow-Up"
                  : mode === "complete" ? `Complete Follow-Up${openFu ? ` #${openFu.seq}` : ""}`
                  : mode === "history" ? "Follow-Up History"
                  : "Follow-Up"
                }
                subtitle={mode === "menu" && openFu ? `${lead.leadNo} · ${lead.name || "Unnamed"}` : undefined}
                onClose={close}
                onBack={mode !== "menu" && mode !== "history" ? () => setMode("menu") : undefined}
              />

              <div className="min-h-0 flex-1 overflow-y-auto">
                {mode === "menu" && (
                  <MenuView
                    canFollowUp={canFollowUp}
                    hasOpen={!!openFu}
                    due={rowState === "overdue" || rowState === "today"}
                    seqCount={seqCount}
                    isNotContacted={/not contacted/i.test(lead.contactStatus || "") || !lead.contactStatus}
                    onMarkContacted={markContacted}
                    onComplete={() => setMode("complete")}
                    onReschedule={() => setMode("reschedule")}
                    onCancel={doCancel}
                    onSchedule={() => setMode("schedule")}
                    onHistory={() => setMode("history")}
                    busy={busy}
                  />
                )}

                {(mode === "schedule" || mode === "reschedule") && (
                  <ScheduleView
                    agents={agents}
                    defaultAgentName={defaultAgentName}
                    initialDate={mode === "reschedule" && openFu ? openFu.dueAt.slice(0, 10) : ""}
                    initialTime={mode === "reschedule" && openFu ? new Date(openFu.dueAt).toTimeString().slice(0, 5) : "10:00"}
                    saveLabel={mode === "reschedule" ? "Reschedule" : (seqCount > 0 ? `Schedule #${seqCount + 1}` : "Schedule Follow-Up")}
                    busy={busy}
                    onSave={(date, time, agentId, comment) => (mode === "reschedule" ? doReschedule : doSchedule)(date, time, agentId, comment)}
                  />
                )}

                {mode === "complete" && (
                  <CompleteView busy={busy} onDone={doComplete} />
                )}

                {mode === "history" && <HistoryView followUps={followUps} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* ─── Sub-views ───────────────────────────────────────────────────────────── */

function Header({ title, subtitle, onClose, onBack }: { title: string; subtitle?: string; onClose: () => void; onBack?: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && <button onClick={onBack} className="text-muted-foreground hover:text-foreground" aria-label="Back"><ChevronDown className="h-4 w-4 rotate-90" /></button>}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-none">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function MenuAction({ icon: Icon, label, onClick, tone, disabled }: { icon: any; label: string; onClick: () => void; tone?: "danger" | "default"; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] font-medium transition hover:bg-muted/60 disabled:opacity-50",
        tone === "danger" ? "text-rose-600" : "text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" /> {label}
    </button>
  );
}

function MenuView({
  canFollowUp, hasOpen, due, seqCount, isNotContacted,
  onMarkContacted, onComplete, onReschedule, onCancel, onSchedule, onHistory, busy,
}: {
  canFollowUp: boolean; hasOpen: boolean; due: boolean; seqCount: number; isNotContacted: boolean;
  onMarkContacted: () => void; onComplete: () => void; onReschedule: () => void; onCancel: () => void; onSchedule: () => void; onHistory: () => void; busy: boolean;
}) {
  return (
    <div className="py-1">
      {!canFollowUp ? (
        <p className="px-3.5 py-2 text-[11.5px] text-muted-foreground">You don&apos;t have permission to manage follow-ups.</p>
      ) : hasOpen ? (
        <>
          {due && isNotContacted && <MenuAction icon={PhoneCall} label="Mark Contacted" onClick={onMarkContacted} disabled={busy} />}
          <MenuAction icon={CheckCheck} label="Complete Follow-Up" onClick={onComplete} disabled={busy} />
          <MenuAction icon={CalendarClock} label="Reschedule" onClick={onReschedule} disabled={busy} />
          {!due && isNotContacted && <MenuAction icon={PhoneCall} label="Mark Contacted" onClick={onMarkContacted} disabled={busy} />}
          <MenuAction icon={XCircle} label="Cancel Follow-Up" onClick={onCancel} tone="danger" disabled={busy} />
        </>
      ) : (
        <MenuAction icon={CalendarPlus} label={seqCount > 0 ? `Schedule Follow-Up #${seqCount + 1}` : "Schedule Follow-Up"} onClick={onSchedule} disabled={busy} />
      )}
      <div className="my-1 h-px bg-border" />
      <MenuAction icon={History} label={`View History${seqCount ? ` (${seqCount})` : ""}`} onClick={onHistory} />
    </div>
  );
}

function ScheduleView({
  agents, defaultAgentName, initialDate, initialTime, saveLabel, busy, onSave,
}: {
  agents: { id: string; name: string }[];
  defaultAgentName: string;
  initialDate?: string; initialTime?: string; saveLabel: string; busy: boolean;
  onSave: (date: string, time: string, agentId: string, comment: string) => void;
}) {
  const [date, setDate] = useState(initialDate || "");
  const [time, setTime] = useState(initialTime || "10:00");
  const [agentId, setAgentId] = useState("");
  const [comment, setComment] = useState("");
  return (
    <div className="space-y-3 p-3.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10.5px] font-medium text-muted-foreground">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
        </div>
        <div className="space-y-1">
          <label className="text-[10.5px] font-medium text-muted-foreground">Time</label>
          <TimePicker value={time} onChange={setTime} disabled={!date} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Follow-Up Agent</label>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={agents.length === 0}
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20 disabled:bg-muted/40">
          <option value="">{defaultAgentName ? `Default — ${defaultAgentName}` : agents.length === 0 ? "No sales agents available" : "Select a Sales Agent"}</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Comment <span className="font-normal">(optional)</span></label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
          placeholder="What to do next…"
          className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
      </div>
      <button onClick={() => date && onSave(date, time, agentId, comment)} disabled={!date || busy}
        className="w-full rounded-lg bg-[#4361EE] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8] disabled:opacity-50">
        {saveLabel}
      </button>
    </div>
  );
}

function CompleteView({ busy, onDone }: { busy: boolean; onDone: (outcome: string, comment: string, next?: { date: string; time: string }) => void }) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("10:00");
  return (
    <div className="space-y-3 p-3.5">
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Outcome</label>
        <div className="grid grid-cols-2 gap-1.5">
          {LEAD_FOLLOWUP_OUTCOMES.map((o) => (
            <button key={o} onClick={() => setOutcome(o)}
              className={cn("rounded-lg border px-2 py-1.5 text-[11.5px] font-medium transition",
                outcome === o ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-input text-foreground hover:bg-muted/60")}>
              {o}
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
      <label className="flex items-center gap-2 text-[12px] text-zinc-700">
        <Checkbox checked={scheduleNext} onChange={setScheduleNext} aria-label="Schedule next follow-up" />
        Schedule next follow-up
      </label>
      {scheduleNext && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
          <TimePicker value={nextTime} onChange={setNextTime} />
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Completing records the activity only — it does not change the lead&apos;s status.</p>
      <button
        onClick={() => outcome && onDone(outcome, comment, scheduleNext && nextDate ? { date: nextDate, time: nextTime } : undefined)}
        disabled={!outcome || busy || (scheduleNext && !nextDate)}
        className="w-full rounded-lg bg-[#4361EE] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8] disabled:opacity-50">
        Save Outcome
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Lead Status Cell — the inline lifecycle-status dropdown (the Leads
   counterpart of the Walk-In "Final Status" control). Picking a status routes
   through changeLeadStatus (writes status-history + terminal timestamps).
   Permission-gated by CAP.lead.stageChange; a view-tier user sees a read-only
   pill. Options come from the configured Settings statuses (never hard-coded).
   ────────────────────────────────────────────────────────────────────────── */
export function LeadStatusCell({ lead, align = "left" }: { lead: Lead; align?: "left" | "right" }) {
  const { can } = usePermissions();
  const canChange = allow(can, CAP.lead.stageChange);
  const { optionsFor, changeLeadStatus } = useLeads();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const statuses = optionsFor("status").map((o) => o.value).filter(Boolean);

  useEffect(() => {
    if (!open) return;
    const GAP = 6, MARGIN = 8, WIDTH = 220;
    const place = () => {
      const btn = btnRef.current; if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const popH = popRef.current?.offsetHeight || 260;
      const spaceBelow = vh - r.bottom - GAP - MARGIN, spaceAbove = r.top - GAP - MARGIN;
      let top: number, maxHeight: number;
      if (spaceBelow >= popH || spaceBelow >= spaceAbove) { top = r.bottom + GAP; maxHeight = Math.max(140, spaceBelow); }
      else { maxHeight = Math.max(140, spaceAbove); top = r.top - GAP - Math.min(popH, maxHeight); }
      top = Math.max(MARGIN, Math.min(top, vh - MARGIN - Math.min(popH, maxHeight)));
      const left = align === "right" ? r.right - WIDTH : r.left;
      setPos({ top, left: Math.max(MARGIN, Math.min(left, vw - WIDTH - MARGIN)), maxHeight });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = async (s: string) => {
    setBusy(true);
    try { await changeLeadStatus(lead.id, s); setOpen(false); }
    finally { setBusy(false); }
  };

  const pill = (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", statusTone(lead.status || ""))}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {lead.status || "—"}
      {canChange && <ChevronDown className="h-3 w-3 opacity-70" />}
    </span>
  );

  if (!canChange || statuses.length === 0) return pill;

  return (
    <>
      <button ref={btnRef} type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title="Change status" className="focus:outline-none">
        {pill}
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={popRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.14 }}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 220, maxHeight: pos.maxHeight }}
              className="z-[9999] flex flex-col overflow-hidden rounded-xl border border-zinc-300/80 bg-card py-1 shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                {statuses.map((s) => (
                  <button key={s} onClick={() => void pick(s)} disabled={busy}
                    className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium transition hover:bg-muted/60 disabled:opacity-50", s === lead.status && "bg-[#EEF1FD]")}>
                    <span className={cn("inline-flex h-2 w-2 rounded-full", statusTone(s))} />
                    <span className="truncate">{s}</span>
                    {s === lead.status && <CheckCheck className="ml-auto h-3.5 w-3.5 text-[#4361EE]" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function HistoryView({ followUps }: { followUps: LeadFollowUp[] }) {
  if (followUps.length === 0) return <p className="py-4 text-center text-[12px] text-muted-foreground">No follow-up history yet.</p>;
  const ordered = [...followUps].sort((a, b) => a.seq - b.seq);
  return (
    <div className="p-3.5">
      <ol className="space-y-3">
        {ordered.map((f) => {
          const state = followUpLifecycle(f);
          return (
            <li key={f.id} className="relative pl-4">
              <span className={cn("absolute left-0 top-1.5 h-2 w-2 rounded-full",
                f.status === "completed" ? "bg-emerald-500" : f.status === "cancelled" ? "bg-zinc-400" : "bg-[#4361EE]")} />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold">Follow-Up #{f.seq}</p>
                <span className={cn("inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ring-1 ring-inset", followUpStateTone(state))}>{state}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{fmt(f.dueAt)}{f.followUpUserName ? ` · ${f.followUpUserName}` : ""}</p>
              {f.status === "completed" && f.outcome && <p className="mt-0.5 text-[11.5px]"><span className="font-medium text-emerald-700">Outcome:</span> {f.outcome}</p>}
              {f.comments && <p className="text-[11.5px] text-muted-foreground">“{f.comments}”</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
