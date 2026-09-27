"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Lead Follow-Up Engine — the precise, event-driven clock for LEAD follow-ups.

   This mirrors the proven Walk-In follow-up engine (`walk-in-followup-engine.ts`)
   so lead follow-ups get the SAME behaviour: a due follow-up surfaces at its
   EXACT scheduled instant (a 6:00 PM follow-up fires at 6:00 PM, and reads
   Overdue from 6:00:01 PM) instead of on a coarse polling boundary.

   How it works — a single shared reactive "clock" (useSyncExternalStore) that is
   advanced by a setTimeout scheduled to the EXACT next pending due instant (not
   a fixed interval). A light safety interval + focus/visibility re-checks cover
   sleep/wake and clock drift. Every consumer that reads `useLeadFollowUpClock()`
   re-renders on the same tick when a follow-up crosses its time.

   State (scheduled / completed / cancelled) lives in the structured
   lead_followup_history records via the leads context — this module holds NO
   parallel store. It only decides "has this due instant been reached yet?"
   against a shared, precise clock. It is intentionally SEPARATE from the walk-in
   engine's module-level timer so the two never clobber each other's due list.
   ────────────────────────────────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";
import { followUpLifecycle, type LeadFollowUp } from "@/lib/leads-data";

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
 * schedule a precise timer to the soonest one. Called by the headless lead
 * watcher whenever the follow-up dataset changes. Idempotent.
 *
 * Emits an immediate clock tick whenever the set changes, so a follow-up whose
 * time is ALREADY PAST (e.g. rescheduled to an earlier time) is evaluated right
 * away rather than sitting until a later tick.
 */
let lastSynced: string | null = null;
export function syncLeadFollowUpDueInstants(instants: number[]) {
  dueInstants = instants;
  rescheduleTimer();
  const sig = [...instants].sort((a, b) => a - b).join(",");
  if (sig !== lastSynced) {
    lastSynced = sig;
    emitClock();
  }
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

/** Shared "now" that ticks precisely when a lead follow-up becomes due. */
export function useLeadFollowUpClock(): number {
  return useSyncExternalStore(subscribeClock, getClock, getServerClock);
}

/* ─── Shared due-list derivation ─────────────────────────────────────────── */

/** All pending (scheduled) follow-up due instants (ms) for the given records. */
export function collectLeadDueInstants(followUps: LeadFollowUp[]): number[] {
  const out: number[] = [];
  for (const fu of followUps) {
    if (fu.status !== "scheduled") continue;
    const t = new Date(fu.dueAt).getTime();
    if (!isNaN(t)) out.push(t);
  }
  return out;
}

/** Scheduled follow-ups that are currently Due or Overdue as of `asOf`. */
export function dueLeadFollowUps(followUps: LeadFollowUp[], asOf: number): LeadFollowUp[] {
  return followUps.filter((fu) => {
    if (fu.status !== "scheduled") return false;
    const state = followUpLifecycle(fu, asOf);
    return state === "Due" || state === "Overdue";
  });
}
