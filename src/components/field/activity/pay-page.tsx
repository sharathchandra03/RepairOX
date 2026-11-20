"use client";
/* Field Activity → Pay. One payslip row per Field Engineer for the month, totals pinned at the bottom,
   month close / reopen, and the plan + device actions. Math: lib/field-incentives.ts via usePayRows. */
import { useMemo, useState } from "react";
import { Banknote, Lock, LockOpen, Settings2, ShieldCheck, Smartphone, Target, TrendingUp } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { C, DataTable, Dash, FootName, KpiStrip, LoadError, Notice, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
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
const FZ = { ["--rox-frozen-offset" as string]: "0px" } as React.CSSProperties;
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

  useRegisterSheets(useMemo(() => loading || !pay ? null : [
    { name: "Pay summary", headers: [...COLS.slice(0, 1), "Trips counted", "Target met", ...COLS.slice(2), "Locked (not paid)", "Status"],
      rows: shown.map(({ n, s, frozen }) => [n.name, s.trips, s.gatePassed ? "Yes" : "No", s.basic, s.daily, s.slab, s.reviews, s.devices, s.leads, s.sunday, s.petrol, s.adjustments, s.total, s.locked, frozen ? "Closed" : "Live"]) },
    { name: "Pay by day", headers: ["Ninja", "Date", "Status", "Trips", "Counted", "Basic", "Daily", "Slab", "Review bonus", "Devices", "Sunday", "Km", "Petrol"],
      rows: shown.flatMap(({ n, live }) => live.days.map((d) => [n.name, d.date, STATUS_LABEL[d.status], d.trips, d.tripsCounted, Math.round(d.basic), d.daily, d.slab, d.reviews, d.macbook + d.iphone, d.sunday, d.km ?? "", Math.round(d.petrol)])) },
  ], [loading, pay, shown]));

  if (!supabase) return <Unavailable text="Pay is available when RepairOX is connected to the database." />;
  if (err) return <LoadError what="pay" err={err} />;
  const money = (v: number) => (v ? inr(v) : <Dash />);
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
      </ViewBar>
      {closed && rows.some((r) => r.frozen && Math.abs(r.liveDiff) >= 1) && (
        <Notice tone="blue">Some live figures changed after this month was closed. The frozen payslip stays; the new amount is shown under the total. Add an adjustment if the difference should be paid.</Notice>
      )}

      <DataTable cols={COLS} minWidth={1420} empty={loading ? "Loading…" : shown.length ? null : rows.length ? "No Ninjas in this view." : "No Ninjas found for the stores and search you chose."}
        foot={<tr className="align-middle"><FootName sub={`${shown.length} Ninjas`} /><td className={C}>{sum((s) => s.trips)}</td>
          {[(s: PaySummary) => s.basic, (s: PaySummary) => s.daily, (s: PaySummary) => s.slab, (s: PaySummary) => s.reviews, (s: PaySummary) => s.devices, (s: PaySummary) => s.leads, (s: PaySummary) => s.sunday, (s: PaySummary) => s.petrol, (s: PaySummary) => s.adjustments, (s: PaySummary) => s.total].map((f, i) => <td key={i} className={C}>{inr(sum(f))}</td>)}</tr>}>
        {paged.slice.map(({ n, s, frozen, liveDiff, post }) => {
          const sal = salaryFor(ctx.salaries, n.id, a.today);
          return (
            <tr key={n.id} className="rox-table-row cursor-pointer align-middle hover:bg-muted/40" onClick={() => setOpen(n)}>
              <td className="rox-frozen rox-frozen-left rox-frozen-left-edge px-4 py-3 text-left" style={FZ}>
                <p className="truncate text-[13px] font-bold uppercase tracking-wide">{n.name}</p>
                <p className={cn("truncate text-[11px]", sal ? "text-muted-foreground" : "font-semibold text-amber-700")}>{frozen ? "Closed payslip" : sal ? `${inr(sal)} / month` : "No salary set"}</p>
              </td>
              <td className={C}>
                <b>{s.trips}</b><span className="text-muted-foreground"> / {s.gateTrips}</span>
                <div className="mx-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", s.gatePassed ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(100, (s.trips / Math.max(1, s.gateTrips)) * 100)}%` }} /></div>
              </td>
              <td className={C}>{inr(s.basic)}</td>
              <td className={C}>{money(s.daily)}</td>
              <td className={C}>{money(s.slab)}</td>
              <td className={C}>{money(s.reviews)}<span className="block text-[10.5px] text-muted-foreground">{s.verifiedReviews} verified</span></td>
              <td className={C}>{money(s.devices)}</td>
              <td className={C}>{money(s.leads)}</td>
              <td className={C}>{money(s.sunday)}</td>
              <td className={C}>{inr(s.petrol)}<span className="block text-[10.5px] text-muted-foreground">{s.km} km</span></td>
              <td className={cn(C, s.adjustments < 0 && "text-rose-700")}>{money(s.adjustments)}{post !== 0 && <span className="block text-[10.5px] text-muted-foreground">{inr(post)} after close</span>}</td>
              <td className={cn(C, "font-extrabold")}>{inr(s.total)}
                {s.locked > 0 && <span className="mt-0.5 flex items-center justify-center gap-1 text-[10.5px] font-semibold text-amber-700"><Lock className="h-3 w-3" />{inr(s.locked)} locked</span>}
                {frozen && Math.abs(liveDiff) >= 1 && <span className="mt-0.5 block text-[10.5px] font-semibold text-sky-700">Live: {inr(s.total + liveDiff)}</span>}
              </td>
            </tr>
          );
        })}
      </DataTable>
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
