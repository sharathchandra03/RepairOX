"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Data-Grid — FROZEN COLUMN PREFERENCE (per-user, reusable)
   ────────────────────────────────────────────────────────────────────────
   Manages which columns a dense RepairOX table freezes horizontally. Every
   grid has exactly TWO mandatory structural anchors that can NEVER be
   unfrozen:

     • one LEFT anchor  (e.g. Lead ID)  — identity, pinned to the left edge
     • one RIGHT anchor (e.g. Last Action) — actions, pinned to the right edge

   In addition, the user may freeze extra columns onto EITHER side:
     • LEFT  — a contiguous prefix growing from the left anchor
       (Lead ID | Date | Agent | … | scroll … | Actions)
     • RIGHT — a contiguous suffix growing in from the right anchor
       (Lead ID | … | scroll … | Result | Last Action)
   A column freezes to whichever side it is nearest (first half → left,
   second half → right), so freezing "Result" pins it to the RIGHT while the
   columns before it keep scrolling. We never freeze an arbitrary middle column
   between two scrolling regions — each frozen block is always a contiguous run
   anchored to its edge.

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
  /** Ordered keys frozen to the RIGHT, left→right, mandatory right anchor LAST. */
  rightKeys: string[];
  /** The single mandatory RIGHT anchor key. */
  rightKey: string | null;
  /** Optional (non-mandatory) left keys the user selected. */
  optionalLeft: string[];
  /** Optional (non-mandatory) right keys the user selected. */
  optionalRight: string[];
  /** Toggle an optional column's frozen state (mandatory columns are ignored).
   *  The side is chosen automatically by the column's position. */
  toggle: (key: string) => void;
  /** Which side a column would freeze to ("left" | "right"), for menu hints. */
  sideFor: (key: string) => "left" | "right";
  /** Reset to default — only the two mandatory anchors frozen. */
  reset: () => void;
  /** True once the authoritative load has completed (avoids SSR/hydration). */
  hydrated: boolean;
};

/* ── Storage encoding ───────────────────────────────────────────────────────
   The persistence layer stores a flat string[] (DB + localStorage). To support
   BOTH sides without changing the storage schema/API/migration, a right-frozen
   column is encoded with a "right:" prefix; a plain key is left-frozen (so any
   legacy left-only preference loads unchanged). */
const RIGHT_PREFIX = "right:";
const encodeRight = (key: string) => `${RIGHT_PREFIX}${key}`;
const isRightToken = (tok: string) => tok.startsWith(RIGHT_PREFIX);
const decodeToken = (tok: string) => (isRightToken(tok) ? tok.slice(RIGHT_PREFIX.length) : tok);

function splitStored(raw: string[] | null | undefined): { left: string[]; right: string[] } {
  const left: string[] = [];
  const right: string[] = [];
  for (const tok of raw ?? []) {
    if (isRightToken(tok)) right.push(decodeToken(tok));
    else left.push(tok);
  }
  return { left, right };
}

function joinStored(left: string[], right: string[]): string[] {
  return [...left, ...right.map(encodeRight)];
}

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
  // Optional (user-selected) frozen tokens — encoded (plain = left,
  // "right:" prefixed = right). Mandatory anchors are implicit. Persisted
  // verbatim as a flat string[] (no storage-schema change).
  const [stored, setStored] = useState<string[]>([]);
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
      setStored(saved ?? []);
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
    writeLocal(STORAGE_PREFIX, gridId, userId, stored);

    // Server: debounced.
    if (isSupabaseConfigured) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const snapshot = stored.length > 0 ? stored : null;
      saveTimerRef.current = setTimeout(() => {
        void saveServerPref(gridId, "frozenColumns", snapshot);
      }, SAVE_DEBOUNCE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, hydrated, gridId, userId]);

  // Flush pending save on unmount.
  useEffect(
    () => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); },
    [],
  );

  const lockedLeftKey = useMemo(() => columns.find((c) => c.lockedLeft)?.key ?? null, [columns]);
  const rightKey = useMemo(() => columns.find((c) => c.lockedRight)?.key ?? null, [columns]);

  // The freezable optional columns, IN VISUAL ORDER (excludes the two anchors
  // and non-freezable structural columns).
  const freezableOrder = useMemo(
    () => columns
      .filter((c) => !c.lockedLeft && !c.lockedRight && c.freezable !== false)
      .map((c) => c.key),
    [columns],
  );

  // Decode the stored tokens into valid left/right key sets (stale-column safe).
  const { validLeft, validRight } = useMemo(() => {
    const freezable = new Set(freezableOrder);
    const { left, right } = splitStored(stored);
    return {
      validLeft: left.filter((k) => freezable.has(k)),
      validRight: right.filter((k) => freezable.has(k)),
    };
  }, [stored, freezableOrder]);

  /** Which side a given column freezes to: the half it sits in. First half →
   *  left, second half (and the exact middle) → right. */
  const sideFor = useCallback(
    (key: string): "left" | "right" => {
      const idx = freezableOrder.indexOf(key);
      if (idx < 0) return "left";
      return idx < Math.floor(freezableOrder.length / 2) ? "left" : "right";
    },
    [freezableOrder],
  );

  // LEFT frozen block: mandatory left anchor + a CONTIGUOUS PREFIX of the
  // freezable columns. Stop at the first gap so a far column can never pin left
  // with gaps/overlap.
  const leftKeys = useMemo(() => {
    const set = new Set(validLeft);
    const ordered: string[] = [];
    for (const key of freezableOrder) {
      if (!set.has(key)) break;
      ordered.push(key);
    }
    return lockedLeftKey ? [lockedLeftKey, ...ordered] : ordered;
  }, [freezableOrder, validLeft, lockedLeftKey]);

  // RIGHT frozen block: a CONTIGUOUS SUFFIX of the freezable columns, then the
  // mandatory right anchor LAST. Built by walking from the right edge inward
  // and stopping at the first gap.
  const rightKeys = useMemo(() => {
    const set = new Set(validRight);
    const ordered: string[] = [];
    for (let i = freezableOrder.length - 1; i >= 0; i--) {
      const key = freezableOrder[i];
      if (!set.has(key)) break;
      ordered.unshift(key);
    }
    return rightKey ? [...ordered, rightKey] : ordered;
  }, [freezableOrder, validRight, rightKey]);

  const toggle = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key);
      if (!col || col.lockedLeft || col.lockedRight || col.freezable === false) return;
      const targetIdx = freezableOrder.indexOf(key);
      if (targetIdx < 0) return;

      const side = sideFor(key);
      setStored((prev) => {
        const { left, right } = splitStored(prev);
        const leftSet = new Set(left);
        const rightSet = new Set(right);

        if (side === "left") {
          const wasFrozen = leftSet.has(key);
          let nextLeft: string[];
          if (wasFrozen) {
            // Unfreeze this + everything after it (keep the left prefix).
            nextLeft = freezableOrder.slice(0, targetIdx);
          } else {
            // Freeze this + everything before it (contiguous left prefix).
            nextLeft = freezableOrder.slice(0, targetIdx + 1);
          }
          // A column can't be frozen on both sides.
          const nextRight = right.filter((k) => !nextLeft.includes(k));
          return joinStored(nextLeft, nextRight);
        }

        // side === "right"
        const wasFrozen = rightSet.has(key);
        let nextRight: string[];
        if (wasFrozen) {
          // Unfreeze this + everything before it (keep the right suffix).
          nextRight = freezableOrder.slice(targetIdx + 1);
        } else {
          // Freeze this + everything after it (contiguous right suffix).
          nextRight = freezableOrder.slice(targetIdx);
        }
        const nextLeft = left.filter((k) => !nextRight.includes(k));
        return joinStored(nextLeft, nextRight);
      });
    },
    [columns, freezableOrder, sideFor],
  );

  const reset = useCallback(() => setStored([]), []);

  return {
    leftKeys,
    rightKeys,
    rightKey,
    optionalLeft: validLeft,
    optionalRight: validRight,
    toggle,
    sideFor,
    reset,
    hydrated,
  };
}
