"use client";
/* Store Master · FE Master — month-by-month grid for the chosen dimension (Store ·
   Field Engineer · Sales Agent · Lead Source). Each cell: Trips, Business and the
   On-Site / Pickup / Drop breakup, aligned in a fixed block. "Show" switches the
   cell between Overview / Business / Trips / Completed. Month columns follow the
   selected year. Excel + CSV export uses the same rows. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { InfoHint } from "@/components/ui/info-hint";
import { Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { downloadXLSX, downloadCSV, toCSV } from "@/lib/csv-utils";
import { CollapsibleControls, IndicatorChip } from "@/components/field/dashboard/collapsible-controls";
import { DashboardShell } from "@/components/field/dashboard/dashboard-shell";
import { useFieldDashboard, type DashboardId } from "@/components/field/dashboard/use-field-dashboard";
import { Frame, Head, NameCell, Dash, StatBlock, EmptyRows, inr, GROUPS } from "@/components/field/dashboard/dashboard-table";
import { buildMasterRows, masterTable, availableYears, GROUP_BY_LABEL, MONTH_NAMES, TRIP_GROUP_LABEL, type GroupBy, type MonthCell } from "@/lib/field-dashboard";

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export function MasterDashboard({ scope }: { scope: "store" | "fe" }) {
  const [by, setBy] = useState<GroupBy>(scope === "store" ? "store" : "engineer");
  const [mode, setMode] = useState<"overview" | "business" | "trips" | "done">("overview");
  const id: DashboardId = scope === "store" ? "store-master" : "fe-master";
  const router = useRouter();
  const { jobs, hydrated, ctx } = useFieldDashboard();
  const [year, setYear] = useState(new Date().getFullYear());
  const years = useMemo(() => availableYears(jobs), [jobs]);
  const rows = useMemo(() => buildMasterRows(jobs, by, year, ctx), [jobs, by, year, ctx]);

  const now = new Date();
  const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : year > now.getFullYear() ? 0 : 12;
  const first = GROUP_BY_LABEL[by];
  const COL = 180;
  const exp = masterTable(rows, monthCount, year, first);
  const fname = `field-${id}-by-${by}-${year}`;

  const go = (key: string, fromD: string, toD: string) => {
    const p = new URLSearchParams();
    if (by === "store") p.set("store", key);
    else if (by === "engineer") { if (key !== "unassigned") p.set("fe", key); }
    else if (by === "agent") p.set("sales", key);
    else p.set("src", key);
    p.set("from", fromD); p.set("to", toD); p.set("excl", "cancelled");
    router.push(`/field?${p.toString()}`);
  };
  const month = (key: string, mi: number) => go(key, `${year}-${pad(mi + 1)}-01`, `${year}-${pad(mi + 1)}-${pad(lastDay(year, mi))}`);

  return (
    <DashboardShell id={id}>
      <CollapsibleControls workspaceKey={`field_dash_${id}`} indicators={<>
        <IndicatorChip>{year}</IndicatorChip>
        <IndicatorChip>By {first}</IndicatorChip>
        <IndicatorChip>Show: {mode === "done" ? "Completed" : mode[0].toUpperCase() + mode.slice(1)}</IndicatorChip>
      </>}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Year</span>
          <div className="w-28"><Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="h-[36px]" options={years.map((y) => ({ label: String(y), value: String(y) }))} /></div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            View by
            <InfoHint content="Sales Agent is the lead owner who routed the trip. Field Engineer is the person who does the trip. They are different people and are never mixed." />
          </span>
          <div className="w-44"><Select value={by} onChange={(e) => setBy(e.target.value as GroupBy)} className="h-[36px]"
            options={(Object.keys(GROUP_BY_LABEL) as GroupBy[]).map((k) => ({ label: GROUP_BY_LABEL[k], value: k }))} /></div>
        </div>
        <SegmentedTabs size="sm" value={mode} onChange={(v) => setMode(v as typeof mode)}
          options={[{ label: "Overview", value: "overview" }, { label: "Business", value: "business" }, { label: "Trips", value: "trips" }, { label: "Completed", value: "done" }]} />
        <div className="ml-auto">
          <Dropdown width="w-52" trigger={({ toggle }) => (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}><Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" /></Button>
          )}>
            {(close) => (<>
              <MenuItem icon={FileSpreadsheet} onClick={() => { void downloadXLSX(`${fname}.xlsx`, exp.headers, exp.rows, `${year}`); close(); }}>Excel (.xlsx)</MenuItem>
              <MenuItem icon={FileText} onClick={() => { downloadCSV(`${fname}.csv`, toCSV(exp.headers, exp.rows)); close(); }}>CSV (.csv)</MenuItem>
            </>)}
          </Dropdown>
        </div>
      </div>
      </CollapsibleControls>
      {!hydrated ? <EmptyRows text="Loading…" /> : (
        <Frame>
          <table className="table-fixed text-[14px]" style={{ width: 210 + (monthCount + 1) * COL }}>
            <colgroup><col style={{ width: 210 }} />{Array.from({ length: monthCount + 1 }).map((_, i) => <col key={i} style={{ width: COL }} />)}</colgroup>
            <Head cols={[first, ...MONTH_NAMES.slice(0, monthCount), `${year} total`]} firstWidth={210} />
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="rox-table-row align-middle hover:bg-muted/40">
                  <NameCell label={r.label} sub={`${r.yearTrips} trips in ${year}`} onReport={() => go(r.key, `${year}-01-01`, `${year}-12-31`)} />
                  {r.months.slice(0, monthCount).map((c) => (
                    <td key={c.month} className="px-2 py-3 align-middle">
                      <Cell mode={mode} c={c} onOpen={() => month(r.key, c.month)} />
                    </td>
                  ))}
                  <td className="px-2 py-3 align-middle">
                    {r.yearGroups && <Cell mode={mode} c={{ month: -1, totalTrips: r.yearTrips, business: r.yearBusiness, groupBusiness: r.yearGroups.groupBusiness, onsite: r.yearGroups.onsite, pickup: r.yearGroups.pickup, drop: r.yearGroups.drop, jobIds: [] }} onOpen={() => go(r.key, `${year}-01-01`, `${year}-12-31`)} strong />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyRows text={`No trips in ${year}.`} />}
        </Frame>
      )}
    </DashboardShell>
  );
}

function Cell({ c, onOpen, strong, mode }: { c: MonthCell; onOpen: () => void; strong?: boolean; mode: "overview" | "business" | "trips" | "done" }) {
  if (c.totalTrips === 0) return <Dash />;
  const done = c.onsite.completed + c.pickup.completed + c.drop.completed;
  const mix = GROUPS.filter((g) => c[g].total > 0);
  const stats =
    mode === "business" ? [{ label: "Business", value: inr(c.business), tone: "emerald" as const }]
    : mode === "trips" ? [{ label: "Trips", value: c.totalTrips, tone: "sky" as const }]
    : mode === "done" ? [{ label: "Completed", value: done, tone: "emerald" as const }, { label: "Of trips", value: c.totalTrips, tone: "sky" as const }]
    : [{ label: "Trips", value: c.totalTrips, tone: "sky" as const }, { label: "Business", value: inr(c.business), tone: "emerald" as const }];
  const tip = mix.map((g) => `${TRIP_GROUP_LABEL[g]}: ${c[g].total} trips${c.groupBusiness[g] != null ? ` · ${inr(c.groupBusiness[g])}` : ""}`).join("\n");
  return <StatBlock stats={stats} onOpen={onOpen} strong={strong} title={tip || "Open these trips"}
    footer={mode === "overview" ? mix.map((g) => `${TRIP_GROUP_LABEL[g]} ${c[g].total}`).join(" · ") : undefined} />;
}
