"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";

/* ──────────────────────────────────────────────────────────────────────────
   useDashboardOrder — Manages per-user KPI card order, PER STORE.

   The order is independent for each store: a user's Store A order differs from
   Store B. The active store (useStoreContext) is folded into both the
   localStorage key and the API request. All-Shops (activeStoreId null) is its
   own bucket.

   Dual-mode persistence (mirrors the app's existing architecture):
   • Supabase mode: reads/writes via /api/dashboard-preferences using the
     user's session token.
   • Local mode: persists to localStorage keyed by the user's local id.

   Returns the current card order and a reorder function. The reorder
   function optimistically updates state, then persists in the background.
   ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_ORDER = ["total_revenue", "stock_value", "dues_outstanding", "tickets_today"];
const LOCAL_STORAGE_PREFIX = "repairox-kpi-order-";

export function useDashboardOrder() {
  const { currentUser } = usePermissions();
  const { activeStoreId, ready: storeReady } = useStoreContext();
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_ORDER);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store bucket: a concrete branch id, or "all" for the consolidated view.
  const storeBucket = activeStoreId ?? "all";
  // Unique key for localStorage fallback (per-user PER-STORE).
  const localKey = currentUser?.id
    ? `${LOCAL_STORAGE_PREFIX}${currentUser.id}::${storeBucket}`
    : null;

  // ── Load saved order on mount / user change / store change ──
  useEffect(() => {
    let cancelled = false;
    // Wait until the active-store selection is resolved so we never load the
    // wrong store's layout on first paint.
    if (!storeReady) return;

    async function load() {
      setIsLoading(true);

      if (isSupabaseConfigured && supabase) {
        // Supabase mode — fetch from API (scoped to the active store)
        try {
          const { data: session } = await supabase.auth.getSession();
          const token = session?.session?.access_token;
          if (token) {
            const res = await fetch(
              `/api/dashboard-preferences?section=kpi_cards&store=${encodeURIComponent(storeBucket)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) {
              const json = await res.json();
              if (!cancelled && json.ok && json.preferences?.cardOrder) {
                const saved = json.preferences.cardOrder as string[];
                // Merge: include any new cards not in saved order, drop removed ones
                const merged = mergeOrder(saved, DEFAULT_ORDER);
                setCardOrder(merged);
                setIsLoading(false);
                return;
              }
            }
          }
        } catch {
          // Fall through to localStorage / default
        }
      }

      // Local mode — read from localStorage
      if (!cancelled && localKey) {
        try {
          const raw = localStorage.getItem(localKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const merged = mergeOrder(parsed, DEFAULT_ORDER);
              setCardOrder(merged);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      if (!cancelled) {
        setCardOrder(DEFAULT_ORDER);
        setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [localKey, storeReady, storeBucket]);

  // ── Save helper (debounced) ──
  const persist = useCallback(
    (order: string[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        // Always persist to localStorage as fallback
        if (localKey) {
          try {
            localStorage.setItem(localKey, JSON.stringify(order));
          } catch {
            // quota exceeded — non-critical
          }
        }

        // Persist to Supabase if configured (scoped to the active store)
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
                body: JSON.stringify({ cardOrder: order, section: "kpi_cards", store: storeBucket }),
              });
            }
          } catch {
            // Network error — localStorage already saved
          }
        }
      }, 300); // 300ms debounce to batch rapid reorders
    },
    [localKey, storeBucket]
  );

  // ── Reorder handler (optimistic) ──
  const reorder = useCallback(
    (newOrder: string[]) => {
      setCardOrder(newOrder);
      persist(newOrder);
    },
    [persist]
  );

  return { cardOrder, reorder, isLoading };
}

/* ── Merge utility ──
   Ensures that if new cards are added to DEFAULT_ORDER in the future,
   they appear at the end. Also removes cards no longer in the default set. */
function mergeOrder(saved: string[], defaults: string[]): string[] {
  const defaultSet = new Set(defaults);
  // Keep only valid IDs in saved order
  const valid = saved.filter((id) => defaultSet.has(id));
  // Append any new defaults not in saved
  const savedSet = new Set(valid);
  const appended = defaults.filter((id) => !savedSet.has(id));
  return [...valid, ...appended];
}
