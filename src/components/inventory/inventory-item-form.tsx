"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — CANONICAL Inventory Master item form (shared, single source).

   This is the ONE inventory create/edit field set + item-building logic. It is
   consumed by:
     • the full Inventory → Add Item page (app/(app)/inventory/add-item)
     • the "Add Inventory" modal opened from the Create Invoice → Products step
       (components/inventory/add-inventory-modal.tsx)

   Reusing this guarantees invoice-side inventory creation writes a REAL
   Inventory Master record with the same fields, categories, tax, HSN, stock
   levels, item type and DERIVED pricing (MRP / dealer / distributor / buying
   prices computed from Default Price) as the canonical page — never a
   miniature duplicate schema. Persistence is always the store's
   addInventoryItem / updateInventoryItem (DB-first); this component only
   collects + validates + builds the InventoryItem.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { Wand2, Package, IndianRupee, Boxes, Info } from "lucide-react";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import { SectionCard, HealthBadge } from "@/components/inventory/widgets";
import { InlineCombo } from "@/components/inventory/inline-combo";
import { CATEGORIES, UOMS, classifyStock, type InventoryItem } from "@/lib/inventory-data";

export type InventoryFormValues = {
  name: string;
  sku: string;
  type: string;
  mode: string;
  category: string;
  uom: string;
  defaultPrice: string;
  hsn: string;
  tax: string;
  currentStock: string;
  minStock: string;
  maxStock: string;
};

export function emptyInventoryForm(): InventoryFormValues {
  return {
    name: "", sku: "", type: "Product", mode: "Both", category: "", uom: "Piece",
    defaultPrice: "", hsn: "", tax: "18", currentStock: "", minStock: "", maxStock: "",
  };
}

export function inventoryFormFromItem(item: InventoryItem): InventoryFormValues {
  return {
    name: item.name,
    sku: item.id,
    type: item.type,
    mode: item.mode,
    category: item.category,
    uom: item.uom || "Piece",
    defaultPrice: String(item.defaultPrice || ""),
    hsn: item.hsnCode === "—" ? "" : item.hsnCode,
    tax: String(item.tax || "18"),
    currentStock: String(item.currentStock || ""),
    minStock: String(item.minStock || ""),
    maxStock: String(item.maxStock || ""),
  };
}

/** Validate the form. Returns an error message, or null when valid. */
export function validateInventoryForm(v: InventoryFormValues): string | null {
  if (!v.name.trim()) return "Item name is required";
  if (!v.category) return "Please select a category";
  return null;
}

/**
 * Build the persisted InventoryItem from the form values. Pricing tiers
 * (MRP / dealer / distributor / buying prices) are DERIVED from Default Price,
 * matching the canonical Add Item page exactly. `store` is the display label
 * only — real multi-store scoping is stamped via withStore() (branch_id) in the
 * store's addInventoryItem.
 */
export function buildInventoryItem(v: InventoryFormValues, opts?: { store?: string }): InventoryItem {
  const itemSku = v.sku || `SKU-${Date.now().toString().slice(-6)}`;
  const price = Number(v.defaultPrice || 0);
  return {
    id: itemSku,
    name: v.name.trim(),
    category: v.category,
    type: v.type as InventoryItem["type"],
    mode: v.mode as InventoryItem["mode"],
    uom: v.uom,
    store: opts?.store ?? "Main Store",
    active: true,
    currentStock: Number(v.currentStock || 0),
    defaultPrice: price,
    regularBuyingPrice: Math.round(price * 0.7),
    wholesaleBuyingPrice: Math.round(price * 0.65),
    regularSellingPrice: price,
    mrp: Math.round(price * 1.2),
    dealerPrice: Math.round(price * 0.9),
    distributorPrice: Math.round(price * 0.85),
    hsnCode: v.hsn || "—",
    tax: Number(v.tax || 18),
    minStock: Number(v.minStock || 0),
    maxStock: Number(v.maxStock || 0),
    reservedStock: 0,
    soldUnits: 0,
    purchasedUnits: 0,
  };
}

/** The item-update patch (for edit). Mirrors buildInventoryItem's fields. */
export function inventoryUpdateFromForm(v: InventoryFormValues): Partial<InventoryItem> {
  const price = Number(v.defaultPrice || 0);
  return {
    name: v.name.trim(),
    category: v.category,
    type: v.type as InventoryItem["type"],
    mode: v.mode as InventoryItem["mode"],
    uom: v.uom,
    active: true,
    currentStock: Number(v.currentStock || 0),
    defaultPrice: price,
    regularBuyingPrice: Math.round(price * 0.7),
    wholesaleBuyingPrice: Math.round(price * 0.65),
    regularSellingPrice: price,
    mrp: Math.round(price * 1.2),
    dealerPrice: Math.round(price * 0.9),
    distributorPrice: Math.round(price * 0.85),
    hsnCode: v.hsn || "—",
    tax: Number(v.tax || 18),
    minStock: Number(v.minStock || 0),
    maxStock: Number(v.maxStock || 0),
  };
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * The canonical inventory field set as reusable section cards. `variant`:
 *   • "page"  — used inside the full Add Item page (default).
 *   • "modal" — compact spacing for the Add Inventory modal.
 */
export function InventoryItemFields({
  values,
  onChange,
}: {
  values: InventoryFormValues;
  onChange: (patch: Partial<InventoryFormValues>) => void;
}) {
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [uoms, setUoms] = useState<string[]>(UOMS);
  const isService = values.type === "Service";

  const set = (patch: Partial<InventoryFormValues>) => onChange(patch);

  const health = useMemo(() => {
    const c = Number(values.currentStock || 0);
    const mn = Number(values.minStock || 0);
    const mx = Number(values.maxStock || 0);
    if (isService || (!values.minStock && !values.maxStock)) return null;
    return classifyStock(c, mn, mx || mn + 1);
  }, [values.currentStock, values.minStock, values.maxStock, isService]);

  function generateSku() {
    const base = (values.name || "ITM").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
    const n = (Date.now() % 10000).toString().padStart(4, "0");
    set({ sku: `${base}-${n}` });
  }

  return (
    <div className="space-y-4">
      <SectionCard icon={Package} title="Item Basics" description="Identity and classification" bodyClassName="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Item Name" required>
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. iPhone 15 Pro OLED Assembly" />
          </Field>
          <Field label="Item ID / SKU" hint="Leave blank to auto-generate">
            <div className="flex gap-2">
              <Input value={values.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="SKU-0001" className="font-mono" />
              <Button type="button" variant="soft" size="md" className="shrink-0 rounded-xl px-3" onClick={generateSku}>
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Product / Service">
            <SegmentedTabs
              className="w-full [&>button]:flex-1"
              options={[{ label: "Product", value: "Product" }, { label: "Service", value: "Service" }]}
              value={values.type}
              onChange={(v) => set({ type: v })}
            />
          </Field>
          <Field label="Buy / Sell / Both">
            <SegmentedTabs
              className="w-full [&>button]:flex-1"
              options={[{ label: "Buy", value: "Buy" }, { label: "Sell", value: "Sell" }, { label: "Both", value: "Both" }]}
              value={values.mode}
              onChange={(v) => set({ mode: v })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Item Category" required>
            <InlineCombo
              value={values.category}
              onChange={(v) => set({ category: v })}
              options={categories}
              onCreate={(n) => setCategories((c) => [n, ...c])}
              placeholder="Select or create category"
              createLabel="Create category"
            />
          </Field>
          <Field label="Unit of Measurement">
            <InlineCombo
              value={values.uom}
              onChange={(v) => set({ uom: v })}
              options={uoms}
              onCreate={(n) => setUoms((u) => [n, ...u])}
              placeholder="Select or create unit"
              createLabel="Create unit"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard icon={IndianRupee} title="Pricing & Tax" description="Default price and tax treatment" bodyClassName="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Default Price" required>
            <Input type="number" inputMode="decimal" value={values.defaultPrice} onChange={(e) => set({ defaultPrice: e.target.value })} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
          </Field>
          <Field label="HSN Code">
            <Input value={values.hsn} onChange={(e) => set({ hsn: e.target.value })} placeholder="8517xx" className="font-mono" />
          </Field>
          <Field label="Tax (GST)">
            <Select
              value={values.tax}
              onChange={(e) => set({ tax: e.target.value })}
              options={["0", "5", "12", "18", "28"].map((t) => ({ value: t, label: `${t}%` }))}
            />
          </Field>
        </div>
      </SectionCard>

      {!isService && (
        <SectionCard icon={Boxes} title="Stock Levels" description="Opening stock and reorder thresholds" bodyClassName="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Current Stock">
              <Input type="number" inputMode="numeric" value={values.currentStock} onChange={(e) => set({ currentStock: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Minimum Stock Level">
              <Input type="number" inputMode="numeric" value={values.minStock} onChange={(e) => set({ minStock: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Maximum Stock Level">
              <Input type="number" inputMode="numeric" value={values.maxStock} onChange={(e) => set({ maxStock: e.target.value })} placeholder="0" />
            </Field>
          </div>
          {health && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] text-muted-foreground">Projected stock status:</span>
              <HealthBadge health={health} />
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
