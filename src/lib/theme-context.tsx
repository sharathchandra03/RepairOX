"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Theme (Light / Dark) context.

   Owns the single source of truth for the active UI theme and applies it at
   the document root by toggling the `.dark` class on <html>. All colour tokens
   live in globals.css; this provider only decides *when* the dark token set is
   active. The existing approved light theme is the default.

   PERSISTENCE (database-backed, per user):
     • Supabase mode → the choice is written to the signed-in user's own
       `staff.theme_preference` column via the existing RLS self-update policy
       (the same direct-write path used by profile edits). The DB is the source
       of truth, so the preference follows the user across devices/sessions.
     • Demo / local mode (no Supabase) → falls back to localStorage so the
       prototype still works with zero configuration.

   localStorage is used ONLY as a fast pre-hydration cache to avoid a flash of
   the wrong theme on first paint — never as the permanent source of truth.
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";

export type Theme = "light" | "dark";

/** Cache key — a hint for first paint only, not the source of truth. */
const THEME_CACHE_KEY = "repairox-theme";

interface ThemeContextValue {
  theme: Theme;
  /** True once the persisted preference has been resolved. */
  hydrated: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ─── DOM helpers ────────────────────────────────────────────────────── */

/** Apply the theme to <html>, wrapping the change in a brief colour-only
 *  transition window (see `.theme-transition` in globals.css). Layout is never
 *  animated. Respects prefers-reduced-motion via the CSS media query. */
function applyThemeToDom(theme: Theme, animate: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 260);
  }

  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme === "dark" ? "dark" : "light";
}

function readCachedTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(THEME_CACHE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function writeCachedTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* storage unavailable — cache is best-effort only */
  }
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { authReady, currentUser, isDemoMode } = usePermissions();

  // Start from the cached hint (avoids first-paint flash), default light.
  const [theme, setThemeState] = useState<Theme>(() => readCachedTheme() ?? "light");
  const [hydrated, setHydrated] = useState(false);
  // Guards the very first DOM apply so we don't run the transition on load.
  const firstApply = useRef(true);
  const staffIdRef = useRef<string | null>(null);

  /* Keep the DOM in sync with the active theme. */
  useEffect(() => {
    applyThemeToDom(theme, !firstApply.current);
    firstApply.current = false;
    writeCachedTheme(theme);
  }, [theme]);

  /* Resolve the persisted preference from the database once auth is ready. */
  useEffect(() => {
    if (!authReady) return;

    // Demo / local mode: the cached (localStorage) value is authoritative.
    if (!isSupabaseConfigured || !supabase || isDemoMode) {
      const cached = readCachedTheme();
      if (cached) setThemeState(cached);
      setHydrated(true);
      return;
    }

    let active = true;

    (async () => {
      const { data: sessionData } = await supabase!.auth.getSession();
      const authUserId = sessionData.session?.user?.id;
      if (!authUserId) {
        setHydrated(true);
        return;
      }

      const { data: row, error } = await supabase!
        .from("staff")
        .select("id, theme_preference")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (!active) return;

      if (!error && row) {
        staffIdRef.current = (row as { id: string }).id;
        const pref = (row as { theme_preference?: string }).theme_preference;
        if (pref === "dark" || pref === "light") {
          setThemeState(pref);
        }
      }
      // If the column doesn't exist yet (migration not run) the select errors
      // gracefully; we keep the cached value and still allow toggling. The
      // write path below also degrades gracefully.
      setHydrated(true);
    })();

    return () => {
      active = false;
    };
  }, [authReady, isDemoMode, currentUser?.id]);

  /* Persist a change. Optimistic: the DOM already reflects `theme` via the
     effect above; here we only write it through to the durable store. */
  const persist = useCallback(
    (next: Theme) => {
      writeCachedTheme(next);

      if (!isSupabaseConfigured || !supabase || isDemoMode) return; // localStorage is the store

      const id = staffIdRef.current;
      if (!id) return;

      // RLS self-update: a user may write their own staff row (same path as
      // profile edits). Best-effort — never block the UI on it.
      supabase
        .from("staff")
        .update({ theme_preference: next })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.error("[Theme] Failed to persist theme preference:", error.message);
          }
        });
    },
    [isDemoMode]
  );

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState((prev) => {
        if (prev !== next) persist(next);
        return next;
      });
    },
    [persist]
  );

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <ThemeContext.Provider value={{ theme, hydrated, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
