"use client";
/* Field Activity → one Field Engineer, full page (same record layout as View Lead).
   Overview · Attendance · Trips & reviews · Pay · Settings. Everything about one Ninja in one place:
   analyse the month, fix a reading, approve leave, change salary or their own plan. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Banknote, CalendarCheck2, Clock, Fuel, IndianRupee, Route, Settings2, Star, Wallet } from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { DetailField, DetailHero, DetailSection, SummaryCard } from "@/components/common/detail-page";
import { PinnedRail } from "@/components/common/pinned-rail";
import { useActivity } from "@/components/field/activity/activity-shell";
import { DayDialog } from "@/components/field/insights/attendance-section";
import { PayBreakdown, usePayRows } from "@/components/field/insights/pay-section";
import { PlanDialog, SalaryDialog } from "@/components/field/insights/pay-controls";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { formatClock } from "@/lib/time-format";
import { formatHm, localDateKey } from "@/lib/work-session";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, monthDays, type DayStatus, type MarkKind } from "@/lib/field-attendance";
import { describePlan, planFor, planRowFor, salaryFor } from "@/lib/field-incentives";
import { SEVERITY_LABEL, buildAttention, isBehindPace, projectedTrips, todayState, type Tone } from "@/lib/field-activity";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const dayLabel = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
const TONE: Record<Tone, string> = { green: "bg-emerald-50 text-emerald-700 ring-emerald-200", slate: "bg-zinc-100 text-zinc-600 ring-zinc-200", amber: "bg-amber-50 text-amber-800 ring-amber-200", violet: "bg-violet-50 text-violet-700 ring-violet-200", rose: "bg-rose-50 text-rose-700 ring-rose-200", sky: "bg-sky-50 text-sky-700 ring-sky-200" };
const CHIP: Record<DayStatus, string> = {
  present: "bg-emerald-50 text-emerald-700 ring-emerald-200", half_day: "bg-amber-50 text-amber-700 ring-amber-200", absent: "bg-rose-50 text-rose-700 ring-rose-200",
  week_off: "bg-zinc-100 text-zinc-600 ring-zinc-200", casual_leave: "bg-violet-50 text-violet-700 ring-violet-200", festival_leave: "bg-sky-50 text-sky-700 ring-sky-200",
  requested: "bg-amber-100 text-amber-800 ring-amber-300", pending: "bg-blue-50 text-blue-600 ring-blue-200", future: "text-zinc-300 ring-transparent" };
const SHORT: Record<DayStatus, string> = { present: "P", half_day: "½", absent: "A", week_off: "WO", casual_leave: "CL", festival_leave: "FL", requested: "R", pending: "·", future: "" };

type TripRow = { id: string; job_id: string; trip_no: string | null; trip_type: string; status: string; completed_at: string | null; scheduled_at: string | null;
  job: { customer: string | null; device: string | null; lead_type: string | null } | null; review: { rating: number; comment: string | null; channel: string } | null };
const TYPE: Record<string, string> = { pickup: "Pickup", drop: "Drop", onsite: "On-site", warranty_pickup: "Warranty pickup" };

const NO_STORES: string[] = [];
export function NinjaProfile({ id }: { id: string }) {
  const a = useActivity();
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermissions();
  const canEdit = allow(can, CAP.field.edit);
  const canManagePay = a.canManagePay;
  const { rows, roster, pay, ctx, closed, loading, err, load } = usePayRows(a.ym, a.tz, NO_STORES, false, "");
  const row = rows.find((r) => r.n.id === id);
  const tabs = [{ label: "Overview", value: "overview" }, { label: "Attendance", value: "attendance" }, { label: "Trips & reviews", value: "trips" }, ...(a.canPay ? [{ label: "Pay", value: "pay" }] : []), ...(canEdit || canManagePay ? [{ label: "Settings", value: "settings" }] : [])];
  const tab = tabs.some((t) => t.value === params.get("tab")) ? (params.get("tab") as string) : "overview";
  const setTab = (v: string) => router.replace(`/field/activity/${id}?tab=${v}`, { scroll: false });
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [dlg, setDlg] = useState<null | "salary" | "plan">(null);
  const isCurrent = a.ym === a.today.slice(0, 7);
  const dim = monthDays(a.ym).length, elapsed = isCurrent ? Number(a.today.slice(8)) : dim;
  const monthOpts = useMemo(() => Array.from({ length: 18 }, (_, i) => { const d = new Date(Number(a.today.slice(0, 4)), Number(a.today.slice(5, 7)) - 1 - i, 1); return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }; }), [a.today]);

  const [trips, setTrips] = useState<TripRow[] | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let off = false; setTrips(null);
    const days = monthDays(a.ym);
    const lo = new Date(new Date(`${days[0]}T00:00:00`).getTime() - 864e5).toISOString(), hi = new Date(new Date(`${days[days.length - 1]}T00:00:00`).getTime() + 2 * 864e5).toISOString();
    void supabase.from("field_trips").select("id,job_id,trip_no,trip_type,status,completed_at,scheduled_at,job:field_jobs(customer,device,lead_type),field_trip_reviews(rating,comment,channel)")
      .eq("ninja_id", id).or(`completed_at.gte.${lo},scheduled_at.gte.${lo}`).or(`completed_at.lt.${hi},completed_at.is.null`).order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => {
        if (off) return;
        const list = ((data ?? []) as any[]).map((t) => ({ ...t, job: Array.isArray(t.job) ? t.job[0] : t.job, review: (Array.isArray(t.field_trip_reviews) ? t.field_trip_reviews[0] : t.field_trip_reviews) ?? null }) as TripRow);
        setTrips(list.filter((t) => { const d = t.completed_at ?? t.scheduled_at; return d ? localDateKey(new Date(d).getTime(), a.tz).startsWith(a.ym) : false; }));
      });
    return () => { off = true; };
  }, [id, a.ym, a.tz]);

  if (err) return <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load this Ninja: {err}</p>;
  if (loading && !row) return <div className="space-y-4"><div className="h-40 animate-pulse rounded-2xl bg-muted" /><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!row || !roster || !pay) return (
    <div className="space-y-5"><BackPill href="/field/activity" label="Back" className="h-8 shrink-0 px-3 text-[12px]" />
      <p className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-[14px] text-muted-foreground">This Field Engineer was not found in the stores you can see.</p></div>
  );
  const { n, s, live, month, frozen } = row;
  const cell = month.days.find((d) => d.date === a.today);
  const state = todayState(cell);
  const revs = pay.reviews.filter((r) => r.staffId === id);
  const avg = revs.length ? revs.reduce((t, x) => t + x.rating, 0) / revs.length : null;
  const gate = live.gateTrips, behind = isBehindPace({ trips: live.trips, gate, elapsedDays: elapsed, daysInMonth: dim, running: isCurrent });
  const plan = planFor(ctx.plans, id, a.today);
  const items = buildAttention([{ staffId: id, name: n.name, month, trips: live.trips, gate, casualNoticeDays: plan.casualNoticeDays, requests: roster.marks.filter((m) => m.staffId === id && m.status === "requested") }],
    { today: a.today, ym: a.ym, hourNow: new Date().getHours(), running: isCurrent, elapsedDays: elapsed, daysInMonth: dim });
  const mark = (d: string) => roster.marks.find((m) => m.staffId === id && m.day === d);
  const open = dayOpen ? month.days.find((d) => d.date === dayOpen) : null;

  async function setMark(day: string, kind: MarkKind | null, existing?: { id?: string }) {
    if (!supabase) return;
    let error;
    if (kind == null) { if (existing?.id) ({ error } = await supabase.from("field_attendance_marks").delete().eq("id", existing.id)); }
    else if (existing?.id) ({ error } = await supabase.from("field_attendance_marks").update({ kind, status: "approved" }).eq("id", existing.id));
    else ({ error } = await supabase.from("field_attendance_marks").insert({ staff_id: id, day, kind, status: "approved" }));
    if (error) toast.error("Could not save the mark."); else { toast.success("Saved."); setDayOpen(null); void load(); }
  }
  async function decide(m: { id?: string }, approve: boolean) {
    if (!supabase || !m.id) return;
    const { error } = await supabase.from("field_attendance_marks").update({ status: approve ? "approved" : "rejected" }).eq("id", m.id);
    if (error) toast.error("Could not save the decision."); else { toast.success(approve ? "Leave approved." : "Leave rejected."); setDayOpen(null); void load(); }
  }
  async function setWeeklyOff(v: string) {
    if (!supabase) return;
    const { error } = v === "" ? await supabase.from("field_weekly_off").delete().eq("staff_id", id) : await supabase.from("field_weekly_off").upsert({ staff_id: id, weekday: Number(v), updated_at: new Date().toISOString() }, { onConflict: "staff_id" });
    if (error) toast.error("Could not save."); else { toast.success("Saved."); void load(); }
  }
  const salaryNow = salaryFor(ctx.salaries, id, a.today);
  const planRow = planRowFor(ctx.plans, id, a.today);
  const ownPlan = !!planRow && planRow.staffId === id;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <BackPill href="/field/activity" label="Back" className="h-8 shrink-0 px-3 text-[12px]" />
        <div className="ml-auto w-[170px]"><Select className="h-[36px]" value={a.ym} onChange={(e) => a.setYm(e.target.value)} options={monthOpts} /></div>
      </div>

      <DetailHero>
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#4361EE] to-[#2F46C4] text-[24px] font-extrabold text-white shadow-lg ring-2 ring-white">{n.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[24px] font-extrabold leading-tight">{n.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              <span>Field Engineer</span>
              {isCurrent && <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", TONE[state.tone])}>{state.label}</span>}
              {avg != null && <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{avg.toFixed(1)} · {revs.length}</span>}
              {frozen && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">Month closed</span>}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Trips" value={`${live.trips} / ${gate}`} tone={live.gatePassed ? "text-emerald-700" : behind ? "text-rose-700" : undefined} />
          <SummaryCard label="Days worked" value={month.summary.present + month.summary.halfDay} />
          <SummaryCard label="Distance" value={`${month.summary.totalKm.toLocaleString("en-IN")} km`} />
          <SummaryCard label="Reviews" value={avg != null ? `${avg.toFixed(1)} ★ (${revs.length})` : "—"} />
          {a.canPay && <SummaryCard label={frozen ? "Final pay" : "Earned so far"} value={inr(s.total)} />}
        </div>
      </DetailHero>

      <SegmentedTabs size="md" value={tab} onChange={setTab} options={tabs} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {tab === "overview" && <>
            <DetailSection icon={CalendarCheck2} title={`${MONTHS[Number(a.ym.slice(5)) - 1]} ${a.ym.slice(0, 4)} at a glance`} accent="blue">
              <div className="flex flex-wrap gap-1.5">
                {month.days.map((d) => (
                  <button key={d.date} onClick={() => setDayOpen(d.date)} title={`${dayLabel(d.date)} · ${STATUS_LABEL[d.status]}${d.km != null ? ` · ${d.km} km` : ""}`}
                    className={cn("relative grid h-10 w-10 place-items-center rounded-lg text-[11px] font-bold ring-1 ring-inset transition hover:scale-105", CHIP[d.status], d.date === a.today && "outline outline-2 outline-[#4361EE]")}>
                    <span className="absolute left-1 top-0.5 text-[8px] font-semibold opacity-60">{Number(d.date.slice(8))}</span>{SHORT[d.status]}
                    {(d.missingReading || d.missingPhoto || d.kmFlag) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white" />}
                    {d.kmCheck && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-600 ring-1 ring-white" />}
                  </button>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                <DetailField label="Present" value={month.summary.present} flat /><DetailField label="Half days" value={month.summary.halfDay} flat /><DetailField label="Absent" value={month.summary.absent} flat />
                <DetailField label="Week off" value={month.summary.weekOff} flat /><DetailField label="Casual leave" value={month.summary.casualLeave} flat /><DetailField label="Festival leave" value={month.summary.festivalLeave} flat />
                <DetailField label="Distance" value={`${month.summary.totalKm.toLocaleString("en-IN")} km`} flat /><DetailField label="Fuel" value={inr(month.summary.fuel)} flat />
                <DetailField label="Pace" value={live.gatePassed ? "Target reached" : isCurrent ? `About ${projectedTrips(live.trips, elapsed, dim)} by month end` : `${live.trips} trips`} flat />
              </div>
            </DetailSection>
            <DetailSection icon={Clock} title="Latest trips" accent="indigo" delay={0.05}>
              <TripsTable trips={(trips ?? []).slice(0, 6)} loading={trips == null} compact />
              {(trips?.length ?? 0) > 6 && <button onClick={() => setTab("trips")} className="mt-3 text-[12.5px] font-semibold text-[#4361EE] hover:underline">See all {trips!.length} trips</button>}
            </DetailSection>
          </>}

          {tab === "attendance" && (
            <DetailSection icon={CalendarCheck2} title="Day by day" accent="blue">
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="rox-zebra w-full text-[14.5px]">
                  <thead className="bg-[#EEF1FD] text-[10.5px] font-bold uppercase tracking-wider text-[#4361EE]"><tr>{["Day", "Status", "Punch in – out", "Worked", "Odometer", "Km", "GPS", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left">{h}</th>)}</tr></thead>
                  <tbody>
                    {[...month.days].filter((d) => d.status !== "future" || d.markKind).reverse().map((d) => (
                      <tr key={d.date} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-3.5 font-semibold">{dayLabel(d.date)}</td>
                        <td className="px-3 py-3"><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", CHIP[d.status])}>{STATUS_LABEL[d.status]}</span></td>
                        <td className="px-3 py-3 text-muted-foreground">{d.punchIn ? `${formatClock(d.punchIn, { timeZone: a.tz })} – ${d.punchOut ? formatClock(d.punchOut, { timeZone: a.tz }) : "on duty"}` : "—"}</td>
                        <td className="px-3 py-3 tabular-nums">{d.netMs ? formatHm(d.netMs) : "—"}</td>
                        <td className="px-3 py-3 tabular-nums text-muted-foreground">{d.startReading != null ? `${d.startReading} → ${d.endReading ?? "…"}` : d.missingReading ? <span className="font-semibold text-amber-700">No reading</span> : "—"}</td>
                        <td className="px-3 py-3 tabular-nums font-semibold">{d.km ?? "—"}</td>
                        <td className="px-3 py-3 tabular-nums">{d.gpsKm ?? "—"}{d.kmCheck && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-rose-600" />}</td>
                        <td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setDayOpen(d.date)}>Open</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>
          )}

          {tab === "trips" && <>
            <DetailSection icon={Star} title="Reviews" accent="violet">
              <ReviewSummary reviews={(trips ?? []).filter((t) => t.review).map((t) => t.review!)} />
            </DetailSection>
            <DetailSection icon={Route} title={`Trips · ${trips?.length ?? "…"}`} accent="indigo" delay={0.05}>
              <TripsTable trips={trips ?? []} loading={trips == null} />
            </DetailSection>
          </>}

          {tab === "pay" && a.canPay && (
            <DetailSection icon={Banknote} title="Payslip" accent="emerald">
              <PayBreakdown ninja={n} ym={a.ym} tz={a.tz} today={a.today} nowMs={Date.now()} roster={roster} pay={pay} ctx={ctx} canManage={canManagePay} frozen={closed?.lines.get(id) ?? null} closedAt={closed?.closedAt ?? null} onChanged={() => void load()} />
            </DetailSection>
          )}

          {tab === "settings" && <>
            {a.canPay && <DetailSection icon={Wallet} title="Salary" accent="emerald" action={canManagePay ? <Button size="sm" variant="outline" onClick={() => setDlg("salary")}>Change salary…</Button> : undefined}>
              <div className="grid grid-cols-2 gap-4"><DetailField label="Monthly salary today" value={salaryNow ? inr(salaryNow) : "Not set"} highlight /><DetailField label="Changes are dated" value="They start on the day you pick" /></div>
              <div className="mt-4 divide-y divide-border rounded-xl border border-border">
                {ctx.salaries.filter((x) => x.staffId === id).sort((p, q) => q.effectiveFrom.localeCompare(p.effectiveFrom)).map((x) => <div key={x.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]"><span className="w-[120px] font-semibold">From {dayLabel(x.effectiveFrom)}</span><b className="tabular-nums">{inr(x.monthlySalary)}</b><span className="min-w-0 flex-1 truncate text-muted-foreground">{x.note ?? ""}</span>{x.effectiveFrom > a.today && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Scheduled</span>}</div>)}
                {!ctx.salaries.some((x) => x.staffId === id) && <p className="px-3.5 py-3 text-[12.5px] text-muted-foreground">No salary history yet.</p>}
              </div>
            </DetailSection>}
            {a.canPay && <DetailSection icon={IndianRupee} title="Incentive plan" accent="amber" delay={0.05} action={canManagePay ? <Button size="sm" variant="outline" onClick={() => setDlg("plan")}>{ownPlan ? "Edit this Ninja's plan…" : "Give this Ninja their own plan…"}</Button> : undefined}>
              <p className="mb-3 text-[12.5px] text-muted-foreground">{ownPlan ? `${n.name.split(" ")[0]} follows their own plan (from ${dayLabel(planRow!.effectiveFrom)}).` : `${n.name.split(" ")[0]} follows the company plan.`}</p>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted-foreground">{describePlan(plan).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </DetailSection>}
            <DetailSection icon={Settings2} title="Attendance" accent="blue" delay={0.1}>
              <label className="block max-w-[260px]"><span className="mb-1 block text-[12px] font-semibold">Weekly off day</span>
                <Select className="h-[38px]" disabled={!canEdit} value={roster.weeklyOff.has(id) ? String(roster.weeklyOff.get(id)) : ""} onChange={(e) => void setWeeklyOff(e.target.value)}
                  options={[{ label: "None", value: "" }, ...WEEKDAYS.map((w, i) => ({ label: w, value: String(i) }))]} /></label>
              <p className="mt-2 text-[12px] text-muted-foreground">On this day a Ninja without a shift is counted as Week Off, not Absent. Click any day in Attendance to correct a reading or mark leave.</p>
            </DetailSection>
          </>}
        </div>

        <PinnedRail>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Needs attention</p>
            {items.length === 0 ? <p className="mt-3 text-[13px] text-muted-foreground">Nothing for {n.name.split(" ")[0]} right now.</p> : (
              <ul className="mt-3 space-y-3">{items.map((it) => <li key={it.id} className="text-[12.5px]"><span className="block leading-snug">{it.text}</span><span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{SEVERITY_LABEL[it.severity]}</span></li>)}</ul>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fuel & distance</p>
            <div className="mt-3 space-y-2 text-[13px]"><p className="flex justify-between"><span className="text-muted-foreground">Distance</span><b>{month.summary.totalKm.toLocaleString("en-IN")} km</b></p><p className="flex justify-between"><span className="text-muted-foreground">Fuel</span><b className="inline-flex items-center gap-1"><Fuel className="h-3.5 w-3.5 text-amber-600" />{inr(month.summary.fuel)}</b></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Missing readings</span><b className={month.summary.missingReadings ? "text-amber-700" : ""}>{month.summary.missingReadings}</b></p></div>
            <Link href="/field/activity/distance" className="mt-3 block text-[12.5px] font-semibold text-[#4361EE] hover:underline">Open Distance & fuel</Link>
          </div>
        </PinnedRail>
      </div>

      {open && <DayDialog ninja={{ id, name: n.name, branchId: n.branchId, status: n.status }} cell={open} tz={a.tz} policy={roster.policy} canManage={canEdit}
        mark={mark(open.date)} onClose={() => setDayOpen(null)} onMark={(k, ex) => void setMark(open.date, k, ex)} onDecide={(m, ok) => void decide(m, ok)} onSaved={() => { setDayOpen(null); void load(); }} />}
      {dlg === "salary" && <SalaryDialog ninja={{ id, name: n.name }} today={a.today} salaries={ctx.salaries} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load(); }} />}
      {dlg === "plan" && <PlanDialog scope={{ staffId: id, name: n.name }} today={a.today} plans={ctx.plans} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load(); }} />}
    </div>
  );
}

function Stars({ n }: { n: number }) { return <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("h-3.5 w-3.5", i <= n ? "fill-amber-400 text-amber-400" : "text-zinc-300")} />)}</span>; }

function ReviewSummary({ reviews }: { reviews: { rating: number; comment: string | null; channel: string }[] }) {
  if (reviews.length === 0) return <p className="text-[13px] text-muted-foreground">No customer reviews this month yet.</p>;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, c: reviews.filter((r) => r.rating === s).length }));
  const avg = reviews.reduce((t, r) => t + r.rating, 0) / reviews.length;
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[170px_1fr]">
      <div><p className="text-[36px] font-extrabold leading-none tabular-nums">{avg.toFixed(1)}</p><Stars n={Math.round(avg)} /><p className="mt-1 text-[12px] text-muted-foreground">{reviews.length} review{reviews.length === 1 ? "" : "s"}</p></div>
      <div className="space-y-1.5">{dist.map((d) => <div key={d.s} className="flex items-center gap-2 text-[12px]"><span className="w-6 tabular-nums">{d.s}★</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(d.c / reviews.length) * 100}%` }} /></div><span className="w-6 text-right tabular-nums text-muted-foreground">{d.c}</span></div>)}</div>
      <ul className="space-y-2 sm:col-span-2">{reviews.filter((r) => r.comment).slice(0, 6).map((r, i) => <li key={i} className="rounded-xl bg-muted/40 px-3.5 py-2.5 text-[12.5px]"><Stars n={r.rating} /> <span className="ml-1">“{r.comment}”</span></li>)}</ul>
    </div>
  );
}

function TripsTable({ trips, loading, compact }: { trips: TripRow[]; loading: boolean; compact?: boolean }) {
  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
  if (trips.length === 0) return <p className="text-[13px] text-muted-foreground">No trips this month.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="rox-zebra w-full text-[14.5px]">
        <thead className="bg-[#EEF1FD] text-[10.5px] font-bold uppercase tracking-wider text-[#4361EE]"><tr>{["Trip", "Type", "Customer", "Device", "Status", "Review"].map((h) => <th key={h} className="px-3 py-2.5 text-left">{h}</th>)}</tr></thead>
        <tbody>
          {trips.map((t) => (
            <tr key={t.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-3 py-3 font-semibold"><Link href={`/field/${t.job_id}`} className="text-[#4361EE] hover:underline">{t.trip_no ?? "Trip"}</Link></td>
              <td className="px-3 py-3">{t.job?.lead_type === "buyback" ? "Buyback" : TYPE[t.trip_type] ?? t.trip_type}</td>
              <td className="max-w-[160px] truncate px-3 py-3">{t.job?.customer ?? "—"}</td>
              <td className="max-w-[160px] truncate px-3 py-3 text-muted-foreground">{t.job?.device ?? "—"}</td>
              <td className="px-3 py-3"><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", t.status === "completed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : ["cancelled", "failed_attempt", "customer_unavailable"].includes(t.status) ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200")}>{t.status.replace(/_/g, " ")}</span></td>
              <td className="px-3 py-3">{t.review ? <Stars n={t.review.rating} /> : <span className="text-zinc-300">{compact ? "—" : t.status === "completed" ? "Not rated" : "—"}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
