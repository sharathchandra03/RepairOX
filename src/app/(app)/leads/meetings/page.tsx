"use client";

import { motion } from "framer-motion";
import { Plus, Video, MapPin, Clock, Users, Calendar } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";

interface Meeting {
  id: string;
  title: string;
  with: string;
  company: string;
  type: "video" | "in_person" | "phone";
  date: string;
  time: string;
  duration: string;
  status: "upcoming" | "today" | "completed";
}

const TYPE_ICON = { video: Video, in_person: MapPin, phone: Clock };
const TYPE_LABEL = { video: "Video Call", in_person: "In Person", phone: "Phone" };

const MEETINGS: Meeting[] = [
  { id: "M-1", title: "Discovery call — TechNova fleet deal",       with: "Aarav Mehta",   company: "TechNova",      type: "video",     date: "Today",    time: "2:00 PM",  duration: "30min", status: "today" },
  { id: "M-2", title: "Quotation walkthrough",                      with: "Diya Sen",      company: "GreenLeaf",     type: "video",     date: "Today",    time: "4:30 PM",  duration: "45min", status: "today" },
  { id: "M-3", title: "Contract negotiation",                       with: "Falguni Patel", company: "NexaCore Labs", type: "in_person", date: "Tomorrow", time: "11:00 AM", duration: "1hr",   status: "upcoming" },
  { id: "M-4", title: "Follow-up on MacBook service",               with: "Bina Soni",     company: "DesignHub",     type: "phone",     date: "Jul 21",   time: "10:00 AM", duration: "15min", status: "upcoming" },
  { id: "M-5", title: "Partnership discussion",                     with: "Eshan Roy",     company: "CloudSync",     type: "video",     date: "Jul 22",   time: "3:00 PM",  duration: "30min", status: "upcoming" },
  { id: "M-6", title: "Demo — annual maintenance plan",             with: "Heena Kapoor",  company: "PixelCraft",    type: "in_person", date: "Jul 15",   time: "2:00 PM",  duration: "1hr",   status: "completed" },
];

export default function MeetingsPage() {
  const today = MEETINGS.filter((m) => m.status === "today");
  const upcoming = MEETINGS.filter((m) => m.status === "upcoming");
  const completed = MEETINGS.filter((m) => m.status === "completed");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Meetings"
        subtitle="Scheduled calls and visits with leads and companies."
        actions={
          <Can permission="create">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Schedule Meeting
            </Button>
          </Can>
        }
      />

      {/* Today section */}
      {today.length > 0 && (
        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-rose-600">Today</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {today.map((m, i) => <MeetingCard key={m.id} meeting={m} index={i} />)}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {upcoming.map((m, i) => <MeetingCard key={m.id} meeting={m} index={i} />)}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Completed</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {completed.map((m, i) => <MeetingCard key={m.id} meeting={m} index={i} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting: m, index }: { meeting: Meeting; index: number }) {
  const Icon = TYPE_ICON[m.type];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * index }}
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-card transition hover:shadow-card-hover",
        m.status === "today" ? "border-[#B3BFF6] bg-[#FAFBFF]" : "border-border"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "grid h-10 w-10 place-items-center rounded-xl",
            m.status === "today" ? "bg-[#4361EE] text-white" : "bg-zinc-100 text-zinc-600"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900">{m.title}</p>
            <p className="text-[11px] text-muted-foreground">{TYPE_LABEL[m.type]} · {m.duration}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={m.with} size={24} />
          <span className="text-[12px] text-zinc-700">{m.with}</span>
          <span className="text-[11px] text-muted-foreground">· {m.company}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3" /> {m.date}, {m.time}
        </div>
      </div>
    </motion.div>
  );
}
