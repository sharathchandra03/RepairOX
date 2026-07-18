"use client";

import { motion } from "framer-motion";
import { Phone, Mail, MessageSquare, FileText, CheckCircle2, Calendar, UserPlus, Target } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ActivityType = "call" | "email" | "whatsapp" | "note" | "task_done" | "meeting" | "lead_created" | "deal_moved";

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  lead: string;
  user: string;
  time: string;
}

const TYPE_CONFIG: Record<ActivityType, { icon: typeof Phone; color: string; bg: string }> = {
  call:         { icon: Phone,        color: "text-emerald-600", bg: "bg-emerald-50 ring-emerald-200" },
  email:        { icon: Mail,         color: "text-sky-600",     bg: "bg-sky-50 ring-sky-200" },
  whatsapp:     { icon: MessageSquare,color: "text-green-600",   bg: "bg-green-50 ring-green-200" },
  note:         { icon: FileText,     color: "text-amber-600",   bg: "bg-amber-50 ring-amber-200" },
  task_done:    { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 ring-emerald-200" },
  meeting:      { icon: Calendar,     color: "text-violet-600",  bg: "bg-violet-50 ring-violet-200" },
  lead_created: { icon: UserPlus,     color: "text-[#4361EE]",   bg: "bg-[#EEF1FD] ring-[#B3BFF6]" },
  deal_moved:   { icon: Target,       color: "text-indigo-600",  bg: "bg-indigo-50 ring-indigo-200" },
};

const ACTIVITIES: Activity[] = [
  { id: "A-1",  type: "call",         title: "Call with Aarav Mehta",              description: "Discussed iPhone 14 Pro repair timeline — customer confirmed drop-off tomorrow",     lead: "Aarav Mehta",   user: "Kalai S.",     time: "15 min ago" },
  { id: "A-2",  type: "deal_moved",   title: "Deal moved to Closing",             description: "iPhone Fleet Repair Contract moved from Negotiation → Closing",                       lead: "Aarav Mehta",   user: "Kalai S.",     time: "32 min ago" },
  { id: "A-3",  type: "email",        title: "Quotation sent to Diya Sen",        description: "iPad Classroom Setup proposal with 3 pricing tiers attached",                         lead: "Diya Sen",      user: "Ritesh Kumar", time: "1h ago" },
  { id: "A-4",  type: "whatsapp",     title: "WhatsApp message to Bina Soni",     description: "Shared MacBook Air M2 repair status photos — customer acknowledged",                  lead: "Bina Soni",     user: "Manoj S.",     time: "2h ago" },
  { id: "A-5",  type: "meeting",      title: "Meeting scheduled with Falguni",    description: "Contract negotiation meeting set for tomorrow at 11 AM — in-person at BTM Layout",    lead: "Falguni Patel", user: "Kalai S.",     time: "3h ago" },
  { id: "A-6",  type: "task_done",    title: "Task completed",                    description: "Call Eshan for feedback on iWatch repair — marked as done",                            lead: "Eshan Roy",     user: "Kalai S.",     time: "4h ago" },
  { id: "A-7",  type: "note",         title: "Note added to Heena Kapoor",        description: "Customer wants to add 2 more MacBooks to the annual maintenance contract",             lead: "Heena Kapoor",  user: "Ritesh Kumar", time: "5h ago" },
  { id: "A-8",  type: "lead_created", title: "New lead created",                  description: "Gaurav Pillai — Meta campaign, interested in iMac 24 logic board repair",              lead: "Gaurav Pillai", user: "System",       time: "6h ago" },
  { id: "A-9",  type: "call",         title: "Missed call from Jaya Iyer",        description: "Left voicemail — will try again at 4 PM",                                             lead: "Jaya Iyer",     user: "Manoj S.",     time: "7h ago" },
  { id: "A-10", type: "whatsapp",     title: "WhatsApp follow-up to Chetan Bhatt",description: "Reminded about iPad Pro 11 estimate approval — no response yet",                      lead: "Chetan Bhatt",  user: "Kalai S.",     time: "Yesterday" },
];

export default function ActivitiesPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Activities"
        subtitle="A unified timeline of every touchpoint across calls, emails, and meetings."
      />

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-1">
          {ACTIVITIES.map((activity, i) => {
            const config = TYPE_CONFIG[activity.type];
            const Icon = config.icon;
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i }}
                className="relative flex gap-4 pl-2"
              >
                {/* Icon dot */}
                <div className={cn("relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1", config.bg)}>
                  <Icon className={cn("h-4 w-4", config.color)} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4 shadow-sm mb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">{activity.title}</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{activity.description}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">{activity.time}</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Avatar name={activity.user} size={16} /> {activity.user}</span>
                    <span>·</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">{activity.lead}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
