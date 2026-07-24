"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Upload, Save, RotateCcw, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { createBrand, createDeviceModel, seedBrands, seedModels } from "@/lib/brand-model-data";

/* ─── Types ──────────────────────────────────────────────────────────── */

type Category = {
  id: string;
  label: string;
  image?: string; // base64 or URL
};

const DEFAULT_CATEGORIES: Category[] = [
  { id: "iphone", label: "iPhone" },
  { id: "macbook", label: "MacBook" },
  { id: "ipad", label: "iPad" },
  { id: "iwatch", label: "iWatch" },
  { id: "imac", label: "iMac" },
  { id: "android", label: "Android" },
  { id: "windows", label: "Windows" },
  { id: "others", label: "Others" },
];

const STORAGE_KEY = "repairox-device-categories";

function loadCategories(): Category[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CATEGORIES;
  } catch { return DEFAULT_CATEGORIES; }
}

function saveCategories(cats: Category[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function CategoriesSettingsPage() {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [newLabel, setNewLabel] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCategories(loadCategories()); }, []);

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
    const reader = new FileReader();
    reader.onload = () => {
      setCategories((prev) => prev.map((c) => c.id === id ? { ...c, image: reader.result as string } : c));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    saveCategories(categories);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Device Categories"
        subtitle="Manage the device categories shown during ticket creation."
      />

      {/* Add New */}
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

      {/* Category Grid */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Categories ({categories.length})
        </p>
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

                {/* Label */}
                <p className="mt-2.5 text-[12px] font-semibold text-zinc-700 text-center">{cat.label}</p>

                {/* Remove */}
                <button
                  onClick={() => removeCategory(cat.id)}
                  className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-md bg-white text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-50 transition shadow-sm ring-1 ring-border"
                  title="Remove category"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="md" onClick={() => { setCategories(DEFAULT_CATEGORIES); }}>
          <RotateCcw className="h-4 w-4" /> Reset Defaults
        </Button>
        <Button size="md" onClick={handleSave}>
          <Save className="h-4 w-4" /> {saved ? "Saved!" : "Save Categories"}
        </Button>
      </div>

      {/* ─── Brands & Models Master ─── */}
      <BrandsModelsSection />
    </div>
  );
}

/* ─── Brands & Models Management ─────────────────────────────────────── */

function BrandsModelsSection() {
  const { brands, deviceModels, addBrand, addDeviceModel, deleteBrand, deleteDeviceModel, resetBrandsAndModels } = useStore();
  const [newBrandName, setNewBrandName] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAddBrand = () => {
    if (!newBrandName.trim()) return;
    if (brands.some((b) => b.name.toLowerCase() === newBrandName.trim().toLowerCase())) return;
    addBrand(createBrand(newBrandName.trim()));
    setNewBrandName("");
  };

  const handleAddModel = (brandId: string) => {
    if (!newModelName.trim()) return;
    if (deviceModels.some((m) => m.brandId === brandId && m.name.toLowerCase() === newModelName.trim().toLowerCase())) return;
    addDeviceModel(createDeviceModel(brandId, newModelName.trim()));
    setNewModelName("");
  };

  const handleDeleteBrand = (id: string) => {
    deleteBrand(id);
    setConfirmDelete(null);
    if (expandedBrand === id) setExpandedBrand(null);
  };

  return (
    <>
      <div className="mt-4 border-t border-border pt-6">
        <h2 className="text-lg font-bold tracking-tight">Brands & Models</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage the brand and model master data used across the CRM.</p>
      </div>

      {/* Add New Brand */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Add New Brand</p>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label>Brand Name</Label>
            <Input
              value={newBrandName}
              onChange={(e: any) => setNewBrandName(e.target.value)}
              placeholder="e.g. Motorola, Nokia"
              onKeyDown={(e: any) => e.key === "Enter" && handleAddBrand()}
            />
          </div>
          <Button size="md" onClick={handleAddBrand} disabled={!newBrandName.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* Brand List with expandable Models */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Brands ({brands.length}) · Models ({deviceModels.length})
          </p>
        </div>
        <div className="divide-y divide-border">
          {brands.map((brand) => {
            const models = deviceModels.filter((m) => m.brandId === brand.id);
            const isExpanded = expandedBrand === brand.id;
            return (
              <div key={brand.id}>
                {/* Brand Row */}
                <div className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition">
                  <button
                    type="button"
                    onClick={() => setExpandedBrand(isExpanded ? null : brand.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE] text-xs font-bold">
                      {brand.name[0]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{brand.name}</p>
                      <p className="text-[11px] text-muted-foreground">{models.length} model{models.length !== 1 ? "s" : ""}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {confirmDelete === brand.id ? (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleDeleteBrand(brand.id)} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(brand.id)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                      title="Delete brand and all its models"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
                    {/* Models */}
                    {models.length > 0 ? (
                      <div className="space-y-1">
                        {models.map((model) => (
                          <div key={model.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-white transition">
                            <span className="text-[13px]">{model.name}</span>
                            <button
                              onClick={() => deleteDeviceModel(model.id)}
                              className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                              title="Delete model"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground italic">No models yet. Add one above.</p>
                    )}
                  </motion.div>
                )}
              </div>
            );
          })}
          {brands.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">No brands configured. Add one above.</div>
          )}
        </div>
      </div>

      {/* Reset */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-card">
        <div>
          <p className="text-sm font-medium">Reset Brands & Models</p>
          <p className="text-[11px] text-muted-foreground">Restore to default list (15 brands, 53 models). Changes reflect immediately in the ticket form.</p>
        </div>
        <Button variant="outline" size="md" onClick={resetBrandsAndModels}>
          <RotateCcw className="h-4 w-4" /> Reset Defaults
        </Button>
      </div>
    </>
  );
}
