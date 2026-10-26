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

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
  const { currentUser, authReady, apiFetch, logout } = usePermissions();
  const router = useRouter();
  // Guards a one-time, clean sign-out when this device is revoked from another
  // device (single-device login). Prevents a revoke response from firing the
  // logout + redirect more than once.
  const kickedRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!authReady || !currentUser) return;

    kickedRef.current = false;
    let cancelled = false;
    const token = getSessionToken();

    const ping = async () => {
      if (cancelled || kickedRef.current) return;
      try {
        const res = await apiFetch("/api/account/sessions", {
          method: "POST",
          body: JSON.stringify({ sessionToken: token }),
        });
        // Single-device enforcement: the server revoked THIS device's session
        // because the account signed in elsewhere (HTTP 410). Sign out cleanly
        // and send the user to the login screen with a short explanation. This
        // is the ONLY new behaviour on the heartbeat — every other response is
        // handled exactly as before (fire-and-forget).
        if (!cancelled && res.status === 410 && res.json?.revoked && !kickedRef.current) {
          kickedRef.current = true;
          try { logout(); } catch { /* never trap the user */ }
          const reason = encodeURIComponent("signed-in-elsewhere");
          router.replace(`/login?reason=${reason}`);
        }
      } catch {
        // Network / transient failure is non-fatal; the app keeps working and
        // the next heartbeat retries.
      }
    };

    void ping(); // register / refresh immediately on mount

    const interval = window.setInterval(() => { void ping(); }, HEARTBEAT_MS);
    // Also touch when the tab regains focus, so long-idle tabs update promptly
    // and a revoked device is kicked as soon as the user returns to the tab.
    const onFocus = () => { void ping(); };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [authReady, currentUser?.id, apiFetch, logout, router]); // eslint-disable-line react-hooks/exhaustive-deps
}
