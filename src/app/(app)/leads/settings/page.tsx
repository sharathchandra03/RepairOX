"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, X, Check, Pencil, EyeOff, Eye, ArrowUp, ArrowDown, Lock, Users, ListChecks, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { useLeads } from "@/lib/leads-context";
import { LEAD_DROPDOWN_FIELDS, type LeadFieldDef, type LeadOption } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

export default function LeadsSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("manage_settings");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Lead Settings"
        subtitle="Manage the dropdown values sales agents pick from when capturing leads. Changes apply to new leads instantly — existing leads keep their saved values."
      />

      {!canManage && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          <p className="text-[13px]">You can view lead options, but only Admin/Owner roles (Manage Settings) can change them.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {LEAD_DROPDOWN_FIELDS.map((field) => (
          <FieldCard key={field.key} field={field} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

function FieldCard({ field, canManage }: { field: LeadFieldDef; canManage: boolean }) {
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

  const move = (id: string, dir: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const idx = ids.indexOf(id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    void reorderOptions(field.key, ids);
  };

  const handleAdd = () => {
    if (!adding.trim()) return;
    void addOption(field.key, adding);
    setAdding("");
  };

  const saveEdit = () => {
    if (editingId) void updateOption(editingId, editValue);
    setEditingId(null);
    setEditValue("");
  };

  const requestDelete = (opt: LeadOption) => {
    setConfirmDelete({ option: opt, usage: countLeadsUsingOption(field.key, opt.value) });
  };
  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    const { option, usage } = confirmDelete;
    // Safety: never permanently delete a value still used by existing leads —
    // archive it instead so historical leads keep their saved value.
    if (usage > 0) {
      void setOptionActive(option.id, false);
      toast.info("Archived instead of deleted", { description: `"${option.value}" is used by ${usage} lead${usage !== 1 ? "s" : ""}, so it was archived to protect historical data.` });
    } else {
      void deleteOption(option.id);
      toast.success("Option deleted", { description: `"${option.value}" was removed.` });
    }
    setConfirmDelete(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          {field.usesStaff ? <Users className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
        </span>
        <h3 className="font-display text-base font-bold">{field.label}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{rows.filter((r) => r.active).length} active</span>
      </div>
      <p className="mb-4 text-[12px] text-muted-foreground">{field.hint}</p>

      {field.usesStaff && (
        <div className="mb-3 rounded-xl border border-dashed border-border bg-muted/30 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">
            Also includes your live staff{staffNames.length ? `: ${staffNames.slice(0, 4).join(", ")}${staffNames.length > 4 ? "…" : ""}` : ""}. Add custom names below.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.length === 0 && !field.usesStaff && (
          <p className="rounded-xl border border-dashed border-border py-4 text-center text-[12px] text-muted-foreground">No options yet.</p>
        )}
        {rows.map((opt, i) => (
          <motion.div
            key={opt.id}
            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.02 * i, 0.2) }}
            className={cn("flex items-center gap-2 rounded-xl border p-2 pl-3", opt.active ? "border-border bg-background" : "border-dashed border-zinc-200 bg-zinc-50 opacity-70")}
          >
            {/* Reorder */}
            {canManage && (
              <div className="flex flex-col">
                <button onClick={() => move(opt.id, -1)} disabled={i === 0} className="text-zinc-300 hover:text-zinc-600 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={() => move(opt.id, 1)} disabled={i === rows.length - 1} className="text-zinc-300 hover:text-zinc-600 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
              </div>
            )}

            {editingId === opt.id ? (
              <>
                <Input value={editValue} onChange={(e: any) => setEditValue(e.target.value)} onKeyDown={(e: any) => e.key === "Enter" && saveEdit()} className="h-8 flex-1 text-[13px]" autoFocus />
                <button onClick={saveEdit} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => { setEditingId(null); setEditValue(""); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <>
                <span className={cn("flex-1 truncate text-[13px] font-medium", !opt.active && "text-zinc-400 line-through")}>{opt.value}</span>
                {!opt.active && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Archived</span>}
                {canManage && (
                  <>
                    <button onClick={() => { setEditingId(opt.id); setEditValue(opt.value); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={() => setOptionActive(opt.id, !opt.active)}
                      className={cn("grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted", opt.active ? "hover:text-amber-600" : "hover:text-emerald-600")}
                      title={opt.active ? "Archive (hide from new leads)" : "Restore"}
                    >
                      {opt.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => requestDelete(opt)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </>
            )}
          </motion.div>
        ))}
      </div>

      {canManage ? (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={adding}
            onChange={(e: any) => setAdding(e.target.value)}
            onKeyDown={(e: any) => e.key === "Enter" && handleAdd()}
            placeholder={`Add ${field.label.toLowerCase()}…`}
            className="h-9 flex-1 text-[13px]"
          />
          <Button size="sm" className="gap-1" onClick={handleAdd} disabled={!adding.trim()}><Plus className="h-3.5 w-3.5" /> Add</Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-[12px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Read-only
        </div>
      )}

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
