"use client";
/* One loader for the Attendance and Distance & fuel pages: roster (Ninjas + their shifts), odometer logs,
   leave marks, GPS km, the company plan, plus the manager actions (mark a day, decide leave, weekly off).
   Math stays in lib/field-attendance.ts. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { localDateKey } from "@/lib/work-session";
import { fetchGpsKm, fetchRoster, LOG_COLS, rowToLog, rowToMark, ymRange } from "@/lib/field-attendance-data";
import { buildNinjaMonth, DEFAULT_POLICY, type DayLog, type Mark, type MarkKind, type Policy } from "@/lib/field-attendance";
import { rowToPlan } from "@/lib/field-pay-data";
import type { PlanRow } from "@/lib/field-incentives";

export function useAttendance(ym: string, tz: string, storeSel: string[], multiStore: boolean, q: string) {
  const nowMs = useMemo(() => Date.now(), []);
  const year = Number(ym.slice(0, 4));
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchRoster>> | null>(null);
  const [yearLogs, setYearLogs] = useState<DayLog[]>([]);
  const [yearMarks, setYearMarks] = useState<Mark[]>([]);
  const [gps, setGps] = useState<Map<string, number>>(new Map());
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = ymRange(ym);
      const [d, g, yl, ym2, pl] = await Promise.all([
        fetchRoster(r.from, r.to),
        fetchGpsKm(r.from, r.to, (ms) => localDateKey(ms, tz)).catch(() => new Map<string, number>()),
        supabase.from("ninja_day_logs").select(LOG_COLS).gte("day", `${year}-01-01`).lte("day", `${year}-12-31`).limit(30000),
        supabase.from("field_attendance_marks").select("id,staff_id,day,kind,status,reason,created_at").gte("day", `${year}-01-01`).lte("day", `${year}-12-31`).limit(30000),
        supabase.from("field_incentive_plans").select("id,staff_id,effective_from,config,note"),
      ]);
      setData(d); setGps(g); setYearLogs((yl.data ?? []).map(rowToLog)); setYearMarks((ym2.data ?? []).map(rowToMark)); setPlans((pl.data ?? []).map(rowToPlan)); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load attendance."); }
    setLoading(false);
  }, [ym, year, tz]);
  useEffect(() => { void load(); }, [load]);

  const ninjas = useMemo(() => (data?.ninjas ?? []).filter((n) => n.status !== "inactive" && (!multiStore || matchesStoreSelection(n.branchId ?? undefined, storeSel)) && (!q || n.name.toLowerCase().includes(q.toLowerCase()))), [data, multiStore, storeSel, q]);
  const months = useMemo(() => data ? ninjas.map((n) => ({ n, m: buildNinjaMonth({
    staffId: n.id, ym, tz, nowMs, sessions: data.sessions, logs: data.logs, marks: data.marks, weeklyOff: data.weeklyOff.get(n.id) ?? null, policy: data.policy, gps,
  }) })) : [], [data, ninjas, ym, tz, nowMs, gps]);
  const policy: Policy = data?.policy ?? DEFAULT_POLICY;
  const requests = useMemo(() => yearMarks.filter((m) => m.status === "requested" && ninjas.some((n) => n.id === m.staffId)).sort((a, b) => a.day.localeCompare(b.day)), [yearMarks, ninjas]);
  const nameOf = useCallback((id: string) => ninjas.find((n) => n.id === id)?.name ?? "Ninja", [ninjas]);

  async function setMark(staffId: string, day: string, kind: MarkKind | null, existing?: Mark) {
    if (!supabase) return false;
    let error;
    if (kind == null) { if (existing?.id) ({ error } = await supabase.from("field_attendance_marks").delete().eq("id", existing.id)); }
    else if (existing?.id) ({ error } = await supabase.from("field_attendance_marks").update({ kind, status: "approved" }).eq("id", existing.id));
    else ({ error } = await supabase.from("field_attendance_marks").insert({ staff_id: staffId, day, kind, status: "approved" }));
    if (error) { toast.error("Could not save the mark."); return false; }
    toast.success("Saved."); void load(); return true;
  }
  async function decide(m: Mark, approve: boolean) {
    if (!supabase || !m.id) return false;
    const { error } = await supabase.from("field_attendance_marks").update({ status: approve ? "approved" : "rejected" }).eq("id", m.id);
    if (error) { toast.error("Could not save the decision."); return false; }
    toast.success(approve ? "Leave approved." : "Leave rejected."); void load(); return true;
  }
  async function setWeeklyOff(staffId: string, v: string) {
    if (!supabase) return;
    const { error } = v === "" ? await supabase.from("field_weekly_off").delete().eq("staff_id", staffId) : await supabase.from("field_weekly_off").upsert({ staff_id: staffId, weekday: Number(v), updated_at: new Date().toISOString() }, { onConflict: "staff_id" });
    if (error) toast.error("Could not save."); else void load();
  }
  return { nowMs, year, data, ninjas, months, policy, requests, yearLogs, yearMarks, gps, plans, err, loading, load, nameOf, setMark, decide, setWeeklyOff };
}
export type AttendanceState = ReturnType<typeof useAttendance>;
