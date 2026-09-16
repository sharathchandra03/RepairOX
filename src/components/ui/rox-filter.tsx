"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Design System v2 — SHARED FILTER FOUNDATION
   ────────────────────────────────────────────────────────────────────────
   The canonical RepairOX filter language. Two rules this foundation enforces
   by default (see docs/REPAIROX-DESIGN-SYSTEM.md §Filter Standard):

     1. Every FILTER PANEL must have a visible close (×) affordance.
        → RoxFilterPanelHeader always renders the × close button.

     2. Every APPLIED filter must be individually removable via a persistent
        (×) on its chip — not only a global "Clear all".
        → ActiveFilterChip always shows the × when the filter is active.
        → ActiveFiltersBar maps applied filters to chips + a trailing Clear all.

   These compose with any existing filter inputs (Select, dropdowns, pills).
   Use them so no module ships a filter without a close option.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Applied-filter descriptor ───────────────────────────────────────────
   One currently-APPLIED filter to show as a removable chip. `onClear` resets
   just this filter to its neutral/empty value. */
export type AppliedFilter = {
  /** Stable key. */
  id: string;
  /** Short field name, e.g. "Status". Optional — shown as "Label: value". */
  label?: string;
  /** Human-readable current value, e.g. "In Progress". */
  value: string;
  /** Clear just this filter. */
  onClear: () => void;
};

/* ─── ActiveFilterChip ─────────────────────────────────────────────────────
   A single applied-filter chip with an ALWAYS-VISIBLE × to remove it. This is
   the canonical removable-filter affordance — never hide the × behind hover. */
export function ActiveFilterChip({
  label,
  value,
  onClear,
  className,
}: {
  label?: string;
  value: string;
  onClear: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[#4361EE]/30 bg-[#EEF1FD] py-1 pl-3 pr-1 text-[12px] font-medium text-[#4361EE] shadow-sm",
        className,
      )}
    >
      <span className="max-w-[160px] truncate">
        {label ? <span className="font-semibold">{label}: </span> : null}
        {value}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={label ? `Remove ${label} filter` : `Remove filter ${value}`}
        title="Remove filter"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#4361EE] transition-colors hover:bg-[#4361EE] hover:text-white"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </span>
  );
}

/* ─── ActiveFiltersBar ─────────────────────────────────────────────────────
   Renders every APPLIED filter as a removable chip, with a trailing global
   "Clear all". Renders nothing when there are no applied filters. Drop this
   above (or inside) any list/table filter area so applied filters are always
   individually removable. */
export function ActiveFiltersBar({
  filters,
  onClearAll,
  className,
  label = "Filters",
}: {
  filters: AppliedFilter[];
  /** Optional global clear-all. Shown only when 2+ filters are applied. */
  onClearAll?: () => void;
  className?: string;
  /** Leading caption, e.g. "Filters". Pass "" to hide. */
  label?: string;
}) {
  if (filters.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {label ? (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      ) : null}
      {filters.map((f) => (
        <ActiveFilterChip
          key={f.id}
          label={f.label}
          value={f.value}
          onClear={f.onClear}
        />
      ))}
      {onClearAll && filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-[#4361EE] transition hover:underline"
        >
          <X className="h-3 w-3" /> Clear all
        </button>
      )}
    </div>
  );
}

/* ─── RoxFilterPanelHeader ─────────────────────────────────────────────────
   Canonical header for a filter panel/drawer. ALWAYS renders a close (×) so no
   filter panel ships without a way to close it. Optionally renders a Reset
   action to the left of the ×. */
export function RoxFilterPanelHeader({
  title = "Filters",
  onClose,
  onReset,
  resetLabel = "Reset",
  showReset,
  className,
}: {
  title?: React.ReactNode;
  /** Close the panel (× is mandatory). */
  onClose: () => void;
  /** Optional reset-all handler. */
  onReset?: () => void;
  resetLabel?: React.ReactNode;
  /** Show the reset button (e.g. only when filters are active). */
  showReset?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="flex items-center gap-3">
        {onReset && showReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-[13px] font-semibold text-[#4361EE] transition hover:underline"
          >
            {resetLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          title="Close filters"
          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
