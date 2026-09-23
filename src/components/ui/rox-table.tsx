"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Design System v2 — SHARED TABLE FOUNDATION
   ────────────────────────────────────────────────────────────────────────
   The canonical RepairOX data-table language, extracted from the finalized
   Shop → Walk-In → Walk-In table (with Tickets as the secondary reference).
   This is the DEFAULT foundation every NEW table should build on. It captures
   ONLY the visual + interaction language — never business columns:

     • square card with a sharp, visible 2px frame              (.rox-table-card)
     • [overflow-x:clip] wrapper so a sticky <thead> never breaks
     • table-fixed + <colgroup> so columns shrink proportionally on zoom /
       small viewports instead of overflowing (responsive strategy)
     • runtime-measured sticky header that pins flush below the app topbar +
       any sticky filter block (useRoxStickyHeader)
     • light-indigo header fill + brand underline + uppercase brand labels
     • clearly-visible row separators (never faint hairlines)
     • uniform, comfortable row height + py-4 cells
     • shared <Pagination> in a sticky-friendly footer

   Tokens live in globals.css (--rox-table-*). See docs/REPAIROX-DESIGN-SYSTEM.md.
   Do NOT invent a new table visual style — compose these primitives and add
   your own <colgroup>, headers and cells.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* ─── Sticky-header offset hook ───────────────────────────────────────────
   Measures the app topbar height + the sticky filter wrapper height at runtime
   so the <thead> pins flush with NO seam and NO layout jump, whatever the
   banner / filter state. Pure CSS position:sticky underneath — no scroll
   listeners, so scrolling stays smooth. Identical behaviour to Walk-In,
   Tickets and Invoice.

   Usage:
     const { wrapRef, theadTop } = useRoxStickyHeader();
     <div ref={wrapRef}>… sticky filters …</div>
     <RoxTableHead top={theadTop}> … </RoxTableHead>                       */
export function useRoxStickyHeader(topbarFallback = 60) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stickyTop, setStickyTop] = useState(topbarFallback);
  const [wrapH, setWrapH] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Topbar = first child of the nearest scroll container (see AppShell).
    let node: HTMLElement | null = wrap;
    let bar: HTMLElement | null = null;
    while (node && node.parentElement) {
      const parent: HTMLElement = node.parentElement;
      const oy = getComputedStyle(parent).overflowY;
      if (oy === "auto" || oy === "scroll") {
        bar = parent.firstElementChild as HTMLElement | null;
        break;
      }
      node = parent;
    }
    const measure = () => {
      setWrapH(wrap.offsetHeight);
      if (bar) setStickyTop(bar.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (bar) ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // The thead pins flush at the wrapper's bottom edge so no row bleeds through.
  return { wrapRef, theadTop: stickyTop + wrapH };
}

/* ─── Card + clip wrapper + table element ─────────────────────────────────
   RoxTableCard renders the sharp bordered card, the [overflow-x:clip] wrapper
   and the `w-full table-fixed` <table>. Pass your <colgroup>, <RoxTableHead>
   and <RoxTableBody> as children. `text` controls the base font size
   (Walk-In uses text-[14px], Tickets text-sm).                             */
export function RoxTableCard({
  children,
  className,
  text = "text-[14px]",
}: {
  children: React.ReactNode;
  className?: string;
  /** Base font size utility for the table. */
  text?: string;
}) {
  return (
    // Sharp (square) card with the canonical 2px visible frame. No
    // overflow-hidden here — that would capture the sticky <thead>.
    <div className={cn("rox-table-card shadow-card", className)}>
      {/* [overflow-x:clip] (NOT auto/scroll): an auto/scroll ancestor would
          become the scroll container for the sticky <thead> and break the
          freeze. table-fixed already guarantees the table fits the container,
          so clipping never hides the rightmost (Action) column. */}
      <div className="[overflow-x:clip]">
        <table className={cn("w-full table-fixed", text)}>{children}</table>
      </div>
    </div>
  );
}

/* ─── Sticky header ───────────────────────────────────────────────────────
   Canonical light-indigo fill + brand underline. Pass the measured `top` from
   useRoxStickyHeader. Children should be a single <tr> of <th> cells.        */
export function RoxTableHead({
  children,
  top,
  className,
}: {
  children: React.ReactNode;
  /** Measured sticky offset from useRoxStickyHeader (theadTop). */
  top?: number;
  className?: string;
}) {
  return (
    <thead
      style={top != null ? { top } : undefined}
      className={cn("rox-table-head sticky z-[5]", className)}
    >
      {children}
    </thead>
  );
}

/* Canonical header row — uppercase, bold, brand-tinted, tracking-wider.
   Wrap your <th> cells in this so every table's headers read identically. */
export function RoxHeadRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        "text-left text-[12px] font-bold uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/* ─── Body row ────────────────────────────────────────────────────────────
   Uniform row height + the canonical visible top separator + brand hover /
   selection tints. `selected` and `tint` layer over the default hover.      */
export function RoxTableRow({
  children,
  className,
  selected,
  tint,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  /** Selected → indigo tint. */
  selected?: boolean;
  /** Optional custom row tint (e.g. pinned / overdue) that wins over hover. */
  tint?: string;
  onClick?: React.MouseEventHandler<HTMLTableRowElement>;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "rox-table-row group align-middle transition",
        // Default row height comes from the --rox-table-row-h density token
        // (68px comfortable → compacted on ~13" laptops via the compact-desktop
        // @media block in globals.css). Override via className only if a module
        // genuinely needs a different height (e.g. Tickets uses h-[76px]).
        "rox-table-row-h",
        selected
          ? "bg-indigo-50/40"
          : tint
            ? tint
            : "hover:bg-muted/40",
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

/* Canonical cell padding + vertical centering. Padding is density-aware
   (rox-table-cell) so cells tighten on ~13" laptops via the compact-desktop
   @media block; comfortable = px-3 py-4. */
export function RoxTableCell({
  children,
  className,
  ...rest
}: {
  children?: React.ReactNode;
  className?: string;
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("rox-table-cell align-middle", className)} {...rest}>
      {children}
    </td>
  );
}

/* Footer strip (pagination) — visible top divider matching the row separators. */
export function RoxTableFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("px-5 py-4", className)}
      style={{ borderTop: "1px solid hsl(var(--rox-table-divider))" }}
    >
      {children}
    </div>
  );
}
