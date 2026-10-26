"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Owner login-alert poller.

   Surfaces the "an employee signed in on a device" alerts to the OWNER on the
   owner's OWN device. The sessions route writes these as durable rows in the
   `notifications` table (addressed to the owner roles); this hook pulls the
   owner's unread ones via /api/account/login-alerts and REPLAYS them into the
   shared local bell feed (src/lib/notifications.ts) with the row's stable
   dedupe key — so the alert shows up in the SAME topbar bell everything else
   uses, with zero changes to the bell component.

   It is strictly additive and owner-only:
     • runs ONLY for owner roles (empty for everyone else — the route also
       enforces this, so this is defence-in-depth, not the gate);
     • never touches the login flow, the session tracker, or any write path;
     • idempotent — notify()'s dedupeKey means re-polling never duplicates, and
       surfaced alerts are acknowledged (marked read) so they don't re-fetch.

   Mounted once in app-shell.tsx beside useSessionTracker().
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { usePermissions } from "@/lib/permissions-context";
import { isSupabaseConfigured } from "@/lib/supabase";
import { notify, setNotificationUser } from "@/lib/notifications";

const OWNER_ROLES = new Set(["master_shop_owner", "platform_owner"]);
const POLL_MS = 60_000; // check for new login alerts every minute while open

interface LoginAlert {
  id: string;
  title: string;
  body: string;
  reference: string | null;
  href: string | null;
  createdAt: string;
  dedupeKey: string;
}

export function useLoginAlerts() {
  const { currentUser, authReady, apiFetch } = usePermissions();
  const roleId = currentUser?.roleId;
  const isOwner = roleId ? OWNER_ROLES.has(roleId) : false;
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!authReady || !currentUser || !isOwner) return;

    // Make sure replayed alerts land in THIS account's own feed bucket.
    setNotificationUser(currentUser.id);

    let cancelled = false;

    const poll = async () => {
      if (cancelled || inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await apiFetch("/api/account/login-alerts", { method: "GET" });
        if (cancelled || !res.ok || !res.json?.ok) return;
        const alerts = (res.json.alerts ?? []) as LoginAlert[];
        if (alerts.length === 0) return;

        for (const a of alerts) {
          // Idempotent: dedupeKey (the DB row's stable key) prevents a second
          // bell entry across polls / tabs / reloads.
          notify({
            kind: "employee_login",
            title: a.title,
            body: a.body,
            reference: a.reference ?? undefined,
            href: a.href ?? undefined,
            recipientId: currentUser.id,
            dedupeKey: a.dedupeKey,
            ts: new Date(a.createdAt).getTime() || Date.now(),
          });
        }

        // Acknowledge so they don't re-fetch (the local feed now owns them).
        const ids = alerts.map((a) => a.id);
        void apiFetch("/api/account/login-alerts", {
          method: "POST",
          body: JSON.stringify({ ids }),
        }).catch(() => {});
      } catch {
        // Non-fatal; the next poll retries.
      } finally {
        inFlight.current = false;
      }
    };

    void poll(); // surface anything waiting immediately on mount

    const interval = window.setInterval(() => { void poll(); }, POLL_MS);
    const onFocus = () => { void poll(); };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [authReady, currentUser?.id, isOwner, apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps
}
