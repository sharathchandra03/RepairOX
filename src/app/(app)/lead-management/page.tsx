"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles, Filter, Inbox, Phone, Mail, MessageSquare, Target, TrendingUp,
  UserPlus, MoreHorizontal, Megaphone, Zap, Search, Plus, Calendar, ChevronRight, ArrowUpRight,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, cn } from "@/lib/utils";

const KPIS = [
  { label: "Open Leads",      value: 33,    delta: "+12 today",       tone: "violet"  as const, Icon: Inbox },
  { label: "Conversion Rate", value: "37%", delta: "+4.1% MoM",       tone: "emerald" as const, Icon: TrendingUp },
  { label: "Avg Response",    value: "8m",  delta: "-2m vs last week", tone: "sky"     as const, Icon: Zap },
  { label: "Pipeline Value",  value: "4.2L",delta: "this month",       tone: "rose"    as const, Icon: Target },
];

const STAGES = [
  { id: "new",       label: "New",       count: 14, dot: "bg-sky-500"     },
  { id: "contacted", label: "Contacted", count: 9,  dot: "bg-violet-500"  },
  { id: "quoted",    label: "Quoted",    count: 6,  dot: "bg-amber-500"   },
  { id: "won",       label: "Won",       count: 4,  dot: "bg-emerald-500" },
];

const CARDS: Record<string, { name: string; src: string; device: string; value: number; age: string; score: number }[]> = {
  new:       [{ name: "Aarav Mehta",   src: "Google",    device: "iPhone 14 Pro",  value: 9500,  age: "12m", score: 86 }, { name: "Bina K. Soni",  src: "Meta",      device: "MacBook Air M2", value: 18000, age: "23m", score: 72 }, { name: "Chetan Bhatt",  src: "Walk-In",   device: "iPad Pro 11",   value: 6500,  age: "45m", score: 64 }],
  contacted: [{ name: "Diya Sen",      src: "Reference", device: "iPhone 13",      value: 7000,  age: "1h",  score: 78 }, { name: "Eshan Roy",     src: "YouTube",   device: "iWatch S8",     value: 3500,  age: "2h",  score: 55 }],
  quoted:    [{ name: "Falguni Patel", src: "Google",    device: "iPhone 12",      value: 11000, age: "3h",  score: 90 }],
  won:       [{ name: "Gaurav Pillai", src: "Reference", device: "iMac 24",        value: 22000, age: "today", score: 95 }],
};

const SOURCES = [
  { name: "Google",    leads: 38, won: 12, color: "bg-sky-500"     },
  { name: "Meta",      leads: 22, won: 6,  color: "bg-violet-500"  },
  { name: "YouTube",   leads: 14, won: 3,  color: "bg-rose-500"    },
  { name: "Walk-In",   leads: 31, won: 18, color: "bg-emerald-500" },
  { name: "Reference", leads: 19, won: 12, color: "bg-amber-500"   },
];
const TOTAL_LEADS = SOURCES.reduce((a, s) => a + s.leads, 0);

const FOLLOWUPS = [
  { name: "Aarav Mehta",  via: "WhatsApp", when: "in 12m", icon: MessageSquare, tone: "emerald" as const },
  { name: "Bina K. Soni", via: "Call",     when: "in 35m", icon: Phone,         tone: "sky"     as const },
  { name: "Chetan Bhatt", via: "Email",    when: "in 1h",  icon: Mail,          tone: "rose"    as const },
  { name: "Diya Sen",     via: "WhatsApp", when: "today",  icon: MessageSquare, tone: "emerald" as const },
];

export default function LeadManagementPage() {
  return (
    <div className="relative space-y-6 pb-8">
      {/* Hero */}
      <section className="rounded-3xl border border-zinc-200 bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">Lead Mgmt</p>
            <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
              Lead <span className="brand-gradient-text">Management</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-zinc-600">
              Capture every enquiry from Google, Meta, YouTube, walk-ins and references — score, follow-up
              and convert into tickets without ever losing context.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:gap-2">
            <Input iconLeft={<Search className="h-4 w-4" />} placeholder="Search leads..." className="h-10 rounded-xl border-zinc-200 bg-zinc-50 sm:w-72" />
            <Button className="gap-1.5"><Sparkles className="h-4 w-4" /> AI Triage</Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {KPIS.map((k, i) => {
            const Icon = k.Icon;
            const tone = {
              violet:  "bg-violet-50  text-violet-700  ring-violet-200",
              emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
              sky:     "bg-sky-50     text-sky-700     ring-sky-200",
              rose:    "bg-indigo-50  text-indigo-700  ring-indigo-200",
            }[k.tone];
            return (
              <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
                className="rounded-2xl border border-zinc-200 bg-card p-4 shadow-[0_1px_0_rgba(15,15,15,0.02)]">
                <div className="flex items-center justify-between">
                  <span className={cn("grid h-9 w-9 place-items-center rounded-lg ring-1", tone)}><Icon className="h-4 w-4" /></span>
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

      {/* Pipeline + Sidebar */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Pipeline</p>
              <h2 className="font-display text-lg font-bold">Drag-and-drop kanban</h2>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-3.5 w-3.5" /> Filter</Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STAGES.map((stage, si) => (
              <div key={stage.id} className="flex min-h-[280px] flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", stage.dot)} />
                    <span className="text-xs font-semibold text-zinc-700">{stage.label}</span>
                    <span className="text-[10px] font-semibold text-zinc-400">{stage.count}</span>
                  </div>
                  <button className="text-zinc-400 hover:text-zinc-600"><MoreHorizontal className="h-4 w-4" /></button>
                </div>
                <div className="space-y-2">
                  {(CARDS[stage.id] || []).map((c, i) => (
                    <motion.div key={c.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * (si + i) }}
                      className="cursor-grab rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_1px_0_rgba(15,15,15,0.02)] transition hover:-translate-y-0.5 hover:shadow-card">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.name} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{c.name}</p>
                          <p className="text-[11px] text-zinc-500">{c.device}</p>
                        </div>
                        <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1",
                          c.score >= 85 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : c.score >= 70 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-zinc-50 text-zinc-600 ring-zinc-200"
                        )}>{c.score}</span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{c.src}</span>
                        <span className="text-[11px] font-semibold tnum">{formatINR(c.value)}</span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2">
                        <span className="text-[10px] text-zinc-400">{c.age} ago</span>
                        <div className="flex items-center gap-1 text-zinc-400">
                          <Phone className="h-3 w-3" /><MessageSquare className="h-3 w-3" /><Mail className="h-3 w-3" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  <button className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-white/40 py-2 text-[11px] font-medium text-zinc-500 hover:bg-white">
                    <Plus className="h-3.5 w-3.5" /> Add lead
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Source ROI</p>
                <h3 className="font-display text-lg font-bold">Where leads come from</h3>
              </div>
              <Megaphone className="h-4 w-4 text-zinc-400" />
            </div>
            <ul className="mt-4 space-y-3">
              {SOURCES.map((s) => {
                const pct = Math.round((s.leads / TOTAL_LEADS) * 100);
                const conv = Math.round((s.won / s.leads) * 100);
                return (
                  <li key={s.name}>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", s.color)} /><span className="font-semibold text-zinc-800">{s.name}</span></div>
                      <span className="tnum text-zinc-500">{s.leads} · {conv}% won</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className={cn("h-full rounded-full", s.color)} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Today</p>
                <h3 className="font-display text-lg font-bold">Scheduled follow-ups</h3>
              </div>
              <Calendar className="h-4 w-4 text-zinc-400" />
            </div>
            <ul className="mt-4 space-y-2.5">
              {FOLLOWUPS.map((f, i) => {
                const Icon = f.icon;
                const tone = {
                  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
                  sky:     "bg-sky-50     text-sky-700     ring-sky-200",
                  rose:    "bg-indigo-50  text-indigo-700  ring-indigo-200",
                }[f.tone];
                return (
                  <motion.li key={i} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                    className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5">
                    <span className={cn("grid h-9 w-9 place-items-center rounded-lg ring-1", tone)}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{f.name}</p>
                      <p className="text-[11px] text-zinc-500">{f.via}</p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{f.when}</span>
                  </motion.li>
                );
              })}
            </ul>
            <Link href="#" className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-zinc-50 py-2 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100">
              View all follow-ups <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-3xl border border-dashed border-indigo-300 bg-indigo-50/50 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg brand-gradient text-white"><UserPlus className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Hand-off to CRM</p>
                <p className="mt-0.5 text-xs text-zinc-600">When a lead is won, convert it into a repair ticket — customer details auto-fill.</p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}