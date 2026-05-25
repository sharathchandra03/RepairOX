"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Sparkles, Truck, MapPin, Navigation, Route, Camera, Clock, Map as MapIcon,
  Briefcase, ClipboardList, ChevronRight, Search, Plus, Phone, MessageSquare,
  AlertTriangle, CheckCircle2, ArrowUpRight, Zap, Filter,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatINR } from "@/lib/utils";

/* ---------- mock data ---------- */
const KPIS = [
  { label: "Active Jobs",       value: 12,    delta: "+3 since 9 AM",     tone: "violet"  as const, Icon: ClipboardList },
  { label: "On-Field Techs",    value: 8,     delta: "of 11 total",       tone: "sky"     as const, Icon: Truck },
  { label: "SLA at Risk",       value: 2,     delta: "−1 vs yesterday",   tone: "amber"   as const, Icon: AlertTriangle },
  { label: "Earnings Today",    value: "₹14,800", delta: "across 6 jobs", tone: "emerald" as const, Icon: Briefcase },
];

const TECHS = [
  { name: "Anand Rao",   role: "L2 Mobile",   status: "On-route", eta: "12m",  jobs: 3, color: "bg-emerald-500", x: 35, y: 30 },
  { name: "Pooja Iyer",  role: "Logic-board", status: "On-site",  eta: "—",    jobs: 2, color: "bg-sky-500",     x: 62, y: 48 },
  { name: "Vikas Nair",  role: "Watch & iPad",status: "Idle",     eta: "—",    jobs: 0, color: "bg-zinc-400",    x: 48, y: 72 },
  { name: "Ritesh Kumar",role: "Pickup",      status: "On-route", eta: "8m",   jobs: 4, color: "bg-emerald-500", x: 78, y: 22 },
  { name: "Manish Shah", role: "Senior Tech", status: "On-site",  eta: "—",    jobs: 1, color: "bg-sky-500",     x: 22, y: 58 },
];

const JOBS = [
  { id: "FJ-1837", customer: "Rahul Kapoor", device: "iPhone 16 Pro Max", area: "BTM Layout",  type: "Pickup",  tech: "Ritesh Kumar", eta: "9:45 AM",  sla: "ok" as const },
  { id: "FJ-8624", customer: "Manoj S.",     device: "MacBook Air M3",   area: "Koramangala",  type: "On-site", tech: "Pooja Iyer",   eta: "10:20 AM", sla: "risk" as const },
  { id: "FJ-0456", customer: "Ajay Verma",   device: "iPad Air 11\"",     area: "HSR Layout",   type: "Pickup",  tech: "Anand Rao",    eta: "11:00 AM", sla: "ok" as const },
  { id: "FJ-9156", customer: "Radha Iyer",   device: "Watch S8 45mm",    area: "Indiranagar",  type: "Drop-off",tech: "Anand Rao",    eta: "11:30 AM", sla: "ok" as const },
  { id: "FJ-7811", customer: "Vikas Nair",   device: "iMac 24\"",         area: "Whitefield",   type: "On-site", tech: "Manish Shah",  eta: "12:15 PM", sla: "risk" as const },
];

const ZONES = [
  { name: "BTM / Koramangala", techs: 3, capacity: 80, surge: false },
  { name: "Indiranagar",       techs: 2, capacity: 55, surge: false },
  { name: "Whitefield",        techs: 1, capacity: 95, surge: true  },
  { name: "HSR Layout",        techs: 2, capacity: 40, surge: false },
];

const PIPELINE_STAGES = [
  { id: "queued",     label: "Queued",       count: 4,  dot: "bg-zinc-400" },
  { id: "dispatched", label: "Dispatched",   count: 3,  dot: "bg-sky-500"  },
  { id: "transit",    label: "In-Transit",   count: 2,  dot: "bg-violet-500" },
  { id: "received",   label: "Received",     count: 5,  dot: "bg-emerald-500" },
];

/* ---------- page ---------- */
export default function FieldManagementPreview() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-white via-rose-50/20 to-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-25 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 left-10 h-[420px] w-[620px] rounded-full bg-sky-200/30 blur-3xl" />

      {/* Top bar */}
      <header className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/modules"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-card text-zinc-700 shadow-card transition hover:bg-muted"
            aria-label="Back to modules"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Logo className="h-8 w-8" />
          <span className="ml-2 hidden text-sm font-medium text-zinc-500 md:inline">/ Module 3</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="warn" dot>Preview</Badge>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Dispatch job
          </Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl space-y-6 px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="rounded-3xl border border-zinc-200 bg-card p-6 shadow-card sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">Module 3</p>
              <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
                Field <span className="brand-gradient-text">Management</span>
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-zinc-600">
                Dispatch on-site jobs and pickups, track every technician live on the city map,
                and capture proof-of-service photos with timestamps and geo-tags.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:gap-2">
              <Input
                iconLeft={<Search className="h-4 w-4" />}
                placeholder="Find job, tech, area…"
                className="h-10 rounded-xl border-zinc-200 bg-zinc-50 sm:w-72"
              />
              <Button className="gap-1.5">
                <Route className="h-4 w-4" /> Auto-route
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {KPIS.map((k, i) => {
              const Icon = k.Icon;
              const tone = {
                violet:  "bg-violet-50  text-violet-700  ring-violet-200",
                sky:     "bg-sky-50     text-sky-700     ring-sky-200",
                amber:   "bg-amber-50   text-amber-700   ring-amber-200",
                emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
              }[k.tone];
              return (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="rounded-2xl border border-zinc-200 bg-card p-4 shadow-[0_1px_0_rgba(15,15,15,0.02)]"
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("grid h-9 w-9 place-items-center rounded-lg ring-1", tone)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-zinc-300" />
                  </div>
                  <p className="font-display mt-3 text-2xl font-extrabold tnum">{k.value}</p>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">{k.label}</p>
                  <p className="mt-1 text-[11px] font-medium text-zinc-500">{k.delta}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Map + Tech roster */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          {/* Live map */}
          <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Live Map</p>
                <h2 className="font-display text-lg font-bold">Bengaluru · Field Operations</h2>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> On-route</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> On-site</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Idle</span>
              </div>
            </div>

            <CityMap />
          </div>

          {/* Tech roster */}
          <aside className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Roster</p>
                <h3 className="font-display text-lg font-bold">Technicians on duty</h3>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-3.5 w-3.5" /> All
              </Button>
            </div>

            <ul className="mt-4 space-y-2.5">
              {TECHS.map((t, i) => (
                <motion.li
                  key={t.name}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 transition hover:border-rose-200 hover:bg-rose-50/30"
                >
                  <div className="relative">
                    <Avatar name={t.name} size={36} />
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white",
                      t.color
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.name}</p>
                    <p className="text-[11px] text-zinc-500">{t.role} · {t.jobs} jobs</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold text-zinc-700">{t.status}</p>
                    {t.eta !== "—" && (
                      <p className="text-[10px] text-zinc-500">ETA {t.eta}</p>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          </aside>
        </section>

        {/* Dispatch board */}
        <section className="rounded-3xl border border-zinc-200 bg-card shadow-card">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Today</p>
              <h2 className="font-display text-lg font-bold">Dispatch board</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-3.5 w-3.5" /> Filter
              </Button>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New job
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-zinc-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="w-[110px] px-5 py-2.5">Job ID</th>
                  <th className="py-2.5">Customer</th>
                  <th className="py-2.5">Device</th>
                  <th className="py-2.5">Area</th>
                  <th className="w-[100px] py-2.5">Type</th>
                  <th className="py-2.5">Technician</th>
                  <th className="w-[110px] py-2.5">ETA</th>
                  <th className="w-[100px] py-2.5 pr-5 text-right">SLA</th>
                </tr>
              </thead>
              <tbody>
                {JOBS.map((j, i) => (
                  <motion.tr
                    key={j.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i }}
                    className="group border-t border-zinc-200 transition hover:bg-zinc-50/70"
                  >
                    <td className="px-5 py-3 font-medium tnum">{j.id}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={j.customer} size={26} />
                        <span className="whitespace-nowrap">{j.customer}</span>
                      </div>
                    </td>
                    <td className="py-3 whitespace-nowrap text-zinc-600">{j.device}</td>
                    <td className="py-3 whitespace-nowrap text-zinc-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-rose-500" /> {j.area}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                        j.type === "Pickup"   && "bg-violet-50 text-violet-700 ring-violet-200",
                        j.type === "On-site"  && "bg-sky-50 text-sky-700 ring-sky-200",
                        j.type === "Drop-off" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
                      )}>
                        {j.type}
                      </span>
                    </td>
                    <td className="py-3 whitespace-nowrap">{j.tech}</td>
                    <td className="py-3 whitespace-nowrap tnum text-zinc-600">{j.eta}</td>
                    <td className="py-3 pr-5 text-right">
                      {j.sla === "ok" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> On track
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          <AlertTriangle className="h-3 w-3" /> At risk
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-200 p-4">
            <p className="text-xs text-zinc-500">Showing 5 of 12 active jobs</p>
            <Link href="#" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              View full board <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* Pickup pipeline + Service zones */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Pickup pipeline */}
          <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Pickup Pipeline</p>
                <h3 className="font-display text-lg font-bold">From customer to job-card</h3>
              </div>
              <Truck className="h-4 w-4 text-zinc-400" />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {PIPELINE_STAGES.map((s) => (
                <div key={s.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                    <span className="text-[11px] font-semibold text-zinc-700">{s.label}</span>
                  </div>
                  <p className="font-display mt-2 text-2xl font-extrabold tnum">{s.count}</p>
                  <p className="text-[10px] text-zinc-500">parcels</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-rose-300 bg-rose-50/40 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white">
                  <Zap className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Auto-create job cards</p>
                  <p className="text-[11px] text-zinc-600">When a pickup arrives, generate a Module 1 ticket instantly.</p>
                </div>
              </div>
              <Button size="sm" variant="soft">On</Button>
            </div>
          </div>

          {/* Service zones */}
          <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Capacity</p>
                <h3 className="font-display text-lg font-bold">Service zones</h3>
              </div>
              <MapIcon className="h-4 w-4 text-zinc-400" />
            </div>

            <ul className="space-y-3">
              {ZONES.map((z) => (
                <li key={z.name}>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-800">{z.name}</span>
                      {z.surge && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          <AlertTriangle className="h-2.5 w-2.5" /> Surge
                        </span>
                      )}
                    </div>
                    <span className="tnum text-zinc-500">{z.techs} techs · {z.capacity}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        z.capacity >= 85 ? "bg-amber-500" : z.capacity >= 60 ? "bg-emerald-500" : "bg-sky-500"
                      )}
                      style={{ width: `${z.capacity}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Feature highlights */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { Icon: Camera, label: "Photo Proof", desc: "Before/after with geo-tag" },
            { Icon: Navigation, label: "Live GPS", desc: "Real-time tech location" },
            { Icon: Clock, label: "SLA Monitor", desc: "ETA breach alerts" },
            { Icon: Briefcase, label: "Earnings", desc: "Per-job payouts" },
          ].map((f, i) => {
            const Icon = f.Icon;
            return (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i }}
                className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-card p-4 shadow-[0_1px_0_rgba(15,15,15,0.02)]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-brand-700 ring-1 ring-rose-100">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{f.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{f.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </section>

        {/* Preview footer */}
        <section className="rounded-3xl border border-amber-200 bg-amber-50/40 p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">This is a draft preview</p>
                <p className="text-xs text-zinc-600">
                  Field Management is currently a design preview — the underlying data is mocked.
                  We&apos;ll wire real GPS feeds, route optimisation, and proof-of-service capture in the next iteration.
                </p>
              </div>
            </div>
            <Link
              href="/modules"
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Back to modules <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------------------------------- City map ---------------------------------- */
function CityMap() {
  return (
    <div className="relative h-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-sky-50 via-white to-rose-50/40">
      {/* Map base — subtle grid + roads */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke="rgba(15,23,42,0.06)" strokeWidth="0.2" />
          </pattern>
          <linearGradient id="route" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0" />
            <stop offset="50%" stopColor="#f43f5e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="100" height="60" fill="url(#grid)" />

        {/* "Roads" */}
        <path d="M 0 30 Q 30 15, 50 28 T 100 22" fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="0.6" />
        <path d="M 0 45 Q 25 38, 45 50 T 100 42" fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="0.6" />
        <path d="M 25 0 Q 30 25, 22 50 T 30 60" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="0.5" />
        <path d="M 70 0 Q 76 20, 65 40 T 72 60" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="0.5" />

        {/* Animated route */}
        <motion.path
          d="M 12 18 Q 35 12, 50 28 T 88 14"
          fill="none"
          stroke="url(#route)"
          strokeWidth="0.8"
          strokeDasharray="2 2"
          animate={{ strokeDashoffset: [0, -8] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
        />
      </svg>

      {/* Tech markers */}
      {TECHS.map((t, i) => (
        <motion.div
          key={t.name}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 220, damping: 18 }}
          style={{ left: `${t.x}%`, top: `${t.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2"
        >
          {/* Pulse ring for on-route */}
          {t.status === "On-route" && (
            <motion.span
              className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400/60"
              animate={{ scale: [1, 1.6, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <div className="group relative">
            <span className={cn(
              "grid h-9 w-9 place-items-center rounded-full text-white shadow-[0_8px_24px_-8px_rgba(15,23,42,0.4)] ring-2 ring-white",
              t.color
            )}>
              <Truck className="h-4 w-4" />
            </span>
            {/* Tooltip */}
            <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
              {t.name} · {t.status}
            </div>
          </div>
        </motion.div>
      ))}

      {/* Customer pins (jobs) */}
      {[
        { x: 28, y: 22 }, { x: 55, y: 38 }, { x: 75, y: 30 }, { x: 40, y: 60 },
      ].map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 + i * 0.1 }}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-full"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-rose-600 shadow-card ring-1 ring-rose-200">
            <MapPin className="h-3.5 w-3.5 fill-rose-500 stroke-white" />
          </span>
        </motion.div>
      ))}

      {/* Map controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button className="grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-zinc-700 shadow-card ring-1 ring-zinc-200 backdrop-blur hover:bg-white">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-zinc-700 shadow-card ring-1 ring-zinc-200 backdrop-blur hover:bg-white">
          <Navigation className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Legend pill */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-zinc-700 shadow-card ring-1 ring-zinc-200 backdrop-blur">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live · 8 technicians tracked
      </div>
    </div>
  );
}
