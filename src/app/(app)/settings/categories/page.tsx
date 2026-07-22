"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Upload, Save, RotateCcw, Image as ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
    </div>
  );
}
