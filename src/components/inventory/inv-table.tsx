"use client";

/* ──────────────────────────────────────────────────────────────────────────
   InvTable — the Inventory list table. Built on the shared rox-table primitives
   and the Locked Table Page standard: the table body scrolls inside its frame,
   the header is frozen, and the detached <Pagination> hugs the table.

   COLUMN SIZING = FIT TO CONTENT. The table uses the browser's automatic layout:
   every column is as wide as its widest value OR its heading (headings never wrap
   or clip), so no space is wasted on narrow columns and nothing overlaps.
     • default column  → shrink-wraps its content (nowrap).
     • `max`           → caps a text column (e.g. Category) and ellipsises overflow.
     • `min`           → floor for pill columns so a pill never looks cramped.
     • `grow`          → the ONE flexible column (usually the item name). It takes
                         all the leftover width and truncates with a tooltip.

   Place it as the LAST child of a page root that carries `rox-lock-root`.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { RoxTableHead, RoxHeadRow, RoxTableRow, RoxTableCell } from "@/components/ui/rox-table";
import { useRoxStickyHeader } from "@/components/ui/rox-table";
import { Pagination } from "@/components/ui/pagination";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type InvColumn<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  /** Take the leftover width (one per table). */
  grow?: boolean;
  /** Minimum width in px (grow column defaults to 220). */
  min?: number;
  /** Maximum width in px for a compact text column; overflow is ellipsised. */
  max?: number;
  hidden?: boolean;
  /** Share of the table width in `flow` mode (relative; normalised across visible columns). */
  pct?: number;
  /** Ignored. Kept so older call sites compile; sizing is automatic now. */
  width?: number | string;
};

export function InvTable<T>({
  columns, rows, rowKey, onRowClick, itemLabel = "item", emptyTitle = "Nothing to show", emptyHint, rowTint, resetKey,
  selectable = false, selected, onSelectedChange, selectLabel = "Select all", flow = false,
}: {
  columns: InvColumn<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  itemLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
  rowTint?: (r: T) => string | undefined;
  /** Change this (e.g. the filter signature) to jump back to page 1. */
  resetKey?: string;
  /** Row selection with a header select-all (acts on ALL filtered rows). */
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  selectLabel?: string;
  /** Tickets-style layout: the PAGE scrolls (no closed box), the header sticks under the topbar,
   *  columns share the full width by their `pct`, and the pagination footer follows the last row. */
  flow?: boolean;
}) {
  const cols = useMemo(() => columns.filter((c) => !c.hidden), [columns]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => setPage(1), [resetKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => rows.slice((safePage - 1) * pageSize, safePage * pageSize), [rows, safePage, pageSize]);
  const { theadTop } = useRoxStickyHeader();
  const pctSum = cols.reduce((n, c) => n + (c.pct ?? 0), 0);
  const align = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  const sel = selected ?? new Set<string>();
  const allIds = useMemo(() => rows.map(rowKey), [rows, rowKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const inView = allIds.filter((id) => sel.has(id)).length;
  const allSelected = allIds.length > 0 && inView === allIds.length;
  const toggleAll = () => {
    const n = new Set(sel);
    if (allSelected) allIds.forEach((id) => n.delete(id)); else allIds.forEach((id) => n.add(id));
    onSelectedChange?.(n);
  };
  const toggleOne = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); onSelectedChange?.(n); };

  const sizeStyle = (c: InvColumn<T>): CSSProperties => ({
    ...(c.grow ? { width: "100%", minWidth: c.min ?? 220, maxWidth: 0 } : { width: "1%", ...(c.min ? { minWidth: c.min } : {}) }),
  });

  return (
    <>
      <div className={cn("border-zinc-300 bg-card shadow-card border-2", flow ? "" : "rox-lock-grow flex flex-col")}>
        <div className={flow ? "[overflow-x:clip]" : "rox-grid-scroll min-h-0 flex-1 overflow-auto"}>
          <table className={cn("w-full text-[14px]", flow && "table-fixed")}>
            {flow && (
              <colgroup>
                {selectable && <col style={{ width: 44 }} />}
                {cols.map((c) => <col key={c.key} style={{ width: `${((c.pct ?? 100 / cols.length) / (pctSum || 100)) * 100}%` }} />)}
              </colgroup>
            )}
            <RoxTableHead top={flow ? theadTop : 0}>
              <RoxHeadRow>
                {selectable && (
                  <th className="w-[1%] whitespace-nowrap py-4 pl-4 pr-1">
                    <Checkbox checked={allSelected} indeterminate={inView > 0 && !allSelected} onChange={toggleAll} aria-label={selectLabel} />
                  </th>
                )}
                {cols.map((c) => (
                  <th key={c.key} style={flow ? undefined : sizeStyle(c)} className={cn("rox-table-cell whitespace-nowrap py-4 font-bold", align(c.align))}>{c.header}</th>
                ))}
              </RoxHeadRow>
            </RoxTableHead>
            <tbody>
              {paged.map((r) => {
                const id = rowKey(r);
                return (
                  <RoxTableRow
                    key={id}
                    selected={sel.has(id)}
                    tint={rowTint?.(r)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn("border-t border-zinc-500", onRowClick && "cursor-pointer")}
                  >
                    {selectable && (
                      <td className="py-3 pl-4 pr-1 align-middle" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={sel.has(id)} onChange={() => toggleOne(id)} aria-label="Select row" />
                      </td>
                    )}
                    {cols.map((c) => (
                      <RoxTableCell key={c.key} style={!flow && c.grow ? { maxWidth: 0, minWidth: c.min ?? 220 } : undefined} className={cn(align(c.align), flow ? "overflow-hidden" : c.grow ? "overflow-hidden" : "whitespace-nowrap")}>
                        {c.max ? <div className="truncate" style={{ maxWidth: c.max }}>{c.render(r)}</div> : c.render(r)}
                      </RoxTableCell>
                    ))}
                  </RoxTableRow>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={cols.length + (selectable ? 1 : 0)} className="px-4 py-16 text-center">
                    <p className="font-display text-base font-bold">{emptyTitle}</p>
                    {emptyHint && <p className="mt-1 text-[13px] text-muted-foreground">{emptyHint}</p>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination
        className={flow ? undefined : "rox-lock-footer"}
        page={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={rows.length}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        itemLabel={itemLabel}
      />
    </>
  );
}
