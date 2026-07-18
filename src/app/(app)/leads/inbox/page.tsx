"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Mail, MessageSquare, Search, Filter, Clock,
  PhoneIncoming, PhoneOutgoing, Send, CheckCheck, Inbox,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Channel = "all" | "call" | "email" | "whatsapp";

interface Message {
  id: string;
  channel: "call" | "email" | "whatsapp";
  contact: string;
  company: string;
  preview: string;
  time: string;
  direction: "in" | "out";
  read: boolean;
}

const MESSAGES: Message[] = [
  { id: "1",  channel: "whatsapp", contact: "Aarav Mehta",    company: "TechNova",   preview: "Sure, I'll drop off the devices tomorrow morning.",         time: "2:45 PM", direction: "in",  read: false },
  { id: "2",  channel: "call",     contact: "Diya Sen",       company: "GreenLeaf",  preview: "Inbound call — 8:22 — discussed iPad classroom setup",     time: "11:30 AM",direction: "in",  read: false },
  { id: "3",  channel: "email",    contact: "Falguni Patel",  company: "NexaCore",   preview: "Re: Contract Negotiation — approved the 15% discount",     time: "10:15 AM",direction: "in",  read: false },
  { id: "4",  channel: "whatsapp", contact: "Bina Soni",      company: "DesignHub",  preview: "Sent repair status photos — customer acknowledged ✓",      time: "9:30 AM", direction: "out", read: true },
  { id: "5",  channel: "email",    contact: "Heena Kapoor",   company: "PixelCraft", preview: "Quotation — Annual Maintenance Plan attached",             time: "9:00 AM", direction: "out", read: true },
  { id: "6",  channel: "call",     contact: "Eshan Roy",      company: "CloudSync",  preview: "Missed call — customer called during lunch break",         time: "1:05 PM", direction: "in",  read: true },
  { id: "7",  channel: "whatsapp", contact: "Diya Sen",       company: "GreenLeaf",  preview: "Can we schedule the demo for next Tuesday?",               time: "Yesterday",direction: "in", read: true },
  { id: "8",  channel: "email",    contact: "Aarav Mehta",    company: "TechNova",   preview: "Quotation — iPhone Fleet Repair (Annual Contract)",        time: "Yesterday",direction: "out",read: true },
  { id: "9",  channel: "call",     contact: "Gaurav Pillai",  company: "",           preview: "Quick intro call — interested in iMac repair",            time: "Jul 16",  direction: "out", read: true },
  { id: "10", channel: "whatsapp", contact: "Chetan Bhatt",   company: "",           preview: "Reminder: estimate valid until Friday",                    time: "Jul 16",  direction: "out", read: true },
];

const CHANNEL_CONFIG = {
  call:     { icon: Phone,         color: "text-emerald-600 bg-emerald-50", label: "Call" },
  email:    { icon: Mail,          color: "text-sky-600 bg-sky-50",         label: "Email" },
  whatsapp: { icon: MessageSquare, color: "text-green-600 bg-green-50",     label: "WhatsApp" },
};

const TABS = [
  { label: "All", value: "all" },
  { label: "Calls", value: "call" },
  { label: "Email", value: "email" },
  { label: "WhatsApp", value: "whatsapp" },
];

export default function InboxPage() {
  const [channel, setChannel] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = MESSAGES.filter((m) => {
    const matchChannel = channel === "all" || m.channel === channel;
    const matchQ = !query || `${m.contact} ${m.company} ${m.preview}`.toLowerCase().includes(query.toLowerCase());
    return matchChannel && matchQ;
  });

  const unread = MESSAGES.filter((m) => !m.read).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Communication Hub"
        subtitle={`Unified inbox — ${unread} unread across all channels.`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs value={channel} onChange={setChannel} options={TABS} size="sm" />
        <div className="w-full sm:w-72">
          <Input value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Search messages..." iconLeft={<Search className="h-4 w-4" />} />
        </div>
      </div>

      {/* Channel stats */}
      <div className="flex items-center gap-3">
        {(["call", "email", "whatsapp"] as const).map((ch) => {
          const cfg = CHANNEL_CONFIG[ch];
          const Icon = cfg.icon;
          const count = MESSAGES.filter((m) => m.channel === ch && !m.read).length;
          return (
            <div key={ch} className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold", cfg.color)}>
              <Icon className="h-3.5 w-3.5" /> {cfg.label}
              {count > 0 && <span className="rounded-md bg-white/60 px-1.5 py-0.5 text-[10px]">{count}</span>}
            </div>
          );
        })}
      </div>

      {/* Message list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <AnimatePresence>
          {filtered.map((msg, i) => {
            const cfg = CHANNEL_CONFIG[msg.channel];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.02 * i }}
                className={cn(
                  "flex items-center gap-3 border-b border-border px-4 py-3.5 cursor-pointer transition hover:bg-muted/30",
                  !msg.read && "bg-[#FAFBFF]"
                )}
              >
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", cfg.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <Avatar name={msg.contact} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-[13px]", !msg.read ? "font-bold text-zinc-900" : "font-semibold text-zinc-700")}>{msg.contact}</p>
                      {msg.company && <span className="text-[10px] text-muted-foreground">· {msg.company}</span>}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{msg.time}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {msg.direction === "out" && <Send className="h-3 w-3 shrink-0 text-zinc-400" />}
                    {msg.direction === "in" && msg.channel === "call" && <PhoneIncoming className="h-3 w-3 shrink-0 text-zinc-400" />}
                    <p className="truncate text-[12px] text-muted-foreground">{msg.preview}</p>
                  </div>
                </div>
                {!msg.read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#4361EE]" />}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">No messages</p>
            <p className="text-sm text-muted-foreground">Try a different channel or search term.</p>
          </div>
        )}
      </div>
    </div>
  );
}
