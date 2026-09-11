"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up Engine — ONE source of truth for "which follow-ups are due
   right now", plus a precise, event-driven clock.

   The problem this solves: the global notification bell and the Walk-In bell
   used to run on two independent polling cadences (5s watcher / 60s bell),
   which made a follow-up appear in one bell up to ~30–40s before the other, and
   made a due follow-up surface a minute late instead of at its exact time.

   The fix: a single shared reactive "clock" (useSyncExternalStore) that is
   advanced by setTimeout timers scheduled to the EXACT due instant of the next
   pending follow-up — not by a fixed interval. Every consumer (both bells, the
   headless watcher) reads the same clock, so when a follow-up crosses its time
   they ALL re-render on the same tick. There is exactly one due event, observed
   simultaneously everywhere. A light safety interval (and focus/visibility
   re-checks) covers sleep/wake and clock drift without being the primary driver.

   State (read / completed) still lives ON the walk-in record via the store, so
   this module holds no parallel notification store — it only decides "is the
   configured date/time reached yet?" against a shared, precise clock.
   ────────────────────────────────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";
import { followUpDueAt, isFollowUpDue, hasActiveFollowUp, type WalkIn } from "@/lib/mock-data";

/* ─── Shared reactive clock ──────────────────────────────────────────────── */

let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
let safetyInterval: ReturnType<typeof setInterval> | null = null;
let dueInstants: number[] = [];

function emitClock() {
  clockNow = Date.now();
  for (const l of clockListeners) l();
}

/** Reschedule the precise timer to fire at the NEXT future due instant. */
function rescheduleTimer() {
  if (typeof window === "undefined") return;
  if (scheduledTimer) { clearTimeout(scheduledTimer); scheduledTimer = null; }
  const now = Date.now();
  const next = dueInstants.filter((t) => t > now).sort((a, b) => a - b)[0];
  if (next == null) return;
  // Cap the delay so a very-far-future follow-up still gets periodic re-checks
  // (and to stay within setTimeout's 32-bit range).
  const delay = Math.min(Math.max(next - now, 0) + 50, 60_000);
  scheduledTimer = setTimeout(() => {
    emitClock();
    rescheduleTimer();
  }, delay);
}

/**
 * Feed the engine the current set of pending follow-up due instants so it can
 * schedule a precise timer to the soonest one. Called by the headless watcher
 * whenever the walk-in dataset changes. Idempotent.
 */
export function syncFollowUpDueInstants(instants: number[]) {
  dueInstants = instants;
  rescheduleTimer();
}

function ensureRunning() {
  if (typeof window === "undefined" || safetyInterval) return;
  // Safety net for sleep/wake + drift; the precise timer is the primary driver.
  safetyInterval = setInterval(emitClock, 30_000);
  const onWake = () => { emitClock(); rescheduleTimer(); };
  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onWake);
}

function subscribeClock(cb: () => void): () => void {
  ensureRunning();
  clockListeners.add(cb);
  return () => { clockListeners.delete(cb); };
}
function getClock(): number { return clockNow; }
function getServerClock(): number { return 0; }

/** Shared "now" that ticks precisely when a follow-up becomes due. */
export function useFollowUpClock(): number {
  return useSyncExternalStore(subscribeClock, getClock, getServerClock);
}

/* ─── Shared due-list derivation (identical everywhere) ──────────────────── */

/** All pending follow-up due instants (ms) for the given walk-ins. */
export function collectDueInstants(walkIns: WalkIn[]): number[] {
  const out: number[] = [];
  for (const w of walkIns) {
    if (!hasActiveFollowUp(w)) continue;
    const due = followUpDueAt(w);
    if (due) out.push(due.getTime());
  }
  return out;
}

/** Walk-ins whose follow-up is due right now (active only), soonest first. */
export function dueFollowUps(walkIns: WalkIn[], asOf: Date): WalkIn[] {
  return walkIns
    .filter((w) => hasActiveFollowUp(w) && isFollowUpDue(w, asOf))
    .sort((a, b) => (followUpDueAt(a)?.getTime() ?? 0) - (followUpDueAt(b)?.getTime() ?? 0));
}
