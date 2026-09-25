"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Follow-Up History + Assignment History (view + actions)

   A self-contained section for the Lead detail. It renders:
     • every follow-up for the lead as Follow-up #1, #2, … (never deleted) with
       its lifecycle chip (Pending / Due / Overdue / Completed / Cancelled),
       due time, agent, outcome and comments;
     • a "Schedule follow-up" action (permission-gated) that ADDS a new record
       and keeps all prior ones;
     • Complete (with a structured outcome, and an optional "schedule next")
       and Cancel actions on the open follow-up — completing NEVER wins the lead;
     • the ownership/assignment history timeline (who owned it, by whom, when).

   All writes go through the leads context (DB + audit + history). Permission:
   CAP.lead.followup gates scheduling/completing/cancelling.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { CalendarClock, Check, X, Plus, UserCheck, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import {
  followUpLifecycle, followUpStateTone, openFollowUp,
  LEAD_FOLLOWUP_OUTCOMES,
  type Lead, type LeadFollowUp,
} from "@/lib/leads-data";

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Combine a YYYY-MM-DD date + HH:mm time into an ISO string. */
function toIso(date: string, time: string): string {
  if (!date) return "";
  return new Date(`${date}T${time || "10:00"}:00`).toISOString();
}

export function LeadFollowUpHistory({ lead }: { lead: Lead }) {
  const { can, team } = usePermissions();
  const { followUpsFor, scheduleFollowUp, completeFollowUp, cancelFollowUp, assignmentHistoryFor } = useLeads();
  const canFollowUp = allow(can, CAP.lead.followup);

  const followUps = followUpsFor(lead.id);
  const open = openFollowUp(followUps);
  const history = assignmentHistoryFor(lead.id);

  // Assignable agents (active staff). Follow-up agent may differ from owner.
  const agents = useMemo(
    () => team.filter((m) => m.status === "active" && m.name).map((m) => ({ id: m.id, name: m.name })),
    [team],
  );

  /* ── Schedule form state ── */
  const [scheduling, setScheduling] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [agentId, setAgentId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  /* ── Complete form state ── */
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>(LEAD_FOLLOWUP_OUTCOMES[0]);
  const [completeComments, setCompleteComments] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("10:00");

  const resetSchedule = () => { setScheduling(false); setDate(""); setTime("10:00"); setAgentId(""); setNotes(""); };
  const resetComplete = () => { setCompletingId(null); setOutcome(LEAD_FOLLOWUP_OUTCOMES[0]); setCompleteComments(""); setScheduleNext(false); setNextDate(""); setNextTime("10:00"); };

  const handleSchedule = async () => {
    if (!date) return;
    setBusy(true);
    try {
      const agent = agents.find((a) => a.id === agentId);
      await scheduleFollowUp(lead.id, {
        dueAt: toIso(date, time),
        followUpUserId: agentId || undefined,
        followUpUserName: agent?.name,
        comments: notes || undefined,
      });
      resetSchedule();
    } finally { setBusy(false); }
  };

  const handleComplete = async (fu: LeadFollowUp) => {
    setBusy(true);
    try {
      await completeFollowUp(fu.id, outcome, {
        comments: completeComments || undefined,
        next: scheduleNext && nextDate ? { dueAt: toIso(nextDate, nextTime), followUpUserId: fu.followUpUserId, followUpUserName: fu.followUpUserName } : undefined,
      });
      resetComplete();
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><CalendarClock className="h-3.5 w-3.5" /></span>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">Follow-ups</h3>
        </div>
        {canFollowUp && !scheduling && !open && (
          <Button variant="soft" size="sm" className="gap-1.5" onClick={() => setScheduling(true)}>
            <Plus className="h-3.5 w-3.5" /> Schedule
          </Button>
        )}
      </div>

      {/* Schedule form */}
      {scheduling && (
        <div className="mb-3 rounded-xl border border-[#B3BFF6] bg-[#EEF1FD]/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-muted-foreground">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-[34px] w-full rounded-lg border border-input bg-card px-2 text-[13px]" />
            </label>
            <label className="text-[11px] font-medium text-muted-foreground">
              Time
              <div className="mt-1"><TimePicker value={time} onChange={setTime} /></div>
            </label>
          </div>
          <label className="mt-2 block text-[11px] font-medium text-muted-foreground">
            Follow-up Agent <span className="font-normal normal-case">(defaults to owner)</span>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="mt-1 h-[34px] w-full rounded-lg border border-input bg-card px-2 text-[13px]">
              <option value="">{lead.assignedToName || "Lead owner"}</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="mt-2 block text-[11px] font-medium text-muted-foreground">
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What to do next…" className="mt-1 min-h-[52px] w-full rounded-lg border border-input bg-card px-2 py-1.5 text-[13px]" />
          </label>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetSchedule}>Cancel</Button>
            <Button size="sm" className="gap-1.5" loading={busy} disabled={!date} onClick={handleSchedule}><Check className="h-3.5 w-3.5" /> Schedule</Button>
          </div>
        </div>
      )}

      {/* Follow-up records (Follow-up #1, #2, …) */}
      {followUps.length === 0 && !scheduling ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-[12px] text-muted-foreground">
          No follow-ups yet.{canFollowUp ? " Schedule one to keep this lead moving." : ""}
        </p>
      ) : (
        <ol className="space-y-2">
          {followUps.map((fu) => {
            const state = followUpLifecycle(fu);
            const isCompleting = completingId === fu.id;
            return (
              <li key={fu.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-700">#{fu.seq}</span>
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{fmt(fu.dueAt)}</p>
                      <p className="text-[11px] text-muted-foreground">{fu.followUpUserName || "Owner"}{fu.createdByName ? ` · scheduled by ${fu.createdByName}` : ""}</p>
                    </div>
                  </div>
                  <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", followUpStateTone(state))}>{state}</span>
                </div>

                {fu.comments && <p className="mt-2 text-[12px] text-zinc-600">{fu.comments}</p>}

                {fu.status === "completed" && (
                  <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-emerald-700">Outcome: {fu.outcome || "—"}</span> · completed {fmt(fu.completedAt)}
                  </div>
                )}

                {/* Actions on the OPEN follow-up */}
                {canFollowUp && fu.status === "scheduled" && !isCompleting && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="soft" size="sm" className="gap-1" onClick={() => { setCompletingId(fu.id); }}><Check className="h-3.5 w-3.5" /> Complete</Button>
                    <Button variant="ghost" size="sm" className="gap-1 text-rose-600 hover:bg-rose-50" onClick={() => void cancelFollowUp(fu.id)}><X className="h-3.5 w-3.5" /> Cancel</Button>
                  </div>
                )}

                {/* Complete form */}
                {canFollowUp && isCompleting && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                    <label className="block text-[11px] font-medium text-muted-foreground">
                      Outcome
                      <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 h-[34px] w-full rounded-lg border border-input bg-card px-2 text-[13px]">
                        {LEAD_FOLLOWUP_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <textarea value={completeComments} onChange={(e) => setCompleteComments(e.target.value)} placeholder="Notes (optional)…" className="mt-2 min-h-[44px] w-full rounded-lg border border-input bg-card px-2 py-1.5 text-[13px]" />
                    <label className="mt-2 flex items-center gap-2 text-[12px] text-zinc-700">
                      <input type="checkbox" checked={scheduleNext} onChange={(e) => setScheduleNext(e.target.checked)} className="rounded border-input" />
                      Schedule next follow-up
                    </label>
                    {scheduleNext && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="h-[34px] w-full rounded-lg border border-input bg-card px-2 text-[13px]" />
                        <TimePicker value={nextTime} onChange={setNextTime} />
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground">Completing records the activity only — it does not change the lead's status.</p>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={resetComplete}>Cancel</Button>
                      <Button size="sm" className="gap-1.5" loading={busy} disabled={scheduleNext && !nextDate} onClick={() => handleComplete(fu)}><Check className="h-3.5 w-3.5" /> Save Outcome</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Assignment / ownership history */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#EEF1FD] text-[#4361EE]"><History className="h-3 w-3" /></span>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Ownership History</h4>
        </div>
        {history.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {lead.assignedToName ? <span className="inline-flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-[#4361EE]" /> Currently {lead.assignedToName}</span> : "Unassigned — no ownership changes recorded."}
          </p>
        ) : (
          <ol className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-2">
                <Avatar name={h.toUserName || "Unassigned"} size={22} />
                <div className="min-w-0">
                  <p className="text-[12px] text-foreground">
                    {h.fromUserName ? <><span className="text-muted-foreground">{h.fromUserName}</span> → </> : null}
                    <span className="font-medium">{h.toUserName || "Unassigned"}</span>
                    {h.assignedByName ? <span className="text-muted-foreground"> · by {h.assignedByName}</span> : null}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{fmt(h.createdAt)}{h.reason ? ` · ${h.reason}` : ""}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
