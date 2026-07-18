"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Plus,
  Search, Filter, Play, User,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";

type CallDirection = "inbound" | "outbound" | "missed";
type CallOutcome = "connected" | "voicemail" | "no_answer" | "busy" | "scheduled";

interface CallLog {
  id: string;
  contact: string;
  company: string;
  direction: CallDirection;
  outcome: CallOutcome;
  duration: string;
  notes: string;
  time: string;
  date: string;
  user: string;
  recording: boolean;
}

const DIRECTION_CONFIG: Record<CallDirection, { icon: typeof Phone; label: string; color: string }> = {
  inbound:  { icon: PhoneIncoming, label: "Inbound",  color: "text-emerald-600 bg-emerald-50 ring-emerald-200" },
  outbound: { icon: PhoneOutgoing, label: "Outbound", color: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]" },
  missed:   { icon: PhoneMissed,   label: "Missed",   color: "text-rose-600 bg-rose-50 ring-rose-200" },
};

const OUTCOME_STYLE: Record<CallOutcome, string> = {
  connected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  voicemail: "bg-amber-50 text-amber-700 ring-amber-200",
  no_answer: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  busy:      "bg-rose-50 text-rose-600 ring-rose-200",
  scheduled: "bg-violet-50 text-violet-700 ring-violet-200",
};

const CALLS: CallLog[] = [
  { id: "CL-1", contact: "Aarav Mehta",    company: "TechNova",   direction: "outbound", outcome: "connected", duration: "12:34", notes: "Discussed fleet repair timeline — customer confirmed drop-off tomorrow",               time: "2:15 PM", date: "Today",     user: "Kalai S.",     recording: true },
  { id: "CL-2", contact: "Diya Sen",       company: "GreenLeaf",  direction: "inbound",  outcome: "connected", duration: "8:22",  notes: "Asked about iPad classroom setup pricing — sent follow-up email",                    time: "11:30 AM",date: "Today",     user: "Ritesh Kumar", recording: true },
  { id: "CL-3", contact: "Bina Soni",      company: "DesignHub",  direction: "outbound", outcome: "voicemail", duration: "0:45",  notes: "Left voicemail regarding MacBook service estimate — will retry at 4 PM",             time: "10:00 AM",date: "Today",     user: "Manoj S.",     recording: false },
  { id: "CL-4", contact: "Eshan Roy",      company: "CloudSync",  direction: "missed",   outcome: "no_answer", duration: "—",     notes: "Missed call — customer called during lunch break",                                   time: "1:05 PM", date: "Today",     user: "Kalai S.",     recording: false },
  { id: "CL-5", contact: "Falguni Patel",  company: "NexaCore",   direction: "outbound", outcome: "connected", duration: "22:10", notes: "Contract negotiation — agreed on volume pricing, sending revised quote",              time: "4:30 PM", date: "Yesterday", user: "Kalai S.",     recording: true },
  { id: "CL-6", contact: "Heena Kapoor",   company: "PixelCraft", direction: "inbound",  outcome: "connected", duration: "6:15",  notes: "Wants to add 2 more MacBooks to annual plan — updating quote",                       time: "3:00 PM", date: "Yesterday", user: "Ritesh Kumar", recording: true },
  { id: "CL-7", contact: "Jaya Iyer",      company: "SwiftServe", direction: "outbound", outcome: "no_answer", duration: "—",     notes: "No answer — 3rd attempt, will try WhatsApp instead",                                 time: "11:00 AM",date: "Yesterday", user: "Manoj S.",     recording: false },
  { id: "CL-8", contact: "Gaurav Pillai",  company: "",           direction: "outbound", outcome: "connected", duration: "4:50",  notes: "Quick intro call — interested in iMac repair, scheduled on-site visit",              time: "9:30 AM", date: "Jul 16",    user: "Kalai S.",     recording: true },
  { id: "CL-9", contact: "Chetan Bhatt",   company: "",           direction: "missed",   outcome: "no_answer", duration: "—",     notes: "Customer tried calling — returned call 20 min later, connected",                     time: "2:00 PM", date: "Jul 16",    user: "Manoj S.",     recording: false },
];

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Inbound", value: "inbound" },
  { label: "Outbound", value: "outbound" },
  { label: "Missed", value: "missed" },
];

export default function CallsPage() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = CALLS.filter((c) => {
    const matchDir = filter === "all" || c.direction === filter;
    const matchQ = !query || `${c.contact} ${c.company} ${c.notes}`.toLowerCase().includes(query.toLowerCase());
    return matchDir && matchQ;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Calls"
        subtitle="Call history with recordings, outcomes, and notes for every lead."
        actions={
          <Can permission="send_communications">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Log Call
            </Button>
          </Can>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs value={filter} onChange={setFilter} options={FILTERS} size="sm" />
        <div className="w-full sm:w-72">
          <Input value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Search calls..." iconLeft={<Search className="h-4 w-4" />} />
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {[
          { label: "Today", count: CALLS.filter((c) => c.date === "Today").length, color: "text-[#4361EE] bg-[#EEF1FD]" },
          { label: "Connected", count: CALLS.filter((c) => c.outcome === "connected").length, color: "text-emerald-700 bg-emerald-50" },
          { label: "Missed", count: CALLS.filter((c) => c.direction === "missed").length, color: "text-rose-600 bg-rose-50" },
          { label: "With Recording", count: CALLS.filter((c) => c.recording).length, color: "text-violet-700 bg-violet-50" },
        ].map((s) => (
          <div key={s.label} className={cn("flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold", s.color)}>
            {s.label} <span className="rounded-md bg-white/60 px-1.5 py-0.5 text-[10px]">{s.count}</span>
          </div>
        ))}
      </div>

      {/* Call list */}
      <div className="space-y-2.5">
        {filtered.map((call, i) => {
          const dir = DIRECTION_CONFIG[call.direction];
          const DirIcon = dir.icon;
          return (
            <motion.div
              key={call.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.025 * i }}
              className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition hover:shadow-card-hover"
            >
              <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1", dir.color)}>
                <DirIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-900">{call.contact}</p>
                      {call.company && <span className="text-[11px] text-muted-foreground">· {call.company}</span>}
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">{call.notes}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {call.recording && (
                      <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 opacity-0 transition hover:bg-violet-50 hover:text-violet-600 group-hover:opacity-100" title="Play recording">
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[11px]">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset capitalize", OUTCOME_STYLE[call.outcome])}>
                    {call.outcome.replace("_", " ")}
                  </span>
                  {call.duration !== "—" && (
                    <span className="flex items-center gap-1 text-zinc-500"><Clock className="h-3 w-3" /> {call.duration}</span>
                  )}
                  <span className="flex items-center gap-1 text-zinc-500"><User className="h-3 w-3" /> {call.user}</span>
                  <span className="text-zinc-400">{call.date}, {call.time}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <Phone className="h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">No calls match your filter</p>
          <p className="text-sm text-muted-foreground">Try a different direction or search term.</p>
        </div>
      )}
    </div>
  );
}
