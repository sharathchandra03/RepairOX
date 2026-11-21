"use client";
/* Field Activity → Distance & fuel. Summary per Ninja · Days to review (missing readings / photos, GPS
   mismatches, very long days — click to fix) · Km by month for the year. Fuel = km x the rate in the rules. */
import { useMemo, useState } from "react";
import { AlertTriangle, Camera, Fuel, Gauge, Route } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { useAttendance } from "@/components/field/activity/use-attendance";
import { KpiStrip, LoadError, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { Dash, FieldGrid, FootLabel, NameText, useFieldGrid, type FCol } from "@/components/field/grid";
import { DayDialog } from "@/components/field/insights/attendance-section";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { KM_CHECK_LABEL, monthlyKm, type DayCell } from "@/lib/field-attendance";
import type { RosterNinja } from "@/lib/field-attendance-data";

type View = "summary" | "review" | "months";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const dayLabel = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
const reasons = (d: DayCell) => [d.missingReading && "No odometer reading", d.kmCheck && KM_CHECK_LABEL[d.kmCheck], d.kmFlag && "More than 300 km in a day", d.missingPhoto && "Odometer photo missing"].filter(Boolean) as string[];

export function DistancePage() {
  const a = useActivity();
  const { can } = usePermissions();
  const canManage = allow(can, CAP.field.edit);
  const att = useAttendance(a.ym, a.tz, a.storeSel, a.multiStore, a.q);
  const { months, policy, yearLogs, yearMarks, year, loading, err, ninjas } = att;
  const [view, setView] = useState<View>("summary");
  const [open, setOpen] = useState<{ ninja: RosterNinja; cell: DayCell } | null>(null);
  const review = useMemo(() => months.flatMap(({ n, m }) => m.days.filter((d) => reasons(d).length).map((d) => ({ n, d }))).sort((x, y) => y.d.date.localeCompare(x.d.date)), [months]);
  const kmYear = useMemo(() => ninjas.map((n) => ({ n, k: monthlyKm(yearLogs, n.id, year) })), [ninjas, yearLogs, year]);
  const s = (k: "totalKm" | "fuel" | "missingReadings" | "kmChecks" | "missingPhotos") => months.reduce((t, x) => t + x.m.summary[k], 0);
  const worked = months.reduce((t, x) => t + x.m.summary.present + x.m.summary.halfDay, 0);
  const key = `${view}|${a.ym}|${a.q}|${a.storeSel.join(",")}`;
  const pagedN = usePaged(months, key), pagedR = usePaged(review, key), pagedY = usePaged(kmYear, key);

  useRegisterSheets(useMemo(() => loading ? null : [
    { name: "Distance & fuel", headers: ["Ninja", "Days worked", "Distance (km)", "Fuel (₹)", "Km per day", "Days without reading", "GPS checks", "No photo"],
      rows: months.map(({ n, m }) => { const w = m.summary.present + m.summary.halfDay; return [n.name, w, m.summary.totalKm, m.summary.fuel, w ? Math.round(m.summary.totalKm / w) : 0, m.summary.missingReadings, m.summary.kmChecks, m.summary.missingPhotos]; }) },
    { name: "Days to review", headers: ["Ninja", "Day", "Odometer km", "GPS km", "Why"], rows: review.map(({ n, d }) => [n.name, d.date, d.km ?? "", d.gpsKm ?? "", reasons(d).join("; ")]) },
    { name: `Km by month ${year}`, headers: ["Ninja", ...MONTHS, "Total"], rows: kmYear.map(({ n, k }) => [n.name, ...k, k.reduce((t, x) => t + x, 0)]) },
  ], [loading, months, review, kmYear, year]));

  type MR = (typeof months)[number]; type RR = (typeof review)[number]; type YR = (typeof kmYear)[number];
  const wk = (m: MR["m"]) => m.summary.present + m.summary.halfDay;
  const flagCol = (k: "missingReadings" | "kmChecks" | "missingPhotos", label: string, tone: string): FCol<MR> =>
    ({ key: k, label, width: 140, render: ({ m }) => m.summary[k] || <Dash />, cellClass: ({ m }) => m.summary[k] > 0 && `font-semibold ${tone}`, foot: s(k) });
  const sumGrid = useFieldGrid<MR>("activity_distance_summary", [
    { key: "ninja", label: "Ninja", width: 240, anchor: true, render: ({ n }) => <NameText label={n.name} href={`/field/activity/${n.id}?tab=attendance`} />, foot: <FootLabel sub={`${months.length} Ninjas`} /> },
    { key: "worked", label: "Days worked", width: 140, render: ({ m }) => wk(m), foot: worked },
    { key: "km", label: "Distance", width: 150, cellClass: () => "font-semibold", render: ({ m }) => `${m.summary.totalKm.toLocaleString("en-IN")} km`, foot: `${s("totalKm").toLocaleString("en-IN")} km` },
    { key: "fuel", label: "Fuel", width: 140, render: ({ m }) => inr(m.summary.fuel), foot: inr(s("fuel")) },
    { key: "perday", label: "Km per day", width: 140, render: ({ m }) => (wk(m) ? Math.round(m.summary.totalKm / wk(m)) : <Dash />), foot: worked ? Math.round(s("totalKm") / worked) : 0 },
    flagCol("missingReadings", "No reading", "text-amber-700"), flagCol("kmChecks", "GPS checks", "text-rose-700"), flagCol("missingPhotos", "No photo", "text-amber-700"),
  ]);
  const revGrid = useFieldGrid<RR>("activity_distance_review", [
    { key: "ninja", label: "Ninja", width: 230, anchor: true, render: ({ n }) => <NameText label={n.name} href={`/field/activity/${n.id}?tab=attendance`} /> },
    { key: "day", label: "Day", width: 150, render: ({ d }) => dayLabel(d.date) },
    { key: "odo", label: "Odometer", width: 130, render: ({ d }) => (d.km != null ? `${d.km} km` : <Dash />) },
    { key: "gps", label: "GPS", width: 120, render: ({ d }) => (d.gpsKm != null ? `${d.gpsKm} km` : <Dash />) },
    { key: "why", label: "What to check", width: 380, align: "left", render: ({ d }) => <span className="flex items-start gap-2">{d.kmCheck ? <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-rose-600" /> : <Gauge className="mt-1 h-4 w-4 shrink-0 text-amber-600" />}{reasons(d).join(" · ")}</span> },
    { key: "act", label: "Action", width: 120, actions: true, render: ({ n, d }) => <Button size="sm" variant="outline" onClick={() => setOpen({ ninja: n, cell: d })}>{canManage ? "Fix" : "Open"}</Button> },
  ]);
  const yearGrid = useFieldGrid<YR>("activity_distance_months", [
    { key: "ninja", label: "Ninja", width: 220, anchor: true, render: ({ n }) => <NameText label={n.name} href={`/field/activity/${n.id}`} />, foot: <FootLabel /> },
    ...MONTHS.map((mo, i): FCol<YR> => ({ key: `m${i}`, label: mo, width: 92, render: ({ k }) => k[i] || <Dash />,
      cellClass: () => `${year}-${String(i + 1).padStart(2, "0")}` === a.ym && "!bg-[#EEF1FD] font-semibold", foot: kmYear.reduce((t, x) => t + x.k[i], 0) || "—" })),
    { key: "total", label: "Total", width: 120, cellClass: () => "font-bold", render: ({ k }) => k.reduce((t, x) => t + x, 0).toLocaleString("en-IN"), foot: kmYear.reduce((t, x) => t + x.k.reduce((p, q) => p + q, 0), 0).toLocaleString("en-IN") },
  ]);
  const cur = view === "summary" ? sumGrid : view === "review" ? revGrid : yearGrid;
  if (!supabase) return <Unavailable text="Distance & fuel is available when RepairOX is connected to the database." />;
  if (err) return <LoadError what="distance" err={err} />;
  const empty = loading ? "Loading…" : months.length === 0 ? "No Ninjas found for the stores and search you chose." : null;
  return (
    <div className="rox-lock-fill space-y-4">
      <KpiStrip loading={loading} items={[
        { label: "Distance", value: `${s("totalKm").toLocaleString("en-IN")} km`, sub: worked ? `${Math.round(s("totalKm") / worked)} km per working day` : "no working days yet", icon: Route },
        { label: "Fuel", value: inr(s("fuel")), sub: `at ₹${policy.fuelRatePerKm} per km`, icon: Fuel },
        { label: "Days to review", value: review.length, sub: `${s("missingReadings")} without a reading · ${s("kmChecks")} GPS checks`, icon: AlertTriangle, tone: review.length ? "warn" : "default" },
        { label: "Photos missing", value: s("missingPhotos"), sub: policy.odometerPhotoRequired ? "a photo is required" : "photos are optional", icon: Camera, tone: s("missingPhotos") ? "warn" : "default" },
      ]} />
      <ViewBar value={view} onChange={setView}
        options={[{ label: "Summary", value: "summary" }, { label: `Days to review${review.length ? ` (${review.length})` : ""}`, value: "review" }, { label: `Km by month · ${year}`, value: "months" }]}
        info={`Km = end − start odometer reading from the Ninja app. Fuel = km × ₹${policy.fuelRatePerKm}. GPS only covers the time between accepting a job and handover, so it is normally lower than the odometer; a big gap is flagged for review.`}>
        {cur.menus}
      </ViewBar>

      {view === "summary" && <><FieldGrid grid={sumGrid} rows={pagedN.slice} rowKey={(r) => r.n.id} foot empty={empty} />{pagedN.footer("Ninja")}</>}
      {view === "review" && <><FieldGrid grid={revGrid} rows={pagedR.slice} rowKey={(r) => `${r.n.id}-${r.d.date}`} empty={loading ? "Loading…" : review.length ? null : "Nothing to review this month."} />{pagedR.footer("day")}</>}
      {view === "months" && <><FieldGrid grid={yearGrid} rows={pagedY.slice} rowKey={(r) => r.n.id} foot empty={loading ? "Loading…" : kmYear.length ? null : "No data."} />{pagedY.footer("Ninja")}</>}

      {open && <DayDialog ninja={open.ninja} cell={open.cell} tz={a.tz} policy={policy} canManage={canManage}
        mark={yearMarks.find((m) => m.staffId === open.ninja.id && m.day === open.cell.date)} onClose={() => setOpen(null)}
        onMark={(k, ex) => void att.setMark(open.ninja.id, open.cell.date, k, ex).then((ok) => ok && setOpen(null))}
        onDecide={(m, ok) => void att.decide(m, ok).then((r) => r && setOpen(null))} onSaved={() => { setOpen(null); void att.load(); }} />}
    </div>
  );
}
