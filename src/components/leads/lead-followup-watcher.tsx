"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Lead Follow-Up Watcher (global, headless)

   The single "due detector" for LEAD follow-ups. Mounted in the (app) layout so
   a scheduled lead follow-up coming due is detected on any page. It reuses the
   PROVEN Walk-In follow-up architecture:

     • the precise, event-driven clock (`useLeadFollowUpClock`) so a follow-up
       set for 6:00 PM fires AT 6:00 PM — not on a coarse poll boundary — and
       reads Overdue immediately after (datetime-precise, see followUpLifecycle);
     • on each newly Due (and, once, Overdue) follow-up it fires the same
       indication trio Walk-In uses, addressed to the RESPONSIBLE user
       (follow-up agent, else the lead owner):
         – ONE durable, user-targeted notification (shared topbar bell feed),
         – a toast,
         – the user's chosen notification SOUND (the SAME per-user Walk-In sound
           preference — no duplicate global sound setting).

   Idempotency is two-layer: the notification store's `dedupeKey` PLUS a
   persisted announced-set, so reopening the app never replays an already-
   announced due event, while a genuinely new/rescheduled follow-up (new due
   instant) — or the Due→Overdue transition — alerts again.

   Completing a follow-up NEVER changes the lead's status — this watcher only
   surfaces that an activity is due.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef } from "react";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { notify, hasNotification } from "@/lib/notifications";
import { toast } from "@/components/ui/toaster";
import { useWalkInSound, playWalkInSound } from "@/lib/walk-in-notification-sound";
import { followUpLifecycle, type LeadFollowUp } from "@/lib/leads-data";
import {
  useLeadFollowUpClock, syncLeadFollowUpDueInstants, collectLeadDueInstants,
} from "@/lib/lead-followup-engine";

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
  const { prefs: soundPrefs } = useWalkInSound();
  const now = useLeadFollowUpClock();

  const soundPrefsRef = useRef(soundPrefs);
  soundPrefsRef.current = soundPrefs;

  // Feed the engine every scheduled follow-up's due instant so it schedules a
  // precise timer to the soonest one. Recomputed whenever the dataset changes.
  const dueInstants = useMemo(() => collectLeadDueInstants(followUps), [followUps]);
  useEffect(() => {
    syncLeadFollowUpDueInstants(dueInstants);
  }, [dueInstants]);

  // On every shared-clock tick (fires exactly when a follow-up becomes due),
  // announce any NEWLY Due/Overdue follow-up EXACTLY ONCE — to its responsible
  // user's own session.
  useEffect(() => {
    const asOf = now;
    const seen = getAnnounced();
    let changed = false;

    for (const fu of followUps) {
      if (fu.status !== "scheduled") continue;
      const state = followUpLifecycle(fu, asOf);          // Pending | Due | Overdue
      if (state !== "Due" && state !== "Overdue") continue;

      // Address the follow-up agent, else the lead owner. Only announce in the
      // recipient's own session (do NOT notify every user — §9).
      const lead = leads.find((l) => l.id === fu.leadId);
      const recipientId = fu.followUpUserId || lead?.assignedTo || undefined;
      if (currentUserId && recipientId && recipientId !== currentUserId) continue;

      const key = dueKey(fu, state);
      if (seen.has(key) || hasNotification(key)) { seen.add(key); continue; }
      seen.add(key);
      changed = true;

      const who = lead?.name || lead?.leadNo || "Lead";
      const ref = lead?.leadNo || fu.leadId;
      const href = `/leads/list?lead=${encodeURIComponent(fu.leadId)}`;
      const title = state === "Overdue" ? "Lead follow-up overdue" : "Lead follow-up due";

      // ONE durable notification (idempotent via dedupeKey) into the SAME shared
      // bell feed Field/Walk-In use — no separate lead notification system.
      notify({
        kind: state === "Overdue" ? "lead_followup_overdue" : "lead_followup_due",
        title,
        body: `${ref} · ${who} — Follow-up #${fu.seq}${fu.comments ? ` · ${fu.comments}` : ""}.`,
        href,
        reference: ref,
        recipientId,
        followUpId: fu.id,
        dedupeKey: key,
      });

      toast.info(title, {
        description: `${ref} · ${who} — Follow-up #${fu.seq}`,
        duration: 8000,
        action: { label: "Open Lead", onClick: () => { window.location.href = href; } },
      });

      // The user's chosen notification sound — the SAME per-user preference the
      // Walk-In follow-up uses. Respects the enabled flag inside playWalkInSound.
      playWalkInSound(soundPrefsRef.current);
    }

    if (changed) persistAnnounced();
  }, [now, followUps, leads, currentUserId]);

  return null;
}
