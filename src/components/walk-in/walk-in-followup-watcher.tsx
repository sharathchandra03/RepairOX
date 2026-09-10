"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up Watcher (global, headless)

   A tiny always-mounted component that watches EVERY walk-in for a follow-up
   whose scheduled date/time has been crossed — regardless of which page the
   user is on — and fires the indication trio:

     • a toast (via the global toast channel)
     • a durable notification for the topbar bell (persisted)
     • the user's chosen notification sound (respects the on/off preference)

   Why global (not the Walk-In page): a follow-up can come due while the user is
   anywhere in the app. Living in the (app) layout means the watcher keeps
   ticking everywhere, so a crossed follow-up always produces an indication.

   De-dupe is IN-MEMORY (per page load): a follow-up alerts once per session,
   and rescheduling it (new due time) alerts again. It deliberately does NOT
   persist the "fired" set — that way a due-but-unacknowledged follow-up is
   re-surfaced when the app is reopened, so it can't be silently missed. The
   walk-in's own `followUpReadAt` / completion is what permanently silences it.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { walkInDisplayId } from "@/lib/walk-in-data";
import { followUpDueAt, isFollowUpDue, type WalkIn } from "@/lib/mock-data";
import { notify } from "@/lib/notifications";
import { toast } from "@/components/ui/toaster";
import { useWalkInSound, playWalkInSound } from "@/lib/walk-in-notification-sound";

/** A stable key for a specific due event (id + due instant). Rescheduling to a
    new time yields a new key, so it can alert again. */
function dueKey(w: WalkIn): string {
  const due = followUpDueAt(w);
  return `${w.id}@${due ? due.getTime() : 0}`;
}

export function WalkInFollowUpWatcher() {
  const { walkIns } = useStore();
  const { prefs: soundPrefs } = useWalkInSound();

  // Keep the latest walk-ins + sound prefs in refs so the interval closure
  // always sees current data without re-subscribing the timer.
  const walkInsRef = useRef(walkIns);
  walkInsRef.current = walkIns;
  const soundPrefsRef = useRef(soundPrefs);
  soundPrefsRef.current = soundPrefs;

  /* Per due-event bookkeeping: the last time we alerted for it. A due + UNREAD
     follow-up is re-alerted on a repeating cadence so it can't be missed — it
     keeps notifying until the user marks it read / complete. Once acknowledged
     (followUpReadAt set) it's dropped and never re-alerts. */
  const lastAlertRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // How often to RE-alert an unread, still-due follow-up (ms).
    const REALERT_EVERY = 60_000;

    const check = () => {
      const asOf = new Date();
      const nowMs = asOf.getTime();
      const activeKeys = new Set<string>();

      for (const w of walkInsRef.current) {
        // Only pending (not completed) follow-ups whose time has arrived.
        if (!isFollowUpDue(w, asOf)) continue;
        // Acknowledged (read) → never alert again.
        if (w.followUpReadAt) continue;

        const key = dueKey(w);
        activeKeys.add(key);

        const last = lastAlertRef.current.get(key);
        const firstAlert = last === undefined;
        // Alert if we've never alerted this event, or the re-alert window elapsed.
        if (!firstAlert && nowMs - last! < REALERT_EVERY) continue;
        lastAlertRef.current.set(key, nowMs);

        const who = w.customer || walkInDisplayId(w);
        const desc = `${who} · ${walkInDisplayId(w)}${w.model ? ` · ${w.model}` : ""}`;

        // Transient toast + sound repeat on every re-alert so it keeps nagging
        // until acknowledged.
        toast.info("Walk-In follow-up due", {
          description: desc,
          duration: 8000,
          action: {
            label: "Open Walk-In",
            onClick: () => { window.location.href = `/walk-in?walkIn=${encodeURIComponent(w.id)}`; },
          },
        });
        playWalkInSound(soundPrefsRef.current);

        // Durable topbar-bell notification is created ONCE per due event (not on
        // every re-alert) so the bell feed doesn't fill with duplicates.
        if (firstAlert) {
          notify({
            kind: "generic",
            title: "Walk-In follow-up due",
            body: desc,
            href: `/walk-in?walkIn=${encodeURIComponent(w.id)}`,
            reference: walkInDisplayId(w),
            recipientId: w.salesPersonId || undefined,
          });
        }
      }

      // Forget events that are no longer active (completed / read / rescheduled)
      // so a genuinely new due event can alert immediately.
      for (const key of Array.from(lastAlertRef.current.keys())) {
        if (!activeKeys.has(key)) lastAlertRef.current.delete(key);
      }
    };

    /* Poll on a short cadence so a follow-up crossing its time surfaces quickly,
       and so it catches the store finishing its async hydration (walkIns start
       empty, then populate). Also re-check on focus / tab visibility. */
    check();
    const fast = setInterval(check, 5_000);
    const onFocus = () => check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(fast);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
