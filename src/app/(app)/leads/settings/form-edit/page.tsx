"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Settings → Form Edit.

   A focused, sidebar-driven editor for the dropdown field options on the Lead
   Form. One field is visible at a time — click a field in the left rail, manage
   its options in the right panel. Options are drag-to-reorder (GripVertical
   handle via @hello-pangea/dnd), rename-inline, archive/restore, and delete
   with safety. The panel never grows unboundedly because it's fixed-height with
   internal scroll. Add new options at the bottom.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DragDropContext, Droppable, Draggable,
  type DropResult, type DraggableProvided,
} from "@hello-pangea/dnd";
import {
  ArrowLeft, Plus, X, Check, Pencil, EyeOff, Eye, Trash2, Lock,
  GripVertical, ListChecks, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { useLeads } from "@/lib/leads-context";
import { LEAD_DROPDOWN_FIELDS, type LeadFieldDef, type LeadOption } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

export default function FormEditPage() {
  const { can } = usePermissions();
  const canManage = can("manage_settings");

  const [activeKey, setActiveKey] = useState(LEAD_DROPDOWN_FIELDS[0]?.key ?? "source");
  const activeField = LEAD_DROPDOWN_FIELDS.find((f) => f.key === activeKey) ?? LEAD_DROPDOWN_FIELDS[0];

  return (
    <div className="space-y-5">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/leads/settings"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-zinc-500 transition hover:border-[#4361EE]/40 hover:text-[#4361EE]"
          aria-label="Back to Lead Settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Lead Settings</p>
          <h1 className="font-display text-lg font-bold tracking-tight text-foreground">Form Edit</h1>
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground">
        Manage the dropdown values your sales agents choose from when capturing a lead. Pick a field on the left, then add, reorder, rename or archive its options.
      </p>

      {!canManage && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          <p className="text-[13px]">You can view lead field options, but only Admin/Owner roles can change them.</p>
        </div>
      )}

      {/* Sidebar + Editor panel */}
      <div className="flex gap-5">
        {/* ── Left rail: field list ── */}
        <div className="w-52 shrink-0">
          <nav className="space-y-1">
            {LEAD_DROPDOWN_FIELDS.map((f) => (
              <FieldTab
                key={f.key}
                field={f}
                active={f.key === activeKey}
                onClick={() => setActiveKey(f.key)}
              />
            ))}
          </nav>
        </div>

        {/* ── Right panel: option editor ── */}
        <div className="min-w-0 flex-1">
          <OptionEditor field={activeField} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar field tab ── */

function FieldTab({ field, active, onClick }: { field: LeadFieldDef; active: boolean; onClick: () => void }) {
  const { options } = useLeads();
  const count = useMemo(
    () => options.filter((o) => o.field === field.key && o.active).length,
    [options, field.key],
  );
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition",
        active
          ? "border border-[#4361EE]/30 bg-[#EEF1FD]/60 text-[#3A4DBB]"
          : "border border-transparent text-zinc-600 hover:bg-muted/60 hover:text-zinc-800",
      )}
    >
      <span className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px]",
        active ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground",
      )}>
        {field.usesStaff ? <Users className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{field.label}</span>
      <span className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        active ? "bg-[#4361EE]/10 text-[#4361EE]" : "bg-muted text-muted-foreground",
      )}>
        {count}
      </span>
    </button>
  );
}

/* ── Option editor panel (one field at a time) ── */

function OptionEditor({ field, canManage }: { field: LeadFieldDef; canManage: boolean }) {
  const { options, addOption, updateOption, setOptionActive, reorderOptions, deleteOption, countLeadsUsingOption } = useLeads();
  const { team } = usePermissions();
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ option: LeadOption; usage: number } | null>(null);

  const rows = useMemo(
    () => options.filter((o) => o.field === field.key).sort((a, b) => a.sortOrder - b.sortOrder),
    [options, field.key],
  );
  const staffNames = useMemo(() => team.map((m) => m.name).filter(Boolean), [team]);

  const handleAdd = () => {
    if (!adding.trim()) return;
    void addOption(field.key, adding.trim());
    setAdding("");
  };

  const saveEdit = () => {
    if (editingId && editValue.trim()) void updateOption(editingId, editValue.trim());
    setEditingId(null);
    setEditValue("");
  };

  const requestDelete = (opt: LeadOption) => {
    setConfirmDelete({ option: opt, usage: countLeadsUsingOption(field.key, opt.value) });
  };
  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    const { option, usage } = confirmDelete;
    if (usage > 0) {
      void setOptionActive(option.id, false);
      toast.info("Archived instead of deleted", {
        description: `"${option.value}" is used by ${usage} lead${usage !== 1 ? "s" : ""}, so it was archived to protect historical data.`,
      });
    } else {
      void deleteOption(option.id);
      toast.success("Option deleted", { description: `"${option.value}" was removed.` });
    }
    setConfirmDelete(null);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const ids = rows.map((r) => r.id);
    const [moved] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, moved);
    void reorderOptions(field.key, ids);
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card">
      {/* Panel header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          {field.usesStaff ? <Users className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-foreground">{field.label}</h2>
          <p className="text-[12px] text-muted-foreground">{field.hint}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {rows.filter((r) => r.active).length} active
        </span>
      </div>

      {/* Staff notice */}
      {field.usesStaff && (
        <div className="mx-5 mt-4 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            Also includes your live staff{staffNames.length ? `: ${staffNames.slice(0, 4).join(", ")}${staffNames.length > 4 ? "…" : ""}` : ""}. Add custom names below.
          </p>
        </div>
      )}

      {/* Scrollable option list — fixed height so the panel never stretches */}
      <div className="max-h-[420px] overflow-y-auto px-5 py-4">
        {rows.length === 0 && !field.usesStaff ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">
            No options yet — add one below.
          </p>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId={`field-${field.key}`} isDropDisabled={!canManage}>
              {(droppable) => (
                <div ref={droppable.innerRef} {...droppable.droppableProps} className="space-y-1.5">
                  {rows.map((opt, i) => (
                    <Draggable key={opt.id} draggableId={opt.id} index={i} isDragDisabled={!canManage}>
                      {(provided: DraggableProvided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "flex items-center gap-1.5 rounded-xl border px-2 py-2",
                            snapshot.isDragging
                              ? "border-[#4361EE]/40 bg-[#EEF1FD] shadow-lg"
                              : opt.active
                              ? "border-border bg-background"
                              : "border-dashed border-zinc-200 bg-zinc-50 opacity-70",
                          )}
                        >
                          {/* Drag handle */}
                          {canManage && (
                            <span
                              {...provided.dragHandleProps}
                              className="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded text-zinc-300 hover:text-zinc-500 active:cursor-grabbing"
                              title="Drag to reorder"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                          )}

                          {editingId === opt.id ? (
                            <>
                              <Input
                                value={editValue}
                                onChange={(e: any) => setEditValue(e.target.value)}
                                onKeyDown={(e: any) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { setEditingId(null); setEditValue(""); } }}
                                className="h-8 flex-1 text-[13px]"
                                autoFocus
                              />
                              <button onClick={saveEdit} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50" title="Save"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => { setEditingId(null); setEditValue(""); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-muted" title="Cancel"><X className="h-3.5 w-3.5" /></button>
                            </>
                          ) : (
                            <>
                              <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", !opt.active && "text-zinc-400 line-through")}>
                                {opt.value}
                              </span>
                              {!opt.active && <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Archived</span>}
                              {canManage && (
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button onClick={() => { setEditingId(opt.id); setEditValue(opt.value); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                                  <button
                                    onClick={() => setOptionActive(opt.id, !opt.active)}
                                    className={cn("grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted", opt.active ? "hover:text-amber-600" : "hover:text-emerald-600")}
                                    title={opt.active ? "Archive" : "Restore"}
                                  >
                                    {opt.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </button>
                                  <button onClick={() => requestDelete(opt)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {droppable.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Add new option */}
      <div className="border-t border-border px-5 py-4">
        {canManage ? (
          <div className="flex items-center gap-2">
            <Input
              value={adding}
              onChange={(e: any) => setAdding(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && handleAdd()}
              placeholder={`Add ${field.label.toLowerCase()}…`}
              className="h-9 flex-1 text-[13px]"
            />
            <Button size="sm" className="gap-1" onClick={handleAdd} disabled={!adding.trim()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-[12px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Read-only
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title={confirmDelete && confirmDelete.usage > 0 ? "Archive this option?" : "Delete this option?"}
        description={
          confirmDelete
            ? confirmDelete.usage > 0
              ? `"${confirmDelete.option.value}" is used by ${confirmDelete.usage} existing lead${confirmDelete.usage !== 1 ? "s" : ""}. To protect that data it will be archived (hidden from new leads) instead of deleted.`
              : `"${confirmDelete.option.value}" isn't used by any lead and will be permanently removed.`
            : ""
        }
        confirmLabel={confirmDelete && confirmDelete.usage > 0 ? "Archive" : "Delete"}
        danger={!confirmDelete || confirmDelete.usage === 0}
      />
    </div>
  );
}
