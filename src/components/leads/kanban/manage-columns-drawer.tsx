"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Manage Columns (personal Kanban).

   Rename / add / REORDER (drag & drop) / recolor / delete columns of the
   ACTIVE personal board. Deleting a column NEVER deletes leads — its cards
   reflow to the first remaining column. All changes are personal to the
   signed-in user and persist (localStorage + DB via useLeadKanban).

   • Reorder is drag-and-drop (@dnd-kit) via a dedicated grip handle — no arrows.
   • Each name field keeps its own LOCAL draft so the user can freely backspace
     to empty and type spaces; the value commits on blur/Enter (an empty name
     falls back to a safe default, never a silent reject mid-edit).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  sortableKeyboardCoordinates, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, GripVertical, Columns3 } from "lucide-react";
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleReorder = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = board.columns.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    kanban.reorderColumns(arrayMove(ids, from, to));
  };

  const addColumn = () => {
    const name = newName.trim();
    if (!name) return;
    kanban.addColumn(name, newColor);
    setNewName("");
    setNewColor("blue");
  };

  const confirmDelete = () => {
    if (deleting) {
      const fallback = board.columns.find((c) => c.id !== deleting.id)?.id ?? null;
      kanban.removeColumn(deleting.id, fallback);
    }
    setDeleting(null);
  };

  const columnIds = board.columns.map((c) => c.id);

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Manage Columns" subtitle={board.name} icon={Columns3} width="max-w-md">
        <div className="space-y-5 p-5">
          {/* Hint */}
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <GripVertical className="h-3.5 w-3.5 text-zinc-400" />
            Drag the handle to reorder columns. Changes save automatically.
          </p>

          {/* Existing columns — drag to reorder */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
            <SortableContext items={columnIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {board.columns.map((col) => (
                  <SortableColumnRow
                    key={col.id}
                    col={col}
                    count={cardCount(col.id)}
                    canDelete={board.columns.length > 1}
                    onRename={(name) => kanban.renameColumn(col.id, name)}
                    onColor={(c) => kanban.setColumnColor(col.id, c)}
                    onDelete={() => (cardCount(col.id) > 0 ? setDeleting(col) : kanban.removeColumn(col.id))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add column */}
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3.5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add Column</p>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e: any) => setNewName(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === "Enter") addColumn(); }}
                placeholder="Column name…"
                className="h-9 flex-1 text-[13px]"
              />
              <Button size="sm" className="gap-1.5 rounded-lg" onClick={addColumn} disabled={!newName.trim()}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="mt-3">
              <KanbanColorPicker value={newColor} onChange={setNewColor} size={20} />
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

/* ─── One sortable, editable column row ──────────────────────────────────── */

function SortableColumnRow({
  col,
  count,
  canDelete,
  onRename,
  onColor,
  onDelete,
}: {
  col: KanbanColumn;
  count: number;
  canDelete: boolean;
  onRename: (name: string) => void;
  onColor: (color: KanbanColor) => void;
  onDelete: () => void;
}) {
  const tone = kanbanColor(col.color);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: col.id });

  // LOCAL draft so the user can backspace to empty / type spaces freely.
  const [draft, setDraft] = useState(col.name);
  // Keep the draft in sync when the canonical value changes from elsewhere
  // (e.g. reorder re-render) and the field isn't being actively edited.
  useEffect(() => { setDraft(col.name); }, [col.name]);

  const commit = () => {
    const name = draft.trim();
    if (!name) {
      // Empty → revert to a safe default name (never persist a blank column).
      setDraft(col.name || "Untitled");
      if (!col.name) onRename("Untitled");
      return;
    }
    if (name !== col.name) onRename(name);
    setDraft(name);
  };

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-3 transition",
        isDragging ? "border-[#4361EE] shadow-lg" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <button
          type="button"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded text-zinc-300 hover:text-zinc-600 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} />

        <Input
          value={draft}
          onChange={(e: any) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: any) => {
            if (e.key === "Enter") { e.currentTarget.blur(); }
            if (e.key === "Escape") { setDraft(col.name); e.currentTarget.blur(); }
          }}
          className="h-9 flex-1 text-[13px]"
          placeholder="Column name…"
        />

        <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
          {count}
        </span>

        <button
          type="button"
          title={canDelete ? "Delete column" : "A board needs at least one column"}
          disabled={!canDelete}
          onClick={onDelete}
          className="grid h-8 w-8 shrink-0 place-items-center rounded text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 pl-8">
        <KanbanColorPicker value={col.color} onChange={onColor} size={18} />
      </div>
    </div>
  );
}
