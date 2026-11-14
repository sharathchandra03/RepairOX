"use client";
/* RepairOX — DB field notifications -> the shared topbar bell.
   field_trips triggers (migration 0097) write durable rows in `notifications`
   addressed to real staff ids. This hook pulls the signed-in user's unread
   field rows (RLS-scoped), replays them into the local bell feed with the row's
   dedupe key, then marks them read so they are delivered exactly once.
   Realtime INSERTs on the caller's own rows make delivery instant; a 60s poll +
   focus refresh is the fallback. Mounted once in app-shell. */
import { useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { notify, setNotificationUser, type NotificationKind } from "@/lib/notifications";

const FIELD_KINDS = ["field_new_job", "field_trip_assigned", "field_trip_update", "field_trip_problem", "field_trip_released",
  "field_trip_cancelled", "field_trip_unassigned", "device_received"];

interface Row { id: string; kind: string; title: string; body: string | null; href: string | null; reference: string | null; dedupe_key: string | null; created_at: string }

export function useFieldNotifications(enabled = true) {
  const { currentUser, authReady } = usePermissions();
  const busy = useRef(false);
  const uid = currentUser?.id;

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !supabase || !authReady || !uid) return;
    setNotificationUser(uid);
    let off = false;
    const pull = async () => {
      if (off || busy.current) return;
      busy.current = true;
      try {
        const since = new Date(Date.now() - 3 * 864e5).toISOString();
        const { data } = await supabase!.from("notifications").select("id,kind,title,body,href,reference,dedupe_key,created_at")
          .eq("recipient_id", uid).eq("read", false).in("kind", FIELD_KINDS).gte("created_at", since).order("created_at").limit(50);
        const rows = (data ?? []) as Row[];
        if (!rows.length) return;
        for (const r of rows) {
          notify({ kind: r.kind as NotificationKind, title: r.title, body: r.body ?? "", href: r.href ?? undefined, reference: r.reference ?? undefined,
            recipientId: uid, dedupeKey: r.dedupe_key ?? `db:${r.id}`, ts: new Date(r.created_at).getTime() || Date.now() });
        }
        await supabase!.from("notifications").update({ read: true, read_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
      } catch { /* next poll retries */ } finally { busy.current = false; }
    };
    void pull();
    const ch = supabase.channel(`field-notify-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${uid}` }, () => void pull())
      .subscribe();
    const iv = window.setInterval(() => void pull(), 60_000);
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    return () => { off = true; supabase?.removeChannel(ch); window.clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [enabled, authReady, uid]);
}
