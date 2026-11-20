"use client";
/* "My Day" — a Ninja's own numbers, shaped for a phone: one hero, a week of bars, two rings, a speed
   meter and plain-language lines. Everything is computed from real records by lib/ninja/insights.ts. */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Clock3, Flame, MapPinned, IndianRupee, ReceiptText, ShieldCheck, Timer, Ticket, TriangleAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { formatINR, fitFontSize } from "@/lib/utils";
import { useNinja } from "@/lib/ninja/ninja-context";
import { type AssignmentRow, type Period, type TripStatRow, PERIOD_LABEL, computeInsights, durationLabel } from "@/lib/ninja/insights";
import { TYPE_LABEL } from "@/lib/ninja/model";
import { Card, FitNumber, SectionTitle, Segmented } from "@/components/ninja/ui";

function Ring({ value, label, tone, size = 116 }: { value: number | null; label: string; tone: string; size?: number }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r, pct = value ?? 0;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#E8ECF6" strokeWidth="8" fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth="8" strokeLinecap="round" fill="none" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="flex items-baseline font-extrabold leading-none tabular-nums" style={{ fontSize: fitFontSize(value == null ? "—" : Math.round(value * 100), 26, { fitAt: 2 }) }}>{value == null ? "—" : Math.round(value * 100)}<span className="ml-0.5 text-[12px] font-bold text-slate-400">{value == null ? "" : "%"}</span></p>
        <p className="mt-1.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return null;
  const d = now - prev, up = d >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${up ? "bg-emerald-400/25 text-emerald-100" : "bg-rose-400/25 text-rose-100"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(d)} vs before
    </span>
  );
}

export default function InsightsPage() {
  const { trips, staffId, track } = useNinja();
  const { invoices } = useStore();
  const [period, setPeriod] = useState<Period>("today");
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [stats, setStats] = useState<TripStatRow[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => { track({ kind: "insights_viewed", screen: "insights" }); }, [track]);
  useEffect(() => {
    if (!supabase || !staffId) return;
    let off = false;
    const since = new Date(Date.now() - 62 * 864e5).toISOString();
    (async () => {
      const [a, s, p] = await Promise.all([
        supabase!.from("field_assignments").select("trip_id,outcome,reject_reason,assigned_at,responded_at").eq("ninja_id", staffId).gte("assigned_at", since).limit(500),
        supabase!.from("field_ninja_trip_stats_v").select("trip_id,distance_m,travel_seconds,service_seconds").eq("ninja_id", staffId).limit(500),
        supabase!.from("field_trip_events").select("occurred_at").eq("actor_staff_id", staffId).eq("event_type", "problem_reported").gte("occurred_at", since).limit(500),
      ]);
      if (off) return;
      setAssignments((a.data ?? []) as AssignmentRow[]);
      setStats(s.error ? null : ((s.data ?? []) as TripStatRow[]));
      setProblems(((p.data ?? []) as { occurred_at: string }[]).map((x) => x.occurred_at));
    })();
    return () => { off = true; };
  }, [staffId, trips.length]);

  const ins = useMemo(() => computeInsights({
    trips, assignments, stats, problemTimes: problems, period,
    invoices: invoices.map((v) => ({ id: v.id, total: v.total, paidAmount: v.paidAmount, status: v.status })),
  }), [trips, assignments, stats, problems, period, invoices]);

  const maxBar = Math.max(1, ...ins.week.map((d) => d.count));
  const mixTotal = ins.mix.pickup + ins.mix.drop + ins.mix.onsite + ins.mix.warranty_pickup + ins.mix.buyback;
  const respPct = ins.response.medianSec == null ? 0 : Math.max(0.06, 1 - Math.min(1, ins.response.medianSec / 900));   // 15 min = default accept window

  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-[28px] font-extrabold leading-none tracking-tight">My Day</h1><p className="mt-1.5 text-[13px] font-medium text-slate-500">Your numbers, from real jobs</p></div>
      <Segmented<Period> label="Period" value={period} onChange={(p) => { setPeriod(p); track({ kind: "jobs_filter_changed", screen: "insights", payload: { period: p } }); }}
        options={(Object.keys(PERIOD_LABEL) as Period[]).map((id) => ({ id, label: PERIOD_LABEL[id], count: undefined }))} />

      {/* Hero */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1E2A78] via-[#2F46C4] to-[#4361EE] p-5 text-white shadow-[0_24px_50px_-24px_rgba(47,70,196,0.9)]">
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/70">Jobs completed</p>
            <p className="mt-1 font-display text-[64px] font-extrabold leading-none tabular-nums">{ins.completed}</p>
            <div className="mt-2"><Delta now={ins.completed} prev={ins.prevCompleted} /></div>
          </div>
          <div className="rounded-2xl bg-white/15 px-4 py-3 text-center ring-1 ring-white/20">
            <div className="flex items-center justify-center gap-1.5">
              <motion.p
                key={ins.streakDays}
                initial={{ y: 10, opacity: 0, scale: 0.7 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className="text-[28px] font-extrabold leading-none tabular-nums"
              >{ins.streakDays}</motion.p>
              <motion.span
                className="inline-flex origin-bottom"
                animate={ins.streakDays > 0 ? { scale: [1, 1.18, 0.95, 1.12, 1], rotate: [0, -6, 5, -3, 0] } : { scale: 1 }}
                transition={ins.streakDays > 0 ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
              >
                <Flame className={`h-7 w-7 ${ins.streakDays > 0 ? "fill-orange-400 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" : "text-white/40"}`} />
              </motion.span>
            </div>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/70">day streak</p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
          {[["To respond", ins.open.new], ["Ready", ins.open.later], ["On the move", ins.open.active]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-black/15 py-2"><p className="text-[18px] font-extrabold tabular-nums">{v as number}</p><p className="text-[10px] font-bold uppercase tracking-wider text-white/65">{l}</p></div>
          ))}
        </div>
      </motion.section>

      {/* Week bars */}
      <Card className="p-4">
        <div className="flex items-center justify-between"><p className="text-[14px] font-extrabold">Last 7 days</p>{ins.bestDay ? <span className="text-[12px] font-bold text-slate-400">Best: {ins.bestDay.label} · {ins.bestDay.count}</span> : null}</div>
        <div className="mt-4 flex h-28 items-end justify-between gap-2">
          {ins.week.map((d, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[11px] font-extrabold tabular-nums text-slate-500">{d.count || ""}</span>
              <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(d.count ? 12 : 4, (d.count / maxBar) * 78)}%` }} transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                className={`w-full max-w-[34px] rounded-t-lg ${d.today ? "bg-[#4361EE]" : d.count ? "bg-[#B9C4FA]" : "bg-slate-200"}`} />
              <span className={`text-[10.5px] font-bold ${d.today ? "text-[#4361EE]" : "text-slate-400"}`}>{d.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Rings */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center p-4">
          <Ring value={ins.acceptance.rate} label="accepted" tone="#10B981" />
          <p className="mt-3 text-center text-[12.5px] font-semibold text-slate-500">{ins.acceptance.accepted + ins.acceptance.rejected === 0 ? "No responses yet" : `${ins.acceptance.accepted} accepted · ${ins.acceptance.rejected} declined`}</p>
        </Card>
        <Card className="flex flex-col items-center p-4">
          <Ring value={ins.onTime.rate} label="on time" tone="#4361EE" />
          <p className="mt-3 text-center text-[12.5px] font-semibold text-slate-500">{ins.onTime.n === 0 ? "No arrivals yet" : `Arrived within ${15} min of plan · ${ins.onTime.n} trips`}</p>
        </Card>
      </div>

      {/* Reply speed */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Timer className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-extrabold">{ins.response.medianSec == null ? "No replies yet" : `You usually reply in ${durationLabel(ins.response.medianSec)}`}</p>
            <p className="text-[12.5px] font-medium text-slate-500">{ins.response.fastestSec == null ? "Accept or decline a job to see your speed." : `Fastest ${durationLabel(ins.response.fastestSec)} · across ${ins.response.n} response${ins.response.n === 1 ? "" : "s"}`}</p>
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><motion.div initial={{ width: 0 }} animate={{ width: `${respPct * 100}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" /></div>
        <div className="mt-1.5 flex justify-between text-[10.5px] font-bold text-slate-400"><span>Slow</span><span>Instant</span></div>
      </Card>

      {/* On the road */}
      <SectionTitle>On the road</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { icon: MapPinned, tone: "bg-[#EEF1FD] text-[#4361EE]", v: ins.road.km == null ? "—" : `${ins.road.km.toFixed(ins.road.km < 10 ? 1 : 0)}`, u: "km", l: "Travelled" },
          { icon: Clock3, tone: "bg-violet-50 text-violet-600", v: durationLabel(ins.road.travelSec), u: "", l: "Driving" },
          { icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600", v: durationLabel(ins.road.avgServiceSec), u: "", l: "Avg on site" },
        ].map((x) => (
          <Card key={x.l} className="p-3 text-center">
            <span className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ${x.tone}`}><x.icon className="h-5 w-5" /></span>
            <p className="mt-2 flex items-baseline justify-center gap-1 whitespace-nowrap font-extrabold leading-none tabular-nums" style={{ fontSize: fitFontSize(`${x.v}${x.u}`, 17, { fitAt: 6, min: 11 }) }}>{x.v}{x.u ? <span className="text-[11px] text-slate-400">{x.u}</span> : null}</p>
            <p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{x.l}</p>
          </Card>
        ))}
      </div>
      {ins.road.km == null ? <p className="px-1 text-[12px] font-medium text-slate-400">Distance appears after a journey with location sharing on.</p> : null}

      {/* Mix */}
      <Card className="p-4">
        <p className="text-[14px] font-extrabold">What you did</p>
        {mixTotal === 0 ? <p className="mt-2 text-[13px] text-slate-400">No completed jobs in this period.</p> : (
          <>
            <div className="mt-3 flex h-3.5 overflow-hidden rounded-full bg-slate-100">
              {([["pickup", "bg-[#4361EE]"], ["drop", "bg-emerald-500"], ["onsite", "bg-violet-500"], ["warranty_pickup", "bg-amber-500"], ["buyback", "bg-orange-500"]] as const).map(([k, c]) => ins.mix[k] ? <div key={k} className={c} style={{ width: `${(ins.mix[k] / mixTotal) * 100}%` }} /> : null)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] font-semibold text-slate-600">
              {(["pickup", "drop", "onsite", "warranty_pickup", "buyback"] as const).filter((k) => ins.mix[k]).map((k) => <span key={k}>{TYPE_LABEL[k]} <b className="text-slate-900">{ins.mix[k]}</b></span>)}
            </div>
          </>
        )}
      </Card>

      {/* Field sales */}
      <SectionTitle>Field sales</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="p-3 text-center"><Ticket className="mx-auto h-5 w-5 text-[#4361EE]" /><p className="mt-2"><FitNumber base={20} fitAt={5} min={11} className="font-extrabold">{ins.docs.tickets}</FitNumber></p><p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Tickets</p></Card>
        <Card className="p-3 text-center"><ReceiptText className="mx-auto h-5 w-5 text-emerald-600" /><p className="mt-2"><FitNumber base={20} fitAt={5} min={11} className="font-extrabold">{ins.docs.invoices}</FitNumber></p><p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Invoices</p></Card>
        <Card className="p-3 text-center"><IndianRupee className="mx-auto h-5 w-5 text-amber-500" /><p className="mt-2"><FitNumber base={20} fitAt={5} min={11} className="font-extrabold">{formatINR(ins.docs.collected).replace(/^₹\s?/, "")}</FitNumber></p><p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Collected</p></Card>
      </div>

      {/* Care */}
      <Card className="p-4">
        <div className="flex items-center gap-2"><TriangleAlert className="h-5 w-5 text-rose-500" /><p className="text-[14px] font-extrabold">Declines and problems</p></div>
        <p className="mt-1 text-[13px] font-medium text-slate-500">{ins.care.rejected} declined · {ins.care.problems} problem{ins.care.problems === 1 ? "" : "s"} reported</p>
        {ins.care.topReasons.length ? <div className="mt-3 flex flex-wrap gap-2">{ins.care.topReasons.map((r) => <span key={r.reason} className="rounded-full bg-rose-50 px-3 py-1 text-[12px] font-bold text-rose-700">{r.reason} · {r.count}</span>)}</div> : null}
      </Card>
    </div>
  );
}
