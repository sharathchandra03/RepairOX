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
import { PageHeader } from "@/components/layout/page-header";
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
  const [preset, setPreset] = useState<DashPreset>("month");
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
    const monthHead = [INSIGHT_BY_LABEL[masterBy], ...MONTH_NAMES.slice(0, monthCount), `${year} total`];
    const pick = (c: { totalTrips: number; business: number | null; onsite: { completed: number }; pickup: { completed: number }; drop: { completed: number } }) =>
      monthMode === "business" ? (c.business ?? "") : monthMode === "done" ? c.onsite.completed + c.pickup.completed + c.drop.completed : c.totalTrips;
    const sheets = [
      { name: "Performance", headers: perfHead, rows: perfBody },
      { name: `Monthly ${year}`, headers: monthHead, rows: master.map((r) => [r.label, ...r.months.slice(0, monthCount).map(pick), monthMode === "business" ? (r.yearBusiness ?? "") : monthMode === "done" ? (r.yearGroups ? r.yearGroups.onsite.completed + r.yearGroups.pickup.completed + r.yearGroups.drop.completed : 0) : r.yearTrips] as (string | number)[]) },
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
  const T = tot.trips;

  return (
    <div className="space-y-5">
      <div><BackPill href="/field" label="Back to Pickup & Drop" /></div>
      <PageHeader eyebrow="Field Management" title="Field Insights"
        subtitle="Choose once at the top — every chart and table below follows. Business counts finalized invoices only."
        actions={
          <Dropdown width="w-52" trigger={({ toggle }) => (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}><Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" /></Button>
          )}>
            {(close) => (<>
              <MenuItem icon={FileSpreadsheet} onClick={() => { doExcel(); close(); }}>Excel (.xlsx)</MenuItem>
              <MenuItem icon={FileText} onClick={() => { downloadCSV(`${fname}-performance.csv`, toCSV(perfHead, perfBody)); close(); }}>CSV (.csv)</MenuItem>
            </>)}
          </Dropdown>
        } />

      <InsightsDeck items={items} sections={sections}
        right={<span className="hidden items-center gap-1 whitespace-nowrap px-2 text-[11.5px] text-muted-foreground xl:inline-flex">{hydrated ? `${T} trips` : "Loading…"}
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
        <Frame>
          <table className="w-full min-w-[1240px] table-fixed text-[14px]">
            <colgroup><col style={{ width: 200 }} />{Array.from({ length: 12 }).map((_, i) => <col key={i} />)}<col style={{ width: 130 }} /></colgroup>
            <Head cols={[first, "Trips", "Pickup", "On-Site", "Drop", "Done", "Done %", "On-time", "Avg pickup", "Failed", "Delayed", "Unassigned", "From leads", "Business"]} firstWidth={200} />
            <tbody>
              {perfPaged.map((r) => <PerfRow key={r.key} r={r} prev={showPrev ? prevRows.get(r.key) : undefined} onOpen={(g) => drill(r.key, bounds, g)} />)}
              {rows.length > 0 && <PerfRow r={tot} total prev={showPrev ? prevTot ?? undefined : undefined} onOpen={(g) => drill(null, bounds, g)} />}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyRows text={hydrated ? "No trips in this selection." : "Loading…"} />}
        </Frame>
        {rows.length > 0 && <Pagination page={Math.min(perfPage, perfPages)} totalPages={perfPages} onPageChange={setPerfPage} totalItems={rows.length} pageSize={perfSize}
          onPageSizeChange={setPerfSize} itemLabel={first.toLowerCase()} />}
      </section>

      {/* ── Month by month ── */}
      <section id="ins-monthly" className="scroll-mt-[190px] space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle icon={CalendarRange} title={`Month by month · ${year}`} sub={`By ${INSIGHT_BY_LABEL[masterBy].toLowerCase()}${effBy === "type" ? " (trip type has no monthly grid)" : ""}`} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-28"><Select value={String(year)} onChange={(e) => setYearSel(Number(e.target.value))} className="h-[34px]" options={years.map((y) => ({ label: String(y), value: String(y) }))} /></div>
            <SegmentedTabs size="sm" value={monthMode} onChange={(v) => setMonthMode(v as typeof monthMode)} options={[{ label: "Trips", value: "trips" }, { label: "Business", value: "business" }, { label: "Completed", value: "done" }]} />
          </div>
        </div>
        <Frame>
          <table className="table-fixed text-[14px]" style={{ width: 200 + (monthCount + 1) * 112, minWidth: "100%" }}>
            <colgroup><col style={{ width: 200 }} />{Array.from({ length: monthCount + 1 }).map((_, i) => <col key={i} style={{ width: 112 }} />)}</colgroup>
            <Head cols={[INSIGHT_BY_LABEL[masterBy], ...MONTH_NAMES.slice(0, monthCount).map((m) => m.slice(0, 3)), "Year"]} firstWidth={200} />
            <tbody>
              {master.map((r) => {
                const done = (c: { onsite: { completed: number }; pickup: { completed: number }; drop: { completed: number } }) => c.onsite.completed + c.pickup.completed + c.drop.completed;
                const val = (trips: number, biz: number | null, d: number) => monthMode === "business" ? inr(biz) : monthMode === "done" ? d : trips;
                const peak = Math.max(1, ...r.months.slice(0, monthCount).map((c) => monthMode === "business" ? (c.business ?? 0) : monthMode === "done" ? done(c) : c.totalTrips));
                return (
                  <tr key={r.key} className="rox-table-row align-middle hover:bg-muted/40">
                    <NameCell label={r.label} sub={`${r.yearTrips} trips in ${year}`} />
                    {r.months.slice(0, monthCount).map((c) => {
                      const raw = monthMode === "business" ? (c.business ?? 0) : monthMode === "done" ? done(c) : c.totalTrips;
                      return (
                        <td key={c.month} className="px-1.5 py-3 text-center align-middle">
                          {c.totalTrips === 0 ? <Dash /> : (
                            <button onClick={() => drillMaster(r.key, `${year}-${pad(c.month + 1)}-01`, `${year}-${pad(c.month + 1)}-${pad(new Date(year, c.month + 1, 0).getDate())}`)}
                              title={`Pickup ${c.pickup.total} · On-Site ${c.onsite.total} · Drop ${c.drop.total}${c.business != null ? ` · ${inr(c.business)}` : ""}`}
                              className="w-full rounded-lg px-1 py-1.5 tabular-nums transition hover:ring-1 hover:ring-[#4361EE]/40"
                              style={{ background: `rgba(67,97,238,${0.06 + 0.24 * (raw / peak)})` }}>
                              <span className="block text-[13px] font-bold">{val(c.totalTrips, c.business, done(c))}</span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="bg-[#EEF1FD]/60 px-1.5 py-3 text-center align-middle text-[13px] font-extrabold tabular-nums">
                      {val(r.yearTrips, r.yearBusiness, r.yearGroups ? done(r.yearGroups) : 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {master.length === 0 && <EmptyRows text={`No trips in ${year}.`} />}
        </Frame>
      </section>

      {/* ── Store activity (the people tables moved to Field Activity) ── */}
      <section id="ins-daily" className="scroll-mt-[190px] space-y-3">
        <SectionTitle icon={ListChecks} title="Store activity" sub="Trips per store for one day"
          info="Built from the Ninja app's trip legs. Per-Ninja activity, attendance, fuel, pay and operations now live in Field Activity." />
        <DailyActivity show="store" jobs={jobs} ctx={ctx} bounds={bounds} storeSel={storeSel} multiStore={multiStore} canTeam={canTeam} />
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
        <Panel title="Status mix" icon={ListChecks}>
          {mix.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No trips in this selection.</p> : (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {mix.map((m) => (
                <li key={m.status} className="flex items-center justify-between gap-2">
                  <span className={cn("truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[m.status])}>{FIELD_STATUS_LABEL[m.status]}</span>
                  <span className="text-[13px] font-bold tabular-nums">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
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
          </div>
        </div>
        <Frame>
          <table className="w-full min-w-[960px] table-fixed text-[14px]">
            <colgroup><col style={{ width: "13%" }} /><col style={{ width: "21%" }} /><col style={{ width: "11%" }} /><col style={{ width: "17%" }} /><col style={{ width: "15%" }} /><col style={{ width: "10%" }} /><col style={{ width: "13%" }} /></colgroup>
            <Head cols={["Trip", "Customer", "Kind", "Status", "Ninja", "Date", "Reason"]} />
            <tbody>
              {excPaged.map((e) => (
                <tr key={e.job.id} onClick={() => router.push(`/field/${e.job.id}`)} className="h-[68px] cursor-pointer border-t border-zinc-500 align-middle hover:bg-muted/40">
                  <td className="px-3 py-4 font-semibold text-[#4361EE]">{e.job.jobNo}</td>
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
          {excPaged.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-500" />No exceptions in this selection.</div>}
        </Frame>
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
        <h2 className="inline-flex items-center gap-1 text-[13px] font-bold uppercase tracking-wider text-foreground">{title}{info && <InfoHint content={info} />}</h2>
        {sub && <p className="text-[11.5px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function PerfRow({ r, prev, total, onOpen }: { r: InsightRow; prev?: InsightRow; total?: boolean; onOpen: (g?: TripGroup) => void }) {
  const num = (v: number, g?: TripGroup, tone?: string) => (
    <td className="px-2 py-4 text-center tabular-nums">
      {v === 0 ? <span className="text-muted-foreground">0</span> : g || !tone
        ? <button onClick={() => onOpen(g)} className={cn("rounded-md px-1.5 py-0.5 font-semibold hover:bg-[#EEF1FD] hover:text-[#4361EE]", tone)}>{v}</button>
        : <span className={cn("font-semibold", tone)}>{v}</span>}
    </td>
  );
  const d = (k: MetricKey) => {
    if (!prev) return null;
    const cur = r[k] as number | null, pv = prev[k] as number | null;
    const pc = metricDef(k).kind === "pct" ? (cur != null && pv != null ? cur - pv : null) : pctDelta(cur, pv);
    if (pc == null || pc === 0) return null;
    const good = (pc > 0) === metricDef(k).higherIsBetter;
    return <span className={cn("block text-[10px] font-semibold", good ? "text-emerald-600" : "text-rose-600")}>{pc > 0 ? "▲" : "▼"} {Math.abs(pc)}{metricDef(k).kind === "pct" ? " pts" : "%"}</span>;
  };
  return (
    <tr className={cn("rox-table-row align-middle", total ? "border-t-2 border-zinc-400 bg-[#EEF1FD]/70 font-semibold" : "hover:bg-muted/40")}>
      <NameCell label={r.label} sub={total ? "All rows" : `${r.trips} trip${r.trips === 1 ? "" : "s"}`} onReport={() => onOpen()} reportLabel={total ? "All trips" : "Trips"} />
      <td className="px-2 py-4 text-center tabular-nums"><span className="font-bold">{r.trips}</span>{d("trips")}</td>
      {num(r.pickup, "pickup")}{num(r.onsite, "onsite")}{num(r.drop, "drop")}
      <td className="px-2 py-4 text-center tabular-nums">{r.completed}{d("completed")}</td>
      <td className="px-2 py-4 text-center tabular-nums">{pctTxt(r.completionRate)}{d("completionRate")}</td>
      <td className="px-2 py-4 text-center tabular-nums">{pctTxt(r.onTimeRate)}</td>
      <td className="px-2 py-4 text-center tabular-nums">{r.avgPickupHours == null ? "—" : `${r.avgPickupHours}h`}</td>
      <td className={cn("px-2 py-4 text-center tabular-nums", r.failed > 0 && "font-semibold text-rose-700")}>{r.failed}</td>
      <td className={cn("px-2 py-4 text-center tabular-nums", r.delayed > 0 && "font-semibold text-amber-700")}>{r.delayed}</td>
      <td className="px-2 py-4 text-center tabular-nums">{r.unassigned}</td>
      <td className="px-2 py-4 text-center tabular-nums">{r.leadTrips}</td>
      <td className="px-3 py-4 text-center font-semibold tabular-nums text-emerald-700">{inr(r.business)}{d("business")}</td>
    </tr>
  );
}
