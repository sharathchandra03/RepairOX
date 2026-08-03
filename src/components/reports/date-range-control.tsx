"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Top-right date range control
   ──────────────────────────────────────────────────────────────────────────
   Presentation-only relocation of the date preset selector to the header
   (top-right), the way Looker Studio / Stripe Analytics anchor their range
   picker. Reuses the exact same DATE_PRESETS + ReportFilters contract as the
   original filter bar — no new date logic is introduced here.
   ────────────────────────────────────────────────────────────────────────── */

import { CalendarDays, ChevronDown, Check } from "lucide-react";
import { Dropdown, MenuLabel } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { DATE_PRESETS } from "@/lib/reports/date-ranges";
import type { ReportFilters, DatePresetId } from "@/lib/reports/types";

export function DateRangeControl({
  filters,
  rangeLabel,
  onChange,
}: {
  filters: ReportFilters;
  rangeLabel: string;
  onChange: (next: ReportFilters) => void;
}) {
  const current = DATE_PRESETS.find((p) => p.id === filters.preset);

  return (
    <Dropdown
      align="right"
      width="w-72"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-[13px] font-medium shadow-card transition-all",
            open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-border hover:border-[#4361EE]/40"
          )}
        >
          <CalendarDays className="h-4 w-4 text-[#4361EE]" />
          <span className="hidden sm:inline">{current?.label ?? "Select range"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-muted-foreground">{rangeLabel}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <div>
          <MenuLabel>Date Range</MenuLabel>
          <div className="space-y-0.5">
            {DATE_PRESETS.filter((p) => p.id !== "custom").map((p) => {
              const active = filters.preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { onChange({ ...filters, preset: p.id as DatePresetId }); close(); }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                    active ? "bg-[#EEF1FD] text-[#3347D6]" : "text-foreground hover:bg-muted"
                  )}
                >
                  {p.label}
                  {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-border pt-2">
            <button
              onClick={() => onChange({ ...filters, preset: "custom" })}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                filters.preset === "custom" ? "bg-[#EEF1FD] text-[#3347D6]" : "text-foreground hover:bg-muted"
              )}
            >
              Custom Range
              {filters.preset === "custom" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </button>
            {filters.preset === "custom" && (
              <div className="mt-2 flex items-center gap-1.5 px-1">
                <input
                  type="date"
                  value={filters.customFrom ?? ""}
                  onChange={(e) => onChange({ ...filters, customFrom: e.target.value })}
                  className="h-9 flex-1 rounded-lg border border-border bg-card px-2 text-[12px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
                />
                <span className="text-[11px] text-muted-foreground">to</span>
                <input
                  type="date"
                  value={filters.customTo ?? ""}
                  onChange={(e) => onChange({ ...filters, customTo: e.target.value })}
                  className="h-9 flex-1 rounded-lg border border-border bg-card px-2 text-[12px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
