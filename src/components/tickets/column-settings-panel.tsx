"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Reusable Ticket Column Settings panel.

   Extracted verbatim from the former inline panel on the Tickets page so the
   exact same UI, drag/reorder, search, required-column rules, Reset Default,
   Cancel and Apply behaviour are preserved. It now lives in Settings → Tickets
   → Ticket Settings → Column Settings and writes to the shared, persisted
   store-settings source of truth.

   The component keeps LOCAL working copies of order/visibility so changes are
   only committed to the parent (and therefore persisted) on Apply. Cancel
   discards the working copy.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ALL_COLUMNS,
  DEFAULT_ORDER,
  DEFAULT_VISIBLE,
  REQUIRED_COLUMNS,
  type ColumnId,
} from "@/lib/ticket-columns";

export function ColumnSettingsPanel({
  columnOrder,
  visibleColumns,
  onApply,
  onCancel,
  onReset,
  /** When true, renders without the outer card chrome (border/shadow) so it can
   *  sit cleanly inside a SettingsSection card. Defaults to false. */
  bare = false,
}: {
  columnOrder: ColumnId[];
  visibleColumns: Set<ColumnId>;
  onApply: (order: ColumnId[], visible: Set<ColumnId>) => void;
  onCancel: () => void;
  onReset: () => void;
  bare?: boolean;
}) {
  const [localOrder, setLocalOrder] = useState<ColumnId[]>(columnOrder);
  const [localVisible, setLocalVisible] = useState<Set<ColumnId>>(new Set(visibleColumns));
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<ColumnId | null>(null);

  const editableColumns = ALL_COLUMNS.filter((c) => !c.locked);
  const requiredIds = new Set<ColumnId>(REQUIRED_COLUMNS);

  const visibleList = localOrder.filter((id) => localVisible.has(id) && !ALL_COLUMNS.find((c) => c.id === id)?.locked);
  const hiddenList = editableColumns.filter((c) => !localVisible.has(c.id));

  const filteredVisible = search
    ? visibleList.filter((id) => ALL_COLUMNS.find((c) => c.id === id)?.label.toLowerCase().includes(search.toLowerCase()))
    : visibleList;

  const filteredHidden = search
    ? hiddenList.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
    : hiddenList;

  const toggleVisibility = (id: ColumnId) => {
    if (requiredIds.has(id)) return;
    setLocalVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Drag & drop within visible list
  const handleDragStart = (id: ColumnId) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, targetId: ColumnId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setLocalOrder((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  };
  const handleDragEnd = () => setDragId(null);

  const handleReset = () => {
    setLocalOrder(DEFAULT_ORDER);
    setLocalVisible(new Set(DEFAULT_VISIBLE));
    onReset();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "overflow-hidden",
        bare ? "" : "rounded-2xl border border-border bg-card shadow-card"
      )}
    >
      {/* Header */}
      <div className={cn("pb-3", bare ? "pt-0" : "px-5 pt-5")}>
        {!bare && (
          <>
            <h3 className="font-display text-sm font-bold tracking-tight">Column Settings</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Customize which columns are visible in the ticket table.</p>
          </>
        )}
        <div className={bare ? "" : "mt-3"}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns…"
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none transition"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={cn("pb-4 grid grid-cols-1 gap-4 md:grid-cols-2", bare ? "" : "px-5")}>
        {/* Visible Columns */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Visible Columns <span className="text-foreground ml-1">{filteredVisible.length}</span>
          </p>
          <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
            {filteredVisible.map((id) => {
              const col = ALL_COLUMNS.find((c) => c.id === id)!;
              const isRequired = requiredIds.has(id);
              const isDragging = dragId === id;
              return (
                <div
                  key={id}
                  draggable={!isRequired}
                  onDragStart={() => handleDragStart(id)}
                  onDragOver={(e) => handleDragOver(e, id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all group",
                    isDragging ? "bg-indigo-50 ring-1 ring-indigo-200 shadow-sm scale-[1.02]" : "hover:bg-muted/60"
                  )}
                >
                  <input
                    type="checkbox"
                    checked
                    disabled={isRequired}
                    onChange={() => toggleVisibility(id)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="flex-1 text-xs font-medium text-foreground">{col.label}</span>
                  {isRequired && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200">Required</span>
                  )}
                  {!isRequired && (
                    <span className="cursor-grab active:cursor-grabbing text-muted-foreground/50 group-hover:text-muted-foreground transition">
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              );
            })}
            {filteredVisible.length === 0 && (
              <p className="py-3 text-center text-[11px] text-muted-foreground">No matching columns</p>
            )}
          </div>
        </div>

        {/* Hidden Columns */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Hidden Columns <span className="text-foreground ml-1">{filteredHidden.length}</span>
          </p>
          <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
            {filteredHidden.map((col) => (
              <div key={col.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-muted/60 transition">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggleVisibility(col.id)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
                />
                <span className="flex-1 text-xs font-medium text-muted-foreground">{col.label}</span>
              </div>
            ))}
            {filteredHidden.length === 0 && (
              <p className="py-3 text-center text-[11px] text-muted-foreground">
                {search ? "No matching columns" : "All columns are visible"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={cn("flex items-center justify-between border-t border-border py-3", bare ? "mt-1" : "px-5")}>
        <button onClick={handleReset} className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition">
          Reset Default
        </button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onApply(localOrder, localVisible)}>Apply</Button>
        </div>
      </div>
    </motion.div>
  );
}
