"use client";
/* Store Master · FE Master — month-by-month grid. Each cell: TOTAL TRIPS,
   TOTAL BUSINESS and the BREAKUP (On-Site / Pickup / Drop trips + business).
   Month columns follow the selected year (none hard-coded). */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";
import { DashboardShell } from "@/components/field/dashboard/dashboard-shell";
import { useFieldDashboard, type DashboardId } from "@/components/field/dashboard/use-field-dashboard";
import { Frame, Head, NameCell, EmptyRows, inr, GROUPS } from "@/components/field/dashboard/dashboard-table";
import { buildMasterRows, availableYears, MONTH_NAMES, TRIP_GROUP_LABEL, type GroupBy, type MonthCell } from "@/lib/field-dashboard";

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export function MasterDashboard({ scope }: { scope: "store" | "fe" }) {
  const by: GroupBy = scope === "store" ? "store" : "engineer";
  const id: DashboardId = scope === "store" ? "store-master" : "fe-master";
  const router = useRouter();
  const { jobs, hydrated, ctx } = useFieldDashboard();
  const [year, setYear] = useState(new Date().getFullYear());
  const years = useMemo(() => availableYears(jobs), [jobs]);
  const rows = useMemo(() => buildMasterRows(jobs, by, year, ctx), [jobs, by, year, ctx]);

  const now = new Date();
  const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : year > now.getFullYear() ? 0 : 12;
  const first = scope === "store" ? "Stores" : "Field Engineers";
  const COL = 176;

  const go = (key: string, fromD: string, toD: string) => {
    const p = new URLSearchParams();
    if (by === "store") p.set("store", key); else if (key !== "unassigned") p.set("fe", key);
    p.set("from", fromD); p.set("to", toD); p.set("excl", "cancelled");
    router.push(`/field?${p.toString()}`);
  };
  const month = (key: string, mi: number) => go(key, `${year}-${pad(mi + 1)}-01`, `${year}-${pad(mi + 1)}-${pad(lastDay(year, mi))}`);

  return (
    <DashboardShell id={id}>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Year</span>
        <div className="w-32"><Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} options={years.map((y) => ({ label: String(y), value: String(y) }))} /></div>
      </div>
      {!hydrated ? <EmptyRows text="Loading…" /> : (
        <Frame>
          <table className="table-fixed text-[14px]" style={{ width: 210 + (monthCount + 1) * COL }}>
            <colgroup><col style={{ width: 210 }} />{Array.from({ length: monthCount + 1 }).map((_, i) => <col key={i} style={{ width: COL }} />)}</colgroup>
            <Head cols={[first, ...MONTH_NAMES.slice(0, monthCount), `${year} total`]} firstWidth={210} />
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="rox-table-row align-top hover:bg-muted/40">
                  <NameCell label={r.label} onReport={() => go(r.key, `${year}-01-01`, `${year}-12-31`)} />
                  {r.months.slice(0, monthCount).map((c) => (
                    <td key={c.month} className="px-2 py-1.5 align-middle">
                      <Cell c={c} onOpen={() => month(r.key, c.month)} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 align-middle">
                    {r.yearGroups && <Cell c={{ month: -1, totalTrips: r.yearTrips, business: r.yearBusiness, groupBusiness: r.yearGroups.groupBusiness, onsite: r.yearGroups.onsite, pickup: r.yearGroups.pickup, drop: r.yearGroups.drop, jobIds: [] }} onOpen={() => go(r.key, `${year}-01-01`, `${year}-12-31`)} strong />}
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

function Cell({ c, onOpen, strong }: { c: MonthCell; onOpen: () => void; strong?: boolean }) {
  if (c.totalTrips === 0) return <span className="block text-center text-zinc-300">—</span>;
  return (
    <button onClick={onOpen} title="Open these trips" className={`w-full rounded-lg px-2 py-0.5 text-left leading-[1.25] transition hover:bg-[#EEF1FD] ${strong ? "bg-muted/40" : ""}`}>
      <span className="block text-[12px] font-bold uppercase tabular-nums text-sky-800">Trips – {c.totalTrips}</span>
      <span className="block text-[12px] font-bold uppercase tabular-nums text-emerald-700">Business – {inr(c.business)}</span>
      <span className="mt-0.5 block truncate border-t border-border/70 pt-0.5 text-[10px] font-semibold uppercase tabular-nums text-zinc-500"
        title={GROUPS.filter((g) => c[g].total > 0).map((g) => `${TRIP_GROUP_LABEL[g]}: ${c[g].total} trips${c.groupBusiness[g] != null ? ` · ${inr(c.groupBusiness[g])}` : ""}`).join("\n")}>
        {GROUPS.filter((g) => c[g].total > 0).map((g) => `${TRIP_GROUP_LABEL[g]} ${c[g].total}`).join(" · ")}
      </span>
    </button>
  );
}
