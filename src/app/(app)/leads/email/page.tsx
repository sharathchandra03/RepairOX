"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Mail, Send, Inbox, Archive, Star, Paperclip, Clock,
  Plus, Search, MoreHorizontal, Reply, Forward, Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";

type EmailStatus = "sent" | "received" | "draft" | "scheduled";

interface EmailThread {
  id: string;
  subject: string;
  contact: string;
  company: string;
  preview: string;
  status: EmailStatus;
  time: string;
  date: string;
  starred: boolean;
  hasAttachment: boolean;
  read: boolean;
  replies: number;
}

const STATUS_ICON: Record<EmailStatus, typeof Mail> = {
  sent: Send,
  received: Inbox,
  draft: Mail,
  scheduled: Clock,
};

const EMAILS: EmailThread[] = [
  { id: "E-1", subject: "Quotation — iPhone Fleet Repair (Annual Contract)", contact: "Aarav Mehta",   company: "TechNova",   preview: "Hi Aarav, Please find attached the revised quotation with volume pricing for 50+ devices...",       status: "sent",      time: "2:30 PM", date: "Today",     starred: true,  hasAttachment: true,  read: true,  replies: 3 },
  { id: "E-2", subject: "Re: iPad Classroom Setup — 3 Tier Pricing",        contact: "Diya Sen",      company: "GreenLeaf",  preview: "Thanks Ritesh, I've reviewed the proposal. Can we discuss the premium tier in more detail?",       status: "received",  time: "11:45 AM",date: "Today",     starred: false, hasAttachment: false, read: false, replies: 2 },
  { id: "E-3", subject: "MacBook Air M2 — Service Estimate",                 contact: "Bina Soni",     company: "DesignHub",  preview: "Dear Bina, After our inspection, we're recommending a logic board replacement. Estimate below...", status: "sent",      time: "9:00 AM", date: "Today",     starred: false, hasAttachment: true,  read: true,  replies: 1 },
  { id: "E-4", subject: "Draft — Annual Maintenance Proposal for PixelCraft", contact: "Heena Kapoor", company: "PixelCraft", preview: "Hello Heena, Here's the annual maintenance agreement covering all 5 devices in your studio...",     status: "draft",     time: "—",       date: "Today",     starred: false, hasAttachment: true,  read: true,  replies: 0 },
  { id: "E-5", subject: "Re: Contract Negotiation — Volume Discount",        contact: "Falguni Patel", company: "NexaCore",   preview: "Kalai, we've approved the 15% volume discount. Please send the final contract for signature.",     status: "received",  time: "4:00 PM", date: "Yesterday", starred: true,  hasAttachment: false, read: true,  replies: 5 },
  { id: "E-6", subject: "Follow-up: iWatch Repair Feedback",                  contact: "Eshan Roy",     company: "CloudSync", preview: "Hi Eshan, Just checking in on the iWatch S8 screen repair. Would love your feedback on the...",     status: "sent",      time: "10:30 AM",date: "Yesterday", starred: false, hasAttachment: false, read: true,  replies: 0 },
  { id: "E-7", subject: "Scheduled: Partnership Proposal",                    contact: "Jaya Iyer",     company: "SwiftServe", preview: "Partnership proposal covering quarterly device servicing for all SwiftServe locations...",          status: "scheduled", time: "9:00 AM", date: "Jul 22",    starred: false, hasAttachment: true,  read: true,  replies: 0 },
];

const TABS = [
  { label: "All", value: "all" },
  { label: "Inbox", value: "received" },
  { label: "Sent", value: "sent" },
  { label: "Drafts", value: "draft" },
  { label: "Scheduled", value: "scheduled" },
];

export default function EmailPage() {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = EMAILS.filter((e) => {
    const matchTab = tab === "all" || e.status === tab;
    const matchQ = !query || `${e.subject} ${e.contact} ${e.company} ${e.preview}`.toLowerCase().includes(query.toLowerCase());
    return matchTab && matchQ;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Email"
        subtitle="Email threads and templated sequences sent to leads and companies."
        actions={
          <Can permission="send_communications">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Compose
            </Button>
          </Can>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs value={tab} onChange={setTab} options={TABS} size="sm" />
        <div className="w-full sm:w-72">
          <Input value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Search emails..." iconLeft={<Search className="h-4 w-4" />} />
        </div>
      </div>

      {/* Email list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        {filtered.map((email, i) => {
          const SIcon = STATUS_ICON[email.status];
          return (
            <motion.div
              key={email.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.02 * i }}
              className={cn(
                "group flex items-start gap-3 border-b border-border px-4 py-3.5 transition cursor-pointer hover:bg-muted/30",
                !email.read && "bg-[#FAFBFF]"
              )}
            >
              <Avatar name={email.contact} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className={cn("truncate text-[13px]", !email.read ? "font-bold text-zinc-900" : "font-semibold text-zinc-700")}>{email.contact}</p>
                    {email.company && <span className="shrink-0 text-[10px] text-muted-foreground">· {email.company}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {email.starred && <Star className="h-3 w-3 text-amber-500" fill="currentColor" />}
                    {email.hasAttachment && <Paperclip className="h-3 w-3 text-zinc-400" />}
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{email.date === "Today" ? email.time : email.date}</span>
                  </div>
                </div>
                <p className={cn("mt-0.5 truncate text-[12.5px]", !email.read ? "font-semibold text-zinc-800" : "text-zinc-700")}>{email.subject}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{email.preview}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset capitalize",
                    email.status === "sent" ? "bg-sky-50 text-sky-700 ring-sky-200" :
                    email.status === "received" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                    email.status === "draft" ? "bg-zinc-100 text-zinc-600 ring-zinc-200" :
                    "bg-violet-50 text-violet-700 ring-violet-200"
                  )}>
                    <SIcon className="h-2.5 w-2.5" /> {email.status}
                  </span>
                  {email.replies > 0 && (
                    <span className="text-[10px] text-muted-foreground">{email.replies} replies</span>
                  )}
                </div>
              </div>
              {/* Hover actions */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700"><Reply className="h-3.5 w-3.5" /></button>
                <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700"><Forward className="h-3.5 w-3.5" /></button>
                <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700"><Archive className="h-3.5 w-3.5" /></button>
              </div>
            </motion.div>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">No emails found</p>
            <p className="text-sm text-muted-foreground">Try a different tab or search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
