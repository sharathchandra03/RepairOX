"use client";
/* Field Activity → Daily activity. The Ninja Daily Activity sheet, per day or for the whole month:
   completed / assigned trips by type, warranty, total, XL, 6+ / 9+, latest devices, reviews, km.
   Source: real trip legs (field_trips) via lib/field-daily-activity.ts. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Award, Route, Star, Truck } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { C, DataTable, Dash, FootName, KpiStrip, LoadError, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { useLegs } from "@/components/field/insights/daily-activity";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { Select } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
import { cn } from "@/lib/utils";
import { monthDays } from "@/lib/field-attendance";
import { avgRating, ninjaDayRows, ninjaPeriodRows, pickableDays, sumDayRows, type NinjaDayRow } from "@/lib/field-daily-activity";

type View = "day" | "month";
type Row = Omit<NinjaDayRow, "hit6" | "hit9"> & { hit6?: boolean; hit9?: boolean; days6?: number; days9?: number };
const dayLabel = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
const FZ = { ["--rox-frozen-offset" as string]: "0px" } as React.CSSProperties;
const ratio = (c: { assigned: number; completed: number }) => (c.assigned ? <><b>{c.completed}</b><span className="text-muted-foreground"> / {c.assigned}</span></> : <Dash />);
const n0 = (n: number) => (n ? n : <Dash />);

export function DailyPage() {
  const a = useActivity();
  const { team } = usePermissions();
  const { jobs, ctx, multiStore } = useFieldDashboard();
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? "Ninja";
  const bounds = useMemo(() => { const d = monthDays(a.ym); return { from: d[0], to: d[d.length - 1] }; }, [a.ym]);
  const days = useMemo(() => pickableDays(bounds.from, bounds.to), [bounds.from, bounds.to]);
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState("");
  const effDay = days.includes(day) ? day : days[0] ?? "";
  const scoped = useMemo(() => jobs.filter((j) => !multiStore || matchesStoreSelection(j.branchId, a.storeSel)), [jobs, multiStore, a.storeSel]);
  const { legs, loading, err, available } = useLegs(scoped, ctx, bounds, days[days.length - 1] ?? bounds.from, days[0] ?? bounds.to);
  const hit = (id: string) => !a.q || nameOf(id).toLowerCase().includes(a.q.toLowerCase());
  const rows: Row[] = useMemo(() => (view === "day" ? ninjaDayRows(legs, effDay, nameOf) : ninjaPeriodRows(legs, days[days.length - 1] ?? null, days[0] ?? null, nameOf)).filter((r) => hit(r.ninjaId)),
    [legs, effDay, view, days, team, a.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const tot = useMemo(() => sumDayRows(rows as unknown as NinjaDayRow[]), [rows]);
  const paged = usePaged(rows, `${view}|${effDay}|${a.ym}|${a.q}|${a.storeSel.join(",")}`);
  const six = view === "day" ? rows.filter((r) => r.hit6).length : rows.reduce((t, r) => t + (r.days6 ?? 0), 0);
  const nine = view === "day" ? rows.filter((r) => r.hit9).length : rows.reduce((t, r) => t + (r.days9 ?? 0), 0);
  const cols = ["Ninja", "On-site", "Pickup", "Buyback", "Drop", "Warranty O/P/D", "Total", "XL", view === "day" ? "6+" : "Days 6+", view === "day" ? "9+" : "Days 9+", "MacBook", "iPhone > 14", "Reviews", "KMs"];

  useRegisterSheets(useMemo(() => loading ? null : [{ name: view === "day" ? `Ninja day ${effDay}` : `Ninja month ${a.ym}`, headers: cols.concat(["Avg stars"]),
    rows: rows.map((r) => { const c = (x: { assigned: number; completed: number }) => `${x.completed}/${x.assigned}`;
      return [nameOf(r.ninjaId), c(r.onsite), c(r.pickup), c(r.buyback), c(r.drop), `${r.warrantyOnsite}/${r.warrantyPickup}/${r.warrantyDrop}`, r.total, r.xl,
        view === "day" ? (r.hit6 ? "YES" : "NO") : r.days6 ?? 0, view === "day" ? (r.hit9 ? "YES" : "NO") : r.days9 ?? 0, r.macbook, r.iphone, r.reviews, r.km ?? "", avgRating(r) ?? ""]; }) }],
  [loading, rows, view, effDay, a.ym])); // eslint-disable-line react-hooks/exhaustive-deps

  if (!available) return <Unavailable text="Daily activity is available when RepairOX is connected to the database." />;
  if (err) return <LoadError what="trips" err={err} />;
  const flag = (on: boolean) => <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", on ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-500 ring-zinc-200")}>{on ? "Yes" : "No"}</span>;
  const w = (o: number, p: number, d: number) => (o + p + d ? `${o} / ${p} / ${d}` : <Dash />);
  return (
    <div className="rox-lock-fill space-y-4">
      <KpiStrip loading={loading} items={[
        { label: view === "day" ? `Trips · ${effDay ? dayLabel(effDay) : ""}` : "Trips this month", value: tot.total, sub: `${tot.pickup.completed + tot.drop.completed + tot.onsite.completed + tot.buyback.completed} completed · ${rows.length} Ninjas`, icon: Truck },
        { label: view === "day" ? "Ninjas with 6+ / 9+" : "Days with 6+ / 9+", value: `${six} / ${nine}`, sub: "daily trip bonus", icon: Award, tone: six ? "good" : "default" },
        { label: "Km", value: tot.km != null ? Math.round(tot.km).toLocaleString("en-IN") : "—", sub: `${tot.xl} XL trip${tot.xl === 1 ? "" : "s"} over 40 km`, icon: Route },
        { label: "Reviews", value: tot.reviews, sub: tot.reviews ? `${avgRating(tot)}★ average` : "none yet", icon: Star },
      ]} />
      <ViewBar value={view} onChange={setView} options={[{ label: "One day", value: "day" }, { label: "Whole month", value: "month" }]}
        info="Counts are completed / assigned trip legs. Total = every assigned leg (new + warranty + buyback). 6+ / 9+ = the Ninja's total that day reached 6 / 9 (for the month: the number of such days). XL = a trip over 40 km by GPS. KMs come from GPS tracking; “Not travelled” = tracked with no distance.">
        {view === "day" && <Select className="h-[34px] w-[200px]" value={effDay} onChange={(e) => setDay(e.target.value)} options={days.map((d) => ({ label: dayLabel(d), value: d }))} />}
      </ViewBar>
      <DataTable cols={cols} first={200} minWidth={1450} empty={loading ? "Loading…" : rows.length ? null : view === "day" ? "No Ninja trips on this day." : "No Ninja trips this month."}
        foot={<tr className="align-middle"><FootName sub={`${rows.length} Ninjas`} /><td className={C}>{ratio(tot.onsite)}</td><td className={C}>{ratio(tot.pickup)}</td><td className={C}>{ratio(tot.buyback)}</td><td className={C}>{ratio(tot.drop)}</td>
          <td className={C}>{w(tot.warrantyOnsite, tot.warrantyPickup, tot.warrantyDrop)}</td><td className={C}>{tot.total}</td><td className={C}>{tot.xl}</td><td className={C}>{six}</td><td className={C}>{nine}</td>
          <td className={C}>{tot.macbook}</td><td className={C}>{tot.iphone}</td><td className={C}>{tot.reviews}</td><td className={C}>{tot.km != null ? `${Math.round(tot.km)} km` : "—"}</td></tr>}>
        {paged.slice.map((r) => (
          <tr key={r.ninjaId} className="rox-table-row align-middle hover:bg-muted/40">
            <td className="rox-frozen rox-frozen-left rox-frozen-left-edge px-4 py-3 text-left" style={FZ}><Link href={`/field/activity/${r.ninjaId}`} className="block truncate text-[13px] font-bold uppercase tracking-wide hover:text-[#4361EE]">{nameOf(r.ninjaId)}</Link></td>
            <td className={C}>{ratio(r.onsite)}</td><td className={C}>{ratio(r.pickup)}</td><td className={C}>{ratio(r.buyback)}</td><td className={C}>{ratio(r.drop)}</td>
            <td className={C}>{w(r.warrantyOnsite, r.warrantyPickup, r.warrantyDrop)}</td>
            <td className={cn(C, "font-bold")}>{r.total}</td><td className={C}>{n0(r.xl)}</td>
            <td className={C}>{view === "day" ? flag(!!r.hit6) : n0(r.days6 ?? 0)}</td><td className={C}>{view === "day" ? flag(!!r.hit9) : n0(r.days9 ?? 0)}</td>
            <td className={C}>{n0(r.macbook)}</td><td className={C}>{n0(r.iphone)}</td>
            <td className={C}>{r.reviews ? <>{r.reviews}<span className="block text-[10.5px] text-muted-foreground">{avgRating(r)}★</span></> : <Dash />}</td>
            <td className={C}>{r.km == null ? <Dash /> : r.km === 0 ? <span className="text-muted-foreground">Not travelled</span> : `${r.km} km`}</td>
          </tr>
        ))}
      </DataTable>
      {paged.footer("Ninja")}
    </div>
  );
}
