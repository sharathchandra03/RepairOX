"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Data-Grid — FREEZE COLUMNS control (compact popover)
   ────────────────────────────────────────────────────────────────────────
   The table-settings control that lets a user choose which columns are frozen
   in a dense RepairOX grid. Consistent with the app's Dropdown/MenuItem
   language — NOT a large modal.

     • The two mandatory anchors (LEFT identity + RIGHT actions) render LOCKED
       (🔒, disabled) and can never be unfrozen.
     • Every other visible, freezable column renders as a checkbox the user can
       tick to freeze it to the left.
     • "Reset to default" returns to only-anchors-frozen.

   Purely presentational — it reads/writes the useFrozenColumns state. Reusable
   by any future dense table (Tickets, Invoices, …).
   ────────────────────────────────────────────────────────────────────────── */

import { Check, Columns3, Lock, RotateCcw } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import type { GridColumn, FrozenColumnsState } from "@/hooks/use-frozen-columns";

export function FreezeColumnsMenu({
  columns,
  state,
  className,
}: {
  /** Columns in visual order (same array passed to useFrozenColumns). */
  columns: GridColumn[];
  state: FrozenColumnsState;
  className?: string;
}) {
  const lockedLeft = columns.filter((c) => c.lockedLeft);
  const lockedRight = columns.filter((c) => c.lockedRight);
  const optional = columns.filter(
    (c) => !c.lockedLeft && !c.lockedRight && c.freezable !== false,
  );
  const frozenCount = state.optionalLeft.length;

  return (
    <Dropdown
      className={className}
      align="right"
      width="w-64"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Freeze columns"
          aria-expanded={open}
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition",
            open || frozenCount > 0
              ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]"
              : "border-border bg-card text-zinc-600 hover:border-[#4361EE]/40",
          )}
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Freeze columns</span>
          {frozenCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-bold text-white">
              {frozenCount}
            </span>
          )}
        </button>
      )}
    >
      {() => (
        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Freeze columns
            </p>
            <button
              type="button"
              onClick={state.reset}
              disabled={frozenCount === 0}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition",
                frozenCount === 0
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "text-[#4361EE] hover:bg-[#EEF1FD]",
              )}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>

          {/* Locked (mandatory) anchors */}
          <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Always frozen
          </p>
          {lockedLeft.map((c) => (
            <LockedRow key={c.key} label={c.label} side="left" />
          ))}
          {lockedRight.map((c) => (
            <LockedRow key={c.key} label={c.label} side="right" />
          ))}

          {/* Selectable optional columns */}
          {optional.length > 0 && (
            <>
              <div className="my-1 h-px bg-border" />
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Freeze to left
              </p>
              {optional.map((c) => {
                const checked = state.optionalLeft.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => state.toggle(c.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[#EEF1FD]",
                      checked && "font-medium text-[#4361EE]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors",
                        checked
                          ? "border-[#4361EE] bg-[#4361EE] text-white"
                          : "border-border bg-card",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{c.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </Dropdown>
  );
}

function LockedRow({ label, side }: { label: string; side: "left" | "right" }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted-foreground">
      <Lock className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
        {side}
      </span>
    </div>
  );
}
