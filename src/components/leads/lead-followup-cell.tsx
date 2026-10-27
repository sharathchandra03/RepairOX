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
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import {
  openFollowUp, followUpLifecycle, followUpStateTone, followUpTone, openFollowUpRowState,
  type Lead, type LeadFollowUp,
} from "@/lib/leads-data";
import { statusTone } from "@/components/leads/lead-pills";

type Mode = "menu" | "schedule" | "reschedule" | "complete" | "history";

/** Statuses hidden from the FOLLOW-UP status dropdown specifically. These are
 *  transient call-outcome dispositions (captured as a follow-up OUTCOME on
 *  completion), not lifecycle stages a user should set from the follow-up
 *  status control. Matched case-insensitively so an admin-renamed label with
 *  the same intent still hides. They remain valid org-wide `lead_options`
 *  everywhere else — this only scopes the follow-up status form. */
const FOLLOWUP_HIDDEN_STATUSES = ["rnr", "not connected", "call back", "callback"];
function isHiddenFollowUpStatus(value: string): boolean {
  const v = (value || "").trim().toLowerCase();
  return FOLLOWUP_HIDDEN_STATUSES.includes(v);
}

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

/** A short, human "time left / overdue by" descriptor for a follow-up due time,
 *  e.g. "in 3 days", "in 5 hrs", "in 20 min", "due now", "overdue 2 days",
 *  "overdue 4 hrs". Datetime-precise (uses the exact dueAt instant). */
function relativeFollowUpLabel(dueIso: string, asOf: number = Date.now()): string {
  const due = new Date(dueIso).getTime();
  if (isNaN(due)) return "";
  const diff = due - asOf;                 // >0 = future (time left), <0 = overdue
  const abs = Math.abs(diff);
  const MIN = 60_000, HR = 3_600_000, DAY = 86_400_000;
  const unit = (ms: number): string => {
    if (ms < MIN) return "<1m";
    if (ms < HR) { const m = Math.round(ms / MIN); return `${m}m`; }
    if (ms < DAY) { const h = Math.round(ms / HR); return `${h}h`; }
    const d = Math.round(ms / DAY); return `${d}d`;
  };
  if (abs < MIN) return "due now";
  return diff > 0 ? `in ${unit(abs)}` : `overdue ${unit(abs)}`;
}

/** Full date + time for the pill's secondary line, e.g. "29 Oct, 11:04 AM". */
function fmtDueDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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
    salesAgentsFor, isEligibleSalesAgent, optionsFor,
  } = useLeads();

  // Outcome options for "Complete Follow-Up" are DERIVED from the lead's
  // configured statuses (the SAME source as the Status pill) so the outcome is
  // synced to what the agent is going to do next — never a disconnected list.
  // RNR / Not Connected / Call Back are hidden here too (matching the status
  // form); the lead's CURRENT status is always kept so it stays selectable.
  const completeOutcomes = optionsFor("status")
    .map((o) => o.value)
    .filter((v) => !!v && (!isHiddenFollowUpStatus(v) || v === lead.status));

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
  // The pill is richer now: a primary line (sequence + how much time is LEFT /
  // how OVERDUE it is) and a secondary line (the exact due date + time).
  const tone = followUpTone(rowState);
  const pillTone = openFu ? tone.chip : "bg-zinc-100 text-zinc-500 ring-zinc-200";
  const relLabel = openFu ? relativeFollowUpLabel(openFu.dueAt) : "";
  const pillPrimary = !openFu
    ? "Set follow-up"
    : rowState === "overdue" ? `#${openFu.seq} · ${relLabel}`
    : rowState === "today" ? `#${openFu.seq} · due today`
    : `#${openFu.seq} · ${relLabel}`;
  const pillSecondary = openFu ? fmtDueDateTime(openFu.dueAt) : "";

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
        // The outcome IS a lifecycle status — sync the lead's status to it so
        // the record reflects what the agent is doing next (routed through
        // changeLeadStatus: writes status-history, never a silent auto-win).
        syncStatus: outcome || undefined,
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
        title={openFu ? `Follow-up #${openFu.seq} · ${pillPrimary.replace(/^#\d+ · /, "")} · ${pillSecondary}${openFu.followUpUserName ? ` · ${openFu.followUpUserName}` : ""}` : "Set a follow-up"}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-xl py-1 pl-2.5 pr-3 ring-1 ring-inset transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
          pillTone,
        )}
      >
        {openFu ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /> : <CalendarPlus className="h-3.5 w-3.5 shrink-0" />}
        {openFu ? (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[11.5px] font-semibold capitalize">{pillPrimary}</span>
            <span className="block w-full truncate text-center text-[10px] font-medium opacity-80">{pillSecondary}</span>
          </span>
        ) : (
          <span className="truncate text-[11.5px] font-semibold">Set follow-up</span>
        )}
        <ChevronDown className="ml-1.5 h-3.5 w-3.5 shrink-0 self-center opacity-70" />
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
                  <CompleteView busy={busy} onDone={doComplete} outcomes={completeOutcomes} currentStatus={lead.status || ""} />
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
        <Select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={agents.length === 0}
          className="h-9"
          placeholder={defaultAgentName ? `Default — ${defaultAgentName}` : agents.length === 0 ? "No sales agents available" : "Select a Sales Agent"}
          options={[
            { label: defaultAgentName ? `Default — ${defaultAgentName}` : agents.length === 0 ? "No sales agents available" : "Select a Sales Agent", value: "" },
            ...agents.map((a) => ({ label: a.name, value: a.id })),
          ]}
        />
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

function CompleteView({
  busy, onDone, outcomes, currentStatus,
}: {
  busy: boolean;
  onDone: (outcome: string, comment: string, next?: { date: string; time: string }) => void;
  /** Outcome options derived from the lead's configured statuses (synced to
   *  what the agent is going to do next). */
  outcomes: string[];
  currentStatus: string;
}) {
  // Default the outcome to the lead's current status so completing without a
  // change simply confirms it; the agent picks a different one to progress.
  const [outcome, setOutcome] = useState<string | null>(currentStatus || null);
  const [comment, setComment] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("10:00");
  return (
    <div className="space-y-3 p-3.5">
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Outcome <span className="font-normal normal-case">(updates the lead status)</span></label>
        {outcomes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11.5px] text-muted-foreground">No statuses configured.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {outcomes.map((o) => {
              const selected = outcome === o;
              return (
                <button
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold ring-1 ring-inset transition",
                    selected ? statusTone(o) : "bg-card text-foreground ring-border hover:bg-muted/60",
                    selected && "shadow-sm",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", selected ? "bg-current" : "bg-zinc-300")} />
                  <span className="truncate">{o}</span>
                  {o === currentStatus && <span className="ml-auto shrink-0 text-[9px] font-normal opacity-70">current</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <label className="text-[10.5px] font-medium text-muted-foreground">Comment <span className="font-normal">(optional)</span></label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
          placeholder="What happened on this attempt… (also saved to the lead's comments)"
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
      <p className="text-[10px] text-muted-foreground">The outcome updates the lead status; the comment is saved to the lead&apos;s comments too.</p>
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

  // Exclude RNR / Not Connected / Call Back from the follow-up status form —
  // but always keep the lead's CURRENT status in the list (so a lead already on
  // one of those can still be shown and changed away from it).
  const statuses = optionsFor("status")
    .map((o) => o.value)
    .filter((v) => !!v && (!isHiddenFollowUpStatus(v) || v === lead.status));

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
