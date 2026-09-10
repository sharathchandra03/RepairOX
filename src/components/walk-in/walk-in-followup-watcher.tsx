"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up Watcher (global, headless)

   A tiny always-mounted component that watches EVERY walk-in for a follow-up
   whose scheduled date/time has just been crossed — regardless of which page
   the user is on — and fires the indication trio:

     • a toast (via the global toast channel)
     • a durable notification for the topbar bell (persisted)
     • the user's chosen notification sound (respects the on/off preference)

   Why global (not the Walk-In page): a follow-up can come due while the user is
   anywhere in the app. Living in the (app) layout means the watcher keeps
   ticking everywhere, so a crossed follow-up always produces an indication.

   De-dupe: each due event is keyed by walk-in id + its exact due timestamp, so
   a follow-up notifies EXACTLY ONCE, and rescheduling it (new time) is treated
   as a fresh event that can notify again. The key set is persisted to
   sessionStorage so navigating between pages / remounts doesn't re-fire.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { walkInDisplayId } from "@/lib/walk-in-data";
import { followUpDueAt, isFollowUpDue, type WalkIn } from "@/lib/mock-data";
import { notify } from "@/lib/notifications";
import { toast } from "@/components/ui/toaster";
import { useWalkInSound, playWalkInSound } from "@/lib/walk-in-notification-sound";

const SESSION_KEY = "repairox-walkin-followup-fired";

/** A stable key for a specific due event (id + due instant). */
function dueKey(w: WalkIn): string {
  const due = followUpDueAt(w);
  return `${w.id}@${due ? due.getTime() : 0}`;
}

function loadFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(fired))); } catch { /* quota */ }
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

  const firedRef = useRef<Set<string>>(loadFired());

  useEffect(() => {
    const check = () => {
      const asOf = new Date();
      let changed = false;
      for (const w of walkInsRef.current) {
        // Only pending (not completed) follow-ups whose time has arrived.
        if (!isFollowUpDue(w, asOf)) continue;
        // A follow-up the user already acknowledged (read) shouldn't re-alert.
        if (w.followUpReadAt) continue;
        const key = dueKey(w);
        if (firedRef.current.has(key)) continue;

        firedRef.current.add(key);
        changed = true;

        const who = w.customer || walkInDisplayId(w);
        toast.info("Walk-In follow-up due", {
          description: `${who} · ${walkInDisplayId(w)}${w.model ? ` · ${w.model}` : ""}`,
          action: {
            label: "Open Walk-In",
            onClick: () => { window.location.href = `/walk-in?walkIn=${encodeURIComponent(w.id)}`; },
          },
        });
        notify({
          kind: "generic",
          title: "Walk-In follow-up due",
          body: `${who} · ${walkInDisplayId(w)}${w.model ? ` · ${w.model}` : ""}`,
          href: `/walk-in?walkIn=${encodeURIComponent(w.id)}`,
          reference: walkInDisplayId(w),
          recipientId: w.salesPersonId || undefined,
        });
        playWalkInSound(soundPrefsRef.current);
      }
      if (changed) saveFired(firedRef.current);
    };

    // Check immediately on mount (catches follow-ups already crossed while the
    // app was closed), then on a light interval + when the tab refocuses.
    check();
    const id = setInterval(check, 20_000);
    const onFocus = () => check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
