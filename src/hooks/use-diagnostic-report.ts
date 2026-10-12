"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — useDiagnosticReport: lightweight "a Diagnostic Report was
   generated for this ticket" marker.

   A Diagnostic Report (the post-QC document with a free-text Device Condition
   comment) is NOT persisted — its comment lives only in the print URL. But the
   client wants a MENTION on View Ticket that a diagnostic report was generated.

   There is no DB table for this, so (exactly like use-lead-temperature.ts) the
   marker is persisted in localStorage keyed by TICKET id (org-shared — every
   authorized viewer of the ticket sees the same marker). The stored value is a
   map { ticketId → { ticketId, generatedAt } }. We record THAT a report was
   generated and WHEN — never the comment content.

   The hook mirrors the dual-mode shape (SSR-safe readAll/writeAll + a same-tab
   CustomEvent + a cross-tab storage listener + a `hydrated` flag) so it can be
   promoted to a DB table later WITHOUT changing this surface.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "repairox-diagnostic-reports";
/** Broadcast within the tab so multiple mounts stay in sync without a reload. */
const SYNC_EVENT = "repairox:diagnostic-reports";

export interface DiagnosticReportMarker {
  ticketId: string;
  /** ISO timestamp of the most recent generation. */
  generatedAt: string;
}

type MarkerMap = Record<string, DiagnosticReportMarker>;

function readAll(): MarkerMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as MarkerMap) : {};
  } catch {
    return {};
  }
}

function writeAll(markers: MarkerMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  } catch {
    /* ignore quota */
  }
}

/**
 * Record (SSR-safe, idempotent) that a Diagnostic Report was generated for a
 * ticket, WITHOUT needing the React hook. This is the single choke point the
 * entry page calls on "Create Diagnostic Report". Re-generating updates the
 * `generatedAt` timestamp. Mounted hooks in the same tab refresh via the sync
 * event dispatched by `writeAll`.
 */
export function markDiagnosticReportGenerated(ticketId: string): void {
  if (!ticketId || typeof window === "undefined") return;
  const all = readAll();
  all[ticketId] = { ticketId, generatedAt: new Date().toISOString() };
  writeAll(all);
}

export interface UseDiagnosticReportResult {
  /** Whether the store has loaded from localStorage (avoids SSR flash). */
  hydrated: boolean;
  /** True when a diagnostic report has been generated for this ticket. */
  hasReport: (ticketId: string) => boolean;
  /** ISO timestamp of the latest generation for this ticket (or undefined). */
  generatedAt: (ticketId: string) => string | undefined;
  /** Record a generation for this ticket (append/update the marker). */
  mark: (ticketId: string) => void;
}

export function useDiagnosticReport(): UseDiagnosticReportResult {
  const [markers, setMarkers] = useState<MarkerMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMarkers(readAll());
    setHydrated(true);
    const onSync = () => setMarkers(readAll());
    window.addEventListener(SYNC_EVENT, onSync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) onSync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const hasReport = useCallback((ticketId: string) => !!markers[ticketId], [markers]);
  const generatedAt = useCallback(
    (ticketId: string) => markers[ticketId]?.generatedAt,
    [markers],
  );
  const mark = useCallback((ticketId: string) => {
    markDiagnosticReportGenerated(ticketId);
    setMarkers(readAll());
  }, []);

  return { hydrated, hasReport, generatedAt, mark };
}
