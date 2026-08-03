"use client";

/* Shared report surface primitives: a titled Panel and a lightweight,
   sortable DataTable used across every report category. */

import { useState, type ReactNode } from "react";
import { ArrowUpDown, Download } from "lucide-react";
import { cn, formatINR, formatNumber } from "@/lib/utils";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-card shadow-[0_1px_3px_rgba(20,30,80,0.04),0_10px_28px_-14px_rgba(20,30,80,0.10)] transition-shadow duration-300 hover:shadow-[0_2px_6px_rgba(20,30,80,0.05),0_16px_36px_-14px_rgba(20,30,80,0.14)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h3 className="text-[13.5px] font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  /** currency renders with ₹, number with grouping. */
  format?: "currency" | "number" | "text";
}

export function DataTable({
  columns,
  rows,
  maxHeight = 420,
  onRowClick,
  emptyLabel = "No data for this selection.",
}: {
  columns: Column[];
  rows: (string | number)[][];
  maxHeight?: number;
  onRowClick?: (row: (string | number)[], index: number) => void;
  emptyLabel?: string;
}) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = (() => {
    if (sortCol == null) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  })();

  const toggleSort = (i: number) => {
    if (sortCol === i) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(i); setSortDir("desc"); }
  };

  const renderCell = (val: string | number, col: Column) => {
    if (typeof val === "number") {
      if (col.format === "currency") return formatINR(Math.round(val));
      if (col.format === "number" || col.numeric) return formatNumber(Math.round(val));
      return val;
    }
    return val || "—";
  };

  if (rows.length === 0) {
    return <p className="py-8 text-center text-[12px] text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                onClick={() => toggleSort(i)}
                className={cn(
                  "cursor-pointer select-none px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground",
                  c.numeric || c.format === "currency" || c.format === "number" ? "text-right" : "text-left"
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  <ArrowUpDown className={cn("h-3 w-3 opacity-40", sortCol === i && "opacity-100 text-[#4361EE]")} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row, r) => (
            <tr
              key={r}
              onClick={() => onRowClick?.(row, r)}
              className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-[#EEF1FD]/40")}
            >
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    "px-3 py-2 tabular-nums",
                    columns[c]?.numeric || columns[c]?.format === "currency" || columns[c]?.format === "number"
                      ? "text-right font-medium"
                      : "text-left"
                  )}
                >
                  {renderCell(cell, columns[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DownloadBtn({ onClick, label = "Export" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-muted"
    >
      <Download className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
