"use client";
/* Field Activity → Operations: how each Ninja handles assignments (accept / reject / reassign) and how long
   each stage takes. Moved out of Field Insights; same engine (lib/field-ops-report.ts). */
import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useRegisterSheets } from "@/components/field/activity/activity-shell";
import { KpiStrip, LoadError, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { Dash, FieldGrid, FootLabel, NameText, useFieldGrid, type FCol } from "@/components/field/grid";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import type { DateBounds } from "@/lib/field-dashboard";
import { fmtDur, ninjaRows, repairTurnaround, turnaround, type RAssignment, type REvent, type RTrip } from "@/lib/field-ops-report";


function useNinjaOps(bounds: DateBounds, storeSel: string[]) {
  const { team } = usePermissions();
  const [rows, setRows] = useState<{ trips: RTrip[]; asg: RAssignment[]; ev: REvent[] }>({ trips: [], asg: [], ev: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const available = !!supabase;
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      let qy = supabase!.from("field_trips").select("id,job_id,trip_type,status,ninja_id,branch_id,assigned_at,accepted_at,journey_started_at,arrived_at,completed_at,created_at").limit(5000);
      if (bounds.from) qy = qy.gte("created_at", new Date(`${bounds.from}T00:00:00`).toISOString());
      if (bounds.to) qy = qy.lt("created_at", new Date(new Date(`${bounds.to}T00:00:00`).getTime() + 864e5).toISOString());
      const { data: t, error } = await qy;
      if (!alive) return;
      if (error) { setErr(error.message); setLoading(false); return; }
      const trips = (t ?? []) as RTrip[];
      const ids = trips.map((x) => x.id);
      const chunks = Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => ids.slice(i * 200, i * 200 + 200));
      const asg: RAssignment[] = [], ev: REvent[] = [];
      for (const c of chunks) {
        const [x, y] = await Promise.all([
          supabase!.from("field_assignments").select("trip_id,ninja_id,outcome,assigned_at,responded_at").in("trip_id", c),
          supabase!.from("field_trip_events").select("trip_id,new_status,occurred_at").eq("event_type", "status_changed").in("trip_id", c),
        ]);
        asg.push(...((x.data ?? []) as RAssignment[])); ev.push(...((y.data ?? []) as REvent[]));
      }
      if (!alive) return;
      setErr(null); setRows({ trips, asg, ev }); setLoading(false);
    })();
    return () => { alive = false; };
  }, [bounds.from, bounds.to]);
  const scoped = useMemo(() => {
    const trips = rows.trips.filter((t) => matchesStoreSelection(t.branch_id ?? undefined, storeSel));
    const ids = new Set(trips.map((t) => t.id));
    return { trips, asg: rows.asg.filter((a) => ids.has(a.trip_id)), ev: rows.ev.filter((e) => ids.has(e.trip_id)) };
  }, [rows, storeSel]);
  const ninjas = useMemo(() => ninjaRows(scoped.trips, scoped.asg), [scoped]);
  const tat = useMemo(() => [...turnaround(scoped.trips, scoped.ev), repairTurnaround(scoped.trips, scoped.ev)], [scoped]);
  // memoised: a fresh array every render made the export effect re-run forever and froze the tab
  const named = useMemo(() => ninjas.map((r) => ({ ...r, name: team.find((m) => m.id === r.ninjaId)?.name ?? "Ninja" })), [ninjas, team]);
  return { available, loading, err, tat, ninjas: named };
}

const HEAD = ["Ninja", "Assigned", "Accepted", "Rejected", "Reassigned", "Completed", "Pickups", "Drops", "On-site", "Failed", "Completion", "Time to accept", "Trip duration"];
type OpsRow = ReturnType<typeof useNinjaOps>["ninjas"][number];

export function NinjaOps({ bounds, storeSel, q }: { bounds: DateBounds; storeSel: string[]; q?: string }) {
  const ops = useNinjaOps(bounds, storeSel);
  const rows = useMemo(() => ops.ninjas.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [ops.ninjas, q]);
  const paged = usePaged(rows, `${bounds.from}|${q}|${storeSel.join(",")}`);
  const t = (k: "assignments" | "accepted" | "rejected" | "reassigned" | "completed" | "pickups" | "drops" | "onsite" | "failed") => rows.reduce((s, r) => s + r[k], 0);
  const n = (k: "assignments" | "accepted" | "rejected" | "reassigned" | "completed" | "pickups" | "drops" | "onsite" | "failed", label: string, width = 120, cls?: (r: OpsRow) => string | false): FCol<OpsRow> =>
    ({ key: k, label, width, render: (r) => r[k] || <Dash />, foot: t(k), cellClass: cls });
  const grid = useFieldGrid<OpsRow>("activity_operations", [
    { key: "ninja", label: "Ninja", width: 220, anchor: true, render: (r) => <NameText label={r.name} href={`/field/activity/${r.ninjaId}?tab=trips`} />, foot: <FootLabel sub={`${rows.length} Ninjas`} /> },
    n("assignments", "Assigned"), n("accepted", "Accepted"), n("rejected", "Rejected", 120, (r) => r.rejected > 0 && "font-semibold text-rose-700"),
    n("reassigned", "Reassigned", 130), n("completed", "Completed", 130, () => "font-semibold"),
    n("pickups", "Pickups", 110), n("drops", "Drops", 100), n("onsite", "On-site", 110), n("failed", "Failed", 100, (r) => r.failed > 0 && "text-amber-700"),
    { key: "rate", label: "Completion", width: 130, render: (r) => <b>{Math.round(r.completionRate * 100)}%</b>, foot: t("accepted") ? `${Math.round((t("completed") / Math.max(1, t("accepted"))) * 100)}%` : "—" },
    { key: "accept", label: "Time to accept", width: 150, render: (r) => fmtDur(r.medianAcceptMs) },
    { key: "trip", label: "Trip duration", width: 150, render: (r) => fmtDur(r.medianTripMs) },
  ]);
  useRegisterSheets(useMemo(() => ops.loading ? null : [
    { name: "Ninja operations", headers: HEAD, rows: rows.map((r) => [r.name, r.assignments, r.accepted, r.rejected, r.reassigned, r.completed, r.pickups, r.drops, r.onsite, r.failed, `${Math.round(r.completionRate * 100)}%`, fmtDur(r.medianAcceptMs), fmtDur(r.medianTripMs)]) },
    { name: "Turnaround", headers: ["Stage", "Median", "Trips measured"], rows: ops.tat.map((x) => [x.label, fmtDur(x.medianMs), x.samples]) },
  ], [ops.loading, rows, ops.tat]));
  if (!ops.available) return <Unavailable text="Ninja trip records are available when RepairOX is connected to the database." />;
  if (ops.err) return <LoadError what="Ninja trips" err={ops.err} />;
  return (
    <div className="rox-lock-fill space-y-4">
      <KpiStrip loading={ops.loading} items={ops.tat.slice(0, 4).map((x) => ({ label: x.label, value: fmtDur(x.medianMs), sub: x.samples ? `median of ${x.samples} trip${x.samples > 1 ? "s" : ""}` : "not enough data yet", icon: Clock }))} />
      <ViewBar info="How each Ninja handles assignments in the month: accepted, rejected or reassigned, how fast they accept and how long a trip takes. Counted by the day the trip was created.">
        <span className="mr-2 text-[14px] text-muted-foreground"><b className="text-foreground">{t("assignments")}</b> assignments · <b className={t("rejected") ? "text-rose-700" : "text-foreground"}>{t("rejected")}</b> rejected · <b className="text-foreground">{t("completed")}</b> completed</span>
        {grid.menus}
      </ViewBar>
      <FieldGrid grid={grid} rows={paged.slice} rowKey={(r) => r.ninjaId} foot empty={ops.loading ? "Loading…" : rows.length ? null : "No Ninja trips this month."} />
      {paged.footer("Ninja")}
    </div>
  );
}
