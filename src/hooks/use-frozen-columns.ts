"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Data-Grid — FROZEN COLUMN PREFERENCE (per-user, reusable)
   ────────────────────────────────────────────────────────────────────────
   Manages which columns a dense RepairOX table freezes horizontally. Every
   grid has exactly TWO mandatory structural anchors that can NEVER be
   unfrozen:

     • one LEFT anchor  (e.g. Lead ID)  — identity, pinned to the left edge
     • one RIGHT anchor (e.g. Last Action) — actions, pinned to the right edge

   In addition, the user may freeze extra columns from the BEGINNING of the
   table onto the LEFT side (Lead ID | Date | Agent | … | scroll … | Actions).
   We never freeze an arbitrary middle column between two scrolling regions —
   the left frozen block is always a contiguous prefix of the columns.

   PERSISTENCE (dual-mode, matches use-column-order.ts / use-lead-kanban.ts):
     • Supabase mode → the `user_table_preferences.frozen_columns` row is the
       SOURCE OF TRUTH so the layout follows the user across browsers/devices.
       localStorage is kept as a fast cache.
     • Local mode    → localStorage is the home (legacy behaviour).
   One user's freeze config never affects another user.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readLocal, writeLocal, loadServerPref, saveServerPref, isSupabaseConfigured,
} from "@/lib/table-preferences-store";

/** A single column the grid can render (and optionally freeze). */
export type GridColumn = {
  /** Stable key — used for freeze preference + React keys. */
  key: string;
  /** Human label shown in the freeze menu. */
  label: string;
  /** Rendered pixel width (used to compute sticky left offsets). */
  width: number;
  /** LEFT anchor — permanently frozen left, cannot be unfrozen. */
  lockedLeft?: boolean;
  /** RIGHT anchor — permanently frozen right, cannot be unfrozen. */
  lockedRight?: boolean;
  /** Excluded from the freeze menu (e.g. conditional Store column). */
  freezable?: boolean;
  /** Excluded from the Customize-Columns reorder list (structural / fixed
   *  columns like the selection checkbox or a conditional column). Defaults to
   *  true for every labelled, non-anchor column. */
  reorderable?: boolean;
};

export type FrozenColumnsState = {
  /** Ordered keys frozen to the LEFT (mandatory left anchor first). */
  leftKeys: string[];
  /** The single RIGHT anchor key. */
  rightKey: string | null;
  /** Optional (non-mandatory) left keys the user selected. */
  optionalLeft: string[];
  /** Toggle an optional column's frozen state (mandatory columns are ignored). */
  toggle: (key: string) => void;
  /** Reset to default — only the two mandatory anchors frozen. */
  reset: () => void;
  /** True once the authoritative load has completed (avoids SSR/hydration). */
  hydrated: boolean;
};

const STORAGE_PREFIX = "repairox-frozen-columns::";

/** DB save debounce (ms). Matches column-order's 400ms. */
const SAVE_DEBOUNCE = 400;

/**
 * @param gridId    A stable id for this grid (e.g. "leads-list"). Used as the
 *                  table_key for DB persistence.
 * @param userId    The signed-in user's id (per-user isolation). null → anon.
 * @param columns   The grid's columns IN VISUAL ORDER (locked anchors flagged).
 */
export function useFrozenColumns(
  gridId: string,
  userId: string | null | undefined,
  columns: GridColumn[],
): FrozenColumnsState {
  // Optional (user-selected) frozen keys — mandatory anchors are implicit.
  const [optionalLeft, setOptionalLeft] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const loadedForKeyRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Hydrate on mount / when the user changes ────────────────────────────
     Server-first in Supabase mode, cache/local fallback otherwise. Same dual-
     mode pattern as useColumnOrder + useLeadKanban: WAIT for the real userId
     in Supabase mode so a fleeting "anon" pass never clobbers the real pref. */
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
        const server = await loadServerPref(gridId, "frozenColumns");
        if (cancelled) return;
        if (server !== undefined) {
          saved = server;
        } else {
          saved = readLocal(STORAGE_PREFIX, gridId, userId);
        }
        // Migrate local → server on first DB load.
        if (server === null) {
          const local = readLocal(STORAGE_PREFIX, gridId, userId);
          if (local && local.length > 0) {
            saved = local;
            void saveServerPref(gridId, "frozenColumns", local);
          }
        }
      } else {
        saved = readLocal(STORAGE_PREFIX, gridId, userId);
      }

      if (cancelled) return;
      setOptionalLeft(saved ?? []);
      loadedForKeyRef.current = `${gridId}::${userId ?? "anon"}`;
      setHydrated(true);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridId, userId]);

  /* ── Persist on change ──
     localStorage immediately (fast cache / local-mode home), server debounced.
     Only after the authoritative load for THIS user key finished. */
  useEffect(() => {
    if (!hydrated) return;
    const currentKey = `${gridId}::${userId ?? "anon"}`;
    if (loadedForKeyRef.current !== currentKey) return;

    // localStorage: immediate.
    writeLocal(STORAGE_PREFIX, gridId, userId, optionalLeft);

    // Server: debounced.
    if (isSupabaseConfigured) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const snapshot = optionalLeft.length > 0 ? optionalLeft : null;
      saveTimerRef.current = setTimeout(() => {
        void saveServerPref(gridId, "frozenColumns", snapshot);
      }, SAVE_DEBOUNCE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionalLeft, hydrated, gridId, userId]);

  // Flush pending save on unmount.
  useEffect(
    () => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); },
    [],
  );

  const lockedLeftKey = useMemo(() => columns.find((c) => c.lockedLeft)?.key ?? null, [columns]);
  const rightKey = useMemo(() => columns.find((c) => c.lockedRight)?.key ?? null, [columns]);

  // Prune saved keys against current column set (stale-column safety).
  const validOptional = useMemo(() => {
    const freezableKeys = new Set(
      columns
        .filter((c) => !c.lockedLeft && !c.lockedRight && c.freezable !== false)
        .map((c) => c.key),
    );
    return optionalLeft.filter((k) => freezableKeys.has(k));
  }, [optionalLeft, columns]);

  // The left frozen block: mandatory left anchor, then optional-frozen columns
  // IN VISUAL ORDER (contiguous prefix — no scrolling column trapped between
  // two frozen regions).
  const leftKeys = useMemo(() => {
    const optSet = new Set(validOptional);
    const ordered = columns
      .filter((c) => optSet.has(c.key))
      .map((c) => c.key);
    return lockedLeftKey ? [lockedLeftKey, ...ordered] : ordered;
  }, [columns, validOptional, lockedLeftKey]);

  const toggle = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key);
      if (!col || col.lockedLeft || col.lockedRight || col.freezable === false) return;
      setOptionalLeft((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      );
    },
    [columns],
  );

  const reset = useCallback(() => setOptionalLeft([]), []);

  return { leftKeys, rightKey, optionalLeft: validOptional, toggle, reset, hydrated };
}
