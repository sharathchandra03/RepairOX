"use client";
/* ──────────────────────────────────────────────────────────────────────────
   FieldGrid — the ONE table used by Field Insights and Field Activity.
   • Columns are declared once (FCol[]): key, label, width, how a cell renders, an optional total.
   • Per-user column REORDER and FREEZE on every table (the same engine as the Lead Table:
     useColumnOrder + useFrozenColumns + the Customize / Freeze menus, saved per user per table).
     The identity column (`anchor`) is always frozen left; an actions column (`actions`) right.
   • Spacious and easy on the eyes: 15px body text, wrapped headings (never cut off), 68px rows,
     soft grey on every other row, columns stretch to use the full width.
   • Frozen offsets come from the MEASURED header widths, so freezing stays exact while the
     columns stretch with the screen.
   ────────────────────────────────────────────────────────────────────────── */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Frame, EmptyRows } from "@/components/field/dashboard/dashboard-table";
import { CustomizeColumnsMenu } from "@/components/common/customize-columns-menu";
import { FreezeColumnsMenu } from "@/components/common/freeze-columns-menu";
import { useFrozenColumns, type GridColumn } from "@/hooks/use-frozen-columns";
import { useColumnOrder } from "@/hooks/use-column-order";
import { usePermissions } from "@/lib/permissions-context";
import { cn } from "@/lib/utils";

export interface FCol<R> {
  key: string;
  label: string;
  /** Minimum width in px. Extra room on wide screens is shared between all columns. */
  width: number;
  align?: "left" | "center" | "right";
  render: (r: R, i: number) => React.ReactNode;
  /** Content of this column in the pinned totals row. */
  foot?: React.ReactNode;
  cellClass?: (r: R) => string | false | null | undefined;
  /** Identity column — always frozen on the left (one per table). */
  anchor?: boolean;
  /** Actions column — always frozen on the right. */
  actions?: boolean;
  /** Header tooltip (defaults to the label). */
  title?: string;
}

export function useFieldGrid<R>(gridKey: string, cols: FCol<R>[]) {
  const { currentUser } = usePermissions();
  const sig = cols.map((c) => `${c.key}:${c.width}:${c.anchor ? 1 : 0}${c.actions ? 1 : 0}:${c.label}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gridCols = useMemo<GridColumn[]>(() => cols.map((c) => ({ key: c.key, label: c.label, width: c.width, lockedLeft: !!c.anchor, lockedRight: !!c.actions })), [sig]);
  const tableKey = `field_${gridKey}`;
  const order = useColumnOrder(tableKey, currentUser?.id, gridCols);
  const frozen = useFrozenColumns(tableKey, currentUser?.id, order.orderedColumns, { independent: true });
  const displayKeys = useMemo(() => {
    const l = new Set(frozen.leftKeys), r = new Set(frozen.rightKeys);
    return [...frozen.leftKeys, ...order.orderedColumns.map((c) => c.key).filter((k) => !l.has(k) && !r.has(k)), ...frozen.rightKeys];
  }, [order.orderedColumns, frozen.leftKeys, frozen.rightKeys]);
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const display = displayKeys.map((k) => byKey.get(k)).filter((c): c is FCol<R> => !!c);
  const menus = (
    <div className="flex items-center gap-2">
      <CustomizeColumnsMenu columns={order.orderedColumns} state={order} />
      <FreezeColumnsMenu columns={order.orderedColumns} state={frozen} independent />
    </div>
  );
  return { display, leftKeys: frozen.leftKeys, rightKeys: frozen.rightKeys, menus };
}
export type FieldGridState<R> = ReturnType<typeof useFieldGrid<R>>;

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

export function FieldGrid<R>({ grid, rows, rowKey, onRowClick, rowClass, empty, foot = false, lock = true, className }: {
  grid: FieldGridState<R>; rows: R[]; rowKey: (r: R, i: number) => string;
  onRowClick?: (r: R) => void; rowClass?: (r: R) => string | false | null | undefined;
  /** Text instead of rows (loading / nothing found). */
  empty?: string | null;
  /** Show the pinned totals row (uses each column's `foot`). */
  foot?: boolean;
  /** Fill the rest of a locked page and scroll inside. Off = bounded height on a scrolling page. */
  lock?: boolean;
  className?: string;
}) {
  const { display, leftKeys, rightKeys } = grid;
  const minWidth = display.reduce((t, c) => t + c.width, 0);
  const headRef = useRef<HTMLTableRowElement>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const sig = display.map((c) => c.key).join("|");
  useLayoutEffect(() => {
    const row = headRef.current;
    if (!row) return;
    const read = () => {
      const next: Record<string, number> = {};
      for (const th of Array.from(row.children) as HTMLElement[]) if (th.dataset.key) next[th.dataset.key] = th.getBoundingClientRect().width;
      setMeasured((prev) => (Object.keys(next).every((k) => Math.abs((prev[k] ?? -1) - next[k]) < 0.5) && Object.keys(prev).length === Object.keys(next).length ? prev : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(row);
    return () => ro.disconnect();
  }, [sig]);
  const w = (k: string) => measured[k] ?? display.find((c) => c.key === k)?.width ?? 0;
  const fp = (key: string): { className: string; style?: React.CSSProperties } => {
    const li = leftKeys.indexOf(key);
    if (li >= 0) {
      let off = 0; for (let i = 0; i < li; i++) off += w(leftKeys[i]);
      return { className: cn("rox-frozen rox-frozen-left", li === leftKeys.length - 1 && "rox-frozen-left-edge"), style: { ["--rox-frozen-offset" as string]: `${off}px` } as React.CSSProperties };
    }
    const ri = rightKeys.indexOf(key);
    if (ri >= 0) {
      let off = 0; for (let i = ri + 1; i < rightKeys.length; i++) off += w(rightKeys[i]);
      return { className: cn("rox-frozen rox-frozen-right", ri === 0 && "rox-frozen-right-edge"), style: { ["--rox-frozen-offset" as string]: `${off}px` } as React.CSSProperties };
    }
    return { className: "" };
  };
  const al = (c: FCol<R>) => ALIGN[c.align ?? (c.anchor ? "left" : "center")];
  return (
    <Frame lock={lock} className={cn(!lock && "max-h-[72vh]", className)}>
      <table className="rox-zebra w-full table-fixed text-[15px]" style={{ minWidth }}>
        <colgroup>{display.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
        <thead className="rox-table-head sticky top-0 z-[6] [&_.rox-frozen]:!bg-[#5368D4] [&_th]:!text-white"
          style={{ background: "#5368D4", color: "#fff", borderBottom: "2px solid rgba(255,255,255,0.35)" }}>
          <tr ref={headRef} className="text-[12.5px] font-bold uppercase tracking-wider">
            {display.map((c) => { const p = fp(c.key); return (
              <th key={c.key} data-key={c.key} title={c.title ?? c.label} className={cn("px-3.5 py-3.5 align-middle leading-tight", al(c), p.className)} style={p.style}>{c.label}</th>
            ); })}
          </tr>
        </thead>
        {!empty && (
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn("rox-table-row h-[68px] align-middle", onRowClick && "cursor-pointer", rowClass?.(r))}>
                {display.map((c) => { const p = fp(c.key); return (
                  <td key={c.key} className={cn("px-3.5 py-4 tabular-nums", al(c), c.cellClass?.(r), p.className)} style={p.style}>{c.render(r, i)}</td>
                ); })}
              </tr>
            ))}
          </tbody>
        )}
        {foot && !empty && rows.length > 0 && (
          <tfoot className="sticky bottom-0 z-[6] [&_td]:border-t-2 [&_td]:border-[#5368D4]/30 [&_td]:!bg-[#EEF1FD]">
            <tr className="align-middle text-[15px] font-bold">
              {display.map((c) => { const p = fp(c.key); return <td key={c.key} className={cn("px-3.5 py-3.5 tabular-nums", al(c), p.className)} style={p.style}>{c.foot ?? null}</td>; })}
            </tr>
          </tfoot>
        )}
      </table>
      {empty && <EmptyRows text={empty} />}
    </Frame>
  );
}

/* Small cell helpers so every table reads the same. */
export const Dash = () => <span className="text-zinc-300">—</span>;
export function NameText({ label, sub, href, onClick }: { label: string; sub?: React.ReactNode; href?: string; onClick?: () => void }) {
  const t = <span className="block truncate text-[15px] font-semibold text-foreground">{label}</span>;
  return (
    <div className="min-w-0" title={label}>
      {href ? <Link href={href} onClick={(e) => e.stopPropagation()} className="block truncate hover:[&>span]:text-[#4361EE]">{t}</Link>
        : onClick ? <button onClick={onClick} className="block w-full truncate text-left hover:[&>span]:text-[#4361EE]">{t}</button> : t}
      {sub != null && <span className="block truncate text-[12.5px] text-muted-foreground">{sub}</span>}
    </div>
  );
}
export const FootLabel = ({ label = "Total", sub }: { label?: string; sub?: string }) => (
  <div><span className="block text-[14px] font-extrabold uppercase tracking-wide">{label}</span>{sub && <span className="block text-[12px] font-medium text-muted-foreground">{sub}</span>}</div>
);
/** A small second line under a number. */
export const Sub = ({ children, className }: { children: React.ReactNode; className?: string }) => <span className={cn("mt-0.5 block text-[12px] font-medium text-muted-foreground", className)}>{children}</span>;
