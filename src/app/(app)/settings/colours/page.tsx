"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Save, RotateCcw, Loader2, Pencil, Check, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
import {
  loadDeviceColours,
  saveDeviceColours,
  subscribeDeviceColours,
  DEFAULT_COLOURS,
  type DeviceColourItem,
} from "@/lib/device-colours";

/* ─── Page ───────────────────────────────────────────────────────────── */

const DEFAULT_NEW_SWATCH = "#4361EE";

export default function ColoursSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("manage_settings") || can("create_category") || can("edit_category") || can("manage_categories");

  const [colours, setColours] = useState<DeviceColourItem[]>(DEFAULT_COLOURS);
  const [newLabel, setNewLabel] = useState("");
  const [newSwatch, setNewSwatch] = useState(DEFAULT_NEW_SWATCH);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  // Load from Supabase (or localStorage fallback) on mount, and stay in sync
  // when colours are added elsewhere (e.g. inline during ticket creation, or
  // in another tab). We skip live updates while the user is mid-edit/rename to
  // avoid clobbering unsaved local changes.
  const editingRef = useRef(false);
  editingRef.current = editingId !== null;
  useEffect(() => {
    loadDeviceColours().then((list) => {
      setColours(list);
      setLoaded(true);
    });
    const unsub = subscribeDeviceColours((list) => {
      if (!editingRef.current) setColours(list);
    });
    return unsub;
  }, []);

  const addColour = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, "-");
    if (colours.some((c) => c.value === value)) return;
    setColours([...colours, { value, label, swatch: newSwatch }]);
    setNewLabel("");
    setNewSwatch(DEFAULT_NEW_SWATCH);
  };

  const removeColour = (value: string) => {
    setColours(colours.filter((c) => c.value !== value));
  };

  const updateSwatch = (value: string, swatch: string) => {
    setColours((prev) => prev.map((c) => (c.value === value ? { ...c, swatch } : c)));
  };

  const startRename = (value: string, label: string) => {
    setEditingId(value);
    setEditingLabel(label);
  };
  const saveRename = () => {
    if (editingId && editingLabel.trim()) {
      setColours((prev) => prev.map((c) => (c.value === editingId ? { ...c, label: editingLabel.trim() } : c)));
    }
    setEditingId(null);
    setEditingLabel("");
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveDeviceColours(colours);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert("Failed to save colours. Check console for details.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Device Colours"
        subtitle="Manage the device colours shown during ticket creation. Pick a colour to display beside each name."
      />

      {/* Add New */}
      {canManage && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Add New Colour</p>
          <div className="flex items-end gap-3">
            {/* Colour picker — sets the swatch shown left of the name */}
            <div className="space-y-1">
              <Label>Colour</Label>
              <label
                className="flex h-[38px] w-[52px] cursor-pointer items-center justify-center rounded-xl border border-border transition hover:border-[#4361EE]/40"
                title="Pick a colour"
              >
                <span
                  className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/15"
                  style={{ backgroundColor: newSwatch }}
                />
                <input
                  type="color"
                  value={newSwatch}
                  onChange={(e) => setNewSwatch(e.target.value)}
                  className="absolute h-0 w-0 opacity-0"
                />
              </label>
            </div>
            <div className="flex-1 space-y-1">
              <Label>Colour Name</Label>
              <Input
                value={newLabel}
                onChange={(e: any) => setNewLabel(e.target.value)}
                placeholder="e.g. Space Grey"
                onKeyDown={(e: any) => e.key === "Enter" && addColour()}
              />
            </div>
            <Button size="md" onClick={addColour} disabled={!newLabel.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      )}

      {/* Colour List */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Colours ({colours.length})
        </p>
        {!loaded ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : colours.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No colours yet. {canManage ? "Add one above." : ""}
          </p>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence>
              {colours.map((c) => (
                <motion.div
                  key={c.value}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="group flex items-center gap-3 py-2.5"
                >
                  {/* Swatch — click to change colour (colour picker) */}
                  {canManage ? (
                    <label className="relative grid h-7 w-7 shrink-0 cursor-pointer place-items-center" title="Change colour">
                      <span
                        className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/15 transition group-hover:ring-2 group-hover:ring-[#4361EE]/40"
                        style={{ backgroundColor: c.swatch }}
                      />
                      <input
                        type="color"
                        value={c.swatch}
                        onChange={(e) => updateSwatch(c.value, e.target.value)}
                        className="absolute h-0 w-0 opacity-0"
                      />
                    </label>
                  ) : (
                    <span
                      className="h-5 w-5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
                      style={{ backgroundColor: c.swatch }}
                    />
                  )}

                  {/* Label — click to rename */}
                  {editingId === c.value ? (
                    <Input
                      value={editingLabel}
                      autoFocus
                      onChange={(e: any) => setEditingLabel(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(e: any) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditingId(null); }}
                      className="h-8 flex-1"
                    />
                  ) : canManage ? (
                    <button
                      type="button"
                      onClick={() => startRename(c.value, c.label)}
                      className="flex-1 text-left text-[13px] font-medium text-zinc-700 hover:text-[#4361EE] transition"
                      title="Click to rename"
                    >
                      {c.label}
                    </button>
                  ) : (
                    <span className="flex-1 text-[13px] font-medium text-zinc-700">{c.label}</span>
                  )}

                  {canManage && (
                    <div className="flex items-center gap-0.5">
                      {editingId === c.value ? (
                        <>
                          <button onClick={saveRename} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition" title="Save"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted transition" title="Cancel"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startRename(c.value, c.label)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-[#4361EE] hover:bg-[#EEF1FD] transition" title="Rename colour"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => removeColour(c.value)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition" title="Remove colour"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="md" onClick={() => setColours(DEFAULT_COLOURS)}>
            <RotateCcw className="h-4 w-4" /> Reset Defaults
          </Button>
          <Button size="md" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Colours"}
          </Button>
        </div>
      )}
    </div>
  );
}
