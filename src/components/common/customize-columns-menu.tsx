"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Data-Grid — CUSTOMIZE COLUMNS control (compact popover + drag)
   ────────────────────────────────────────────────────────────────────────
   The table-settings control that lets a user REARRANGE the columns of a dense
   RepairOX grid by dragging them. Consistent with the app's Dropdown language
   (NOT a large admin modal) and reuses @hello-pangea/dnd — the same drag engine
   as the dashboard KPI row.

     • The structural anchors (LEFT identity + RIGHT actions) render LOCKED
       (🔒, non-draggable) pinned at the top/bottom of the list — they can never
       move into the center (keeps the frozen data-grid valid).
     • Every movable column is a drag row (☰ handle) the user can reorder.
     • Reordering saves immediately (per-user) — no explicit Save button.
     • "Reset to default" restores the canonical column order.

   Purely presentational — it reads/writes a useColumnOrder() state. Reusable by
   any future table (Tickets, Invoices, Walk-In, Field, Customers, Reports).
   ────────────────────────────────────────────────────────────────────────── */

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import { GripVertical, Lock, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import type { GridColumn } from "@/hooks/use-frozen-columns";
import type { ColumnOrderState } from "@/hooks/use-column-order";

export function CustomizeColumnsMenu({
  columns,
  state,
  className,
}: {
  /** Columns in CANONICAL order (same array passed to useColumnOrder). */
  columns: GridColumn[];
  state: ColumnOrderState;
  className?: string;
}) {
  // The effective order drives the list. Split into locked-left anchors,
  // movable columns (draggable), and locked-right anchors.
  const ordered = state.orderedColumns;
  const lockedLeft = ordered.filter((c) => c.lockedLeft);
  const lockedRight = ordered.filter((c) => c.lockedRight);
  // Movable = everything that is neither a locked anchor nor a structural,
  // non-labelled column (e.g. the selection checkbox, or the conditional Store
  // column that only exists in All-Shops — not user-reorderable). A column is
  // treated as a hidden structural column when it has no label.
  const movable = ordered.filter(
    (c) => !c.lockedLeft && !c.lockedRight && c.label.trim() !== "" && c.reorderable !== false,
  );
  const movableKeys = movable.map((c) => c.key);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    const next = Array.from(movableKeys);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    // Preserve the position of any non-draggable movable columns (none today,
    // but keeps the contract safe): rebuild the full movable order from the
    // dragged subset, then let the hook reconcile/append the rest.
    state.setOrder(next);
  };

  return (
    <Dropdown
      className={className}
      align="right"
      width="w-72"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Customize columns"
          aria-expanded={open}
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition",
            open || state.isCustomized
              ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]"
              : "border-border bg-card text-zinc-600 hover:border-[#4361EE]/40",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Customize</span>
          {state.isCustomized && (
            <span className="grid h-1.5 w-1.5 place-items-center rounded-full bg-[#4361EE]" aria-hidden />
          )}
        </button>
      )}
    >
      {() => (
        <div className="max-h-[min(66vh,480px)] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Customize columns
            </p>
            <button
              type="button"
              onClick={state.reset}
              disabled={!state.isCustomized}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition",
                !state.isCustomized
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "text-[#4361EE] hover:bg-[#EEF1FD]",
              )}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
          <p className="px-2.5 pb-1.5 text-[11px] leading-snug text-muted-foreground/80">
            Drag to reorder. Your layout is saved to your account.
          </p>

          {/* Locked LEFT anchor(s) */}
          {lockedLeft.map((c) => (
            <LockedRow key={c.key} label={c.label} side="left" />
          ))}

          {/* Draggable movable columns */}
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="customize-columns">
              {(dp) => (
                <div ref={dp.innerRef} {...dp.droppableProps} className="py-0.5">
                  {movable.map((c, index) => (
                    <Draggable key={c.key} draggableId={c.key} index={index}>
                      {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-foreground transition-colors",
                            snapshot.isDragging
                              ? "bg-[#EEF1FD] shadow-[0_8px_24px_-8px_rgba(67,97,238,0.35)] ring-1 ring-[#4361EE]/30"
                              : "hover:bg-muted/60",
                          )}
                          style={provided.draggableProps.style}
                        >
                          <span
                            {...provided.dragHandleProps}
                            aria-label={`Drag ${c.label}`}
                            className="grid h-6 w-6 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground/60 hover:bg-card hover:text-[#4361EE] active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <span className="flex-1 truncate">{c.label}</span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dp.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Locked RIGHT anchor(s) */}
          {lockedRight.map((c) => (
            <LockedRow key={c.key} label={c.label} side="right" />
          ))}
        </div>
      )}
    </Dropdown>
  );
}

function LockedRow({ label, side }: { label: string; side: "left" | "right" }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted-foreground">
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        <Lock className="h-3.5 w-3.5 opacity-60" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
        {side === "left" ? "pinned left" : "pinned right"}
      </span>
    </div>
  );
}
