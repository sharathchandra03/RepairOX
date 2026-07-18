"use client";

import { motion } from "framer-motion";
import {
  TrendingUp, Users, Target, BarChart3, ArrowUpRight, ArrowDownRight,
  Zap, Phone, Mail, MessageSquare, CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatINR } from "@/lib/utils";

/* ── Source Performance ── */
const SOURCES = [
  { name: "Google Ads", leads: 38, won: 14, spent: 45000, color: "bg-sky-500" },
  { name: "Meta Ads",   leads: 22, won: 6,  spent: 28000, color: "bg-violet-500" },
  { name: "YouTube",    leads: 14, won: 3,  spent: 18000, color: "bg-rose-500" },
  { name: "Walk-In",    leads: 31, won: 18, spent: 0,     color: "bg-emerald-500" },
  { name: "Reference",  leads: 19, won: 12, spent: 0,     color: "bg-amber-500" },
];

/* ── Conversion Funnel ── */
const FUNNEL = [
  { stage: "New",        count: 124, pct: 100 },
  { stage: "Contacted",  count: 98,  pct: 79 },
  { stage: "Qualified",  count: 62,  pct: 50 },
  { stage: "Proposal",   count: 38,  pct: 31 },
  { stage: "Won",        count: 22,  pct: 18 },
];

/* ── Team Activity ── */
const TEAM = [
  { name: "Kalai S.",      role: "Owner",     leads: 42, won: 14, calls: 28, emails: 15, conversion: 33 },
  { name: "Manoj S.",      role: "Sales Exec",leads: 35, won: 8,  calls: 45, emails: 22, conversion: 23 },
  { name: "Ritesh Kumar",  role: "Manager",   leads: 28, won: 10, calls: 18, emails: 12, conversion: 36 },
];

/* ── Monthly Trend ── */
const MONTHLY = [
  { month: "Jan", leads: 18, won: 4 },
  { month: "Feb", leads: 22, won: 6 },
  { month: "Mar", leads: 28, won: 8 },
  { month: "Apr", leads: 24, won: 7 },
  { month: "May", leads: 32, won: 10 },
  { month: "Jun", leads: 35, won: 12 },
  { month: "Jul", leads: 42, won: 14 },
];
const maxLeads = Math.max(...MONTHLY.map((m) => m.leads));

export default function ReportsPage() {
  const totalLeads = SOURCES.reduce((a, s) => a + s.leads, 0);
  const totalWon = SOURCES.reduce((a, s) => a + s.won, 0);
  const totalSpent = SOURCES.reduce((a, s) => a + s.spent, 0);
  const convRate = Math.round((totalWon / totalLeads) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Reports & Insights"
        subtitle="Lead source performance, conversion metrics, and team activity."
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total Leads", value: String(totalLeads), delta: "+18% MoM", up: true, icon: Users },
          { label: "Conversion Rate", value: `${convRate}%`, delta: "+4.1%", up: true, icon: TrendingUp },
          { label: "Won Deals", value: String(totalWon), delta: "+6 this month", up: true, icon: Target },
          { label: "Cost per Lead", value: totalSpent > 0 ? formatINR(Math.round(totalSpent / totalLeads)) : "—", delta: "-₹120", up: true, icon: Zap },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
              className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-zinc-400" />
                {kpi.up ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /> : <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" />}
              </div>
              <p className="font-display mt-2 text-2xl font-extrabold tnum">{kpi.value}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
              <p className="mt-0.5 text-[11px] font-medium text-emerald-600">{kpi.delta}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Row: Source Performance + Conversion Funnel */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Source Performance */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source Performance</p>
          <h3 className="font-display mt-0.5 text-base font-bold">Lead Source ROI</h3>
          <div className="mt-4 space-y-3">
            {SOURCES.map((src) => {
              const conv = Math.round((src.won / src.leads) * 100);
              const pct = Math.round((src.leads / totalLeads) * 100);
              return (
                <div key={src.name}>
                  <div className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", src.color)} />
                      <span className="font-semibold text-zinc-800">{src.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-zinc-500">
                      <span className="tnum">{src.leads} leads</span>
                      <span className="tnum font-semibold text-emerald-600">{conv}% won</span>
                      {src.spent > 0 && <span className="tnum">{formatINR(src.spent)} spent</span>}
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className={cn("h-full rounded-full", src.color)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conversion Funnel</p>
          <h3 className="font-display mt-0.5 text-base font-bold">Lead → Won Pipeline</h3>
          <div className="mt-5 space-y-2">
            {FUNNEL.map((step, i) => (
              <motion.div key={step.stage} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i }}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="font-semibold text-zinc-800">{step.stage}</span>
                  <span className="tnum text-zinc-500">{step.count} · {step.pct}%</span>
                </div>
                <div className="h-8 overflow-hidden rounded-xl bg-zinc-50">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${step.pct}%` }}
                    transition={{ duration: 0.7, delay: 0.06 * i }}
                    className="h-full rounded-xl bg-gradient-to-r from-[#4361EE] to-[#6780EE] flex items-center justify-end pr-2"
                  >
                    {step.pct > 20 && <span className="text-[10px] font-bold text-white">{step.pct}%</span>}
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Overall funnel conversion: <span className="font-semibold text-[#4361EE]">{FUNNEL[FUNNEL.length - 1].pct}%</span> from New → Won
          </p>
        </div>
      </div>

      {/* Row: Monthly Trend + Team Activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Monthly Trend */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Trend</p>
          <h3 className="font-display mt-0.5 text-base font-bold">Monthly Leads vs Won</h3>
          <div className="mt-4 flex items-end gap-2 h-[180px]">
            {MONTHLY.map((m, i) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative flex w-full flex-col items-center justify-end" style={{ height: "140px" }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(m.leads / maxLeads) * 100}%` }}
                    transition={{ duration: 0.5, delay: 0.04 * i }}
                    className="w-full rounded-t-md bg-[#4361EE]/20 absolute bottom-0"
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(m.won / maxLeads) * 100}%` }}
                    transition={{ duration: 0.5, delay: 0.04 * i + 0.1 }}
                    className="w-3/5 rounded-t-md bg-[#4361EE] absolute bottom-0 z-10"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{m.month}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded bg-[#4361EE]/20" /> Leads</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded bg-[#4361EE]" /> Won</span>
          </div>
        </div>

        {/* Team Activity */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Team</p>
          <h3 className="font-display mt-0.5 text-base font-bold">Sales Team Performance</h3>
          <div className="mt-4 space-y-3">
            {TEAM.map((member, i) => (
              <motion.div key={member.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <Avatar name={member.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-zinc-900">{member.name}</p>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{member.conversion}%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{member.role}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {member.leads} leads</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {member.won} won</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {member.calls}</span>
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {member.emails}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
