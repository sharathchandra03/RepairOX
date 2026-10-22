"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance table (Lead Management Phase 3).

   ONE table renders BOTH performance views (matching the reference layout):
     • MASTER VIEW      → one row per AGENT (rowKind="agent"), ranked + medals.
     • INDIVIDUAL VIEW  → one row per MONTH (rowKind="period") for one agent.

   Columns (both views): Total Leads, Qualified Leads, Walk-In Assigned,
   Walk-In Visited (four INDEPENDENT first-level columns — no LEADS / WALK-IN
   parent group), Pickup, On-Site, Revenue Won, Projection, Ticket Won,
   Pending F/U, Conversion, and an ACTION column (View Details →).

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
     • SINGLE-TIER flat header (one clean row) on the strong RepairOX blue
       #4261EE band. Total Leads, Qualified Leads, Walk-In
       Assigned and Walk-In Visited are independent first-level columns — no
       nested LEADS / WALK-IN parent group and no second child-header row.
       Long labels wrap to two centred lines (e.g. "Walk-In / Assigned").
     • Subtle semantic accent lines at the bottom of each header cell
       (blue for Leads, indigo for Walk-In, purple for Field, emerald for
       Revenue, blue for Projection, indigo for Ticket, amber for Follow-up,
       blue for Conversion) — never full-column backgrounds.
     • Stronger vertical dividers at the Leads/Walk-In area boundaries; a very
       soft divider gently pairs the two Lead columns and the two Walk-In
       columns without reviving a nested header.
     • Clean white body with a very subtle alternate-row tint (#F8FAFC),
       smooth hover (light RepairOX blue tint), top-3 ranked rows get a
       restrained left accent.
     • Agent avatar chip + strong name + muted role subtitle (Owner view).
       Month label is the strong anchor (Individual view).
     • Revenue Won has a subtle emerald accent; Projection a blue/neutral
       treatment; Pending F/U uses amber; Overdue uses red indicator.
     • Progress bars for Qualified % and Conversion % — same height, same
       width, same track, brand-filled.
     • Total footer: mirrors the HEADER — the same strong RepairOX blue #4261EE
       band with high-contrast WHITE typography — so the table is book-ended by
       matching blue bands. Every value is white-on-blue (fully high-contrast),
       semantic accents preserved (bright emerald revenue, white conversion bar,
       red overdue chip).
     • Owner and Individual tables share the SAME visual system so they feel
       like one cohesive performance-table family.
   Every value is derived from real records upstream — no dummy data.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, User } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
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
/* Flat single-tier header. Labels may wrap to two lines (e.g. "Walk-In /
   Assigned") and stay vertically centred via `leading-tight`. */
const HEAD_PRIMARY = "px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-center leading-tight";
/* Header dividers — ONE consistent translucent-white rule so every column
   separator on the blue band reads identically (no faint vs strong mismatch). */
const HEAD_GRP_DIV = "border-l border-white/20";
const HEAD_SUB_DIV = "border-l border-white/20";
const BODY_GRP_DIV = "border-l border-[#B4BFDD]"; // vertical divider in body — visible but a little lighter
const BODY_SUB_DIV = "border-l border-[#B4BFDD]"; // same tone so no divider reads lighter/darker than another
/* Footer dividers — ONE consistent translucent-white rule on the blue summary
   band, matching the header. */
const FOOT_GRP_DIV = "border-l border-white/20";
const FOOT_SUB_DIV = "border-l border-white/20";

/* ── Sticky-right ACTION column ─────────────────────────────────────────────
   The ACTION column (View Details →) is PINNED to the right edge so it is
   ALWAYS fully visible — even when the middle metric columns overflow and the
   table scrolls horizontally. Each section's sticky cell carries its OWN opaque
   background (header blue / body row surface / footer blue-gray) so scrolled
   content never bleeds through, plus a soft left shadow that reads as the pin
   boundary. The cell is still part of the shared colgroup, so its 120px width
   stays pixel-aligned across header/body/footer. */
const STICKY_ACTION = "sticky right-0 z-[2]";
const STICKY_ACTION_SHADOW = "shadow-[-8px_0_8px_-6px_rgba(15,23,42,0.12)]";

/* The table's intrinsic min width — shared by all three tables so their
   columns line up exactly inside the single horizontal-scroll wrapper. */
const TABLE_MIN_W = "min-w-[1238px]";
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

/* ── Agent avatar chip ──────────────────────────────────────────────────────
   Shows the agent's UPLOADED profile photo (from their account — the SAME
   `avatarUrl` the rest of the app uses). When no photo is uploaded we fall back
   to a neutral PERSON GLYPH (like a phone contact with no picture) on a soft
   tinted chip — NOT coloured initials — so an empty avatar reads as "no photo
   yet" rather than a fake identity. A broken image URL degrades to the same
   person glyph. */
function AgentAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const [broken, setBroken] = useState(false);
  const showImg = avatarUrl && !broken;
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full shadow-sm ring-1 ring-black/5",
        showImg ? "bg-zinc-100" : "bg-[#EEF1FD]",
      )}
      aria-label={name}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <User className="h-4 w-4 text-[#4361EE]/70" strokeWidth={2.2} />
      )}
    </span>
  );
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

/* ── Follow Ups cell ───────────────────────────────────────────────────────
   One self-contained, visually-structured Follow-Ups column. Three distinct,
   individual follow-up facts (all DERIVED upstream from lead_followup_history —
   never fabricated), each with its OWN treatment so the cell reads as a tiny
   dashboard rather than three identical stacked rows:

     1. OVERDUE  — the urgency HERO. When > 0 it's a red chip (dot + count +
        "overdue") that pops. When 0 it's a calm green "On track" state so a
        healthy agent never looks alarming (0 is valid data, never dimmed).
     2. TOTAL · CLOSED — a compact two-stat row under a hairline divider: the
        count over a tiny label, split by a thin separator so they read as two
        aligned stats, not a run-on line.
     3. CLOSED BAR — a labelled completion bar ("CLOSED  P%") with the amber
        fill (closed / total), so the graph's meaning is explicit.

   `onSummary` switches to the footer's high-contrast dark-on-light treatment
   on the blue-gray summary surface. */
function FollowUpCell({
  overdue, total, closed, closedRatio, onSummary = false,
}: {
  overdue: number;
  total: number;
  closed: number;
  closedRatio: number; // 0..1
  onSummary?: boolean;
}) {
  const w = Math.max(0, Math.min(1, closedRatio));
  const hasOverdue = overdue > 0;
  const hasData = total > 0;

  // The footer now mirrors the header's #3B54CF blue band, so the summary
  // Follow-Ups cell uses high-contrast WHITE-on-blue tones (not the old
  // dark-on-light-gray treatment).
  const labelMuted = onSummary ? "text-white/70" : "text-muted-foreground";
  const valTone = onSummary ? "text-white" : "text-foreground";
  const divider = onSummary ? "bg-white/25" : "bg-zinc-200";
  const track = onSummary ? "bg-white/25" : "bg-zinc-200/80";

  /* Overdue chip — red urgency when present, calm green "on track" otherwise.
     On the blue summary band the "on track" / "no F/U" states use a readable
     translucent-white chip so they stay legible on blue. */
  const chipTone = hasOverdue
    ? "bg-red-50 text-red-700 ring-red-200/70"
    : hasData
      ? (onSummary ? "bg-white/15 text-white ring-white/40" : "bg-emerald-50 text-emerald-700 ring-emerald-200/70")
      : (onSummary ? "bg-white/15 text-white/90 ring-white/40" : "bg-zinc-50 text-zinc-500 ring-zinc-200/70");

  return (
    <span className="flex flex-col items-center gap-1.5 leading-tight">
      {/* 1 ─ Overdue hero chip */}
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-inset",
        chipTone,
      )}>
        {hasOverdue ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span className="text-[12px] font-extrabold tabular-nums">{overdue}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide">overdue</span>
          </>
        ) : hasData ? (
          <span className="text-[9px] font-bold uppercase tracking-wide">On track</span>
        ) : (
          <span className="text-[9px] font-semibold uppercase tracking-wide">No F/U</span>
        )}
      </span>

      {/* 2 ─ Total · Closed aligned stat row */}
      <span className="flex items-stretch gap-2">
        <span className="flex flex-col items-center">
          <span className={cn("text-[13px] font-bold tabular-nums", valTone)}>{total}</span>
          <span className={cn("text-[8.5px] font-medium uppercase tracking-wide", labelMuted)}>total</span>
        </span>
        <span className={cn("w-px self-stretch", divider)} />
        <span className="flex flex-col items-center">
          <span className={cn("text-[13px] font-bold tabular-nums", valTone)}>{closed}</span>
          <span className={cn("text-[8.5px] font-medium uppercase tracking-wide", labelMuted)}>closed</span>
        </span>
      </span>

      {/* 3 ─ Labelled completion bar */}
      <span className="flex w-16 flex-col items-stretch gap-0.5">
        <span className="flex items-center justify-between">
          <span className={cn("text-[8px] font-semibold uppercase tracking-wide", labelMuted)}>Closed</span>
          <span className={cn("text-[9px] font-bold tabular-nums", hasData ? valTone : labelMuted)}>
            {hasData ? pct(closedRatio) : "—"}
          </span>
        </span>
        <span className={cn("h-[5px] w-full overflow-hidden rounded-full", track)}>
          <span className="block h-full rounded-full bg-amber-500 transition-all" style={{ width: `${w * 100}%` }} />
        </span>
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

/* The `#` column shows the plain numeric rank (e.g. "1.") — no chip/box — and
   the top-3 MEDAL now sits to the RIGHT of the agent name (see MedalGlyph) so
   the identity anchor reads "name 🥇". */
function RankBadge({ rank }: { rank: number }) {
  return <span className="text-[13px] font-bold tabular-nums text-zinc-500">{rank}.</span>;
}

/* Top-3 medal shown in its OWN fixed slot immediately after the name block —
   vertically centred so it stays on ONE line and in a consistent position
   whether the name is one or two lines. Nothing for rank 4+. The `.rox-medal`
   class adds a continuous diagonal shine sweep + a gentle breathing glow
   (honoring prefers-reduced-motion). */
function MedalGlyph({ rank }: { rank: number }) {
  const medal = medalFor(rank);
  if (!medal) return null;
  return <span className="rox-medal shrink-0 text-xl leading-none" aria-label={`Rank ${rank}`} title={`Rank ${rank}`}>{medal}</span>;
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
      {isAgent && <col style={{ width: "28px" }} />}
      <col style={{ width: isAgent ? "158px" : "140px" }} />
      <col style={{ width: "70px" }} /><col style={{ width: "92px" }} />{/* Total Leads / Qualified Leads */}
      <col style={{ width: "82px" }} /><col style={{ width: "82px" }} />{/* Walk-In Assigned / Walk-In Visited */}
      <col style={{ width: "62px" }} /><col style={{ width: "66px" }} />{/* Pickup / On-Site */}
      <col style={{ width: "108px" }} /><col style={{ width: "92px" }} />{/* Revenue / Projection */}
      <col style={{ width: "66px" }} /><col style={{ width: "112px" }} />{/* Ticket Won / Follow Ups */}
      <col style={{ width: "100px" }} />{/* Conversion */}
      <col style={{ width: "120px" }} />{/* Action */}
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
  /** When true, the table STRETCHES to fill the available viewport height: the
   *  card grows down to the bottom gap, the body flex-grows to push the Total
   *  footer to the very bottom, and the body scrolls only when the rows exceed
   *  that space. Used by the collapsed "work mode" so the footer sits at the
   *  bottom and the body stretches up into the space the header freed. When
   *  false the table is content-driven (compact for a few rows). */
  fillViewport = false,
}: {
  rows: PerfRow[];
  rowKind: "agent" | "period";
  showReport?: boolean;
  reportHref?: (row: PerfRow) => string;
  onReport?: (row: PerfRow) => void;
  highlightAgentId?: string;
  firstColLabel: string;
  emptyText?: string;
  fillViewport?: boolean;
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
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [bodyMaxH, setBodyMaxH] = useState<number | null>(null);
  // In fill-viewport (collapsed "work mode") the whole card is stretched to the
  // bottom gap so the footer drops to the bottom and the body flex-grows up.
  const [cardH, setCardH] = useState<number | null>(null);
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
      // In fill mode the whole CARD is stretched to the bottom gap so the footer
      // drops to the bottom of the viewport; the body (flex-1) grows into it.
      const card = cardRef.current;
      if (card) {
        const cardTop = card.getBoundingClientRect().top;
        setCardH(Math.max(MIN_BODY + footerH, Math.round(window.innerHeight - cardTop - BOTTOM_GAP)));
      }
    };
    measure();
    // The collapse height animation runs ~220ms; re-measure just past it so the
    // card/body settle at the final freed height once the header is gone.
    const settle = window.setTimeout(measure, 260);
    window.addEventListener("resize", measure);
    // The strip above the table (filters/KPIs) can change height (wrapping,
    // active-filter chips appearing) without a window resize — observe it too.
    // Also observe the footer so its height is re-reserved if it wraps.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (footerRef.current) ro.observe(footerRef.current);
    return () => { window.clearTimeout(settle); window.removeEventListener("resize", measure); ro.disconnect(); };
  }, [rows.length, hasFooter, fillViewport]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "overflow-hidden rounded-2xl border-2 border-zinc-300 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(67,97,238,0.05)]",
        fillViewport && "flex flex-col",
      )}
      style={fillViewport && cardH != null ? { height: `${cardH}px` } : undefined}
    >
      {/* ── Shared horizontal-scroll wrapper ──────────────────────────────
          All three tables (header / body / footer) live inside this ONE wrapper
          so on narrow screens they scroll sideways TOGETHER and stay perfectly
          column-aligned. The page itself never overflows horizontally. In fill
          mode it becomes a flex column so the body can flex-grow and push the
          footer to the bottom. */}
      <div className={cn("overflow-x-auto rox-rail-scroll", fillViewport && "flex min-h-0 flex-1 flex-col")}>

        {/* ═══ FIXED HEADER TABLE (outside the vertical scroll region) ═══ */}
        <div style={{ paddingRight: scrollbarW }}>
          <table className={cn(TABLE_BASE, TABLE_MIN_W)}>
            <PerfCols isAgent={isAgent} />
            <thead>
              {/* ═══ SINGLE-TIER FLAT HEADER ═══
                  Total Leads, Qualified Leads, Walk-In Assigned and Walk-In
                  Visited are now INDEPENDENT first-level columns — no LEADS /
                  WALK-IN parent group, no second child-header row. Every column
                  shares the same strong RepairOX-blue header treatment and the
                  group-strength vertical dividers so the four metrics read as
                  four crisply separated standalone columns. */}
              <tr className="bg-[#4261EE] text-white">
                {isAgent && (
                  <th className={cn(HEAD_PRIMARY, "text-white/80")} style={accentBorder("transparent")}>#</th>
                )}
                <th className={cn(HEAD_PRIMARY, "text-left text-white/90")} style={accentBorder("transparent")}>
                  {firstColLabel}
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.leads)}>
                  Total<br />Leads
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_SUB_DIV)} style={accentBorder(ACCENT.leads)}>
                  Qualified<br />Leads
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.walkIn)}>
                  Walk-In<br />Assigned
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_SUB_DIV)} style={accentBorder(ACCENT.walkIn)}>
                  Walk-In<br />Visited
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.pickup)}>
                  Pickup
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV, "whitespace-nowrap")} style={accentBorder(ACCENT.onSite)}>
                  On-Site
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.revenue)}>
                  Revenue Won
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.projection)}>
                  Projection
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.ticket)}>
                  Ticket Won
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.followUp)}>
                  Follow Ups
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV)} style={accentBorder(ACCENT.conversion)}>
                  Conversion
                </th>
                <th className={cn(HEAD_PRIMARY, HEAD_GRP_DIV, STICKY_ACTION, STICKY_ACTION_SHADOW, "bg-[#4261EE]")} style={accentBorder(ACCENT.action)}>
                  Action
                </th>
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
          className={cn(
            "min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300",
            // Fill mode: the body grows to absorb all the freed height (pushing
            // the footer to the bottom) and scrolls only when rows overflow it.
            fillViewport && "flex-1",
          )}
          style={
            fillViewport
              ? { overscrollBehavior: "contain", overflowAnchor: "none" }
              : {
                  maxHeight: bodyMaxH != null ? `${bodyMaxH}px` : "calc(100vh - 320px)",
                  overscrollBehavior: "contain",
                  overflowAnchor: "none",
                }
          }
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
                  /* Opaque background for the PINNED (sticky-right) Action cell —
                     a sticky cell needs a solid fill so the scrolled metric
                     columns never show through it. Mirrors the row's resolved
                     surface (highlight / alternate tint / white). */
                  const actionBg = isMe ? "bg-[#EEF1FD]" : idx % 2 === 1 ? "bg-[#F8FAFC]" : "bg-white";

                  return (
                    <tr
                      key={isAgent ? r.agentId : (r as PeriodPerformance).periodKey}
                      className={cn(
                        "transition-colors",
                        isMe
                          ? "bg-[#EEF1FD]/60"
                          : idx % 2 === 1
                            ? "bg-[#EDF1F9] hover:bg-[#EEF1FD]/70"
                            : "bg-white hover:bg-[#EEF1FD]/70",
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
                      <td className={cn(CELL, "text-left", isAgent && "pl-1")}>
                        <div className="flex items-center gap-2.5">
                          {isAgent && (
                            <AgentAvatar name={label} avatarUrl={r.avatarUrl} />
                          )}
                          {/* Name/role stack takes the remaining width (flex-1,
                              min-w-0 so a long name wraps to two lines); the
                              medal sits in a FIXED right-edge slot after it so
                              it lands in the SAME horizontal position on every
                              row regardless of name length / line count. */}
                          <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="text-[13px] font-bold leading-snug text-zinc-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden" title={label}>
                              {label}
                              {isMe && <span className="ml-1.5 rounded-md bg-[#4361EE]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4361EE]">You</span>}
                            </span>
                            {isAgent && <span className="truncate text-[10.5px] text-zinc-400" title={r.roleLabel}>{r.roleLabel}</span>}
                          </span>
                          {isAgent && (
                            <span className="grid w-7 shrink-0 place-items-center">
                              {r.rank >= 1 && r.rank <= 3 && <MedalGlyph rank={r.rank} />}
                            </span>
                          )}
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

                      {/* ═══ Follow Ups — Overdue (top) · Total (below) ·
                             Closed/completed progress bar ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}>
                        <FollowUpCell
                          overdue={r.followUps.overdue}
                          total={r.followUps.total}
                          closed={r.followUps.completed}
                          closedRatio={r.followUps.completionRate}
                        />
                      </td>

                      {/* ═══ Conversion + bar + tier badge ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV)}>
                        <span className="flex flex-col items-center gap-1 leading-tight">
                          <BarMetric primary={pct(r.conversionRate)} ratio={r.conversionRate} tone="bg-[#4361EE]" />
                          <TierBadge rate={r.conversionRate} />
                        </span>
                      </td>

                      {/* ═══ Action — View Details drill-down (pinned right) ═══ */}
                      <td className={cn(CELL, BODY_GRP_DIV, STICKY_ACTION, STICKY_ACTION_SHADOW, actionBg)}>
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
            The summary band mirrors the HEADER — the same strong RepairOX blue
            #3B54CF surface with high-contrast WHITE typography — so the table is
            visually book-ended by matching blue bands (header on top, total on
            the bottom). Every value is white-on-blue (fully high-contrast, never
            dark-on-dark); Revenue keeps a bright emerald accent that still pops
            on blue, and the progress-bar tracks/fills use white so they read
            clearly against the band. Shares the same colgroup so it stays
            column-aligned; padded right by the body's live scrollbar width. */}
        {hasFooter && (
          <div ref={footerRef} style={{ paddingRight: scrollbarW }}>
            <table className={cn(TABLE_BASE, TABLE_MIN_W)}>
              <PerfCols isAgent={isAgent} />
              <tfoot>
                <tr className="border-t-2 border-white/30 bg-[#4261EE] text-white">
                  {isAgent && <td className={cn(CELL)} />}
                  <td className={cn(CELL, "text-left")}>
                    <span className="text-[12px] font-extrabold uppercase tracking-wider text-white">Total</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.leads}</span>
                  </td>
                  <td className={cn(CELL, FOOT_SUB_DIV)}>
                    <BarMetric primary={totals.qualified} ratio={totals.leads > 0 ? totals.qualified / totals.leads : 0} caption={totals.leads > 0 ? pct(totals.qualified / totals.leads) : undefined} tone="bg-emerald-300" valueClass="text-white" captionClass="text-white/80" trackClass="bg-white/25" />
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
                    <span className="text-[14px] font-extrabold tabular-nums text-emerald-200">{formatINR(totals.revenueWonAgentDriven)}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{formatINR(totals.projection)}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <span className="text-[14px] font-extrabold tabular-nums">{totals.ticketsWonAgentDriven}</span>
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <FollowUpCell
                      overdue={totals.followUpsOverdue}
                      total={totals.followUpsTotal}
                      closed={totals.followUpsCompleted}
                      closedRatio={totals.followUpsTotal > 0 ? totals.followUpsCompleted / totals.followUpsTotal : 0}
                      onSummary
                    />
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV)}>
                    <BarMetric primary={pct(totals.conversionRate)} ratio={totals.conversionRate} tone="bg-white" valueClass="text-white" trackClass="bg-white/25" />
                  </td>
                  <td className={cn(CELL, FOOT_GRP_DIV, STICKY_ACTION, STICKY_ACTION_SHADOW, "bg-[#4261EE]")} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

      </div>{/* /shared horizontal-scroll wrapper */}
    </div>
  );
}
