"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance table (Lead Management Phase 3).

   ONE table renders BOTH performance views (matching the reference layout):
     • MASTER VIEW      → one row per AGENT (rowKind="agent"), ranked + medals.
     • INDIVIDUAL VIEW  → one row per MONTH (rowKind="period") for one agent.

   Same columns in both: Leads (Total / Qualified), Walk-In (Assign / Walk-In),
   Pickup, On-Site, Revenue Won, Projection, Ticket Won, Pending Follow-up,
   Conversion Rate (with a Silver/Gold/Diamond tier badge).

   The REPORT drill-down lives UNDER the first-column label (agent name / month)
   — a small "Report" link beneath the name, exactly like the reference — so
   there is no separate Report column and the table stays compact enough to fit
   in one view without horizontal scrolling. Canonical RepairOX table language:
   sharp 2px zinc-300 frame, visible zinc-500 row separators, indigo grouped
   two-tier header. Every value is derived from real records upstream.
   ────────────────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { medalFor, conversionTier, type AgentPerformance, type PeriodPerformance } from "@/lib/agent-performance";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/* A metric cell: bold primary + a small muted secondary line (matches the
   "PROJECTED 1500 / QUALIFIED 40%" sub-labels in the reference). */
function Metric({ primary, secondary }: { primary: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-[14px] font-bold tabular-nums text-foreground">{primary}</span>
      {secondary != null && <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{secondary}</span>}
    </span>
  );
}

function TierBadge({ rate }: { rate: number }) {
  const tier = conversionTier(rate);
  if (!tier) return <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">—</span>;
  const tone =
    tier === "Diamond" ? "bg-sky-100 text-sky-700"
      : tier === "Gold" ? "bg-amber-100 text-amber-700"
        : "bg-zinc-200 text-zinc-700";
  return (
    <span className={cn("mt-1 inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", tone)}>
      {tier}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = medalFor(rank);
  return medal
    ? <span className="text-lg leading-none" aria-label={`Rank ${rank}`}>{medal}</span>
    : <span className="grid h-6 w-6 place-items-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">{rank}</span>;
}

export type PerfRow = AgentPerformance | PeriodPerformance;

/* Compact paddings so all columns fit in one view (no horizontal scroll on a
   normal desktop). Two-line numbers still read clearly. */
const CELL = "px-2 py-3 align-middle text-center";
const HEAD = "px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-center";

export function PerformanceTable({
  rows,
  rowKind,
  /** When true, a small "Report" link renders UNDER the name / month label. */
  showReport = false,
  /** Build the REPORT href for a row (agent id or period key). */
  reportHref,
  highlightAgentId,
  firstColLabel,
  emptyText = "No data yet.",
}: {
  rows: PerfRow[];
  rowKind: "agent" | "period";
  showReport?: boolean;
  reportHref?: (row: PerfRow) => string;
  highlightAgentId?: string;
  firstColLabel: string;
  emptyText?: string;
}) {
  const isAgent = rowKind === "agent";
  // # + name + 11 metric columns (Total, Qualified, Assign, Walk-In, Pickup,
  // On-Site, Revenue, Projection, Ticket, Pending, Conversion).
  const totalCols = (isAgent ? 1 : 0) + 1 + 11;

  return (
    <div className="rounded-2xl border-2 border-zinc-300 bg-card shadow-card">
      {/* Fits in one view on desktop; scroll only kicks in on very narrow screens. */}
      <div className="overflow-x-auto rox-rail-scroll">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-[13px]">
          <colgroup>
            {isAgent && <col style={{ width: "38px" }} />}
            {/* Compact name column so the table fits without side-scroll. */}
            <col style={{ width: isAgent ? "150px" : "130px" }} />
            <col /><col /><col /><col /><col /><col />
            <col style={{ width: "116px" }} /><col style={{ width: "104px" }} />
            <col /><col /><col />
          </colgroup>
          <thead className="sticky top-0 z-[5]">
            {/* Tier 1 — grouped spans (Leads / Walk-In) */}
            <tr className="bg-[#EEF1FD] text-[#3A4DBB]">
              {isAgent && <th rowSpan={2} className={HEAD}>#</th>}
              <th rowSpan={2} className={cn(HEAD, "text-left")}>{firstColLabel}</th>
              <th colSpan={2} className={cn(HEAD, "border-l border-[#B3BFF6]")}>Leads</th>
              <th colSpan={2} className={cn(HEAD, "border-l border-[#B3BFF6]")}>Walk-In</th>
              <th rowSpan={2} className={cn(HEAD, "border-l border-[#B3BFF6]")}>Pickup</th>
              <th rowSpan={2} className={HEAD}>On-Site</th>
              <th rowSpan={2} className={cn(HEAD, "border-l border-[#B3BFF6]")}>Revenue Won</th>
              <th rowSpan={2} className={HEAD}>Projection</th>
              <th rowSpan={2} className={HEAD}>Ticket Won</th>
              <th rowSpan={2} className={HEAD}>Pending F/U</th>
              <th rowSpan={2} className={HEAD}>Conversion</th>
            </tr>
            {/* Tier 2 — sub-columns for the grouped headers */}
            <tr className="bg-[#EEF1FD] text-[#3A4DBB]">
              <th className={cn(HEAD, "border-l border-[#B3BFF6] text-[10px]")}>Total</th>
              <th className={cn(HEAD, "text-[10px]")}>Qualified</th>
              <th className={cn(HEAD, "border-l border-[#B3BFF6] text-[10px]")}>Assign</th>
              <th className={cn(HEAD, "text-[10px]")}>Walk-In</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="py-14 text-center text-[13px] text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const label = isAgent ? r.agentName : (r as PeriodPerformance).periodLabel;
                const isMe = isAgent && highlightAgentId && r.agentId === highlightAgentId;
                const href = reportHref ? reportHref(r) : undefined;
                return (
                  <tr
                    key={isAgent ? r.agentId : (r as PeriodPerformance).periodKey}
                    className={cn(
                      "border-t border-zinc-500 transition",
                      isMe ? "bg-indigo-50/50" : "hover:bg-muted/40",
                    )}
                  >
                    {isAgent && (
                      <td className={CELL}><RankBadge rank={r.rank} /></td>
                    )}
                    {/* Name / month + the REPORT link tucked underneath it. */}
                    <td className={cn(CELL, "text-left")}>
                      <div className="flex items-center gap-2">
                        {isAgent && (
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[11px] font-bold text-[#4361EE]">
                            {r.agentName.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate font-bold text-foreground">
                            {label}
                            {isMe && <span className="ml-1 rounded bg-[#4361EE]/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4361EE]">You</span>}
                          </span>
                          {isAgent && <span className="truncate text-[10px] text-muted-foreground">{r.roleLabel}</span>}
                          {showReport && href && (
                            <Link
                              href={href}
                              className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#4361EE] hover:underline"
                            >
                              <FileBarChart className="h-3 w-3" /> Report
                            </Link>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Leads: Total / Qualified (+%) */}
                    <td className={cn(CELL, "border-l border-zinc-200")}><Metric primary={r.leads} /></td>
                    <td className={CELL}><Metric primary={r.qualified} secondary={r.leads > 0 ? pct(r.qualified / r.leads) : undefined} /></td>

                    {/* Walk-In: Assign (routed store-visit) / Walk-In (real linked) */}
                    <td className={cn(CELL, "border-l border-zinc-200")}><Metric primary={r.routeAssigned} /></td>
                    <td className={CELL}><Metric primary={r.walkIn} /></td>

                    {/* Pickup / On-Site (routed count + completed) */}
                    <td className={cn(CELL, "border-l border-zinc-200")}><Metric primary={r.pickup} secondary={r.pickupCompleted > 0 ? `${r.pickupCompleted} done` : undefined} /></td>
                    <td className={CELL}><Metric primary={r.onSite} secondary={r.onSiteCompleted > 0 ? `${r.onSiteCompleted} done` : undefined} /></td>

                    {/* Revenue Won (amount + invoice count) */}
                    <td className={cn(CELL, "border-l border-zinc-200")}><Metric primary={formatINR(r.revenueWon)} secondary={`${r.invoiceCount} inv`} /></td>

                    {/* Projection (weighted) */}
                    <td className={CELL}><Metric primary={formatINR(r.projection)} secondary="weighted" /></td>

                    {/* Ticket Won */}
                    <td className={CELL}><Metric primary={r.ticketsWon} /></td>

                    {/* Pending Follow-up */}
                    <td className={CELL}><Metric primary={r.pendingFollowUp} secondary={r.overdueFollowUp > 0 ? `${r.overdueFollowUp} overdue` : undefined} /></td>

                    {/* Conversion + tier badge */}
                    <td className={CELL}>
                      <span className="flex flex-col items-center leading-tight">
                        <span className="text-[14px] font-bold tabular-nums text-foreground">{pct(r.conversionRate)}</span>
                        <TierBadge rate={r.conversionRate} />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
