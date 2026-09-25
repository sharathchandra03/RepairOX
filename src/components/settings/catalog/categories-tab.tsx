"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Pencil, Trash2, ArrowUpDown, ChevronRight, Building2, Layers, CheckCircle2, XCircle,
  GripVertical, ListOrdered, Check,
  Smartphone, Tablet, Laptop, Monitor, Watch, Headphones, Gamepad2, Plane, Box,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCatalog, sortCategories } from "@/lib/catalog-context";
import { useCatalogSelection } from "./catalog-selection";
import { ImageUpload } from "./image-upload";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import type { DeviceCategory } from "@/lib/price-list-data";

/** Icons offered for categories — must stay in sync with the shop browser's iconMap. */
export const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Smartphone, Tablet, Laptop, Monitor, Watch, Headphones, Gamepad2, Plane, Box,
};
const ICON_OPTIONS = Object.keys(CATEGORY_ICONS).map((k) => ({ label: k, value: k }));

export function CategoriesTab() {
  const { categories, brands, models, addCategory, updateCategory, deleteCategory, toggleCategory, reorderCategories } = useCatalog();
  const { openBrands, openModels } = useCatalogSelection();
  const { can } = usePermissions();
  // Reordering is a configure/manage action — the Device Catalog lives under
  // Settings → Inventory → Price List, so it reuses that edit capability.
  const canReorder = allow(can, CAP.settings.inventorySettings);
  const [search, setSearch] = useState("");
  // View sort for browse mode. "order" = the saved administrator order (the
  // default, matching Shop → Price List); "asc"/"desc" are optional A–Z/Z–A
  // view overrides that do NOT change the persisted order.
  const [viewSort, setViewSort] = useState<"order" | "asc" | "desc">("order");
  const [editing, setEditing] = useState<DeviceCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Reorder mode: the grid becomes a single-column draggable list whose order
  // is the administrator-defined display order. `draft` holds the working list
  // so a drag preview doesn't thrash the persisted order on every hover.
  const [reordering, setReordering] = useState(false);
  const [draft, setDraft] = useState<DeviceCategory[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  // Seed the draft from the persisted (sortOrder) order whenever reorder mode
  // opens or the underlying categories change while it's open.
  useEffect(() => {
    if (reordering) setDraft(sortCategories(categories));
  }, [reordering, categories]);

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

  // Browse mode rows. Defaults to the SAVED administrator order (sortCategories)
  // so the grid matches Shop → Price List after a reorder. A–Z / Z–A are
  // optional VIEW overrides that never change the persisted order.
  const rows = useMemo(() => {
    let list = viewSort === "order" ? sortCategories(categories) : [...categories];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (viewSort === "asc") list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    else if (viewSort === "desc") list.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: "base" }));
    return list;
  }, [categories, search, viewSort]);

  // Drag-and-drop reorder handlers (native HTML5 DnD — no extra dependency).
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setDraft((list) => {
      const from = list.findIndex((c) => c.id === dragId);
      const to = list.findIndex((c) => c.id === targetId);
      if (from === -1 || to === -1) return list;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const saveOrder = () => {
    reorderCategories(draft.map((c) => c.id));
    setReordering(false);
    setDragId(null);
  };

  const cancelReorder = () => {
    setReordering(false);
    setDragId(null);
  };

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
          {reordering ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={cancelReorder}>
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" className="gap-1.5 rounded-xl" onClick={saveOrder}>
                <Check className="h-3.5 w-3.5" /> Save Order
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => setViewSort((v) => (v === "order" ? "asc" : v === "asc" ? "desc" : "order"))}
                title="Cycle view: Saved order → A–Z → Z–A"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {viewSort === "order" ? "Saved order" : viewSort === "asc" ? "A–Z" : "Z–A"}
              </Button>
              {canReorder && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl"
                  onClick={() => setReordering(true)}
                  title="Set the order shown in Shop → Price List"
                >
                  <ListOrdered className="h-3.5 w-3.5" /> Reorder
                </Button>
              )}
              <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" /> New Category
              </Button>
            </>
          )}
        </div>
      </div>

      {reordering && (
        <div className="flex items-center gap-2 rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD] px-3.5 py-2.5 text-[12px] text-[#3049c9]">
          <GripVertical className="h-4 w-4 shrink-0" />
          <span>
            Drag categories to set the order shown in <strong>Shop → Price List</strong>. This order is saved for your whole organization.
          </span>
        </div>
      )}

      {/* Reorder list (drag handle + drag/drop) — the administrator-defined order */}
      {reordering ? (
        <div className="space-y-2">
          {draft.map((cat, index) => {
            const Icon = CATEGORY_ICONS[cat.icon] || Box;
            const s = stats.get(cat.id) ?? { brands: 0, models: 0, active: 0 };
            const isDragging = dragId === cat.id;
            return (
              <div
                key={cat.id}
                draggable
                onDragStart={() => setDragId(cat.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => { e.preventDefault(); handleDrop(cat.id); }}
                onDrop={(e) => { e.preventDefault(); handleDrop(cat.id); }}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 bg-[#F5F7FF] p-3 shadow-card transition hover:border-[#4361EE] hover:bg-[#EEF1FD]",
                  isDragging
                    ? "border-[#3049c9] opacity-70 ring-2 ring-[#4361EE]/25"
                    : "border-[#4361EE]/40"
                )}
              >
                <span className="grid h-8 w-8 shrink-0 cursor-grab place-items-center rounded-lg text-[#4361EE] hover:bg-[#E0E6FF] active:cursor-grabbing" title="Drag to reorder">
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#4361EE] text-[11px] font-bold tabular-nums text-white">
                  {index + 1}
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/50">
                  {cat.imageUrl ? (
                    <img src={cat.imageUrl} alt={cat.name} className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-4.5 w-4.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{cat.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    <span className="font-medium text-[#4361EE]">{s.brands}</span> brands ·{" "}
                    <span className="font-medium text-[#4361EE]">{s.models}</span> models
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      /* Grid */
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
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/50">
                  {cat.imageUrl ? (
                    <img src={cat.imageUrl} alt={cat.name} className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
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
      )}

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
          {/* Category Image */}
          {category.imageUrl && (
            <div className="grid place-items-center rounded-2xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
              <div className="grid h-32 w-full place-items-center overflow-hidden rounded-xl">
                <img src={category.imageUrl} alt={category.name} className="max-h-32 w-auto object-contain" />
              </div>
            </div>
          )}

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
  onSave: (data: { name: string; icon: string; enabled: boolean; imageUrl?: string }) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "Box");
  const [enabled, setEnabled] = useState(category?.enabled ?? true);
  const [imageUrl, setImageUrl] = useState(category?.imageUrl ?? "");
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
          <Button size="sm" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), icon, enabled, imageUrl: imageUrl || undefined })}>
            {category ? "Save Changes" : "Create Category"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Category Image</Label>
          <ImageUpload value={imageUrl} onChange={setImageUrl} size="lg" label="Shown across the price list & shop browser" />
        </div>
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
