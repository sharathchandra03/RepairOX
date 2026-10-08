"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — useLeadTemperature: append-only Lead Temperature history.

   Lead TEMPERATURE (buying intent, Hot/Warm/Cold) lives on the canonical lead
   as `lead.leadNature`. This hook adds the HISTORY of how that intent changed
   over time — reversible (Hot→Warm→Cold are all valid) and NEVER overwritten.

   There is no DB temperature-history table yet, so history is persisted in
   localStorage keyed by LEAD id (org-shared — every authorized viewer of the
   lead sees the same trail, exactly like the lead's status/assignment history).
   The hook mirrors the dual-mode shape of the other lead-history stores so it
   can be promoted to a DB table later WITHOUT changing this surface: the state
   shape (an array of LeadTemperatureEvent) is the API.

   The hook NEVER mutates canonical lead data. Recording a transition only
   appends an event; the authoritative current temperature is always read from
   `lead.leadNature`.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import {
  makeTemperatureEvent, temperatureLevel, type LeadTemperatureEvent,
} from "@/lib/lead-temperature";

const STORAGE_KEY = "repairox-lead-temperature-history";
/** Broadcast within the tab so multiple mounts (e.g. the page + a widget)
 *  stay in sync without a page reload. */
const SYNC_EVENT = "repairox:lead-temperature-history";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function readAll(): LeadTemperatureEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LeadTemperatureEvent[]) : [];
  } catch {
    return [];
  }
}

function writeAll(events: LeadTemperatureEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  } catch {
    /* ignore quota */
  }
}

/**
 * Append a REAL temperature transition to the shared (localStorage) history,
 * WITHOUT needing the React hook. This is the single choke point any lead-write
 * path (e.g. `updateLead` in leads-context, the detail drawer, the capture
 * flow, the Lead Table inline edit) can call so that EVERY change to
 * `lead.leadNature` is captured — not just changes made from the Temperature
 * section. Append-only and reversible: a Hot → Cold → Warm sequence keeps all
 * rows; nothing is overwritten.
 *
 * No-ops (returns null) when the raw value is unchanged, so the history never
 * fabricates progression. Mounted hooks in the same tab refresh via the sync
 * event dispatched by `writeAll`.
 */
export function recordTemperatureChange(args: {
  leadId: string;
  fromValue: string;
  toValue: string;
  changedBy: string;
  changedByName: string;
  reason?: string;
}): LeadTemperatureEvent | null {
  const from = (args.fromValue || "").trim();
  const to = (args.toValue || "").trim();
  if (!args.leadId || from === to) return null;
  // Dedupe an immediate duplicate of the SAME transition (e.g. a surface that
  // records with a reason, then updateLead's auto-record fires for the same
  // leadNature change). Within a short window the richer (reason-carrying)
  // first write wins and the second is skipped — history is never doubled.
  const existing = readAll();
  const recentDuplicate = existing.some(
    (e) =>
      e.leadId === args.leadId &&
      (e.fromValue || "") === from &&
      (e.toValue || "") === to &&
      Date.now() - new Date(e.changedAt).getTime() < 10_000,
  );
  if (recentDuplicate) return null;
  const event = makeTemperatureEvent({
    id: uid(),
    leadId: args.leadId,
    fromValue: from,
    toValue: to,
    changedBy: args.changedBy,
    changedByName: args.changedByName,
    reason: args.reason,
  });
  writeAll([...readAll(), event]);
  return event;
}

export interface UseLeadTemperatureResult {
  /** Whether the store has loaded from localStorage (avoids SSR flash). */
  hydrated: boolean;
  /** Every temperature event across all leads (newest-first). */
  all: LeadTemperatureEvent[];
  /** The lead's temperature transitions, OLDEST-first (timeline order). */
  historyFor: (leadId: string) => LeadTemperatureEvent[];
  /**
   * Record a REAL temperature transition for a lead. No-ops when the bucketed
   * level is unchanged (e.g. "Hot" → "Very Hot" if both map to `hot` AND the
   * raw value is identical) — a change is recorded whenever the raw leadNature
   * value differs. Returns the created event, or null when nothing changed.
   */
  recordChange: (args: {
    leadId: string;
    fromValue: string;
    toValue: string;
    changedBy: string;
    changedByName: string;
    reason?: string;
  }) => LeadTemperatureEvent | null;
}

export function useLeadTemperature(): UseLeadTemperatureResult {
  const [events, setEvents] = useState<LeadTemperatureEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEvents(readAll());
    setHydrated(true);
    const onSync = () => setEvents(readAll());
    window.addEventListener(SYNC_EVENT, onSync);
    // Cross-tab updates.
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) onSync();
    });
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener("storage", onSync as EventListener);
    };
  }, []);

  const historyFor = useCallback(
    (leadId: string) =>
      events
        .filter((e) => e.leadId === leadId)
        .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()),
    [events],
  );

  const recordChange = useCallback<UseLeadTemperatureResult["recordChange"]>((args) => {
    // Delegate to the shared choke point so the hook and any non-React writer
    // (e.g. updateLead in leads-context) append through identical logic.
    const event = recordTemperatureChange(args);
    if (event) setEvents(readAll());
    return event;
  }, []);

  return { hydrated, all: events, historyFor, recordChange };
}

/** Convenience: the latest known temperature VALUE for a lead from its history
 *  (falls back to "" when none). Useful for reconciling a seed event. */
export function latestTemperatureValue(history: LeadTemperatureEvent[]): string {
  if (history.length === 0) return "";
  return history[history.length - 1].toValue;
}

export { temperatureLevel };
