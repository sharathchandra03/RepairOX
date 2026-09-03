"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Active Sessions tracker.

   Registers THIS device/browser as a real session row (public.user_sessions)
   when the signed-in app mounts, then heartbeats it periodically so
   "Last Activity" reflects genuine presence. It does NOT touch the login flow
   or the auth provider — it only writes an app-level session record via the
   authenticated /api/account/sessions route.

   The per-device handle ("session token") lives in localStorage so the same
   browser keeps one row and can identify itself as "Current" in the list. It
   is an opaque random id, NOT an auth token.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import { usePermissions } from "@/lib/permissions-context";
import { isSupabaseConfigured } from "@/lib/supabase";

const TOKEN_KEY = "repairox-session-token";
const HEARTBEAT_MS = 60_000; // touch last_activity every minute while open

/** Get (or lazily create) this device's opaque session handle. */
export function getSessionToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t =
      (globalThis.crypto?.randomUUID?.() ??
        Math.random().toString(36).slice(2) + Date.now().toString(36)) +
      "-" +
      Math.random().toString(36).slice(2);
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

export function useSessionTracker() {
  const { currentUser, authReady, apiFetch } = usePermissions();

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!authReady || !currentUser) return;

    let cancelled = false;
    const token = getSessionToken();

    const ping = () => {
      if (cancelled) return;
      // Fire-and-forget; failures are non-fatal (the page still works).
      apiFetch("/api/account/sessions", {
        method: "POST",
        body: JSON.stringify({ sessionToken: token }),
      }).catch(() => {});
    };

    ping(); // register / refresh immediately on mount

    const interval = window.setInterval(ping, HEARTBEAT_MS);
    // Also touch when the tab regains focus, so long-idle tabs update promptly.
    const onFocus = () => ping();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [authReady, currentUser?.id, apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps
}
