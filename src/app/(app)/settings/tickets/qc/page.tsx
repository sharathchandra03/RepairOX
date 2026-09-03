"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Save, Loader2, Pencil, Check, X, Search, Shield,
  ChevronDown, ChevronUp, Archive, ArchiveRestore, ArrowUp, ArrowDown, Undo2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import {
  loadQCConfig,
  saveQCConfig,
  DEFAULT_QC_CONFIG,
  type QCConfig,
  type QCCategory,
  type QCItem,
} from "@/lib/qc-config";

/* ─── Helpers ────────────────────────────────────────────────────── */

/** Generate a stable id from a label (slug + short random suffix so two
 *  differently-cased duplicates never collide). */
function makeId(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug || "item"}-${rand}`;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/* ─── Page ───────────────────────────────────────────────────────── */

export default function QualityCheckSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("edit_ticket_settings") || can("manage_settings");

  const [config, setConfig] = useState<QCConfig>(DEFAULT_QC_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatLabel, setEditingCatLabel] = useState("");
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemLabel, setEditingItemLabel] = useState("");

  useEffect(() => {
    loadQCConfig().then((c) => {
      setConfig(c);
      setLoaded(true);
    });
  }, []);

  const mutate = useCallback((updater: (prev: QCConfig) => QCConfig) => {
    setConfig((prev) => updater(prev));
    setDirty(true);
  }, []);

  /* ── Category actions ── */
  const addCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    mutate((prev) => ({
      categories: [...prev.categories, { id: makeId(label), label, items: [] }],
    }));
    setNewCategoryLabel("");
  };

  const saveCategoryLabel = () => {
    if (editingCatId && editingCatLabel.trim()) {
      const id = editingCatId;
      const label = editingCatLabel.trim();
      mutate((prev) => ({
        categories: prev.categories.map((c) => (c.id === id ? { ...c, label } : c)),
      }));
    }
    setEditingCatId(null);
    setEditingCatLabel("");
  };

  const toggleCategoryArchive = (id: string) => {
    mutate((prev) => ({
      categories: prev.categories.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c)),
    }));
  };

  const moveCategory = (index: number, dir: -1 | 1) => {
    mutate((prev) => ({ categories: move(prev.categories, index, index + dir) }));
  };

  /* ── Item actions ── */
  const addItem = (categoryId: string) => {
    const label = (newItemLabel[categoryId] || "").trim();
    if (!label) return;
    mutate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === categoryId ? { ...c, items: [...c.items, { id: makeId(label), label }] } : c
      ),
    }));
    setNewItemLabel((m) => ({ ...m, [categoryId]: "" }));
  };

  const saveItemLabel = (categoryId: string) => {
    if (editingItemId && editingItemLabel.trim()) {
      const itemId = editingItemId;
      const label = editingItemLabel.trim();
      mutate((prev) => ({
        categories: prev.categories.map((c) =>
          c.id === categoryId
            ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, label } : i)) }
            : c
        ),
      }));
    }
    setEditingItemId(null);
    setEditingItemLabel("");
  };

  const toggleItemArchive = (categoryId: string, itemId: string) => {
    mutate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, archived: !i.archived } : i)) }
          : c
      ),
    }));
  };

  const toggleItemRequired = (categoryId: string, itemId: string) => {
    mutate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, required: !i.required } : i)) }
          : c
      ),
    }));
  };

  const moveItem = (categoryId: string, index: number, dir: -1 | 1) => {
    mutate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === categoryId ? { ...c, items: move(c.items, index, index + dir) } : c
      ),
    }));
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const resetToDefaults = () => {
    setConfig(structuredCloneSafe(DEFAULT_QC_CONFIG));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveQCConfig(config);
    setSaving(false);
    if (ok) {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert("Failed to save Quality Check configuration. Check the console for details.");
    }
  };

  /* ── Derived view (search + archive filter) ── */
  const q = search.trim().toLowerCase();
  const visibleCategories = useMemo(() => {
    return config.categories
      .filter((c) => showArchived || !c.archived)
      .map((c) => {
        const items = c.items.filter((i) => {
          if (!showArchived && i.archived) return false;
          if (!q) return true;
          return i.label.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
        });
        return { cat: c, items };
      })
      .filter(({ cat, items }) => {
        if (!q) return true;
        return items.length > 0 || cat.label.toLowerCase().includes(q);
      });
  }, [config, showArchived, q]);

  const activeItemCount = useMemo(
    () => config.categories.filter((c) => !c.archived).reduce((n, c) => n + c.items.filter((i) => !i.archived).length, 0),
    [config]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings › Tickets"
        title="Quality Check"
        subtitle="Manage the QC inspection checklist used when creating tickets. Categories and items configured here appear in the ticket QC form."
      />

      {/* Toolbar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Input
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
              placeholder="Search QC items…"
              iconLeft={<Search className="h-3.5 w-3.5" />}
            />
          </div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition",
              showArchived ? "border-[#4361EE] bg-indigo-50/50 text-[#4361EE]" : "border-border text-muted-foreground hover:bg-muted/40"
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Hiding nothing" : "Show archived"}
          </button>
          <span className="text-[11px] text-muted-foreground">{activeItemCount} active items</span>
          {canManage && (
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetToDefaults} title="Reset the checklist to the built-in defaults">
                <Undo2 className="h-3.5 w-3.5" /> Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Add category */}
      {canManage && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add QC Category</p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label>Category Name</Label>
              <Input
                value={newCategoryLabel}
                onChange={(e: any) => setNewCategoryLabel(e.target.value)}
                placeholder="e.g. Buttons & Biometrics"
                onKeyDown={(e: any) => e.key === "Enter" && addCategory()}
              />
            </div>
            <Button size="md" onClick={addCategory} disabled={!newCategoryLabel.trim()}>
              <Plus className="h-4 w-4" /> Add Category
            </Button>
          </div>
        </div>
      )}

      {/* Categories */}
      {!loaded ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : visibleCategories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <Shield className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {q ? "No QC items match your search." : "No QC categories yet. Add one above to build your checklist."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {visibleCategories.map(({ cat, items }, catIndex) => {
              const isCollapsed = collapsed.has(cat.id);
              return (
                <motion.div
                  key={cat.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-card shadow-card",
                    cat.archived ? "border-dashed border-zinc-300 opacity-70" : "border-border"
                  )}
                >
                  {/* Category header */}
                  <div className="flex items-center gap-2 bg-muted/30 px-4 py-3">
                    <button onClick={() => toggleCollapse(cat.id)} className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                      {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>

                    {editingCatId === cat.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          value={editingCatLabel}
                          onChange={(e: any) => setEditingCatLabel(e.target.value)}
                          onKeyDown={(e: any) => { if (e.key === "Enter") saveCategoryLabel(); if (e.key === "Escape") { setEditingCatId(null); setEditingCatLabel(""); } }}
                          autoFocus
                        />
                        <button onClick={saveCategoryLabel} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
                        <button onClick={() => { setEditingCatId(null); setEditingCatLabel(""); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {cat.label}
                            {cat.archived && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200">Archived</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => moveCategory(catIndex, -1)} disabled={catIndex === 0} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button onClick={() => moveCategory(catIndex, 1)} disabled={catIndex === visibleCategories.length - 1} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                            <button onClick={() => { setEditingCatId(cat.id); setEditingCatLabel(cat.label); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => toggleCategoryArchive(cat.id)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted" title={cat.archived ? "Restore" : "Archive"}>
                              {cat.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Items */}
                  {!isCollapsed && (
                    <div className="divide-y divide-border">
                      {items.length === 0 && (
                        <p className="px-4 py-3 text-[12px] text-muted-foreground">No checks in this category yet.</p>
                      )}
                      {items.map((item, itemIndex) => (
                        <div key={item.id} className={cn("flex items-center gap-2 px-4 py-2.5", item.archived && "opacity-60")}>
                          {editingItemId === item.id ? (
                            <div className="flex flex-1 items-center gap-2">
                              <Input
                                value={editingItemLabel}
                                onChange={(e: any) => setEditingItemLabel(e.target.value)}
                                onKeyDown={(e: any) => { if (e.key === "Enter") saveItemLabel(cat.id); if (e.key === "Escape") { setEditingItemId(null); setEditingItemLabel(""); } }}
                                autoFocus
                              />
                              <button onClick={() => saveItemLabel(cat.id)} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
                              <button onClick={() => { setEditingItemId(null); setEditingItemLabel(""); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted"><X className="h-4 w-4" /></button>
                            </div>
                          ) : (
                            <>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4361EE]/60" />
                              <span className="flex-1 truncate text-[13px] font-medium">
                                {item.label}
                                {item.required && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">Required</span>}
                                {item.archived && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200">Archived</span>}
                              </span>
                              {canManage && (
                                <div className="flex items-center gap-0.5">
                                  <button onClick={() => moveItem(cat.id, itemIndex, -1)} disabled={itemIndex === 0} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => moveItem(cat.id, itemIndex, 1)} disabled={itemIndex === items.length - 1} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                                  <button
                                    onClick={() => toggleItemRequired(cat.id, item.id)}
                                    className={cn("rounded-lg px-2 py-1 text-[10px] font-semibold transition", item.required ? "bg-amber-100 text-amber-700" : "text-zinc-400 hover:bg-muted")}
                                    title="Toggle required"
                                  >
                                    REQ
                                  </button>
                                  <button onClick={() => { setEditingItemId(item.id); setEditingItemLabel(item.label); }} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => toggleItemArchive(cat.id, item.id)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted" title={item.archived ? "Restore" : "Archive"}>
                                    {item.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add check */}
                      {canManage && !cat.archived && (
                        <div className="flex items-center gap-2 px-4 py-2.5">
                          <Input
                            value={newItemLabel[cat.id] || ""}
                            onChange={(e: any) => setNewItemLabel((m) => ({ ...m, [cat.id]: e.target.value }))}
                            onKeyDown={(e: any) => e.key === "Enter" && addItem(cat.id)}
                            placeholder="Add a check (e.g. Face ID Test)…"
                          />
                          <Button size="sm" variant="outline" onClick={() => addItem(cat.id)} disabled={!(newItemLabel[cat.id] || "").trim()}>
                            <Plus className="h-3.5 w-3.5" /> Add Check
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {!canManage && loaded && (
        <p className="text-center text-[12px] text-muted-foreground">
          You have view-only access to the Quality Check configuration. Ask an administrator to make changes.
        </p>
      )}
    </div>
  );
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
