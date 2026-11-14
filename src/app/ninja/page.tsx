"use client";
import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { BellRing, CalendarCheck2, CheckCircle2, ChevronRight, FileCheck2, Navigation, PackageSearch, RefreshCw, Route as RouteIcon, Sparkles } from "lucide-react";
import { useNinja } from "@/lib/ninja/ninja-context";
import { useSession } from "@/lib/use-session";
import { inProgress, isNew, isClosed, nextStep, STATUS_META, TYPE_LABEL } from "@/lib/ninja/model";
import { Empty, SectionTitle, Skeleton, Stagger } from "@/components/ninja/ui";
import { TripCard, TYPE_STYLE } from "@/components/ninja/trip-card";
import { ShiftCard } from "@/components/ninja/shift";

function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
const sameDay = (iso: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "Anytime");

function Ring({ done, total }: { done: number; total: number }) {
  const r = 34, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <div className="relative grid h-[88px] w-[88px] place-items-center">
      <svg viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} stroke="rgba(255,255,255,0.22)" strokeWidth="8" fill="none" />
        <motion.circle cx="44" cy="44" r={r} stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute text-center leading-none"><p className="text-[22px] font-extrabold tabular-nums">{done}<span className="text-[13px] font-bold text-white/60">/{total}</span></p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">done</p></div>
    </div>
  );
}

export default function NinjaHome() {
  const { name } = useSession();
  const { trips, loading, error, refresh } = useNinja();

  const s = useMemo(() => {
    const fresh = trips.filter(isNew);
    const active = trips.filter(inProgress);
    const accepted = trips.filter((t) => t.status === "accepted");
    const todayAll = trips.filter((t) => sameDay(t.scheduled_at) || (t.status === "completed" && sameDay(t.completed_at)));
    const todayOpen = trips.filter((t) => !isClosed(t) && t.status !== "completed" && sameDay(t.scheduled_at)).sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    const doneToday = trips.filter((t) => t.status === "completed" && sameDay(t.completed_at));
    const later = trips.filter((t) => !isClosed(t) && !isNew(t) && !inProgress(t) && !sameDay(t.scheduled_at)).sort((a, b) => (a.scheduled_at ?? "9").localeCompare(b.scheduled_at ?? "9"));
    return { fresh, active, accepted, todayAll, todayOpen, doneToday, later };
  }, [trips]);

  const activeTrip = s.active[0];
  const first = (name || "Ninja").split(" ")[0];
  const total = Math.max(s.todayAll.length, s.doneToday.length + s.todayOpen.length + s.active.filter((t) => !s.todayOpen.includes(t)).length);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <motion.section initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1E2A78] via-[#2F46C4] to-[#4361EE] p-5 text-white shadow-[0_24px_50px_-24px_rgba(47,70,196,0.9)]">
        <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/70">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</p>
            <h1 className="mt-1 font-display text-[26px] font-extrabold leading-tight tracking-tight">{greeting()},<br />{first}</h1>
          </div>
          <Ring done={s.doneToday.length} total={total} />
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { l: "New", v: s.fresh.length, icon: BellRing, href: "/ninja/jobs?tab=new", hot: s.fresh.length > 0 },
            { l: "Today", v: s.todayOpen.length, icon: CalendarCheck2, href: "/ninja/jobs?tab=today" },
            { l: "Active", v: s.active.length, icon: Navigation, href: "/ninja/active" },
          ].map((c) => (
            <Link key={c.l} href={c.href} className={`rounded-2xl p-3 backdrop-blur transition active:scale-95 ${c.hot ? "bg-amber-400 text-amber-950" : "bg-white/15 ring-1 ring-white/20"}`}>
              <c.icon className="h-4 w-4 opacity-80" />
              <p className="mt-2 text-[24px] font-extrabold leading-none tabular-nums">{loading ? "–" : c.v}</p>
              <p className="mt-0.5 text-[11px] font-bold opacity-80">{c.l}</p>
            </Link>
          ))}
        </div>
      </motion.section>

      <ShiftCard />

      {error ? <div className="rounded-2xl bg-rose-50 p-3 text-[13px] font-semibold text-rose-700">Couldn't load jobs: {error}</div> : null}

      {/* Active trip */}
      {activeTrip ? (
        <Stagger>
          <Link href={`/ninja/trip/${activeTrip.id}`} className="block">
            <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-5 text-white shadow-[0_20px_44px_-22px_rgba(15,23,42,0.9)] transition active:scale-[0.985]">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/25 blur-2xl" />
              <div className="relative">
                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Trip in progress · {activeTrip.trip_no}</p>
                <p className="mt-2 text-[21px] font-extrabold leading-tight">{activeTrip.job?.customer || "Customer"}</p>
                <p className="mt-0.5 text-[13px] font-semibold text-white/60">{TYPE_LABEL[activeTrip.trip_type]} · {STATUS_META[activeTrip.status].label}</p>
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-[14px] font-extrabold text-slate-900">
                  {nextStep(activeTrip)?.label ?? "Open trip"}<ChevronRight className="h-5 w-5 text-[#4361EE]" />
                </div>
              </div>
            </div>
          </Link>
        </Stagger>
      ) : null}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { l: "My jobs", icon: RouteIcon, href: "/ninja/jobs", tone: "bg-[#EEF1FD] text-[#4361EE]" },
          { l: "Active", icon: Navigation, href: "/ninja/active", tone: "bg-emerald-50 text-emerald-600" },
          { l: "Proof", icon: FileCheck2, href: "/ninja/proof", tone: "bg-violet-50 text-violet-600" },
          { l: "Refresh", icon: RefreshCw, href: "", tone: "bg-amber-50 text-amber-600" },
        ].map((a) => {
          const inner = (<><span className={`grid h-12 w-12 place-items-center rounded-2xl ${a.tone}`}><a.icon className="h-5 w-5" /></span><span className="mt-1.5 text-[11.5px] font-bold text-slate-600">{a.l}</span></>);
          return a.href ? <Link key={a.l} href={a.href} className="flex flex-col items-center py-1 transition active:scale-90">{inner}</Link>
            : <button key={a.l} onClick={() => void refresh()} className="flex flex-col items-center py-1 transition active:scale-90">{inner}</button>;
        })}
      </div>

      {loading ? (<div className="space-y-3"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>) : (
        <>
          {s.fresh.length > 0 ? (
            <section>
              <SectionTitle action={<span className="flex items-center gap-1 text-[11px] font-bold text-amber-600"><Sparkles className="h-3.5 w-3.5" />Respond now</span>}>New assignments</SectionTitle>
              <div className="space-y-3">{s.fresh.map((t, i) => <Stagger key={t.id} i={i}><TripCard t={t} highlight /></Stagger>)}</div>
            </section>
          ) : null}

          {s.todayOpen.length > 0 ? (
            <section>
              <SectionTitle>Today's route</SectionTitle>
              <ol className="space-y-4">
                {s.todayOpen.map((t, i) => {
                  const st = TYPE_STYLE[t.trip_type]; const Icon = st.icon;
                  return (
                    <li key={t.id}>
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${st.tile}`}><Icon className="h-3.5 w-3.5" /></span>
                        <span className="whitespace-nowrap text-[12px] font-extrabold tabular-nums text-slate-700">{hhmm(t.scheduled_at)}</span>
                        <span className="h-px flex-1 bg-slate-200" />
                        <span className="whitespace-nowrap text-[11px] font-bold text-slate-400">Stop {i + 1} of {s.todayOpen.length}</span>
                      </div>
                      <Stagger i={i}><TripCard t={t} /></Stagger>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {s.later.length > 0 ? (
            <section>
              <SectionTitle action={<Link href="/ninja/jobs" className="text-[12px] font-bold text-[#4361EE]">See all</Link>}>Upcoming</SectionTitle>
              <div className="space-y-3">{s.later.slice(0, 3).map((t, i) => <Stagger key={t.id} i={i}><TripCard t={t} /></Stagger>)}</div>
            </section>
          ) : null}

          {s.doneToday.length > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5 text-emerald-800 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-6 w-6" /><p className="text-[13.5px] font-bold">{s.doneToday.length} job{s.doneToday.length > 1 ? "s" : ""} completed today. Nice work!</p>
            </div>
          ) : null}

          {trips.length === 0 ? (
            <Empty icon={<PackageSearch className="h-7 w-7" />} title="No jobs yet" body="When your manager assigns a pickup, drop or on-site visit, it shows up here instantly." />
          ) : s.fresh.length === 0 && s.todayOpen.length === 0 && s.later.length === 0 && !activeTrip ? (
            <Empty icon={<Navigation className="h-7 w-7" />} title="You're all caught up" body="No open jobs right now. Check My Jobs for history." />
          ) : null}
        </>
      )}
    </div>
  );
}
