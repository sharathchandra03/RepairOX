"use client";

/* RepairOX — Reports V2 · Section 1: Executive Summary
   One premium row, max 4 large cards: Revenue, Outstanding, Profit,
   Collection Rate. Each shows a large number, mini trend, % change, a
   comparison label, and a tiny insight — instant context, no digging. */

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AnimatedNumber } from "@/components/dashboard/kpi-card";
import { Sparkline, DeltaChip } from "./mini-charts";
import { TONE } from "./report-theme";
import { formatKpi } from "@/lib/reports/kpis";
import { cn } from "@/lib/utils";
import type { MetricCard } from "./selectors";

export function ExecutiveSummary({ cards, comparisonLabel }: { cards: MetricCard[]; comparisonLabel: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c, i) => (
        <ExecCard key={c.id} card={c} index={i} comparisonLabel={comparisonLabel} />
      ))}
    </div>
  );
}

function ExecCard({ card, index, comparisonLabel }: { card: MetricCard; index: number; comparisonLabel: string }) {
  const router = useRouter();
  const tone = TONE[card.tone];
  const clickable = Boolean(card.drillHref);

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      onClick={() => card.drillHref && router.push(card.drillHref)}
      disabled={!clickable}
      className={cn(
        "group relative overflow-hidden rounded-[20px] border border-border bg-card p-5 text-left shadow-[0_1px_3px_rgba(20,30,80,0.04),0_10px_28px_-12px_rgba(20,30,80,0.08)] transition-all duration-300",
        clickable && "cursor-pointer hover:-translate-y-1 hover:shadow-[0_16px_36px_-14px_rgba(20,30,80,0.16)]"
      )}
    >
      {/* faint tone wash */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.035]" style={{ background: tone.gradient }} />

      <div className="relative flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide", tone.chipBg, tone.chipText)}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.solid }} />
          {card.label}
        </span>
        <DeltaChip deltaPct={card.deltaPct} higherIsBetter={card.higherIsBetter} />
      </div>

      <p className="relative mt-3 font-display text-[32px] font-extrabold leading-none tracking-tight tnum" style={{ color: tone.solid }}>
        <AnimatedNumber value={card.value} format={(n) => formatKpi(n, card.format)} />
      </p>

      <p className="relative mt-1.5 text-[11.5px] text-muted-foreground">
        vs {comparisonLabel} · <span className="font-medium text-foreground">{formatKpi(card.previous, card.format)}</span>
      </p>

      {card.hint && <p className="relative mt-2 text-[11px] leading-relaxed text-muted-foreground">{card.hint}</p>}

      <div className="relative mt-3 -mx-1">
        <Sparkline data={card.sparkline} color={tone.solid} height={40} />
      </div>
    </motion.button>
  );
}
