"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance table (Lead Management Phase 3).

   ONE table renders BOTH performance views (matching the reference layout):
     • MASTER VIEW      → one row per AGENT (rowKind="agent"), ranked + medals.
     • INDIVIDUAL VIEW  → one row per MONTH (rowKind="period") for one agent.

   Columns (both views): Total Leads, Qualified Leads, Walk-In Assigned,
   Walk-In Visited (four INDEPENDENT first-level columns — no LEADS / WALK-IN
   parent group), Pickup, On-Site, Revenue Won, Projection, Ticket Won,
   Follow Ups, Pending Leads, No Response, Conversion, and an ACTION column
   (View Details →).

   ── PERSONAL GRID (same engine as the Lead Table) ─────────────────────────
   Column ORDER (Customize columns) and FROZEN columns (Freeze columns, both
   left and right) are per-user preferences via useColumnOrder /
   useFrozenColumns. The identity column (Agent Name / Month) is the LEFT
   anchor, Action the RIGHT anchor; the rank "#" column is structural and
   always pinned at the left edge.

   ── CONTAINER BEHAVIOUR ───────────────────────────────────────────────────
   ONE scroll container holds ONE <table>: the header is `position: sticky;
   top: 0`, the Total footer is `position: sticky; bottom: 0`, and frozen
   columns are `position: sticky` left/right. Because header, body and footer
   are in the same scroller, horizontal scrolling is a single native scroll —
   they always move at exactly the same speed (no JS scroll-mirroring between
   separate tables, which lagged). The container is CONTENT-DRIVEN for small
   datasets and its max-height is RUNTIME-MEASURED from its distance to the
   viewport bottom, so the page never grows tall with many agents and the
   Total footer is always on-screen. Sticky offsets are computed from the exact
   rendered column widths (table-fixed + explicit table width), so a frozen
   column is never mis-positioned.

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

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, User } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import {
  medalFor, conversionTier, sumPerfRows,
  type AgentPerformance, type PeriodPerformance, type PerfTotals,
} from "@/lib/agent-performance";
import { usePermissions } from "@/lib/permissions-context";
import { useColumnOrder } from "@/hooks/use-column-order";
import { useFrozenColumns, type GridColumn } from "@/hooks/use-frozen-columns";
import { useScrollEdges } from "@/hooks/use-scroll-edges";
import { FreezeColumnsMenu } from "@/components/common/freeze-columns-menu";
import { CustomizeColumnsMenu } from "@/components/common/customize-columns-menu";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export type PerfRow = AgentPerformance | PeriodPerformance;

/* ── shared cell geometry ─────────────────────────────────────────────────
   ONE vertical rule per tier, continuous through header / body / footer. */
const CELL = "px-4 py-3.5 align-middle text-center";
const HEAD_CELL = "px-4 py-3 text-[10.5px] font-bold uppercase tracking-wider text-center leading-tight text-white";
const HEAD_DIV = "border-l border-white/20";
const BODY_DIV = "border-l border-[#B4BFDD]";
const FOOT_DIV = "border-l border-white/20";
const BRAND_BLUE = "#5368D4";

/* ── Semantic accent colors for header bottom borders ─────────────────── */
const ACCENT = {
  leads: "#4361EE",      // RepairOX blue
  walkIn: "#6366F1",     // indigo
  pickup: "#8B5CF6",     // purple
  onSite: "#8B5CF6",     // purple
  revenue: "#10B981",    // emerald
  projection: "#4361EE", // blue
  ticket: "#6366F1",     // indigo
  followUp: "#F59E0B",   // amber
  pending: "#14B8A6",    // teal (fresh-assignment inbox identity)
  noResponse: "#F43F5E", // rose (Not Contacted identity)
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

/* A metric cell: bold primary + an optional small muted secondary line.
   `money` tightens the primary (nowrap + 13px) so large Indian-grouped currency
   values — up to ₹1,00,00,000 (8 digits) and beyond — stay on one line and
   don't overflow the Revenue / Projection columns or clip under the divider. */
function Metric({ primary, secondary, accent, money = false }: { primary: React.ReactNode; secondary?: React.ReactNode; accent?: "green" | "amber" | "red"; money?: boolean }) {
  return (
    <span className="flex max-w-full flex-col items-center leading-tight">
      <span className={cn(
        "font-bold tabular-nums",
        money ? "text-[13px] whitespace-nowrap" : "text-[14px]",
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

  // Compact, single-line-first layout — SAME facts (overdue · total · closed ·
  // closed %) but in a fraction of the vertical space: one tight stat row
  // (overdue dot/count when present, then total → closed) with the completion
  // % inline, over a slim amber bar. No stacked chip + stat block + labelled
  // bar; the cell stays short so the table rows and the Total footer don't grow
  // tall. Colours still honour the blue summary band (onSummary).
  return (
    <span className="flex flex-col items-center gap-1 leading-tight">
      {/* 1 ─ One compact stat row: [• N] status · closed/total */}
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {hasOverdue && (
          <span className="inline-flex items-center gap-0.5 text-red-600" title={`${overdue} overdue`}>
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span className="text-[12px] font-extrabold tabular-nums">{overdue}</span>
          </span>
        )}
        {hasData ? (
          <span className="inline-flex items-baseline gap-1" title={`${closed} of ${total} closed`}>
            <span className={cn("text-[13px] font-bold tabular-nums", valTone)}>{closed}</span>
            <span className={cn("text-[10px] tabular-nums", labelMuted)}>/ {total}</span>
            <span className={cn("text-[8.5px] font-medium uppercase", labelMuted)}>closed</span>
          </span>
        ) : (
          <span className={cn("text-[9px] font-bold uppercase tracking-wide", labelMuted)}>No F/U</span>
        )}
      </span>

      {/* 2 ─ Slim completion bar with the % inline on the right */}
      <span className="flex w-20 items-center gap-1.5">
        <span className={cn("h-[4px] flex-1 overflow-hidden rounded-full", track)}>
          <span className="block h-full rounded-full bg-amber-500 transition-all" style={{ width: `${w * 100}%` }} />
        </span>
        <span className={cn("w-8 text-right text-[9px] font-bold tabular-nums", hasData ? valTone : labelMuted)}>
          {hasData ? pct(closedRatio) : "—"}
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


/* ═══════════════════════════════════════════════════════════════════════
   COLUMN MODEL
   ───────────────────────────────────────────────────────────────────────
   ONE column definition per displayed metric. The same definition drives the
   <colgroup>, the header cell, the body cell and the Total footer cell, so
   reordering / freezing a column moves all four together and they can never
   drift. The `GridColumn` part is the contract shared with the Lead Table's
   per-user Customize-Columns + Freeze-Columns engine.
   ═══════════════════════════════════════════════════════════════════════ */
type CellCtx = {
  idx: number;
  isAgent: boolean;
  isMe: boolean;
  label: string;
  showReport: boolean;
  href?: string;
  onReport?: (r: PerfRow) => void;
};

type PerfColDef = GridColumn & {
  head: React.ReactNode;
  accent: string;
  cell: (r: PerfRow, c: CellCtx) => React.ReactNode;
  foot: (t: PerfTotals) => React.ReactNode;
};

const FOOT_NUM = "text-[14px] font-extrabold tabular-nums";

function ActionCell({ r, c }: { r: PerfRow; c: CellCtx }) {
  const cls = "inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#4361EE]/25 bg-[#EEF1FD] px-2.5 py-1 text-[11px] font-semibold text-[#3B54CF] shadow-sm transition hover:bg-[#4361EE] hover:text-white hover:shadow-md active:scale-[0.97]";
  if (c.showReport && c.onReport) {
    return (
      <button onClick={() => c.onReport?.(r)} className={cls} title="View Details">
        View <ArrowRight className="h-3 w-3" />
      </button>
    );
  }
  if (c.showReport && c.href) {
    return (
      <Link href={c.href} className={cls} title="View Details">
        View <ArrowRight className="h-3 w-3" />
      </Link>
    );
  }
  return <span className="text-[11px] text-muted-foreground">—</span>;
}

function buildCols(isAgent: boolean): PerfColDef[] {
  const cols: PerfColDef[] = [];

  /* Rank — structural, always pinned at the very left edge (like the Lead
     Table's selection column). Not reorderable, not in the freeze menu. */
  if (isAgent) {
    cols.push({
      key: "rank", label: "Rank", width: 56, reorderable: false, freezable: false,
      head: "#", accent: "transparent",
      cell: (r) => <RankBadge rank={r.rank} />,
      foot: () => null,
    });
  }

  /* Identity — LEFT anchor (Agent Name / Month). */
  cols.push({
    key: "name", label: isAgent ? "Agent Name" : "Month", width: isAgent ? 224 : 176, lockedLeft: true,
    head: null, accent: "transparent",
    cell: (r, c) => (
      <div className="flex items-center gap-2.5">
        {c.isAgent && <AgentAvatar name={c.label} avatarUrl={r.avatarUrl} />}
        {/* Name/role stack takes the remaining width (min-w-0 so a long name
            wraps to two lines); the medal sits in a FIXED right-edge slot so it
            lands in the same position on every row. */}
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span
            className="text-[13px] font-bold leading-snug text-zinc-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
            title={c.label}
          >
            {c.label}
            {c.isMe && <span className="ml-1.5 rounded-md bg-[#4361EE]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4361EE]">You</span>}
          </span>
          {c.isAgent && <span className="truncate text-[10.5px] text-zinc-400" title={r.roleLabel}>{r.roleLabel}</span>}
        </span>
        {c.isAgent && (
          <span className="grid w-7 shrink-0 place-items-center">
            {r.rank >= 1 && r.rank <= 3 && <MedalGlyph rank={r.rank} />}
          </span>
        )}
      </div>
    ),
    foot: () => <span className="text-[12px] font-extrabold uppercase tracking-wider text-white">Total</span>,
  });

  cols.push({
    key: "leads", label: "Total Leads", width: 104,
    head: <>Total<br />Leads</>, accent: ACCENT.leads,
    cell: (r) => <Metric primary={r.leads} />,
    foot: (t) => <span className={FOOT_NUM}>{t.leads}</span>,
  });
  cols.push({
    key: "qualified", label: "Qualified Leads", width: 136,
    head: <>Qualified<br />Leads</>, accent: ACCENT.leads,
    cell: (r) => {
      const ratio = r.leads > 0 ? r.qualified / r.leads : 0;
      return <BarMetric primary={r.qualified} ratio={ratio} caption={r.leads > 0 ? pct(ratio) : undefined} tone="bg-emerald-500" />;
    },
    foot: (t) => {
      const ratio = t.leads > 0 ? t.qualified / t.leads : 0;
      return <BarMetric primary={t.qualified} ratio={ratio} caption={t.leads > 0 ? pct(ratio) : undefined} tone="bg-emerald-300" valueClass="text-white" captionClass="text-white/80" trackClass="bg-white/25" />;
    },
  });
  cols.push({
    key: "walkInAssigned", label: "Walk-In Assigned", width: 124,
    head: <>Walk-In<br />Assigned</>, accent: ACCENT.walkIn,
    cell: (r) => <Metric primary={r.routeAssigned} />,
    foot: (t) => <span className={FOOT_NUM}>{t.routeAssigned}</span>,
  });
  cols.push({
    key: "walkInVisited", label: "Walk-In Visited", width: 124,
    head: <>Walk-In<br />Visited</>, accent: ACCENT.walkIn,
    cell: (r) => <Metric primary={r.walkIn} />,
    foot: (t) => <span className={FOOT_NUM}>{t.walkIn}</span>,
  });
  cols.push({
    key: "pickup", label: "Pickup", width: 116,
    head: "Pickup", accent: ACCENT.pickup,
    cell: (r) => <Metric primary={r.pickup} secondary={r.pickupCompleted > 0 ? `${r.pickupCompleted} done` : undefined} />,
    foot: (t) => <span className={FOOT_NUM}>{t.pickup}</span>,
  });
  cols.push({
    key: "onSite", label: "On-Site", width: 116,
    head: <span className="whitespace-nowrap">On-Site</span>, accent: ACCENT.onSite,
    cell: (r) => <Metric primary={r.onSite} secondary={r.onSiteCompleted > 0 ? `${r.onSiteCompleted} done` : undefined} />,
    foot: (t) => <span className={FOOT_NUM}>{t.onSite}</span>,
  });
  cols.push({
    key: "revenue", label: "Revenue Won", width: 156,
    head: "Revenue Won", accent: ACCENT.revenue,
    cell: (r) => (
      <Metric
        primary={formatINR(r.revenueWonAgentDriven)}
        secondary={r.revenueWonSelfInitiated > 0 ? `+${formatINR(r.revenueWonSelfInitiated)} self` : `${r.invoiceCount} inv`}
        accent="green"
        money
      />
    ),
    foot: (t) => <span className="whitespace-nowrap text-[13px] font-extrabold tabular-nums text-emerald-200">{formatINR(t.revenueWonAgentDriven)}</span>,
  });
  cols.push({
    key: "projection", label: "Projection", width: 146,
    head: "Projection", accent: ACCENT.projection,
    cell: (r) => <Metric primary={formatINR(r.projection)} secondary="weighted" money />,
    foot: (t) => <span className="whitespace-nowrap text-[13px] font-extrabold tabular-nums">{formatINR(t.projection)}</span>,
  });
  cols.push({
    key: "ticketWon", label: "Ticket Won", width: 116,
    head: "Ticket Won", accent: ACCENT.ticket,
    cell: (r) => (
      <Metric
        primary={r.ticketsWonAgentDriven}
        secondary={r.ticketsWonSelfInitiated > 0 ? `+${r.ticketsWonSelfInitiated} self` : undefined}
      />
    ),
    foot: (t) => <span className={FOOT_NUM}>{t.ticketsWonAgentDriven}</span>,
  });
  cols.push({
    key: "followUps", label: "Follow Ups", width: 156,
    head: "Follow Ups", accent: ACCENT.followUp,
    cell: (r) => (
      <FollowUpCell
        overdue={r.followUps.overdue}
        total={r.followUps.total}
        closed={r.followUps.completed}
        closedRatio={r.followUps.completionRate}
      />
    ),
    foot: (t) => (
      <FollowUpCell
        overdue={t.followUpsOverdue}
        total={t.followUpsTotal}
        closed={t.followUpsCompleted}
        closedRatio={t.followUpsTotal > 0 ? t.followUpsCompleted / t.followUpsTotal : 0}
        onSummary
      />
    ),
  });
  /* Work-queue columns — SAME membership as the Lead Table:
       Pending Leads = fresh assignments awaiting the first action
                       (Assigned Leads → New)
       No Response   = open leads with no successful two-way contact
                       (Not Contacted → Active) */
  cols.push({
    key: "pendingLeads", label: "Pending Leads", width: 124,
    head: <>Pending<br />Leads</>, accent: ACCENT.pending,
    cell: (r) => <Metric primary={r.pendingLeads} />,
    foot: (t) => <span className={FOOT_NUM}>{t.pendingLeads}</span>,
  });
  cols.push({
    key: "noResponse", label: "No Response", width: 124,
    head: <>No<br />Response</>, accent: ACCENT.noResponse,
    cell: (r) => <Metric primary={r.noResponse} />,
    foot: (t) => <span className={FOOT_NUM}>{t.noResponse}</span>,
  });
  cols.push({
    key: "conversion", label: "Conversion", width: 136,
    head: "Conversion", accent: ACCENT.conversion,
    cell: (r) => (
      <span className="flex flex-col items-center gap-1 leading-tight">
        <BarMetric primary={pct(r.conversionRate)} ratio={r.conversionRate} tone="bg-[#4361EE]" />
        <TierBadge rate={r.conversionRate} />
      </span>
    ),
    foot: (t) => <BarMetric primary={pct(t.conversionRate)} ratio={t.conversionRate} tone="bg-white" valueClass="text-white" trackClass="bg-white/25" />,
  });

  /* Action — RIGHT anchor, always pinned to the right edge. */
  cols.push({
    key: "action", label: "Action", width: 112, lockedRight: true,
    head: "Action", accent: ACCENT.action,
    cell: (r, c) => <ActionCell r={r} c={c} />,
    foot: () => null,
  });

  return cols;
}

/* Module-level constants → stable identity for the column-order / freeze hooks. */
const AGENT_COLS = buildCols(true);
const PERIOD_COLS = buildCols(false);

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
   *  card grows down to the bottom gap and the Total footer sits at the very
   *  bottom (collapsed "work mode"). When false the table is content-driven. */
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
  const hasFooter = rows.length > 0;
  const { currentUser } = usePermissions();

  /* ── Personal grid preferences (same engine as the Lead Table) ──────────
     Column ORDER and FROZEN columns are two separate per-user preferences.
     The frozen selection is computed against the user's VISUAL order so the
     sticky offsets always follow what the user sees. */
  const baseCols = isAgent ? AGENT_COLS : PERIOD_COLS;
  const tableKey = isAgent ? "agent_performance_agents" : "agent_performance_months";
  const columnOrder = useColumnOrder(tableKey, currentUser?.id, baseCols);
  const orderedColumns = columnOrder.orderedColumns;
  // Independent pins: freezing a column freezes ONLY that column (it is shown
  // beside its edge anchor). Separate storage id so older block-style pins
  // saved before this change never resurface.
  const frozen = useFrozenColumns(`${tableKey}_pins`, currentUser?.id, orderedColumns, { independent: true });

  const defByKey = useMemo(() => new Map(baseCols.map((c) => [c.key, c])), [baseCols]);
  /* DISPLAY order = rank · left block (identity + any left pins) · scrolling
     middle (the user's saved order) · right block (any right pins + Action).
     A pinned column is shown beside its edge anchor, so freezing one column
     never drags its neighbours along; unfreezing returns it to its saved
     slot (the saved order itself is never rewritten by freezing). */
  const defs = useMemo(() => {
    const leftSet = new Set(frozen.leftKeys);
    const rightSet = new Set(frozen.rightKeys);
    const middle = orderedColumns
      .map((c) => c.key)
      .filter((k) => k !== "rank" && !leftSet.has(k) && !rightSet.has(k));
    const keys = [
      ...orderedColumns.filter((c) => c.key === "rank").map((c) => c.key),
      ...frozen.leftKeys,
      ...middle,
      ...frozen.rightKeys,
    ];
    return keys.map((k) => defByKey.get(k)).filter((d): d is PerfColDef => !!d);
  }, [orderedColumns, frozen.leftKeys, frozen.rightKeys, defByKey]);

  /* ── ONE scroll container, ONE table ────────────────────────────────────
     The header (sticky top), the Total footer (sticky bottom), the frozen
     columns (sticky left/right) and the body all live inside the SAME
     overflow:auto element — so horizontal scrolling is a single native scroll
     and the header, body and footer can never drift out of sync (no JS
     scroll-mirroring between separate tables). */
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const fillerRef = useRef<HTMLTableRowElement>(null);
  useScrollEdges(scrollRef);

  const [bodyMaxH, setBodyMaxH] = useState<number | null>(null);
  const [cardH, setCardH] = useState<number | null>(null);
  const [cw, setCw] = useState(0);        // scroll container clientWidth
  const [fillerH, setFillerH] = useState(0);

  /* Runtime-measured max height (distance to viewport bottom) + container
     width. Re-measured on resize / zoom, strip-height changes and collapse. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const BOTTOM_GAP = 24;
    const MIN_BODY = 200;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      setBodyMaxH(Math.max(MIN_BODY, Math.round(window.innerHeight - top - BOTTOM_GAP)));
      setCw(el.clientWidth);
      const card = cardRef.current;
      if (card) {
        const cardTop = card.getBoundingClientRect().top;
        setCardH(Math.max(MIN_BODY, Math.round(window.innerHeight - cardTop - BOTTOM_GAP)));
      }
    };
    measure();
    const settle = window.setTimeout(measure, 260); // past the collapse animation
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    ro.observe(el);
    return () => { window.clearTimeout(settle); window.removeEventListener("resize", measure); ro.disconnect(); };
  }, [rows.length, fillViewport]);

  /* Fill mode: when there are few rows, a spacer row absorbs the leftover
     height so the sticky Total footer rests on the bottom edge. */
  useEffect(() => {
    const c = scrollRef.current;
    const t = tableRef.current;
    if (!c || !t || !fillViewport || !hasFooter) { setFillerH(0); return; }
    const calc = () => {
      const natural = t.offsetHeight - (fillerRef.current?.offsetHeight ?? 0);
      setFillerH(Math.max(0, Math.floor(c.clientHeight - natural)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(c);
    ro.observe(t);
    return () => ro.disconnect();
  }, [fillViewport, hasFooter, rows.length, defs.length]);

  /* ── Effective column widths ────────────────────────────────────────────
     Sticky offsets are computed from these exact widths and the table is given
     an explicit width equal to their sum (table-fixed), so a frozen column's
     offset ALWAYS matches where it is painted. When the container is wider
     than the columns, widths scale up proportionally (remainder to the
     identity column) so the table fills the card instead of leaving a gap. */
  const effW = useMemo(() => {
    const m = new Map<string, number>();
    const base = orderedColumns.reduce((s, c) => s + c.width, 0);
    const scale = cw > base && base > 0 ? cw / base : 1;
    let sum = 0;
    for (const c of orderedColumns) {
      const w = Math.floor(c.width * scale);
      m.set(c.key, w);
      sum += w;
    }
    if (scale > 1) {
      const rem = Math.floor(cw) - sum;
      if (rem > 0) m.set("name", (m.get("name") ?? 0) + rem);
    }
    return m;
  }, [orderedColumns, cw]);
  const tableW = useMemo(() => [...effW.values()].reduce((s, w) => s + w, 0), [effW]);

  /* Sticky offsets — identical contract to the Lead Table's frozenCellProps. */
  const rankW = effW.get("rank") ?? 0;
  const frozenCellProps = (key: string): { className: string; style?: React.CSSProperties } => {
    if (key === "rank") {
      return { className: "rox-frozen rox-frozen-left", style: { ["--rox-frozen-offset" as string]: "0px" } as React.CSSProperties };
    }
    const leftIdx = frozen.leftKeys.indexOf(key);
    if (leftIdx >= 0) {
      let offset = rankW;
      for (let i = 0; i < leftIdx; i++) offset += effW.get(frozen.leftKeys[i]) ?? 0;
      const isLast = leftIdx === frozen.leftKeys.length - 1;
      return {
        className: cn("rox-frozen rox-frozen-left", isLast && "rox-frozen-left-edge"),
        style: { ["--rox-frozen-offset" as string]: `${offset}px` } as React.CSSProperties,
      };
    }
    const rightIdx = frozen.rightKeys.indexOf(key);
    if (rightIdx >= 0) {
      let offset = 0;
      for (let i = rightIdx + 1; i < frozen.rightKeys.length; i++) offset += effW.get(frozen.rightKeys[i]) ?? 0;
      return {
        className: cn("rox-frozen rox-frozen-right", rightIdx === 0 && "rox-frozen-right-edge"),
        style: { ["--rox-frozen-offset" as string]: `${offset}px` } as React.CSSProperties,
      };
    }
    return { className: "" };
  };

  return (
    <div>
      {/* Personal table tools — SAME controls as the Lead Table. */}
      <div className="mb-2 hidden items-center justify-end gap-2 md:flex">
        <CustomizeColumnsMenu columns={orderedColumns} state={columnOrder} />
        <FreezeColumnsMenu columns={orderedColumns} state={frozen} independent />
      </div>

      <div
        ref={cardRef}
        className={cn(
          "overflow-hidden rounded-2xl border-2 border-zinc-300 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(67,97,238,0.05)]",
          fillViewport && "flex flex-col",
        )}
        style={fillViewport && cardH != null ? { height: `${cardH}px` } : undefined}
      >
        <div
          ref={scrollRef}
          role="region"
          aria-label="Agent performance table"
          tabIndex={0}
          className={cn("rox-perf-table rox-hscroll min-h-0 overflow-auto overscroll-contain", fillViewport && "flex-1")}
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
          <table
            ref={tableRef}
            className="table-fixed border-separate border-spacing-0 text-[13px]"
            style={{ width: tableW > 0 ? `${tableW}px` : undefined }}
          >
            <colgroup>
              {defs.map((d) => <col key={d.key} style={{ width: `${effW.get(d.key) ?? d.width}px` }} />)}
            </colgroup>

            {/* ═══ HEADER — sticky top, one flat row on the brand-blue band ═══ */}
            <thead>
              <tr>
                {defs.map((d, i) => {
                  const f = frozenCellProps(d.key);
                  return (
                    <th
                      key={d.key}
                      className={cn(HEAD_CELL, i > 0 && HEAD_DIV, d.key === "name" && "text-left text-white/90", d.key === "rank" && "text-white/80", f.className)}
                      style={{
                        ...f.style,
                        position: "sticky",
                        top: 0,
                        zIndex: f.className ? 9 : 6,
                        backgroundColor: BRAND_BLUE,
                        ...accentBorder(d.accent),
                      }}
                    >
                      {d.key === "name" ? firstColLabel : d.head}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ═══ BODY ═══ */}
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, defs.length)} className="py-16 text-center text-[13px] text-muted-foreground">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const label = isAgent ? r.agentName : (r as PeriodPerformance).periodLabel;
                  const isMe = !!(isAgent && highlightAgentId && r.agentId === highlightAgentId);
                  const ctx: CellCtx = {
                    idx, isAgent, isMe, label, showReport, onReport,
                    href: reportHref ? reportHref(r) : undefined,
                  };
                  const rankAccent =
                    r.rank === 1 ? "border-l-amber-400" :
                    r.rank === 2 ? "border-l-zinc-400" :
                    r.rank === 3 ? "border-l-amber-600" : "";
                  const isTop3 = isAgent && r.rank >= 1 && r.rank <= 3;

                  return (
                    <tr
                      key={isAgent ? r.agentId : (r as PeriodPerformance).periodKey}
                      className={cn(
                        "bg-[var(--perf-cell-bg)] transition-colors hover:[--perf-cell-bg:#EEF1FD]",
                        isMe ? "[--perf-cell-bg:#F3F5FE]" : idx % 2 === 1 ? "[--perf-cell-bg:#EDF1F9]" : "[--perf-cell-bg:#FFFFFF]",
                      )}
                    >
                      {defs.map((d, i) => {
                        const f = frozenCellProps(d.key);
                        return (
                          <td
                            key={d.key}
                            className={cn(
                              CELL,
                              i > 0 && BODY_DIV,
                              d.key === "name" && "text-left",
                              d.key === "rank" && "px-1",
                              d.key === "rank" && isTop3 && "border-l-[3px]",
                              d.key === "rank" && isTop3 && rankAccent,
                              f.className,
                            )}
                            style={f.style}
                          >
                            {d.cell(r, ctx)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
              {fillViewport && hasFooter && fillerH > 0 && (
                <tr ref={fillerRef} aria-hidden>
                  <td colSpan={Math.max(1, defs.length)} className="bg-white p-0" style={{ height: `${fillerH}px` }} />
                </tr>
              )}
            </tbody>

            {/* ═══ TOTAL FOOTER — sticky bottom, mirrors the header band ═══ */}
            {hasFooter && (
              <tfoot>
                <tr>
                  {defs.map((d, i) => {
                    const f = frozenCellProps(d.key);
                    return (
                      <td
                        key={d.key}
                        className={cn(CELL, "border-t-2 border-t-white/30 text-white", i > 0 && FOOT_DIV, d.key === "name" && "text-left", d.key === "rank" && "px-1", f.className)}
                        style={{
                          ...f.style,
                          position: "sticky",
                          bottom: 0,
                          zIndex: f.className ? 9 : 6,
                          backgroundColor: BRAND_BLUE,
                        }}
                      >
                        {d.foot(totals)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
