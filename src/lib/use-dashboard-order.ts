"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";

/* ──────────────────────────────────────────────────────────────────────────
   useDashboardOrder — Manages per-user KPI card order.

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
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_ORDER);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unique key for localStorage fallback (per-user)
  const localKey = currentUser?.id ? `${LOCAL_STORAGE_PREFIX}${currentUser.id}` : null;

  // ── Load saved order on mount / user change ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      if (isSupabaseConfigured && supabase) {
        // Supabase mode — fetch from API
        try {
          const { data: session } = await supabase.auth.getSession();
          const token = session?.session?.access_token;
          if (token) {
            const res = await fetch("/api/dashboard-preferences", {
              headers: { Authorization: `Bearer ${token}` },
            });
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
  }, [localKey]);

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

        // Persist to Supabase if configured
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
                body: JSON.stringify({ cardOrder: order }),
              });
            }
          } catch {
            // Network error — localStorage already saved
          }
        }
      }, 300); // 300ms debounce to batch rapid reorders
    },
    [localKey]
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
