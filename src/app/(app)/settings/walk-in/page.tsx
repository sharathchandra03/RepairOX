"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Settings → Walk-In

   Configurable master data for the Shop → Walk-In module:
     • Sources (GMB / META / REFERENCE / Other …) — add, rename, archive, reset.
       Archiving a source only affects NEW walk-ins; historical records keep the
       source string they were saved with (no historical data is lost).
     • Sales-assignment behaviour — optionally require a sales person for
       Type = Sales walk-ins.

   Reuses the existing RepairOX settings page layout (PageHeader, cards, inline
   add/rename/remove) exactly like Settings → Device Colours.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, RotateCcw, Pencil, Check, X, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
import { useWalkInSources, useWalkInRequireSalesPerson } from "@/lib/walk-in-data";

export default function WalkInSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("manage_settings") || can("full_access") || can("use_pos");

  const { sources, addSource, removeSource, renameSource, resetSources } = useWalkInSources();
  const { requireSalesPerson, setRequireSalesPerson } = useWalkInRequireSalesPerson();

  const [newSource, setNewSource] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const handleAdd = () => {
    if (!newSource.trim()) return;
    addSource(newSource);
    setNewSource("");
  };

  const saveRename = () => {
    if (editing && editingValue.trim()) renameSource(editing, editingValue.trim());
    setEditing(null);
    setEditingValue("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Walk-In"
        subtitle="Configure the sources and assignment behaviour used across the Walk-In module."
      />

      {/* ── Sources ── */}
      {canManage && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add New Source</p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label>Source Name</Label>
              <Input
                value={newSource}
                onChange={(e: any) => setNewSource(e.target.value)}
                placeholder="e.g. Instagram, Referral Partner…"
                onKeyDown={(e: any) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <Button size="md" onClick={handleAdd} disabled={!newSource.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sources ({sources.length})
        </p>
        {sources.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No sources yet. {canManage ? "Add one above." : ""}
          </p>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence>
              {sources.map((s) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="group flex items-center gap-3 py-2.5"
                >
                  {editing === s ? (
                    <Input
                      value={editingValue}
                      autoFocus
                      onChange={(e: any) => setEditingValue(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(e: any) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(null); }}
                      className="h-8 flex-1"
                    />
                  ) : (
                    <span className="flex-1 text-[13px] font-medium text-zinc-700">{s}</span>
                  )}

                  {canManage && (
                    <div className="flex items-center gap-0.5">
                      {editing === s ? (
                        <>
                          <button onClick={saveRename} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50" title="Save"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditing(null)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted" title="Cancel"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditing(s); setEditingValue(s); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-[#4361EE] hover:bg-[#EEF1FD]" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => removeSource(s)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50" title="Archive source"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Archiving a source only hides it from new walk-ins. Existing walk-ins keep the source they were recorded with, so historical reports stay accurate.</span>
        </div>
      </div>

      {/* ── Sales assignment behaviour ── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sales Assignment</p>
        <label className="flex items-center justify-between gap-4">
          <span className="text-[13px]">
            <span className="font-medium text-zinc-800">Require a sales person for Sales walk-ins</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">When on, a Type = Sales walk-in can’t be saved until a sales person is assigned.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={requireSalesPerson}
            disabled={!canManage}
            onClick={() => setRequireSalesPerson(!requireSalesPerson)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${requireSalesPerson ? "bg-[#4361EE]" : "bg-zinc-300"} ${!canManage ? "opacity-50" : ""}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${requireSalesPerson ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </label>
      </div>

      {/* ── Reset ── */}
      {canManage && (
        <div className="flex items-center justify-end">
          <Button variant="outline" size="md" onClick={resetSources}>
            <RotateCcw className="h-4 w-4" /> Reset Sources to Default
          </Button>
        </div>
      )}
    </div>
  );
}
