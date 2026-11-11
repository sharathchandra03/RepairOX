"use client";
/* RepairOX — Field overview widgets. One card frame (matches the Lead dashboard
   SectionCard), meaningful empty states, equal-height rows, real data only. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ChevronRight, History, Lightbulb, MapPin,
  Plus, Trophy, Truck, UserCheck, Users, Activity, BarChart3, Package, ClipboardList, Recycle, Boxes, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedTabs } from "@/components/ui/tabs";
import { formatWhen } from "@/lib/activity-log";
import { FIELD_STATUS_LABEL, FIELD_STATUS_TONE, FIELD_LEAD_TYPE_LABEL, FIELD_LEAD_TYPE_TONE, normaliseLeadType, accentColor } from "@/lib/field-data";
import { DASHBOARDS, useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { inr } from "@/components/field/dashboard/dashboard-table";
import type { FieldOverview } from "@/components/field/overview/use-field-overview";
import { dailySeries, leaderboard, completionRateOf, type AttentionTone, type LeaderPeriod, type LeaderMetric } from "@/lib/field-overview";
import type { DashRow } from "@/lib/field-dashboard";

/* ─── frame ─── */
export function Panel({ title, icon: Icon, action, children, className, bodyClassName }: {
  title: string; icon: React.ComponentType<{ className?: string }>; action?: React.ReactNode;
  children: React.ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn("flex h-full flex-col rounded-2xl border-[2.2px] border-[#B3BFF6]/50 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]", className)}>
      <header className="flex items-center justify-between gap-2.5 border-b border-border/70 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-4 w-4" /></span>
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-foreground">{title}</h2>
        </div>
        {action}
      </header>
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
const LinkAction = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">{children} <ChevronRight className="h-3.5 w-3.5" /></Link>
);
function Empty({ icon: Icon, title, text, cta }: { icon: React.ComponentType<{ className?: string }>; title: string; text?: string; cta?: React.ReactNode }) {
  return (
    <div className="flex min-h-[120px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-5 w-5" /></span>
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      {text && <p className="max-w-xs text-[12px] text-muted-foreground">{text}</p>}
      {cta}
    </div>
  );
}

/* ─── Needs attention ─── */
const ATTN_TONE: Record<AttentionTone, { chip: string; dot: string }> = {
  rose: { chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  amber: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  violet: { chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  sky: { chip: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  slate: { chip: "bg-zinc-100 text-zinc-700 ring-zinc-200", dot: "bg-zinc-400" },
};
export function AttentionPanel({ o }: { o: FieldOverview }) {
  const router = useRouter();
  return (
    <Panel title="Needs attention" icon={AlertTriangle}
      action={o.attentionJobCount > 0 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-200">{o.attentionJobCount} trip{o.attentionJobCount > 1 ? "s" : ""}</span> : undefined}>
      {o.attention.length === 0 ? (
        <Empty icon={CheckCircle2} title="All clear" text="No delayed, failed or unassigned trips right now." />
      ) : (
        <ul className="space-y-2">
          {o.attention.map((a) => (
            <li key={a.key}>
              <button onClick={() => router.push(`/field?attn=${a.key}`)} title={a.hint}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-left transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/50">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", ATTN_TONE[a.tone].dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{a.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{a.hint}</span>
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums ring-1 ring-inset", ATTN_TONE[a.tone].chip)}>{a.count}</span>
                <ChevronRight className="h-4 w-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ─── Today's schedule ─── */
export function TodayPanel({ o, canCreate }: { o: FieldOverview; canCreate: boolean }) {
  const router = useRouter();
  return (
    <Panel title="Today's schedule" icon={CalendarClock}
      action={<LinkAction href="/field">Open trips</LinkAction>}
      bodyClassName="p-0">
      {o.today.length === 0 ? (
        <div className="flex h-full items-center justify-center p-5">
          <Empty icon={CalendarClock} title="No visits scheduled today" text="Trips with today's date show here, in time order."
            cta={canCreate ? <button onClick={() => router.push("/field?new=1")} className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#4361EE] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#3450D8]"><Plus className="h-3.5 w-3.5" /> New field assignment</button> : undefined} />
        </div>
      ) : (
        <ul className="max-h-[300px] divide-y divide-border/70 overflow-y-auto">
          {o.today.map((e) => {
            const lt = normaliseLeadType(e.job.leadType);
            return (
              <li key={`${e.job.id}:${e.leg}`}>
                <button onClick={() => router.push(`/field/${e.job.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-muted/40">
                  <span className={cn("w-[58px] shrink-0 rounded-lg px-2 py-1 text-center text-[12px] font-bold tabular-nums", e.time ? "bg-[#EEF1FD] text-[#4361EE]" : "bg-muted text-muted-foreground")}>{e.time || "Any"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold">{e.job.customer || "Customer"}</span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", FIELD_LEAD_TYPE_TONE[lt])}>{e.leg === "drop" ? "Drop" : FIELD_LEAD_TYPE_LABEL[lt]}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{e.job.pickupAddress || "No address"}{e.job.pincode ? ` – ${e.job.pincode}` : ""}</span>
                    </span>
                  </span>
                  <span className="hidden min-w-0 shrink-0 text-right sm:block sm:w-[110px]">
                    <span className="block truncate text-[12px] font-medium">{e.job.ninjaName || <span className="italic text-zinc-400">Unassigned</span>}</span>
                    <span className="block text-[10.5px] tabular-nums text-muted-foreground">{e.job.jobNo}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[e.job.status])}>{FIELD_STATUS_LABEL[e.job.status]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ─── Engineer workload ─── */
export function WorkloadPanel({ o }: { o: FieldOverview }) {
  const router = useRouter();
  const max = Math.max(1, ...o.workload.rows.map((r) => r.open));
  return (
    <Panel title="Engineer workload" icon={UserCheck}
      action={o.workload.unassigned > 0 ? (
        <button onClick={() => router.push("/field?queue=pending_assignment")} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
          {o.workload.unassigned} unassigned
        </button>
      ) : undefined}>
      {o.workload.rows.length === 0 ? (
        <Empty icon={Users} title="No engineers yet" text="Field Engineers appear here once they hold trips, or when they have the Ninja role." />
      ) : (
        <ul className="space-y-3.5">
          {o.workload.rows.slice(0, 8).map((r) => (
            <li key={r.id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <button onClick={() => router.push(`/field?fe=${r.id}&excl=cancelled`)} className="flex min-w-0 items-center gap-2 text-left">
                  <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentColor(r.name) }} />
                  <span className="truncate text-[13px] font-semibold hover:text-[#4361EE]">{r.name}</span>
                  {r.free && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">Free</span>}
                </button>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  <strong className="text-foreground">{r.open}</strong> open · {r.today} today · {r.doneThisMonth} done this month
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-gradient-to-r from-[#4361EE] to-[#7C8CF5] transition-[width] duration-500" style={{ width: `${Math.round((r.open / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ─── Trend (7 / 14 / 30 days · trips or business) — SVG, no chart lib ─── */
export function TrendPanel({ o }: { o: FieldOverview }) {
  const [days, setDays] = useState<"7" | "14" | "30">("14");
  const [metric, setMetric] = useState<"trips" | "business">("trips");
  const n = Number(days);
  const series = useMemo(() => dailySeries(o.jobs, o.ctx, n, o.now), [o.jobs, o.ctx, o.now, n]);
  const total = series.reduce((x, p) => x + p.scheduled, 0);
  const done = series.reduce((x, p) => x + p.completed, 0);
  const biz = series.reduce((x, p) => x + p.business, 0);
  const rate = total ? Math.round((done / total) * 100) : null;
  const val = (p: (typeof series)[number]) => (metric === "trips" ? p.scheduled : p.business);
  const max = Math.max(1, ...series.map(val));
  const W = 560, H = 230, padL = 4, padB = 22, bw = (W - padL) / series.length;
  const chartH = H - padB;
  const step = n <= 7 ? 1 : n <= 14 ? 2 : 5;
  const empty = metric === "trips" ? total === 0 : biz === 0;
  return (
    <Panel title={`Last ${n} days`} icon={BarChart3} className="h-full" bodyClassName="flex flex-col"
      action={<LinkAction href="/field/reports">Full report</LinkAction>}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs size="sm" value={days} onChange={(v) => setDays(v as "7" | "14" | "30")} options={[{ label: "7 days", value: "7" }, { label: "14 days", value: "14" }, { label: "30 days", value: "30" }]} />
        <SegmentedTabs size="sm" value={metric} onChange={(v) => setMetric(v as "trips" | "business")} options={[{ label: "Trips", value: "trips" }, { label: "Business", value: "business" }]} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> Scheduled <strong className="tabular-nums">{total}</strong></span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Completed <strong className="tabular-nums">{done}</strong></span>
        <span className="text-muted-foreground">Completion <strong className="tabular-nums text-foreground">{rate != null ? `${rate}%` : "—"}</strong></span>
        <span className="text-muted-foreground">Business <strong className="tabular-nums text-emerald-700">{biz > 0 ? inr(biz) : "—"}</strong></span>
      </div>
      <div className="relative flex flex-1 items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[290px] w-full" role="img" aria-label={`${metric === "trips" ? "Trips" : "Business"} per day, last ${n} days`}>
          {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={padL} x2={W} y1={chartH - chartH * g} y2={chartH - chartH * g} stroke="currentColor" className="text-border" strokeDasharray="3 4" />)}
          <line x1={padL} x2={W} y1={chartH} y2={chartH} stroke="currentColor" className="text-border" />
          {series.map((p, i) => {
            const x = padL + i * bw;
            const hs = (val(p) / max) * chartH;
            const hc = metric === "trips" ? (p.completed / max) * chartH : 0;
            return (
              <g key={p.date}>
                <title>{`${p.label}: ${p.scheduled} scheduled · ${p.completed} completed${p.business ? ` · ${inr(p.business)}` : ""}`}</title>
                <rect x={x + bw * 0.14} y={chartH - hs} width={bw * 0.72} height={hs} rx="3" className={metric === "trips" ? "fill-sky-300" : "fill-emerald-500"} />
                {hc > 0 && <rect x={x + bw * 0.14} y={chartH - hc} width={bw * 0.72} height={hc} rx="3" className="fill-emerald-500" />}
                {i % step === (series.length - 1) % step ? <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>{p.label}</text> : null}
              </g>
            );
          })}
        </svg>
        {empty && (
          <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[12px] text-muted-foreground">
            {metric === "trips" ? `No trips in the last ${n} days` : `No finalized invoices in the last ${n} days`}
            {days !== "30" && <span className="pointer-events-auto"> · <button className="font-semibold text-[#4361EE] hover:underline" onClick={() => setDays("30")}>try 30 days</button></span>}
          </p>
        )}
      </div>
    </Panel>
  );
}

/* ─── Leaderboard (scope · period · metric) ─── */
const PERIOD_LABEL: Record<LeaderPeriod, string> = { month: "this month", lastmonth: "last month", year: "this year", all: "all time" };
export function LeaderboardPanel({ o }: { o: FieldOverview }) {
  const [tab, setTab] = useState<"stores" | "engineers">(o.multiStore ? "stores" : "engineers");
  const [period, setPeriod] = useState<LeaderPeriod>("month");
  const [metric, setMetric] = useState<LeaderMetric>("business");
  const showTabs = o.multiStore && o.canTeam;
  // Engineers need team visibility; without it only stores are ranked.
  const effective = !o.canTeam && tab === "engineers" ? "stores" : tab;
  const list = useMemo(
    () => leaderboard(o.jobs, effective === "stores" ? "store" : "engineer", o.ctx, o.now, 5, period, metric),
    [o.jobs, o.ctx, o.now, effective, period, metric],
  );
  const value = (r: DashRow) => (metric === "trips" ? r.totalTrips : metric === "rate" ? (completionRateOf(r) ?? 0) : (r.business ?? 0));
  const top = Math.max(1, ...list.map(value));
  const fmt = (r: DashRow) => (metric === "trips" ? String(r.totalTrips) : metric === "rate" ? `${completionRateOf(r) ?? 0}%` : inr(r.business));
  return (
    <Panel title={`Top performers · ${PERIOD_LABEL[period]}`} icon={Trophy} className="h-full min-h-0" bodyClassName="min-h-0 overflow-y-auto"
      action={showTabs ? <SegmentedTabs size="sm" value={tab} onChange={(v) => setTab(v as "stores" | "engineers")} options={[{ label: "Stores", value: "stores" }, { label: "Engineers", value: "engineers" }]} /> : undefined}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" value={period} onChange={(v) => setPeriod(v as LeaderPeriod)}
            options={[{ label: "Month", value: "month" }, { label: "Last month", value: "lastmonth" }, { label: "Year", value: "year" }, { label: "All", value: "all" }]} />
        </div>
        <SegmentedTabs size="sm" value={metric} onChange={(v) => setMetric(v as LeaderMetric)}
          options={[{ label: "Business", value: "business" }, { label: "Trips", value: "trips" }, { label: "Completion", value: "rate" }]} />
      </div>
      {list.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><Trophy className="h-4 w-4" /></span>
          <p className="text-[12.5px] text-muted-foreground">
            No trips {PERIOD_LABEL[period]}.{period !== "all" && <> <button className="font-semibold text-[#4361EE] hover:underline" onClick={() => setPeriod("all")}>Try all time</button>.</>}
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {list.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold", i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-zinc-200 text-zinc-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground")}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{r.label}</span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-emerald-700">{fmt(r)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${Math.round((value(r) / top) * 100)}%` }} />
                </div>
                <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">{r.totalTrips} trips · {r.onsite.completed + r.pickup.completed + r.drop.completed} completed{metric !== "business" && r.business != null ? ` · ${inr(r.business)}` : ""}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ─── Insights ─── */
export function InsightsPanel({ o }: { o: FieldOverview }) {
  const tone = { good: "bg-emerald-50 text-emerald-900 ring-emerald-200", warn: "bg-amber-50 text-amber-900 ring-amber-200", info: "bg-sky-50 text-sky-900 ring-sky-200" } as const;
  const Icn = { good: CheckCircle2, warn: AlertTriangle, info: Sparkles } as const;
  return (
    <Panel title="Insights" icon={Lightbulb} className="h-full min-h-0" bodyClassName="min-h-0 overflow-y-auto">
      {o.insights.length === 0 ? (
        <Empty icon={Lightbulb} title="Nothing to flag" text="Insights appear when there are trips to analyse." />
      ) : (
        <ul className="space-y-2">
          {o.insights.map((i, k) => {
            const I = Icn[i.tone];
            return <li key={k} className={cn("flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug ring-1 ring-inset", tone[i.tone])}><I className="mt-0.5 h-4 w-4 shrink-0" /><span>{i.text}</span></li>;
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ─── Activity feed ─── */
export function ActivityPanel({ o }: { o: FieldOverview }) {
  const router = useRouter();
  return (
    <Panel title="Recent activity" icon={History} bodyClassName="p-0">
      {o.feed.length === 0 ? (
        <div className="p-5"><Empty icon={Activity} title="No activity yet" text="Assignments, status changes, location edits and customer notes show here." /></div>
      ) : (
        <ul className="max-h-[300px] divide-y divide-border/70 overflow-y-auto">
          {o.feed.map((f) => (
            <li key={f.id}>
              <button onClick={() => router.push(`/field/${f.jobId}`)} className="flex w-full items-start gap-3 px-5 py-2.5 text-left transition hover:bg-muted/40">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#4361EE]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px]"><strong className="font-semibold">{f.title}</strong> <span className="text-muted-foreground">· {f.jobNo}</span></span>
                  {f.detail && <span className="block truncate text-[11.5px] text-muted-foreground">{f.detail}</span>}
                </span>
                <span className="shrink-0 text-right text-[10.5px] text-zinc-400">{formatWhen(new Date(f.at).getTime())}{f.actor ? <><br />{f.actor}</> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ─── Dashboards — compact, equal-height rows (replaces the uneven card grid) ─── */
const TILE = { sky: "from-sky-400 to-blue-600", teal: "from-teal-400 to-emerald-600", violet: "from-violet-400 to-indigo-600", amber: "from-amber-400 to-orange-500", emerald: "from-emerald-400 to-green-600" } as const;
export function DashboardLinksPanel() {
  const router = useRouter();
  const { available } = useFieldDashboard();
  return (
    <Panel title="Field dashboards" icon={BarChart3} action={<LinkAction href="/field/dashboard">All</LinkAction>} bodyClassName="p-3">
      <ul className="space-y-1.5">
        {available.map((d) => (
          <li key={d.id}>
            <button onClick={() => router.push(d.href)} className="group flex h-[54px] w-full items-center gap-3 rounded-xl px-2.5 text-left transition hover:bg-[#EEF1FD]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm ring-1 ring-white/40", TILE[d.tone])}><d.Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{d.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{d.purpose}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ─── Stock & purchasing shortcuts (links only — no sample numbers) ─── */
const STOCK_LINKS = [
  { href: "/stock", label: "Stock Levels", Icon: Boxes },
  { href: "/operations/vendors", label: "Vendors", Icon: Truck },
  { href: "/operations/purchase-orders", label: "Purchase Orders", Icon: ClipboardList },
  { href: "/operations/transfers", label: "Parts Transfers", Icon: Recycle },
  { href: "/operations/products", label: "Product Items", Icon: Package },
];
export function StockShortcuts() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stock &amp; purchasing</span>
      {STOCK_LINKS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-zinc-700 shadow-sm transition hover:border-[#4361EE]/40 hover:text-[#4361EE]">
          <Icon className="h-3.5 w-3.5" /> {label}
        </Link>
      ))}
    </div>
  );
}

export { DASHBOARDS };
