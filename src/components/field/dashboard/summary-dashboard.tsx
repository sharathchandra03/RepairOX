"use client";
/* Multi-Store · Single-Store · FE Team dashboards — ONE component, three scopes.
   Row = Store (or Field Engineer) | Business (+ breakup by Drop/On-Site/Pickup)
   | On-Site | Pickup | Drop (Assign / Completed / New · Warranty). Totals row
   reconciles; every count and Report opens the exact trips on /field. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, IndianRupee, Route as RouteIcon, Truck } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { FieldKpiCards } from "@/components/field/field-kpi-cards";
import { DashboardShell, DashboardNotice } from "@/components/field/dashboard/dashboard-shell";
import { useFieldDashboard, type DashboardId } from "@/components/field/dashboard/use-field-dashboard";
import { Frame, Head, NameCell, MoneyBreakup, GroupCell, EmptyRows, inr, GROUPS } from "@/components/field/dashboard/dashboard-table";
import { boundsForPreset, buildSummaryRows, sumRows, TRIP_GROUP_LABEL, type DashPreset, type DashRow, type GroupBy, type TripGroup } from "@/lib/field-dashboard";

export type SummaryScope = "multi" | "single" | "fe";
const META: Record<SummaryScope, { id: DashboardId; by: GroupBy; first: string }> = {
  multi: { id: "multi-store", by: "store", first: "Store" },
  single: { id: "single-store", by: "store", first: "Store" },
  fe: { id: "fe-team", by: "engineer", first: "Field Engineer" },
};

export function SummaryDashboard({ scope }: { scope: SummaryScope }) {
  const m = META[scope];
  const router = useRouter();
  const { jobs, hydrated, ctx, multiStore } = useFieldDashboard();
  const [preset, setPreset] = useState<DashPreset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const bounds = useMemo(() => boundsForPreset(preset, from, to), [preset, from, to]);
  const rows = useMemo(() => buildSummaryRows(jobs, m.by, bounds, ctx), [jobs, m.by, bounds, ctx]);
  const totals = useMemo(() => sumRows(rows), [rows]);

  const open = (r: DashRow | null, group?: TripGroup) => {
    const p = new URLSearchParams();
    if (r) { if (m.by === "store") p.set("store", r.key); else if (r.key !== "unassigned") p.set("fe", r.key); }
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

  const assigned = GROUPS.reduce((n, g) => n + totals[g].assigned, 0);
  const completed = GROUPS.reduce((n, g) => n + totals[g].completed, 0);
  const T = totals.totalTrips;
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  return (
    <DashboardShell id={m.id}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs value={preset} onChange={(v) => { setPreset(v as DashPreset); setPage(1); }} size="sm"
            options={[{ label: "All", value: "all" }, { label: "Today", value: "today" }, { label: "This Month", value: "month" }, { label: "Last Month", value: "lastmonth" }, { label: "Customise", value: "custom" }]} />
        </div>
      </div>
      <DateRangePicker open={preset === "custom"} from={from} to={to}
        onFromChange={(v) => { setFrom(v); setPreset("custom"); }} onToChange={(v) => { setTo(v); setPreset("custom"); }} />

      <FieldKpiCards total={T} columns="lg:grid-cols-4" items={[
        { key: "trips", label: "Total trips", value: T, tone: "sky", Icon: RouteIcon, share: T ? 100 : 0, hint: "Cancelled excluded" },
        { key: "assigned", label: "Assigned", value: assigned, tone: "violet", Icon: Truck, hint: T ? `${Math.round((assigned / T) * 100)}% of trips` : undefined },
        { key: "completed", label: "Completed", value: completed, tone: "emerald", Icon: CheckCircle2, share: assigned ? Math.round((completed / assigned) * 100) : 0, hint: assigned ? `${Math.round((completed / assigned) * 100)}% of assigned` : undefined },
        { key: "business", label: "Business (finalized)", value: inr(totals.business), tone: "amber", Icon: IndianRupee, hint: "Finalized invoices only" },
      ]} />

      {!hydrated ? <EmptyRows text="Loading…" /> : (
        <>
          <Frame>
            <table className="w-full min-w-[980px] table-fixed text-[14px]">
              <colgroup><col style={{ width: 210 }} /><col style={{ width: 190 }} /><col /><col /><col /></colgroup>
              <Head cols={[m.first, "Business", ...GROUPS.map((g) => TRIP_GROUP_LABEL[g])]} firstWidth={210} />
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.key} className="rox-table-row align-top hover:bg-muted/40">
                    <NameCell label={r.label} onReport={() => open(r)} />
                    <td className="px-3 py-2.5 text-center align-middle">
                      <p className="text-[16px] font-extrabold tabular-nums text-emerald-700">{inr(r.business)}</p>
                      <MoneyBreakup money={r.groupBusiness} className="mt-1" />
                    </td>
                    {GROUPS.map((g) => <td key={g} className="px-2 py-1.5 align-middle"><GroupCell b={r[g]} onOpen={() => open(r, g)} /></td>)}
                  </tr>
                ))}
                {rows.length > 0 && (
                  <tr className="border-t-2 border-zinc-400 bg-[#EEF1FD]/70 align-top font-semibold">
                    <NameCell label="Total" onReport={scope === "single" ? undefined : () => open(null)} reportLabel="All trips" />
                    <td className="px-3 py-2.5 text-center align-middle">
                      <p className="text-[16px] font-extrabold tabular-nums text-emerald-700">{inr(totals.business)}</p>
                      <MoneyBreakup money={totals.groupBusiness} className="mt-1" />
                    </td>
                    {GROUPS.map((g) => <td key={g} className="px-2 py-1.5 align-middle"><GroupCell b={totals[g]} onOpen={() => open(null, g)} /></td>)}
                  </tr>
                )}
              </tbody>
            </table>
            {rows.length === 0 && <EmptyRows text="No trips in this range." />}
          </Frame>
          <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPageChange={setPage} totalItems={rows.length} pageSize={pageSize}
            pageSizeOptions={[20]} onPageSizeChange={() => {}} itemLabel={m.by === "store" ? "store" : "engineer"} className="-mt-3 !py-0" />
        </>
      )}
    </DashboardShell>
  );
}
