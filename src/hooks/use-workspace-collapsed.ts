"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "repairox-workspace-collapsed::";

/**
 * Per-user Expand/Collapse state for a list workspace's control area (the
 * filters/toolbar above a table). Lets a user switch between
 * "management mode" (expanded — all filters/tools visible) and
 * "work mode" (collapsed — the table maximizes its viewport).
 *
 * This is a PRESENTATION preference only — it never touches filter values,
 * table data, column order, freeze selection, or any business state.
 *
 * Persistence is per-user via localStorage (keyed by the signed-in user id),
 * so one user's preference never affects another's. It is OFF (expanded) by
 * default — users need every filter available when they first enter the page.
 * Mirrors the lightweight `use-pinned-filters` pattern (localStorage + a
 * `hydrated` gate); promote to a DB-backed table later without changing the
 * surface shape.
 *
 * @param workspaceKey  stable key for the workspace (e.g. "lead_table")
 * @param userId        the signed-in user's stable id (undefined while loading)
 */
export function useWorkspaceCollapsed(workspaceKey: string, userId?: string | null) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = `${STORAGE_PREFIX}${workspaceKey}::${userId ?? "anon"}`;

  // Load the stored preference once we have a real user id (so the anon value
  // is never written over a user's real preference).
  useEffect(() => {
    setHydrated(false);
    try {
      const raw = localStorage.getItem(storageKey);
      setCollapsed(raw === "1");
    } catch {
      setCollapsed(false);
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist on change (only after hydration, so the initial read never
  // immediately overwrites what we just loaded).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      // storage full or unavailable — keep the in-memory state
    }
  }, [collapsed, hydrated, storageKey]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return { collapsed, setCollapsed, toggle, hydrated };
}
