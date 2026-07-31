"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";

/* ──────────────────────────────────────────────────────────────────────────
   useMonthlyTarget — Manages per-user monthly revenue target.

   Dual-mode persistence (mirrors useDashboardOrder architecture):
   • Supabase mode: reads/writes via /api/dashboard-preferences.
   • Local mode: persists to localStorage keyed by the user's local id.

   Returns the current target and a setter. The setter optimistically
   updates state, then persists in the background.
   ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_TARGET = 100000; // ₹1,00,000 fallback
const LOCAL_STORAGE_PREFIX = "repairox-monthly-target-";

export function useMonthlyTarget() {
  const { currentUser } = usePermissions();
  const [target, setTarget] = useState<number>(DEFAULT_TARGET);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localKey = currentUser?.id ? `${LOCAL_STORAGE_PREFIX}${currentUser.id}` : null;

  // ── Load saved target on mount / user change ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      if (isSupabaseConfigured && supabase) {
        try {
          const { data: session } = await supabase.auth.getSession();
          const token = session?.session?.access_token;
          if (token) {
            const res = await fetch("/api/dashboard-preferences", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const json = await res.json();
              if (!cancelled && json.ok && json.preferences?.monthlyTarget) {
                const saved = Number(json.preferences.monthlyTarget);
                if (saved > 0) {
                  setTarget(saved);
                  setIsLoading(false);
                  return;
                }
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
            const parsed = Number(JSON.parse(raw));
            if (parsed > 0) {
              setTarget(parsed);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      if (!cancelled) {
        setTarget(DEFAULT_TARGET);
        setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [localKey]);

  // ── Save helper (debounced) ──
  const persist = useCallback(
    (value: number) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        // Always persist to localStorage as fallback
        if (localKey) {
          try {
            localStorage.setItem(localKey, JSON.stringify(value));
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
                body: JSON.stringify({ monthlyTarget: value }),
              });
            }
          } catch {
            // Network error — localStorage already saved
          }
        }
      }, 300);
    },
    [localKey]
  );

  // ── Update handler (optimistic) ──
  const updateTarget = useCallback(
    (newTarget: number) => {
      const safe = Math.max(1, Math.round(newTarget));
      setTarget(safe);
      persist(safe);
    },
    [persist]
  );

  return { target, updateTarget, isLoading };
}
