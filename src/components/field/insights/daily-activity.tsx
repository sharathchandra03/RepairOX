"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Field Insights → Daily activity. Replaces the "Ninja Daily Activity" sheet:
   Day activity (per Ninja), Month summary (per Ninja, 6+/9+ day counts) and
   Store activity (per store). Math: lib/field-daily-activity.ts (pure, tested).
   Rows are real trip legs (field_trips) — nothing typed in by hand.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import { Store as StoreIcon, Users } from "lucide-react";
import { Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { InfoHint } from "@/components/ui/info-hint";
import { Frame, Head, NameCell, EmptyRows } from "@/components/field/dashboard/dashboard-table";
import { FieldGrid, FootLabel, NameText, useFieldGrid } from "@/components/field/grid";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { cn } from "@/lib/utils";
import type { FieldJob } from "@/lib/field-data";
import type { AggregateCtx, DateBounds } from "@/lib/field-dashboard";
import {
  ninjaDayRows, ninjaPeriodRows, storeDayRows, storePeriodRows, sumDayRows, pickableDays, avgRating, type Leg, type LegType, type NinjaDayRow,
} from "@/lib/field-daily-activity";

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayLabel = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };

interface TripRow { id: string; job_id: string; trip_type: string; status: string; ninja_id: string | null; assigned_at: string | null; created_at: string }

/** Loads the legs behind the jobs in the period (RLS + store scoped) and the GPS distance of each. */
export function useLegs(jobs: FieldJob[], ctx: AggregateCtx, bounds: DateBounds, fetchFrom: string, fetchTo: string) {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [km, setKm] = useState<Map<string, number>>(new Map());
  const [stars, setStars] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const jobIds = useMemo(() => jobs.filter((j) => (j.pickupDate && j.pickupDate >= fetchFrom && j.pickupDate <= fetchTo)
    || (j.dropDate && j.dropDate >= fetchFrom && j.dropDate <= fetchTo) || (!j.pickupDate && !j.dropDate && (j.createdAt || "").slice(0, 10) >= fetchFrom && (j.createdAt || "").slice(0, 10) <= fetchTo))
    .map((j) => j.id), [jobs, fetchFrom, fetchTo]);
  const key = jobIds.join(",");
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const rows: TripRow[] = []; const dist = new Map<string, number>(); const rate = new Map<string, number>();
      for (let i = 0; i < jobIds.length; i += 200) {
        const { data, error } = await supabase!.from("field_trips").select("id,job_id,trip_type,status,ninja_id,assigned_at,created_at").in("job_id", jobIds.slice(i, i + 200));
        if (!alive) return;
        if (error) { setErr(error.message); setLoading(false); return; }
        rows.push(...((data ?? []) as TripRow[]));
      }
      const ids = rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase!.from("field_ninja_trip_stats_v").select("trip_id,distance_m,tracked_points").in("trip_id", ids.slice(i, i + 200));
        for (const d of (data ?? []) as { trip_id: string; distance_m: number; tracked_points: number }[]) if (d.tracked_points > 0) dist.set(d.trip_id, d.distance_m);
      }
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase!.from("field_trip_reviews").select("trip_id,rating").in("trip_id", ids.slice(i, i + 200));
        for (const d of (data ?? []) as { trip_id: string; rating: number }[]) rate.set(d.trip_id, d.rating);
      }
      if (!alive) return;
      setErr(null); setTrips(rows); setKm(dist); setStars(rate); setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const legs = useMemo<Leg[]>(() => trips.flatMap((t) => {
    const j = jobById.get(t.job_id);
    if (!j || !t.ninja_id || !["pickup", "drop", "onsite"].includes(t.trip_type)) return [];
    const type = t.trip_type as LegType;
    const date = (type === "drop" ? j.dropDate : j.pickupDate) || j.pickupDate || j.dropDate || localDay(t.assigned_at || t.created_at);
    const s = ctx.storeKeyOf(j);
    return [{ id: t.id, jobId: j.id, type, status: t.status, ninjaId: t.ninja_id, date, storeKey: s.key, storeLabel: s.label,
      warranty: j.leadType.startsWith("warranty_"), buyback: j.leadType === "buyback" && type === "pickup", rating: stars.get(t.id) ?? null, device: j.device || "", distanceM: km.has(t.id) ? km.get(t.id)! : null }];
  }), [trips, jobById, ctx, km, stars]);
  void bounds;
  return { legs, loading, err, available: !!supabase };
}

const ratio = (c: { assigned: number; completed: number }) => (c.assigned ? <><b>{c.completed}</b><span className="text-muted-foreground"> / {c.assigned}</span></> : <span className="text-zinc-300">—</span>);
const num = (n: number) => (n ? n : <span className="text-zinc-300">—</span>);
const kmCell = (km: number | null) => (km == null ? <span className="text-zinc-300">—</span> : km === 0 ? <span className="text-muted-foreground">Not travelled</span> : `${km} km`);
const flag = (on: boolean) => <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", on ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-500 ring-zinc-200")}>{on ? "Yes" : "No"}</span>;

export function DailyActivity({ jobs, ctx, bounds, storeSel, multiStore, canTeam, onRows, show = "both", q = "", legType = "all", header }: {
  jobs: FieldJob[]; ctx: AggregateCtx; bounds: DateBounds; storeSel: string[]; multiStore: boolean; canTeam: boolean;
  /** "store" = only the store table (Field Insights), "ninja" = only the Ninja tables (Field Activity). */
  show?: "both" | "ninja" | "store"; q?: string;
  /** Store view only: restrict to one trip type (the page's Trip type filter). */
  legType?: LegType | "all";
  /** Store view only: section title rendered on the same row as the grid menus (no empty gap). */
  header?: React.ReactNode;
  /** Hands the on-screen rows to the page export so Excel == screen. */
  onRows?: (sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]) => void;
}) {
  const { team } = usePermissions();
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? "Ninja";
  const days = useMemo(() => pickableDays(bounds.from, bounds.to), [bounds.from, bounds.to]);
  const [day, setDay] = useState<string>("");
  const effDay = days.includes(day) ? day : days[0] ?? "";
  const [view, setView] = useState<"day" | "period">("day");
  const fetchFrom = bounds.from ?? days[days.length - 1] ?? "0000-00-00";
  const fetchTo = bounds.to ?? days[0] ?? "9999-12-31";
  const scopedJobs = useMemo(() => jobs.filter((j) => !multiStore || matchesStoreSelection(j.branchId, storeSel)), [jobs, multiStore, storeSel]);
  const { legs, loading, err, available } = useLegs(scopedJobs, ctx, bounds, fetchFrom, fetchTo);

  const hit = (id: string) => !q || nameOf(id).toLowerCase().includes(q.toLowerCase());
  const dayRows = useMemo(() => ninjaDayRows(legs, effDay, nameOf).filter((r) => hit(r.ninjaId)), [legs, effDay, team, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodRows = useMemo(() => ninjaPeriodRows(legs, bounds.from ?? days[days.length - 1] ?? null, bounds.to ?? days[0] ?? null, nameOf).filter((r) => hit(r.ninjaId)), [legs, bounds, days, team, q]); // eslint-disable-line react-hooks/exhaustive-deps
  // Field Insights (show="store") follows the page's period + trip type; Field Activity keeps its one-day view.
  const storeRows = useMemo(() => show === "store"
    ? storePeriodRows(legType === "all" ? legs : legs.filter((l) => l.type === legType), bounds.from, bounds.to)
    : storeDayRows(legs, effDay), [legs, effDay, show, legType, bounds.from, bounds.to]);
  const dayTotal = useMemo(() => sumDayRows(dayRows), [dayRows]);
  const periodTotal = useMemo(() => sumDayRows(periodRows as unknown as NinjaDayRow[]), [periodRows]);

  const dayHead = ["Ninja", "On-site", "Pickup", "Buyback", "Drop", "Warranty (O / P / D)", "Total", "XL", "6+", "9+", "MacBook", "iPhone > 14", "Reviews", "KMs"];
  const perHead = ["Ninja", "On-site", "Pickup", "Buyback", "Drop", "Warranty (O / P / D)", "Total", "XL", "Days 6+", "Days 9+", "MacBook", "iPhone > 14", "Reviews", "KMs"];
  const revTxt = (r: { reviews: number; ratingSum: number }) => (r.reviews ? `${r.reviews} · ${avgRating(r)}★` : "—");
  const wTxt = (o: number, p: number, d: number) => (o + p + d ? `${o} / ${p} / ${d}` : "—");
  useEffect(() => {
    if (!onRows || loading) return;
    const c = (x: { assigned: number; completed: number }) => `${x.completed}/${x.assigned}`;
    onRows([
      { name: "Ninja day", headers: ["Date", ...dayHead.slice(0, 12), "Reviews", "Avg stars", "KMs"], rows: dayRows.map((r) => [effDay, nameOf(r.ninjaId), c(r.onsite), c(r.pickup), c(r.buyback), c(r.drop), `${r.warrantyOnsite}/${r.warrantyPickup}/${r.warrantyDrop}`, r.total, r.xl, r.hit6 ? "YES" : "NO", r.hit9 ? "YES" : "NO", r.macbook, r.iphone, r.reviews, avgRating(r) ?? "", r.km ?? ""]) },
      { name: "Ninja period", headers: [...perHead.slice(0, 12), "Reviews", "Avg stars", "KMs"], rows: periodRows.map((r) => [nameOf(r.ninjaId), c(r.onsite), c(r.pickup), c(r.buyback), c(r.drop), `${r.warrantyOnsite}/${r.warrantyPickup}/${r.warrantyDrop}`, r.total, r.xl, r.days6, r.days9, r.macbook, r.iphone, r.reviews, avgRating(r) ?? "", r.km ?? ""]) },
      { name: "Store day", headers: ["Date", "Store", "On-site", "Pickup", "Drop", "Total", "Completed"], rows: storeRows.map((r) => [effDay, r.label, c(r.onsite), c(r.pickup), c(r.drop), r.total, r.completed]) },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRows, periodRows, storeRows, loading]);

  type SR = (typeof storeRows)[number];
  const stTot = (k: "onsite" | "pickup" | "drop") => storeRows.reduce((t, r) => ({ assigned: t.assigned + r[k].assigned, completed: t.completed + r[k].completed }), { assigned: 0, completed: 0 });
  const storeGrid = useFieldGrid<SR>("insights_store_activity", [
    { key: "store", label: "Store", width: 240, anchor: true, render: (r) => <NameText label={r.label} />, foot: <FootLabel sub={`${storeRows.length} stores`} /> },
    { key: "onsite", label: "On-site", width: 130, render: (r) => ratio(r.onsite), foot: ratio(stTot("onsite")) },
    { key: "pickup", label: "Pickup", width: 130, render: (r) => ratio(r.pickup), foot: ratio(stTot("pickup")) },
    { key: "drop", label: "Drop", width: 130, render: (r) => ratio(r.drop), foot: ratio(stTot("drop")) },
    { key: "total", label: "Total", width: 120, cellClass: () => "font-bold", render: (r) => r.total, foot: storeRows.reduce((t, r) => t + r.total, 0) },
    { key: "done", label: "Completed", width: 140, render: (r) => r.completed, foot: storeRows.reduce((t, r) => t + r.completed, 0) },
  ]);
  if (!available) return <p className="rounded-2xl border border-border bg-card p-6 text-center text-[13px] text-muted-foreground">Daily activity is available when RepairOX is connected to the database.</p>;
  if (err) return <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load trips: {err}</p>;

  const th = "px-3 py-4 text-center tabular-nums";
  const NinjaRows = ({ rows, period }: { rows: (Omit<NinjaDayRow, "hit6" | "hit9"> & { hit6?: boolean; hit9?: boolean; days6?: number; days9?: number })[]; period: boolean }) => (
    <>
      {rows.map((r) => (
        <tr key={r.ninjaId} className="rox-table-row align-middle hover:bg-muted/40">
          <NameCell label={nameOf(r.ninjaId)} />
          <td className={th}>{ratio(r.onsite)}</td><td className={th}>{ratio(r.pickup)}</td><td className={th}>{ratio(r.buyback)}</td><td className={th}>{ratio(r.drop)}</td>
          <td className={th}>{wTxt(r.warrantyOnsite, r.warrantyPickup, r.warrantyDrop)}</td>
          <td className={cn(th, "font-bold")}>{r.total}</td><td className={th}>{num(r.xl)}</td>
          <td className={th}>{period ? num(r.days6 ?? 0) : flag(!!r.hit6)}</td>
          <td className={th}>{period ? num(r.days9 ?? 0) : flag(!!r.hit9)}</td>
          <td className={th}>{num(r.macbook)}</td><td className={th}>{num(r.iphone)}</td><td className={th}>{revTxt(r)}</td><td className={th}>{kmCell(r.km)}</td>
        </tr>
      ))}
    </>
  );
  const totalRow = (t: NinjaDayRow) => (
    <tr className="rox-table-row bg-muted/40 align-middle font-bold">
      <NameCell label="Total" />
      <td className={th}>{ratio(t.onsite)}</td><td className={th}>{ratio(t.pickup)}</td><td className={th}>{ratio(t.buyback)}</td><td className={th}>{ratio(t.drop)}</td>
      <td className={th}>{wTxt(t.warrantyOnsite, t.warrantyPickup, t.warrantyDrop)}</td><td className={th}>{t.total}</td><td className={th}>{t.xl}</td>
      <td className={th} /><td className={th} /><td className={th}>{t.macbook}</td><td className={th}>{t.iphone}</td><td className={th}>{revTxt(t)}</td><td className={th}>{t.km == null ? "—" : `${t.km} km`}</td>
    </tr>
  );

  return (
    <div className={cn("space-y-5", show === "ninja" && "rox-lock-fill !space-y-4", show === "store" && "!space-y-3")}>
      {show !== "store" && <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs size="sm" value={view} onChange={(v) => setView(v as "day" | "period")} options={[{ label: "One day", value: "day" }, { label: "Whole month", value: "period" }]} />
        {view === "day" && (
          <Select className="h-[34px] w-[190px]" value={effDay} onChange={(e) => setDay(e.target.value)} options={days.map((d) => ({ label: dayLabel(d), value: d }))} />
        )}
        <InfoHint content="Counts are completed / assigned trip legs. Total = every assigned leg (new + warranty). 6+ / 9+ = the Ninja's total for the day reached 6 / 9 (for a period: number of such days). XL = a trip over 40 km (GPS). Reviews = customer ratings recorded in the Ninja app (count · average stars). KMs come from GPS tracking; “Not travelled” means a tracked trip with no distance, — means not tracked." />
      </div>}

      {canTeam && show !== "store" && (
        <div className={cn("space-y-2", show === "ninja" && "rox-lock-fill")}>
          <h3 className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted-foreground"><Users className="h-3.5 w-3.5 text-[#4361EE]" />{view === "day" ? `Ninja activity · ${dayLabel(effDay)}` : "Ninja summary · selected period"}</h3>
          <Frame lock={show === "ninja"}>
            <table className="w-full min-w-[1400px] table-fixed text-[14px]">
              <colgroup><col style={{ width: 190 }} />{dayHead.slice(1).map((h) => <col key={h} />)}</colgroup>
              <Head cols={view === "day" ? dayHead : perHead} firstWidth={190} />
              <tbody>
                {view === "day" ? <NinjaRows rows={dayRows} period={false} /> : <NinjaRows rows={periodRows} period />}
                {(view === "day" ? dayRows : periodRows).length > 0 && totalRow(view === "day" ? dayTotal : periodTotal)}
              </tbody>
            </table>
            {(view === "day" ? dayRows : periodRows).length === 0 && <EmptyRows text={loading ? "Loading…" : "No Ninja trips for this selection."} />}
          </Frame>
        </div>
      )}

      {show !== "ninja" && <div className="space-y-3">
        {show === "store" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">{header ?? <span />}{storeGrid.menus}</div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted-foreground"><StoreIcon className="h-3.5 w-3.5 text-[#4361EE]" />Store activity · {dayLabel(effDay)}</h3>
            {storeGrid.menus}
          </div>
        )}
        <FieldGrid grid={storeGrid} lock={false} rows={storeRows} rowKey={(r) => r.key} foot empty={storeRows.length ? null : loading ? "Loading…" : show === "store" ? "No store trips in this selection." : "No store trips for this day."} />
      </div>}
    </div>
  );
}
