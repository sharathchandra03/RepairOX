"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance table (Lead Management Phase 3).

   ONE table renders BOTH performance views (matching the reference layout):
     • MASTER VIEW      → one row per AGENT (rowKind="agent"), ranked + medals.
     • INDIVIDUAL VIEW  → one row per MONTH (rowKind="period") for one agent.

   Columns (both views): Leads (Total / Qualified), Walk-In (Assign / Visited),
   Pickup, On-Site, Revenue Won, Projection, Ticket Won, Pending F/U,
   Conversion, and an ACTION column (View Details →).

   ── CONTAINER BEHAVIOUR (shared with the Owner Dashboard "Store Performance"
      table — the canonical RepairOX viewport-bounded table) ───────────────
   The table is CONTENT-DRIVEN for small datasets (few agents → compact) and
   grows naturally as the agent count rises UNTIL it reaches the available
   viewport height — then ONLY the body scrolls internally while the grouped
   header and the Total footer stay pinned. This is NOT position:sticky (which
   detaches on macOS trackpad momentum / elastic overscroll); instead it is a
   THREE-TABLE layout — the header, the scrolling body, and the Total footer
   are SEPARATE <table>s that share ONE <colgroup> so every column stays
   perfectly aligned. The body's max-height is RUNTIME-MEASURED from its live
   distance to the bottom of the viewport (minus the footer height + a small
   gap), so the page never grows tall just because many agents exist, and the
   footer is always on-screen at every screen size / zoom level. All three
   tables sit inside ONE horizontal-scroll wrapper so they scroll sideways
   together and stay column-aligned on narrow screens.

   Visual standard (RepairOX Agent Performance Table v2):
     • Premium 2px outer frame (`border-zinc-300`), rounded-2xl, shadow-card.
     • TWO-TIER grouped header with a STRONGER primary row (medium-deep
       RepairOX blue #3B54CF) and a slightly lighter secondary row (#DDE3FB)
       so the hierarchy is immediately visible.
     • Subtle semantic accent lines at the bottom of each group header span
       (blue for Leads, indigo for Walk-In, purple for Field, emerald for
       Revenue, blue for Projection, indigo for Ticket, amber for Follow-up,
       blue for Conversion) — never full-column backgrounds.
     • Stronger vertical dividers at major group boundaries; softer inner
       dividers between sub-columns.
     • Clean white body with a very subtle alternate-row tint (#F8FAFC),
       smooth hover (light RepairOX blue tint), top-3 ranked rows get a
       restrained left accent.
     • Agent avatar chip + strong name + muted role subtitle (Owner view).
       Month label is the strong anchor (Individual view).
     • Revenue Won has a subtle emerald accent; Projection a blue/neutral
       treatment; Pending F/U uses amber; Overdue uses red indicator.
     • Progress bars for Qualified % and Conversion % — same height, same
       width, same track, brand-filled.
     • LIGHT summary total footer: a soft blue-gray surface with RepairOX-blue
       typography and a firm top border — reads as a clean SUMMARY that sits
       below the body and provides closure, NOT a second dark header. Full
       contrast on every value (dark-on-light), semantic accents preserved
       (emerald revenue, blue conversion, red overdue).
     • Owner and Individual tables share the SAME visual system so they feel
       like one cohesive performance-table family.
   Every value is derived from real records upstream — no dummy data.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
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
   The DIVIDER classes create continuous vertical rules top-to-bottom through
   header, body and footer. Each tier has its own pair (stronger group boundary
   + softer sub-column separator) tuned to its surface: HEAD_* on the blue
   primary band, SEC_* on the light secondary band, BODY_* on white rows, and
   FOOT_* on the blue-gray summary. */
const CELL = "px-3 py-3.5 align-middle text-center";
const HEAD_PRIMARY = "px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-center";
const HEAD_SECONDARY = "px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-center";
/* Group boundary WITHIN the blue primary header — a soft translucent-white rule
   that reads cleanly on #3B54CF (not a harsh light-blue seam). */
const HEAD_GRP_DIV = "border-l-2 border-white/25";
/* Group / sub-column dividers in the light secondary tier — kept subtle so the
   two header tiers read as ONE cohesive grouped header, not fragmented blocks. */
const SEC_GRP_DIV = "border-l-2 border-[#BCC7F2]";
const SEC_SUB_DIV = "border-l border-[#CBD4F3]";
const BODY_GRP_DIV = "border-l-2 border-[#E0E5F6]/70"; // group boundary in body
const BODY_SUB_DIV = "border-l border-[#EDF0FA]";       // sub-col in body
/* Footer dividers — RepairOX-blue rules on the blue-gray summary surface. */
const FOOT_GRP_DIV = "border-l-2 border-[#A9B6E8]";
const FOOT_SUB_DIV = "border-l border-[#B9C4EC]";

/* The table's intrinsic min width — shared by all three tables so their
   columns line up exactly inside the single horizontal-scroll wrapper. */
const TABLE_MIN_W = "min-w-[1044px]";
const TABLE_BASE = "w-full table-fixed border-separate border-spacing-0 text-[13px]";

/* ── Semantic accent colors for group header bottom borders ──────────── */
const ACCENT = {
  leads: "#4361EE",      // RepairOX blue
  walkIn: "#6366F1",     // indigo
  pickup: "#8B5CF6",     // purple
  onSite: "#8B5CF6",     // purple
  revenue: "#10B981",    // emerald
  projection: "#4361EE", // blue
  ticket: "#6366F1",     // indigo
  followUp: "#F59E0B",   // amber
  conversion: "#4361EE", // blue
  action: "#94A3B8",     // neutral
} as const;

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
function Metric({ primary, secondary, accent }: { primary: React.ReactNode; secondary?: React.ReactNode; accent?: "green" | "amber" | "red" }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className={cn(
        "text-[14px] font-bold tabular-nums",
        accent === "green" ? "text-emerald-700" : accent === "red" ? "text-red-600" : "text-foreground",
      )}>{primary}</span>
      {secondary != null && (
        <span className={cn(
          "mt-0.5 text-[10px] uppercase tracking-wide",
          accent === "red" ? "font-semibold text-red-500" : "text-muted-foreground",
        )}>{secondary}</span>
      )}
    </span>
  );
}

/* A number with a slim progress bar underneath (Qualified %, Conversion %).
   `onDark` is retained for compatibility but the footer is now light, so both
   body and footer use the same high-contrast dark-on-light treatment. */
function BarMetric({
  primary, ratio, tone = "bg-[#4361EE]", caption, valueClass, captionClass, trackClass,
}: {
  primary: React.ReactNode;
  ratio: number;              // 0..1
  tone?: string;
  caption?: string;
  valueClass?: string;
  captionClass?: string;
  trackClass?: string;
}) {
  const w = Math.max(0, Math.min(1, ratio));
  return (
    <span className="flex flex-col items-center gap-1 leading-tight">
      <span className="flex items-baseline gap-1">
        <span className={cn("text-[14px] font-bold tabular-nums text-foreground", valueClass)}>{primary}</span>
        {caption && <span className={cn("text-[10px] font-semibold tabular-nums text-muted-foreground", captionClass)}>{caption}</span>}
      </span>
      <span className={cn("h-[5px] w-16 overflow-hidden rounded-full bg-zinc-200/80", trackClass)}>
        <span className={cn("block h-full rounded-full transition-all", tone)} style={{ width: `${w * 100}%` }} />
      </span>
    </span>
  );
}

function TierBadge({ rate }: { rate: number }) {
  const tier = conversionTier(rate);
  if (!tier) return null;
  const tone =
    tier === "Diamond" ? "bg-sky-100 text-sky-700 ring-sky-200/60"
      : tier === "Gold" ? "bg-amber-100 text-amber-700 ring-amber-200/60"
        : "bg-zinc-100 text-zinc-600 ring-zinc-200/60";
  return (
    <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ring-inset", tone)}>
      {tier}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = medalFor(rank);
  return medal
    ? <span className="text-lg leading-none" aria-label={`Rank ${rank}`}>{medal}</span>
    : <span className="grid h-6 w-6 place-items-center rounded-md bg-zinc-100 text-[11px] font-bold text-zinc-500">{rank}</span>;
}

/* ── Accent line for grouped header cells ──────────────────────────────── */
function accentBorder(color: string): React.CSSProperties {
  return { boxShadow: `inset 0 -2px 0 ${color}` };
}

/* ── Shared <colgroup> ─────────────────────────────────────────────────────
   Rendered identically inside all three tables (header / body / footer) so the
   column grid is pixel-identical across them. */
function PerfCols({ isAgent }: { isAgent: boolean }) {
  return (
    <colgroup>
      {isAgent && <col style={{ width: "42px" }} />}
      <col style={{ width: isAgent ? "162px" : "148px" }} />
      <col style={{ width: "70px" }} /><col style={{ width: "94px" }} />{/* Leads: Total / Qualified */}
      <col style={{ width: "70px" }} /><col style={{ width: "70px" }} />{/* Walk-In: Assign / Visited */}
      <col style={{ width: "72px" }} /><col style={{ width: "72px" }} />{/* Pickup / On-Site */}
      <col style={{ width: "122px" }} /><col style={{ width: "110px" }} />{/* Revenue / Projection */}
      <col style={{ width: "76px" }} /><col style={{ width: "86px" }} />{/* Ticket Won / Pending F/U */}
      <col style={{ width: "118px" }} />{/* Conversion */}
      <col style={{ width: "132px" }} />{/* Action */}
    </colgroup>
  );
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
  const hasFooter = rows.length > 0;

  /* ── Viewport-constrained scroll body (mirrors the Owner Dashboard "Store
     Performance" table) ───────────────────────────────────────────────────
     The body ROWS scroll internally while the grouped <thead> and the Total
     <tfoot> stay pinned (they are SEPARATE tables outside the scroll region).
     The body's max-height is MEASURED from its live distance to the bottom of
     the viewport, minus the footer height and a small bottom gap, so the page
     never grows tall just because many agents exist and the footer is always
     visible. We never exceed the natural content height, so a 2–3 agent list is
     NOT forced into an empty scroll region (no scrollbar when unnecessary). */
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [bodyMaxH, setBodyMaxH] = useState<number | null>(null);
  /* Width of the body's vertical scrollbar (0 on overlay-scrollbar systems).
     The header + footer tables live OUTSIDE the scroll region, so when the body
     shows a scrollbar it becomes narrower; we pad the header/footer by this
     width so all three column grids stay perfectly aligned. */
  const [scrollbarW, setScrollbarW] = useState(0);

  useEffect(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    const BOTTOM_GAP = 24;   // breathing space below the table
    const MIN_BODY = 200;    // floor: header + a couple rows + total stay usable
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const footerH = footerRef.current?.offsetHeight ?? 0;
      const avail = window.innerHeight - top - footerH - BOTTOM_GAP;
      setBodyMaxH(Math.max(MIN_BODY, Math.round(avail)));
      // offsetWidth includes the scrollbar; clientWidth does not. The difference
      // is the live scrollbar width (0 when there's no scrollbar / overlay bars).
      setScrollbarW(el.offsetWidth - el.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    // The strip above the table (filters/KPIs) can change height (wrapping,
    // active-filter chips appearing) without a window resize — observe it too.
    // Also observe the footer so its height is re-reserved if it wraps.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (footerRef.current) ro.observe(footerRef.current);
    return () => { window.removeEventListener("resize", measure); ro.disconnect(); };
  }, [rows.length, hasFooter]);

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-zinc-300 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(67,97,238,0.05)]">
      {/* ── Shared horizontal-scroll wrapper ──────────────────────────────
          All three tables (header / body / footer) live inside this ONE wrapper
          so on narrow screens they scroll sideways TOGETHER and stay perfectly
          column-aligned. The page itself never overflows horizontally. */}
      <div className="overflow-x-auto rox-rail-scroll">

        {/* ═══ FIXED HEADER TABLE (outside the vertical scroll region) ═══ */}
        <div style={{ paddingRight: scrollbarW }}>
          <table className={cn(TABLE_BASE, TABLE_MIN_W)}>
            <PerfCols isAgent={isAgent} />
            <thead>
              {/* ═══ Tier 1 — PRIMARY GROUPED HEADER (stronger deep blue) ═══ */}
              <tr className="bg-[#3B54CF] text-white">
                {isAgent && (
                  <th rowSpan={2} className={cn(HEAD_PRIMARY, "text-white/80")} style={accentBorder("transparent")}>#</th>
                )}
                <th
                  rowSpan={2}
                  className={cn(HEAD_PRIMARY, "text-left text-white/90")}
                  style={accentBorder("transparent")}
                >
                  {firstColLabel}
                </th>
                <th colSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.leads)}>
                  Leads
                </th>
                <th colSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.walkIn)}>
                  Walk-In
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.pickup)}>
                  Pickup
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.onSite)}>
                  On-Site
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.revenue)}>
                  Revenue Won
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.projection)}>
                  Projection
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.ticket)}>
                  Ticket Won
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.followUp)}>
                  Pending F/U
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.conversion)}>
                  Conversion
                </th>
                <th rowSpan={2} className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.action)}>
                  Action
                </th>
              </tr>

              {/* ═══ Tier 2 — SECONDARY HEADER (lighter, distinct from Tier 1) ═══ */}
              <tr className="bg-[#DDE3FB] text-[#3A4DBB]">
                <th className={cn(HEAD_SECONDARY, SEC_GRP_DIV)}>Total</th>
                <th className={cn(HEAD_SECONDARY, SEC_SUB_DIV)}>Qualified</th>
                <th className={cn(HEAD_SECONDARY, SEC_GRP_DIV)}>Assign</th>
                <th className={cn(HEAD_SECONDARY, SEC_SUB_DIV)}>Visited</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* ═══ SCROLLING BODY TABLE — the ONLY part that scrolls VERTICALLY ═══
            overflow-x is hidden (not auto) so the shared OUTER wrapper owns
            horizontal scroll and header/body/footer move sideways together and
            stay aligned. min-h-0 lets the box actually shrink so the measured
            max-height takes effect; overscroll-contain stops scroll chaining to
            the page. When content is shorter than the max-height the div just
            fits the content — no forced scrollbar for small datasets. */}
        <div
          ref={scrollBodyRef}
          className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
          style={{
            maxHeight: bodyMaxH != null ? `${bodyMaxH}px` : "calc(100vh - 320px)",
            overscrollBehavior: "contain",
            overflowAnchor: "none",
          }}
        >
          <table className={cn(TABLE_BASE, TABLE_MIN_W)}>
            <PerfCols isAgent={isAgent} />
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="py-16 text-center text-[13px] text-muted-foreground">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const label = isAgent ? r.agentName : (r as PeriodPerformance).periodLabel;
                  const isMe = isAgent && highlightAgentId && r.agentId === highlightAgentId;
                  const href = reportHref ? reportHref(r) : undefined;
                  const qualRatio = r.leads > 0 ? r.qualified / r.leads : 0;
                  const isTop3 = isAgent && r.rank >= 1 && r.rank <= 3;
                  const rankAccent =
                    r.rank === 1 ? "border-l-amber-400" :
                    r.rank === 2 ? "border-l-zinc-400" :
                    r.rank === 3 ? "border-l-amber-600" : "";

                  return (
                    <tr
                      key={isAgent ? r.agentId : (r as PeriodPerformance).periodKey}
                      className={cn(
                        "border-t border-zinc-200 transition-colors",
                        isMe
                          ? "bg-[#EEF1FD]/60"
                          : idx % 2 === 1
                            ? "bg-[#F8FAFC] hover:bg-[#EEF1FD]/40"
                            : "bg-white hover:bg-[#EEF1FD]/40",
                        isAgent && isTop3 && "border-l-[3px]",
                        isAgent && isTop3 && rankAccent,
                      )}
                    >
                      {/* Rank */}
                      {isAgent && (
                        <td className={cn(CELL, "px-1")}><RankBadge rank={r.rank} /></td>
                      )}

                      {/* Identity — avatar chip + name + role (agent) / period label.
                          The name has a title attr so a long name (e.g. "Sharath
                          Chandra…") is fully readable on hover without widening
                          the row. */}
                      <td className={cn(CELL, "text-left")}>
                        <div className="flex items-center gap-2.5">
                          {isAgent && (
                            <span className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white shadow-sm",
                              toneFor(r.agentId || label),
                            )}>
                              {initials(label)}
                            </span>
                          )}
                          <span className="flex min-w-0 flex-col leading-tight">
                            {/* Name wraps to at most TWO lines (line-clamp-2)
                                rather than truncating to one aggressive "…", so
                                a longer agent name (e.g. "Sharath Chandra …")
                                stays readable without widening the column or the
                                row height. Full name still available on hover. */}
                            <span className="text-[13px] font-bold leading-snug text-zinc-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden" title={label}>
                              {label}
                              {isMe && <span className="ml-1.5 rounded-md bg-[#4361EE]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4361EE]">You</span>}
                            </span>
                            {isAgent && <span className="truncate text-[10.5px] text-zinc-400" title={r.roleLabel}>{r.roleLabel}</span>}
                          </span>
                        </div>
                      </td>

                      {/* ═══ Leads: Total / Qualified (bar + %) ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}><Metric primary={r.leads} /></td>
                      <td className={cn(CELL, BODY_SUB_DIV)}>
                        <BarMetric primary={r.qualified} ratio={qualRatio} caption={r.leads > 0 ? pct(qualRatio) : undefined} tone="bg-emerald-500" />
                      </td>

                      {/* ═══ Walk-In: Assign (routed) / Visited (real linked walk-in) ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}><Metric primary={r.routeAssigned} /></td>
                      <td className={cn(CELL, BODY_SUB_DIV)}><Metric primary={r.walkIn} /></td>

                      {/* ═══ Pickup / On-Site (routed count + completed) ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}><Metric primary={r.pickup} secondary={r.pickupCompleted > 0 ? `${r.pickupCompleted} done` : undefined} /></td>
                      <td className={cn(CELL, BODY_GRP_DIV)}><Metric primary={r.onSite} secondary={r.onSiteCompleted > 0 ? `${r.onSiteCompleted} done` : undefined} /></td>

                      {/* ═══ Revenue Won — earned (agent-driven); self-initiated muted ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}>
                        <Metric
                          primary={formatINR(r.revenueWonAgentDriven)}
                          secondary={r.revenueWonSelfInitiated > 0 ? `+${formatINR(r.revenueWonSelfInitiated)} self` : `${r.invoiceCount} inv`}
                          accent="green"
                        />
                      </td>

                      {/* ═══ Projection (weighted) ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}><Metric primary={formatINR(r.projection)} secondary="weighted" /></td>

                      {/* ═══ Ticket Won — earned count; self-initiated separately ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}>
                        <Metric
                          primary={r.ticketsWonAgentDriven}
                          secondary={r.ticketsWonSelfInitiated > 0 ? `+${r.ticketsWonSelfInitiated} self` : undefined}
                        />
                      </td>

                      {/* ═══ Pending Follow-up ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}>
                        <Metric
                          primary={r.pendingFollowUp}
                          secondary={r.overdueFollowUp > 0 ? `${r.overdueFollowUp} overdue` : undefined}
                          accent={r.overdueFollowUp > 0 ? "red" : undefined}
                        />
                      </td>

                      {/* ═══ Conversion + bar + tier badge ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}>
                        <span className="flex flex-col items-center gap-1 leading-tight">
                          <BarMetric primary={pct(r.conversionRate)} ratio={r.conversionRate} tone="bg-[#4361EE]" />
                          <TierBadge rate={r.conversionRate} />
                        </span>
                      </td>

                      {/* ═══ Action — View Details drill-down ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}>
                        {showReport && onReport ? (
                          <button
                            onClick={() => onReport(r)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#4361EE]/25 bg-[#EEF1FD] px-3 py-1.5 text-[11px] font-semibold text-[#3B54CF] shadow-sm transition hover:bg-[#4361EE] hover:text-white hover:shadow-md active:scale-[0.97]"
                          >
                            View Details <ArrowRight className="h-3 w-3" />
                          </button>
                        ) : showReport && href ? (
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#4361EE]/25 bg-[#EEF1FD] px-3 py-1.5 text-[11px] font-semibold text-[#3B54CF] shadow-sm transition hover:bg-[#4361EE] hover:text-white hover:shadow-md active:scale-[0.97]"
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
          </table>
        </div>

        {/* ═══ FIXED TOTAL FOOTER TABLE (outside the scroll region) ═══
            A LIGHT summary band — soft blue-gray surface, RepairOX-blue
            typography, a firm top border lifting it off the body. It reads as a
            clean SUMMARY (not a second dark header), with full dark-on-light
            contrast on every value and the semantic accents preserved (emerald
            revenue, blue conversion). Shares the same colgroup so it stays
            column-aligned; padded right by the body's live scrollbar width. */}
        {hasFooter && (
          <div ref={footerRef} style={{ paddingRight: scrollbarW }}>
            <table className={cn(TABLE_BASE, TABLE_MIN_W)}>
              <PerfCols isAgent={isAgent} />
              <tfoot>
                <tr className="border-t-2 border-[#4361EE]/40 bg-[#CBD5F5] text-[#1E293B]">
                  {isAgent && <td className={cn(CELL)} />}
                  <td className={cn(CELL, "text-left")}>
                    <span className="text-[12px] font-extrabold uppercase tracking-wider text-[#3B54CF]">Total</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.leads}</span>
                  </td>
                  <td className={cn(CELL, FOOT_SUB_DIV)}>
                    <BarMetric primary={totals.qualified} ratio={totals.leads > 0 ? totals.qualified / totals.leads : 0} caption={totals.leads > 0 ? pct(totals.qualified / totals.leads) : undefined} tone="bg-emerald-600" valueClass="text-[#1E293B]" captionClass="text-[#475178]" trackClass="bg-white/70" />
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.routeAssigned}</span>
                  </td>
                  <td className={cn(CELL, FOOT_SUB_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.walkIn}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.pickup}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.onSite}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums text-emerald-700">{formatINR(totals.revenueWonAgentDriven)}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{formatINR(totals.projection)}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.ticketsWonAgentDriven}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.pendingFollowUp}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <BarMetric primary={pct(totals.conversionRate)} ratio={totals.conversionRate} tone="bg-[#3B54CF]" valueClass="text-[#1E293B]" trackClass="bg-white/70" />
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

      </div>{/* /shared horizontal-scroll wrapper */}
    </div>
  );
}
