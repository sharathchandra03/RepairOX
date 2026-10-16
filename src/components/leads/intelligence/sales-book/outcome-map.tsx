"use client";

import { cn } from "@/lib/utils";
import type { OutcomeMilestone } from "@/lib/lead-sales-book";

/* Portfolio outcome map — how assigned leads flow from intake to commercial
   outcome. Pipeline milestones are neutral/blue; commercial outcomes (Ticket /
   Finalized invoice) are emerald so a lead's STATUS stays visually distinct
   from its invoice/ticket outcome. Clicking a stage reveals its leads. */

export function OutcomeMap({
  milestones,
  onSelectStage,
}: {
  milestones: OutcomeMilestone[];
  onSelectStage: (m: OutcomeMilestone) => void;
}) {
  const max = Math.max(1, ...milestones.map((m) => m.count));
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-foreground">Portfolio Outcome Map</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Lifecycle → commercial outcomes, from real linked records. Click a stage to inspect its leads.</p>
      </div>
      <div className="flex flex-col gap-2">
        {milestones.map((m, i) => {
          const pct = Math.round((m.count / max) * 100);
          const commercial = m.commercial;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelectStage(m)}
              className="group flex items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-muted/40"
            >
              <span className="w-[108px] shrink-0 text-[11.5px] font-medium text-foreground">
                {m.label}
                {commercial && <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-emerald-600">$</span>}
              </span>
              <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full transition-all", commercial ? "bg-emerald-500" : i === 0 ? "bg-[#4361EE]" : "bg-indigo-400")}
                  style={{ width: `${Math.max(m.count ? 4 : 0, pct)}%` }}
                />
              </span>
              <span className="w-9 shrink-0 text-right text-[13px] font-bold tabular-nums text-foreground">{m.count}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">A lead&rsquo;s stage is separate from its invoice/ticket outcome — one lead may hold several outcome records.</p>
    </div>
  );
}
