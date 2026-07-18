"use client";

import { motion } from "framer-motion";
import { Plus, Inbox, Star, Clock, AlertCircle, TrendingUp, Building2, Filter } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";

interface SmartList {
  id: string;
  name: string;
  description: string;
  count: number;
  icon: typeof Inbox;
  color: string;
  bg: string;
  updatedAt: string;
}

const LISTS: SmartList[] = [
  { id: "SL-1", name: "Hot Leads",            description: "Score 80+ and active in last 48 hours",          count: 8,  icon: Star,         color: "text-rose-600",    bg: "bg-rose-50 ring-rose-200",    updatedAt: "Live" },
  { id: "SL-2", name: "Follow-up Today",      description: "Leads with follow-up date set to today",         count: 5,  icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50 ring-amber-200",  updatedAt: "Live" },
  { id: "SL-3", name: "Quotation Pending",    description: "Leads awaiting quotation approval or response",  count: 4,  icon: AlertCircle,  color: "text-orange-600",  bg: "bg-orange-50 ring-orange-200",updatedAt: "Live" },
  { id: "SL-4", name: "No Response (72h+)",   description: "Contacted leads with no response in 3+ days",    count: 6,  icon: Inbox,        color: "text-zinc-600",    bg: "bg-zinc-100 ring-zinc-200",   updatedAt: "Live" },
  { id: "SL-5", name: "High Priority",        description: "Marked as hot priority by team",                 count: 12, icon: TrendingUp,   color: "text-violet-600",  bg: "bg-violet-50 ring-violet-200",updatedAt: "Live" },
  { id: "SL-6", name: "By Company — TechNova",description: "All leads and contacts from TechNova Pvt Ltd",   count: 4,  icon: Building2,    color: "text-[#4361EE]",   bg: "bg-[#EEF1FD] ring-[#B3BFF6]", updatedAt: "2h ago" },
  { id: "SL-7", name: "Google Ads Leads",      description: "Leads captured from Google Ads campaigns",       count: 18, icon: Filter,       color: "text-sky-600",     bg: "bg-sky-50 ring-sky-200",      updatedAt: "1h ago" },
  { id: "SL-8", name: "Won This Month",       description: "Successfully converted leads in current month",  count: 3,  icon: TrendingUp,   color: "text-emerald-600", bg: "bg-emerald-50 ring-emerald-200",updatedAt: "Live" },
];

export default function SmartListsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Smart Lists"
        subtitle="Saved, auto-updating segments of leads based on score, source, or stage."
        actions={
          <Can permission="create">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New List
            </Button>
          </Can>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LISTS.map((list, i) => {
          const Icon = list.icon;
          return (
            <motion.div
              key={list.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i }}
              className="group cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-card transition hover:shadow-card-hover hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div className={cn("grid h-10 w-10 place-items-center rounded-xl ring-1", list.bg)}>
                  <Icon className={cn("h-5 w-5", list.color)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">{list.updatedAt}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF1FD] text-[12px] font-bold text-[#4361EE]">
                    {list.count}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <p className="font-semibold text-zinc-900">{list.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{list.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
