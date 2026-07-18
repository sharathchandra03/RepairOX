"use client";

import { motion } from "framer-motion";
import {
  Plus, TrendingUp, DollarSign, Target, Clock,
  MoreHorizontal, ArrowUpRight, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn, formatINR } from "@/lib/utils";

/* ── Mock data ── */
type DealStage = "discovery" | "proposal" | "negotiation" | "closing" | "won" | "lost";

interface Deal {
  id: string;
  title: string;
  contact: string;
  company: string;
  value: number;
  stage: DealStage;
  probability: number;
  closeDate: string;
  owner: string;
  age: string;
}

const STAGE_CONFIG: Record<DealStage, { label: string; color: string; bg: string }> = {
  discovery:   { label: "Discovery",    color: "text-sky-700",     bg: "bg-sky-50 ring-sky-200" },
  proposal:    { label: "Proposal",     color: "text-violet-700",  bg: "bg-violet-50 ring-violet-200" },
  negotiation: { label: "Negotiation",  color: "text-amber-700",   bg: "bg-amber-50 ring-amber-200" },
  closing:     { label: "Closing",      color: "text-orange-700",  bg: "bg-orange-50 ring-orange-200" },
  won:         { label: "Won",          color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200" },
  lost:        { label: "Lost",         color: "text-zinc-500",    bg: "bg-zinc-100 ring-zinc-200" },
};

const DEALS: Deal[] = [
  { id: "D-001", title: "iPhone Fleet Repair Contract",     contact: "Aarav Mehta",   company: "TechNova",      value: 125000, stage: "closing",     probability: 85, closeDate: "Jul 25",  owner: "Kalai S.",    age: "12d" },
  { id: "D-002", title: "MacBook Bulk Service Agreement",   contact: "Falguni Patel", company: "NexaCore Labs", value: 280000, stage: "negotiation", probability: 60, closeDate: "Aug 5",   owner: "Manoj S.",    age: "18d" },
  { id: "D-003", title: "iPad Classroom Setup",             contact: "Diya Sen",      company: "GreenLeaf Org", value: 95000,  stage: "proposal",    probability: 45, closeDate: "Aug 15",  owner: "Ritesh Kumar",age: "7d" },
  { id: "D-004", title: "Corporate Device Management",      contact: "Heena Kapoor",  company: "PixelCraft",    value: 450000, stage: "discovery",   probability: 25, closeDate: "Sep 1",   owner: "Kalai S.",    age: "3d" },
  { id: "D-005", title: "Quarterly Maintenance Plan",       contact: "Eshan Roy",     company: "CloudSync",     value: 72000,  stage: "won",         probability: 100,closeDate: "Jul 18",  owner: "Manoj S.",    age: "21d" },
  { id: "D-006", title: "Warranty Extension Package",       contact: "Bina Soni",     company: "DesignHub",     value: 38000,  stage: "lost",        probability: 0,  closeDate: "Jul 10",  owner: "Ritesh Kumar",age: "30d" },
  { id: "D-007", title: "Screen Replacement Batch",         contact: "Jaya Iyer",     company: "SwiftServe",    value: 65000,  stage: "proposal",    probability: 50, closeDate: "Jul 28",  owner: "Kalai S.",    age: "9d" },
];

const pipelineValue = DEALS.filter((d) => d.stage !== "lost" && d.stage !== "won").reduce((a, d) => a + d.value, 0);
const wonValue = DEALS.filter((d) => d.stage === "won").reduce((a, d) => a + d.value, 0);
const avgDealSize = Math.round(DEALS.reduce((a, d) => a + d.value, 0) / DEALS.length);
const closingThisWeek = DEALS.filter((d) => d.stage === "closing").length;

export default function DealsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Deals"
        subtitle="Track deals across stages from discovery to close."
        actions={
          <Can permission="manage_sales">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Deal
            </Button>
          </Can>
        }
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Pipeline Value", value: formatINR(pipelineValue), icon: Target, tone: "violet" },
          { label: "Won This Month", value: formatINR(wonValue), icon: TrendingUp, tone: "emerald" },
          { label: "Avg Deal Size", value: formatINR(avgDealSize), icon: DollarSign, tone: "sky" },
          { label: "Closing Soon", value: String(closingThisWeek), icon: Clock, tone: "amber" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i }}
              className="rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-zinc-400" />
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-300" />
              </div>
              <p className="font-display mt-2 text-xl font-extrabold tnum">{kpi.value}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Deals Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Deal</th>
              <th className="py-3">Contact</th>
              <th className="py-3">Stage</th>
              <th className="py-3">Value</th>
              <th className="py-3">Probability</th>
              <th className="py-3">Close Date</th>
              <th className="py-3 pr-4 text-right">Owner</th>
            </tr>
          </thead>
          <tbody>
            {DEALS.map((deal, i) => (
              <motion.tr
                key={deal.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 * i }}
                className="group cursor-pointer border-t border-border transition hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-semibold text-zinc-900">{deal.title}</p>
                    <p className="text-[11px] text-muted-foreground">{deal.company} · {deal.age} old</p>
                  </div>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={deal.contact} size={26} />
                    <span className="text-zinc-700">{deal.contact}</span>
                  </div>
                </td>
                <td className="py-3">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", STAGE_CONFIG[deal.stage].bg, STAGE_CONFIG[deal.stage].color)}>
                    {STAGE_CONFIG[deal.stage].label}
                  </span>
                </td>
                <td className="py-3">
                  <span className="font-semibold tnum">{formatINR(deal.value)}</span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={cn("h-full rounded-full", deal.probability >= 70 ? "bg-emerald-500" : deal.probability >= 40 ? "bg-amber-500" : "bg-zinc-300")}
                        style={{ width: `${deal.probability}%` }}
                      />
                    </div>
                    <span className="text-[11px] tnum text-zinc-500">{deal.probability}%</span>
                  </div>
                </td>
                <td className="py-3">
                  <span className="text-zinc-600">{deal.closeDate}</span>
                </td>
                <td className="py-3 pr-4 text-right">
                  <span className="text-zinc-600">{deal.owner}</span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
