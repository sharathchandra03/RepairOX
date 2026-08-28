"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Build a compact list of page tokens with ellipses, e.g.
 *   1 2 3 4 5 … 12   or   1 … 5 6 7 … 12
 * Always shows the first and last page plus a window around the current page.
 */
function buildPageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("…");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  itemLabel = "record",
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional — enables the "Showing X–Y of Z" summary on the left. */
  totalItems?: number;
  pageSize?: number;
  itemLabel?: string;
  className?: string;
}) {
  if (totalPages <= 1) {
    // Still show the summary when there's a single page of results.
    if (totalItems == null) return null;
    return (
      <div className={cn("flex items-center justify-between px-1 py-1 text-xs text-muted-foreground", className)}>
        <span>
          Showing {totalItems} {itemLabel}
          {totalItems !== 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  const items = buildPageItems(page, totalPages);
  const from = totalItems != null && pageSize != null ? (page - 1) * pageSize + 1 : null;
  const to = totalItems != null && pageSize != null ? Math.min(page * pageSize, totalItems) : null;

  const btnBase =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-xs font-semibold transition select-none";

  return (
    <div className={cn("flex flex-col gap-3 px-1 py-1 sm:flex-row sm:items-center sm:justify-between", className)}>
      {totalItems != null && from != null && (
        <span className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
          <span className="font-medium text-foreground">{totalItems}</span> {itemLabel}
          {totalItems !== 1 ? "s" : ""}
        </span>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            btnBase,
            "gap-1 text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] disabled:pointer-events-none disabled:opacity-40"
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>

        {items.map((it, idx) =>
          it === "…" ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground select-none">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onPageChange(it)}
              aria-current={it === page ? "page" : undefined}
              className={cn(
                btnBase,
                it === page
                  ? "bg-[#4361EE] text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.4)]"
                  : "text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
              )}
            >
              {it}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            btnBase,
            "gap-1 text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] disabled:pointer-events-none disabled:opacity-40"
          )}
          aria-label="Next page"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
