"use client";
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Operations Report (Ninja trips).
   Real trip / assignment / event rows (RLS-scoped) → the pure engine in
   lib/field-ops-report.ts (tested). Business = finalized invoices only, kept
   separate from trip counts. Export == on-screen (same row builders). ──── */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText, Timer, Truck, UserX, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequireCapability } from "@/components/common/require-capability";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP } from "@/lib/capabilities";
import { downloadCSV, downloadXLSXWorkbook, toCSV } from "@/lib/csv-utils";
import { fmtDur, ninjaRows, repairTurnaround, storeRows, turnaround, type RAssignment, type REvent, type RJob, type RTrip } from "@/lib/field-ops-report";

type Period = "all" | "today" | "7d" | "month" | "last_month" | "custom";
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function range(p: Period, from: string, to: string): [Date | null, Date | null] {
  const n = new Date(), sod = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (p === "today") return [sod, null];
  if (p === "7d") return [new Date(sod.getTime() - 6 * 864e5), null];
  if (p === "month") return [new Date(n.getFullYear(), n.getMonth(), 1), null];
  if (p === "last_month") return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 1)];
  if (p === "custom" && from && to) return [new Date(from + "T00:00:00"), new Date(new Date(to + "T00:00:00").getTime() + 864e5)];
  return [null, null];
}

function Report() {
  const { team } = usePermissions();
  const { invoices } = useStore();
  const { stores, isAllShops } = useStoreContext();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [storeSel, setStoreSel] = useState<string[]>([]);
  const [rows, setRows] = useState<{ trips: RTrip[]; asg: RAssignment[]; ev: REvent[]; jobs: RJob[] }>({ trips: [], asg: [], ev: [], jobs: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [a, b] = range(period, from, to);
    let q = supabase.from("field_trips").select("id,job_id,trip_type,status,ninja_id,branch_id,assigned_at,accepted_at,journey_started_at,arrived_at,completed_at,created_at").limit(5000);
    if (a) q = q.gte("created_at", a.toISOString());
    if (b) q = q.lt("created_at", b.toISOString());
    const { data: t, error } = await q;
    if (error) { setErr(error.message); setLoading(false); return; }
    const trips = (t ?? []) as RTrip[];
    const ids = trips.map((x) => x.id), jobIds = [...new Set(trips.map((x) => x.job_id))];
    const chunk = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
    const asg: RAssignment[] = [], ev: REvent[] = [], jobs: RJob[] = [];
    for (const c of chunk(ids)) {
      const [x, y] = await Promise.all([
        supabase.from("field_assignments").select("trip_id,ninja_id,outcome,assigned_at,responded_at").in("trip_id", c),
        supabase.from("field_trip_events").select("trip_id,new_status,occurred_at").eq("event_type", "status_changed").in("trip_id", c),
      ]);
      asg.push(...((x.data ?? []) as RAssignment[])); ev.push(...((y.data ?? []) as REvent[]));
    }
    for (const c of chunk(jobIds)) {
      const { data } = await supabase.from("field_jobs").select("id,branch_id,linked_ticket_id").in("id", c);
      jobs.push(...((data ?? []) as RJob[]));
    }
    setErr(null); setRows({ trips, asg, ev, jobs }); setLoading(false);
  }, [period, from, to]);
  useEffect(() => { void load(); }, [load]);

  const scoped = useMemo(() => {
    const trips = rows.trips.filter((t) => matchesStoreSelection(t.branch_id ?? undefined, storeSel));
    const ids = new Set(trips.map((t) => t.id));
    return { trips, asg: rows.asg.filter((a) => ids.has(a.trip_id)), ev: rows.ev.filter((e) => ids.has(e.trip_id)) };
  }, [rows, storeSel]);

  const ninjas = useMemo(() => ninjaRows(scoped.trips, scoped.asg), [scoped]);
  const storesR = useMemo(() => storeRows(scoped.trips, rows.jobs, invoices as never), [scoped, rows.jobs, invoices]);
  const tat = useMemo(() => [...turnaround(scoped.trips, scoped.ev), repairTurnaround(scoped.trips, scoped.ev)], [scoped]);
  const name = (id: string) => team.find((m) => m.id === id)?.name ?? "Ninja";
  const sname = (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? "Store" : "No store");
  const k = {
    total: scoped.trips.length,
    done: scoped.trips.filter((t) => t.status === "completed").length,
    failed: scoped.trips.filter((t) => ["failed_attempt", "customer_unavailable"].includes(t.status)).length,
    rejected: scoped.asg.filter((a) => a.outcome === "rejected").length,
    business: storesR.reduce((s, r) => s + r.business, 0),
  };

  const ninjaHead = ["Ninja", "Assignments", "Accepted", "Rejected", "Reassigned", "Completed", "Pickups", "Drops", "On-site", "Failed attempts", "Completion rate %", "Median time to accept", "Median trip duration"];
  const ninjaBody = ninjas.map((r) => [name(r.ninjaId), r.assignments, r.accepted, r.rejected, r.reassigned, r.completed, r.pickups, r.drops, r.onsite, r.failed, Math.round(r.completionRate * 100), fmtDur(r.medianAcceptMs), fmtDur(r.medianTripMs)]);
  const storeHead = ["Store", "Total trips", "Pickup", "Drop", "On-site", "Completed", "Active", "Unassigned", "Failed", "Business (finalized ₹)", "Finalized invoices"];
  const storeBody = storesR.map((r) => [sname(r.branchId), r.total, r.pickup, r.drop, r.onsite, r.completed, r.active, r.pending, r.failed, r.business, r.invoices]);
  const tatHead = ["Stage", "Median", "Trips measured"];
  const tatBody = tat.map((x) => [x.label, fmtDur(x.medianMs), x.samples]);
  const stamp = ymd(new Date());

  const frame = "border-2 border-zinc-300 bg-card shadow-card";
  const th = "px-4 py-4";
  return (
    <div className="space-y-5">
      <PageHeader title="Field Operations Report" subtitle="Ninja trips, acceptance, turnaround and business — from real trip records."
        actions={
          <Dropdown align="right" trigger={({ toggle }) => <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}><Download className="h-3.5 w-3.5" />Export<ChevronDown className="h-3.5 w-3.5" /></Button>}>
            {(close: () => void) => (<>
              <MenuItem icon={FileSpreadsheet} onClick={() => { void downloadXLSXWorkbook(`field-ops-report-${stamp}.xlsx`, [
                { name: "Ninjas", headers: ninjaHead, rows: ninjaBody }, { name: "Stores", headers: storeHead, rows: storeBody }, { name: "Turnaround", headers: tatHead, rows: tatBody }]); close(); }}>Excel (.xlsx)</MenuItem>
              <MenuItem icon={FileText} onClick={() => { downloadCSV(`field-ops-ninjas-${stamp}.csv`, toCSV(ninjaHead, ninjaBody)); close(); }}>CSV (.csv)</MenuItem>
            </>)}
          </Dropdown>
        } />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" value={period} onChange={(v) => setPeriod(v as Period)} options={[
            { value: "all", label: "All" }, { value: "today", label: "Today" }, { value: "7d", label: "7 Days" }, { value: "month", label: "This Month" },
            { value: "last_month", label: "Last Month" }, { value: "custom", label: "Custom" }]} />
        </div>
        {isAllShops && stores.length > 1 ? <StoreMultiSelect value={storeSel} onChange={setStoreSel} /> : null}
      </div>
      <DateRangePicker open={period === "custom"} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      {err ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load trips: {err}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { l: "Total trips", v: k.total, i: Truck }, { l: "Completed", v: k.done, i: CheckCircle2 }, { l: "Failed attempts", v: k.failed, i: XCircle },
          { l: "Rejected assignments", v: k.rejected, i: UserX }, { l: "Business (finalized)", v: `₹${k.business.toLocaleString("en-IN")}`, i: BarChart3 },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border-2 border-zinc-200 bg-card p-4 shadow-card transition hover:border-[#4361EE]/30">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><c.i className="h-4 w-4" /></span>
            <p className="mt-3 text-[24px] font-extrabold leading-none tabular-nums">{loading ? "–" : c.v}</p>
            <p className="mt-1 text-[12px] font-semibold text-muted-foreground">{c.l}</p>
          </div>
        ))}
      </div>
      <p className="-mt-2 flex items-center gap-1 text-[12px] text-muted-foreground">Trips are counted by creation date in the selected period. <InfoHint content="Business counts only paid, non-proforma invoices on the job's linked ticket, once per job. A completed trip is not revenue." /></p>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider">Ninja performance</h2>
        <div className={frame}><div className="[overflow-x:auto]">
          <table className="w-full min-w-[1100px] table-fixed text-[14px]">
            <thead className="border-b-2 border-white/35 bg-[#5368D4]"><tr className="text-left text-[12px] font-bold uppercase tracking-wider text-white">{ninjaHead.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{ninjaBody.length === 0 ? <tr><td colSpan={ninjaHead.length} className="p-8 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No Ninja trips in this period."}</td></tr>
              : ninjaBody.map((r, i) => <tr key={i} className="h-[68px] border-t border-zinc-500 align-middle hover:bg-muted/40">{r.map((c, j) => <td key={j} className={`px-4 py-4 tabular-nums ${j === 0 ? "font-semibold" : ""}`}>{c}</td>)}</tr>)}</tbody>
          </table></div></div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider">Stores</h2>
        <div className={frame}><div className="[overflow-x:auto]">
          <table className="w-full min-w-[1000px] table-fixed text-[14px]">
            <thead className="border-b-2 border-white/35 bg-[#5368D4]"><tr className="text-left text-[12px] font-bold uppercase tracking-wider text-white">{storeHead.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{storeBody.length === 0 ? <tr><td colSpan={storeHead.length} className="p-8 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No trips."}</td></tr>
              : storeBody.map((r, i) => <tr key={i} className="h-[68px] border-t border-zinc-500 align-middle hover:bg-muted/40">{r.map((c, j) => <td key={j} className={`px-4 py-4 tabular-nums ${j === 0 ? "font-semibold" : ""}`}>{j === 9 ? `₹${Number(c).toLocaleString("en-IN")}` : c}</td>)}</tr>)}</tbody>
          </table></div></div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider"><Timer className="h-4 w-4 text-[#4361EE]" />Turnaround (median)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tat.map((x) => (
            <div key={x.key} className="rounded-xl border-2 border-zinc-200 bg-card p-4 shadow-card">
              <p className="text-[12px] font-semibold text-muted-foreground">{x.label}</p>
              <p className="mt-1.5 text-[20px] font-extrabold tabular-nums">{fmtDur(x.medianMs)}</p>
              <p className="text-[11px] text-muted-foreground">{x.samples ? `${x.samples} trip${x.samples > 1 ? "s" : ""} measured` : "Not enough data"}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function FieldOpsReportPage() {
  return <RequireCapability anyOf={CAP.field.reports}><Report /></RequireCapability>;
}
