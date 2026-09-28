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

   The selection is persisted PER USER in localStorage (mirrors
   use-pinned-filters.ts / store-multi-select.tsx). One user's freeze config
   never affects another user. Ready to be promoted to a DB-backed
   table_preferences table later without changing the consuming UI.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";

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
  /** True once localStorage has been read (avoids SSR/hydration mismatch). */
  hydrated: boolean;
};

const STORAGE_PREFIX = "repairox-frozen-columns::";

function readPref(storageKey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : null;
  } catch {
    return null;
  }
}

function writePref(storageKey: string, keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    /* quota / unavailable */
  }
}

/**
 * @param gridId    A stable id for this grid (e.g. "leads-list").
 * @param userId    The signed-in user's id (per-user isolation). null → shared/anon.
 * @param columns   The grid's columns IN VISUAL ORDER (locked anchors flagged).
 */
export function useFrozenColumns(
  gridId: string,
  userId: string | null | undefined,
  columns: GridColumn[],
): FrozenColumnsState {
  const storageKey = `${STORAGE_PREFIX}${gridId}::${userId ?? "anon"}`;

  // Optional (user-selected) frozen keys — mandatory anchors are implicit.
  const [optionalLeft, setOptionalLeft] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount / when the key (user) changes.
  useEffect(() => {
    const saved = readPref(storageKey);
    setOptionalLeft(saved ?? []);
    setHydrated(true);
  }, [storageKey]);

  // Persist whenever the selection changes (after hydration only).
  useEffect(() => {
    if (!hydrated) return;
    writePref(storageKey, optionalLeft);
  }, [optionalLeft, hydrated, storageKey]);

  const lockedLeftKey = useMemo(() => columns.find((c) => c.lockedLeft)?.key ?? null, [columns]);
  const rightKey = useMemo(() => columns.find((c) => c.lockedRight)?.key ?? null, [columns]);

  // The set of columns that are ACTUALLY freezable-optional (exist, not locked,
  // not explicitly non-freezable). Prunes any stale saved keys (e.g. a column
  // that no longer exists or the Store column when single-store).
  const validOptional = useMemo(() => {
    const freezableKeys = new Set(
      columns
        .filter((c) => !c.lockedLeft && !c.lockedRight && c.freezable !== false)
        .map((c) => c.key),
    );
    return optionalLeft.filter((k) => freezableKeys.has(k));
  }, [optionalLeft, columns]);

  // The left frozen block is a CONTIGUOUS PREFIX: the mandatory left anchor,
  // then every optional-frozen column IN VISUAL ORDER. This guarantees no
  // scrolling column is ever trapped between two frozen regions.
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
      // Mandatory anchors + non-freezable columns can't be toggled.
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
