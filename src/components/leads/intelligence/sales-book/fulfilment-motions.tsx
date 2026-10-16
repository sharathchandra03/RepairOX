"use client";

import { Store, Truck, MapPin, CircleDashed } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import type { FulfilmentMotionRow, LeadMode } from "@/lib/lead-sales-book";

/* Fulfilment & sales motions — Walk-In / Pickup / On-Site from the lead's real
   `fulfilmentRoute`, plus an explicit "Not routed" bucket. No guessing: an
   un-routed lead is shown as un-routed, never classified from other fields. */

/* Semantic per-mode palette. Colour lives on the HEADER band (tint + title +
   count) and the left accent bar — the card body stays white so the section
   reads vivid but still professional (restrained RepairOX accent system). */
const MODE_META: Record<LeadMode, {
  icon: React.ComponentType<{ className?: string }>;
  chip: string;       // icon chip
  header: string;     // tinted header band
  title: string;      // header title colour
  count: string;      // big count colour
  bar: string;        // left accent strip
  border: string;     // card border tint
  hover: string;      // hover border
}> = {
  STORE_VISIT: { icon: Store, chip: "bg-white/70 text-sky-700", header: "bg-sky-50", title: "text-sky-800", count: "text-sky-700", bar: "bg-sky-500", border: "border-sky-200", hover: "hover:border-sky-400" },
  PICKUP_DROP: { icon: Truck, chip: "bg-white/70 text-indigo-700", header: "bg-indigo-50", title: "text-indigo-800", count: "text-indigo-700", bar: "bg-indigo-500", border: "border-indigo-200", hover: "hover:border-indigo-400" },
  ON_SITE: { icon: MapPin, chip: "bg-white/70 text-violet-700", header: "bg-violet-50", title: "text-violet-800", count: "text-violet-700", bar: "bg-violet-500", border: "border-violet-200", hover: "hover:border-violet-400" },
  "": { icon: CircleDashed, chip: "bg-white/70 text-zinc-500", header: "bg-zinc-100", title: "text-zinc-600", count: "text-zinc-600", bar: "bg-zinc-300", border: "border-zinc-200", hover: "hover:border-zinc-400" },
};

export function FulfilmentMotions({
  rows,
  onSelectMode,
}: {
  rows: FulfilmentMotionRow[];
  onSelectMode: (row: FulfilmentMotionRow) => void;
}) {
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-foreground">Fulfilment &amp; Sales Motions</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Leads by routing decision. Revenue shown is net of refunds, from finalized invoices only.</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-card p-5 text-center text-[12px] text-muted-foreground">No leads in this scope.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {rows.map((row) => {
            const meta = MODE_META[row.mode];
            const Icon = meta.icon;
            return (
              <button
                key={row.mode || "none"}
                type="button"
                onClick={() => onSelectMode(row)}
                className={cn("group relative overflow-hidden rounded-xl border bg-card text-left shadow-card transition hover:shadow-card-hover", meta.border, meta.hover)}
              >
                {/* Left accent strip */}
                <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", meta.bar)} />
                {/* Coloured header band */}
                <div className={cn("flex items-center justify-between gap-2 px-3.5 py-2.5", meta.header)}>
                  <span className="flex items-center gap-2">
                    <span className={cn("grid h-7 w-7 place-items-center rounded-lg ring-1 ring-inset ring-white/60", meta.chip)}><Icon className="h-3.5 w-3.5" /></span>
                    <span className={cn("text-[13px] font-bold", meta.title)}>{row.label}</span>
                  </span>
                  <span className={cn("text-[20px] font-extrabold tabular-nums", meta.count)}>{row.leads}</span>
                </div>
                {/* White body */}
                <div className="px-3.5 pb-3 pt-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Metric label="Won" value={row.won} />
                    <Metric label="Tickets" value={row.tickets} />
                    <Metric label="Invoices" value={row.invoices} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-zinc-200 pt-2.5 text-[11px]">
                    <span className="text-muted-foreground">Net revenue</span>
                    <span className="font-bold tabular-nums text-emerald-700">{formatINR(row.revenueNet)}</span>
                  </div>
                  {(row.refunds > 0 || row.overdueFollowUps > 0) && (
                    <div className="mt-1 flex items-center justify-between text-[10.5px]">
                      {row.overdueFollowUps > 0
                        ? <span className="font-medium text-[#B42318]">{row.overdueFollowUps} overdue follow-up{row.overdueFollowUps === 1 ? "" : "s"}</span>
                        : <span />}
                      {row.refunds > 0 && <span className="text-amber-700">Refunds {formatINR(row.refunds)}</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[13px] font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
