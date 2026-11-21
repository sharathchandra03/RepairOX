"use client";
/* Field Activity → Pay. One payslip row per Field Engineer for the month, totals pinned at the bottom,
   month close / reopen, and the plan + device actions. Math: lib/field-incentives.ts via usePayRows. */
import { useMemo, useState } from "react";
import { Banknote, Lock, LockOpen, Settings2, ShieldCheck, Smartphone, Target, TrendingUp } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { KpiStrip, LoadError, Notice, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { Dash, FieldGrid, FootLabel, NameText, Sub, useFieldGrid, type FCol } from "@/components/field/grid";
import { CloseMonthDialog, PayDetailDialog, ReopenDialog, usePayRows } from "@/components/field/insights/pay-section";
import { DevicesDialog, PlanDialog, SalaryDialog } from "@/components/field/insights/pay-controls";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/field-attendance";
import { salaryFor, type PaySummary } from "@/lib/field-incentives";
import type { RosterNinja } from "@/lib/field-attendance-data";

type View = "all" | "below" | "met";
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const COLS = ["Ninja", "Trips", "Basic salary", "Daily trips", "Monthly slab", "Reviews", "Devices", "Leads", "Sunday", "Petrol", "Adjustments", "Total payable"];

export function PayPage() {
  const a = useActivity();
  const { nowMs, roster, ctx, pay, closed, loading, err, load, rows, results } = usePayRows(a.ym, a.tz, a.storeSel, a.multiStore, a.q);
  const [view, setView] = useState<View>("all");
  const [open, setOpen] = useState<RosterNinja | null>(null);
  const [dlg, setDlg] = useState<null | { kind: "plan"; staffId: string | null; name?: string } | { kind: "salary"; ninja: RosterNinja } | { kind: "devices" } | { kind: "close" } | { kind: "reopen" }>(null);
  const shown = useMemo(() => rows.filter((r) => view === "all" || (view === "met" ? r.s.gatePassed : !r.s.gatePassed)), [rows, view]);
  const paged = usePaged(shown, `${view}|${a.ym}|${a.q}|${a.storeSel.join(",")}`);
  const sum = (f: (s: PaySummary) => number, list = shown) => list.reduce((t, x) => t + f(x.s), 0);
  const monthOver = a.ym < a.today.slice(0, 7);
  const below = rows.filter((r) => !r.s.gatePassed).length;
  type PR = (typeof rows)[number];
  const money = (v: number) => (v ? inr(v) : <Dash />);
  const m = (key: string, label: string, f: (s: PaySummary) => number, width = 130, extra?: (r: PR) => React.ReactNode): FCol<PR> =>
    ({ key, label, width, render: (r) => <>{money(f(r.s))}{extra?.(r)}</>, foot: inr(sum(f)) });
  const grid = useFieldGrid<PR>("activity_pay", [
    { key: "ninja", label: "Ninja", width: 230, anchor: true, render: (r) => { const sal = salaryFor(ctx.salaries, r.n.id, a.today);
      return <NameText label={r.n.name} sub={<span className={sal || r.frozen ? "" : "font-semibold text-amber-700"}>{r.frozen ? "Closed payslip" : sal ? `${inr(sal)} / month` : "No salary set"}</span>} />; },
      foot: <FootLabel sub={`${shown.length} Ninjas`} /> },
    { key: "trips", label: "Trips", width: 140, render: ({ s }) => <><b>{s.trips}</b><span className="text-muted-foreground"> / {s.gateTrips}</span>
      <div className="mx-auto mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", s.gatePassed ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(100, (s.trips / Math.max(1, s.gateTrips)) * 100)}%` }} /></div></>, foot: sum((s) => s.trips) },
    { key: "basic", label: "Basic salary", width: 140, render: ({ s }) => inr(s.basic), foot: inr(sum((s) => s.basic)) },
    m("daily", "Daily trips", (s) => s.daily), m("slab", "Monthly slab", (s) => s.slab),
    m("reviews", "Reviews", (s) => s.reviews, 130, ({ s }) => <Sub>{s.verifiedReviews} verified</Sub>),
    m("devices", "Devices", (s) => s.devices, 120), m("leads", "Leads", (s) => s.leads, 120), m("sunday", "Sunday", (s) => s.sunday, 120),
    { key: "petrol", label: "Petrol", width: 130, render: ({ s }) => <>{inr(s.petrol)}<Sub>{s.km} km</Sub></>, foot: inr(sum((s) => s.petrol)) },
    m("adjust", "Adjustments", (s) => s.adjustments, 140, ({ post }) => post !== 0 && <Sub>{inr(post)} after close</Sub>),
    { key: "total", label: "Total payable", width: 160, cellClass: () => "font-extrabold", render: ({ s, frozen, liveDiff }) => <>{inr(s.total)}
      {s.locked > 0 && <span className="mt-0.5 flex items-center justify-center gap-1 text-[12px] font-semibold text-amber-700"><Lock className="h-3 w-3" />{inr(s.locked)} locked</span>}
      {frozen && Math.abs(liveDiff) >= 1 && <Sub className="font-semibold text-sky-700">Live: {inr(s.total + liveDiff)}</Sub>}</>, foot: inr(sum((s) => s.total)) },
  ]);

  useRegisterSheets(useMemo(() => loading || !pay ? null : [
    { name: "Pay summary", headers: [...COLS.slice(0, 1), "Trips counted", "Target met", ...COLS.slice(2), "Locked (not paid)", "Status"],
      rows: shown.map(({ n, s, frozen }) => [n.name, s.trips, s.gatePassed ? "Yes" : "No", s.basic, s.daily, s.slab, s.reviews, s.devices, s.leads, s.sunday, s.petrol, s.adjustments, s.total, s.locked, frozen ? "Closed" : "Live"]) },
    { name: "Pay by day", headers: ["Ninja", "Date", "Status", "Trips", "Counted", "Basic", "Daily", "Slab", "Review bonus", "Devices", "Sunday", "Km", "Petrol"],
      rows: shown.flatMap(({ n, live }) => live.days.map((d) => [n.name, d.date, STATUS_LABEL[d.status], d.trips, d.tripsCounted, Math.round(d.basic), d.daily, d.slab, d.reviews, d.macbook + d.iphone, d.sunday, d.km ?? "", Math.round(d.petrol)])) },
  ], [loading, pay, shown]));

  if (!supabase) return <Unavailable text="Pay is available when RepairOX is connected to the database." />;
  if (err) return <LoadError what="pay" err={err} />;
  return (
    <div className="rox-lock-fill space-y-4">
      <KpiStrip loading={loading} items={[
        { label: closed ? "Total paid (closed)" : "Total payable so far", value: inr(sum((s) => s.total, rows)), sub: `${rows.length} Ninjas · salary ${inr(sum((s) => s.basic, rows))}`, icon: Banknote },
        { label: "Incentives", value: inr(sum((s) => s.incentives, rows)), sub: `daily ${inr(sum((s) => s.daily, rows))} · slab ${inr(sum((s) => s.slab, rows))}`, icon: TrendingUp, tone: "good" },
        { label: "Petrol", value: inr(sum((s) => s.petrol, rows)), sub: `${sum((s) => s.km, rows).toLocaleString("en-IN")} km` },
        { label: "Below monthly target", value: below, sub: sum((s) => s.locked, rows) ? `${inr(sum((s) => s.locked, rows))} earned but locked` : "everyone unlocked", icon: Target, tone: below ? "warn" : "good" },
      ]} />
      <ViewBar value={view} onChange={setView}
        options={[{ label: `All (${rows.length})`, value: "all" }, { label: `Below target (${below})`, value: "below" }, { label: `Target met (${rows.length - below})`, value: "met" }]}
        info="Click a Ninja for the payslip, day-by-day breakdown, organic leads, bonuses and salary history. Calculated from trips, shifts, odometer and reviews with the rules in force on each day. A rule or salary change starts on the date you choose and never changes earlier days. Petrol is always paid; other incentives unlock at the monthly trip target.">
        {closed ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-[12px] font-bold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Closed {new Date(closed.closedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            {a.canManagePay && <button onClick={() => setDlg({ kind: "reopen" })} className="ml-1 inline-flex items-center gap-1 underline-offset-2 hover:underline"><LockOpen className="h-3 w-3" />Reopen</button>}</span>
        ) : monthOver && a.canManagePay && results.length > 0 ? (
          <Button size="sm" className="gap-1.5" onClick={() => setDlg({ kind: "close" })}><Lock className="h-3.5 w-3.5" />Close month</Button>
        ) : null}
        {a.canManagePay && <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDlg({ kind: "devices" })}><Smartphone className="h-3.5 w-3.5" />Eligible devices</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDlg({ kind: "plan", staffId: null })}><Settings2 className="h-3.5 w-3.5" />Incentive plan</Button>
        </>}
        {grid.menus}
      </ViewBar>
      {closed && rows.some((r) => r.frozen && Math.abs(r.liveDiff) >= 1) && (
        <Notice tone="blue">Some live figures changed after this month was closed. The frozen payslip stays; the new amount is shown under the total. Add an adjustment if the difference should be paid.</Notice>
      )}

      <FieldGrid grid={grid} rows={paged.slice} rowKey={(r) => r.n.id} onRowClick={(r) => setOpen(r.n)} foot
        empty={loading ? "Loading…" : shown.length ? null : rows.length ? "No Ninjas in this view." : "No Ninjas found for the stores and search you chose."} />
      {paged.footer("Ninja")}

      {open && roster && pay && (
        <PayDetailDialog ninja={open} ym={a.ym} tz={a.tz} today={a.today} nowMs={nowMs} roster={roster} pay={pay} ctx={ctx} canManage={a.canManagePay} frozen={closed?.lines.get(open.id) ?? null} closedAt={closed?.closedAt ?? null}
          onClose={() => setOpen(null)} onChanged={() => void load()} onSalary={() => setDlg({ kind: "salary", ninja: open })} onPlan={() => setDlg({ kind: "plan", staffId: open.id, name: open.name })} />
      )}
      {dlg?.kind === "plan" && <PlanDialog scope={{ staffId: dlg.staffId, name: dlg.name }} today={a.today} plans={ctx.plans} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load(); }} />}
      {dlg?.kind === "salary" && <SalaryDialog ninja={dlg.ninja} today={a.today} salaries={ctx.salaries} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load(); }} />}
      {dlg?.kind === "devices" && <DevicesDialog today={a.today} lists={ctx.deviceLists} onClose={() => setDlg(null)} onSaved={() => void load()} />}
      {dlg?.kind === "close" && <CloseMonthDialog ym={a.ym} rows={results} today={a.today} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void load(); }} />}
      {dlg?.kind === "reopen" && <ReopenDialog ym={a.ym} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void load(); }} />}
    </div>
  );
}
