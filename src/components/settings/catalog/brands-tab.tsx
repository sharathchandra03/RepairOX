"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Building2, ChevronRight, Layers, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageUpload } from "./image-upload";
import { useCatalog } from "@/lib/catalog-context";
import { useCatalogSelection } from "./catalog-selection";
import type { PriceListBrand, PriceListModel } from "@/lib/price-list-data";

export function BrandsTab() {
  const { categories, brands, models, addBrand, updateBrand, deleteBrand } = useCatalog();
  const { categoryId: selCategoryId, setCategory, clearSelection, openModels, openParts } = useCatalogSelection();
  // No auto-fallback: empty until the user picks a category.
  const categoryId = selCategoryId ?? "";

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PriceListBrand | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c.id }));

  const modelCountByBrand = useMemo(() => {
    const m = new Map<string, number>();
    for (const mo of models) m.set(mo.brandId, (m.get(mo.brandId) ?? 0) + 1);
    return m;
  }, [models]);

  const rows = useMemo(() => {
    let list = brands.filter((b) => b.categoryId === categoryId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [brands, categoryId, search]);

  const deleteTarget = brands.find((b) => b.id === deleteId);
  const detailBrand = brands.find((b) => b.id === detailId) ?? null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="w-48">
            <Select value={categoryId} onChange={(e) => setCategory(e.target.value)} options={categoryOptions} placeholder="Choose category…" />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands..."
              disabled={!categoryId}
              className="h-9 w-56 rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {categoryId && (
            <button onClick={clearSelection} className="text-[12px] font-medium text-muted-foreground hover:text-foreground">Clear</button>
          )}
        </div>
        <Button size="sm" className="gap-1.5 rounded-xl" disabled={!categoryId} onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> New Brand
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((brand) => (
          <div
            key={brand.id}
            onClick={() => setDetailId(brand.id)}
            className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-card transition hover:border-[#4361EE]/40 hover:shadow-card-hover"
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-11 w-11 shrink-0 rounded-xl object-contain border border-border bg-white p-1" />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] text-sm font-bold ring-1 ring-inset ring-[#B3BFF6]/50">
                {brand.name[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{brand.name}</p>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-[#4361EE]">{modelCountByBrand.get(brand.id) ?? 0}</span> models
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); setEditing(brand); }} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setDeleteId(brand.id); }} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border py-12 text-center">
            <Building2 className="mx-auto h-7 w-7 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">
              {categoryId ? "No brands in this category yet." : "Choose a category to see its brands."}
            </p>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <BrandDetailDrawer
        brand={detailBrand}
        categoryName={categories.find((c) => c.id === detailBrand?.categoryId)?.name ?? ""}
        models={detailBrand ? models.filter((m) => m.brandId === detailBrand.id) : []}
        onClose={() => setDetailId(null)}
        onEdit={(b) => { setDetailId(null); setEditing(b); }}
        onDelete={(id) => { setDetailId(null); setDeleteId(id); }}
        onManageModels={(b) => { setDetailId(null); openModels(b.categoryId, b.id); }}
        onOpenModelParts={(b, modelId) => { setDetailId(null); openParts(b.categoryId, b.id, modelId); }}
      />

      {(creating || editing) && (
        <BrandDrawer
          brand={editing}
          categoryId={categoryId}
          categoryOptions={categoryOptions}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) updateBrand(editing.id, data);
            else addBrand({ ...data });
            setCreating(false); setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteBrand(deleteId); setDeleteId(null); }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will also remove all models and parts under this brand. This cannot be undone."
        confirmLabel="Delete Brand"
      />
    </div>
  );
}

/* ─── Brand Detail Drawer (drill-down) ───────────────────────────── */
function BrandDetailDrawer({
  brand, categoryName, models, onClose, onEdit, onDelete, onManageModels, onOpenModelParts,
}: {
  brand: PriceListBrand | null;
  categoryName: string;
  models: PriceListModel[];
  onClose: () => void;
  onEdit: (b: PriceListBrand) => void;
  onDelete: (id: string) => void;
  onManageModels: (b: PriceListBrand) => void;
  onOpenModelParts: (b: PriceListBrand, modelId: string) => void;
}) {
  const active = models.filter((m) => m.status === "active").length;
  return (
    <Drawer
      open={!!brand}
      onClose={onClose}
      title={brand?.name ?? "Brand"}
      subtitle={categoryName ? `Brand · ${categoryName}` : "Brand"}
      icon={Building2}
      width="max-w-md"
      footer={brand ? (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" className="text-rose-600" onClick={() => onDelete(brand.id)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(brand)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <Button size="sm" onClick={() => onManageModels(brand)}>Manage models <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ) : undefined}
    >
      {brand && (
        <div className="space-y-4">
          {/* Identity */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-14 w-14 rounded-xl border border-border bg-white object-contain p-1" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-[#EEF1FD] text-lg font-bold text-[#4361EE]">{brand.name[0]?.toUpperCase()}</span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{brand.name}</p>
              <p className="text-[12px] text-muted-foreground">Category: <span className="font-medium text-foreground">{categoryName || "—"}</span></p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <MiniStat icon={Layers} label="Models" value={models.length} />
            <MiniStat icon={CheckCircle2} label="Active" value={active} />
          </div>

          {/* Models list */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Models under this brand</p>
            <div className="space-y-1.5">
              {models.length === 0 && (
                <p className="rounded-xl border border-dashed border-border py-6 text-center text-[12px] text-muted-foreground">No models yet.</p>
              )}
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onOpenModelParts(brand, m.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/40"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                    {m.imageUrl ? <img src={m.imageUrl} alt={m.name} className="h-full w-full object-contain" /> : <Layers className="h-4 w-4 text-muted-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{m.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{m.year}{m.variant ? ` · ${m.variant}` : ""}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5 text-center">
      <Icon className="mx-auto h-4 w-4 text-muted-foreground" />
      <p className="mt-1 text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─── Create / Edit Drawer ───────────────────────────────────────── */
function BrandDrawer({
  brand,
  categoryId,
  categoryOptions,
  onClose,
  onSave,
}: {
  brand: PriceListBrand | null;
  categoryId: string;
  categoryOptions: { label: string; value: string }[];
  onClose: () => void;
  onSave: (data: { name: string; categoryId: string; logoUrl?: string }) => void;
}) {
  const [name, setName] = useState(brand?.name ?? "");
  const [cat, setCat] = useState(brand?.categoryId ?? categoryId);
  const [logoUrl, setLogoUrl] = useState(brand?.logoUrl ?? "");

  return (
    <Drawer
      open
      onClose={onClose}
      title={brand ? "Edit Brand" : "New Brand"}
      subtitle="Every brand belongs to one category."
      icon={Building2}
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!name.trim() || !cat} onClick={() => onSave({ name: name.trim(), categoryId: cat, logoUrl: logoUrl || undefined })}>
            {brand ? "Save Changes" : "Create Brand"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Brand Logo</Label>
          <ImageUpload value={logoUrl} onChange={setLogoUrl} maxDimension={512} label="Any image format — auto-optimized" />
        </div>
        <div className="space-y-1.5">
          <Label>Brand Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Apple, Samsung" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} options={categoryOptions} />
        </div>
      </div>
    </Drawer>
  );
}
