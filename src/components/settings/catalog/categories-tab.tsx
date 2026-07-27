"use client";

import { useMemo, useState } from "react";
import {
  Plus, Search, Pencil, Trash2, ArrowUpDown, ChevronRight, Building2, Layers, CheckCircle2, XCircle,
  Smartphone, Tablet, Laptop, Monitor, Watch, Headphones, Gamepad2, Plane, Box,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCatalog } from "@/lib/catalog-context";
import { useCatalogSelection } from "./catalog-selection";
import type { DeviceCategory } from "@/lib/price-list-data";

/** Icons offered for categories — must stay in sync with the shop browser's iconMap. */
export const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Smartphone, Tablet, Laptop, Monitor, Watch, Headphones, Gamepad2, Plane, Box,
};
const ICON_OPTIONS = Object.keys(CATEGORY_ICONS).map((k) => ({ label: k, value: k }));

export function CategoriesTab() {
  const { categories, brands, models, addCategory, updateCategory, deleteCategory, toggleCategory } = useCatalog();
  const { openBrands, openModels } = useCatalogSelection();
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [editing, setEditing] = useState<DeviceCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Nested counts per category
  const stats = useMemo(() => {
    const map = new Map<string, { brands: number; models: number; active: number }>();
    for (const c of categories) map.set(c.id, { brands: 0, models: 0, active: 0 });
    for (const b of brands) { const s = map.get(b.categoryId); if (s) s.brands++; }
    for (const m of models) {
      const s = map.get(m.categoryId);
      if (s) { s.models++; if (m.status === "active") s.active++; }
    }
    return map;
  }, [categories, brands, models]);

  const rows = useMemo(() => {
    let list = [...categories];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => (sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
    return list;
  }, [categories, search, sortAsc]);

  const deleteTarget = categories.find((c) => c.id === deleteId);
  const detailCategory = categories.find((c) => c.id === detailId) ?? null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setSortAsc((v) => !v)}>
            <ArrowUpDown className="h-3.5 w-3.5" /> {sortAsc ? "A–Z" : "Z–A"}
          </Button>
          <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New Category
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.icon] || Box;
          const enabled = cat.enabled ?? true;
          const s = stats.get(cat.id) ?? { brands: 0, models: 0, active: 0 };
          return (
            <div
              key={cat.id}
              onClick={() => setDetailId(cat.id)}
              className={cn(
                "group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-card transition hover:border-[#4361EE]/40 hover:shadow-card-hover",
                !enabled && "opacity-60"
              )}
            >
              {/* Header: icon + name/stats + chevron */}
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/50">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{cat.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    <span className="font-medium text-[#4361EE]">{s.brands}</span> brands ·{" "}
                    <span className="font-medium text-[#4361EE]">{s.models}</span> models
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-[#4361EE]" />
              </div>

              {/* Footer: enable toggle + actions */}
              <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCategory(cat.id); }}
                    role="switch"
                    aria-checked={enabled}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                      enabled ? "bg-[#4361EE]" : "bg-zinc-300"
                    )}
                    title={enabled ? "Disable" : "Enable"}
                  >
                    <span className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200",
                      enabled ? "translate-x-[18px]" : "translate-x-0.5"
                    )} />
                  </button>
                  <span className="text-[11px] font-medium text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setEditing(cat); }} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteId(cat.id); }} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No categories found.
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <CategoryDetailDrawer
        category={detailCategory}
        brands={brands.filter((b) => detailCategory && b.categoryId === detailCategory.id)}
        models={models}
        onClose={() => setDetailId(null)}
        onEdit={(c) => { setDetailId(null); setEditing(c); }}
        onDelete={(id) => { setDetailId(null); setDeleteId(id); }}
        onToggle={toggleCategory}
        onOpenBrands={(id) => { setDetailId(null); openBrands(id); }}
        onOpenModels={(catId, brandId) => { setDetailId(null); openModels(catId, brandId); }}
      />

      {/* Create / Edit drawer */}
      {(creating || editing) && (
        <CategoryDrawer
          category={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) updateCategory(editing.id, data);
            else addCategory(data);
            setCreating(false); setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteCategory(deleteId); setDeleteId(null); }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will also remove all brands, models and parts under this category. This cannot be undone."
        confirmLabel="Delete Category"
      />
    </div>
  );
}

/* ─── Category Detail Drawer (drill-down) ────────────────────────── */
function CategoryDetailDrawer({
  category, brands, models, onClose, onEdit, onDelete, onToggle, onOpenBrands, onOpenModels,
}: {
  category: DeviceCategory | null;
  brands: import("@/lib/price-list-data").PriceListBrand[];
  models: import("@/lib/price-list-data").PriceListModel[];
  onClose: () => void;
  onEdit: (c: DeviceCategory) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onOpenBrands: (id: string) => void;
  onOpenModels: (categoryId: string, brandId: string) => void;
}) {
  const Icon = category ? (CATEGORY_ICONS[category.icon] || Box) : Box;
  const modelsInCat = category ? models.filter((m) => m.categoryId === category.id) : [];
  const active = modelsInCat.filter((m) => m.status === "active").length;
  const enabled = category?.enabled ?? true;

  return (
    <Drawer
      open={!!category}
      onClose={onClose}
      title={category?.name ?? "Category"}
      subtitle="Category · nested brands & models"
      icon={Icon}
      width="max-w-md"
      footer={category ? (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" className="text-rose-600" onClick={() => onDelete(category.id)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(category)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <Button size="sm" onClick={() => onOpenBrands(category.id)}>Manage brands <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ) : undefined}
    >
      {category && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Building2} label="Brands" value={brands.length} />
            <Stat icon={Layers} label="Models" value={modelsInCat.length} />
            <Stat icon={CheckCircle2} label="Active" value={active} />
          </div>

          {/* Enable toggle */}
          <label className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-[13px] font-medium">Enabled</p>
              <p className="text-[11px] text-muted-foreground">Visible across modules when on.</p>
            </div>
            <button
              type="button"
              onClick={() => onToggle(category.id)}
              role="switch"
              aria-checked={enabled}
              className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", enabled ? "bg-[#4361EE]" : "bg-zinc-300")}
            >
              <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200", enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
            </button>
          </label>

          {/* Brands list */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brands in this category</p>
            <div className="space-y-1.5">
              {brands.length === 0 && (
                <p className="rounded-xl border border-dashed border-border py-6 text-center text-[12px] text-muted-foreground">No brands yet.</p>
              )}
              {brands.map((b) => {
                const count = models.filter((m) => m.brandId === b.id).length;
                return (
                  <button
                    key={b.id}
                    onClick={() => onOpenModels(category.id, b.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/40"
                  >
                    {b.logoUrl ? (
                      <img src={b.logoUrl} alt={b.name} className="h-8 w-8 shrink-0 rounded-lg border border-border bg-white object-contain p-0.5" />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[11px] font-bold text-[#4361EE]">{b.name[0]?.toUpperCase()}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{b.name}</span>
                    <span className="text-[11px] text-muted-foreground">{count} models</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5 text-center">
      <Icon className="mx-auto h-4 w-4 text-muted-foreground" />
      <p className="mt-1 text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─── Create / Edit Drawer ───────────────────────────────────────── */
function CategoryDrawer({
  category,
  onClose,
  onSave,
}: {
  category: DeviceCategory | null;
  onClose: () => void;
  onSave: (data: { name: string; icon: string; enabled: boolean }) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "Box");
  const [enabled, setEnabled] = useState(category?.enabled ?? true);
  const Preview = CATEGORY_ICONS[icon] || Box;

  return (
    <Drawer
      open
      onClose={onClose}
      title={category ? "Edit Category" : "New Category"}
      subtitle="Categories are the top level of the device catalog."
      icon={Preview}
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), icon, enabled })}>
            {category ? "Save Changes" : "Create Category"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Category Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gaming Console" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Icon</Label>
          <Select value={icon} onChange={(e) => setIcon(e.target.value)} options={ICON_OPTIONS} />
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
              <Preview className="h-4 w-4" />
            </span>
            <span className="text-[12px] text-muted-foreground">Preview</span>
          </div>
        </div>
        <label className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-[13px] font-medium">Enabled</p>
            <p className="text-[11px] text-muted-foreground">Visible across modules when on.</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            role="switch"
            aria-checked={enabled}
            className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", enabled ? "bg-[#4361EE]" : "bg-zinc-300")}
          >
            <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200", enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
          </button>
        </label>
      </div>
    </Drawer>
  );
}
