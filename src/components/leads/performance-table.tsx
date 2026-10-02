"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance table (Lead Management Phase 3).

   ONE table renders BOTH performance views (matching the reference layout):
     • MASTER VIEW      → one row per AGENT (rowKind="agent"), ranked + medals.
     • INDIVIDUAL VIEW  → one row per MONTH (rowKind="period") for one agent.

   Columns (both views): Leads (Total / Qualified), Walk-In (Assign / Visited),
   Pickup, On-Site, Revenue Won, Projection, Ticket Won, Pending F/U,
   Conversion, and an ACTION column (View Details →).

   Design language (RepairOX, professional console look):
     • Soft 2px zinc-300 outer frame, rounded-2xl, shadow-card.
     • Two-tier indigo grouped header (#EEF1FD / #3A4DBB) with FULL-HEIGHT
       vertical separators between every logical column group — the separators
       run continuously through the header, every body row AND the TOTAL footer
       so columns read as crisply divided sections (per the reference).
     • Agent avatar chip (coloured initials), mini progress bars for Qualified %
       and Conversion %, and a pinned TOTAL footer summed from the EXACT rows.
   Every value is derived from real records upstream — no dummy data.
   ────────────────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, formatINR, initials } from "@/lib/utils";
import {
  medalFor, conversionTier, sumPerfRows,
  type AgentPerformance, type PeriodPerformance,
} from "@/lib/agent-performance";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export type PerfRow = AgentPerformance | PeriodPerformance;

/* ── shared cell geometry ─────────────────────────────────────────────────
   The DIVIDER class is applied to the FIRST cell of each column group in the
   header, every body row and the footer, so a single continuous vertical rule
   separates the groups top-to-bottom (the "column separation with lines" in
   the reference). */
const CELL = "px-2.5 py-3 align-middle text-center";
const HEAD = "px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-center";
const DIV = "border-l border-[#C7D0F5]";       // group separator (indigo-tinted)
const DIV_BODY = "border-l border-[#E3E8FA]";   // softer separator inside the body

/* Deterministic avatar tint from the name (brand-adjacent palette, no neon). */
const AVATAR_TONES = [
  "bg-[#4361EE]", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-sky-500", "bg-teal-500", "bg-indigo-500",
];
function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/* A metric cell: bold primary + an optional small muted secondary line. */
function Metric({ primary, secondary }: { primary: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-[14px] font-bold tabular-nums text-foreground">{primary}</span>
      {secondary != null && <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{secondary}</span>}
    </span>
  );
}

/* A number with a slim progress bar underneath (Qualified %, Conversion %). */
function BarMetric({
  primary, ratio, tone = "bg-[#4361EE]", caption,
}: {
  primary: React.ReactNode;
  ratio: number;              // 0..1
  tone?: string;
  caption?: string;
}) {
  const w = Math.max(0, Math.min(1, ratio));
  return (
    <span className="flex flex-col items-center gap-1 leading-tight">
      <span className="flex items-baseline gap-1">
        <span className="text-[14px] font-bold tabular-nums text-foreground">{primary}</span>
        {caption && <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{caption}</span>}
      </span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-200">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${w * 100}%` }} />
      </span>
    </span>
  );
}

function TierBadge({ rate }: { rate: number }) {
  const tier = conversionTier(rate);
  if (!tier) return null;
  const tone =
    tier === "Diamond" ? "bg-sky-100 text-sky-700"
      : tier === "Gold" ? "bg-amber-100 text-amber-700"
        : "bg-zinc-200 text-zinc-700";
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", tone)}>
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

export function PerformanceTable({
  rows,
  rowKind,
  /** When true, the ACTION column renders a "View Details →" control per row. */
  showReport = false,
  /** Build the REPORT href for a row (agent id or period key). Used when
   *  `onReport` is NOT supplied — the action renders as a navigating link. */
  reportHref,
  /** When supplied, the action is a BUTTON that calls this instead of
   *  navigating (e.g. owner → open an agent's Individual view in-place). */
  onReport,
  highlightAgentId,
  firstColLabel,
  emptyText = "No data yet.",
}: {
  rows: PerfRow[];
  rowKind: "agent" | "period";
  showReport?: boolean;
  reportHref?: (row: PerfRow) => string;
  onReport?: (row: PerfRow) => void;
  highlightAgentId?: string;
  firstColLabel: string;
  emptyText?: string;
}) {
  const isAgent = rowKind === "agent";
  const totals = sumPerfRows(rows);
  // # + name + 11 metric columns + 1 action column.
  const totalCols = (isAgent ? 1 : 0) + 1 + 11 + 1;

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-zinc-300 bg-card shadow-card">
      {/* Fits in one view on desktop; scroll only on very narrow screens. */}
      <div className="overflow-x-auto rox-rail-scroll">
        <table className="w-full min-w-[1000px] table-fixed border-collapse text-[13px]">
          <colgroup>
            {isAgent && <col style={{ width: "40px" }} />}
            <col style={{ width: isAgent ? "190px" : "140px" }} />
            <col /><col />{/* Leads: Total / Qualified */}
            <col /><col />{/* Walk-In: Assign / Visited */}
            <col /><col />{/* Pickup / On-Site */}
            <col style={{ width: "120px" }} /><col style={{ width: "108px" }} />{/* Revenue / Projection */}
            <col /><col />{/* Ticket Won / Pending F/U */}
            <col style={{ width: "118px" }} />{/* Conversion */}
            <col style={{ width: "116px" }} />{/* Action */}
          </colgroup>

          <thead>
            {/* Tier 1 — grouped spans */}
            <tr className="bg-[#EEF1FD] text-[#3A4DBB]">
              {isAgent && <th rowSpan={2} className={HEAD}>#</th>}
              <th rowSpan={2} className={cn(HEAD, "text-left")}>{firstColLabel}</th>
              <th colSpan={2} className={cn(HEAD, DIV)}>Leads</th>
              <th colSpan={2} className={cn(HEAD, DIV)}>Walk-In</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>Pickup</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>On-Site</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>Revenue Won</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>Projection</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>Ticket Won</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>Pending F/U</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>Conversion</th>
              <th rowSpan={2} className={cn(HEAD, DIV)}>Action</th>
            </tr>
            {/* Tier 2 — sub-columns under the grouped headers. Each sub-column is
                separated by a straight vertical rule (group-left DIV + an inner
                DIV_BODY between the two sub-columns). */}
            <tr className="bg-[#EEF1FD] text-[#3A4DBB]">
              <th className={cn(HEAD, DIV, "text-[10px]")}>Total</th>
              <th className={cn(HEAD, DIV_BODY, "text-[10px]")}>Qualified</th>
              <th className={cn(HEAD, DIV, "text-[10px]")}>Assign</th>
              <th className={cn(HEAD, DIV_BODY, "text-[10px]")}>Visited</th>
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
                const qualRatio = r.leads > 0 ? r.qualified / r.leads : 0;
                return (
                  <tr
                    key={isAgent ? r.agentId : (r as PeriodPerformance).periodKey}
                    className={cn(
                      "border-t border-zinc-300 transition",
                      isMe ? "bg-indigo-50/50" : "hover:bg-[#F5F7FF]",
                    )}
                  >
                    {isAgent && (
                      <td className={CELL}><RankBadge rank={r.rank} /></td>
                    )}

                    {/* Name — avatar chip + name + role (agent) / period label. */}
                    <td className={cn(CELL, "text-left")}>
                      <div className="flex items-center gap-2.5">
                        {isAgent && (
                          <span className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white",
                            toneFor(r.agentId || label),
                          )}>
                            {initials(label)}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate font-bold text-foreground">
                            {label}
                            {isMe && <span className="ml-1 rounded bg-[#4361EE]/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4361EE]">You</span>}
                          </span>
                          {isAgent && <span className="truncate text-[10px] text-muted-foreground">{r.roleLabel}</span>}
                        </span>
                      </div>
                    </td>

                    {/* Leads: Total / Qualified (bar + %) */}
                    <td className={cn(CELL, DIV_BODY)}><Metric primary={r.leads} /></td>
                    <td className={cn(CELL, DIV_BODY)}>
                      <BarMetric primary={r.qualified} ratio={qualRatio} caption={r.leads > 0 ? pct(qualRatio) : undefined} tone="bg-emerald-500" />
                    </td>

                    {/* Walk-In: Assign (routed) / Visited (real linked walk-in) */}
                    <td className={cn(CELL, DIV_BODY)}><Metric primary={r.routeAssigned} /></td>
                    <td className={cn(CELL, DIV_BODY)}><Metric primary={r.walkIn} /></td>

                    {/* Pickup / On-Site (routed count + completed) */}
                    <td className={cn(CELL, DIV_BODY)}><Metric primary={r.pickup} secondary={r.pickupCompleted > 0 ? `${r.pickupCompleted} done` : undefined} /></td>
                    <td className={cn(CELL, DIV_BODY)}><Metric primary={r.onSite} secondary={r.onSiteCompleted > 0 ? `${r.onSiteCompleted} done` : undefined} /></td>

                    {/* Revenue Won — earned (agent-driven); self-initiated muted. */}
                    <td className={cn(CELL, DIV_BODY)}>
                      <Metric
                        primary={formatINR(r.revenueWonAgentDriven)}
                        secondary={r.revenueWonSelfInitiated > 0 ? `+${formatINR(r.revenueWonSelfInitiated)} self` : `${r.invoiceCount} inv`}
                      />
                    </td>

                    {/* Projection (weighted) */}
                    <td className={cn(CELL, DIV_BODY)}><Metric primary={formatINR(r.projection)} secondary="weighted" /></td>

                    {/* Ticket Won — earned count; self-initiated separately. */}
                    <td className={cn(CELL, DIV_BODY)}>
                      <Metric
                        primary={r.ticketsWonAgentDriven}
                        secondary={r.ticketsWonSelfInitiated > 0 ? `+${r.ticketsWonSelfInitiated} self` : undefined}
                      />
                    </td>

                    {/* Pending Follow-up */}
                    <td className={cn(CELL, DIV_BODY)}><Metric primary={r.pendingFollowUp} secondary={r.overdueFollowUp > 0 ? `${r.overdueFollowUp} overdue` : undefined} /></td>

                    {/* Conversion + bar + tier badge */}
                    <td className={cn(CELL, DIV_BODY)}>
                      <span className="flex flex-col items-center gap-1 leading-tight">
                        <BarMetric primary={pct(r.conversionRate)} ratio={r.conversionRate} tone="bg-[#4361EE]" />
                        <TierBadge rate={r.conversionRate} />
                      </span>
                    </td>

                    {/* Action — View Details drill-down (button when onReport is
                        given, otherwise a navigating link). */}
                    <td className={cn(CELL, DIV_BODY)}>
                      {showReport && onReport ? (
                        <button
                          onClick={() => onReport(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#4361EE]/30 bg-[#EEF1FD] px-2.5 py-1.5 text-[11px] font-semibold text-[#3A4DBB] transition hover:bg-[#4361EE] hover:text-white"
                        >
                          View Details <ArrowRight className="h-3 w-3" />
                        </button>
                      ) : showReport && href ? (
                        <Link
                          href={href}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#4361EE]/30 bg-[#EEF1FD] px-2.5 py-1.5 text-[11px] font-semibold text-[#3A4DBB] transition hover:bg-[#4361EE] hover:text-white"
                        >
                          View Details <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* TOTAL footer — summed from the EXACT rows above. */}
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-zinc-300 bg-[#EEF1FD]/60 text-[#3A4DBB]">
                {isAgent && <td className={cn(CELL, "font-bold")} />}
                <td className={cn(CELL, "text-left text-[12px] font-bold uppercase tracking-wider")}>Total</td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{totals.leads}</span></td>
                <td className={cn(CELL, DIV_BODY)}>
                  <BarMetric primary={totals.qualified} ratio={totals.leads > 0 ? totals.qualified / totals.leads : 0} caption={totals.leads > 0 ? pct(totals.qualified / totals.leads) : undefined} tone="bg-emerald-500" />
                </td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{totals.routeAssigned}</span></td>
                <td className={cn(CELL, DIV_BODY)}><span className="text-[14px] font-extrabold tabular-nums">{totals.walkIn}</span></td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{totals.pickup}</span></td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{totals.onSite}</span></td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{formatINR(totals.revenueWonAgentDriven)}</span></td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{formatINR(totals.projection)}</span></td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{totals.ticketsWonAgentDriven}</span></td>
                <td className={cn(CELL, DIV)}><span className="text-[14px] font-extrabold tabular-nums">{totals.pendingFollowUp}</span></td>
                <td className={cn(CELL, DIV)}>
                  <BarMetric primary={pct(totals.conversionRate)} ratio={totals.conversionRate} tone="bg-[#4361EE]" />
                </td>
                <td className={cn(CELL, DIV)} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
