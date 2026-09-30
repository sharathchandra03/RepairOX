"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Manage Columns (personal Kanban).

   Rename / add / reorder / recolor / delete columns of the ACTIVE personal
   board. Deleting a column NEVER deletes leads — the user chooses a fallback
   column its cards move to (default: the first remaining column). All changes
   are personal to the signed-in user.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Columns3 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { KanbanColorPicker } from "./kanban-color-picker";
import { kanbanColor, type KanbanBoard, type KanbanColor, type KanbanColumn } from "@/lib/lead-kanban";
import type { UseLeadKanban } from "@/hooks/use-lead-kanban";

export function ManageColumnsDrawer({
  open,
  onClose,
  board,
  kanban,
  cardCount,
}: {
  open: boolean;
  onClose: () => void;
  board: KanbanBoard;
  kanban: UseLeadKanban;
  /** leadId count per column (for the "N cards" hint + delete safety). */
  cardCount: (columnId: string) => number;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<KanbanColor>("blue");
  const [deleting, setDeleting] = useState<KanbanColumn | null>(null);

  const move = (idx: number, dir: -1 | 1) => {
    const ids = board.columns.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    kanban.reorderColumns(ids);
  };

  const addColumn = () => {
    if (!newName.trim()) return;
    kanban.addColumn(newName, newColor);
    setNewName("");
    setNewColor("blue");
  };

  const confirmDelete = () => {
    if (deleting) {
      // Cards reflow to the first OTHER column (never lost).
      const fallback = board.columns.find((c) => c.id !== deleting.id)?.id ?? null;
      kanban.removeColumn(deleting.id, fallback);
    }
    setDeleting(null);
  };

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Manage Columns" subtitle={board.name} icon={Columns3} width="max-w-md">
        <div className="space-y-4 p-5">
          {/* Existing columns */}
          <div className="space-y-2.5">
            {board.columns.map((col, idx) => {
              const tone = kanbanColor(col.color);
              const count = cardCount(col.id);
              return (
                <div key={col.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} />
                    <Input
                      value={col.name}
                      onChange={(e: any) => kanban.renameColumn(col.id, e.target.value)}
                      className="h-8 flex-1 text-[13px]"
                    />
                    <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                      {count}
                    </span>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        title="Move up"
                        disabled={idx === 0}
                        onClick={() => move(idx, -1)}
                        className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        disabled={idx === board.columns.length - 1}
                        onClick={() => move(idx, 1)}
                        className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title={board.columns.length <= 1 ? "A board needs at least one column" : "Delete column"}
                        disabled={board.columns.length <= 1}
                        onClick={() => (count > 0 ? setDeleting(col) : kanban.removeColumn(col.id))}
                        className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2.5 pl-4.5">
                    <KanbanColorPicker value={col.color} onChange={(c) => kanban.setColumnColor(col.id, c)} size={18} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add column */}
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add Column</p>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e: any) => setNewName(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === "Enter") addColumn(); }}
                placeholder="Column name…"
                className="h-8 flex-1 text-[13px]"
              />
              <Button size="sm" className="gap-1.5 rounded-lg" onClick={addColumn} disabled={!newName.trim()}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="mt-2.5">
              <KanbanColorPicker value={newColor} onChange={setNewColor} size={18} />
            </div>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete column?"
        description={
          deleting
            ? `"${deleting.name}" has ${cardCount(deleting.id)} card(s). Deleting it moves those cards to another column — no leads are deleted.`
            : ""
        }
        confirmLabel="Delete column"
      />
    </>
  );
}
