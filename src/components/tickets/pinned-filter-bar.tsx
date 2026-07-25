"use client";

import { useRef, useState, useEffect } from "react";
import { Pin, PinOff, X, ChevronDown } from "lucide-react";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ─── Filter Definition ──────────────────────────────────────────────── */

export type PinnableFilterDef = {
  id: string;
  label: string;
  type: "select" | "date-range";
  /** Current value (controlled) */
  value: string;
  /** Options for select-type filters */
  options?: { label: string; value: string }[];
  /** Change handler */
  onChange: (value: string) => void;
};

/* ─── Props ──────────────────────────────────────────────────────────── */

interface PinnedFilterBarProps {
  filters: PinnableFilterDef[];
  pinnedIds: string[];
  onUnpin: (id: string) => void;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function PinnedFilterBar({ filters, pinnedIds, onUnpin }: PinnedFilterBarProps) {
  const pinnedFilters = filters.filter((f) => pinnedIds.includes(f.id));

  if (pinnedFilters.length === 0) return null;

  return (
    <div className="relative">
      {/* Horizontal scroll container — scrollable on mobile, wraps on desktop */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none md:flex-wrap md:overflow-visible">
        {pinnedFilters.map((filter) => (
          <PinnedFilterChip
            key={filter.id}
            filter={filter}
            onUnpin={() => onUnpin(filter.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Individual Pinned Filter Chip ──────────────────────────────────── */

function PinnedFilterChip({
  filter,
  onUnpin,
}: {
  filter: PinnableFilterDef;
  onUnpin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedOption = filter.options?.find((o) => o.value === filter.value);
  const displayLabel = selectedOption && selectedOption.value !== "all" && selectedOption.value !== ""
    ? selectedOption.label
    : filter.label;
  const hasActiveValue = filter.value !== "all" && filter.value !== "";

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Chip trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
          hasActiveValue
            ? "border-[#4361EE]/30 bg-[#EEF1FD] text-[#4361EE] shadow-sm"
            : "border-border bg-card text-muted-foreground hover:border-[#4361EE]/30 hover:text-foreground",
          open && "border-[#4361EE] ring-2 ring-[#4361EE]/10"
        )}
      >
        <span className="max-w-[120px] truncate">{displayLabel}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
        {/* Unpin button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUnpin(); }}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-100 hover:text-rose-600"
          title="Unpin filter"
          aria-label={`Unpin ${filter.label} filter`}
        >
          <PinOff className="h-2.5 w-2.5" />
        </button>
      </button>

      {/* Dropdown */}
      {open && filter.type === "select" && filter.options && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] max-h-60 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
          {filter.options.map((opt) => {
            const isSelected = opt.value === filter.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { filter.onChange(opt.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  isSelected ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60"
                )}
              >
                <span className={cn("text-[#4361EE]", isSelected ? "opacity-100" : "opacity-0")}>✓</span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
