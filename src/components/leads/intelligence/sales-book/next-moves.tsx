"use client";

import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, PhoneOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NextMove, NextMoveKind } from "@/lib/lead-sales-book";

/* Next Moves — a transparent, rule-based attention queue. Every item states
   WHY it is shown (the supporting record), the recommended action, and opens
   the lead. No AI, no hidden scoring. */

const ICON: Record<NextMoveKind, React.ComponentType<{ className?: string }>> = {
  follow_up_overdue: AlertTriangle,
  follow_up_due_today: CalendarClock,
  no_next_follow_up: Clock3,
  no_recorded_outreach: PhoneOff,
  stalled: Clock3,
  qualified_no_progress: Sparkles,
  won_without_invoice: CheckCircle2,
};

const TONE = {
  urgent: { chip: "bg-rose-50 text-[#C4506B]", ring: "border-rose-200" },
  attention: { chip: "bg-amber-50 text-amber-700", ring: "border-amber-200" },
  info: { chip: "bg-[#EEF1FD] text-[#4361EE]", ring: "border-zinc-200" },
} as const;

export function NextMoves({
  moves,
  onOpenLead,
}: {
  moves: NextMove[];
  onOpenLead: (leadId: string) => void;
}) {
  return (
    // h-full + flex column so the list fills the (equal-height) card and scrolls
    // internally — the card length is driven entirely by the sibling Outcome Map.
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-foreground">Next Moves</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Leads needing action now — each with the reason and the record.</p>
        </div>
        {moves.length > 0 && (
          <span className="rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[11px] font-bold text-[#4361EE]">{moves.length}</span>
        )}
      </div>

      {moves.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <p className="mt-2 text-[13px] font-semibold text-emerald-800">Nothing needs attention</p>
          <p className="mt-0.5 text-[11px] text-emerald-700/80">No overdue follow-ups, stalled leads or missing actions in this view.</p>
        </div>
      ) : (
        <div className="rox-rail-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {moves.map((move) => {
            const Icon = ICON[move.kind];
            const tone = TONE[move.tone];
            return (
              <button
                key={`${move.kind}-${move.leadId}`}
                type="button"
                onClick={() => onOpenLead(move.leadId)}
                className={cn("group flex items-start gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition hover:border-[#B3BFF6] hover:shadow-card", tone.ring)}
              >
                <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", tone.chip)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold text-foreground">{move.leadName}</span>
                    <span className="shrink-0 text-[10.5px] font-medium text-muted-foreground">· {move.category}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{move.reason}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-[#4361EE]">{move.action}</span>
                </span>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
