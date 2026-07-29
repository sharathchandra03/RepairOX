"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Save, RotateCcw, Tag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useExpenseCategories,
  addCategory,
  removeCategory,
  resetCategories,
} from "@/lib/expense-store";

export default function ExpenseCategoriesSettingsPage() {
  const categories = useExpenseCategories();
  const [newLabel, setNewLabel] = useState("");
  const [saved, setSaved] = useState(false);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    if (categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) return;
    addCategory(label);
    setNewLabel("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRemove = (id: string) => {
    removeCategory(id);
  };

  const handleReset = () => {
    resetCategories();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Financial"
        title="Expense Categories"
        subtitle="Manage the master list of expense categories used across the Expense module."
      />

      {/* Add New Category */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Add New Category
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label>Category Name</Label>
            <Input
              value={newLabel}
              onChange={(e: any) => setNewLabel(e.target.value)}
              placeholder="e.g. Insurance, Legal Fees, Internet"
              onKeyDown={(e: any) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button size="md" onClick={handleAdd} disabled={!newLabel.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* Categories List */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Categories ({categories.length})
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {categories.map((cat) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group flex items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 transition hover:border-zinc-300"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                    <Tag className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-medium">{cat.label}</span>
                </div>
                <button
                  onClick={() => handleRemove(cat.id)}
                  className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-50 transition"
                  title="Remove category"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="md" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" /> Reset Defaults
        </Button>
        {saved && (
          <span className="text-xs font-medium text-emerald-600">Saved!</span>
        )}
      </div>
    </div>
  );
}
