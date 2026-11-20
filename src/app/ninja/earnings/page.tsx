"use client";
/* Ninja → My earnings. Plain-language view of this month's pay: what has been earned so far, what the
   next rupee depends on, and the rules in force today. Same engine as the CRM, so the numbers match. */
import { useState } from "react";
import Link from "next/link";
import { BadgeIndianRupee, CalendarCheck, ChevronLeft, ChevronRight, Fuel, Lock, Smartphone, Star, Target, Trophy } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { localDateKey } from "@/lib/work-session";
import { useMyPay } from "@/lib/ninja/my-pay";
import { describePlan, dailyBonusFor, reviewBonusAt } from "@/lib/field-incentives";
import { Card, SectionTitle, Skeleton } from "@/components/ninja/ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shiftYm = (ym: string, d: number) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Bar({ value, max, tone = "bg-[#4361EE]" }: { value: number; max: number; tone?: string }) {
  return <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} /></div>;
}

export default function EarningsPage() {
  const tz = useStoreSettings().settings.timeZone;
  const { currentUser } = usePermissions();
  const thisMonth = localDateKey(Date.now(), tz).slice(0, 7);
  const [ym, setYm] = useState(thisMonth);
  const my = useMyPay(ym);
  const s = my.summary, plan = my.plan;
  const todayRow = s?.days.find((d) => d.date === my.today);

  let todayLine = "";
  if (todayRow && plan) {
    const tiers = [...plan.dailyTiers].sort((a, b) => a.minTrips - b.minTrips);
    const next = tiers.find((t) => todayRow.tripsCounted < t.minTrips);
    todayLine = next ? `${next.minTrips - todayRow.tripsCounted} more trip${next.minTrips - todayRow.tripsCounted === 1 ? "" : "s"} today for ${rupees(next.amount)}` : tiers.length ? "Top daily bonus reached 🎉" : "";
  }
  const revNext = plan && s ? [...plan.reviewTiers].sort((a, b) => a.min - b.min).find((t) => s.verifiedReviews < t.min) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setYm(shiftYm(ym, -1))} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-2xl bg-white ring-1 ring-slate-200 active:scale-95"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-[18px] font-extrabold">{MONTHS[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</h1>
        <button onClick={() => setYm(shiftYm(ym, 1))} disabled={ym >= thisMonth} aria-label="Next month" className="grid h-11 w-11 place-items-center rounded-2xl bg-white ring-1 ring-slate-200 active:scale-95 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {my.failed ? <Card className="p-5 text-center text-[13px] text-slate-500">Could not load your earnings. Pull down to refresh.</Card>
        : !s || !plan ? <Skeleton className="h-[260px] w-full" /> : (
        <>
          <Card className="overflow-hidden bg-gradient-to-br from-[#2F46C4] to-[#4361EE] p-5 text-white">
            <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-white/70"><BadgeIndianRupee className="h-4 w-4" />{my.final ? "Final pay" : "Earned so far"}{currentUser?.name ? ` · ${currentUser.name.split(" ")[0]}` : ""}</p>
            <p className="mt-1 text-[38px] font-extrabold leading-none tabular-nums">{rupees(s.total)}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-semibold text-white/85">
              <span>Salary {rupees(s.basic)}</span><span>Incentives {rupees(s.incentives)}</span><span>Petrol {rupees(s.petrol)}</span>{s.adjustments !== 0 && <span>Other {rupees(s.adjustments)}</span>}
            </div>
            {(my.salary ?? 0) > 0 && s.basicProjected > s.basic ? <p className="mt-2 text-[11.5px] text-white/65">Salary for the full month: {rupees(s.basicProjected)}</p> : null}
          </Card>

          {my.final ? <Card className="bg-emerald-50 p-4 ring-1 ring-emerald-200"><p className="text-[13.5px] font-extrabold text-emerald-900">This month is closed. The amount above is final.</p></Card> : null}
          {!s.gatePassed && !my.final ? (
            <Card className="flex items-start gap-3 bg-amber-50 p-4 ring-1 ring-amber-200">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div><p className="text-[14px] font-extrabold text-amber-900">Complete {s.tripsToGate} more trip{s.tripsToGate === 1 ? "" : "s"} to unlock your incentives</p>
                <p className="mt-0.5 text-[12.5px] font-medium text-amber-800">{s.locked > 0 ? `${rupees(s.locked)} is already earned and waits for the ${s.gateTrips}-trip target. ` : ""}Petrol is paid either way.</p></div>
            </Card>
          ) : null}

          <Card className="p-4">
            <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-[14px] font-extrabold"><Target className="h-4 w-4 text-[#4361EE]" />Trips this month</p><p className="text-[22px] font-extrabold tabular-nums">{s.trips}</p></div>
            <div className="mt-2"><Bar value={s.trips} max={s.nextSlab ? Math.max(s.nextSlab.atTrip, s.gateTrips) : s.trips} tone={s.gatePassed ? "bg-emerald-500" : "bg-amber-500"} /></div>
            <p className="mt-2 text-[12.5px] font-medium text-slate-500">
              {s.nextSlab ? `${Math.max(0, s.nextSlab.tripsAway)} more trip${s.nextSlab.tripsAway === 1 ? "" : "s"} until ${rupees(s.nextSlab.rate)} per trip starts.` : "You are on the top slab."}
              {s.extraFromDistance > 0 ? ` Includes ${s.extraFromDistance} extra from long-distance trips.` : ""}
            </p>
          </Card>

          {todayRow ? (
            <Card className="p-4">
              <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-[14px] font-extrabold"><Trophy className="h-4 w-4 text-amber-500" />Today</p><p className="text-[22px] font-extrabold tabular-nums">{todayRow.tripsCounted}<span className="text-[13px] font-bold text-slate-400"> trips</span></p></div>
              <div className="mt-2 flex gap-1">{[...plan.dailyTiers].sort((a, b) => a.minTrips - b.minTrips).map((t) => <div key={t.minTrips} className="flex-1"><Bar value={todayRow.tripsCounted} max={t.minTrips} tone="bg-amber-500" /><p className="mt-1 text-[11px] font-bold text-slate-500">{t.minTrips}+ = {rupees(t.amount)}</p></div>)}</div>
              {todayLine ? <p className="mt-2 text-[12.5px] font-semibold text-slate-600">{todayLine}</p> : null}
              {dailyBonusFor(plan, todayRow.tripsCounted) > 0 && s.gatePassed ? <p className="mt-1 text-[12.5px] font-bold text-emerald-700">Today's bonus: {rupees(dailyBonusFor(plan, todayRow.tripsCounted))}</p> : null}
            </Card>
          ) : null}

          <SectionTitle>Where it comes from</SectionTitle>
          <Card className="divide-y divide-slate-100">
            {[
              { icon: <Trophy className="h-5 w-5" />, tone: "bg-amber-50 text-amber-600", l: "Daily trips", d: `${s.dailyDays6} days with 6+ · ${s.dailyDays9} with 9+`, v: s.daily },
              { icon: <Target className="h-5 w-5" />, tone: "bg-[#EEF1FD] text-[#4361EE]", l: "Monthly slab", d: s.slabHeld > 0 ? `${rupees(s.slabHeld)} waits for ${plan.slabMinReviews} verified reviews` : `${Math.max(0, s.trips - plan.monthlyMinTrips)} trips above ${plan.monthlyMinTrips}`, v: s.slab },
              { icon: <Star className="h-5 w-5" />, tone: "bg-violet-50 text-violet-600", l: "Reviews", d: `${s.verifiedReviews} verified 5★${revNext ? ` · ${revNext.min - s.verifiedReviews} more for ${rupees(revNext.amount)}` : ""}`, v: s.reviews },
              { icon: <Smartphone className="h-5 w-5" />, tone: "bg-sky-50 text-sky-600", l: "Latest devices", d: `${s.macbookRepairs} MacBook · ${s.iphoneRepairs} iPhone`, v: s.devices },
              { icon: <CalendarCheck className="h-5 w-5" />, tone: "bg-emerald-50 text-emerald-600", l: "Sundays", d: `${s.sundaysWorked} worked`, v: s.sunday },
              { icon: <Fuel className="h-5 w-5" />, tone: "bg-orange-50 text-orange-600", l: "Petrol", d: `${s.km} km × ₹${plan.petrolPerKm}`, v: s.petrol },
            ].map((r) => (
              <div key={r.l} className="flex items-center gap-3 px-4 py-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r.tone}`}>{r.icon}</span>
                <span className="min-w-0 flex-1"><span className="block text-[14px] font-extrabold">{r.l}</span><span className="block truncate text-[12px] font-medium text-slate-500">{r.d}</span></span>
                <span className="text-[15px] font-extrabold tabular-nums">{rupees(r.v)}</span>
              </div>
            ))}
          </Card>
          {s.leads > 0 || s.organicLeads > 0 ? <Card className="flex items-center justify-between p-4"><span className="text-[14px] font-extrabold">Organic billed leads · {s.organicLeads}{s.leadGift ? " 🎁" : ""}</span><span className="text-[15px] font-extrabold tabular-nums">{rupees(s.leads)}</span></Card> : null}

          <details className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <summary className="cursor-pointer text-[14px] font-extrabold">The rules that apply to you today</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] font-medium text-slate-600">{describePlan(plan).map((l, i) => <li key={i}>{l}</li>)}</ul>
            <p className="mt-3 text-[12px] text-slate-400">If your manager changes a rule, it starts on the date they choose. Days before that keep the old rule.</p>
          </details>
          <Link href="/ninja/attendance" className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 active:bg-slate-50"><CalendarCheck className="h-5 w-5 text-[#4361EE]" /><span className="flex-1 text-[14px] font-bold">Attendance, km and leave</span><ChevronRight className="h-5 w-5 text-slate-300" /></Link>
        </>
      )}
      <p className="px-1 text-[11.5px] leading-relaxed text-slate-400">This is an estimate from your trips, shift and odometer so far. Your manager confirms the final amount at month end.</p>
    </div>
  );
}
