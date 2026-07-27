"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Wrench } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, NumericInput } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageUpload } from "./image-upload";
import { useCatalog } from "@/lib/catalog-context";
import { useCatalogSelection } from "./catalog-selection";
import type { DevicePart } from "@/lib/price-list-data";

const WARRANTY_OPTIONS = ["1 Month", "3 Months", "6 Months", "1 Year"].map((w) => ({ label: w, value: w }));
const AVAILABILITY_OPTIONS = ["In Stock", "Limited", "Out of Stock"].map((a) => ({ label: a, value: a }));

export function PartsTab() {
  const { categories, brands, models, parts, addPart, updatePart, deletePart } = useCatalog();
  const { categoryId: selCat, brandId: selBrand, modelId: selModel, setCategory, setBrand, setModel, clearSelection } = useCatalogSelection();

  // No auto-fallback: category → brand → model each stay empty until chosen.
  const categoryId = selCat ?? "";
  const brandsInCat = useMemo(() => brands.filter((b) => b.categoryId === categoryId), [brands, categoryId]);
  const effectiveBrandId = (selBrand && brandsInCat.some((b) => b.id === selBrand)) ? selBrand : "";
  const modelsInBrand = useMemo(() => models.filter((m) => m.brandId === effectiveBrandId), [models, effectiveBrandId]);
  const effectiveModelId = (selModel && modelsInBrand.some((m) => m.id === selModel)) ? selModel : "";

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DevicePart | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const rows = useMemo(() => {
    let list = parts.filter((p) => p.modelId === effectiveModelId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.partName.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q));
    }
    return list;
  }, [parts, effectiveModelId, search]);

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c.id }));
  const brandOptions = brandsInCat.map((b) => ({ label: b.name, value: b.id }));
  const modelOptions = modelsInBrand.map((m) => ({ label: `${m.name} (${m.year})`, value: m.id }));
  const deleteTarget = parts.find((p) => p.id === deleteId);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40"><Select value={categoryId} onChange={(e) => setCategory(e.target.value)} options={categoryOptions} placeholder="Choose category…" /></div>
          <div className="w-40"><Select value={effectiveBrandId} onChange={(e) => setBrand(e.target.value)} options={brandOptions} placeholder="Choose brand…" disabled={!categoryId} /></div>
          <div className="w-52"><Select value={effectiveModelId} onChange={(e) => setModel(e.target.value)} options={modelOptions} placeholder="Choose model…" disabled={!effectiveBrandId} /></div>
          {categoryId && (
            <button onClick={clearSelection} className="text-[12px] font-medium text-muted-foreground hover:text-foreground">Clear</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search parts..."
              disabled={!effectiveModelId}
              className="h-9 w-48 rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button size="sm" className="gap-1.5 rounded-xl" disabled={!effectiveModelId} onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New Part
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="py-3 pl-5 px-3 font-semibold text-muted-foreground">Part Name</th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">SKU</th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">Price</th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">Warranty</th>
              <th className="py-3 px-3 font-semibold text-muted-foreground">Availability</th>
              <th className="w-24 py-3 px-3 font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border/60 hover:bg-brand-50/30 transition-colors">
                <td className="py-2.5 pl-5 px-3 font-medium">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted/40">
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.partName} className="h-full w-full object-cover" /> : <Wrench className="h-3.5 w-3.5 text-muted-foreground/50" />}
                    </span>
                    <span>{p.partName}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 font-mono text-[12px] text-muted-foreground">{p.partNumber || "—"}</td>
                <td className="py-2.5 px-3 font-semibold">{formatINR(p.price)}</td>
                <td className="py-2.5 px-3 text-muted-foreground">{p.warranty}</td>
                <td className="py-2.5 px-3">
                  <span className={cn(
                    "inline-flex items-center gap-1 text-[12px] font-medium",
                    p.availability === "In Stock" && "text-emerald-600",
                    p.availability === "Limited" && "text-amber-600",
                    p.availability === "Out of Stock" && "text-rose-600",
                  )}>
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      p.availability === "In Stock" && "bg-emerald-500",
                      p.availability === "Limited" && "bg-amber-500",
                      p.availability === "Out of Stock" && "bg-rose-500",
                    )} />
                    {p.availability}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(p)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(p.id)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {!categoryId
                    ? "Choose a category, brand and model to manage parts."
                    : !effectiveBrandId
                      ? "Choose a brand, then a model."
                      : !effectiveModelId
                        ? "Choose a model to manage its parts."
                        : "No parts found. Add one to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <PartDrawer
          part={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) updatePart(editing.id, data);
            else addPart({ ...data, modelId: effectiveModelId });
            setCreating(false); setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deletePart(deleteId); setDeleteId(null); }}
        title={`Delete "${deleteTarget?.partName}"?`}
        description="This part and its price will be permanently removed from this model."
        confirmLabel="Delete Part"
      />
    </div>
  );
}

/* ─── Create / Edit Drawer ───────────────────────────────────────── */
function PartDrawer({
  part,
  onClose,
  onSave,
}: {
  part: DevicePart | null;
  onClose: () => void;
  onSave: (data: Partial<DevicePart> & { partName: string }) => void;
}) {
  const [partName, setPartName] = useState(part?.partName ?? "");
  const [partNumber, setPartNumber] = useState(part?.partNumber ?? "");
  const [price, setPrice] = useState(part?.price ?? 0);
  const [warranty, setWarranty] = useState(part?.warranty ?? "1 Month");
  const [availability, setAvailability] = useState<DevicePart["availability"]>(part?.availability ?? "In Stock");
  const [imageUrl, setImageUrl] = useState(part?.imageUrl ?? "");

  return (
    <Drawer
      open
      onClose={onClose}
      title={part ? "Edit Part" : "New Part"}
      subtitle="Parts and prices are branch-specific."
      icon={Wrench}
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!partName.trim()} onClick={() => onSave({ partName: partName.trim(), partNumber, price, warranty, availability, imageUrl: imageUrl || undefined })}>
            {part ? "Save Changes" : "Create Part"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Part Image</Label>
          <ImageUpload value={imageUrl} onChange={setImageUrl} size="lg" label="Shown to customers in the Price List" />
        </div>
        <div className="space-y-1.5">
          <Label>Part Name</Label>
          <Input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="e.g. Display Assembly" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Part Number / SKU</Label>
            <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="661-28751" />
          </div>
          <div className="space-y-1.5">
            <Label>Price (INR)</Label>
            <NumericInput value={price} onChange={setPrice} min={0} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Warranty</Label>
            <Select value={warranty} onChange={(e) => setWarranty(e.target.value)} options={WARRANTY_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label>Availability</Label>
            <Select value={availability} onChange={(e) => setAvailability(e.target.value as DevicePart["availability"])} options={AVAILABILITY_OPTIONS} />
          </div>
        </div>
      </div>
    </Drawer>
  );
}
