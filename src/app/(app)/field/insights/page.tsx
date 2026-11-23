"use client";
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Insights.
   ONE page for trip analysis (the people parts live in Field Activity).
   A sticky selector deck at the top (period · stores · view by · trip type ·
   compare metrics · vs previous) drives EVERY section below, and a section
   rail jumps between them — nobody has to scroll back up to re-select.
     Overview KPIs → Compare (side-by-side + trend) → Performance table →
     Month by month → Store activity → Funnel & status → Exceptions
   Real trips only (RLS + store scoped). Business = finalized invoices only.
   Math: lib/field-insights.ts + lib/field-reports.ts + lib/field-dashboard.ts
   + lib/field-ops-report.ts (all pure). Export == on-screen (same rows).
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText, GitCompareArrows, IndianRupee,
  ListChecks, Target, Timer, TriangleAlert, Truck, CalendarRange, Table2, Filter,
} from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { CAP } from "@/lib/capabilities";
import { RequireCapability } from "@/components/common/require-capability";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { TableSearch } from "@/components/common/table-utility-bar";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/input";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { InfoHint } from "@/components/ui/info-hint";
import { FieldKpiCards } from "@/components/field/field-kpi-cards";
import { Panel } from "@/components/field/overview/widgets";
import { Frame, Head, NameCell, Dash, EmptyRows, inr } from "@/components/field/dashboard/dashboard-table";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { InsightsDeck, ChipToggle, type DeckItem } from "@/components/field/insights/insights-deck";
import { CompareBars, TrendLines, ENTITY_COLORS } from "@/components/field/insights/compare-charts";
import { cn } from "@/lib/utils";
import { FIELD_STATUS_LABEL, FIELD_STATUS_TONE, type FieldJob } from "@/lib/field-data";
import {
  boundsForPreset, tripDateOf, tripGroupOf, buildMasterRows, availableYears, DASH_PRESETS, MONTH_NAMES,
  type DashPreset, type GroupBy, type TripGroup, type DateBounds,
} from "@/lib/field-dashboard";
import { jobsInWindow, statusMix, funnel, exceptions, type ExceptionKind } from "@/lib/field-reports";
import {
  insightRows, totalRow, previousBounds, boundsLabel, trendBuckets, trendSeries, metricDef, formatMetric, pctDelta,
  INSIGHT_BY_LABEL, METRICS, type InsightBy, type InsightRow, type MetricKey,
} from "@/lib/field-insights";
import { DailyActivity } from "@/components/field/insights/daily-activity";
import { Dash as GDash, FieldGrid, FootLabel, NameText, useFieldGrid, type FCol } from "@/components/field/grid";
import { downloadXLSXWorkbook, downloadCSV, toCSV } from "@/lib/csv-utils";

type TypeFilter = "all" | TripGroup;
const pad = (n: number) => String(n).padStart(2, "0");
const pctTxt = (n: number | null) => (n == null ? "—" : `${n}%`);

export default function FieldInsightsPage() {
  return (
    <RequireCapability anyOf={CAP.field.reports}>
      <Insights />
    </RequireCapability>
  );
}

function Insights() {
  const router = useRouter();
  const { jobs, hydrated, ctx, multiStore, canTeam } = useFieldDashboard();

  /* ─── selections (one source for every section) ─── */
  const [preset, setPreset] = useState<DashPreset>("thismonth");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [storeSel, setStoreSel] = useState<string[]>([]);
  const [by, setBy] = useState<InsightBy>(multiStore ? "store" : canTeam ? "engineer" : "type");
  const [typeF, setTypeF] = useState<TypeFilter>("all");
  const [metrics, setMetrics] = useState<MetricKey[]>(["trips", "completed", "business"]);
  const [vs, setVs] = useState<"none" | "prev">("prev");

  const byOptions = useMemo(() => (["store", "engineer", "agent", "source", "type"] as InsightBy[])
    .filter((k) => (k === "engineer" ? canTeam : true)), [canTeam]);
  const effBy: InsightBy = byOptions.includes(by) ? by : byOptions[0];

  const now = useMemo(() => new Date(), []);
  const bounds = useMemo(() => boundsForPreset(preset, from, to, now), [preset, from, to, now]);
  const prevB = useMemo(() => previousBounds(preset, bounds), [preset, bounds]);
  const filterJobs = useCallback((js: FieldJob[]) => js.filter((j) =>
    (!multiStore || matchesStoreSelection(j.branchId, storeSel)) && (typeF === "all" || tripGroupOf(j) === typeF)), [multiStore, storeSel, typeF]);

  const scoped = useMemo(() => filterJobs(jobsInWindow(jobs, bounds)), [jobs, bounds, filterJobs]);
  const prevScoped = useMemo(() => (prevB ? filterJobs(jobsInWindow(jobs, prevB)) : []), [jobs, prevB, filterJobs]);
  const rows = useMemo(() => insightRows(scoped, effBy, ctx, now), [scoped, effBy, ctx, now]);
  const prevRows = useMemo(() => new Map(insightRows(prevScoped, effBy, ctx, now).map((r) => [r.key, r])), [prevScoped, effBy, ctx, now]);
  const tot = useMemo(() => totalRow(scoped, ctx, now), [scoped, ctx, now]);
  const prevTot = useMemo(() => (prevB ? totalRow(prevScoped, ctx, now) : null), [prevB, prevScoped, ctx, now]);
  const showPrev = vs === "prev" && !!prevB;

  /* ─── compare: which entities ─── */
  const [picked, setPicked] = useState<string[] | null>(null); // null = auto top 5
  const rankKey = metrics[0];
  const ranked = useMemo(() => [...rows].sort((a, b) => ((b[rankKey] as number | null) ?? -1) - ((a[rankKey] as number | null) ?? -1)), [rows, rankKey]);
  const chosenKeys = useMemo(() => {
    const valid = (picked ?? []).filter((k) => rows.some((r) => r.key === k));
    return picked && valid.length ? valid : ranked.slice(0, 5).map((r) => r.key);
  }, [picked, rows, ranked]);
  useEffect(() => { setPicked(null); }, [effBy]);
  const colorOf = useCallback((k: string) => ENTITY_COLORS[Math.max(0, ranked.findIndex((r) => r.key === k)) % ENTITY_COLORS.length], [ranked]);
  const chosenRows = useMemo(() => chosenKeys.map((k) => rows.find((r) => r.key === k)!).filter(Boolean), [chosenKeys, rows]);
  const [trendMetric, setTrendMetric] = useState<MetricKey>("trips");
  const tm: MetricKey = metrics.includes(trendMetric) ? trendMetric : metrics[0];
  const buckets = useMemo(() => trendBuckets(scoped, bounds, now), [scoped, bounds, now]);
  const series = useMemo(() => trendSeries(scoped, effBy, chosenKeys, tm, buckets, ctx, now), [scoped, effBy, chosenKeys, tm, buckets, ctx, now]);

  /* ─── month by month ─── */
  const years = useMemo(() => availableYears(jobs, now), [jobs, now]);
  const periodYear = bounds.from ? Number(bounds.from.slice(0, 4)) : now.getFullYear();
  const [yearSel, setYearSel] = useState<number | null>(null);
  const year = yearSel ?? periodYear;
  useEffect(() => { setYearSel(null); }, [periodYear]);
  const [monthMode, setMonthMode] = useState<"trips" | "business" | "done">("trips");
  const masterBy: GroupBy = effBy === "type" ? "store" : effBy;
  const yearJobs = useMemo(() => filterJobs(jobs), [jobs, filterJobs]);
  const master = useMemo(() => buildMasterRows(yearJobs, masterBy, year, ctx), [yearJobs, masterBy, year, ctx]);
  const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : year > now.getFullYear() ? 0 : 12;
  // While the year follows the period strip, only the months the period touches are shown
  // (e.g. "7 Days" → this month). Picking a year manually shows that whole year.
  const [firstMonth, lastMonth] = useMemo(() => {
    if (yearSel !== null || !bounds.from || !bounds.to) return [0, monthCount - 1] as const;
    const fy = Number(bounds.from.slice(0, 4)), ty = Number(bounds.to.slice(0, 4));
    if (year < fy || year > ty) return [0, -1] as const;
    const a = year === fy ? Number(bounds.from.slice(5, 7)) - 1 : 0;
    const z = year === ty ? Number(bounds.to.slice(5, 7)) - 1 : 11;
    return [a, Math.min(z, monthCount - 1)] as const;
  }, [yearSel, bounds, year, monthCount]);
  const monthIdx = useMemo(() => Array.from({ length: Math.max(lastMonth - firstMonth + 1, 0) }, (_, k) => firstMonth + k), [firstMonth, lastMonth]);

  /* ─── funnel / status / exceptions ─── */
  const live = useMemo(() => scoped.filter((j) => j.status !== "cancelled"), [scoped]);
  const steps = useMemo(() => funnel(scoped), [scoped]);
  const mix = useMemo(() => statusMix(live), [live]);
  const exc = useMemo(() => exceptions(scoped, now), [scoped, now]);
  const [kind, setKind] = useState<"all" | ExceptionKind>("all");
  const [q, setQ] = useState("");
  const [excPage, setExcPage] = useState(1); const [excSize, setExcSize] = useState(10);
  const excFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return exc.filter((e) => (kind === "all" || e.kind === kind) && (!s || `${e.job.jobNo} ${e.job.customer} ${e.job.ninjaName} ${e.job.phone}`.toLowerCase().includes(s)));
  }, [exc, kind, q]);
  useEffect(() => { setExcPage(1); }, [kind, q, excSize, scoped]);
  const excPages = Math.max(1, Math.ceil(excFiltered.length / excSize));
  const excPaged = excFiltered.slice((excPage - 1) * excSize, excPage * excSize);

  /* ─── performance table paging ─── */
  const [perfPage, setPerfPage] = useState(1); const [perfSize, setPerfSize] = useState(10);
  useEffect(() => { setPerfPage(1); }, [effBy, scoped, perfSize]);
  const perfPages = Math.max(1, Math.ceil(rows.length / perfSize));
  const perfPaged = rows.slice((perfPage - 1) * perfSize, perfPage * perfSize);

  /* ─── drill-down into the trip list ─── */
  const drill = useCallback((key: string | null, b: DateBounds | null = bounds, group?: TripGroup) => {
    const p = new URLSearchParams();
    if (key) {
      if (effBy === "store") p.set("store", key);
      else if (effBy === "engineer") { if (key !== "unassigned") p.set("fe", key); }
      else if (effBy === "agent") p.set("sales", key);
      else if (effBy === "source") p.set("src", key);
      else if (effBy === "type") p.set("group", key);
    }
    if (group) p.set("group", group);
    else if (typeF !== "all" && !p.has("group")) p.set("group", typeF);
    if (b?.from) p.set("from", b.from);
    if (b?.to) p.set("to", b.to);
    p.set("excl", "cancelled");
    router.push(`/field?${p.toString()}`);
  }, [bounds, effBy, typeF, router]);
  const drillMaster = (key: string, f: string, t: string) => {
    const p = new URLSearchParams();
    if (masterBy === "store") p.set("store", key);
    else if (masterBy === "engineer") { if (key !== "unassigned") p.set("fe", key); }
    else if (masterBy === "agent") p.set("sales", key);
    else p.set("src", key);
    if (typeF !== "all") p.set("group", typeF);
    p.set("from", f); p.set("to", t); p.set("excl", "cancelled");
    router.push(`/field?${p.toString()}`);
  };

  /* ─── Ninja operations (trip/assignment/event rows, Supabase mode) ─── */

  /* ─── export: one workbook, every section, same rows as on screen ─── */
  const first = INSIGHT_BY_LABEL[effBy];
  const perfHead = [first, "Trips", "Pickup", "On-Site", "Drop", "Completed", "Completion %", "On-time %", "Avg pickup (h)", "Failed", "Delayed", "Unassigned", "From leads", "Business (₹)"];
  const perfRow = (r: InsightRow) => [r.label, r.trips, r.pickup, r.onsite, r.drop, r.completed, r.completionRate ?? "", r.onTimeRate ?? "", r.avgPickupHours ?? "", r.failed, r.delayed, r.unassigned, r.leadTrips, r.business ?? ""] as (string | number)[];
  const perfBody = [...rows.map(perfRow), perfRow(tot)];
  const fname = `field-insights-${new Date().toISOString().slice(0, 10)}`;
  const doExcel = () => {
    const monthHead = [INSIGHT_BY_LABEL[masterBy], ...monthIdx.map((k) => MONTH_NAMES[k]), `${year} total`];
    const pick = (c: { totalTrips: number; business: number | null; onsite: { completed: number }; pickup: { completed: number }; drop: { completed: number } }) =>
      monthMode === "business" ? (c.business ?? "") : monthMode === "done" ? c.onsite.completed + c.pickup.completed + c.drop.completed : c.totalTrips;
    const sheets = [
      { name: "Performance", headers: perfHead, rows: perfBody },
      { name: `Monthly ${year}`, headers: monthHead, rows: master.map((r) => { const [t, b, d] = monthTotals(r); return [r.label, ...monthIdx.map((k) => r.months[k]).filter(Boolean).map(pick), monthMode === "business" ? (b ?? "") : monthMode === "done" ? d : t] as (string | number)[]; }) },
      { name: "Exceptions", headers: ["Trip", "Customer", "Kind", "Status", "Ninja", "Store", "Date", "Reason"],
        rows: exc.map((e) => [e.job.jobNo, e.job.customer, e.kind, FIELD_STATUS_LABEL[e.job.status], e.job.ninjaName || "Unassigned", e.job.branch, tripDateOf(e.job), e.reason] as (string | number)[]) },
    ];
    void downloadXLSXWorkbook(`${fname}.xlsx`, sheets);
  };

  /* Deep links (/field/insights#ins-monthly, old dashboard routes) land on their section. */
  useEffect(() => {
    if (!hydrated) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    // the people sections moved to Field Activity — old links keep working
    const moved: Record<string, string> = { "ins-attendance": "/field/activity/attendance", "ins-pay": "/field/activity/pay", "ins-ninjas": "/field/activity/operations" };
    if (moved[id]) { router.replace(moved[id]); return; }
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => window.clearTimeout(t);
  }, [hydrated]);

  /* ─── deck ─── */
  const presetLabel = preset === "custom" && bounds.from && bounds.to ? boundsLabel(bounds) : DASH_PRESETS.find((p) => p.value === preset)?.label;
  const items: DeckItem[] = [
    { key: "period", label: "Period", summary: presetLabel, hint: boundsLabel(bounds),
      control: <SegmentedTabs size="md" value={preset} onChange={(v) => setPreset(v as DashPreset)} options={DASH_PRESETS} /> },
    ...(multiStore ? [{ key: "stores", label: "Stores", summary: storeSel.length ? `${storeSel.length} selected` : "All stores",
      control: <StoreMultiSelect value={storeSel} onChange={setStoreSel} /> }] : []),
    { key: "by", label: "View by", summary: first, hint: "Rows of every table + chart",
      control: <SegmentedTabs size="md" value={effBy} onChange={(v) => setBy(v as InsightBy)} options={byOptions.map((k) => ({ label: INSIGHT_BY_LABEL[k], value: k }))} /> },
    { key: "type", label: "Trip type", summary: typeF === "all" ? "All types" : typeF === "onsite" ? "On-Site" : typeF[0].toUpperCase() + typeF.slice(1),
      control: <SegmentedTabs size="md" value={typeF} onChange={(v) => setTypeF(v as TypeFilter)} options={[{ label: "All types", value: "all" }, { label: "Pickup", value: "pickup" }, { label: "On-Site", value: "onsite" }, { label: "Drop", value: "drop" }]} /> },
    { key: "compare", label: "Compare", summary: metrics.map((m) => metricDef(m).short).join(" · "), hint: "Pick up to 3 metrics",
      control: <ChipToggle options={METRICS.map((m) => ({ value: m.key, label: m.label, color: m.color }))} value={metrics} onChange={setMetrics} max={3} /> },
    { key: "vs", label: "Versus", summary: vs === "prev" ? (prevB ? `Previous · ${boundsLabel(prevB)}` : "Previous (n/a for All)") : "No comparison",
      control: <SegmentedTabs size="md" value={vs} onChange={(v) => setVs(v as "none" | "prev")} options={[{ label: "No comparison", value: "none" }, { label: "Previous period", value: "prev" }]} /> },
  ];
  const sections = [
    { id: "ins-overview", label: "Overview" },
    { id: "ins-compare", label: "Compare" },
    { id: "ins-performance", label: "Performance" },
    { id: "ins-monthly", label: "Month by month" },
    { id: "ins-daily", label: "Store activity" },
    { id: "ins-funnel", label: "Funnel & status" },
    { id: "ins-exceptions", label: `Exceptions${exc.length ? ` (${exc.length})` : ""}` },
  ];

  const hintDelta = (k: MetricKey) => {
    if (!showPrev || !prevTot) return undefined;
    const cur = tot[k] as number | null, pv = prevTot[k] as number | null;
    if (metricDef(k).kind === "pct") return cur != null && pv != null ? `${cur - pv > 0 ? "▲ +" : cur - pv < 0 ? "▼ " : "• "}${cur - pv} pts vs previous` : undefined;
    const d = pctDelta(cur, pv);
    return d == null ? undefined : `${d > 0 ? "▲ +" : d < 0 ? "▼ " : "• "}${d}% vs previous`;
  };
  /* ── tables: one FieldGrid each (per-user column order + freeze, zebra rows, roomy text) ── */
  const delta = (r: InsightRow, prev: InsightRow | null | undefined, k: MetricKey) => {
    if (!prev) return null;
    const cur = r[k] as number | null, pv = prev[k] as number | null;
    const pc = metricDef(k).kind === "pct" ? (cur != null && pv != null ? cur - pv : null) : pctDelta(cur, pv);
    if (pc == null || pc === 0) return null;
    const good = (pc > 0) === metricDef(k).higherIsBetter;
    return <span className={cn("block text-[12px] font-semibold", good ? "text-emerald-600" : "text-rose-600")}>{pc > 0 ? "▲" : "▼"} {Math.abs(pc)}{metricDef(k).kind === "pct" ? " pts" : "%"}</span>;
  };
  const pv = (r: InsightRow) => (showPrev ? prevRows.get(r.key) : undefined);
  const pvT = showPrev ? prevTot : null;
  const tripBtn = (v: number, onClick: () => void) => (v === 0 ? <span className="text-muted-foreground">0</span>
    : <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="rounded-md px-2 py-0.5 font-semibold hover:bg-[#EEF1FD] hover:text-[#4361EE]">{v}</button>);
  const perfGrid = useFieldGrid<InsightRow>(`insights_performance_${effBy}`, [
    { key: "name", label: first, width: 240, anchor: true, render: (r) => <NameText label={r.label} sub={`${r.trips} trip${r.trips === 1 ? "" : "s"} · open trips`} onClick={() => drill(r.key, bounds)} />, foot: <FootLabel sub="All rows" /> },
    { key: "trips", label: "Trips", width: 110, render: (r) => <><b>{r.trips}</b>{delta(r, pv(r), "trips")}</>, foot: <>{tot.trips}{delta(tot, pvT, "trips")}</> },
    { key: "pickup", label: "Pickup", width: 110, render: (r) => tripBtn(r.pickup, () => drill(r.key, bounds, "pickup")), foot: tot.pickup },
    { key: "onsite", label: "On-Site", width: 110, render: (r) => tripBtn(r.onsite, () => drill(r.key, bounds, "onsite")), foot: tot.onsite },
    { key: "drop", label: "Drop", width: 100, render: (r) => tripBtn(r.drop, () => drill(r.key, bounds, "drop")), foot: tot.drop },
    { key: "done", label: "Done", width: 100, render: (r) => <>{r.completed}{delta(r, pv(r), "completed")}</>, foot: tot.completed },
    { key: "donepct", label: "Done %", width: 110, render: (r) => <>{pctTxt(r.completionRate)}{delta(r, pv(r), "completionRate")}</>, foot: pctTxt(tot.completionRate) },
    { key: "ontime", label: "On-time", width: 110, render: (r) => pctTxt(r.onTimeRate), foot: pctTxt(tot.onTimeRate) },
    { key: "avgpick", label: "Avg pickup", width: 120, render: (r) => (r.avgPickupHours == null ? "—" : `${r.avgPickupHours}h`), foot: tot.avgPickupHours == null ? "—" : `${tot.avgPickupHours}h` },
    { key: "failed", label: "Failed", width: 100, cellClass: (r) => r.failed > 0 && "font-semibold text-rose-700", render: (r) => r.failed, foot: tot.failed },
    { key: "delayed", label: "Delayed", width: 110, cellClass: (r) => r.delayed > 0 && "font-semibold text-amber-700", render: (r) => r.delayed, foot: tot.delayed },
    { key: "unassigned", label: "Unassigned", width: 130, render: (r) => r.unassigned, foot: tot.unassigned },
    { key: "leads", label: "From leads", width: 120, render: (r) => r.leadTrips, foot: tot.leadTrips },
    { key: "business", label: "Business", width: 150, cellClass: () => "font-semibold text-emerald-700", render: (r) => <>{inr(r.business)}{delta(r, pv(r), "business")}</>, foot: <>{inr(tot.business)}{delta(tot, pvT, "business")}</> },
  ]);
  type MRow = (typeof master)[number];
  const doneOf = (c: { onsite: { completed: number }; pickup: { completed: number }; drop: { completed: number } }) => c.onsite.completed + c.pickup.completed + c.drop.completed;
  /** Trips / business / completed across the months currently shown. */
  const monthTotals = (r: MRow): [number, number | null, number] => {
    const cs = monthIdx.map((k) => r.months[k]).filter(Boolean);
    const biz = cs.some((c) => c.business != null) ? cs.reduce((n, c) => n + (c.business ?? 0), 0) : null;
    return [cs.reduce((n, c) => n + c.totalTrips, 0), biz, cs.reduce((n, c) => n + doneOf(c), 0)];
  };
  const valOf = (trips: number, biz: number | null, d: number) => (monthMode === "business" ? inr(biz) : monthMode === "done" ? d : trips);
  const monthGrid = useFieldGrid<MRow>(`insights_monthly_${masterBy}`, [
    { key: "name", label: INSIGHT_BY_LABEL[masterBy], width: 240, anchor: true, render: (r) => <NameText label={r.label} sub={`${r.yearTrips} trips in ${year}`} /> },
    ...monthIdx.map((i): FCol<MRow> => ({ key: `m${i}`, label: MONTH_NAMES[i].slice(0, 3), width: 104, cellClass: () => "!px-1.5",
      render: (r) => { const c = r.months[i]; if (!c || c.totalTrips === 0) return <GDash />;
        const peak = Math.max(1, ...monthIdx.map((k) => r.months[k]).filter(Boolean).map((x) => monthMode === "business" ? (x.business ?? 0) : monthMode === "done" ? doneOf(x) : x.totalTrips));
        const raw = monthMode === "business" ? (c.business ?? 0) : monthMode === "done" ? doneOf(c) : c.totalTrips;
        return <button onClick={() => drillMaster(r.key, `${year}-${pad(c.month + 1)}-01`, `${year}-${pad(c.month + 1)}-${pad(new Date(year, c.month + 1, 0).getDate())}`)}
          title={`Pickup ${c.pickup.total} · On-Site ${c.onsite.total} · Drop ${c.drop.total}${c.business != null ? ` · ${inr(c.business)}` : ""}`}
          className="w-full rounded-lg px-1 py-2 tabular-nums transition hover:ring-1 hover:ring-[#4361EE]/40" style={{ background: `rgba(67,97,238,${0.06 + 0.24 * (raw / peak)})` }}>
          <span className="block text-[15px] font-bold">{valOf(c.totalTrips, c.business, doneOf(c))}</span></button>; } })),
    { key: "year", label: monthIdx.length === monthCount && firstMonth === 0 ? "Year" : "Total", width: 120, cellClass: () => "font-extrabold", render: (r) => valOf(...monthTotals(r)) },
  ]);
  type ERow = (typeof excPaged)[number];
  const excGrid = useFieldGrid<ERow>("insights_exceptions", [
    { key: "trip", label: "Trip", width: 150, anchor: true, render: (e) => <span className="font-semibold text-[#4361EE]">{e.job.jobNo}</span> },
    { key: "customer", label: "Customer", width: 220, cellClass: () => "truncate", render: (e) => e.job.customer || "—" },
    { key: "kind", label: "Kind", width: 130, render: (e) => <span className={cn("rounded-full px-3 py-1 text-[12.5px] font-semibold capitalize ring-1 ring-inset", e.kind === "delayed" ? "bg-amber-50 text-amber-800 ring-amber-200" : e.kind === "failed" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-zinc-100 text-zinc-700 ring-zinc-200")}>{e.kind}</span> },
    { key: "status", label: "Status", width: 180, render: (e) => <span className={cn("rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[e.job.status])}>{FIELD_STATUS_LABEL[e.job.status]}</span> },
    { key: "ninja", label: "Ninja", width: 170, cellClass: () => "truncate", render: (e) => e.job.ninjaName || <GDash /> },
    { key: "date", label: "Date", width: 130, render: (e) => tripDateOf(e.job) || "—" },
    { key: "reason", label: "Reason", width: 260, align: "left", cellClass: () => "truncate text-muted-foreground", render: (e) => <span title={e.reason}>{e.reason}</span> },
  ]);
  const T = tot.trips;

  return (
    <div className="space-y-5">
      {/* back · title · subtitle on ONE line, vertically centred (same as Field Activity) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <BackPill href="/field" label="Back" className="h-8 shrink-0 px-3 text-[12px]" />
          <h1 className="font-display text-[24px] font-extrabold leading-none tracking-tight">Field Insights</h1>
          <span className="hidden truncate border-l border-border pl-3 text-[13px] leading-none text-muted-foreground xl:inline">Every chart and table follows the period you pick · Business counts finalized invoices only</span>
        </div>
        <Dropdown width="w-52" trigger={({ toggle }) => (
          <Button variant="outline" size="sm" className="h-[36px] gap-1.5" onClick={toggle}><Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" /></Button>
        )}>
          {(close) => (<>
            <MenuItem icon={FileSpreadsheet} onClick={() => { doExcel(); close(); }}>Excel (.xlsx)</MenuItem>
            <MenuItem icon={FileText} onClick={() => { downloadCSV(`${fname}-performance.csv`, toCSV(perfHead, perfBody)); close(); }}>CSV (.csv)</MenuItem>
          </>)}
        </Dropdown>
      </div>

      <InsightsDeck items={items} sections={sections}
        right={<span className="hidden items-center gap-1 whitespace-nowrap px-2 text-[12px] font-semibold text-muted-foreground xl:inline-flex">{hydrated ? `${T} trips` : "Loading…"}
          <InfoHint content="Trips are placed in the period by their scheduled date (pickup, else drop, else created). Cancelled trips are excluded from trip totals." /></span>} />
      <DateRangePicker open={preset === "custom"} from={from} to={to} onFromChange={(v) => { setPreset("custom"); setFrom(v); }} onToChange={(v) => { setPreset("custom"); setTo(v); }} />

      {/* ── Overview ── */}
      <section id="ins-overview" className="scroll-mt-[190px]">
        <FieldKpiCards total={T} columns="lg:grid-cols-3 xl:grid-cols-6" items={[
          { key: "trips", label: "Trips", value: T, tone: "sky", Icon: Truck, share: T ? 100 : 0, hint: hintDelta("trips") ?? `Pickup ${tot.pickup} · On-Site ${tot.onsite} · Drop ${tot.drop}` },
          { key: "done", label: "Completed", value: tot.completed, tone: "emerald", Icon: CheckCircle2, share: tot.completionRate ?? 0, hint: hintDelta("completed") ?? `${pctTxt(tot.completionRate)} completion` },
          { key: "biz", label: "Business", value: inr(tot.business), tone: "amber", Icon: IndianRupee, hint: hintDelta("business") ?? (tot.invoices ? `${tot.invoices} finalized invoice${tot.invoices > 1 ? "s" : ""}` : "No finalized invoices") },
          { key: "ontime", label: "On-time pickups", value: pctTxt(tot.onTimeRate), tone: "teal", Icon: Target, share: tot.onTimeRate ?? 0, hint: hintDelta("onTimeRate") ?? "Collected on/before schedule" },
          { key: "avg", label: "Avg pickup time", value: tot.avgPickupHours == null ? "—" : `${tot.avgPickupHours}h`, tone: "violet", Icon: Timer, hint: hintDelta("avgPickupHours") ?? "Created → collected" },
          { key: "exc", label: "Exceptions", value: tot.failed + tot.delayed, tone: "rose", Icon: TriangleAlert, hint: `${tot.delayed} delayed · ${tot.failed} failed · ${tot.unassigned} unassigned`,
            share: T ? Math.round(((tot.failed + tot.delayed) / T) * 100) : 0, onClick: () => document.getElementById("ins-exceptions")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        ]} />
      </section>

      {/* ── Compare ── */}
      <section id="ins-compare" className="scroll-mt-[190px]">
        <Panel title={`Compare by ${first.toLowerCase()}`} icon={GitCompareArrows} className="h-auto"
          action={<span className="text-[11.5px] text-muted-foreground">{showPrev ? `vs ${boundsLabel(prevB)}` : boundsLabel(bounds)}</span>}>
          {rows.length === 0 ? <EmptyRows text={hydrated ? "No trips in this selection." : "Loading…"} /> : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Compare <InfoHint content={`Pick up to ${ENTITY_COLORS.length} to compare. By default the top 5 by ${metricDef(rankKey).label.toLowerCase()} are shown.`} />
                </span>
                <ChipToggle max={ENTITY_COLORS.length} value={chosenKeys} onChange={(v) => setPicked(v)}
                  options={ranked.slice(0, 24).map((r) => ({ value: r.key, label: r.label, color: colorOf(r.key) }))} />
                {picked && <button onClick={() => setPicked(null)} className="text-[11.5px] font-semibold text-[#4361EE] hover:underline">Reset to top 5</button>}
              </div>
              <CompareBars rows={chosenRows} prev={prevRows} metrics={metrics} showPrev={showPrev} colorOf={colorOf} />
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-foreground"><BarChart3 className="h-4 w-4 text-[#4361EE]" /> Trend · {metricDef(tm).label}</p>
                  {metrics.length > 1 && <SegmentedTabs size="sm" value={tm} onChange={(v) => setTrendMetric(v as MetricKey)} options={metrics.map((m) => ({ label: metricDef(m).label, value: m }))} />}
                </div>
                <TrendLines buckets={buckets} series={series} metric={tm}
                  entities={chosenRows.map((r) => ({ key: r.key, label: r.label, color: colorOf(r.key) }))} />
              </div>
            </div>
          )}
        </Panel>
      </section>

      {/* ── Performance ── */}
      <section id="ins-performance" className="scroll-mt-[190px] space-y-3">
        <SectionTitle icon={Table2} title={`Performance by ${first.toLowerCase()}`} sub={`${rows.length} ${first.toLowerCase()}${rows.length === 1 ? "" : "s"} · ${boundsLabel(bounds)} · click a row to open its trips`} />
        <div className="flex justify-end">{perfGrid.menus}</div>
        <FieldGrid grid={perfGrid} lock={false} rows={perfPaged} rowKey={(r) => r.key} onRowClick={(r) => drill(r.key, bounds)} foot empty={rows.length ? null : hydrated ? "No trips in this selection." : "Loading…"} />
        {rows.length > 0 && <Pagination page={Math.min(perfPage, perfPages)} totalPages={perfPages} onPageChange={setPerfPage} totalItems={rows.length} pageSize={perfSize}
          onPageSizeChange={setPerfSize} itemLabel={first.toLowerCase()} />}
      </section>

      {/* ── Month by month ── */}
      <section id="ins-monthly" className="scroll-mt-[190px] space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle icon={CalendarRange} title={`Month by month · ${year}`} sub={`By ${INSIGHT_BY_LABEL[masterBy].toLowerCase()}${effBy === "type" ? " (trip type has no monthly grid)" : ""} · ${monthIdx.length === 0 ? "no months in this period" : yearSel === null && (firstMonth > 0 || lastMonth < monthCount - 1) ? `${MONTH_NAMES[firstMonth]}${lastMonth > firstMonth ? ` – ${MONTH_NAMES[lastMonth]}` : ""} (follows the period)` : "whole year"}`} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-28"><Select value={String(year)} onChange={(e) => setYearSel(Number(e.target.value))} className="h-[34px]" options={years.map((y) => ({ label: String(y), value: String(y) }))} /></div>
            <SegmentedTabs size="sm" value={monthMode} onChange={(v) => setMonthMode(v as typeof monthMode)} options={[{ label: "Trips", value: "trips" }, { label: "Business", value: "business" }, { label: "Completed", value: "done" }]} />
            {monthGrid.menus}
          </div>
        </div>
        <FieldGrid grid={monthGrid} lock={false} rows={master} rowKey={(r) => r.key} empty={master.length ? null : `No trips in ${year}.`} />
      </section>

      {/* ── Store activity (the people tables moved to Field Activity) ── */}
      <section id="ins-daily" className="scroll-mt-[190px] space-y-3">
        <DailyActivity show="store" jobs={jobs} ctx={ctx} bounds={bounds} storeSel={storeSel} multiStore={multiStore} canTeam={canTeam} legType={typeF} header={<SectionTitle icon={ListChecks} title="Store activity" sub={`Trips per store · ${boundsLabel(bounds)}${typeF === "all" ? "" : ` · ${typeF === "onsite" ? "On-Site" : typeF[0].toUpperCase() + typeF.slice(1)} only`}`}
          info="Follows the Period, Stores and Trip type you picked above. Built from the Ninja app's trip legs (completed / assigned). Per-Ninja activity, attendance, fuel, pay and operations live in Field Activity." />} />
      </section>
      <section id="ins-funnel" className="scroll-mt-[190px] grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <Panel title="Trip funnel" icon={Filter}>
          {steps[0].count === 0 ? <p className="text-[12.5px] text-muted-foreground">No trips in this selection.</p> : (
            <ul className="space-y-3">
              {steps.map((s) => (
                <li key={s.key}>
                  <div className="mb-1 flex items-baseline justify-between text-[12.5px]"><span className="font-medium">{s.label}</span><span className="tabular-nums"><strong>{s.count}</strong> <span className="text-muted-foreground">· {pctTxt(s.pctOfTotal)}</span></span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-[#4361EE] to-[#7C8CF5] transition-[width] duration-500" style={{ width: `${s.pctOfTotal ?? 0}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-auto border-t border-border/70 pt-2 text-[11px] text-muted-foreground">Share of non-cancelled trips that reached each stage.</p>
        </Panel>
        <Panel title="Status mix" icon={ListChecks} bodyClassName="flex flex-col">
          {mix.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No trips in this selection.</p> : (() => {
            const total = mix.reduce((n, m) => n + m.count, 0) || 1;
            const top = Math.max(...mix.map((m) => m.count), 1);
            return (
              // The list stretches to the panel's full height (the Trip funnel next to it
              // sets that height), rows spread evenly and each carries a proportional bar.
              <ul className="flex flex-1 flex-col justify-between gap-2">
                {mix.map((m) => (
                  <li key={m.status} className="grid grid-cols-[150px_1fr_auto_44px] items-center gap-3">
                    <span className={cn("truncate rounded-full px-2.5 py-1 text-center text-[11.5px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[m.status])}>{FIELD_STATUS_LABEL[m.status]}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-gradient-to-r from-[#4361EE] to-[#7C8CF5] transition-[width] duration-500" style={{ width: `${(m.count / top) * 100}%` }} /></span>
                    <span className="min-w-[28px] text-right text-[14px] font-bold tabular-nums">{m.count}</span>
                    <span className="text-right text-[11.5px] tabular-nums text-muted-foreground">{Math.round((m.count / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </Panel>
      </section>

      {/* ── Exceptions ── */}
      <section id="ins-exceptions" className="scroll-mt-[190px] space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle icon={TriangleAlert} title="Exceptions" sub="Delayed, failed and cancelled trips in this selection" />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedTabs size="sm" value={kind} onChange={(v) => setKind(v as typeof kind)}
              options={[{ label: "All", value: "all" }, { label: "Delayed", value: "delayed" }, { label: "Failed", value: "failed" }, { label: "Cancelled", value: "cancelled" }]} />
            <TableSearch value={q} onChange={setQ} placeholder="Search exceptions by trip no, customer, phone or Ninja…" />
            {excGrid.menus}
          </div>
        </div>
        <FieldGrid grid={excGrid} lock={false} rows={excPaged} rowKey={(e) => e.job.id} onRowClick={(e) => router.push(`/field/${e.job.id}`)} empty={excPaged.length ? null : "No exceptions in this selection."} />
        <Pagination page={Math.min(excPage, excPages)} totalPages={excPages} onPageChange={setExcPage} totalItems={excFiltered.length} pageSize={excSize}
          onPageSizeChange={setExcSize} itemLabel="exception" />
      </section>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, sub, info }: { icon: React.ComponentType<{ className?: string }>; title: string; sub?: string; info?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-4 w-4" /></span>
      <div>
        <h2 className="inline-flex items-center gap-1 text-[14.5px] font-bold uppercase tracking-wider text-foreground">{title}{info && <InfoHint content={info} />}</h2>
        {sub && <p className="text-[13px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

