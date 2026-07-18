"use client";

import { motion } from "framer-motion";
import { Plus, FileText, Clock, CheckCircle2, XCircle, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn, formatINR } from "@/lib/utils";

type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "expired" | "rejected";

interface Quotation {
  id: string;
  title: string;
  contact: string;
  company: string;
  value: number;
  status: QuoteStatus;
  createdAt: string;
  validUntil: string;
  items: number;
}

const STATUS_CONFIG: Record<QuoteStatus, { label: string; icon: typeof FileText; color: string }> = {
  draft:    { label: "Draft",    icon: FileText,     color: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  sent:     { label: "Sent",     icon: Send,         color: "bg-sky-50 text-sky-700 ring-sky-200" },
  viewed:   { label: "Viewed",   icon: Clock,        color: "bg-violet-50 text-violet-700 ring-violet-200" },
  accepted: { label: "Accepted", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  expired:  { label: "Expired",  icon: Clock,        color: "bg-amber-50 text-amber-700 ring-amber-200" },
  rejected: { label: "Rejected", icon: XCircle,      color: "bg-rose-50 text-rose-700 ring-rose-200" },
};

const QUOTES: Quotation[] = [
  { id: "QT-001", title: "iPhone Fleet Repair — Annual Contract",   contact: "Aarav Mehta",   company: "TechNova",  value: 125000, status: "sent",     createdAt: "Jul 15", validUntil: "Jul 30", items: 5 },
  { id: "QT-002", title: "MacBook Bulk Service Proposal",           contact: "Falguni Patel", company: "NexaCore",  value: 280000, status: "viewed",   createdAt: "Jul 12", validUntil: "Jul 27", items: 8 },
  { id: "QT-003", title: "iPad Classroom Setup — 3 Tiers",          contact: "Diya Sen",      company: "GreenLeaf", value: 95000,  status: "draft",    createdAt: "Jul 18", validUntil: "Aug 2",  items: 3 },
  { id: "QT-004", title: "Annual Maintenance Plan",                  contact: "Heena Kapoor",  company: "PixelCraft", value: 72000,  status: "accepted", createdAt: "Jul 8",  validUntil: "Jul 22", items: 4 },
  { id: "QT-005", title: "iWatch Repair — Bulk Estimate",           contact: "Eshan Roy",     company: "CloudSync", value: 38000,  status: "expired",  createdAt: "Jun 28", validUntil: "Jul 12", items: 2 },
  { id: "QT-006", title: "Logic Board Repair — Enterprise",          contact: "Bina Soni",     company: "DesignHub", value: 56000,  status: "rejected", createdAt: "Jul 5",  validUntil: "Jul 20", items: 3 },
];

export default function QuotationsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Quotations"
        subtitle="Proposals and estimates sent to leads — track views and approvals."
        actions={
          <Can permission="manage_sales">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Quote
            </Button>
          </Can>
        }
      />

      {/* Quotations list */}
      <div className="space-y-3">
        {QUOTES.map((quote, i) => {
          const cfg = STATUS_CONFIG[quote.status];
          const Icon = cfg.icon;
          return (
            <motion.div
              key={quote.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i }}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition hover:shadow-card-hover sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-900">{quote.title}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{quote.id}</span>
                    <span>·</span>
                    <span>{quote.contact}</span>
                    <span>·</span>
                    <span>{quote.company}</span>
                    <span>·</span>
                    <span>{quote.items} items</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-semibold tnum">{formatINR(quote.value)}</p>
                  <p className="text-[10px] text-muted-foreground">Valid until {quote.validUntil}</p>
                </div>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset", cfg.color)}>
                  <Icon className="h-3 w-3" /> {cfg.label}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
