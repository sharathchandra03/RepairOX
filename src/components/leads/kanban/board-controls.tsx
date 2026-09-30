"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Kanban board selector + board settings.

   PERSONAL board navigation (My Pipeline ▾) and a compact settings menu
   (rename / change color / manage columns / duplicate / archive-delete). All
   actions are scoped to the signed-in user. The permanent default board can be
   renamed/recolored but not deleted.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import {
  ChevronDown, Plus, Check, Settings2, Pencil, Palette, Columns3, Copy, Trash2,
} from "lucide-react";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { KanbanColorPicker } from "./kanban-color-picker";
import { kanbanColor, type KanbanBoard, type KanbanColor } from "@/lib/lead-kanban";
import type { UseLeadKanban } from "@/hooks/use-lead-kanban";

/* ── Board selector ── */
export function BoardSelector({
  boards,
  activeBoard,
  onSelect,
  onNewBoard,
}: {
  boards: KanbanBoard[];
  activeBoard: KanbanBoard | null;
  onSelect: (boardId: string) => void;
  onNewBoard: () => void;
}) {
  const tone = kanbanColor(activeBoard?.color);
  return (
    <Dropdown
      width="w-64"
      align="left"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-[13px] font-semibold text-zinc-800 shadow-sm transition",
            open ? "border-[#4361EE] ring-1 ring-[#4361EE]/15" : "border-border hover:border-zinc-300",
          )}
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} />
          <span className="max-w-[180px] truncate">{activeBoard?.name ?? "Board"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <MenuLabel>Personal boards</MenuLabel>
          {boards.map((b) => {
            const t = kanbanColor(b.color);
            const active = b.id === activeBoard?.id;
            return (
              <MenuItem key={b.id} onClick={() => { onSelect(b.id); close(); }}>
                <span className="flex w-full items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} />
                  <span className="flex-1 truncate">{b.name}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />}
                </span>
              </MenuItem>
            );
          })}
          <div className="my-1 border-t border-border" />
          <MenuItem icon={Plus} onClick={() => { onNewBoard(); close(); }}>New Kanban</MenuItem>
        </div>
      )}
    </Dropdown>
  );
}

/* ── Board settings menu ── */
export function BoardSettingsMenu({
  board,
  kanban,
  onManageColumns,
}: {
  board: KanbanBoard;
  kanban: UseLeadKanban;
  onManageColumns: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [recoloring, setRecoloring] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Dropdown
        width="w-56"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            title="Board settings"
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl border bg-card shadow-sm transition",
              open ? "border-[#4361EE] text-[#4361EE]" : "border-border text-zinc-500 hover:text-zinc-700",
            )}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <div>
            <MenuLabel>Board settings</MenuLabel>
            <MenuItem icon={Pencil} onClick={() => { setRenaming(true); close(); }}>Rename board</MenuItem>
            <MenuItem icon={Palette} onClick={() => { setRecoloring(true); close(); }}>Change color</MenuItem>
            <MenuItem icon={Columns3} onClick={() => { onManageColumns(); close(); }}>Manage columns</MenuItem>
            <MenuItem icon={Copy} onClick={() => { kanban.duplicateActiveBoard(); close(); }}>Duplicate board</MenuItem>
            {!board.isDefault && (
              <>
                <div className="my-1 border-t border-border" />
                <MenuItem icon={Trash2} danger onClick={() => { setConfirmDelete(true); close(); }}>Delete board</MenuItem>
              </>
            )}
          </div>
        )}
      </Dropdown>

      {/* Rename */}
      <Drawer open={renaming} onClose={() => setRenaming(false)} title="Rename Board" icon={Pencil} width="max-w-sm">
        <RenameBoardBody board={board} onSave={(name) => { kanban.renameBoard(board.id, name); setRenaming(false); }} onCancel={() => setRenaming(false)} />
      </Drawer>

      {/* Recolor */}
      <Drawer open={recoloring} onClose={() => setRecoloring(false)} title="Board Color" icon={Palette} width="max-w-sm">
        <div className="space-y-4 p-5">
          <p className="text-[12px] text-muted-foreground">Pick a color to identify this board. It tints the board accent and selector dot — the rest of the screen stays neutral.</p>
          <KanbanColorPicker value={board.color} onChange={(c) => kanban.setBoardColor(board.id, c)} size={28} />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setRecoloring(false)}>Done</Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { kanban.deleteBoard(board.id); setConfirmDelete(false); }}
        title="Delete this board?"
        description={`This removes your personal "${board.name}" board layout only. No leads, customers, tickets or invoices are affected.`}
        confirmLabel="Delete board"
      />
    </>
  );
}

function RenameBoardBody({ board, onSave, onCancel }: { board: KanbanBoard; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(board.name);
  return (
    <div className="space-y-4 p-5">
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-zinc-600">Board name</label>
        <Input
          value={name}
          onChange={(e: any) => setName(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === "Enter" && name.trim()) onSave(name); }}
          autoFocus
          placeholder="My Sales Pipeline"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(name)} disabled={!name.trim()}>Save</Button>
      </div>
    </div>
  );
}

/* ── New board dialog ── */
export function NewBoardDrawer({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, color: KanbanColor) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<KanbanColor>("indigo");
  const submit = () => {
    if (!name.trim()) return;
    onCreate(name, color);
    setName("");
    setColor("indigo");
    onClose();
  };
  return (
    <Drawer open={open} onClose={onClose} title="New Kanban Board" icon={Plus} width="max-w-sm">
      <div className="space-y-4 p-5">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-zinc-600">Board name</label>
          <Input
            value={name}
            onChange={(e: any) => setName(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === "Enter") submit(); }}
            autoFocus
            placeholder="Hot Leads / Follow-ups / This Week…"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-zinc-600">Board color</label>
          <KanbanColorPicker value={color} onChange={setColor} size={24} />
        </div>
        <p className="text-[11px] text-muted-foreground">This board is personal to you. It starts with a few starter columns you can rename or replace.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!name.trim()}>Create board</Button>
        </div>
      </div>
    </Drawer>
  );
}
