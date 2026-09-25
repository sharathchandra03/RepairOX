"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Lead Follow-Up Watcher (global, headless)

   The single "due detector" for LEAD follow-ups. Mounted in the (app) layout so
   a scheduled lead follow-up coming due is detected on any page. On each newly
   Due (and, once, Overdue) follow-up it fires exactly ONE durable, user-targeted
   notification through the SHARED notifications feed (no separate system) plus a
   toast — addressed to the follow-up agent, falling back to the lead owner.

   Reuses `notify()` (the same bell feed Field/Walk-In use). Idempotency is via
   the notification dedupeKey PLUS a persisted announced-set, so reopening the
   app never replays an already-announced due event, while a genuinely new/
   rescheduled follow-up (new due instant) alerts again.

   Completing a follow-up NEVER changes the lead's status — this watcher only
   surfaces that an activity is due.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { notify, hasNotification } from "@/lib/notifications";
import { toast } from "@/components/ui/toaster";
import { followUpLifecycle, type LeadFollowUp } from "@/lib/leads-data";

const ANNOUNCED_KEY = "repairox-lead-followup-announced";

let announced: Set<string> | null = null;

function getAnnounced(): Set<string> {
  if (announced) return announced;
  if (typeof window === "undefined") { announced = new Set(); return announced; }
  try {
    const raw = localStorage.getItem(ANNOUNCED_KEY);
    announced = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { announced = new Set(); }
  return announced;
}

function persistAnnounced() {
  if (!announced) return;
  try { localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(Array.from(announced).slice(-200))); }
  catch { /* quota */ }
}

/** A stable key per due event: follow-up id + its due instant + lifecycle. A
 *  reschedule (new dueAt) or the transition Due→Overdue yields a new key so it
 *  can alert again, but an unchanged pending follow-up does not re-fire. */
function dueKey(fu: LeadFollowUp, state: string): string {
  return `lead-fu:${fu.id}@${new Date(fu.dueAt).getTime()}:${state}`;
}

export function LeadFollowUpWatcher() {
  const { followUps, leads } = useLeads();
  const { id: currentUserId } = useSession();
  // 30s heartbeat so a follow-up crossing its due time is picked up even
  // without a data change. (Lead follow-ups are date/time, not sub-minute.)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const seen = getAnnounced();
    let changed = false;

    for (const fu of followUps) {
      if (fu.status !== "scheduled") continue;
      const state = followUpLifecycle(fu);            // Pending | Due | Overdue
      if (state !== "Due" && state !== "Overdue") continue;

      // Address the follow-up agent, else the lead owner.
      const lead = leads.find((l) => l.id === fu.leadId);
      const recipientId = fu.followUpUserId || lead?.assignedTo || undefined;
      // Only announce in the recipient's own session (mirrors assignment).
      if (currentUserId && recipientId && recipientId !== currentUserId) continue;

      const key = dueKey(fu, state);
      if (seen.has(key) || hasNotification(key)) { seen.add(key); continue; }
      seen.add(key);
      changed = true;

      const who = lead?.name || lead?.leadNo || "Lead";
      const ref = lead?.leadNo || fu.leadId;
      const href = `/leads/list?lead=${encodeURIComponent(fu.leadId)}`;

      notify({
        kind: state === "Overdue" ? "lead_followup_overdue" : "lead_followup_due",
        title: state === "Overdue" ? "Lead follow-up overdue" : "Lead follow-up due",
        body: `${ref} · ${who} — Follow-up #${fu.seq}${fu.comments ? ` · ${fu.comments}` : ""}.`,
        href,
        reference: ref,
        recipientId,
        followUpId: fu.id,
        dedupeKey: key,
      });

      toast.info(state === "Overdue" ? "Lead follow-up overdue" : "Lead follow-up due", {
        description: `${ref} · ${who} — Follow-up #${fu.seq}`,
        duration: 8000,
        action: { label: "Open Lead", onClick: () => { window.location.href = href; } },
      });
    }

    if (changed) persistAnnounced();
  }, [followUps, leads, currentUserId, tick]);

  return null;
}
