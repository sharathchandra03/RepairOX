"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Laptop, Trash, CheckSquare, Square, ChevronRight, Wrench } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageUpload } from "./image-upload";
import { useCatalog } from "@/lib/catalog-context";
import { useCatalogSelection } from "./catalog-selection";
import type { PriceListModel, DevicePart } from "@/lib/price-list-data";

export function ModelsTab() {
  const { categories, brands, models, parts, addModel, updateModel, deleteModel, bulkDeleteModels } = useCatalog();
  const { categoryId: selCat, brandId: selBrand, setCategory, setBrand, clearSelection, openParts } = useCatalogSelection();

  // No auto-fallback: each level stays empty until the user picks it.
  const categoryId = selCat ?? "";
  const brandsInCat = useMemo(() => brands.filter((b) => b.categoryId === categoryId), [brands, categoryId]);
  const effectiveBrandId = (selBrand && brandsInCat.some((b) => b.id === selBrand)) ? selBrand : "";

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PriceListModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const rows = useMemo(() => {
    let list = models.filter((m) => m.brandId === effectiveBrandId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q) || (m.chip ?? "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
  }, [models, effectiveBrandId, search]);

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c.id }));
  const brandOptions = brandsInCat.map((b) => ({ label: b.name, value: b.id }));
  const deleteTarget = models.find((m) => m.id === deleteId);
  const detailModel = models.find((m) => m.id === detailId) ?? null;
  const partCountByModel = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parts) m.set(p.modelId, (m.get(p.modelId) ?? 0) + 1);
    return m;
  }, [parts]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Select value={categoryId} onChange={(e) => setCategory(e.target.value)} options={categoryOptions} placeholder="Choose category…" />
          </div>
          <div className="w-44">
            <Select value={effectiveBrandId} onChange={(e) => setBrand(e.target.value)} options={brandOptions} placeholder="Choose brand…" disabled={!categoryId} />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              disabled={!effectiveBrandId}
              className="h-9 w-52 rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {categoryId && (
            <button onClick={clearSelection} className="text-[12px] font-medium text-muted-foreground hover:text-foreground">Clear</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setConfirmBulk(true)}>
              <Trash className="h-3.5 w-3.5" /> Delete ({selected.size})
            </Button>
          )}
          <Button size="sm" className="gap-1.5 rounded-xl" disabled={!effectiveBrandId} onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New Model
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-10 py-3 pl-4">
                <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                  {allSelected ? <CheckSquare className="h-4 w-4 text-[#4361EE]" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">Model</th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">Year</th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">Parts</th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">Status</th>
              <th className="w-24 py-3 px-3 font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} onClick={() => setDetailId(m.id)} className="cursor-pointer border-b border-border/60 hover:bg-brand-50/30 transition-colors">
                <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => toggleSelect(m.id)} className="text-muted-foreground hover:text-foreground">
                    {selected.has(m.id) ? <CheckSquare className="h-4 w-4 text-[#4361EE]" /> : <Square className="h-4 w-4" />}
                  </button>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt={m.name} className="h-full w-full object-contain" />
                      ) : (
                        <Laptop className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.name}</p>
                      {m.variant && <p className="text-[11px] text-muted-foreground">{m.variant}</p>}
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">{m.year}</td>
                <td className="py-2.5 px-3 text-muted-foreground">
                  <span className="font-medium text-[#4361EE]">{partCountByModel.get(m.id) ?? 0}</span> parts
                </td>
                <td className="py-2.5 px-3">
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    m.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                  )}>
                    {m.status === "active" ? "Active" : "Discontinued"}
                  </span>
                </td>
                <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(m)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(m.id)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {!categoryId
                    ? "Choose a category, then a brand, to manage models."
                    : !effectiveBrandId
                      ? "Choose a brand to see its models."
                      : "No models found. Add one to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      <ModelDetailDrawer
        model={detailModel}
        categoryName={categories.find((c) => c.id === detailModel?.categoryId)?.name ?? ""}
        brandName={brands.find((b) => b.id === detailModel?.brandId)?.name ?? ""}
        parts={detailModel ? parts.filter((p) => p.modelId === detailModel.id) : []}
        onClose={() => setDetailId(null)}
        onEdit={(m) => { setDetailId(null); setEditing(m); }}
        onDelete={(id) => { setDetailId(null); setDeleteId(id); }}
        onManageParts={(m) => { setDetailId(null); openParts(m.categoryId, m.brandId, m.id); }}
      />

      {(creating || editing) && (
        <ModelDrawer
          model={editing}
          categoryId={categoryId}
          brandId={effectiveBrandId}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) updateModel(editing.id, data);
            else addModel({ ...data, brandId: effectiveBrandId, categoryId });
            setCreating(false); setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteModel(deleteId); setDeleteId(null); }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will also remove all parts and pricing for this model. This cannot be undone."
        confirmLabel="Delete Model"
      />
      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => { bulkDeleteModels(Array.from(selected)); setSelected(new Set()); setConfirmBulk(false); }}
        title={`Delete ${selected.size} models?`}
        description="All selected models and their parts will be permanently removed."
        confirmLabel="Delete Selected"
      />
    </div>
  );
}

/* ─── Model Detail Drawer (drill-down) ───────────────────────────── */
function ModelDetailDrawer({
  model, categoryName, brandName, parts, onClose, onEdit, onDelete, onManageParts,
}: {
  model: PriceListModel | null;
  categoryName: string;
  brandName: string;
  parts: DevicePart[];
  onClose: () => void;
  onEdit: (m: PriceListModel) => void;
  onDelete: (id: string) => void;
  onManageParts: (m: PriceListModel) => void;
}) {
  return (
    <Drawer
      open={!!model}
      onClose={onClose}
      title={model?.name ?? "Model"}
      subtitle={brandName ? `${brandName}${categoryName ? ` · ${categoryName}` : ""}` : "Model"}
      icon={Laptop}
      width="max-w-lg"
      footer={model ? (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" className="text-rose-600" onClick={() => onDelete(model.id)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(model)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <Button size="sm" onClick={() => onManageParts(model)}>Manage parts <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ) : undefined}
    >
      {model && (
        <div className="space-y-4">
          {/* Image */}
          <div className="grid place-items-center rounded-2xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="grid h-40 w-full place-items-center overflow-hidden rounded-xl">
              {model.imageUrl
                ? <img src={model.imageUrl} alt={model.name} className="max-h-40 w-auto object-contain" />
                : <Laptop className="h-16 w-16 text-blue-400/80" />}
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-xl border border-border divide-y divide-border px-4">
            <DetailRow label="Brand">{brandName || "—"}</DetailRow>
            <DetailRow label="Category">{categoryName || "—"}</DetailRow>
            <DetailRow label="Year">{model.year || "—"}</DetailRow>
            {model.variant && <DetailRow label="Variant">{model.variant}</DetailRow>}
            {model.chip && <DetailRow label="Chip">{model.chip}</DetailRow>}
            {model.storage && <DetailRow label="Storage">{model.storage}</DetailRow>}
            {model.displaySize && <DetailRow label="Display">{model.displaySize}</DetailRow>}
            <DetailRow label="Status">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", model.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600")}>
                {model.status === "active" ? "Active" : "Discontinued"}
              </span>
            </DetailRow>
            {model.meta && Object.entries(model.meta).map(([k, v]) => <DetailRow key={k} label={k}>{v}</DetailRow>)}
          </div>

          {/* Parts & pricing */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Parts & pricing</p>
              <span className="text-[11px] text-muted-foreground">{parts.length} part{parts.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              {parts.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-muted-foreground">No parts yet.</p>
              ) : (
                <table className="w-full text-left text-[12px]">
                  <tbody>
                    {parts.map((p) => (
                      <tr key={p.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pl-3 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/40">
                              {p.imageUrl ? <img src={p.imageUrl} alt={p.partName} className="h-full w-full object-cover" /> : <Wrench className="h-3 w-3 text-muted-foreground/50" />}
                            </span>
                            <span className="font-medium">{p.partName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-semibold tabular-nums">{p.priceKnown === false ? "N/A" : formatINR(p.price)}</td>
                        <td className="py-2 pr-3 pl-2 text-right text-muted-foreground">{p.warranty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ─── Create / Edit Drawer ───────────────────────────────────────── */
function ModelDrawer({
  model,
  onClose,
  onSave,
}: {
  model: PriceListModel | null;
  categoryId: string;
  brandId: string;
  onClose: () => void;
  onSave: (data: Partial<PriceListModel> & { name: string }) => void;
}) {
  const [form, setForm] = useState({
    name: model?.name ?? "",
    year: String(model?.year ?? new Date().getFullYear()),
    variant: model?.variant ?? "",
    chip: model?.chip ?? "",
    storage: model?.storage ?? "",
    displaySize: model?.displaySize ?? "",
    status: model?.status ?? "active",
    imageUrl: model?.imageUrl ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Drawer
      open
      onClose={onClose}
      title={model ? "Edit Model" : "New Model"}
      subtitle="The device image shown here appears automatically across RepairOX."
      icon={Laptop}
      width="max-w-lg"
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.name.trim()} onClick={() => onSave({
            name: form.name.trim(),
            year: parseInt(form.year, 10) || new Date().getFullYear(),
            modelYear: parseInt(form.year, 10) || undefined,
            variant: form.variant || undefined,
            chip: form.chip || undefined,
            storage: form.storage || undefined,
            displaySize: form.displaySize || undefined,
            status: form.status as PriceListModel["status"],
            imageUrl: form.imageUrl || undefined,
          })}>
            {model ? "Save Changes" : "Create Model"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Device Image</Label>
          <ImageUpload value={form.imageUrl} onChange={(v) => set("imageUrl", v)} size="lg" label="Any image format · fills the hero card & model list" />
        </div>
        <div className="space-y-1.5">
          <Label>Model Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. MacBook Air M3" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2024" />
          </div>
          <div className="space-y-1.5">
            <Label>Variant</Label>
            <Input value={form.variant} onChange={(e) => set("variant", e.target.value)} placeholder="Pro, Ultra, Base" />
          </div>
          <div className="space-y-1.5">
            <Label>Chip / Processor</Label>
            <Input value={form.chip} onChange={(e) => set("chip", e.target.value)} placeholder="Apple M3" />
          </div>
          <div className="space-y-1.5">
            <Label>Storage (Base)</Label>
            <Input value={form.storage} onChange={(e) => set("storage", e.target.value)} placeholder="256GB" />
          </div>
          <div className="space-y-1.5">
            <Label>Display Size</Label>
            <Input value={form.displaySize} onChange={(e) => set("displaySize", e.target.value)} placeholder="13.6 inch" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)} options={[
              { label: "Active", value: "active" },
              { label: "Discontinued", value: "discontinued" },
            ]} />
          </div>
        </div>
      </div>
    </Drawer>
  );
}
