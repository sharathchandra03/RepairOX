"use client";
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Reporting. Real trips only (store/RLS scoped), one date
   window + store filter drives every number. Business = finalized invoices.
   Math lives in lib/field-reports.ts (tested); this file is presentation.
   ────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Truck, CheckCircle2, XCircle, Clock, Timer, Target, IndianRupee, UserX, Download, ChevronDown, FileSpreadsheet, FileText,
  BarChart3, AlertTriangle,
} from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { PageHeader } from "@/components/layout/page-header";
import { RequireCapability } from "@/components/common/require-capability";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { TableSearch } from "@/components/common/table-utility-bar";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { InfoHint } from "@/components/ui/info-hint";
import { FieldKpiCards, type FieldKpi } from "@/components/field/field-kpi-cards";
import { Panel } from "@/components/field/overview/widgets";
import { Frame, Head, inr } from "@/components/field/dashboard/dashboard-table";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { cn } from "@/lib/utils";
import { CAP } from "@/lib/capabilities";
import { FIELD_STATUS_LABEL, FIELD_STATUS_TONE } from "@/lib/field-data";
import { boundsForPreset, tripDateOf, type DashPreset } from "@/lib/field-dashboard";
import {
  jobsInWindow, summarize, byNinja, byStore, byTripType, bySource, statusMix, funnel, series, exceptions,
  type BreakdownRow, type ExceptionKind,
} from "@/lib/field-reports";
import { downloadXLSX, downloadCSV, toCSV } from "@/lib/csv-utils";

type Tab = "overview" | "ninjas" | "stores" | "exceptions";
const PRESETS: { label: string; value: DashPreset }[] = [
  { label: "All", value: "all" }, { label: "Today", value: "today" }, { label: "7 Days", value: "7days" },
  { label: "This Month", value: "month" }, { label: "Last Month", value: "lastmonth" }, { label: "This Year", value: "year" },
  { label: "Custom", value: "custom" },
];
const pctTxt = (n: number | null) => (n == null ? "—" : `${n}%`);

export default function FieldReportsPage() {
  return (
    <RequireCapability anyOf={CAP.field.reports}>
      <Reports />
    </RequireCapability>
  );
}

function Reports() {
  const router = useRouter();
  const { jobs, hydrated, ctx, multiStore, canTeam } = useFieldDashboard();
  const [preset, setPreset] = useState<DashPreset>("month");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [kind, setKind] = useState<"all" | ExceptionKind>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);

  const bounds = useMemo(() => boundsForPreset(preset, from, to), [preset, from, to]);
  const scoped = useMemo(
    () => jobsInWindow(jobs, bounds).filter((j) => !multiStore || matchesStoreSelection(j.branchId, storeFilter)),
    [jobs, bounds, multiStore, storeFilter],
  );
  const now = useMemo(() => new Date(), []);
  const sum = useMemo(() => summarize(scoped, ctx, now), [scoped, ctx, now]);
  const live = useMemo(() => scoped.filter((j) => j.status !== "cancelled"), [scoped]);
  const ninjas = useMemo(() => byNinja(scoped, ctx, now), [scoped, ctx, now]);
  const stores = useMemo(() => byStore(scoped, ctx, now), [scoped, ctx, now]);
  const types = useMemo(() => byTripType(scoped, ctx, now), [scoped, ctx, now]);
  const sources = useMemo(() => bySource(scoped, ctx, now), [scoped, ctx, now]);
  const mix = useMemo(() => statusMix(live), [live]);
  const steps = useMemo(() => funnel(scoped), [scoped]);
  const ser = useMemo(() => series(scoped, ctx), [scoped, ctx]);
  const exc = useMemo(() => exceptions(scoped, now), [scoped, now]);

  const tabs = [
    { label: "Overview", value: "overview" },
    ...(canTeam ? [{ label: "Ninja performance", value: "ninjas" }] : []),
    ...(multiStore ? [{ label: "Stores", value: "stores" }] : []),
    { label: `Exceptions${exc.length ? ` (${exc.length})` : ""}`, value: "exceptions" },
  ];
  const activeTab: Tab = tabs.some((t) => t.value === tab) ? tab : "overview";

  const kpis: FieldKpi[] = [
    { key: "total", label: "Trips", value: sum.total, tone: "sky", Icon: Truck, hint: `${sum.open} open`, share: 100 },
    { key: "done", label: "Completed", value: sum.completed, tone: "emerald", Icon: CheckCircle2, hint: `${pctTxt(sum.completionRate)} completion`, share: sum.completionRate ?? 0 },
    { key: "ontime", label: "On-time pickups", value: pctTxt(sum.onTimeRate), tone: "teal", Icon: Target, hint: "proof on/before schedule", share: sum.onTimeRate ?? 0 },
    { key: "avg", label: "Avg pickup time", value: sum.avgPickupHours == null ? "—" : `${sum.avgPickupHours}h`, tone: "violet", Icon: Timer, hint: "created → collected" },
    { key: "delayed", label: "Delayed now", value: sum.delayed, tone: "amber", Icon: Clock, hint: "past scheduled date", share: sum.total ? Math.round((sum.delayed / sum.total) * 100) : 0 },
    { key: "failed", label: "Failed", value: sum.failedPickup + sum.failedDrop, tone: "rose", Icon: XCircle, hint: `${sum.failedPickup} pickup · ${sum.failedDrop} drop`, share: sum.total ? Math.round(((sum.failedPickup + sum.failedDrop) / sum.total) * 100) : 0 },
    { key: "unassigned", label: "Unassigned", value: sum.unassigned, tone: "slate", Icon: UserX, hint: `${sum.cancelled} cancelled`, share: sum.total ? Math.round((sum.unassigned / sum.total) * 100) : 0 },
    { key: "biz", label: "Business", value: inr(sum.business), tone: "emerald", Icon: IndianRupee, hint: sum.invoices ? `${sum.invoices} invoice${sum.invoices > 1 ? "s" : ""} · avg ${inr(sum.avgBusinessPerCompleted)}/trip` : "No finalized invoices" },
  ];

  /* ─── export (active tab; Excel primary + CSV from one row-builder) ─── */
  const exportSet = useMemo(() => {
    const bd = (rows: BreakdownRow[], first: string) => ({
      headers: [first, "Trips", "Completed", "Failed", "Cancelled", "Delayed", "Completion %", "On-time %", "Avg pickup (h)", "Business (₹)"],
      rows: rows.map((r) => [r.label, r.total, r.completed, r.failed, r.cancelled, r.delayed, r.completionRate ?? "", r.onTimeRate ?? "", r.avgPickupHours ?? "", r.business ?? ""] as (string | number)[]),
    });
    if (activeTab === "ninjas") return { name: "ninja-performance", ...bd(ninjas, "Ninja") };
    if (activeTab === "stores") return { name: "store-performance", ...bd(stores, "Store") };
    if (activeTab === "exceptions") return {
      name: "exceptions", headers: ["Trip", "Customer", "Type", "Status", "Ninja", "Store", "Date", "Issue"],
      rows: exc.map((e) => [e.job.jobNo, e.job.customer, e.kind, FIELD_STATUS_LABEL[e.job.status], e.job.ninjaName || "Unassigned", e.job.branch, tripDateOf(e.job), e.reason] as (string | number)[]),
    };
    return { name: "trip-types", ...bd(types, "Trip type") };
  }, [activeTab, ninjas, stores, exc, types]);
  const fname = `field-${exportSet.name}-${new Date().toISOString().slice(0, 10)}`;

  const excFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return exc.filter((e) => (kind === "all" || e.kind === kind) && (!s || `${e.job.jobNo} ${e.job.customer} ${e.job.ninjaName} ${e.job.phone}`.toLowerCase().includes(s)));
  }, [exc, kind, q]);
  const totalPages = Math.max(1, Math.ceil(excFiltered.length / pageSize));
  const paged = excFiltered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div><BackPill href="/field" label="Back to Pickup & Drop" /></div>
      <PageHeader eyebrow="Field Management" title="Field Reporting"
        subtitle="Operational results for the selected window. Business counts finalized invoices only."
        actions={
          <Dropdown width="w-52" trigger={({ toggle }) => (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}>
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          )}>
            {(close) => (
              <>
                <MenuItem icon={FileSpreadsheet} onClick={() => { void downloadXLSX(`${fname}.xlsx`, exportSet.headers, exportSet.rows, "Field report"); close(); }}>Excel (.xlsx)</MenuItem>
                <MenuItem icon={FileText} onClick={() => { downloadCSV(`${fname}.csv`, toCSV(exportSet.headers, exportSet.rows)); close(); }}>CSV (.csv)</MenuItem>
              </>
            )}
          </Dropdown>
        } />

      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" value={preset} onChange={(v) => { setPreset(v as DashPreset); setPage(1); }} options={PRESETS} />
        </div>
        {multiStore && <StoreMultiSelect value={storeFilter} onChange={(v) => { setStoreFilter(v); setPage(1); }} />}
        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
          {hydrated ? `${sum.total} trips in window` : "Loading…"}
          <InfoHint content="Trips are placed in the window by their scheduled date (pickup, else drop, else created). Cancelled trips are excluded from trip totals." />
        </span>
      </div>
      <DateRangePicker open={preset === "custom"} from={from} to={to} onFromChange={(v) => { setPreset("custom"); setFrom(v); }} onToChange={(v) => { setPreset("custom"); setTo(v); }} />

      <FieldKpiCards items={kpis} total={sum.total} columns="lg:grid-cols-4" />

      <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedTabs size="sm" value={activeTab} onChange={(v) => { setTab(v as Tab); setPage(1); }} options={tabs} />
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <Panel title={ser.granularity === "month" ? "Trips by month" : "Trips by day"} icon={BarChart3} className="h-auto">
              <SeriesChart pts={ser.points} />
            </Panel>
            <Panel title="By trip type" icon={Truck} className="h-auto" bodyClassName="p-3">
              <BreakdownTable rows={types} first="Trip type" />
            </Panel>
            <Panel title="By source" icon={Target} className="h-auto" bodyClassName="p-3">
              <BreakdownTable rows={sources} first="Source" />
            </Panel>
          </div>
          <div className="space-y-5">
            <Panel title="Trip funnel" icon={Target} className="h-auto">
              {steps[0].count === 0 ? <p className="text-[12.5px] text-muted-foreground">No trips in this window.</p> : (
                <ul className="space-y-3">
                  {steps.map((s) => (
                    <li key={s.key}>
                      <div className="mb-1 flex items-baseline justify-between text-[12.5px]"><span className="font-medium">{s.label}</span><span className="tabular-nums"><strong>{s.count}</strong> <span className="text-muted-foreground">· {pctTxt(s.pctOfTotal)}</span></span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-[#4361EE] to-[#7C8CF5]" style={{ width: `${s.pctOfTotal ?? 0}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">Share of non-cancelled trips that reached each stage.</p>
            </Panel>
            <Panel title="Status mix" icon={BarChart3} className="h-auto">
              {mix.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No trips in this window.</p> : (
                <ul className="space-y-1.5">
                  {mix.map((m) => (
                    <li key={m.status} className="flex items-center justify-between gap-2">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[m.status])}>{FIELD_STATUS_LABEL[m.status]}</span>
                      <span className="text-[13px] font-bold tabular-nums">{m.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "ninjas" && (
        <Panel title="Ninja performance" icon={Truck} className="h-auto" bodyClassName="p-3">
          <BreakdownTable rows={ninjas} first="Ninja" />
        </Panel>
      )}
      {activeTab === "stores" && (
        <Panel title="Store performance" icon={Truck} className="h-auto" bodyClassName="p-3">
          <BreakdownTable rows={stores} first="Store" />
        </Panel>
      )}

      {activeTab === "exceptions" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs size="sm" value={kind} onChange={(v) => { setKind(v as typeof kind); setPage(1); }}
              options={[{ label: "All", value: "all" }, { label: "Delayed", value: "delayed" }, { label: "Failed", value: "failed" }, { label: "Cancelled", value: "cancelled" }]} />
            <TableSearch value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search exceptions by trip no, customer, phone or Ninja…" />
          </div>
          <Frame>
            <table className="w-full table-fixed text-[14px]">
              <colgroup><col style={{ width: "13%" }} /><col style={{ width: "22%" }} /><col style={{ width: "12%" }} /><col style={{ width: "17%" }} /><col style={{ width: "16%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /></colgroup>
              <Head cols={["Trip", "Customer", "Type", "Status", "Ninja", "Date", "Reason"]} />
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                    <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-500" />No exceptions in this window.</td></tr>
                ) : paged.map((e) => (
                  <tr key={e.job.id} onClick={() => router.push(`/field/${e.job.id}`)} className="h-[68px] cursor-pointer border-t border-zinc-500 align-middle hover:bg-muted/40">
                    <td className="px-3 py-4 text-center font-semibold text-[#4361EE]">{e.job.jobNo}</td>
                    <td className="truncate px-3 py-4 text-center">{e.job.customer || "—"}</td>
                    <td className="px-3 py-4 text-center"><span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset", e.kind === "delayed" ? "bg-amber-50 text-amber-800 ring-amber-200" : e.kind === "failed" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-zinc-100 text-zinc-700 ring-zinc-200")}>{e.kind}</span></td>
                    <td className="px-3 py-4 text-center"><span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[e.job.status])}>{FIELD_STATUS_LABEL[e.job.status]}</span></td>
                    <td className="truncate px-3 py-4 text-center">{e.job.ninjaName || <span className="text-zinc-400">—</span>}</td>
                    <td className="px-3 py-4 text-center tabular-nums">{tripDateOf(e.job) || "—"}</td>
                    <td className="truncate px-3 py-4 text-center text-[12px] text-muted-foreground" title={e.reason}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Frame>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={excFiltered.length} pageSize={pageSize}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="exception" />
        </div>
      )}
      {activeTab !== "exceptions" && exc.length > 0 && (
        <button onClick={() => setTab("exceptions")} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800 hover:underline">
          <AlertTriangle className="h-4 w-4" /> {exc.length} trip{exc.length > 1 ? "s" : ""} need review — open exceptions
        </button>
      )}
    </div>
  );
}

function BreakdownTable({ rows, first }: { rows: BreakdownRow[]; first: string }) {
  if (rows.length === 0) return <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">No trips in this window.</p>;
  return (
    <Frame>
      <table className="w-full min-w-[760px] table-fixed text-[14px]">
        <colgroup><col style={{ width: "22%" }} />{Array.from({ length: 8 }).map((_, i) => <col key={i} style={{ width: "9.75%" }} />)}</colgroup>
        <Head cols={[first, "Trips", "Done", "Failed", "Delayed", "Done %", "On-time", "Avg pickup", "Business"]} />
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="h-[56px] border-t border-zinc-500 align-middle text-center tabular-nums hover:bg-muted/40">
              <td className="px-3 py-3 text-left text-[13px] font-semibold">{r.label}</td>
              <td className="px-3 py-3 font-semibold">{r.total}</td>
              <td className="px-3 py-3">{r.completed}</td>
              <td className={cn("px-3 py-3", r.failed > 0 && "font-semibold text-rose-700")}>{r.failed}</td>
              <td className={cn("px-3 py-3", r.delayed > 0 && "font-semibold text-amber-700")}>{r.delayed}</td>
              <td className="px-3 py-3">{pctTxt(r.completionRate)}</td>
              <td className="px-3 py-3">{pctTxt(r.onTimeRate)}</td>
              <td className="px-3 py-3">{r.avgPickupHours == null ? "—" : `${r.avgPickupHours}h`}</td>
              <td className="px-3 py-3 font-semibold text-emerald-700">{inr(r.business)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

function SeriesChart({ pts }: { pts: { key: string; label: string; scheduled: number; completed: number; business: number }[] }) {
  const W = 640, H = 170, padB = 22, chartH = H - padB;
  const max = Math.max(1, ...pts.map((p) => p.scheduled));
  const bw = (W - 4) / Math.max(pts.length, 1);
  const step = Math.max(1, Math.ceil(pts.length / 12));
  return (
    <div className="relative">
      <div className="mb-2 flex gap-5 text-[12px]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> Scheduled</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Completed</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[190px] w-full" role="img" aria-label="Trips scheduled and completed over time">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={4} x2={W} y1={chartH - chartH * g} y2={chartH - chartH * g} stroke="currentColor" className="text-border" strokeDasharray="3 4" />)}
        <line x1={4} x2={W} y1={chartH} y2={chartH} stroke="currentColor" className="text-border" />
        {pts.map((p, i) => {
          const x = 4 + i * bw; const hs = (p.scheduled / max) * chartH; const hc = (p.completed / max) * chartH;
          return (
            <g key={p.key}>
              <title>{`${p.label}: ${p.scheduled} scheduled · ${p.completed} completed${p.business ? ` · ${inr(p.business)}` : ""}`}</title>
              <rect x={x + bw * 0.14} y={chartH - hs} width={bw * 0.72} height={hs} rx="3" className="fill-sky-300" />
              <rect x={x + bw * 0.14} y={chartH - hc} width={bw * 0.72} height={hc} rx="3" className="fill-emerald-500" />
              {i % step === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>{p.label}</text>}
            </g>
          );
        })}
      </svg>
      {pts.length === 0 && <p className="pointer-events-none absolute inset-x-0 top-[42%] text-center text-[12.5px] text-muted-foreground">No trips in this window</p>}
    </div>
  );
}
