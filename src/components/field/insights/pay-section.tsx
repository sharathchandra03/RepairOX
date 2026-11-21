"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Field Activity pay engine wiring: usePayRows (live + frozen payslips), the payslip breakdown and the month
   close / reopen dialogs. The Pay page itself is components/field/activity/pay-page.tsx.
   Salary + incentive for every Field Engineer, calculated from trips, shifts,
   odometer, reviews and the plan in force on each day (lib/field-incentives.ts).
   View: field_pay_view. Change salary / plan / devices / inputs and CLOSE a month: field_pay_manage.
   A closed month shows the frozen payslips (migration 0117); later data changes appear as "live differs".
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Lock, LockOpen, Settings2, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { fetchRoster, ymRange, type RosterNinja } from "@/lib/field-attendance-data";
import { buildNinjaMonth, STATUS_LABEL } from "@/lib/field-attendance";
import { computeNinjaPay, planFor, salaryFor, type PaySummary } from "@/lib/field-incentives";
import { fetchClosedMonth, fetchPayContext, fetchPayMonth, postCloseAdjustments, type ClosedMonth, type PayContext, type PayMonthData } from "@/lib/field-pay-data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const friendlyClose = (m: string) =>
  m.includes("payroll_month_not_over") ? "A month can be closed only after it has ended."
  : m.includes("payroll_already_closed") ? "This month is already closed."
  : m.includes("payroll_forbidden") ? "You don't have permission to close a month."
  : m.includes("payroll_reason_required") ? "Please give a reason."
  : m.includes("payroll_staff_out_of_scope") ? "One of the Ninjas belongs to a store you can't access. Choose All stores you manage and try again."
  : "Could not complete that. Please try again.";
const slim = (s: PaySummary) => { const { days: _d, ...rest } = s; return rest; };

/** One Ninja's pay for a month, from the live data. Shared by the Pay table, the payslip and the Ninja profile. */
export function usePayRows(ym: string, tz: string, storeSel: string[], multiStore: boolean, q = "") {
  const nowMs = useMemo(() => Date.now(), []);
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof fetchRoster>> | null>(null);
  const [ctx, setCtx] = useState<PayContext>({ plans: [], salaries: [], deviceLists: [] });
  const [pay, setPay] = useState<PayMonthData | null>(null);
  const [closed, setClosed] = useState<ClosedMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = ymRange(ym);
      const [a, c, p, cl] = await Promise.all([fetchRoster(r.from, r.to), fetchPayContext(), fetchPayMonth(ym, tz), fetchClosedMonth(ym)]);
      setRoster(a); setCtx(c); setPay(p); setClosed(cl); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load pay."); }
    setLoading(false);
  }, [ym, tz]);
  useEffect(() => { void load(); }, [load]);
  const all = useMemo(() => (roster?.ninjas ?? []).filter((n) => (!multiStore || matchesStoreSelection(n.branchId ?? undefined, storeSel)) && n.status !== "inactive"), [roster, multiStore, storeSel]);
  const results = useMemo(() => (roster && pay ? all.map((n) => {
    const month = buildNinjaMonth({ staffId: n.id, ym, tz, nowMs, sessions: roster.sessions, logs: roster.logs, marks: roster.marks, weeklyOff: roster.weeklyOff.get(n.id) ?? null, policy: roster.policy });
    const live = computeNinjaPay({ staffId: n.id, ym, tz, nowMs, month, trips: pay.trips, reviews: pay.reviews, plans: ctx.plans, salaries: ctx.salaries, deviceLists: ctx.deviceLists,
      organicLeads: pay.leads.get(n.id) ?? 0, adjustments: pay.adjustments.get(n.id) ?? [] });
    const line = closed?.lines.get(n.id) ?? null;
    const post = closed ? postCloseAdjustments(pay.adjustments.get(n.id) ?? [], closed.closedAt) : 0;
    /** What is shown and paid: the frozen payslip (+ later adjustments) when closed, else the live figures. */
    const shown: PaySummary = line ? { ...live, ...(line.summary as Partial<PaySummary>), days: live.days, total: Math.round((line.total + post) * 100) / 100 } : live;
    const liveDiff = line ? Math.round((live.total - (line.total + post)) * 100) / 100 : 0;
    return { n, s: shown, live, frozen: !!line, post, liveDiff, month };
  }) : []), [roster, pay, all, ym, tz, nowMs, ctx, closed]);
  const rows = useMemo(() => results.filter((x) => !q || x.n.name.toLowerCase().includes(q.toLowerCase())), [results, q]);
  return { nowMs, roster, ctx, pay, closed, loading, err, load, rows, results };
}
export type PayRow = ReturnType<typeof usePayRows>["rows"][number];

export function CloseMonthDialog({ ym, rows, today, onClose, onDone }: { ym: string; rows: PayRow[]; today: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const total = rows.reduce((a, x) => a + x.live.total, 0);
  const noSalary = rows.filter((x) => salaryFor([], x.n.id, today) === 0 && x.live.basic === 0);
  async function close() {
    if (!supabase) return; setBusy(true);
    const { error } = await supabase.rpc("field_payroll_close", { p_month: ym, p_note: note.trim() || null, p_lines: rows.map((x) => ({ staff_id: x.n.id, total: x.live.total, summary: slim(x.live) })) });
    setBusy(false);
    if (error) toast.error(friendlyClose(error.message)); else { toast.success("Month closed. Payslips are frozen."); onDone(); }
  }
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-lg" icon={Lock} title={`Close ${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`} subtitle="Freeze every payslip for this month"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => void close()}>Close month</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ninjas</p><p className="mt-1 text-[24px] font-extrabold">{rows.length}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total payable</p><p className="mt-1 text-[24px] font-extrabold tabular-nums">{inr(total)}</p></div>
      </div>
      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[12.5px] text-muted-foreground">
        <li>Each Ninja's payslip is saved exactly as shown now. Odometer, leave or trip corrections made later will not change it.</li>
        <li>Organic leads for this month can no longer be edited. A bonus or deduction can still be added and is paid on top.</li>
        <li>Only the stores you are viewing are closed. Choose all the stores you manage first.</li>
        {noSalary.length > 0 && <li className="font-semibold text-amber-700">{noSalary.map((x) => x.n.name).join(", ")} {noSalary.length === 1 ? "has" : "have"} no salary set.</li>}
      </ul>
      <Input className="mt-4" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </RoxCenteredForm>
  );
}

export function ReopenDialog({ ym, onClose, onDone }: { ym: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    if (!supabase) return; setBusy(true);
    const { error } = await supabase.rpc("field_payroll_reopen", { p_month: ym, p_reason: reason });
    setBusy(false);
    if (error) toast.error(friendlyClose(error.message)); else { toast.success("Month reopened."); onDone(); }
  }
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-md" icon={LockOpen} title={`Reopen ${ym}`} subtitle="The frozen payslips are removed and the month goes back to live figures"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !reason.trim()} onClick={() => void go()}>Reopen month</Button></>}>
      <p className="text-[12.5px] text-muted-foreground">This is recorded with your name and the reason. Close the month again once the figures are right.</p>
      <Input className="mt-3" placeholder="Why is it being reopened? (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </RoxCenteredForm>
  );
}

/** The payslip + inputs + day by day for one Ninja. Used in a dialog (Pay table) and in the Ninja profile. */
export function PayBreakdown({ ninja, ym, tz, today, nowMs, roster, pay, ctx, canManage, frozen, closedAt, onChanged }: {
  ninja: { id: string; name: string }; ym: string; tz: string; today: string; nowMs: number; roster: Awaited<ReturnType<typeof fetchRoster>>; pay: PayMonthData; ctx: PayContext;
  canManage: boolean; frozen: { total: number; summary: Record<string, any> } | null; closedAt: string | null; onChanged: () => void;
}) {
  const month = useMemo(() => buildNinjaMonth({ staffId: ninja.id, ym, tz, nowMs, sessions: roster.sessions, logs: roster.logs, marks: roster.marks, weeklyOff: roster.weeklyOff.get(ninja.id) ?? null, policy: roster.policy }), [ninja.id, ym, tz, nowMs, roster]);
  const adj = pay.adjustments.get(ninja.id) ?? [];
  const live = useMemo(() => computeNinjaPay({ staffId: ninja.id, ym, tz, nowMs, month, trips: pay.trips, reviews: pay.reviews, plans: ctx.plans, salaries: ctx.salaries, deviceLists: ctx.deviceLists, organicLeads: pay.leads.get(ninja.id) ?? 0, adjustments: adj }), [ninja.id, ym, tz, nowMs, month, pay, ctx, adj]);
  const post = frozen && closedAt ? postCloseAdjustments(adj, closedAt) : 0;
  const s: PaySummary = frozen ? { ...live, ...(frozen.summary as Partial<PaySummary>), days: live.days, total: frozen.total + post } : live;
  const plan = planFor(ctx.plans, ninja.id, today);
  const [leads, setLeads] = useState(String(pay.leads.get(ninja.id) ?? 0));
  const [amt, setAmt] = useState(""); const [why, setWhy] = useState(""); const [busy, setBusy] = useState(false);
  async function saveLeads() {
    if (!supabase) return; setBusy(true);
    const { error } = await supabase.from("field_incentive_inputs").upsert({ staff_id: ninja.id, month: ym, key: "organic_leads", value: Number(leads) || 0 }, { onConflict: "staff_id,month,key" });
    setBusy(false); if (error) toast.error(error.message.includes("payroll_month_closed") ? "This month is closed. Reopen it to change the leads." : "Could not save."); else { toast.success("Saved."); onChanged(); }
  }
  async function addAdj() {
    const n = Number(amt);
    if (!supabase || !Number.isFinite(n) || n === 0 || !why.trim()) { toast.error("Enter an amount (use − for a deduction) and a reason."); return; }
    setBusy(true);
    const { error } = await supabase.from("field_incentive_adjustments").insert({ staff_id: ninja.id, month: ym, amount: n, reason: why.trim() });
    setBusy(false); if (error) toast.error("Could not save."); else { toast.success("Added."); setAmt(""); setWhy(""); onChanged(); }
  }
  const line = (label: string, detail: string, amount: number) => (
    <div className="flex items-baseline gap-3 py-2.5 text-[13.5px]">
      <span className="w-[170px] shrink-0 font-semibold">{label}</span><span className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">{detail}</span>
      <span className="font-bold tabular-nums">{inr2(amount)}</span>
    </div>
  );
  return (
    <div>
      {frozen && <p className="mb-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-900">Frozen payslip. {Math.abs(live.total - s.total) >= 1 ? `Live data now gives ${inr2(live.total)}; add an adjustment if the difference should be paid.` : "It matches the live data."}</p>}
      <div className="divide-y divide-border rounded-xl border border-border px-4">
        {line("Basic salary", `${inr(salaryFor(ctx.salaries, ninja.id, today))} / month, paid per day worked or on paid leave`, s.basic)}
        {line("Daily trips", s.dailyTierDays.map((t) => `${t.days} day${t.days === 1 ? "" : "s"} with ${t.minTrips}+`).join(" · ") || "No daily tiers", s.daily)}
        {line("Monthly slab", `${s.trips} trips counted${s.extraFromDistance ? ` (${s.extraFromDistance} from long distance)` : ""}${s.slabHeld ? ` · ${inr(s.slabHeld)} held for reviews` : ""}`, s.slab)}
        {line("Reviews", `${s.verifiedReviews} counted (${plan.reviewMinRating}★ and above${plan.reviewNeedsTicket ? ", on a ticket" : ""})`, s.reviews)}
        {line("Devices", `${s.macbookRepairs} MacBook · ${s.iphoneRepairs} iPhone`, s.devices)}
        {line("Organic leads", `${s.organicLeads} billed${s.leadGift ? " · gift unlocked 🎁" : ""}`, s.leads)}
        {line("Sunday", `${s.sundaysWorked} Sunday${s.sundaysWorked === 1 ? "" : "s"} worked${s.absences ? ` · ${s.absences} absence(s) this month` : ""}`, s.sunday)}
        {line("Petrol", `${s.km} km × ${inr2(plan.petrolPerKm)}${plan.petrolMaxKmPerDay > 0 ? ` · max ${plan.petrolMaxKmPerDay} km a day` : ""}`, s.petrol)}
        {s.fines > 0 && line("Absent fines", `${s.absences} absent day${s.absences === 1 ? "" : "s"} × ${inr2(plan.absentFine)}`, -s.fines)}
        {s.capped > 0 && line("Monthly limit", `Incentives are capped at ${inr2(plan.incentiveCap)}`, -s.capped)}
        {line("Adjustments", `${adj.length} entr${adj.length === 1 ? "y" : "ies"}${post ? ` · ${inr2(post)} after close` : ""}`, frozen ? (frozen.summary.adjustments ?? 0) + post : s.adjustments)}
        <div className="flex items-baseline gap-3 py-3 text-[15px]"><span className="w-[170px] shrink-0 font-extrabold">Total payable</span>
          <span className="min-w-0 flex-1 text-[12px] font-normal text-muted-foreground">{s.locked > 0 ? `${inr2(s.locked)} more is earned but locked (target ${s.gateTrips} trips not met)` : ""}{s.rounding ? ` · rounded ${s.rounding > 0 ? "+" : "−"}${inr2(Math.abs(s.rounding))}` : ""}</span>
          <span className="text-[18px] font-extrabold tabular-nums">{inr2(s.total)}</span></div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Organic billed leads this month</p>
          <div className="flex gap-2"><Input inputMode="numeric" value={leads} disabled={!canManage || !!frozen} onChange={(e) => setLeads(e.target.value.replace(/\D/g, ""))} />{canManage && !frozen && <Button disabled={busy} onClick={() => void saveLeads()}>Save</Button>}</div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Count only leads that were billed. This is the one figure entered by hand until organic leads are tracked in the lead form.</p>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bonus or deduction</p>
          {adj.map((a) => <div key={a.id} className="flex justify-between border-b border-border py-1.5 text-[12.5px]"><span className="truncate">{a.reason}</span><b className={cn("tabular-nums", a.amount < 0 && "text-rose-700")}>{inr2(a.amount)}</b></div>)}
          {canManage && <div className="mt-2 grid grid-cols-[90px_1fr_auto] gap-2"><Input placeholder="± ₹" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.-]/g, ""))} /><Input placeholder="Reason (required)" value={why} onChange={(e) => setWhy(e.target.value)} /><Button disabled={busy} onClick={() => void addAdj()}>Add</Button></div>}
        </div>
      </div>

      <p className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Day by day{frozen ? " (live data)" : ""}</p>
      <div className="max-h-[360px] overflow-auto rounded-xl border border-border">
        <table className="rox-zebra w-full text-[14px]">
          <thead className="sticky top-0 bg-[#EEF1FD] text-[10.5px] font-bold uppercase tracking-wider text-[#4361EE]"><tr>{["Day", "Status", "Trips", "Basic", "Daily", "Slab", "Review", "Devices", "Sunday", "Petrol"].map((h) => <th key={h} className="px-2.5 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {live.days.map((d) => (
              <tr key={d.date} className="border-t border-border">
                <td className="px-2.5 py-2 font-semibold">{Number(d.date.slice(8))} {MONTHS[Number(d.date.slice(5, 7)) - 1]}</td>
                <td className="px-2.5 py-2">{STATUS_LABEL[d.status]}</td>
                <td className="px-2.5 py-2 tabular-nums">{d.trips}{d.extraFromDistance > 0 && <span className="text-sky-700"> → {d.tripsCounted}</span>}</td>
                {[d.basic, d.daily, d.slab, d.reviews, d.macbook + d.iphone, d.sunday, d.petrol].map((v, i) => <td key={i} className="px-2.5 py-2 tabular-nums">{v ? inr(v) : <span className="text-zinc-300">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">Rates shown follow the plan in force on each day. If the monthly target is not met, incentive columns are earned but locked in the payslip above.</p>
    </div>
  );
}

export function PayDetailDialog({ ninja, ym, tz, today, nowMs, roster, pay, ctx, canManage, frozen, closedAt, onClose, onChanged, onSalary, onPlan }: {
  ninja: RosterNinja; ym: string; tz: string; today: string; nowMs: number; roster: Awaited<ReturnType<typeof fetchRoster>>; pay: PayMonthData; ctx: PayContext;
  canManage: boolean; frozen: { total: number; summary: Record<string, any> } | null; closedAt: string | null; onClose: () => void; onChanged: () => void; onSalary: () => void; onPlan: () => void;
}) {
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-4xl" icon={Banknote} title={`${ninja.name} · ${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`}
      subtitle={frozen ? "Closed month" : "Payslip"}
      footer={<>{canManage && <><Button variant="outline" className="gap-1.5" onClick={onSalary}><Wallet className="h-3.5 w-3.5" />Salary…</Button><Button variant="outline" className="gap-1.5" onClick={onPlan}><Settings2 className="h-3.5 w-3.5" />This Ninja's plan…</Button></>}<Button variant="outline" onClick={onClose}>Close</Button></>}>
      <PayBreakdown ninja={ninja} ym={ym} tz={tz} today={today} nowMs={nowMs} roster={roster} pay={pay} ctx={ctx} canManage={canManage} frozen={frozen} closedAt={closedAt} onChanged={onChanged} />
    </RoxCenteredForm>
  );
}
