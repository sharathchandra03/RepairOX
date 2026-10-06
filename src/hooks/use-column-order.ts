"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Data-Grid — PERSONAL COLUMN ORDER PREFERENCE (per-user, reusable)
   ────────────────────────────────────────────────────────────────────────
   Lets a user rearrange the VISIBLE columns of a dense RepairOX table and
   persists that order PER USER (never per org / per store / per role). This is
   a sibling of use-frozen-columns.ts — Column Order and Frozen Selection are
   TWO SEPARATE preferences and never overwrite each other.

   Structural anchors are honoured so reordering can never break the frozen
   data-grid layout:

     • a LEFT anchor  (lockedLeft, e.g. Lead ID / Date) always stays leftmost.
     • a RIGHT anchor (lockedRight, e.g. Last Action)  always stays rightmost.
     • non-anchor columns can be freely reordered between the two anchors.

   The preference stores STABLE column IDs (not display labels), so renaming a
   column label later keeps the saved order working. Saved orders are validated
   against the CURRENT canonical column list every load:

     • obsolete ids (a column that no longer exists) are dropped safely.
     • brand-new canonical columns are APPENDED in their canonical position so a
       future column is never hidden forever by an old saved preference.

   PERSISTENCE (dual-mode, matches use-lead-kanban.ts):
     • Supabase mode → the `user_table_preferences` row is the SOURCE OF TRUTH
       so the layout follows the user across browsers/devices. localStorage is
       kept as a fast cache (instant paint on reload, offline fallback).
     • Local mode    → localStorage is the home (legacy behaviour).
   One user's order never affects another.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridColumn } from "@/hooks/use-frozen-columns";
import {
  readLocal, writeLocal, loadServerPref, saveServerPref, isSupabaseConfigured,
} from "@/lib/table-preferences-store";

export type ColumnOrderState = {
  /** The effective order of ALL columns (stable keys), anchors enforced. */
  orderedKeys: string[];
  /** Columns in the user's effective order (anchors enforced). */
  orderedColumns: GridColumn[];
  /** Apply a new order for the MOVABLE columns (anchors are re-pinned). */
  setOrder: (movableKeys: string[]) => void;
  /** Reset to the canonical default order. */
  reset: () => void;
  /** True when the current order differs from the canonical default. */
  isCustomized: boolean;
  /** True once the authoritative load has completed (avoids SSR/hydration). */
  hydrated: boolean;
};

const STORAGE_PREFIX = "repairox-column-order::";

/* A column is user-MOVABLE when it is not a locked anchor and not explicitly
   marked non-reorderable (structural columns such as a selection checkbox or a
   conditional Store column stay pinned at their canonical position). */
function isMovable(c: GridColumn): boolean {
  return !c.lockedLeft && !c.lockedRight && c.reorderable !== false;
}

/* The canonical movable-key order. This is the single source of truth for the
   "default order" the user can rearrange. */
function canonicalMovableKeys(columns: GridColumn[]): string[] {
  return columns.filter(isMovable).map((c) => c.key);
}

/* Reconcile a saved movable-key list against the current canonical columns:
   keep the saved order for keys that still exist, drop obsolete keys, then
   APPEND any new canonical movable keys in canonical position. */
function reconcileMovable(saved: string[] | null, columns: GridColumn[]): string[] {
  const canonical = canonicalMovableKeys(columns);
  if (!saved || saved.length === 0) return canonical;
  const canonicalSet = new Set(canonical);
  const kept = saved.filter((k) => canonicalSet.has(k));
  const keptSet = new Set(kept);
  const appended = canonical.filter((k) => !keptSet.has(k));
  return [...kept, ...appended];
}

function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** DB save debounce (ms). Matches lead-kanban's 400ms. */
const SAVE_DEBOUNCE = 400;

/**
 * @param tableKey  A stable id for this table (e.g. "lead_table").
 * @param userId    The signed-in user's id (per-user isolation). null → anon.
 * @param columns   The table's columns in CANONICAL visual order (anchors
 *                  flagged lockedLeft / lockedRight).
 */
export function useColumnOrder(
  tableKey: string,
  userId: string | null | undefined,
  columns: GridColumn[],
): ColumnOrderState {
  const [movableOrder, setMovableOrder] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Prevent the persist effect from firing before the authoritative load has
  // completed for THIS user key (stops an initial default from overwriting a
  // server-side preference, the same race guard as use-lead-kanban.ts).
  const loadedForKeyRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Hydrate on mount / when the user changes ──────────────────────────
     In Supabase mode we load server-first (the source of truth), falling back
     to the localStorage cache, then canonical defaults. In local mode we read
     localStorage directly. In Supabase mode we WAIT for a real authenticated
     userId (same guard as use-lead-kanban) so a fleeting "anon" pass never
     seeds/overwrites the real layout. */
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    loadedForKeyRef.current = null;

    if (isSupabaseConfigured && (userId === null || userId === undefined)) {
      return () => { cancelled = true; };
    }

    (async () => {
      let saved: string[] | null = null;

      if (isSupabaseConfigured) {
        // Server-first: the DB row is authoritative.
        const server = await loadServerPref(tableKey, "columnOrder");
        if (cancelled) return;
        if (server !== undefined) {
          // server === null means "authenticated, no saved value" → use default.
          // server === string[] → the saved order.
          saved = server;
        } else {
          // Couldn't reach server → use localStorage cache.
          saved = readLocal(STORAGE_PREFIX, tableKey, userId);
        }
        // Migrate: if server had nothing but localStorage has a value, push it
        // up so it's durable cross-device from now on.
        if (server === null) {
          const local = readLocal(STORAGE_PREFIX, tableKey, userId);
          if (local && local.length > 0) {
            saved = local;
            void saveServerPref(tableKey, "columnOrder", local);
          }
        }
      } else {
        // Local mode.
        saved = readLocal(STORAGE_PREFIX, tableKey, userId);
      }

      if (cancelled) return;
      setMovableOrder(reconcileMovable(saved, columns));
      loadedForKeyRef.current = `${tableKey}::${userId ?? "anon"}`;
      setHydrated(true);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, userId]);

  // If the canonical columns change shape while mounted (e.g. the multi-store
  // Store column appears), re-reconcile so new columns appear and obsolete ones
  // drop — without losing the user's arrangement.
  useEffect(() => {
    if (!hydrated) return;
    setMovableOrder((prev) => {
      const next = reconcileMovable(prev, columns);
      return sameOrder(prev, next) ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, hydrated]);

  /* ── Persist on change ──
     Only after the authoritative load for THIS user key finished. Writes
     localStorage immediately (fast cache) and debounces the server write. When
     the order equals the canonical default we clear both stores. */
  useEffect(() => {
    if (!hydrated) return;
    const currentKey = `${tableKey}::${userId ?? "anon"}`;
    if (loadedForKeyRef.current !== currentKey) return;

    const canonical = canonicalMovableKeys(columns);
    const isDefault = sameOrder(movableOrder, canonical);
    const payload = isDefault ? null : movableOrder;

    // localStorage: immediate (fast cache / local-mode home).
    writeLocal(STORAGE_PREFIX, tableKey, userId, payload);

    // Server: debounced (avoids rapid-fire writes on multi-step drags).
    if (isSupabaseConfigured) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const snapshot = payload;
      saveTimerRef.current = setTimeout(() => {
        void saveServerPref(tableKey, "columnOrder", snapshot);
      }, SAVE_DEBOUNCE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movableOrder, hydrated, tableKey, userId]);

  // Flush any pending debounced save on unmount.
  useEffect(
    () => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); },
    [],
  );

  // The effective full order. Walk the CANONICAL column layout: locked + non-
  // movable columns keep their slot; each MOVABLE slot is filled from the
  // user's reconciled movable order.
  const orderedKeys = useMemo(() => {
    const movable = reconcileMovable(movableOrder, columns);
    let m = 0;
    return columns.map((c) => (isMovable(c) ? movable[m++] ?? c.key : c.key));
  }, [movableOrder, columns]);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return orderedKeys.map((k) => byKey.get(k)).filter((c): c is GridColumn => !!c);
  }, [orderedKeys, columns]);

  const isCustomized = useMemo(
    () => !sameOrder(reconcileMovable(movableOrder, columns), canonicalMovableKeys(columns)),
    [movableOrder, columns],
  );

  const setOrder = useCallback(
    (movableKeys: string[]) => {
      const canonicalSet = new Set(canonicalMovableKeys(columns));
      const cleaned = movableKeys.filter((k) => canonicalSet.has(k));
      setMovableOrder(reconcileMovable(cleaned, columns));
    },
    [columns],
  );

  const reset = useCallback(() => setMovableOrder(canonicalMovableKeys(columns)), [columns]);

  return { orderedKeys, orderedColumns, setOrder, reset, isCustomized, hydrated };
}
