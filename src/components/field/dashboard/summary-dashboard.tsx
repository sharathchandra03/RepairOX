"use client";
/* Multi-Store · Single-Store · FE Team dashboards — ONE component, three scopes.
   Row = the chosen dimension (Store · Field Engineer · Sales Agent · Lead Source)
   | Business (+ breakup) | On-Site | Pickup | Drop (Assigned / Completed / New · Warranty)
   | Lead sync (From leads → Ticketed → Invoiced). Sales Agent (lead owner) and Field
   Engineer (does the trip) are different people and different dimensions. Totals
   reconcile; every count and Report opens the exact trips on /field; Excel + CSV
   export is built from the same rows. */
import { useMemo, useState } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { CheckCircle2, IndianRupee, Route as RouteIcon, Truck } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { InfoHint } from "@/components/ui/info-hint";
import { downloadXLSX, downloadCSV, toCSV } from "@/lib/csv-utils";
import { Pagination } from "@/components/ui/pagination";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { FieldKpiCards } from "@/components/field/field-kpi-cards";
import { CollapsibleControls, IndicatorChip } from "@/components/field/dashboard/collapsible-controls";
import { DashboardShell, DashboardNotice } from "@/components/field/dashboard/dashboard-shell";
import { useFieldDashboard, type DashboardId } from "@/components/field/dashboard/use-field-dashboard";
import { Frame, Head, NameCell, BusinessCell, GroupCell, LeadSyncCell, EmptyRows, inr, GROUPS } from "@/components/field/dashboard/dashboard-table";
import { boundsForPreset, buildSummaryRows, sumRows, summaryTable, DASH_PRESETS, GROUP_BY_LABEL, TRIP_GROUP_LABEL, type DashPreset, type DashRow, type GroupBy, type TripGroup } from "@/lib/field-dashboard";

export type SummaryScope = "multi" | "single" | "fe";
const META: Record<SummaryScope, { id: DashboardId; by: GroupBy }> = {
  multi: { id: "multi-store", by: "store" },
  single: { id: "single-store", by: "store" },
  fe: { id: "fe-team", by: "engineer" },
};

export function SummaryDashboard({ scope }: { scope: SummaryScope }) {
  const m = META[scope];
  const router = useRouter();
  const { jobs, hydrated, ctx, multiStore } = useFieldDashboard();
  const [preset, setPreset] = useState<DashPreset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [by, setBy] = useState<GroupBy>(m.by);
  const pageSize = 20;

  const bounds = useMemo(() => boundsForPreset(preset, from, to), [preset, from, to]);
  const rows = useMemo(() => buildSummaryRows(jobs, by, bounds, ctx), [jobs, by, bounds, ctx]);
  const totals = useMemo(() => sumRows(rows), [rows]);

  const open = (r: DashRow | null, group?: TripGroup) => {
    const p = new URLSearchParams();
    if (r) {
      if (by === "store") p.set("store", r.key);
      else if (by === "engineer") { if (r.key !== "unassigned") p.set("fe", r.key); }
      else if (by === "agent") p.set("sales", r.key);
      else p.set("src", r.key);
    }
    if (group) p.set("group", group);
    if (bounds.from) p.set("from", bounds.from);
    if (bounds.to) p.set("to", bounds.to);
    p.set("excl", "cancelled");
    router.push(`/field?${p.toString()}`);
  };

  // Scope guards: each dashboard is for ONE purpose.
  if (scope === "multi" && hydrated && !multiStore)
    return <DashboardShell id={m.id}><DashboardNotice title="Multi-Store isn't available for your access" text="This dashboard compares several stores and needs multi-store access. Your Single-Store dashboard shows your store." href="/field/dashboard/single-store" cta="Open Single-Store Dashboard" /></DashboardShell>;
  if (scope === "single" && hydrated && multiStore)
    return <DashboardShell id={m.id}><DashboardNotice title="You're viewing All Shops" text="The Single-Store dashboard shows one store. Use the Multi-Store dashboard to compare stores, or pick a single store in the header store selector." href="/field/dashboard/multi-store" cta="Open Multi-Store Dashboard" /></DashboardShell>;

  const first = GROUP_BY_LABEL[by];
  const exp = summaryTable(rows, totals, first);
  const fname = `field-${m.id}-by-${by}-${new Date().toISOString().slice(0, 10)}`;
  const assigned = GROUPS.reduce((n, g) => n + totals[g].assigned, 0);
  const completed = GROUPS.reduce((n, g) => n + totals[g].completed, 0);
  const T = totals.totalTrips;
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  return (
    <DashboardShell id={m.id}>
      <CollapsibleControls workspaceKey={`field_dash_${m.id}`} indicators={<>
        <IndicatorChip>{DASH_PRESETS.find((p) => p.value === preset)?.label}</IndicatorChip>
        <IndicatorChip>By {first}</IndicatorChip>
        <IndicatorChip>{T} trips · {inr(totals.business)}</IndicatorChip>
      </>}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs value={preset} onChange={(v) => { setPreset(v as DashPreset); setPage(1); }} size="sm" options={DASH_PRESETS} />
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            View by
            <InfoHint content="Sales Agent is the lead owner who routed the trip. Field Engineer is the person who does the trip. They are different people and are never mixed." />
          </span>
          <div className="w-44"><Select value={by} onChange={(e) => { setBy(e.target.value as GroupBy); setPage(1); }} className="h-[36px]"
            options={(Object.keys(GROUP_BY_LABEL) as GroupBy[]).map((k) => ({ label: GROUP_BY_LABEL[k], value: k }))} /></div>
        </div>
        <div className="ml-auto">
          <Dropdown width="w-52" trigger={({ toggle }) => (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}><Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" /></Button>
          )}>
            {(close) => (<>
              <MenuItem icon={FileSpreadsheet} onClick={() => { void downloadXLSX(`${fname}.xlsx`, exp.headers, exp.rows, "Dashboard"); close(); }}>Excel (.xlsx)</MenuItem>
              <MenuItem icon={FileText} onClick={() => { downloadCSV(`${fname}.csv`, toCSV(exp.headers, exp.rows)); close(); }}>CSV (.csv)</MenuItem>
            </>)}
          </Dropdown>
        </div>
      </div>

      <FieldKpiCards total={T} columns="lg:grid-cols-4" items={[
        { key: "trips", label: "Total trips", value: T, tone: "sky", Icon: RouteIcon, share: T ? 100 : 0, hint: T ? `${totals.leadTrips} from leads · cancelled excluded` : "Cancelled excluded" },
        { key: "assigned", label: "Assigned", value: assigned, tone: "violet", Icon: Truck, hint: T ? `${Math.round((assigned / T) * 100)}% of trips` : undefined },
        { key: "completed", label: "Completed", value: completed, tone: "emerald", Icon: CheckCircle2, share: assigned ? Math.round((completed / assigned) * 100) : 0, hint: assigned ? `${Math.round((completed / assigned) * 100)}% of assigned` : undefined },
        { key: "business", label: "Business (finalized)", value: inr(totals.business), tone: "amber", Icon: IndianRupee, hint: "Finalized invoices only" },
      ]} />

      </CollapsibleControls>
      <DateRangePicker open={preset === "custom"} from={from} to={to}
        onFromChange={(v) => { setFrom(v); setPreset("custom"); }} onToChange={(v) => { setTo(v); setPreset("custom"); }} />
      {!hydrated ? <EmptyRows text="Loading…" /> : (
        <>
          <Frame>
            <table className="w-full min-w-[1120px] table-fixed text-[14px]">
              <colgroup><col style={{ width: 210 }} /><col style={{ width: 190 }} /><col /><col /><col /><col style={{ width: 190 }} /></colgroup>
              <Head cols={[first, "Business", ...GROUPS.map((g) => TRIP_GROUP_LABEL[g]), "Lead sync"]} firstWidth={210} />
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.key} className="rox-table-row align-middle hover:bg-muted/40">
                    <NameCell label={r.label} sub={`${r.totalTrips} trip${r.totalTrips === 1 ? "" : "s"}`} onReport={() => open(r)} />
                    <td className="px-3 py-3 align-middle"><BusinessCell total={r.business} money={r.groupBusiness} /></td>
                    {GROUPS.map((g) => <td key={g} className="px-2 py-3 align-middle"><GroupCell b={r[g]} onOpen={() => open(r, g)} /></td>)}
                    <td className="px-2 py-3 align-middle"><LeadSyncCell r={r} onOpen={() => open(r)} /></td>
                  </tr>
                ))}
                {rows.length > 0 && (
                  <tr className="border-t-2 border-zinc-400 bg-[#EEF1FD]/70 align-middle font-semibold">
                    <NameCell label="Total" sub={`${totals.totalTrips} trips`} onReport={scope === "single" && by === "store" ? undefined : () => open(null)} reportLabel="All trips" />
                    <td className="px-3 py-3 align-middle"><BusinessCell total={totals.business} money={totals.groupBusiness} /></td>
                    {GROUPS.map((g) => <td key={g} className="px-2 py-3 align-middle"><GroupCell b={totals[g]} onOpen={() => open(null, g)} /></td>)}
                    <td className="px-2 py-3 align-middle"><LeadSyncCell r={totals} onOpen={() => open(null)} /></td>
                  </tr>
                )}
              </tbody>
            </table>
            {rows.length === 0 && <EmptyRows text="No trips in this range." />}
          </Frame>
          <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPageChange={setPage} totalItems={rows.length} pageSize={pageSize}
            pageSizeOptions={[20]} onPageSizeChange={() => {}} itemLabel={first.toLowerCase()} className="-mt-3 !py-0" />
        </>
      )}
    </DashboardShell>
  );
}
