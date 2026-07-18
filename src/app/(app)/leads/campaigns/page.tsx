"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Filter, MoreVertical, Calendar, TrendingUp, DollarSign,
  Users, Target, X, Save, ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Can } from "@/components/common/can";
import { cn, formatINR } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: "draft" | "active" | "paused" | "completed";
  budget: number;
  spent: number;
  leads: number;
  engagement: number;
  startDate: string;
  endDate: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  completed: "bg-sky-50 text-sky-700 ring-sky-200",
};

const CAMPAIGNS: Campaign[] = [
  { id: "C-001", name: "Google Ads — Repair Fleet", type: "Paid Search", status: "active", budget: 45000, spent: 32000, leads: 38, engagement: 124, startDate: "Jul 1", endDate: "Jul 31" },
  { id: "C-002", name: "Meta — iPhone Repair Awareness", type: "Social", status: "active", budget: 28000, spent: 18500, leads: 22, engagement: 89, startDate: "Jul 5", endDate: "Jul 25" },
  { id: "C-003", name: "YouTube — How-To Series", type: "Video", status: "paused", budget: 18000, spent: 12000, leads: 14, engagement: 256, startDate: "Jun 15", endDate: "Jul 15" },
  { id: "C-004", name: "Referral Program Q3", type: "Referral", status: "draft", budget: 10000, spent: 0, leads: 0, engagement: 0, startDate: "Aug 1", endDate: "Sep 30" },
  { id: "C-005", name: "Diwali Promo — Trade-In", type: "Seasonal", status: "completed", budget: 35000, spent: 34800, leads: 45, engagement: 310, startDate: "Oct 15", endDate: "Nov 15" },
];

export default function CampaignsPage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Campaigns"
        subtitle="Track marketing efforts, monitor engagement, and measure ROI."
        actions={
          <Can permission="manage_sales">
            <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> Create Campaign
            </Button>
          </Can>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Active", value: CAMPAIGNS.filter((c) => c.status === "active").length, icon: Target, color: "text-emerald-600" },
          { label: "Total Budget", value: formatINR(CAMPAIGNS.reduce((a, c) => a + c.budget, 0)), icon: DollarSign, color: "text-[#4361EE]" },
          { label: "Leads Generated", value: CAMPAIGNS.reduce((a, c) => a + c.leads, 0), icon: Users, color: "text-violet-600" },
          { label: "Avg. CPL", value: formatINR(Math.round(CAMPAIGNS.reduce((a, c) => a + c.spent, 0) / Math.max(CAMPAIGNS.reduce((a, c) => a + c.leads, 0), 1))), icon: TrendingUp, color: "text-amber-600" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
              className="rounded-2xl border border-border/80 bg-card p-4 shadow-card">
              <Icon className={cn("h-4 w-4", kpi.color)} />
              <p className="font-display mt-2 text-xl font-extrabold tnum">{kpi.value}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Campaign list */}
      <div className="space-y-3">
        {CAMPAIGNS.map((campaign, i) => (
          <motion.div
            key={campaign.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i }}
            className="rounded-2xl border border-border/80 bg-card p-5 shadow-card transition hover:shadow-card-hover"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-bold text-[#4361EE]">#{campaign.id}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize", STATUS_STYLE[campaign.status])}>{campaign.status}</span>
                </div>
                <p className="mt-1.5 font-semibold text-zinc-900">{campaign.name}</p>
                <p className="text-[11px] text-muted-foreground">{campaign.type} · {campaign.startDate} — {campaign.endDate}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div><p className="text-sm font-bold tnum">{formatINR(campaign.budget)}</p><p className="text-[10px] text-muted-foreground">Budget</p></div>
                  <div><p className="text-sm font-bold tnum">{formatINR(campaign.spent)}</p><p className="text-[10px] text-muted-foreground">Spent</p></div>
                  <div><p className="text-sm font-bold tnum">{campaign.leads}</p><p className="text-[10px] text-muted-foreground">Leads</p></div>
                  <div><p className="text-sm font-bold tnum">{campaign.engagement}</p><p className="text-[10px] text-muted-foreground">Engagement</p></div>
                </div>
                <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700 transition">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create Campaign Slide-over */}
      <AnimatePresence>
        {showCreate && <CreateCampaignForm onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}

function CreateCampaignForm({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-foreground/40" onClick={onClose} />
      <motion.aside
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-bold">Create Campaign</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700 transition"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* General Information */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">General Information</p>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Campaign Name <span className="text-rose-500">*</span></Label><Input placeholder="e.g. Google Ads — Fleet Repair" /></div>
              <div className="space-y-1.5"><Label>Description</Label><textarea className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition resize-none h-20" placeholder="Campaign objectives and notes..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Estimated Budget <span className="text-rose-500">*</span></Label><div className="flex"><span className="flex h-9 items-center rounded-l-xl border border-r-0 border-border bg-muted px-2.5 text-[12px] font-medium text-zinc-600">INR</span><Input type="number" placeholder="0" className="rounded-l-none" /></div></div>
                <div className="space-y-1.5"><Label>Actual Expense</Label><div className="flex"><span className="flex h-9 items-center rounded-l-xl border border-r-0 border-border bg-muted px-2.5 text-[12px] font-medium text-zinc-600">INR</span><Input type="number" placeholder="0" className="rounded-l-none" /></div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Start Date <span className="text-rose-500">*</span></Label><Input type="date" /></div>
                <div className="space-y-1.5"><Label>End Date</Label><Input type="date" /></div>
              </div>
            </div>
          </section>

          {/* UTM Information */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">UTM Information</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>UTM Campaign <span className="text-rose-500">*</span></Label><Input placeholder="e.g. summer_sale" /></div>
                <div className="space-y-1.5"><Label>UTM Source <span className="text-rose-500">*</span></Label><Input placeholder="e.g. google" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>UTM Medium <span className="text-rose-500">*</span></Label><Input placeholder="e.g. cpc" /></div>
                <div className="space-y-1.5"><Label>UTM Content</Label><Input placeholder="e.g. cta_top" /></div>
              </div>
              <div className="space-y-1.5"><Label>UTM Term</Label><Input placeholder="e.g. crm+software" /></div>
            </div>
          </section>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={onClose}>Save as Draft</Button>
          <Button onClick={onClose}>Save & Add Activity</Button>
        </div>
      </motion.aside>
    </>
  );
}
