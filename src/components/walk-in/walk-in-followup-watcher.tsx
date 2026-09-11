"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up Watcher (global, headless)

   The single "due detector" for walk-in follow-ups. Always mounted in the (app)
   layout so a follow-up coming due is detected on ANY page. It:

     • feeds every pending follow-up's exact due instant to the shared follow-up
       engine, which schedules a precise timer to the soonest one (so a follow-up
       set for 3:30 PM fires AT 3:30 PM — not on a 60s poll boundary);
     • reads the SAME shared clock every consumer reads, so when a follow-up
       crosses its time the durable notification, the global bell and the Walk-In
       bell all update on the same tick (no 30–40s gap between them);
     • on each NEWLY-due follow-up, fires the indication trio exactly ONCE:
         – a durable, user-targeted notification (topbar bell feed),
         – a toast,
         – the user's chosen notification sound.

   "New" is keyed by (walk-in id + exact due instant). Rescheduling to a new time
   yields a new key, so a rescheduled follow-up alerts again — but a follow-up
   that merely stays unread does NOT re-play the sound or re-toast. The durable
   notification is what the user acknowledges; the walk-in's own followUpReadAt /
   completion silences it in the bells.

   De-dupe is persisted (per browser) so reopening the app doesn't replay sounds
   for already-announced due events, while a genuinely new due event still fires.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef } from "react";
import { useStore } from "@/lib/store";
import { walkInDisplayId } from "@/lib/walk-in-data";
import { followUpDueAt, hasActiveFollowUp, isFollowUpDue, type WalkIn } from "@/lib/mock-data";
import { notify, hasNotification } from "@/lib/notifications";
import { toast } from "@/components/ui/toaster";
import { useWalkInSound, playWalkInSound } from "@/lib/walk-in-notification-sound";
import { useFollowUpClock, syncFollowUpDueInstants, collectDueInstants } from "@/lib/walk-in-followup-engine";

const ANNOUNCED_KEY = "repairox-walkin-followup-announced";

/* MODULE-LEVEL announced set (shared across ALL watcher mounts, including React
   StrictMode's double-mount in dev). A per-component-instance ref was the root
   cause of duplicate ("3 at once") notifications: each mount re-loaded a stale
   snapshot from localStorage before the first save, so the same due event was
   announced multiple times. A single module-level set makes announcing a due
   event idempotent regardless of how many times the effect runs or remounts. */
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
  try {
    // Keep the list bounded — only the most recent 200 keys matter.
    localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(Array.from(announced).slice(-200)));
  } catch { /* quota */ }
}

/** A stable key for a specific due event (id + due instant). Rescheduling to a
    new time yields a new key, so it can alert again. */
function dueKey(w: WalkIn): string {
  const due = followUpDueAt(w);
  return `${w.id}@${due ? due.getTime() : 0}`;
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

export function WalkInFollowUpWatcher() {
  const { walkIns } = useStore();
  const { prefs: soundPrefs } = useWalkInSound();
  const now = useFollowUpClock();

  const soundPrefsRef = useRef(soundPrefs);
  soundPrefsRef.current = soundPrefs;

  // Feed the engine every pending follow-up's due instant so it schedules a
  // precise timer to the soonest one. Recomputed whenever the dataset changes.
  const dueInstants = useMemo(() => collectDueInstants(walkIns), [walkIns]);
  useEffect(() => {
    syncFollowUpDueInstants(dueInstants);
  }, [dueInstants]);

  // On every shared-clock tick (fires exactly when a follow-up becomes due),
  // announce any NEWLY-due follow-up EXACTLY ONCE.
  useEffect(() => {
    const asOf = new Date(now);
    const seen = getAnnounced();
    let changed = false;

    for (const w of walkIns) {
      // Only active (not converted / lost / completed) follow-ups whose time has
      // arrived, and which have not been read/acknowledged yet.
      if (!hasActiveFollowUp(w)) continue;
      if (!isFollowUpDue(w, asOf)) continue;
      if (w.followUpReadAt) continue;

      const key = dueKey(w);
      // Two-layer idempotency: the module-level "announced" set (this session)
      // AND the durable notification store's dedupeKey (survives reloads). Either
      // one already knowing about this due event means we've handled it.
      if (seen.has(key) || hasNotification(key)) { seen.add(key); continue; }
      seen.add(key);
      changed = true;

      const who = w.customer || walkInDisplayId(w);
      const attempt = w.followUpAttempt ? `${ordinal(w.followUpAttempt)} Follow-Up · ` : "";
      const desc = `${who} · ${walkInDisplayId(w)}${w.model ? ` · ${w.model}` : ""}`;

      // ONE durable notification (idempotent via dedupeKey). The Walk-In bell
      // derives from the SAME walk-in record + shared clock, so both bells surface
      // it on this exact tick — one event, observed everywhere at once.
      notify({
        kind: "generic",
        title: `Walk-In follow-up due${w.followUpAttempt ? ` · ${ordinal(w.followUpAttempt)}` : ""}`,
        body: desc,
        href: `/walk-in?walkIn=${encodeURIComponent(w.id)}`,
        reference: walkInDisplayId(w),
        recipientId: w.salesPersonId || undefined,
        dedupeKey: key,
      });

      toast.info("Walk-In follow-up due", {
        description: `${attempt}${desc}`,
        duration: 8000,
        action: {
          label: "Open Walk-In",
          onClick: () => { window.location.href = `/walk-in?walkIn=${encodeURIComponent(w.id)}`; },
        },
      });

      // Sound plays ONCE because a NEW follow-up became due — never repeated
      // just because the notification remains unread.
      playWalkInSound(soundPrefsRef.current);
    }

    if (changed) persistAnnounced();
  }, [now, walkIns]);

  return null;
}
