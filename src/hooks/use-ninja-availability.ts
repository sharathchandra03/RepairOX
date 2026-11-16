"use client";
/* Duty + trip state for a set of Ninjas (assigning manager). Polls every 20s and on tab focus. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { NinjaAvailabilityRow } from "@/lib/field-availability";

export function useNinjaAvailability(ids: string[], enabled = true): { map: Map<string, NinjaAvailabilityRow>; loaded: boolean } {
  const key = useMemo(() => [...ids].sort().join(","), [ids]);
  const [rows, setRows] = useState<NinjaAvailabilityRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!supabase || !key) return;
    const { data, error } = await supabase.rpc("field_ninja_availability", { p_staff: key.split(",") });
    if (error) { setLoaded(true); return; }
    const next = (data ?? []) as NinjaAvailabilityRow[];
    setRows((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next));
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const iv = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20000);
    const vis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [enabled, load]);
  return { map: useMemo(() => new Map(rows.map((r) => [r.staff_id, r])), [rows]), loaded };
}
