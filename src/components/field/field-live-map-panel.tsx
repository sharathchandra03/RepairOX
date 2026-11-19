"use client";
/* Pickup & Drop → Live map view. Plots every authorised in-progress trip with the
   Ninja's latest REAL location (field_tracking_sessions, RLS-scoped). Same data the
   Ninja app writes; stale points are labelled, never shown as live. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { LiveOpsMap, type LivePoint } from "@/components/field/live-ops-map";
import { TRIP_SELECT, type NinjaTrip } from "@/lib/ninja/model";

export function FieldLiveMapPanel() {
  const { team } = usePermissions();
  const [trips, setTrips] = useState<NinjaTrip[]>([]);
  const [live, setLive] = useState<Record<string, LivePoint>>({});
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const [t, s] = await Promise.all([
      supabase.from("field_trips").select(TRIP_SELECT).not("status", "in", "(completed,cancelled,awaiting_assignment)").order("created_at", { ascending: false }).limit(500),
      supabase.from("field_tracking_sessions").select("trip_id,last_point_at,last_lat,last_lng").is("ended_at", null),
    ]);
    setTrips((t.data ?? []) as unknown as NinjaTrip[]);
    setLive(Object.fromEntries(((s.data ?? []) as LivePoint[]).map((x) => [x.trip_id, x])));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    if (!supabase) return;
    const ch = supabase.channel("field-live-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "field_trips" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "field_tracking_sessions" }, () => void load())
      .subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { supabase?.removeChannel(ch); clearInterval(poll); };
  }, [load]);
  return (
    <div className="rox-lock-grow overflow-auto border-2 border-zinc-300 bg-card p-3 shadow-card">
      {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading live trips…</p> : (
        <LiveOpsMap trips={trips} live={live} ninjaName={(id) => (id ? team.find((m) => m.id === id)?.name ?? "Ninja" : "—")} />
      )}
      <p className="mt-2 px-1 text-[12px] text-muted-foreground">Coloured pins = last real Ninja location (Live / Recently updated / Delayed / Stale). White circles = destinations. Location is shared only while a trip is travelling.</p>
    </div>
  );
}
