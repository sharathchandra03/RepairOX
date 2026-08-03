"use client";

/* RepairOX — Reports V2 · Section 5: Financial Health
   A larger section covering Expenses, Net Revenue, Cash, Bank, GST and Gross
   Margin as finance widgets — each with a trend, comparison and quick status
   — rather than plain flat cards. */

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AnimatedNumber } from "@/components/dashboard/kpi-card";
import { Sparkline, DeltaChip } from "./mini-charts";
import { TONE } from "./report-theme";
import { formatKpi } from "@/lib/reports/kpis";
import { cn } from "@/lib/utils";
import type { MetricCard } from "./selectors";

export function FinancialHealth({
  cards,
  title = "Financial Health",
  subtitle = "Cash position, tax liability and profitability",
}: {
  cards: MetricCard[];
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, i) => (
          <FinanceWidget key={c.id} card={c} index={i} />
        ))}
      </div>
    </div>
  );
}

function FinanceWidget({ card, index }: { card: MetricCard; index: number }) {
  const router = useRouter();
  const tone = TONE[card.tone];
  const clickable = Boolean(card.drillHref);
  const statusGood = card.deltaPct == null ? null : (card.deltaPct >= 0) === card.higherIsBetter;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => card.drillHref && router.push(card.drillHref)}
      disabled={!clickable}
      className={cn(
        "rounded-2xl border p-4 text-left transition-all",
        tone.ring,
        "border-border bg-gradient-to-br from-card to-muted/20",
        clickable && "cursor-pointer hover:-translate-y-0.5 hover:shadow-card"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: tone.solid }} />
          {card.label}
        </span>
        {statusGood != null && (
          <span className={cn("h-1.5 w-1.5 rounded-full", statusGood ? "bg-emerald-500" : "bg-rose-500")} />
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-[22px] font-extrabold tabular-nums leading-none" style={{ color: tone.solid }}>
          <AnimatedNumber value={card.value} format={(n) => formatKpi(n, card.format)} />
        </p>
        <DeltaChip deltaPct={card.deltaPct} higherIsBetter={card.higherIsBetter} />
      </div>

      <div className="mt-2.5 h-9">
        <Sparkline data={card.sparkline} color={tone.solid} height={36} />
      </div>
    </motion.button>
  );
}
