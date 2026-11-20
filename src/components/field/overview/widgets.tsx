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
import { useFieldLive } from "@/hooks/use-field-live";
import { SegmentedTabs } from "@/components/ui/tabs";
import { formatWhen } from "@/lib/activity-log";
import { FIELD_STATUS_LABEL, FIELD_STATUS_TONE, FIELD_LEAD_TYPE_LABEL, FIELD_LEAD_TYPE_TONE, normaliseLeadType, accentColor } from "@/lib/field-data";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { inr } from "@/components/field/dashboard/dashboard-table";
import type { FieldOverview } from "@/components/field/overview/use-field-overview";
import { leaderboard, completionRateOf, workloadLevel, WORKLOAD_CAPACITY, type LoadLevel, type AttentionTone, type LeaderPeriod, type LeaderMetric } from "@/lib/field-overview";
import { tripGroupOf, tripDateOf, type DashRow } from "@/lib/field-dashboard";
import type { FieldJob } from "@/lib/field-data";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { formatHHmm } from "@/lib/time-format";

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
                  <span className={cn("w-[76px] shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-center text-[12px] font-bold tabular-nums", e.time ? "bg-[#EEF1FD] text-[#4361EE]" : "bg-muted text-muted-foreground")}>{e.time ? formatHHmm(e.time) : "Any"}</span>
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
const LOAD_TONE: Record<LoadLevel, { chip: string; bar: string; ring: string }> = {
  free: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-400", ring: "text-emerald-500" },
  light: { chip: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500", ring: "text-sky-500" },
  busy: { chip: "bg-[#EEF1FD] text-[#3450D8] ring-[#4361EE]/25", bar: "bg-[#4361EE]", ring: "text-[#4361EE]" },
  full: { chip: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500", ring: "text-amber-500" },
  over: { chip: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500", ring: "text-rose-500" },
};
function initials(n: string) { return n.replace(/^\[TEST\]\s*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }
/** Circular load gauge: open trips against capacity, today's share drawn darker. */
function LoadRing({ open, today, level }: { open: number; today: number; level: LoadLevel }) {
  const R = 20, C = 2 * Math.PI * R;
  const frac = Math.min(1, open / WORKLOAD_CAPACITY);
  const todayFrac = Math.min(frac, today / WORKLOAD_CAPACITY);
  return (
    <span className="relative grid h-[52px] w-[52px] shrink-0 place-items-center" aria-label={`${open} open of ${WORKLOAD_CAPACITY} capacity`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={R} fill="none" strokeWidth="5" className="stroke-slate-100" />
        <circle cx="24" cy="24" r={R} fill="none" strokeWidth="5" strokeLinecap="round" className={cn("stroke-current opacity-35 transition-[stroke-dasharray] duration-500", LOAD_TONE[level].ring)} strokeDasharray={`${C * frac} ${C}`} />
        <circle cx="24" cy="24" r={R} fill="none" strokeWidth="5" strokeLinecap="round" className={cn("stroke-current transition-[stroke-dasharray] duration-500", LOAD_TONE[level].ring)} strokeDasharray={`${C * todayFrac} ${C}`} />
      </svg>
      <span className="relative text-[15px] font-extrabold tabular-nums leading-none">{open}<span className="text-[10px] font-bold text-muted-foreground">/{WORKLOAD_CAPACITY}</span></span>
    </span>
  );
}
export function WorkloadPanel({ o }: { o: FieldOverview }) {
  const router = useRouter();
  const live = useFieldLive();
  // Live Ninja state per engineer (realtime): travelling now / waiting to accept.
  const liveBy = useMemo(() => {
    const m = new Map<string, { moving: number; waiting: number }>();
    for (const l of live.values()) {
      if (!l.ninja_id) continue;
      const e = m.get(l.ninja_id) ?? { moving: 0, waiting: 0 };
      if (["en_route_customer", "en_route_store", "device_received_by_ninja"].includes(l.status)) e.moving += 1;
      if (l.status === "assigned") e.waiting += 1;
      m.set(l.ninja_id, e);
    }
    return m;
  }, [live]);
  const totalOpen = o.workload.rows.reduce((n, r) => n + r.open, 0);
  const freeCount = o.workload.rows.filter((r) => r.free).length;
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
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {[{ l: "Open trips", v: totalOpen, c: "bg-[#EEF1FD] text-[#3450D8]" }, { l: "Engineers", v: o.workload.rows.length, c: "bg-slate-50 text-slate-700" }, { l: "Free now", v: freeCount, c: "bg-emerald-50 text-emerald-700" }].map((k) => (
              <div key={k.l} className={cn("rounded-xl px-2 py-2", k.c)}><p className="text-[18px] font-extrabold tabular-nums leading-none">{k.v}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-70">{k.l}</p></div>
            ))}
          </div>
          <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-0.5 rox-slim-scroll">
            {o.workload.rows.slice(0, 10).map((r) => {
              const lv = workloadLevel(r.open);
              const lb = liveBy.get(r.id);
              return (
                <li key={r.id}>
                  <button onClick={() => router.push(`/field?fe=${r.id}&excl=cancelled`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-left transition hover:border-[#4361EE]/40 hover:shadow-sm">
                    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-white" style={{ backgroundColor: accentColor(r.name) }}>
                      {initials(r.name)}
                      {lb?.moving ? <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"><span className="absolute inset-0 rounded-full bg-emerald-400 opacity-70 motion-safe:animate-ping" /></span> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-bold">{r.name}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset", LOAD_TONE[lv.level].chip)}>{lv.label}</span>
                        {lb?.moving ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">On the move</span> : null}
                        {lb?.waiting ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{lb.waiting} to accept</span> : null}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1" aria-hidden>
                        {Array.from({ length: Math.max(WORKLOAD_CAPACITY, r.open) }).map((_, i) => (
                          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < r.open ? LOAD_TONE[lv.level].bar : "bg-slate-100")} />
                        ))}
                      </span>
                      <span className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground tabular-nums">
                        <span><strong className="text-foreground">{r.today}</strong> today</span>
                        <span><strong className="text-foreground">{r.doneThisMonth}</strong> done this month</span>
                      </span>
                    </span>
                    <LoadRing open={r.open} today={r.today} level={lv.level} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-[10.5px] text-muted-foreground">Scale: {WORKLOAD_CAPACITY} open trips = at capacity. The darker ring shows trips due today.</p>
        </>
      )}
    </Panel>
  );
}
/* ─── Trend: Pickup vs On-Site, side by side — Today (hourly) · Month (daily) · Year (monthly) · Custom (daily) ─── */
type TrendPeriod = "today" | "month" | "year" | "custom";
interface TrendBucket { key: string; label: string; tip: string; pickup: number; onsite: number }
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parseYmd = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); };
/** Hour (0–23) a trip is scheduled for on `date`, or null when it has no time. */
function tripHourOn(j: FieldJob, date: string): number | null {
  const t = (j.pickupDate === date ? j.pickupTime : j.dropDate === date ? j.dropTime : "") || j.pickupTime || j.dropTime;
  const h = Number(String(t || "").slice(0, 2));
  return t && Number.isFinite(h) && h >= 0 && h < 24 ? h : null;
}
export function TrendPanel({ o }: { o: FieldOverview }) {
  const [period, setPeriod] = useState<TrendPeriod>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  const { buckets, title, unscheduled, needsRange } = useMemo(() => {
    const live = o.jobs.filter((j) => j.status !== "cancelled" && (tripGroupOf(j) === "pickup" || tripGroupOf(j) === "onsite"));
    const add = (b: TrendBucket | undefined, j: FieldJob) => { if (b) b[tripGroupOf(j) === "onsite" ? "onsite" : "pickup"] += 1; };
    const now = o.now;
    let out: TrendBucket[] = []; let ttl = ""; let unsched = 0; let needs = false;
    if (period === "today") {
      const day = ymdOf(now);
      out = Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: hourLabel(h), tip: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`, pickup: 0, onsite: 0 }));
      for (const j of live) {
        if (tripDateOf(j) !== day) continue;
        const h = tripHourOn(j, day);
        if (h == null) { unsched += 1; continue; }
        add(out[h], j);
      }
      ttl = `Today · ${now.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
    } else if (period === "month") {
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      out = Array.from({ length: days }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
        return { key: ymdOf(d), label: String(i + 1), tip: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }), pickup: 0, onsite: 0 };
      });
      const idx = new Map(out.map((b, i) => [b.key, i]));
      for (const j of live) { const i = idx.get(tripDateOf(j)); if (i != null) add(out[i], j); }
      ttl = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    } else if (period === "year") {
      out = MONTHS_SHORT.map((m, i) => ({ key: `${now.getFullYear()}-${pad2(i + 1)}`, label: m, tip: `${m} ${now.getFullYear()}`, pickup: 0, onsite: 0 }));
      for (const j of live) {
        const d = tripDateOf(j);
        if (d.startsWith(`${now.getFullYear()}-`)) add(out[Number(d.slice(5, 7)) - 1], j);
      }
      ttl = `${now.getFullYear()} · month by month`;
    } else if (customFrom && customTo) {
      const from = parseYmd(customFrom <= customTo ? customFrom : customTo), to = parseYmd(customFrom <= customTo ? customTo : customFrom);
      const n = Math.min(120, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
      out = Array.from({ length: n }, (_, i) => {
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
        return { key: ymdOf(d), label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, tip: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }), pickup: 0, onsite: 0 };
      });
      const idx = new Map(out.map((b, i) => [b.key, i]));
      for (const j of live) { const i = idx.get(tripDateOf(j)); if (i != null) add(out[i], j); }
      ttl = `${from.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
    } else { needs = true; ttl = "Custom range"; }
    return { buckets: out, title: ttl, unscheduled: unsched, needsRange: needs };
  }, [o.jobs, o.now, period, customFrom, customTo]);

  const totalPickup = buckets.reduce((x, b) => x + b.pickup, 0);
  const totalOnsite = buckets.reduce((x, b) => x + b.onsite, 0);
  const rawMax = Math.max(1, ...buckets.map((b) => Math.max(b.pickup, b.onsite)));
  const tickStep = rawMax <= 4 ? 1 : Math.ceil(rawMax / 4);
  const niceMax = rawMax <= 4 ? rawMax : tickStep * 4;
  const ticks = Array.from({ length: Math.round(niceMax / tickStep) }, (_, i) => (i + 1) * tickStep);

  const W = 720, H = 260, padL = 28, padB = 24, padT = 14;
  const chartH = H - padB - padT, bw = (W - padL) / Math.max(1, buckets.length);
  const labelEvery = buckets.length > 60 ? 7 : buckets.length > 31 ? 3 : buckets.length > 24 ? 2 : period === "today" ? 2 : 1;
  const showNums = buckets.length <= 31;
  const empty = !needsRange && totalPickup + totalOnsite === 0;
  const hb = hover != null ? buckets[hover] : null;
  const yOf = (v: number) => padT + chartH - (v / niceMax) * chartH;

  return (
    <Panel title={title} icon={BarChart3} className="h-full" bodyClassName="flex flex-col"
      action={<LinkAction href="/field/insights">Full report</LinkAction>}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs size="sm" value={period} onChange={(v) => { setPeriod(v as TrendPeriod); setHover(null); }}
          options={[{ label: "Today", value: "today" }, { label: "Month", value: "month" }, { label: "Year", value: "year" }, { label: "Custom", value: "custom" }]} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> Pickup <strong className="tabular-nums">{totalPickup}</strong></span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> On-Site <strong className="tabular-nums">{totalOnsite}</strong></span>
        </div>
      </div>
      <DateRangePicker open={period === "custom"} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
      <div className="relative flex flex-1 items-center" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[290px] w-full" role="img" aria-label={`Pickup and on-site trips, ${title}`}>
          {ticks.map((g) => (
            <g key={g}>
              <line x1={padL} x2={W} y1={yOf(g)} y2={yOf(g)} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
              <text x={padL - 6} y={yOf(g) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>{g}</text>
            </g>
          ))}
          <line x1={padL} x2={W} y1={yOf(0)} y2={yOf(0)} stroke="currentColor" className="text-border" />
          {buckets.map((b, i) => {
            const x = padL + i * bw;
            const w = bw * 0.36;
            const x1 = x + bw * 0.12, x2 = x1 + w + bw * 0.04;
            const hp = (b.pickup / niceMax) * chartH, ho = (b.onsite / niceMax) * chartH;
            const num = (v: number, bx: number, h: number) => showNums && v > 0
              ? <text x={bx + w / 2} y={padT + chartH - h - 3} textAnchor="middle" className="fill-foreground" style={{ fontSize: 9, fontWeight: 700 }}>{v}</text> : null;
            return (
              <g key={b.key} onMouseEnter={() => setHover(i)}>
                <rect x={x} y={padT} width={bw} height={chartH + padB} fill={hover === i ? "rgba(67,97,238,0.07)" : "transparent"} />
                {b.pickup > 0 && <rect x={x1} y={padT + chartH - hp} width={w} height={hp} rx="2.5" className="fill-sky-400" />}
                {b.onsite > 0 && <rect x={x2} y={padT + chartH - ho} width={w} height={ho} rx="2.5" className="fill-violet-500" />}
                {num(b.pickup, x1, hp)}{num(b.onsite, x2, ho)}
                {i % labelEvery === 0 ? <text x={x + bw / 2} y={H - 7} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>{b.label}</text> : null}
              </g>
            );
          })}
        </svg>
        {hb && hover != null && (
          <div className="pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-xl border border-border bg-card px-3 py-2 text-[12px] shadow-lg"
            style={{ left: `${Math.min(78, Math.max(2, ((padL + (hover + 0.5) * bw) / W) * 100 - 8))}%` }}>
            <p className="mb-1 font-bold text-foreground">{hb.tip}</p>
            <p className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-sky-400" />Pickup</span><strong className="tabular-nums">{hb.pickup}</strong></p>
            <p className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-violet-500" />On-Site</span><strong className="tabular-nums">{hb.onsite}</strong></p>
            <p className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1"><span className="text-muted-foreground">Total</span><strong className="tabular-nums">{hb.pickup + hb.onsite}</strong></p>
          </div>
        )}
        {(empty || needsRange) && (
          <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[12px] text-muted-foreground">
            {needsRange ? "Pick a date range to see the graph" : period === "today" ? "No pickup or on-site trips today" : "No pickup or on-site trips in this period"}
          </p>
        )}
      </div>
      {period === "today" && unscheduled > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">{unscheduled} trip{unscheduled > 1 ? "s" : ""} today without a set time are not shown on the hourly graph.</p>
      )}
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

/* ─── Field Insights shortcuts — jump straight to a section of the merged page ─── */
const INSIGHT_LINKS = [
  { hash: "ins-compare", name: "Compare", purpose: "Stores, engineers, agents or sources side by side", Icon: BarChart3, tone: "sky" },
  { hash: "ins-performance", name: "Performance table", purpose: "Trips, completion, on-time and business per row", Icon: ClipboardList, tone: "teal" },
  { hash: "ins-monthly", name: "Month by month", purpose: "The year at a glance, month columns", Icon: CalendarClock, tone: "amber" },
  { hash: "ins-ninjas", href: "/field/activity", name: "Field Activity", purpose: "Team today, attendance, pay and reviews", Icon: Users, tone: "violet", team: true },
  { hash: "ins-exceptions", name: "Exceptions", purpose: "Delayed, failed and cancelled trips", Icon: AlertTriangle, tone: "emerald" },
] as const;
const TILE = { sky: "from-sky-400 to-blue-600", teal: "from-teal-400 to-emerald-600", violet: "from-violet-400 to-indigo-600", amber: "from-amber-400 to-orange-500", emerald: "from-rose-400 to-red-600" } as const;
export function DashboardLinksPanel() {
  const router = useRouter();
  const { canTeam } = useFieldDashboard();
  return (
    <Panel title="Field Insights" icon={BarChart3} action={<LinkAction href="/field/insights">Open</LinkAction>} bodyClassName="p-3">
      <ul className="space-y-1.5">
        {INSIGHT_LINKS.filter((d) => !("team" in d) || canTeam).map((d) => (
          <li key={d.hash}>
            <button onClick={() => router.push("href" in d ? d.href : `/field/insights#${d.hash}`)} className="group flex h-[54px] w-full items-center gap-3 rounded-xl px-2.5 text-left transition hover:bg-[#EEF1FD]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40">
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

