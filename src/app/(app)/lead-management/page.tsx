"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Filter, Inbox, Phone, Mail, MessageSquare, Target, TrendingUp,
  UserPlus, Megaphone, Search, Plus, Calendar, ChevronRight, ArrowUpRight,
  Users, Building2, FileText, ClipboardList, CalendarClock,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { followUpState, type Lead, type LeadDateRange } from "@/lib/leads-data";
import { statusTone } from "@/components/leads/lead-pills";

const DATE_RANGES: { value: LeadDateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
];

/* Keywords used to classify configurable statuses into pipeline buckets and to
   count "won" outcomes without hardcoding a fixed status vocabulary. */
const isWon = (s: string) => /won|convert|closed won/i.test(s);
const isLost = (s: string) => /lost|drop|not interested/i.test(s);

const STAGE_DOTS = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-orange-500", "bg-emerald-500", "bg-zinc-400"];

export default function LeadManagementPage() {
  const { leads, filteredLeads, filters, setFilters, hydrated } = useLeads();

  /* KPIs derived from the SAME filtered dataset the list uses. */
  const kpis = useMemo(() => {
    const total = filteredLeads.length;
    const won = filteredLeads.filter((l) => isWon(l.status) || isWon(l.finalResult)).length;
    const closed = filteredLeads.filter((l) => isWon(l.status) || isLost(l.status) || isWon(l.finalResult) || isLost(l.finalResult)).length;
    const conversion = closed > 0 ? Math.round((won / closed) * 100) : 0;
    const pipelineValue = filteredLeads.reduce((sum, l) => sum + (l.estimate ?? 0), 0);
    const followUpsDue = filteredLeads.filter((l) => {
      const s = followUpState(l.followUpDate);
      return s === "today" || s === "overdue";
    }).length;
    return [
      { label: "Total Leads",     value: String(total),                    tone: "violet"  as const, Icon: Inbox },
      { label: "Conversion Rate", value: `${conversion}%`,                 tone: "emerald" as const, Icon: TrendingUp },
      { label: "Follow-ups Due",  value: String(followUpsDue),             tone: "rose"    as const, Icon: CalendarClock },
      { label: "Pipeline Value",  value: formatINR(pipelineValue),         tone: "sky"     as const, Icon: Target },
    ];
  }, [filteredLeads]);

  /* Pipeline stages = distinct statuses in data, counted over the filtered set. */
  const stages = useMemo(() => {
    const order = Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));
    return order.map((label, i) => ({
      label,
      count: filteredLeads.filter((l) => l.status === label).length,
      leads: filteredLeads.filter((l) => l.status === label).slice(0, 4),
      dot: STAGE_DOTS[i % STAGE_DOTS.length],
    }));
  }, [leads, filteredLeads]);

  /* Source ROI from the filtered set. */
  const sources = useMemo(() => {
    const map = new Map<string, { leads: number; won: number }>();
    for (const l of filteredLeads) {
      const key = l.source || "Unknown";
      const entry = map.get(key) ?? { leads: 0, won: 0 };
      entry.leads += 1;
      if (isWon(l.status) || isWon(l.finalResult)) entry.won += 1;
      map.set(key, entry);
    }
    const arr = Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
    arr.sort((a, b) => b.leads - a.leads);
    return arr.slice(0, 6);
  }, [filteredLeads]);
  const totalSourceLeads = sources.reduce((a, s) => a + s.leads, 0) || 1;
  const SOURCE_COLORS = ["bg-sky-500", "bg-violet-500", "bg-rose-500", "bg-emerald-500", "bg-amber-500", "bg-indigo-500"];

  /* Scheduled follow-ups (upcoming/today/overdue) from real followUpDate. */
  const followUps = useMemo(() => {
    return filteredLeads
      .filter((l) => followUpState(l.followUpDate) !== "none")
      .sort((a, b) => (a.followUpDate < b.followUpDate ? -1 : 1))
      .slice(0, 6);
  }, [filteredLeads]);

  return (
    <div className="relative space-y-6 pb-8">
      {/* Hero */}
      <section className="rounded-3xl border border-zinc-200 bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">Sales</p>
            <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
              Lead <span className="brand-gradient-text">Management</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-zinc-600">
              A live view of your pipeline. Everything below reflects the same filters as your Leads list.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:gap-2">
            <Input
              value={filters.query}
              onChange={(e: any) => setFilters((f) => ({ ...f, query: e.target.value }))}
              iconLeft={<Search className="h-4 w-4" />}
              placeholder="Search leads..."
              className="h-10 rounded-xl border-zinc-200 bg-zinc-50 sm:w-64"
            />
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters((f) => ({ ...f, dateRange: e.target.value as LeadDateRange }))}
              className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-700 focus:border-[#4361EE] focus:outline-none"
            >
              {DATE_RANGES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <QuickAddButton />
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k, i) => {
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
              <h2 className="font-display text-lg font-bold">Leads by stage</h2>
            </div>
            <Link href="/leads/list" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
              Open list <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {stages.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-zinc-200 py-16 text-center text-sm text-muted-foreground">
              {hydrated ? "No leads match the current filters." : "Loading…"}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {stages.map((stage, si) => (
                <div key={stage.label} className="flex min-h-[220px] flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", stage.dot)} />
                      <span className="text-xs font-semibold text-zinc-700">{stage.label}</span>
                      <span className="text-[10px] font-semibold text-zinc-400">{stage.count}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {stage.leads.map((c, i) => (
                      <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * (si + i) }}
                        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_1px_0_rgba(15,15,15,0.02)]">
                        <div className="flex items-center gap-2">
                          <Avatar name={c.name || c.leadNo} size={28} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{c.name || c.leadNo}</p>
                            <p className="text-[11px] text-zinc-500">{c.device || c.leadCategory || "—"}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{c.source || "—"}</span>
                          {c.estimate != null && <span className="text-[11px] font-semibold tnum">{formatINR(c.estimate)}</span>}
                        </div>
                      </motion.div>
                    ))}
                    {stage.count > stage.leads.length && (
                      <p className="pt-1 text-center text-[11px] text-muted-foreground">+{stage.count - stage.leads.length} more</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {/* Source ROI */}
          <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Source ROI</p>
                <h3 className="font-display text-lg font-bold">Where leads come from</h3>
              </div>
              <Megaphone className="h-4 w-4 text-zinc-400" />
            </div>
            <ul className="mt-4 space-y-3">
              {sources.length === 0 && <li className="text-[12px] text-muted-foreground">No leads to summarise.</li>}
              {sources.map((s, i) => {
                const pct = Math.round((s.leads / totalSourceLeads) * 100);
                const conv = s.leads ? Math.round((s.won / s.leads) * 100) : 0;
                return (
                  <li key={s.name}>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", SOURCE_COLORS[i % SOURCE_COLORS.length])} /><span className="font-semibold text-zinc-800">{s.name}</span></div>
                      <span className="tnum text-zinc-500">{s.leads} · {conv}% won</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className={cn("h-full rounded-full", SOURCE_COLORS[i % SOURCE_COLORS.length])} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Scheduled follow-ups */}
          <div className="rounded-3xl border border-zinc-200 bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Upcoming</p>
                <h3 className="font-display text-lg font-bold">Scheduled follow-ups</h3>
              </div>
              <Calendar className="h-4 w-4 text-zinc-400" />
            </div>
            <ul className="mt-4 space-y-2.5">
              {followUps.length === 0 && <li className="text-[12px] text-muted-foreground">No follow-ups scheduled.</li>}
              {followUps.map((l, i) => {
                const s = followUpState(l.followUpDate);
                const tone = s === "overdue" ? "bg-red-50 text-[#922B21] ring-red-200" : s === "today" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-sky-50 text-sky-700 ring-sky-200";
                return (
                  <motion.li key={l.id} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}
                    className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5">
                    <Avatar name={l.name || l.leadNo} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.name || l.leadNo}</p>
                      <p className="text-[11px] text-zinc-500">{l.followUpAgent || l.agent || "—"}</p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", tone)}>
                      {s === "overdue" ? "Overdue" : s === "today" ? "Today" : l.followUpDate}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
            <Link href="/leads/list" className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-zinc-50 py-2 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100">
              View all in Leads <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}

/* ── Quick Add button with dropdown ── */
const QUICK_ADD_ITEMS = [
  { label: "Lead",      icon: UserPlus,      href: "/leads/list",      color: "text-violet-600 bg-violet-50" },
  { label: "Contact",   icon: Users,         href: "/leads/contacts",  color: "text-sky-600 bg-sky-50" },
  { label: "Company",   icon: Building2,     href: "/leads/companies", color: "text-indigo-600 bg-indigo-50" },
  { label: "Deal",      icon: Target,        href: "/leads/deals",     color: "text-emerald-600 bg-emerald-50" },
  { label: "Quotation", icon: FileText,      href: "/leads/quotations",color: "text-amber-600 bg-amber-50" },
  { label: "Task",      icon: ClipboardList, href: "/leads/tasks",     color: "text-rose-600 bg-rose-50" },
  { label: "Meeting",   icon: Calendar,      href: "/leads/meetings",  color: "text-[#4361EE] bg-[#EEF1FD]" },
];

function QuickAddButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)} variant="outline" className="gap-1.5 border-zinc-200">
        <Plus className="h-4 w-4" /> Quick Add
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-xl"
          >
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Create new</p>
            {QUICK_ADD_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-muted"
                >
                  <span className={cn("grid h-7 w-7 place-items-center rounded-lg", item.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </motion.div>
        </>
      )}
    </div>
  );
}
