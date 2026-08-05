"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import type { LayoutItem } from "react-grid-layout";

/* ──────────────────────────────────────────────────────────────────────────
   useGridLayout — Persists the full react-grid-layout per user (email).

   Reads from localStorage SYNCHRONOUSLY on first render to avoid flash.
   Then optionally syncs with Supabase in the background.
   ────────────────────────────────────────────────────────────────────────── */

const LOCAL_STORAGE_PREFIX = "repairox-grid-layout-";

/** Synchronous read from localStorage — runs immediately, no flash */
function readLocalSync(key: string | null): Record<string, LayoutItem[]> | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.lg) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export function useGridLayout() {
  const { currentUser } = usePermissions();

  // Key by email for per-user isolation (falls back to id if no email)
  const userKey = currentUser?.email || currentUser?.id || null;
  const localKey = userKey ? `${LOCAL_STORAGE_PREFIX}${userKey}` : null;

  // Initialize state synchronously from localStorage — no flash
  const [savedLayouts, setSavedLayouts] = useState<Record<string, LayoutItem[]> | null>(
    () => readLocalSync(localKey)
  );
  const [isLoading, setIsLoading] = useState(() => {
    // If we already have a local layout, we're not "loading"
    return readLocalSync(localKey) === null;
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevKeyRef = useRef<string | null>(localKey);

  // ── Re-read when user changes (different email logs in) ──
  useEffect(() => {
    if (prevKeyRef.current === localKey) return;
    prevKeyRef.current = localKey;

    const local = readLocalSync(localKey);
    setSavedLayouts(local);
    setIsLoading(local === null);
  }, [localKey]);

  // ── Async Supabase sync (background upgrade — only if configured) ──
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !localKey) return;
    let cancelled = false;

    async function syncFromSupabase() {
      try {
        const { data: session } = await supabase!.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return;

        const res = await fetch("/api/dashboard-preferences?section=grid_layout", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const json = await res.json();
        if (cancelled) return;
        if (json.ok && json.preferences?.cardOrder) {
          try {
            const parsed = JSON.parse(json.preferences.cardOrder[0]);
            if (parsed && typeof parsed === "object" && parsed.lg) {
              setSavedLayouts(parsed);
              // Also update localStorage so next load is instant
              if (localKey) {
                try { localStorage.setItem(localKey, JSON.stringify(parsed)); } catch { /* */ }
              }
            }
          } catch { /* */ }
        }
      } catch { /* */ }
      if (!cancelled) setIsLoading(false);
    }

    syncFromSupabase();
    return () => { cancelled = true; };
  }, [localKey]);

  // ── Persist (debounced — only after drop/resize ends) ──
  const persistLayout = useCallback(
    (layouts: Record<string, LayoutItem[]>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        const serialized = JSON.stringify(layouts);

        // Always save to localStorage immediately
        if (localKey) {
          try { localStorage.setItem(localKey, serialized); } catch { /* */ }
        }

        // Also persist to Supabase
        if (isSupabaseConfigured && supabase) {
          try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            if (token) {
              await fetch("/api/dashboard-preferences", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ section: "grid_layout", cardOrder: [serialized] }),
              });
            }
          } catch { /* */ }
        }
      }, 500);
    },
    [localKey]
  );

  return { savedLayouts, persistLayout, isLoading };
}
