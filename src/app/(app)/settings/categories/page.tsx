"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Upload, Save, RotateCcw, Image as ImageIcon, ChevronDown, ChevronUp, Loader2, Pencil, Archive, ArchiveRestore, Check, X, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { createBrand, createDeviceModel, getBrandsForCategory } from "@/lib/brand-model-data";
import {
  loadDeviceCategories,
  saveDeviceCategories,
  getCachedCategories,
  DEFAULT_CATEGORIES,
  type DeviceCategoryItem,
} from "@/lib/device-categories";

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function CategoriesSettingsPage() {
  const { can } = usePermissions();
  const canManageCategories = can("manage_settings") || can("create_category") || can("edit_category") || can("manage_categories");
  const [categories, setCategories] = useState<DeviceCategoryItem[]>(DEFAULT_CATEGORIES);
  const [newLabel, setNewLabel] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryLabel, setEditingCategoryLabel] = useState("");

  const saveCategoryLabel = () => {
    if (editingCategoryId && editingCategoryLabel.trim()) {
      setCategories((prev) => prev.map((c) => (c.id === editingCategoryId ? { ...c, label: editingCategoryLabel.trim() } : c)));
    }
    setEditingCategoryId(null);
    setEditingCategoryLabel("");
  };

  // Load from Supabase (or localStorage fallback) on mount.
  useEffect(() => {
    loadDeviceCategories().then((cats) => {
      setCategories(cats);
      setLoaded(true);
    });
  }, []);

  const addCategory = () => {
    if (!newLabel.trim()) return;
    const id = newLabel.trim().toLowerCase().replace(/\s+/g, "-");
    if (categories.some((c) => c.id === id)) return;
    setCategories([...categories, { id, label: newLabel.trim() }]);
    setNewLabel("");
  };

  const removeCategory = (id: string) => {
    setCategories(categories.filter((c) => c.id !== id));
  };

  const updateImage = (id: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large (max 5MB). Please pick a smaller file.");
      return;
    }
    // Resize on canvas to keep stored data small.
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 512;
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setCategories((prev) => prev.map((c) => c.id === id ? { ...c, image: raw } : c)); return; }
        ctx.drawImage(img, 0, 0, width, height);
        let out = canvas.toDataURL("image/webp", 0.7);
        if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/png");
        setCategories((prev) => prev.map((c) => c.id === id ? { ...c, image: out } : c));
      };
      img.onerror = () => {
        setCategories((prev) => prev.map((c) => c.id === id ? { ...c, image: raw } : c));
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveDeviceCategories(categories);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert("Failed to save categories. Check console for details.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Device Categories"
        subtitle="Manage the device categories shown during ticket creation."
      />

      {/* Add New */}
      {canManageCategories && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Add New Category</p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label>Category Name</Label>
              <Input
                value={newLabel}
                onChange={(e: any) => setNewLabel(e.target.value)}
                placeholder="e.g. Gaming Console"
                onKeyDown={(e: any) => e.key === "Enter" && addCategory()}
              />
            </div>
            <Button size="md" onClick={addCategory} disabled={!newLabel.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      )}

      {/* Category Grid */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Categories ({categories.length})
        </p>
        {!loaded ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <AnimatePresence>
              {categories.map((cat) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group relative flex flex-col items-center rounded-xl border border-border p-4 transition hover:border-zinc-300"
                >
                  {/* Image / Upload Area */}
                  <label className="relative grid h-16 w-16 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition hover:border-[#4361EE]/40 hover:bg-indigo-50/30 overflow-hidden">
                    {cat.image ? (
                      <img src={cat.image} alt={cat.label} className="h-full w-full object-cover rounded-xl" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-zinc-300" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) updateImage(cat.id, f);
                      }}
                    />
                    <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/40 text-white opacity-0 group-hover:opacity-100 transition">
                      <Upload className="h-4 w-4" />
                    </span>
                  </label>

                  {/* Label — click to rename (when permitted) */}
                  {editingCategoryId === cat.id ? (
                    <input
                      value={editingCategoryLabel}
                      autoFocus
                      onChange={(e) => setEditingCategoryLabel(e.target.value)}
                      onBlur={saveCategoryLabel}
                      onKeyDown={(e) => { if (e.key === "Enter") saveCategoryLabel(); if (e.key === "Escape") setEditingCategoryId(null); }}
                      className="mt-2.5 w-full rounded-md border border-[#4361EE] bg-white px-1.5 py-0.5 text-center text-[12px] font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
                    />
                  ) : canManageCategories ? (
                    <button
                      type="button"
                      onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryLabel(cat.label); }}
                      className="mt-2.5 text-[12px] font-semibold text-zinc-700 text-center hover:text-[#4361EE] transition"
                      title="Click to rename"
                    >
                      {cat.label}
                    </button>
                  ) : (
                    <p className="mt-2.5 text-[12px] font-semibold text-zinc-700 text-center">{cat.label}</p>
                  )}

                  {canManageCategories && (
                    <>
                      {/* Edit */}
                      <button
                        onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryLabel(cat.label); }}
                        className="absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-md bg-white text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-[#4361EE] hover:bg-[#EEF1FD] transition shadow-sm ring-1 ring-border"
                        title="Rename category"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>

                      {/* Remove */}
                      <button
                        onClick={() => removeCategory(cat.id)}
                        className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-md bg-white text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-50 transition shadow-sm ring-1 ring-border"
                        title="Remove category"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Actions */}
      {canManageCategories && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="md" onClick={() => { setCategories(DEFAULT_CATEGORIES); }}>
            <RotateCcw className="h-4 w-4" /> Reset Defaults
          </Button>
          <Button size="md" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Categories"}
          </Button>
        </div>
      )}

      {/* ─── Brands & Models Master ─── */}
      <BrandsModelsSection />

      {/* ─── Issue Library ─── */}
      <IssueLibrarySection />
    </div>
  );
}

/* ─── Brands & Models Management (per Device Category) ───────────────── */

function BrandsModelsSection() {
  const { brands, deviceModels, addBrand, updateBrand, addDeviceModel, updateDeviceModel, deleteBrand, deleteDeviceModel, resetBrandsAndModels } = useStore();
  const { can } = usePermissions();
  const canManage = can("manage_settings") || can("manage_brands") || can("create_brand");

  // Device categories (the master list managed above) drive the scope selector.
  const [categoryOptions, setCategoryOptions] = useState<DeviceCategoryItem[]>(
    () => getCachedCategories() ?? DEFAULT_CATEGORIES,
  );
  const [activeCategory, setActiveCategory] = useState<string>("");
  useEffect(() => {
    let alive = true;
    loadDeviceCategories().then((cats) => {
      if (!alive) return;
      setCategoryOptions(cats);
      setActiveCategory((prev) => prev || cats[0]?.id || "");
    });
    return () => { alive = false; };
  }, []);

  const [newBrandName, setNewBrandName] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  const [confirmDeleteBrand, setConfirmDeleteBrand] = useState<string | null>(null);
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingBrandName, setEditingBrandName] = useState("");
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const activeCategoryLabel = categoryOptions.find((c) => c.id === activeCategory)?.label ?? "";

  // Per-brand model search query (keyed by brand id). Search is always scoped
  // to a single brand within the active category — never across categories.
  const [modelQueryByBrand, setModelQueryByBrand] = useState<Record<string, string>>({});

  // Brands shown for the active category — STRICTLY scoped. When viewing
  // archived, show only this category's archived brands (never other categories').
  const scopedBrands = useMemo(() => {
    if (showArchived) {
      return brands.filter((b) => b.archived && b.categoryId === activeCategory).sort((a, b) => a.name.localeCompare(b.name));
    }
    return getBrandsForCategory(brands, activeCategory);
  }, [brands, activeCategory, showArchived]);

  const handleAddBrand = () => {
    if (!newBrandName.trim() || !activeCategory) return;
    // Duplicate check is scoped to THIS category only — the same brand name may
    // legitimately exist under other categories as independent records.
    const dup = brands.some(
      (b) => b.categoryId === activeCategory && b.name.toLowerCase() === newBrandName.trim().toLowerCase(),
    );
    if (dup) return;
    addBrand(createBrand(newBrandName.trim(), activeCategory));
    setNewBrandName("");
  };

  const handleAddModel = (brandId: string) => {
    if (!newModelName.trim()) return;
    // Duplicate check scoped to this exact brand record (category+brand).
    if (deviceModels.some((m) => m.brandId === brandId && m.name.toLowerCase() === newModelName.trim().toLowerCase())) return;
    // Pass the active category so the model is a self-describing scoped record.
    addDeviceModel(createDeviceModel(brandId, newModelName.trim(), activeCategory));
    setNewModelName("");
  };

  const handleDeleteBrand = (id: string) => {
    deleteBrand(id);
    setConfirmDeleteBrand(null);
    if (expandedBrand === id) setExpandedBrand(null);
  };

  const startEditBrand = (id: string, name: string) => {
    setEditingBrandId(id);
    setEditingBrandName(name);
  };
  const saveEditBrand = () => {
    if (editingBrandId && editingBrandName.trim()) {
      updateBrand(editingBrandId, { name: editingBrandName.trim() });
    }
    setEditingBrandId(null);
    setEditingBrandName("");
  };

  const startEditModel = (id: string, name: string) => {
    setEditingModelId(id);
    setEditingModelName(name);
  };
  const saveEditModel = () => {
    if (editingModelId && editingModelName.trim()) {
      updateDeviceModel(editingModelId, { name: editingModelName.trim() });
    }
    setEditingModelId(null);
    setEditingModelName("");
  };

  return (
    <>
      <div className="mt-4 border-t border-border pt-6">
        <h2 className="text-lg font-bold tracking-tight">Brands &amp; Models</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Each category owns its own brands and models. Pick a category below, then manage only that category&apos;s data.
        </p>
      </div>

      {/* Category navigation — pick one category, manage ONLY its dataset */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Select a category</p>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categoryOptions.map((c) => {
            const isActive = c.id === activeCategory;
            const brandCount = brands.filter((b) => !b.archived && b.categoryId === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setActiveCategory(c.id); setExpandedBrand(null); setShowArchived(false); }}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium leading-none transition whitespace-nowrap",
                  isActive
                    ? "border-[#4361EE] bg-[#4361EE] text-white shadow-sm"
                    : "border-border text-zinc-600 hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/50",
                )}
              >
                <span className="leading-none">{c.label}</span>
                <span className={cn(
                  "grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold leading-none",
                  isActive ? "bg-white/20 text-white" : "bg-[#EEF1FD] text-[#4361EE]",
                )}>
                  {brandCount}
                </span>
              </button>
            );
          })}
          </div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium leading-none transition whitespace-nowrap",
              showArchived ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-border text-muted-foreground hover:border-[#4361EE]/40",
            )}
          >
            {showArchived ? "Archived" : "Show archived"}
          </button>
        </div>
      </div>

      {/* Add New Brand under the selected category */}
      {!showArchived && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Add Brand{activeCategoryLabel ? ` to ${activeCategoryLabel}` : ""}
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label>Brand Name</Label>
              <Input
                value={newBrandName}
                onChange={(e: any) => setNewBrandName(e.target.value)}
                placeholder="e.g. Apple, Samsung"
                disabled={!canManage || !activeCategory}
                onKeyDown={(e: any) => e.key === "Enter" && handleAddBrand()}
              />
            </div>
            <Button size="md" onClick={handleAddBrand} disabled={!canManage || !newBrandName.trim() || !activeCategory}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      )}

      {/* Brand List with expandable Models */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {showArchived
              ? `Archived Brands (${scopedBrands.length})`
              : `${activeCategoryLabel || "Category"} · Brands (${scopedBrands.length})`}
          </p>
        </div>
        <div className="divide-y divide-border">
          {scopedBrands.sort((a, b) => a.name.localeCompare(b.name)).map((brand) => {
            const allModels = deviceModels.filter((m) => m.brandId === brand.id);
            const models = allModels.filter((m) => !m.archived).sort((a, b) => a.name.localeCompare(b.name));
            const isExpanded = expandedBrand === brand.id;
            const isEditingThis = editingBrandId === brand.id;
            return (
              <div key={brand.id} className={cn(brand.archived && "opacity-60")}>
                {/* Brand Row */}
                <div className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition">
                  <button
                    type="button"
                    onClick={() => setExpandedBrand(isExpanded ? null : brand.id)}
                    className="flex flex-1 items-center gap-3 text-left min-w-0"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE] text-xs font-bold">
                      {brand.name[0]?.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      {isEditingThis ? (
                        <Input
                          value={editingBrandName}
                          autoFocus
                          onClick={(e: any) => e.stopPropagation()}
                          onChange={(e: any) => setEditingBrandName(e.target.value)}
                          onKeyDown={(e: any) => { if (e.key === "Enter") saveEditBrand(); if (e.key === "Escape") setEditingBrandId(null); }}
                          className="h-8"
                        />
                      ) : (
                        <p className="text-sm font-medium truncate flex items-center gap-2">
                          {brand.name}
                          {brand.archived && (
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">Archived</span>
                          )}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">{models.length} model{models.length !== 1 ? "s" : ""}</p>
                    </div>
                    {!isEditingThis && (isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
                  </button>

                  {/* Row actions */}
                  {canManage && (
                    isEditingThis ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={saveEditBrand} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition" title="Save"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingBrandId(null)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted transition" title="Cancel"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : confirmDeleteBrand === brand.id ? (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setConfirmDeleteBrand(null)}>Cancel</Button>
                        <Button size="sm" onClick={() => handleDeleteBrand(brand.id)} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => startEditBrand(brand.id, brand.name)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-[#4361EE] hover:bg-[#EEF1FD] transition" title="Edit brand"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => updateBrand(brand.id, { archived: !brand.archived })} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition" title={brand.archived ? "Restore brand" : "Disable / archive brand"}>
                          {brand.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setConfirmDeleteBrand(brand.id)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition" title="Delete brand and all its models"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    )
                  )}
                </div>

                {/* Expanded: Models List */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="border-t border-border bg-muted/20 px-5 py-3"
                  >
                    {/* Add model input */}
                    {canManage && (
                      <div className="flex items-end gap-2 mb-3">
                        <div className="flex-1 space-y-1">
                          <Label>Add Model to {brand.name}</Label>
                          <Input
                            value={newModelName}
                            onChange={(e: any) => setNewModelName(e.target.value)}
                            placeholder={`e.g. ${brand.name} new model`}
                            onKeyDown={(e: any) => e.key === "Enter" && handleAddModel(brand.id)}
                          />
                        </div>
                        <Button size="sm" onClick={() => handleAddModel(brand.id)} disabled={!newModelName.trim()}>
                          <Plus className="h-3.5 w-3.5" /> Add
                        </Button>
                      </div>
                    )}
                    {/* Per-brand model search — scoped to THIS brand+category only.
                        Appears once the list is long enough to warrant filtering. */}
                    {models.length > 6 && (
                      <div className="mb-2">
                        <Input
                          value={modelQueryByBrand[brand.id] || ""}
                          onChange={(e: any) => setModelQueryByBrand((prev) => ({ ...prev, [brand.id]: e.target.value }))}
                          placeholder={`Search ${brand.name} models…`}
                          className="h-8"
                          iconLeft={<Search className="h-3.5 w-3.5" />}
                        />
                      </div>
                    )}
                    {/* Models */}
                    {(() => {
                      const q = (modelQueryByBrand[brand.id] || "").trim().toLowerCase();
                      const visibleModels = q ? models.filter((m) => m.name.toLowerCase().includes(q)) : models;
                      return visibleModels.length > 0 ? (
                      <div className="space-y-1">
                        {visibleModels.map((model) => {
                          const editingThisModel = editingModelId === model.id;
                          return (
                            <div key={model.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 hover:bg-white transition">
                              {editingThisModel ? (
                                <Input
                                  value={editingModelName}
                                  autoFocus
                                  onChange={(e: any) => setEditingModelName(e.target.value)}
                                  onKeyDown={(e: any) => { if (e.key === "Enter") saveEditModel(); if (e.key === "Escape") setEditingModelId(null); }}
                                  className="h-7 flex-1"
                                />
                              ) : (
                                <span className="text-[13px] flex-1 truncate">{model.name}</span>
                              )}
                              {canManage && (
                                editingThisModel ? (
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={saveEditModel} className="grid h-6 w-6 place-items-center rounded text-emerald-600 hover:bg-emerald-50 transition" title="Save"><Check className="h-3 w-3" /></button>
                                    <button onClick={() => setEditingModelId(null)} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-muted transition" title="Cancel"><X className="h-3 w-3" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => startEditModel(model.id, model.name)} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-[#4361EE] hover:bg-[#EEF1FD] transition" title="Edit model"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={() => updateDeviceModel(model.id, { archived: true })} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition" title="Disable / archive model"><Archive className="h-3 w-3" /></button>
                                    <button onClick={() => deleteDeviceModel(model.id)} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition" title="Delete model"><Trash2 className="h-3 w-3" /></button>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                      ) : q ? (
                        <p className="text-[12px] text-muted-foreground italic">No models match &quot;{modelQueryByBrand[brand.id]}&quot;.</p>
                      ) : (
                        <p className="text-[12px] text-muted-foreground italic">No models yet. {canManage ? "Add one above." : ""}</p>
                      );
                    })()}
                    {/* Archived models (restore) */}
                    {allModels.some((m) => m.archived) && (
                      <div className="mt-3 border-t border-border/60 pt-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Archived</p>
                        {allModels.filter((m) => m.archived).sort((a, b) => a.name.localeCompare(b.name)).map((model) => (
                          <div key={model.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5">
                            <span className="text-[13px] flex-1 truncate text-muted-foreground line-through">{model.name}</span>
                            {canManage && (
                              <button onClick={() => updateDeviceModel(model.id, { archived: false })} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 transition" title="Restore model"><ArchiveRestore className="h-3 w-3" /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            );
          })}
          {scopedBrands.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              {showArchived
                ? "No archived brands."
                : activeCategory
                  ? `No brands configured for ${activeCategoryLabel || "this category"} yet.${canManage ? " Add one above." : ""}`
                  : "Select a category to manage its brands."}
            </div>
          )}
        </div>
      </div>

      {/* Reset */}
      {canManage && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-card">
          <div>
            <p className="text-sm font-medium">Reset Brands &amp; Models</p>
            <p className="text-[11px] text-muted-foreground">Restore to the default list. Changes reflect immediately in the ticket form.</p>
          </div>
          <Button variant="outline" size="md" onClick={resetBrandsAndModels}>
            <RotateCcw className="h-4 w-4" /> Reset Defaults
          </Button>
        </div>
      )}
    </>
  );
}

/* ─── Issue Library Management ─────────────────────────────────────────── */

function IssueLibrarySection() {
  const { issueLibrary, addIssueToStore, deleteIssueFromStore } = useStore();
  const [newIssue, setNewIssue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newIssue.trim()) return;
    if (issueLibrary.some((i) => i.toLowerCase() === newIssue.trim().toLowerCase())) return;
    addIssueToStore(newIssue.trim());
    setNewIssue("");
  };

  const sortedIssues = [...issueLibrary].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <div className="mt-4 border-t border-border pt-6">
        <h2 className="text-lg font-bold tracking-tight">Issue Library</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage the issue options shown in the ticket creation form. New issues added from tickets also appear here.</p>
      </div>

      {/* Add New Issue */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Add New Issue</p>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label>Issue Name</Label>
            <Input
              value={newIssue}
              onChange={(e: any) => setNewIssue(e.target.value)}
              placeholder="e.g. Hinge Broken, SIM Tray Stuck"
              onKeyDown={(e: any) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button size="md" onClick={handleAdd} disabled={!newIssue.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* Issue List */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Issues ({issueLibrary.length})
          </p>
        </div>
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {sortedIssues.map((issue) => (
            <div key={issue} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/30 transition">
              <span className="text-sm">{issue}</span>
              {confirmDelete === issue ? (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => { deleteIssueFromStore(issue); setConfirmDelete(null); }} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(issue)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                  title="Delete issue"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {issueLibrary.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">No issues configured. Add one above.</div>
          )}
        </div>
      </div>
    </>
  );
}
