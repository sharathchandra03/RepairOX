"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { useColumnOrder } from "@/hooks/use-column-order";
import { useFrozenColumns, type GridColumn } from "@/hooks/use-frozen-columns";
import { useScrollEdges } from "@/hooks/use-scroll-edges";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — shared DATA-GRID layout hook.

   Extracts, byte-for-byte in behaviour, the data-grid mechanics the Lead Table
   (app/(app)/leads/list/page.tsx) hand-rolls inline, so another dense table
   (Field → Pickup & Drop) gets the SAME experience from ONE implementation:

     • per-user column ORDER           (useColumnOrder, table_key = tableKey)
     • per-user independent FREEZE      (useFrozenColumns, { independent: true })
     • display order                    select | frozen-left | middle | frozen-right
     • sticky offsets from real widths  (frozenCellProps → --rox-frozen-offset)
     • scroll-edge shadows              (useScrollEdges)
     • viewport-measured table height   (gridMaxH — never a hard-coded px)

   The Lead Table and Agent Performance table are intentionally NOT migrated in
   this change (zero regression risk); they keep their inline copies and may
   adopt this hook later. Preferences are keyed by `tableKey`, so a Field table
   never reads or overwrites `lead_table` preferences.
   ────────────────────────────────────────────────────────────────────────── */

export interface UseGridLayoutOptions {
  /** Stable preference key, e.g. "field_table". */
  tableKey: string;
  userId: string | null | undefined;
  /** Canonical column definitions (single source of truth). */
  columns: GridColumn[];
  /** Key of the structural selection column pinned at offset 0 (optional). */
  selectKey?: string;
  /** Re-measure the viewport height when these change (collapse, hydration…). */
  remeasureOn?: ReadonlyArray<unknown>;
  /** Px reserved under the grid for the detached pagination footer. */
  footerReserve?: number;
}

export function useGridLayout({
  tableKey, userId, columns, selectKey = "select", remeasureOn = [], footerReserve = 50,
}: UseGridLayoutOptions) {
  const columnOrder = useColumnOrder(tableKey, userId, columns);
  const orderedColumns = columnOrder.orderedColumns;
  const frozen = useFrozenColumns(tableKey, userId, orderedColumns, { independent: true });

  const displayColumns = useMemo(() => {
    const leftSet = new Set(frozen.leftKeys);
    const rightSet = new Set(frozen.rightKeys);
    const byKey: Record<string, GridColumn> = {};
    for (const c of orderedColumns) byKey[c.key] = c;
    const keys = [
      ...orderedColumns.filter((c) => c.key === selectKey).map((c) => c.key),
      ...frozen.leftKeys,
      ...orderedColumns.map((c) => c.key).filter((k) => k !== selectKey && !leftSet.has(k) && !rightSet.has(k)),
      ...frozen.rightKeys,
    ];
    return keys.map((k) => byKey[k]).filter((c): c is GridColumn => !!c);
  }, [orderedColumns, frozen.leftKeys, frozen.rightKeys, selectKey]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollEdges(scrollRef as RefObject<HTMLElement | null>);

  /* Bounded dual-axis scroll container: height measured from the grid's live
     distance to the viewport top (tracks collapse/expand + resize + zoom). */
  const [gridMaxH, setGridMaxH] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      setGridMaxH(Math.max(240, window.innerHeight - top - footerReserve));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const settle = setTimeout(measure, 280); // just past the 0.22s collapse animation
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footerReserve, ...remeasureOn]);

  const selectColWidth = orderedColumns.find((g) => g.key === selectKey)?.width ?? 0;

  const frozenCellProps = useCallback(
    (key: string): { className: string; style?: CSSProperties } => {
      if (key === selectKey) {
        return { className: "rox-frozen rox-frozen-left", style: { ["--rox-frozen-offset" as string]: "0px" } as CSSProperties };
      }
      const leftIdx = frozen.leftKeys.indexOf(key);
      if (leftIdx >= 0) {
        let offset = selectColWidth;
        for (let i = 0; i < leftIdx; i++) {
          offset += orderedColumns.find((g) => g.key === frozen.leftKeys[i])?.width ?? 0;
        }
        const isLast = leftIdx === frozen.leftKeys.length - 1;
        return {
          className: cn("rox-frozen rox-frozen-left", isLast && "rox-frozen-left-edge"),
          style: { ["--rox-frozen-offset" as string]: `${offset}px` } as CSSProperties,
        };
      }
      const rightIdx = frozen.rightKeys.indexOf(key);
      if (rightIdx >= 0) {
        let offset = 0;
        for (let i = rightIdx + 1; i < frozen.rightKeys.length; i++) {
          offset += orderedColumns.find((g) => g.key === frozen.rightKeys[i])?.width ?? 0;
        }
        return {
          className: cn("rox-frozen rox-frozen-right", rightIdx === 0 && "rox-frozen-right-edge"),
          style: { ["--rox-frozen-offset" as string]: `${offset}px` } as CSSProperties,
        };
      }
      return { className: "" };
    },
    [frozen.leftKeys, frozen.rightKeys, orderedColumns, selectColWidth, selectKey],
  );

  /** Sum of rendered column widths — use for the table `min-width`, so adding a
   *  column never needs a hand-edited magic number. */
  const tableMinWidth = useMemo(() => displayColumns.reduce((n, c) => n + c.width, 0), [displayColumns]);

  return {
    columnOrder, orderedColumns, frozen, displayColumns,
    scrollRef, gridMaxH, frozenCellProps, tableMinWidth,
  };
}

/** Merge a column's frozen props (className + inline offset) with a cell's base classes. */
export function mergeFrozen(
  frozen: { className: string; style?: CSSProperties },
  base: string,
): { className: string; style?: CSSProperties } {
  return { className: cn(base, frozen.className), style: frozen.style };
}
