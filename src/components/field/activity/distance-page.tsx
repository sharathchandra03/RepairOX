"use client";
/* Field Activity → Distance & fuel. Summary per Ninja · Days to review (missing readings / photos, GPS
   mismatches, very long days — click to fix) · Km by month for the year. Fuel = km x the rate in the rules. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, Fuel, Gauge, Route } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { useAttendance } from "@/components/field/activity/use-attendance";
import { C, DataTable, Dash, FootName, KpiStrip, LoadError, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { DayDialog } from "@/components/field/insights/attendance-section";
import { NameCell } from "@/components/field/dashboard/dashboard-table";
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
const FZ = { ["--rox-frozen-offset" as string]: "0px" } as React.CSSProperties;
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
        info={`Km = end − start odometer reading from the Ninja app. Fuel = km × ₹${policy.fuelRatePerKm}. GPS only covers the time between accepting a job and handover, so it is normally lower than the odometer; a big gap is flagged for review.`} />

      {view === "summary" && <>
        <DataTable cols={["Ninja", "Days worked", "Distance", "Fuel", "Km per day", "No reading", "GPS checks", "No photo"]} minWidth={1000} empty={empty}
          foot={<tr className="align-middle"><FootName sub={`${months.length} Ninjas`} /><td className={C}>{worked}</td><td className={C}>{s("totalKm").toLocaleString("en-IN")} km</td><td className={C}>{inr(s("fuel"))}</td><td className={C}>{worked ? Math.round(s("totalKm") / worked) : 0}</td><td className={C}>{s("missingReadings")}</td><td className={C}>{s("kmChecks")}</td><td className={C}>{s("missingPhotos")}</td></tr>}>
          {pagedN.slice.map(({ n, m }) => { const w = m.summary.present + m.summary.halfDay; return (
            <tr key={n.id} className="rox-table-row align-middle hover:bg-muted/40">
              <td className="rox-frozen rox-frozen-left rox-frozen-left-edge px-4 py-3 text-left" style={FZ}><Link href={`/field/activity/${n.id}?tab=attendance`} className="block truncate text-[13px] font-bold uppercase tracking-wide hover:text-[#4361EE]">{n.name}</Link></td>
              <td className={C}>{w}</td>
              <td className={cn(C, "font-semibold")}>{m.summary.totalKm.toLocaleString("en-IN")} km</td>
              <td className={C}>{inr(m.summary.fuel)}</td>
              <td className={C}>{w ? Math.round(m.summary.totalKm / w) : <Dash />}</td>
              <td className={cn(C, m.summary.missingReadings > 0 && "font-semibold text-amber-700")}>{m.summary.missingReadings || <Dash />}</td>
              <td className={cn(C, m.summary.kmChecks > 0 && "font-semibold text-rose-700")}>{m.summary.kmChecks || <Dash />}</td>
              <td className={cn(C, m.summary.missingPhotos > 0 && "font-semibold text-amber-700")}>{m.summary.missingPhotos || <Dash />}</td>
            </tr>); })}
        </DataTable>
        {pagedN.footer("Ninja")}
      </>}

      {view === "review" && <>
        <DataTable cols={["Ninja", "Day", "Odometer", "GPS", "What to check", ""]} minWidth={980} widths={[150, 120, 110, undefined, 110]} empty={loading ? "Loading…" : review.length ? null : "Nothing to review this month."}>
          {pagedR.slice.map(({ n, d }) => (
            <tr key={`${n.id}-${d.date}`} className="rox-table-row align-middle hover:bg-muted/40">
              <NameCell label={n.name} />
              <td className={C}>{dayLabel(d.date)}</td>
              <td className={C}>{d.km != null ? `${d.km} km` : <Dash />}</td>
              <td className={C}>{d.gpsKm != null ? `${d.gpsKm} km` : <Dash />}</td>
              <td className="px-3 py-4 text-[13px]"><span className="flex items-start gap-1.5">{d.kmCheck ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" /> : <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}{reasons(d).join(" · ")}</span></td>
              <td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setOpen({ ninja: n, cell: d })}>{canManage ? "Fix" : "Open"}</Button></td>
            </tr>
          ))}
        </DataTable>
        {pagedR.footer("day")}
      </>}

      {view === "months" && <>
        <DataTable cols={["Ninja", ...MONTHS, "Total"]} first={190} minWidth={1180} empty={loading ? "Loading…" : kmYear.length ? null : "No data."}
          foot={<tr className="align-middle"><FootName />{MONTHS.map((_, i) => <td key={i} className={C}>{kmYear.reduce((t, x) => t + x.k[i], 0) || "—"}</td>)}<td className={C}>{kmYear.reduce((t, x) => t + x.k.reduce((p, q) => p + q, 0), 0).toLocaleString("en-IN")}</td></tr>}>
          {pagedY.slice.map(({ n, k }) => (
            <tr key={n.id} className="rox-table-row align-middle hover:bg-muted/40">
              <NameCell label={n.name} />
              {k.map((v, i) => <td key={i} className={cn(C, `${year}-${String(i + 1).padStart(2, "0")}` === a.ym && "bg-[#EEF1FD]/60 font-semibold")}>{v || <Dash />}</td>)}
              <td className={cn(C, "font-bold")}>{k.reduce((t, x) => t + x, 0).toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </DataTable>
        {pagedY.footer("Ninja")}
      </>}

      {open && <DayDialog ninja={open.ninja} cell={open.cell} tz={a.tz} policy={policy} canManage={canManage}
        mark={yearMarks.find((m) => m.staffId === open.ninja.id && m.day === open.cell.date)} onClose={() => setOpen(null)}
        onMark={(k, ex) => void att.setMark(open.ninja.id, open.cell.date, k, ex).then((ok) => ok && setOpen(null))}
        onDecide={(m, ok) => void att.decide(m, ok).then((r) => r && setOpen(null))} onSaved={() => { setOpen(null); void att.load(); }} />}
    </div>
  );
}
