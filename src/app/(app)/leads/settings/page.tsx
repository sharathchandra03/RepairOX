"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, GripVertical, X, Save, Palette, Zap, Globe } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ── Default config ── */
const DEFAULT_STAGES = [
  { id: "new", label: "New", color: "bg-sky-500" },
  { id: "contacted", label: "Contacted", color: "bg-violet-500" },
  { id: "qualified", label: "Qualified", color: "bg-indigo-500" },
  { id: "proposal", label: "Proposal Sent", color: "bg-amber-500" },
  { id: "follow_up", label: "Follow Up", color: "bg-orange-500" },
  { id: "won", label: "Won", color: "bg-emerald-500" },
  { id: "lost", label: "Lost", color: "bg-zinc-400" },
];

const DEFAULT_SOURCES = [
  { id: "google", label: "Google Ads" },
  { id: "meta", label: "Meta Ads" },
  { id: "youtube", label: "YouTube" },
  { id: "walkin", label: "Walk-In" },
  { id: "reference", label: "Reference" },
  { id: "website", label: "Website Form" },
];

const SCORING_RULES = [
  { condition: "Lead responds within 1 hour", points: "+15" },
  { condition: "Budget confirmed above ₹50K", points: "+20" },
  { condition: "Source is Reference", points: "+10" },
  { condition: "No response in 72 hours", points: "-10" },
  { condition: "Meeting scheduled", points: "+12" },
  { condition: "Quotation accepted", points: "+25" },
];

export default function LeadsSettingsPage() {
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [sources, setSources] = useState(DEFAULT_SOURCES);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Lead Settings"
        subtitle="Configure pipeline stages, lead sources, and scoring rules."
        actions={
          <Button size="sm" className="rounded-full gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save Changes
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

        {/* Pipeline Stages */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="h-4 w-4 text-[#4361EE]" />
            <h3 className="font-display text-base font-bold">Pipeline Stages</h3>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            Define the stages leads move through. Drag to reorder.
          </p>
          <div className="space-y-2">
            {stages.map((stage, i) => (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i }}
                className="flex items-center gap-2 rounded-xl border border-border bg-background p-3"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-zinc-300 cursor-grab" />
                <span className={cn("h-3 w-3 shrink-0 rounded-full", stage.color)} />
                <Input defaultValue={stage.label} className="h-8 flex-1 text-sm" />
                <button
                  onClick={() => setStages(stages.filter((s) => s.id !== stage.id))}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
          <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-[12px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700">
            <Plus className="h-3.5 w-3.5" /> Add stage
          </button>
        </div>

        {/* Lead Sources */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-[#4361EE]" />
            <h3 className="font-display text-base font-bold">Lead Sources</h3>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            Channels where leads are captured from.
          </p>
          <div className="space-y-2">
            {sources.map((source, i) => (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i }}
                className="flex items-center gap-2 rounded-xl border border-border bg-background p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-500">
                  {i + 1}
                </span>
                <Input defaultValue={source.label} className="h-8 flex-1 text-sm" />
                <button
                  onClick={() => setSources(sources.filter((s) => s.id !== source.id))}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
          <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-[12px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700">
            <Plus className="h-3.5 w-3.5" /> Add source
          </button>
        </div>
      </div>

      {/* Scoring Rules */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-[#4361EE]" />
          <h3 className="font-display text-base font-bold">Lead Scoring Rules</h3>
        </div>
        <p className="text-[12px] text-muted-foreground mb-4">
          Automatic scoring adjustments based on lead behavior and attributes.
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[1fr_80px] bg-muted/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Condition</div>
            <div className="text-right">Points</div>
          </div>
          {SCORING_RULES.map((rule, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.03 * i }}
              className="grid grid-cols-[1fr_80px] items-center border-t border-border px-4 py-3 text-sm"
            >
              <span className="text-zinc-700">{rule.condition}</span>
              <span className={cn("text-right font-semibold tnum", rule.points.startsWith("+") ? "text-emerald-600" : "text-rose-600")}>
                {rule.points}
              </span>
            </motion.div>
          ))}
        </div>
        <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-[12px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700">
          <Plus className="h-3.5 w-3.5" /> Add scoring rule
        </button>
      </div>
    </div>
  );
}
