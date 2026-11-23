"use client";
/* RepairOX — useLeadStatusHistory(leadIds): the lead_status_history rows for a
   cohort (RLS-scoped: a row is visible only when its lead is). Used by the Lead
   Journey report (Lost → Revived). Supabase mode only; local/demo mode has no
   persisted status history, so it returns `ready` with no events. */
import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { LeadStatusEvent } from "@/lib/lead-journey-report";

export function useLeadStatusHistory(leadIds: string[], enabled = true): { events: LeadStatusEvent[]; ready: boolean; failed: boolean } {
  const [events, setEvents] = useState<LeadStatusEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = useMemo(() => (enabled ? [...leadIds].sort().join(",") : ""), [enabled, leadIds]);

  useEffect(() => {
    if (!enabled) return;
    if (!leadIds.length || !isSupabaseConfigured || !supabase) { setEvents([]); setReady(true); setFailed(false); return; }
    let cancelled = false;
    setReady(false);
    (async () => {
      const out: LeadStatusEvent[] = [];
      let bad = false;
      for (let i = 0; i < leadIds.length; i += 150) {
        const chunk = leadIds.slice(i, i + 150);
        const { data, error } = await supabase!
          .from("lead_status_history")
          .select("lead_id, from_status, to_status, changed_at, actor_staff_id, staff:actor_staff_id(name)")
          .in("lead_id", chunk)
          .order("changed_at", { ascending: true });
        if (error || !data) { bad = true; continue; }
        for (const r of data as any[]) {
          out.push({ leadId: r.lead_id, fromStatus: r.from_status ?? "", toStatus: r.to_status ?? "", at: r.changed_at, actorName: r.staff?.name ?? "" });
        }
      }
      if (cancelled) return;
      setEvents(out); setFailed(bad); setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { events, ready, failed };
}
