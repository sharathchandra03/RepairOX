"use client";

/* RepairOX Insights — plain-language, data-backed observations. Every card is
   derived from the live dataset; nothing is fabricated. */

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight, InsightTone } from "@/lib/reports/types";

const TONE: Record<InsightTone, { ring: string; icon: string; chip: string; bar: string }> = {
  positive: { ring: "border-emerald-200/70 bg-emerald-50/30", icon: "text-emerald-600 bg-emerald-100", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  negative: { ring: "border-rose-200/70 bg-rose-50/30", icon: "text-rose-600 bg-rose-100", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
  warning: { ring: "border-amber-200/70 bg-amber-50/30", icon: "text-amber-600 bg-amber-100", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  neutral: { ring: "border-border bg-card", icon: "text-[#4361EE] bg-[#EEF1FD]", chip: "bg-[#EEF1FD] text-[#3347D6]", bar: "bg-[#4361EE]" },
};

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as any)[name] ?? Icons.Sparkles;
  return <C className={className} />;
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#4361EE] to-[#3347D6] text-white shadow-[0_6px_16px_-6px_rgba(67,97,238,0.6)]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[14px] font-semibold">RepairOX Insights</h3>
          <p className="text-[11px] text-muted-foreground">Generated only from your real, filtered data — never fabricated</p>
        </div>
      </div>

      {insights.length === 0 ? (
        <p className="px-5 py-10 text-center text-[12px] text-muted-foreground">
          Not enough data in this period to surface insights yet. Try widening the date range.
        </p>
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {insights.map((ins, i) => {
            const tone = TONE[ins.tone];
            return (
              <motion.button
                key={ins.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => ins.drillHref && router.push(ins.drillHref)}
                disabled={!ins.drillHref}
                className={cn(
                  "relative flex items-start gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-all",
                  tone.ring,
                  ins.drillHref && "cursor-pointer hover:-translate-y-0.5 hover:shadow-card"
                )}
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", tone.bar)} />
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tone.icon)}>
                  <Icon name={ins.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12.5px] font-semibold leading-tight">{ins.title}</p>
                    {ins.metric && (
                      <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold", tone.chip)}>{ins.metric}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{ins.detail}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
