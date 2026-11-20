"use client";
/* Field Activity → Team today. One card per Field Engineer (status, today, month progress, reviews, earnings)
   and a "Needs attention" inbox. Derived from the attendance + pay engines; nothing is stored here. */
import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Camera, CheckCircle2, Gauge, Lock, Route, Star, TrendingDown, Truck, UserCheck, UserX } from "lucide-react";
import { KpiStrip, LoadError } from "@/components/field/activity/kit";
import { useActivity } from "@/components/field/activity/activity-shell";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { usePayRows } from "@/components/field/insights/pay-section";
import { Panel } from "@/components/field/overview/widgets";
import { cn } from "@/lib/utils";
import { monthDays } from "@/lib/field-attendance";
import { planFor } from "@/lib/field-incentives";
import { buildAttention, isBehindPace, projectedTrips, SEVERITY_LABEL, todayState, type AttentionItem, type AttentionKind, type Tone } from "@/lib/field-activity";

const TONE: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200", slate: "bg-zinc-100 text-zinc-600 ring-zinc-200", amber: "bg-amber-50 text-amber-800 ring-amber-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200", rose: "bg-rose-50 text-rose-700 ring-rose-200", sky: "bg-sky-50 text-sky-700 ring-sky-200" };
const ICON: Record<AttentionKind, React.ComponentType<{ className?: string }>> = {
  leave_request: CalendarClock, no_shift: UserX, missing_reading: Gauge, missing_photo: Camera, gps_check: Route, behind_pace: TrendingDown, close_month: Lock };
const SEV: Record<1 | 2 | 3, string> = { 1: "bg-rose-50 text-rose-700", 2: "bg-amber-50 text-amber-800", 3: "bg-zinc-100 text-zinc-600" };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function TeamToday() {
  const a = useActivity();
  const { stores } = useFieldDashboard();
  const { rows, results, pay, roster, ctx, closed, loading, err } = usePayRows(a.ym, a.tz, a.storeSel, a.multiStore, a.q);
  const isCurrent = a.ym === a.today.slice(0, 7);
  const dim = monthDays(a.ym).length;
  const elapsed = isCurrent ? Number(a.today.slice(8)) : dim;
  const stat = useMemo(() => rows.map((r) => {
    const cell = r.month.days.find((d) => d.date === a.today);
    const dayRow = r.live.days.find((d) => d.date === a.today);
    const revs = (pay?.reviews ?? []).filter((x) => x.staffId === r.n.id);
    const gate = r.live.gateTrips;
    return {
      r, state: todayState(cell), todayTrips: dayRow?.tripsCounted ?? 0, todayKm: cell?.km ?? null,
      reviews: revs.length, avg: revs.length ? revs.reduce((t, x) => t + x.rating, 0) / revs.length : null,
      projected: projectedTrips(r.live.trips, elapsed, dim), behind: isBehindPace({ trips: r.live.trips, gate, elapsedDays: elapsed, daysInMonth: dim, running: isCurrent }),
      store: stores.find((s) => s.id === r.n.branchId)?.name ?? null,
    };
  }), [rows, pay, a.today, elapsed, dim, isCurrent, stores]);

  const items = useMemo<AttentionItem[]>(() => {
    if (!roster) return [];
    const reqs = (id: string) => roster.marks.filter((m) => m.staffId === id && m.status === "requested");
    const out = buildAttention(rows.map((r) => ({ staffId: r.n.id, name: r.n.name, month: r.month, trips: r.live.trips, gate: r.live.gateTrips, requests: reqs(r.n.id), casualNoticeDays: planFor(ctx.plans, r.n.id, a.today).casualNoticeDays })),
      { today: a.today, ym: a.ym, hourNow: new Date().getHours(), running: isCurrent, elapsedDays: elapsed, daysInMonth: dim });
    if (a.canPay && !isCurrent && a.ym < a.today.slice(0, 7) && !closed && results.length > 0)
      out.unshift({ id: "close", kind: "close_month", severity: 2, staffId: "", name: "Payroll", text: `This month is over and not closed yet. Close it to freeze the payslips.`, href: "/field/activity/pay", pay: true });
    return out;
  }, [roster, rows, ctx.plans, a.today, a.ym, a.canPay, isCurrent, elapsed, dim, closed, results.length]);

  const onDuty = stat.filter((x) => x.state.label === "On duty").length;
  const tripsToday = stat.reduce((t, x) => t + x.todayTrips, 0);
  const kmToday = stat.reduce((t, x) => t + (x.todayKm ?? 0), 0);
  const requests = items.filter((i) => i.kind === "leave_request").length;
  const countFor = (id: string) => items.filter((i) => i.staffId === id).length;

  if (err) return <LoadError what="the team" err={err} />;
  return (
    <div className="space-y-6">
      <KpiStrip loading={loading} items={isCurrent ? [
        { label: "On duty now", value: onDuty, sub: `of ${rows.length} Ninja${rows.length === 1 ? "" : "s"}`, icon: UserCheck, tone: onDuty ? "good" : "default" },
        { label: "Trips today", value: tripsToday, sub: "completed, long trips counted extra", icon: Truck },
        { label: "Km today", value: kmToday.toLocaleString("en-IN"), sub: "from odometer readings", icon: Route },
        { label: "Needs attention", value: items.length, sub: requests ? `${requests} leave request${requests === 1 ? "" : "s"}` : items.length ? "see the list on the right" : "all clear", icon: AlertTriangle, tone: items.length ? "warn" : "good" },
      ] : [
        { label: "Ninjas", value: rows.length, icon: UserCheck },
        { label: "Trips in the month", value: rows.reduce((t, x) => t + x.live.trips, 0), icon: Truck },
        { label: "Km in the month", value: rows.reduce((t, x) => t + x.live.km, 0).toLocaleString("en-IN"), icon: Route },
        { label: "Needs attention", value: items.length, sub: items.length ? "see the list on the right" : "all clear", icon: AlertTriangle, tone: items.length ? "warn" : "good" },
      ]} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {stat.map(({ r, state, todayTrips, todayKm, reviews, avg, projected, behind, store }) => {
              const gate = r.live.gateTrips, pct = Math.min(100, (r.live.trips / Math.max(1, gate)) * 100);
              const n = countFor(r.n.id);
              return (
                <Link key={r.n.id} href={`/field/activity/${r.n.id}`} className="group block rounded-2xl border-2 border-zinc-200 bg-card p-5 shadow-card transition hover:border-[#4361EE]/40 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#4361EE] to-[#2F46C4] text-[16px] font-extrabold text-white">{r.n.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-extrabold">{r.n.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{a.multiStore && store ? store : "Field Engineer"}</p>
                    </div>
                    {isCurrent && <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", TONE[state.tone])}>{state.label}</span>}
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-[22px] font-extrabold tabular-nums">{isCurrent ? todayTrips : r.live.trips}</p><p className="text-[11px] font-semibold text-muted-foreground">{isCurrent ? "Trips today" : "Trips"}</p></div>
                    <div><p className="text-[22px] font-extrabold tabular-nums">{isCurrent ? (todayKm ?? "—") : r.live.km}</p><p className="text-[11px] font-semibold text-muted-foreground">Km</p></div>
                    <div><p className="flex items-center justify-center gap-1 text-[22px] font-extrabold tabular-nums">{avg != null ? avg.toFixed(1) : "—"}{avg != null && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}</p><p className="text-[11px] font-semibold text-muted-foreground">{reviews} review{reviews === 1 ? "" : "s"}</p></div>
                  </div>
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between text-[12px]"><span className="font-semibold">Month target</span><span className="tabular-nums text-muted-foreground"><b className="text-foreground">{r.live.trips}</b> / {gate}</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", r.live.gatePassed ? "bg-emerald-500" : behind ? "bg-rose-500" : "bg-amber-500")} style={{ width: `${pct}%` }} /></div>
                    {isCurrent && <p className={cn("mt-1.5 text-[11.5px]", behind ? "font-semibold text-rose-700" : "text-muted-foreground")}>{r.live.gatePassed ? "Target reached" : behind ? `On pace for about ${projected}` : `Pace: about ${projected} by month end`}</p>}
                  </div>
                  <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 text-[12.5px]">
                    {a.canPay ? <span className="font-bold">{inr(r.s.total)}<span className="ml-1 font-normal text-muted-foreground">{r.frozen ? "final" : "earned"}</span></span> : <span className="text-muted-foreground">{r.live.rawTrips} trips this month</span>}
                    {a.canPay && r.live.locked > 0 && <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-700"><Lock className="h-3 w-3" />{inr(r.live.locked)} locked</span>}
                    {n > 0 && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"><AlertTriangle className="h-3 w-3" />{n}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
          {stat.length === 0 && <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-[13px] text-muted-foreground">{loading ? "Loading the team…" : "No Ninjas found for the stores and search you chose."}</p>}
        </div>

        <div className="xl:sticky xl:top-[88px] xl:self-start">
          <Panel className="h-auto" title="Needs attention" icon={AlertTriangle} bodyClassName="p-0">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center"><CheckCircle2 className="h-9 w-9 text-emerald-500" /><p className="text-[14px] font-extrabold">All clear</p><p className="text-[12.5px] text-muted-foreground">No leave requests, missing readings or pace problems right now.</p></div>
            ) : (
              <ul className="max-h-[640px] divide-y divide-border overflow-auto">
                {items.map((it) => { const I = ICON[it.kind]; return (
                  <li key={it.id}>
                    <Link href={it.href} className="flex items-start gap-3 px-5 py-4 transition hover:bg-muted/40">
                      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", SEV[it.severity])}><I className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[13px] font-bold">{it.name}</span><span className="block text-[12.5px] leading-snug text-muted-foreground">{it.text}</span>
                        <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", SEV[it.severity])}>{SEVERITY_LABEL[it.severity]}</span></span>
                    </Link>
                  </li>); })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
