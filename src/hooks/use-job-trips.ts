"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TripStatus, TripType } from "@/lib/ninja/model";

export interface JobTrip { id: string; trip_no: string | null; trip_type: TripType; status: TripStatus; ninja_id: string | null }

/** Live list of Ninja trips for one Field job (RLS-scoped, realtime). */
export function useJobTrips(jobId: string | undefined) {
  const [trips, setTrips] = useState<JobTrip[]>([]);
  useEffect(() => {
    if (!supabase || !jobId) return;
    let off = false;
    const load = async () => {
      const { data } = await supabase!.from("field_trips").select("id,trip_no,trip_type,status,ninja_id").eq("job_id", jobId).order("created_at");
      if (!off) setTrips((data ?? []) as JobTrip[]);
    };
    void load();
    const ch = supabase.channel(`use-job-trips-${jobId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_trips", filter: `job_id=eq.${jobId}` }, () => void load()).subscribe();
    return () => { off = true; supabase?.removeChannel(ch); };
  }, [jobId]);
  const open = trips.filter((t) => !["completed", "cancelled", "failed_attempt", "customer_unavailable", "rescheduled", "return_to_store"].includes(t.status));
  return { trips, open, executing: open.find((t) => t.status !== "awaiting_assignment") ?? null };
}
