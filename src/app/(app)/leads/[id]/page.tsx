"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft, Phone, Mail, MessageSquare, Star, Clock, Building2, MapPin,
  Edit3, MoreHorizontal, CheckCircle2, Circle, Calendar, FileText,
  Send, Target, TrendingUp, User, Tag, Globe, Zap, ChevronRight,
  Plus, ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/tabs";
import { cn, formatINR } from "@/lib/utils";

/* ── Mock lead data ── */
const LEAD = {
  id: "LD-001",
  name: "Aarav Mehta",
  email: "aarav@technova.in",
  phone: "+91 98765 43210",
  company: "TechNova Pvt Ltd",
  role: "Founder & CEO",
  location: "Bengaluru, Karnataka",
  website: "technova.in",
  source: "Google Ads",
  status: "qualified" as const,
  priority: "hot" as const,
  score: 92,
  value: 125000,
  owner: "Kalai S.",
  createdAt: "Jul 6, 2026",
  lastActivity: "2 hours ago",
  followUpDate: "Today, 4:00 PM",
  tags: ["Enterprise", "Fleet", "Annual Contract"],
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-50 text-sky-700 ring-sky-200",
  contacted: "bg-violet-50 text-violet-700 ring-violet-200",
  qualified: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  proposal: "bg-amber-50 text-amber-700 ring-amber-200",
  won: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  lost: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

/* ── Timeline data ── */
const TIMELINE = [
  { id: "1", type: "call",    title: "Call — Discussed fleet repair timeline",          desc: "Customer confirmed device drop-off tomorrow. Needs 50 iPhone 14 Pro screens replaced.", user: "Kalai S.", time: "2h ago", icon: Phone, color: "text-emerald-600 bg-emerald-50 ring-emerald-200" },
  { id: "2", type: "deal",    title: "Deal moved to Qualified",                         desc: "iPhone Fleet Repair Contract advanced from Contacted stage.",                            user: "Kalai S.", time: "3h ago", icon: Target, color: "text-indigo-600 bg-indigo-50 ring-indigo-200" },
  { id: "3", type: "email",   title: "Quotation sent — Annual Fleet Package",            desc: "3-tier pricing proposal with volume discounts attached as PDF.",                         user: "Kalai S.", time: "Yesterday", icon: Mail, color: "text-sky-600 bg-sky-50 ring-sky-200" },
  { id: "4", type: "meeting", title: "Discovery meeting — Video call",                   desc: "45min call to understand fleet size, device mix, and SLA expectations.",                 user: "Kalai S.", time: "Jul 15", icon: Calendar, color: "text-violet-600 bg-violet-50 ring-violet-200" },
  { id: "5", type: "note",    title: "Note — Budget approval pending",                   desc: "Aarav mentioned board approval needed for contracts above ₹1L. ETA 1 week.",            user: "Ritesh Kumar", time: "Jul 14", icon: FileText, color: "text-amber-600 bg-amber-50 ring-amber-200" },
  { id: "6", type: "wa",      title: "WhatsApp — Shared repair portfolio",               desc: "Sent case study of similar fleet management we did for PixelCraft.",                     user: "Manoj S.", time: "Jul 12", icon: MessageSquare, color: "text-green-600 bg-green-50 ring-green-200" },
  { id: "7", type: "created", title: "Lead created from Google Ads campaign",            desc: "Landed on repair-fleet page, submitted form with 'Annual Contract' interest.",           user: "System", time: "Jul 6", icon: Zap, color: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]" },
];

/* ── Tasks ── */
const TASKS = [
  { id: "T-1", title: "Send revised quotation with volume discount", done: false, due: "Today" },
  { id: "T-2", title: "Schedule contract walkthrough call", done: false, due: "Tomorrow" },
  { id: "T-3", title: "Follow up on board approval status", done: false, due: "Jul 25" },
  { id: "T-4", title: "Share repair SLA document", done: true, due: "Jul 15" },
];

/* ── Deals ── */
const DEALS = [
  { id: "D-001", title: "iPhone Fleet Repair Contract", value: 125000, stage: "Qualified", probability: 70 },
  { id: "D-004", title: "Corporate Device Management", value: 450000, stage: "Discovery", probability: 25 },
];

/* ── Notes ── */
const NOTES = [
  { id: "N-1", text: "Budget approval pending from board — contracts above ₹1L need sign-off. Expected within 1 week.", author: "Ritesh Kumar", time: "Jul 14" },
  { id: "N-2", text: "Prefers WhatsApp communication over email. Responsive between 10 AM – 6 PM.", author: "Kalai S.", time: "Jul 10" },
  { id: "N-3", text: "Previously worked with a competitor service. Switched due to inconsistent SLA. Quality is top priority.", author: "Kalai S.", time: "Jul 7" },
];

export default function LeadDetailPage() {
  const [activeTab, setActiveTab] = useState("timeline");

  return (
    <div className="space-y-5">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/leads/list" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="h-4 w-4" /> Back to leads
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full"><Edit3 className="h-3.5 w-3.5" /> Edit</Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full"><ArrowUpRight className="h-3.5 w-3.5" /> Convert</Button>
          <Button variant="outline" size="sm" className="rounded-full"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Lead Profile Header */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={LEAD.name} size={56} />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-xl font-extrabold tracking-tight">{LEAD.name}</h1>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize", STATUS_STYLE[LEAD.status])}>
                  {LEAD.status}
                </span>
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-rose-600">
                  <Star className="h-3 w-3" fill="currentColor" /> Hot
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{LEAD.role} at {LEAD.company}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {LEAD.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                    <Tag className="h-2.5 w-2.5" /> {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Communication actions */}
          <div className="flex items-center gap-1.5">
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-sm transition hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200">
              <Phone className="h-4 w-4" />
            </button>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-sm transition hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200">
              <Mail className="h-4 w-4" />
            </button>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-sm transition hover:bg-green-50 hover:text-green-600 hover:border-green-200">
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</p>
            <p className="mt-1 text-lg font-bold text-emerald-600 tnum">{LEAD.score}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pipeline Value</p>
            <p className="mt-1 text-lg font-bold tnum">{formatINR(LEAD.value)}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Follow-up</p>
            <p className="mt-1 text-sm font-semibold text-rose-600">{LEAD.followUpDate}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Owner</p>
            <p className="mt-1 text-sm font-semibold">{LEAD.owner}</p>
          </div>
        </div>
      </motion.section>

      {/* Two-column layout: Main + Sidebar */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">

        {/* Main content */}
        <div className="space-y-5">
          {/* Tab switcher */}
          <SegmentedTabs
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { label: "Timeline", value: "timeline" },
              { label: "Tasks", value: "tasks" },
              { label: "Deals", value: "deals" },
              { label: "Notes", value: "notes" },
            ]}
          />

          <AnimatePresence mode="wait">
            {activeTab === "timeline" && (
              <motion.div key="timeline" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-1">
                  {TIMELINE.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <motion.div key={item.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }} className="relative flex gap-4 pl-2">
                        <div className={cn("relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1", item.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4 shadow-sm mb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-zinc-900">{item.title}</p>
                              <p className="mt-0.5 text-[12px] text-muted-foreground">{item.desc}</p>
                            </div>
                            <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">{item.time}</span>
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">{item.user}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeTab === "tasks" && (
              <motion.div key="tasks" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2.5">
                {TASKS.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <button className={cn("mt-0.5 shrink-0", task.done ? "text-emerald-500" : "text-zinc-300 hover:text-[#4361EE]")}>
                      {task.done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </button>
                    <div className="flex-1">
                      <p className={cn("font-semibold", task.done && "line-through text-muted-foreground")}>{task.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Due {task.due}</p>
                    </div>
                  </div>
                ))}
                <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-3 text-[12px] font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition">
                  <Plus className="h-3.5 w-3.5" /> Add task
                </button>
              </motion.div>
            )}

            {activeTab === "deals" && (
              <motion.div key="deals" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                {DEALS.map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                        <Target className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{deal.title}</p>
                        <p className="text-[11px] text-muted-foreground">{deal.stage} · {deal.probability}% probability</p>
                      </div>
                    </div>
                    <p className="font-semibold tnum">{formatINR(deal.value)}</p>
                  </div>
                ))}
                <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-3 text-[12px] font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition">
                  <Plus className="h-3.5 w-3.5" /> Create deal
                </button>
              </motion.div>
            )}

            {activeTab === "notes" && (
              <motion.div key="notes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                {NOTES.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <p className="text-[13px] text-zinc-800 leading-relaxed">{note.text}</p>
                    <p className="mt-2.5 text-[11px] text-muted-foreground">{note.author} · {note.time}</p>
                  </div>
                ))}
                <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-3 text-[12px] font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition">
                  <Plus className="h-3.5 w-3.5" /> Add note
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-4">
          {/* Contact details card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact Details</p>
            <div className="mt-3 space-y-2.5 text-[12.5px]">
              <div className="flex items-center gap-2.5 text-zinc-700"><Mail className="h-3.5 w-3.5 text-zinc-400" /> {LEAD.email}</div>
              <div className="flex items-center gap-2.5 text-zinc-700"><Phone className="h-3.5 w-3.5 text-zinc-400" /> {LEAD.phone}</div>
              <div className="flex items-center gap-2.5 text-zinc-700"><Building2 className="h-3.5 w-3.5 text-zinc-400" /> {LEAD.company}</div>
              <div className="flex items-center gap-2.5 text-zinc-700"><MapPin className="h-3.5 w-3.5 text-zinc-400" /> {LEAD.location}</div>
              <div className="flex items-center gap-2.5 text-zinc-700"><Globe className="h-3.5 w-3.5 text-zinc-400" /> {LEAD.website}</div>
            </div>
          </div>

          {/* Lead info card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lead Info</p>
            <div className="mt-3 space-y-2.5 text-[12.5px]">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Source</span><span className="font-medium">{LEAD.source}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{LEAD.createdAt}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Last Activity</span><span className="font-medium">{LEAD.lastActivity}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Owner</span><span className="font-medium">{LEAD.owner}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">ID</span><span className="font-mono text-[11px] text-zinc-500">{LEAD.id}</span></div>
            </div>
          </div>

          {/* Conversion CTA */}
          <div className="rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD]/50 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg brand-gradient text-white shadow-sm">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Ready to convert?</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">Turn this lead into a repair ticket — customer details auto-fill.</p>
                <Button size="sm" className="mt-3 rounded-full gap-1.5">
                  Convert to Ticket <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
