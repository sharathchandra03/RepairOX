"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import type { LayoutItem } from "react-grid-layout";

/* ──────────────────────────────────────────────────────────────────────────
   useGridLayout — Persists the full react-grid-layout per user, PER STORE.

   The layout is independent for each store (and the All-Shops bucket). Reads
   from localStorage SYNCHRONOUSLY on first render to avoid flash, then syncs
   with Supabase in the background (scoped to the active store).
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
  const { activeStoreId } = useStoreContext();

  // Store bucket: a concrete branch id, or "all" for the consolidated view.
  const storeBucket = activeStoreId ?? "all";
  // Key by email for per-user isolation (falls back to id) PER STORE.
  const userKey = currentUser?.email || currentUser?.id || null;
  const localKey = userKey ? `${LOCAL_STORAGE_PREFIX}${userKey}::${storeBucket}` : null;
  // The "All Shops" bucket acts as the DEFAULT layout template that seeds every
  // store (and every future/upcoming store) that hasn't been individually
  // customised yet. A concrete store's own saved layout always takes
  // precedence, so the user can still change any store later.
  const isAllBucket = storeBucket === "all";
  const allKey = userKey ? `${LOCAL_STORAGE_PREFIX}${userKey}::all` : null;

  // Resolve the initial layout for the current store: its own saved layout, or
  // (for a concrete store with nothing saved) the All-Shops default template.
  const readInitial = (): Record<string, LayoutItem[]> | null => {
    const own = readLocalSync(localKey);
    if (own) return own;
    if (!isAllBucket) return readLocalSync(allKey); // seed from All-Shops default
    return null;
  };

  // Initialize state synchronously from localStorage — no flash
  const [savedLayouts, setSavedLayouts] = useState<Record<string, LayoutItem[]> | null>(
    () => readInitial()
  );
  const [isLoading, setIsLoading] = useState(() => {
    // If we already have a layout (own or seeded default), we're not "loading"
    return readInitial() === null;
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevKeyRef = useRef<string | null>(localKey);

  // ── Re-read when the user OR the active store changes ──
  useEffect(() => {
    if (prevKeyRef.current === localKey) return;
    prevKeyRef.current = localKey;

    const resolved = readInitial();
    setSavedLayouts(resolved);
    setIsLoading(resolved === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey]);

  // ── Async Supabase sync (background upgrade — only if configured) ──
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !localKey) return;
    let cancelled = false;

    async function fetchLayout(token: string, bucket: string): Promise<Record<string, LayoutItem[]> | null> {
      try {
        const res = await fetch(
          `/api/dashboard-preferences?section=grid_layout&store=${encodeURIComponent(bucket)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return null;
        const json = await res.json();
        if (json.ok && json.preferences?.cardOrder) {
          const parsed = JSON.parse(json.preferences.cardOrder[0]);
          if (parsed && typeof parsed === "object" && parsed.lg) return parsed;
        }
      } catch { /* */ }
      return null;
    }

    async function syncFromSupabase() {
      try {
        const { data: session } = await supabase!.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return;

        // 1) The store's OWN saved layout wins.
        const own = await fetchLayout(token, storeBucket);
        if (cancelled) return;

        if (own) {
          setSavedLayouts(own);
          if (localKey) {
            try { localStorage.setItem(localKey, JSON.stringify(own)); } catch { /* */ }
          }
          return;
        }

        // 2) A concrete store with no saved layout inherits the All-Shops
        //    DEFAULT template (which also covers future/upcoming stores). We
        //    seed it in memory ONLY — no per-store row and no per-store
        //    localStorage cache — so the store stays "on the default" and keeps
        //    tracking the template until the user actually customises it.
        if (!isAllBucket) {
          const seed = await fetchLayout(token, "all");
          if (cancelled || !seed) return;
          setSavedLayouts(seed);
        }
      } catch { /* */ }
      if (!cancelled) setIsLoading(false);
    }

    syncFromSupabase();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey, storeBucket]);

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
                body: JSON.stringify({ section: "grid_layout", cardOrder: [serialized], store: storeBucket }),
              });
            }
          } catch { /* */ }
        }
      }, 500);
    },
    [localKey, storeBucket]
  );

  return { savedLayouts, persistLayout, isLoading };
}
