"use client";
/* One realtime subscription → Map<jobId, JobLive> for the Pickup & Drop table. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_TRIP_COLUMNS, buildJobLive, type JobLive, type LiveAssignmentRow, type LiveTripRow } from "@/lib/field-live";

export function useFieldLive(enabled = true): Map<string, JobLive> {
  const [trips, setTrips] = useState<LiveTripRow[]>([]);
  const [rej, setRej] = useState<LiveAssignmentRow[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("field_trips").select(LIVE_TRIP_COLUMNS).order("created_at", { ascending: false }).limit(1500);
    const rows = (data ?? []) as LiveTripRow[];
    const waiting = rows.filter((t) => t.status === "awaiting_assignment").map((t) => t.id);
    let a: LiveAssignmentRow[] = [];
    if (waiting.length) {
      const r = await supabase.from("field_assignments").select("trip_id,ninja_id,outcome,reject_reason,responded_at,assigned_at").eq("outcome", "rejected").in("trip_id", waiting);
      a = (r.data ?? []) as LiveAssignmentRow[];
    }
    const sig = (x: unknown) => JSON.stringify(x);
    setTrips((p) => (sig(p) === sig(rows) ? p : rows));
    setRej((p) => (sig(p) === sig(a) ? p : a));
  }, []);
  useEffect(() => {
    if (!enabled || !supabase) return;
    void load();
    const kick = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void load(), 250); };
    const ch = supabase.channel("field-live-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "field_trips" }, kick)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_assignments" }, kick)
      .subscribe();
    const iv = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { supabase?.removeChannel(ch); clearInterval(iv); if (timer.current) clearTimeout(timer.current); };
  }, [enabled, load]);
  return useMemo(() => buildJobLive(trips, rej), [trips, rej]);
}
