"use client";
/* Field Activity → Rules & rates. Everything that decides pay and attendance, one view at a time:
   Incentive plan (rule cards + change history) · Salaries · Attendance & fuel · Eligible devices.
   Changes are dated: they start on the day you pick and never rewrite earlier days. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CalendarCheck2, Fuel, History, IndianRupee, Route, Smartphone, Star, Sun, Target, Users } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { KpiStrip, ViewBar, usePaged } from "@/components/field/activity/kit";
import { Dash, FieldGrid, NameText, Sub, useFieldGrid } from "@/components/field/grid";
import { PlanDialog, DevicesDialog, SalaryDialog } from "@/components/field/insights/pay-controls";
import { PolicyDialog } from "@/components/field/insights/attendance-section";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { fetchRoster, ymRange, type RosterNinja } from "@/lib/field-attendance-data";
import { fetchPayContext, type PayContext } from "@/lib/field-pay-data";
import { DEFAULT_POLICY, type Policy } from "@/lib/field-attendance";
import { planFor, planRowFor, salaryFor, type PayPlan } from "@/lib/field-incentives";

type View = "plan" | "salaries" | "attendance" | "devices";
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const sortBy = <T,>(a: T[], k: (x: T) => number) => [...a].sort((x, y) => k(x) - k(y));

function RuleCard({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-zinc-200 bg-card p-4 shadow-card">
      <p className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-3.5 w-3.5" /></span>{title}</p>
      <div className="mt-3 space-y-2 text-[14.5px]">{children}</div>
    </div>
  );
}
const Line = ({ k, v }: { k: React.ReactNode; v: React.ReactNode }) => <p className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0"><span className="text-muted-foreground">{k}</span><b className="tabular-nums">{v}</b></p>;

function PlanCards({ p }: { p: PayPlan }) {
  const slabs = sortBy(p.slabs, (s) => s.above);
  const yes = (b: boolean) => (b ? "Yes" : "No");
  const types = [p.countPickup && "Pickup", p.countDrop && "Drop", p.countOnsite && "On-site", p.countBuyback && "Buyback"].filter(Boolean).join(" · ") || "None";
  const held = ([["daily", "Daily"], ["slab", "Slab"], ["reviews", "Reviews"], ["devices", "Devices"], ["sunday", "Sunday"], ["leads", "Leads"], ["petrol", "Petrol"]] as const).filter(([k]) => p.gateHolds[k]).map(([, l]) => l).join(" · ") || "Nothing";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
      <RuleCard icon={Award} title="Daily trips">
        {sortBy(p.dailyTiers, (t) => t.minTrips).map((t) => <Line key={t.minTrips} k={`${t.minTrips}+ trips in a day`} v={inr(t.amount)} />)}
        <Line k="More than one row reached" v={p.dailyStack ? "Add up" : "Highest only"} />
        <Line k="Long trips count extra" v={yes(p.dailyUsesLongTrips)} />
        <Line k="Only on a working day" v={yes(p.dailyNeedsPresent)} />
        <p className="pt-1 text-[12.5px] text-muted-foreground">Counts: {types}</p>
      </RuleCard>
      <RuleCard icon={Target} title="Monthly target">
        <Line k="Unlocks incentives at" v={`${p.monthlyMinTrips} trips`} />
        <Line k="Lowered for leave / joining" v={yes(p.gateProrate)} />
        {slabs.map((s, i) => <Line key={s.above} k={`Trips ${s.above + 1}${slabs[i + 1] ? `–${slabs[i + 1].above}` : "+"}`} v={`${inr(s.rate)} each`} />)}
        <Line k="Slab paid" v={p.slabMode === "whole" ? "All at top slab" : "Each at its slab"} />
        {p.slabMinReviews > 0 && <Line k="Needs reviews" v={p.slabMinReviews} />}
        <p className="pt-1 text-[12.5px] text-muted-foreground">Waits for the target: {held}</p>
      </RuleCard>
      <RuleCard icon={Route} title="Long trips">{p.distanceEnabled ? <>{sortBy(p.distanceTiers, (t) => t.upToKm).map((t) => <Line key={t.upToKm} k={`Up to ${t.upToKm} km one way`} v={`${t.trips} trip${t.trips === 1 ? "" : "s"}`} />)}
        {p.distanceExtraEveryKm > 0 && <Line k="Beyond that" v={`+1 every ${p.distanceExtraEveryKm} km`} />}
        <p className="pt-1 text-[12.5px] text-muted-foreground">±{p.distanceToleranceKm} km · road ≈ {p.roadFactor}× straight line</p></> : <p className="text-muted-foreground">Off — every trip counts once.</p>}</RuleCard>
      <RuleCard icon={Star} title="Reviews">
        {sortBy(p.reviewTiers, (t) => t.min).map((t) => <Line key={t.min} k={`${t.min}+ in the month`} v={`${inr(t.amount)}${p.reviewMode === "perReview" ? " each" : ""}`} />)}
        <Line k="Counts from" v={`${p.reviewMinRating}★`} /><Line k="Must be on a ticket" v={yes(p.reviewNeedsTicket)} />
      </RuleCard>
      <RuleCard icon={Smartphone} title="Latest devices"><Line k="MacBook, per repair" v={inr(p.macbookPerRepair)} /><Line k={`iPhone above ${p.iphoneAboveModel}`} v={inr(p.iphonePerRepair)} /><Line k="Counted on drops too" v={yes(p.devicesOnDrop)} /></RuleCard>
      <RuleCard icon={Users} title="Organic billed leads">{sortBy(p.leadTiers, (t) => t.min).map((t) => <Line key={t.min} k={`${t.min}+ leads`} v={`${inr(t.perLead)} each`} />)}
        <Line k="Paid" v={p.leadMode === "slab" ? "Each at its row" : "All at reached rate"} />{p.leadGiftAt > 0 && <Line k="Gift at" v={`${p.leadGiftAt} leads`} />}</RuleCard>
      <RuleCard icon={Fuel} title="Petrol & total"><Line k="Per odometer km" v={inr(p.petrolPerKm)} />
        <Line k="Most km a day" v={p.petrolMaxKmPerDay > 0 ? `${p.petrolMaxKmPerDay} km` : "No limit"} />
        <Line k="Incentive limit" v={p.incentiveCap > 0 ? inr(p.incentiveCap) : "No limit"} />
        <Line k="Total rounded to" v={p.roundTotal > 0 ? inr(p.roundTotal) : "Not rounded"} /></RuleCard>
      <RuleCard icon={Sun} title="Sunday, salary & leave">
        <Line k="Per Sunday worked" v={inr(p.sundayBonus)} />
        {p.sundayMinTrips > 0 && <Line k="Trips needed on Sunday" v={p.sundayMinTrips} />}
        <Line k="Needs no absence" v={p.sundayNeedsNoAbsent ? (p.sundayAbsentAllowed > 0 ? `≤ ${p.sundayAbsentAllowed} allowed` : "Yes") : "No"} />
        <Line k="Salary ÷ days" v={p.salaryDays > 0 ? p.salaryDays : "Days in month"} />
        <Line k="Half day pays" v={`${p.halfDayFactor * 100}%`} />
        <Line k="Paid: week off / casual / festival" v={`${yes(p.weekOffPaid)} / ${yes(p.casualPaid)} / ${yes(p.festivalPaid)}`} />
        {p.absentFine > 0 && <Line k="Fine per absent day" v={inr(p.absentFine)} />}
        <Line k="Casual leave notice" v={`${p.casualNoticeDays} days`} />
      </RuleCard>
    </div>
  );
}

export function RulesPage() {
  const a = useActivity();
  const { can } = usePermissions();
  const canEdit = allow(can, CAP.field.edit);
  const [ctx, setCtx] = useState<PayContext>({ plans: [], salaries: [], deviceLists: [] });
  const [ninjas, setNinjas] = useState<RosterNinja[]>([]);
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(a.canPay ? "plan" : "attendance");
  const [dlg, setDlg] = useState<null | { k: "plan"; staffId: string | null; name?: string } | { k: "salary"; n: RosterNinja } | { k: "devices" } | { k: "policy" }>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const r = ymRange(a.ym);
    const [c, ro] = await Promise.all([fetchPayContext(), fetchRoster(r.from, r.to)]);
    setCtx(c); setNinjas(ro.ninjas.filter((n) => n.status !== "inactive")); setPolicy(ro.policy); setLoading(false);
  }, [a.ym]);
  useEffect(() => { void load(); }, [load]);
  const plan = planFor(ctx.plans, "__none__", a.today);
  const history = useMemo(() => ctx.plans.filter((p) => p.staffId == null).sort((x, y) => y.effectiveFrom.localeCompare(x.effectiveFrom)), [ctx.plans]);
  const scheduled = history.filter((p) => p.effectiveFrom > a.today).length;
  const list = useMemo(() => ninjas.filter((n) => !a.q || n.name.toLowerCase().includes(a.q.toLowerCase())), [ninjas, a.q]);
  const devices = useMemo(() => [...ctx.deviceLists].sort((x, y) => y.validUntil.localeCompare(x.validUntil)), [ctx.deviceLists]);
  const key = `${view}|${a.q}`;
  const pS = usePaged(list, key), pD = usePaged(devices, key), pH = usePaged(history, key, 10);
  const noSalary = list.filter((n) => !salaryFor(ctx.salaries, n.id, a.today)).length;
  const own = list.filter((n) => planRowFor(ctx.plans, n.id, a.today)?.staffId === n.id).length;
  const activeDevices = devices.filter((d) => d.validUntil >= a.today).length;

  useRegisterSheets(useMemo(() => loading ? null : [
    ...(a.canPay ? [{ name: "Salaries", headers: ["Ninja", "Salary today", "Next change from", "Next salary", "Plan"], rows: list.map((n) => { const next = ctx.salaries.filter((s) => s.staffId === n.id && s.effectiveFrom > a.today).sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom))[0];
      return [n.name, salaryFor(ctx.salaries, n.id, a.today), next?.effectiveFrom ?? "", next?.monthlySalary ?? "", planRowFor(ctx.plans, n.id, a.today)?.staffId === n.id ? "Own plan" : "Company plan"]; }) }] : []),
    { name: "Eligible devices", headers: ["Type", "Model text", "Valid from", "Valid until"], rows: devices.map((d) => [d.kind, d.pattern, d.validFrom, d.validUntil]) },
  ], [loading, list, ctx, a.today, a.canPay, devices]));

  type PRow = (typeof history)[number]; type DRow = (typeof devices)[number];
  const salGrid = useFieldGrid<RosterNinja>("activity_rules_salaries", [
    { key: "ninja", label: "Ninja", width: 240, anchor: true, render: (n) => <NameText label={n.name} href={`/field/activity/${n.id}?tab=settings`} /> },
    { key: "now", label: "Salary today", width: 170, render: (n) => { const v = salaryFor(ctx.salaries, n.id, a.today); return v ? <b>{inr(v)}</b> : <span className="font-semibold text-amber-700">Not set</span>; } },
    { key: "next", label: "Next change", width: 190, render: (n) => { const nx = ctx.salaries.filter((x) => x.staffId === n.id && x.effectiveFrom > a.today).sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom))[0];
      return nx ? <><b>{inr(nx.monthlySalary)}</b><Sub>from {day(nx.effectiveFrom)}</Sub></> : <Dash />; } },
    { key: "plan", label: "Plan", width: 170, render: (n) => planRowFor(ctx.plans, n.id, a.today)?.staffId === n.id ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[12.5px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">Own plan</span> : <span className="text-muted-foreground">Company plan</span> },
    { key: "act", label: "Change", width: 220, actions: true, render: (n) => a.canManagePay ? <div className="flex justify-center gap-2"><Button size="sm" variant="outline" onClick={() => setDlg({ k: "salary", n })}>Salary…</Button><Button size="sm" variant="outline" onClick={() => setDlg({ k: "plan", staffId: n.id, name: n.name })}>Plan…</Button></div> : <Dash /> },
  ]);
  const devGrid = useFieldGrid<DRow>("activity_rules_devices", [
    { key: "model", label: "Model text", width: 280, anchor: true, render: (d) => <NameText label={d.pattern} /> },
    { key: "kind", label: "Type", width: 130, cellClass: () => "capitalize", render: (d) => d.kind },
    { key: "from", label: "Valid from", width: 160, render: (d) => day(d.validFrom) },
    { key: "until", label: "Valid until", width: 160, render: (d) => day(d.validUntil) },
    { key: "status", label: "Status", width: 130, render: (d) => <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-bold", d.validUntil < a.today ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800")}>{d.validUntil < a.today ? "Expired" : "Active"}</span> },
  ]);
  const histGrid = useFieldGrid<PRow>("activity_rules_history", [
    { key: "start", label: "Starts", width: 200, anchor: true, render: (r) => <NameText label={day(r.effectiveFrom)} /> },
    { key: "status", label: "Status", width: 170, render: (r) => <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-bold", r.effectiveFrom > a.today ? "bg-amber-100 text-amber-800" : r.effectiveFrom === a.today ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600")}>{r.effectiveFrom > a.today ? "Scheduled" : r.effectiveFrom === a.today ? "Starts today" : "Applied"}</span> },
    { key: "note", label: "Note", width: 380, align: "left", cellClass: () => "truncate text-muted-foreground", render: (r) => r.note || "—" },
  ]);
  const cur = view === "salaries" ? salGrid : view === "devices" ? devGrid : histGrid;
  const views = [...(a.canPay ? [{ label: "Incentive plan", value: "plan" as View }, { label: `Salaries${noSalary ? ` (${noSalary} not set)` : ""}`, value: "salaries" as View }] : []),
    { label: "Attendance & fuel", value: "attendance" as View }, { label: `Eligible devices (${activeDevices})`, value: "devices" as View }];
  return (
    <div className="rox-lock-fill space-y-4">
      <KpiStrip loading={loading} items={[
        { label: "Company plan since", value: history.find((h) => h.effectiveFrom <= a.today) ? day(history.find((h) => h.effectiveFrom <= a.today)!.effectiveFrom) : "Defaults", sub: scheduled ? `${scheduled} change${scheduled === 1 ? "" : "s"} scheduled` : "nothing scheduled", icon: History, tone: scheduled ? "warn" : "default" },
        { label: "Ninjas on their own plan", value: own, sub: `${list.length - own} on the company plan`, icon: IndianRupee },
        { label: "Salary not set", value: a.canPay ? noSalary : "—", sub: a.canPay ? (noSalary ? "basic salary pays ₹0" : "all set") : "needs pay access", tone: a.canPay && noSalary ? "warn" : "default", icon: Users },
        { label: "Fuel rate", value: `${inr(policy.fuelRatePerKm)} / km`, sub: `photo ${policy.odometerPhotoRequired ? "required" : "optional"} · half day < ${policy.halfDayHours}h`, icon: Fuel },
      ]} />
      <ViewBar value={view} onChange={setView} options={views} info="Every change is dated. It starts on the day you choose (today or later) and never changes earlier days. Changes that already started can't be edited; add a new one instead.">
        {view === "plan" && a.canManagePay && <Button size="sm" onClick={() => setDlg({ k: "plan", staffId: null })}>Change company plan…</Button>}
        {view === "attendance" && canEdit && <Button size="sm" onClick={() => setDlg({ k: "policy" })}>Edit rules…</Button>}
        {view === "devices" && a.canManagePay && <Button size="sm" onClick={() => setDlg({ k: "devices" })}>Edit list…</Button>}
        {(view === "salaries" || view === "devices") && cur.menus}
      </ViewBar>

      {view === "plan" && (
        <div className="rox-lock-grow space-y-6 overflow-auto rox-grid-scroll pr-1">
          <PlanCards p={plan} />
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-muted-foreground"><History className="h-3.5 w-3.5" />Change history</p>
            <FieldGrid grid={histGrid} lock={false} rows={pH.slice} rowKey={(r) => r.id ?? r.effectiveFrom} empty={history.length ? null : "No saved change yet — the defaults from your sheet apply."} />
            {history.length > 10 && <div className="mt-2">{pH.footer("change")}</div>}
          </div>
        </div>
      )}

      {view === "salaries" && a.canPay && <>
        <FieldGrid grid={salGrid} rows={pS.slice} rowKey={(n) => n.id} empty={loading ? "Loading…" : list.length ? null : "No Ninjas found."} />
        {pS.footer("Ninja")}
      </>}

      {view === "attendance" && (
        <div className="rox-lock-grow overflow-auto rox-grid-scroll">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <RuleCard icon={Fuel} title="Fuel"><Line k="Rate per odometer km" v={inr(policy.fuelRatePerKm)} /><Line k="Odometer photo" v={policy.odometerPhotoRequired ? "Required" : "Optional"} /></RuleCard>
            <RuleCard icon={CalendarCheck2} title="Leave"><Line k="Festival leave" v={`${policy.festivalLeavePerYear} per year`} /><Line k="Casual leave" v={`${policy.casualLeavePerMonth} per month`} /><Line k="Week offs" v={`${policy.weekOffPerMonth} per month`} /></RuleCard>
            <RuleCard icon={Sun} title="Working day"><Line k="Half day if the shift is under" v={`${policy.halfDayHours} hours`} /><Line k="Absent" v="past day, no shift, no leave" /></RuleCard>
          </div>
        </div>
      )}

      {view === "devices" && <>
        <FieldGrid grid={devGrid} rows={pD.slice} rowKey={(d, i) => d.id ?? String(i)} empty={loading ? "Loading…" : devices.length ? null : `No list entered. Any MacBook and any iPhone above ${plan.iphoneAboveModel} counts until the Cluster Manager's list is added.`} />
        {pD.footer("device")}
      </>}

      {dlg?.k === "plan" && <PlanDialog scope={{ staffId: dlg.staffId, name: dlg.name }} today={a.today} plans={ctx.plans} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load(); }} />}
      {dlg?.k === "salary" && <SalaryDialog ninja={dlg.n} today={a.today} salaries={ctx.salaries} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load(); }} />}
      {dlg?.k === "devices" && <DevicesDialog today={a.today} lists={ctx.deviceLists} onClose={() => setDlg(null)} onSaved={() => void load()} />}
      {dlg?.k === "policy" && <PolicyDialog policy={policy} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load(); }} />}
    </div>
  );
}
