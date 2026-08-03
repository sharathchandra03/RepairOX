"use client";

/* RepairOX — Reports V2 · Section 4: Operational Health
   Six focused cards (Tickets Created, Invoices Generated, Avg Ticket Value,
   Avg Repair Time, Repair Success, Cancelled) each with a sparkline, delta,
   and current-vs-previous comparison — replacing a wall of ten flat cards. */

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AnimatedNumber } from "@/components/dashboard/kpi-card";
import { Sparkline, DeltaChip, MiniCompareRow } from "./mini-charts";
import { TONE } from "./report-theme";
import { formatKpi } from "@/lib/reports/kpis";
import { cn } from "@/lib/utils";
import type { MetricCard } from "./selectors";

export function OperationsHealth({
  cards,
  title = "Operational Health",
  subtitle = "How the shop floor is performing right now",
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map((c, i) => (
          <OpsCard key={c.id} card={c} index={i} />
        ))}
      </div>
    </div>
  );
}

function OpsCard({ card, index }: { card: MetricCard; index: number }) {
  const router = useRouter();
  const tone = TONE[card.tone];
  const clickable = Boolean(card.drillHref);

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => card.drillHref && router.push(card.drillHref)}
      disabled={!clickable}
      className={cn(
        "rounded-2xl border border-border/70 bg-muted/30 p-3.5 text-left transition-all",
        clickable && "cursor-pointer hover:border-[#4361EE]/30 hover:bg-card hover:shadow-card"
      )}
    >
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-1">
        <p className="text-[20px] font-extrabold tabular-nums leading-none" style={{ color: tone.solid }}>
          <AnimatedNumber value={card.value} format={(n) => formatKpi(n, card.format)} />
        </p>
        <DeltaChip deltaPct={card.deltaPct} higherIsBetter={card.higherIsBetter} />
      </div>
      <div className="mt-2 h-8">
        <Sparkline data={card.sparkline} color={tone.solid} height={32} />
      </div>
      <MiniCompareRow current={card.value} previous={card.previous} format={(n) => formatKpi(n, card.format)} />
    </motion.button>
  );
}
