"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { usePermissions } from "@/lib/permissions-context";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/* ──────────────────────────────────────────────────────────────────────────
   Dashboard Settings Context — Persists per-user (by email) to localStorage
   and Supabase via the dashboard-preferences API.

   Two settings:
   • resizeEnabled  — allows resizing widget dimensions (drag edges)
   • reorderEnabled — allows dragging widgets to reposition them

   Both default to FALSE (locked). Users enable them to customize,
   then disable + save to lock their layout in place permanently.
   ────────────────────────────────────────────────────────────────────────── */

const LOCAL_KEY_PREFIX = "repairox-dashboard-settings-";

interface PersistedSettings {
  resizeEnabled: boolean;
  reorderEnabled: boolean;
}

interface DashboardSettingsContextValue {
  resizeEnabled: boolean;
  reorderEnabled: boolean;
  setResizeEnabled: (v: boolean) => void;
  setReorderEnabled: (v: boolean) => void;
  /** Explicitly saves current settings to localStorage + Supabase */
  saveSettings: () => Promise<void>;
  isSaving: boolean;
}

const DashboardSettingsContext = createContext<DashboardSettingsContextValue>({
  resizeEnabled: false,
  reorderEnabled: false,
  setResizeEnabled: () => {},
  setReorderEnabled: () => {},
  saveSettings: async () => {},
  isSaving: false,
});

function readLocal(key: string): PersistedSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          resizeEnabled: parsed.resizeEnabled === true,
          reorderEnabled: parsed.reorderEnabled === true,
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

function writeLocal(key: string, settings: PersistedSettings) {
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch { /* quota exceeded */ }
}

export function DashboardSettingsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = usePermissions();
  const userKey = currentUser?.email || currentUser?.id || "_default";
  const localKey = `${LOCAL_KEY_PREFIX}${userKey}`;

  const [settings, setSettings] = useState<PersistedSettings>({ resizeEnabled: false, reorderEnabled: false });
  const [isSaving, setIsSaving] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Load from localStorage when user becomes available
  // Load from localStorage when user becomes available
  useEffect(() => {
    const saved = readLocal(localKey);
    if (saved) {
      setSettings(saved);
    } else {
      setSettings({ resizeEnabled: false, reorderEnabled: false });
    }
  }, [localKey]);

  // Background sync from Supabase (overrides localStorage if newer)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    async function syncFromSupabase() {
      try {
        const { data: session } = await supabase!.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return;

        const res = await fetch("/api/dashboard-preferences?section=dashboard_settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const json = await res.json();
        if (cancelled) return;
        if (json.ok && json.preferences?.cardOrder) {
          try {
            const parsed = JSON.parse(json.preferences.cardOrder[0]);
            if (parsed && typeof parsed === "object") {
              const fromDb: PersistedSettings = {
                resizeEnabled: parsed.resizeEnabled === true,
                reorderEnabled: parsed.reorderEnabled === true,
              };
              setSettings(fromDb);
              writeLocal(localKey, fromDb);
            }
          } catch { /* */ }
        }
      } catch { /* */ }
    }

    syncFromSupabase();
    return () => { cancelled = true; };
  }, [localKey]);

  const setResizeEnabled = useCallback((v: boolean) => {
    setSettings((prev) => ({ ...prev, resizeEnabled: v }));
  }, []);

  const setReorderEnabled = useCallback((v: boolean) => {
    setSettings((prev) => ({ ...prev, reorderEnabled: v }));
  }, []);

  // Explicit save — writes to localStorage + pushes to Supabase
  const saveSettings = useCallback(async () => {
    const current = settingsRef.current;
    setIsSaving(true);

    // Save to localStorage
    writeLocal(localKey, current);

    // Save to Supabase
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
            body: JSON.stringify({
              section: "dashboard_settings",
              cardOrder: [JSON.stringify(current)],
            }),
          });
        }
      } catch { /* */ }
    }

    setIsSaving(false);
  }, [localKey]);

  return (
    <DashboardSettingsContext.Provider
      value={{
        resizeEnabled: settings.resizeEnabled,
        reorderEnabled: settings.reorderEnabled,
        setResizeEnabled,
        setReorderEnabled,
        saveSettings,
        isSaving,
      }}
    >
      {children}
    </DashboardSettingsContext.Provider>
  );
}

export function useDashboardSettings() {
  return useContext(DashboardSettingsContext);
}
