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
   levels and Item Type as the canonical page — never a miniature duplicate
   schema. Persistence is always the store's addInventoryItem /
   updateInventoryItem (DB-first); this component only collects + validates +
   builds the InventoryItem.

   Costing redesign (inv-design §2):
     • ONE Item Type control — Part / Product (part) vs Repair Service / Labour
       (service) — replaces the old Product/Service + Buy/Sell/Both tabs.
     • Explicit Cost Price (CP) + Selling Price (SP) on parts (+ Advanced
       Pricing: MRP / wholesale / dealer / distributor, stored verbatim — NO
       synthetic multiplier derivation); Service Charge + Standard Labour Cost
       on services. No price tier is ever derived from another.
     • CP / Standard Labour Cost persist to the cost-scoped inventory_item_costs
       table via the `cost` side-channel (never to inventory_items). The
       "configured" flag is a STRING-TRIM test ("0" ⇒ configured ₹0, "" ⇒ no
       cost ⇒ "not configured"), so a cost figure is never fabricated.
     • Opening stock flows ONLY through the `opening = {qty, unitCost}` channel
       → ledger layer; the built item carries 0 stock. Services never track
       stock.
     • buildInventoryItem returns { item, cost?, opening? };
       inventoryUpdateFromForm returns { patch, cost? }.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Wand2, Package, IndianRupee, Boxes, Info, Wrench, Lock, ChevronDown } from "lucide-react";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import { SectionCard, HealthBadge } from "@/components/inventory/widgets";
import { InlineCombo } from "@/components/inventory/inline-combo";
import { CATEGORIES, UOMS, classifyStock, type InventoryItem } from "@/lib/inventory-data";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";

/* The cost side-channel shape consumed by addInventoryItem / updateInventoryItem
   (store.tsx). CP and Standard Labour Cost persist here, NEVER on the broadly
   readable inventory_items row (inv-design §2.1a). */
export type InventoryCostInput = { costPrice: number; standardLabourCost: number; configured: boolean };
/* Opening-stock side-channel → one ledger layer + Inward movement (parts only). */
export type InventoryOpeningInput = { qty: number; unitCost: number };

export type InventoryFormValues = {
  // identity
  kind: "part" | "service";            // NEW Item Type source of truth; drives field rendering
  itemCode: string;                    // read-only; blank on create → server stamps PRT-000001
  serviceCode: string;                 // read-only; blank on create → server stamps SRV-000001
  name: string;
  sku: string;                         // optional external ref (NOT the id for new parts)
  barcode: string;                     // optional
  description: string;
  category: string;
  brandModel: string;                  // optional
  uom: string;                         // UoM (part) / billing basis (service)
  // pricing — part
  costPrice: string;                   // CP → inventory_item_costs (§2.1a)
  sellingPrice: string;
  mrp: string;
  wholesaleBuyingPrice: string;
  dealerPrice: string;
  distributorPrice: string;
  // pricing — service
  serviceCharge: string;
  standardLabourCost: string;          // → inventory_item_costs (§2.1a)
  // tax
  hsn: string;
  tax: string;
  // stock — part (CREATE ONLY for opening — §2.4)
  trackStock: boolean;
  currentStock: string;                // = Opening Quantity on CREATE only
  openingUnitCost: string;             // Opening Stock Unit Cost (create only)
  minStock: string;
  maxStock: string;
  store: string;
  // internal
  mode: string;                        // retained, hidden, defaulted "Both"
};

export function emptyInventoryForm(): InventoryFormValues {
  return {
    kind: "part",
    itemCode: "", serviceCode: "",
    name: "", sku: "", barcode: "", description: "", category: "", brandModel: "",
    uom: "Piece",
    costPrice: "", sellingPrice: "", mrp: "", wholesaleBuyingPrice: "", dealerPrice: "", distributorPrice: "",
    serviceCharge: "", standardLabourCost: "",
    hsn: "", tax: "18",
    trackStock: true, currentStock: "", openingUnitCost: "", minStock: "", maxStock: "", store: "",
    mode: "Both",
  };
}

export function inventoryFormFromItem(item: InventoryItem): InventoryFormValues {
  const kind = item.kind ?? (item.type === "Service" ? "service" : "part");
  const numOrBlank = (n: number | undefined) => (n === undefined || n === null ? "" : String(n || ""));
  return {
    kind,
    itemCode: item.itemCode ?? "",
    serviceCode: item.serviceCode ?? "",
    name: item.name,
    sku: item.id,
    barcode: item.barcode ?? "",
    description: item.description ?? "",
    category: item.category,
    brandModel: item.brandModel ?? "",
    uom: item.uom || "Piece",
    // Cost fields are undefined for a non-cost user (RLS returns no row) ⇒ blank + masked.
    costPrice: numOrBlank(item.costPrice),
    sellingPrice: numOrBlank(item.sellingPrice ?? item.regularSellingPrice),
    mrp: numOrBlank(item.mrp),
    wholesaleBuyingPrice: numOrBlank(item.wholesaleBuyingPrice),
    dealerPrice: numOrBlank(item.dealerPrice),
    distributorPrice: numOrBlank(item.distributorPrice),
    serviceCharge: numOrBlank(item.serviceCharge ?? item.regularSellingPrice),
    standardLabourCost: numOrBlank(item.standardLabourCost),
    hsn: item.hsnCode === "—" ? "" : (item.hsnCode ?? ""),
    tax: String(item.tax || "18"),
    // On edit the opening fields are NOT re-editable (stock changes only via
    // Purchase/Stock In). currentStock is shown read-only; no openingUnitCost.
    trackStock: item.trackStock ?? (kind === "part"),
    currentStock: String(item.currentStock || ""),
    openingUnitCost: "",
    minStock: String(item.minStock || ""),
    maxStock: String(item.maxStock || ""),
    store: item.store || "",
    mode: item.mode || "Both",
  };
}

/** Validate the form. Returns an error message, or null when valid.
 *  `0` / `₹0` remain valid (design-system rule); only negatives and an opening
 *  quantity entered without an opening unit cost are rejected (FR-6, AC-8). */
export function validateInventoryForm(v: InventoryFormValues): string | null {
  if (!v.name.trim()) return "Item name is required";
  if (!v.category) return "Please select a category";
  if (v.kind === "part") {
    if (v.sellingPrice !== "" && Number(v.sellingPrice) < 0) return "Selling Price can't be negative";
    if (v.costPrice !== "" && Number(v.costPrice) < 0) return "Cost Price can't be negative";
    if (v.trackStock && v.currentStock !== "" && Number(v.currentStock) > 0 && v.openingUnitCost === "")
      return "Enter the Opening Stock Unit Cost for the opening quantity";
  } else {
    if (v.serviceCharge !== "" && Number(v.serviceCharge) < 0) return "Service Charge can't be negative";
    if (v.standardLabourCost !== "" && Number(v.standardLabourCost) < 0) return "Standard Labour Cost can't be negative";
  }
  return null;
}

/* The "was a cost entered?" test is a STRING-TRIM test, NOT a numeric test, so
   "0" ⇒ configured ₹0 and "" ⇒ no cost / not-configured (inv-design §2.1a). */
function buildCost(v: InventoryFormValues): InventoryCostInput | undefined {
  const field = v.kind === "service" ? v.standardLabourCost : v.costPrice;
  if (field.trim() === "") return undefined;
  return {
    costPrice: v.kind === "part" ? Number(v.costPrice || 0) : 0,
    standardLabourCost: v.kind === "service" ? Number(v.standardLabourCost || 0) : 0,
    configured: true,
  };
}

/**
 * Build the persisted InventoryItem + optional cost/opening side-channels from
 * the form values. NO price tier is derived from another — CP, SP and each
 * advanced tier are independent stored values (inv-design §2.1a/§2.4). `store`
 * is the display label only; real multi-store scoping is stamped via
 * withStore() (branch_id) in the store's addInventoryItem.
 */
export function buildInventoryItem(
  v: InventoryFormValues,
  opts?: { store?: string },
): { item: InventoryItem; cost?: InventoryCostInput; opening?: InventoryOpeningInput } {
  const isService = v.kind === "service";
  // id = user SKU, or a widened collision-safe fallback (NEVER PRT-<ts> — the
  // sequential code is item_code/service_code, server-stamped on insert, §2.4).
  const rand4 = Math.random().toString(36).slice(2, 6);
  const id = v.sku.trim() || `SKU-${Date.now()}-${rand4}`;
  const sp = isService ? Number(v.serviceCharge || 0) : Number(v.sellingPrice || 0);

  const item: InventoryItem = {
    id,
    kind: v.kind,
    name: v.name.trim(),
    category: v.category,
    type: isService ? "Service" : "Product",
    mode: "Both",
    uom: v.uom,
    store: opts?.store ?? "Main Store",
    active: true,
    // Opening stock never flows through item.currentStock — it is posted as a
    // ledger layer via the `opening` channel and set on the row by the store.
    currentStock: 0,
    // Public pricing. SP mirrors legacy regularSellingPrice/defaultPrice so
    // existing readers (owner stock value) keep working; advanced tiers are
    // stored EXACTLY as entered (no SP*multiplier derivation).
    defaultPrice: sp,
    regularSellingPrice: sp,
    sellingPrice: isService ? undefined : sp,
    serviceCharge: isService ? sp : undefined,
    // regularBuyingPrice is retained on the row but is NO LONGER the cost source
    // — 0 on new rows (never SP*0.7).
    regularBuyingPrice: 0,
    wholesaleBuyingPrice: isService ? 0 : Number(v.wholesaleBuyingPrice || 0),
    mrp: isService ? 0 : Number(v.mrp || 0),
    dealerPrice: isService ? 0 : Number(v.dealerPrice || 0),
    distributorPrice: isService ? 0 : Number(v.distributorPrice || 0),
    hsnCode: v.hsn || "—",
    tax: Number(v.tax || 18),
    minStock: isService ? 0 : Number(v.minStock || 0),
    maxStock: isService ? 0 : Number(v.maxStock || 0),
    reservedStock: 0,
    soldUnits: 0,
    purchasedUnits: 0,
    barcode: v.barcode.trim() || undefined,
    brandModel: v.brandModel.trim() || undefined,
    description: v.description.trim() || undefined,
    trackStock: isService ? false : v.trackStock,
  };

  const cost = buildCost(v);
  const openingQty = Number(v.currentStock || 0);
  const opening: InventoryOpeningInput | undefined =
    !isService && item.trackStock && openingQty > 0
      ? { qty: openingQty, unitCost: Number(v.openingUnitCost || 0) }
      : undefined;

  return { item, cost, opening };
}

/** The item-update patch (for edit) + optional cost side-channel (§2.4).
 *  Omits immutable item/service codes, stock and opening; never returns an
 *  opening layer. SYS-6 — an ordinary edit NEVER touches migration_flag and
 *  NEVER zeroes a flagged service's preserved stray min/max; the flag is cleared
 *  only through the dedicated reconcileMigrationFlag path. */
export function inventoryUpdateFromForm(
  v: InventoryFormValues,
): { patch: Partial<InventoryItem>; cost?: InventoryCostInput } {
  const isService = v.kind === "service";
  const sp = isService ? Number(v.serviceCharge || 0) : Number(v.sellingPrice || 0);
  const patch: Partial<InventoryItem> = {
    kind: v.kind,
    name: v.name.trim(),
    category: v.category,
    type: isService ? "Service" : "Product",
    mode: "Both",
    uom: v.uom,
    active: true,
    defaultPrice: sp,
    regularSellingPrice: sp,
    sellingPrice: isService ? undefined : sp,
    serviceCharge: isService ? sp : undefined,
    wholesaleBuyingPrice: isService ? 0 : Number(v.wholesaleBuyingPrice || 0),
    mrp: isService ? 0 : Number(v.mrp || 0),
    dealerPrice: isService ? 0 : Number(v.dealerPrice || 0),
    distributorPrice: isService ? 0 : Number(v.distributorPrice || 0),
    hsnCode: v.hsn || "—",
    tax: Number(v.tax || 18),
    barcode: v.barcode.trim() || undefined,
    brandModel: v.brandModel.trim() || undefined,
    description: v.description.trim() || undefined,
    trackStock: isService ? false : v.trackStock,
    // SYS-6 — an ordinary edit NEVER clears the migration_flag and NEVER zeroes a
    // flagged service's preserved stray min/max evidence. The service form has no
    // stock controls, so for a part we still persist the entered min/max; for a
    // service we OMIT min/max from the patch so any preserved stray value (the
    // "service_with_stock" evidence) survives untouched. Clearing the flag — and
    // actually reconciling the stray current_stock — is a dedicated, verified,
    // audited action (reconcileMigrationFlag), not a side effect of a normal save.
  };
  // Only a part persists min/max from the form; a service leaves the stored
  // (possibly stray, flagged) values intact for reconciliation.
  if (!isService) {
    patch.minStock = Number(v.minStock || 0);
    patch.maxStock = Number(v.maxStock || 0);
  }
  const cost = buildCost(v);
  return { patch, cost };
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

/** A read-only auto-code chip (Item Code / Service Code). Blank on create. */
function CodeChip({ label, code }: { label: string; code: string }) {
  return (
    <Field label={label} hint={code ? "Permanent · auto-generated" : "Auto-generated on save"}>
      <div className="flex h-[38px] items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 font-mono text-[13px] text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{code || "— assigned on save —"}</span>
      </div>
    </Field>
  );
}

/**
 * The canonical inventory field set as reusable section cards. A single
 * Item Type control drives Part vs Service rendering. CP / Standard Labour Cost
 * inputs are gated by CAP.sensitive.viewCost (view) / editCost (edit), honouring
 * the shared canEdit / <fieldset disabled> read-only pattern.
 */
export function InventoryItemFields({
  values,
  onChange,
  /** False when the surrounding form is read-only (view-tier user). */
  canEdit = true,
  /** When true the opening-stock inputs (Opening Qty / Unit Cost) are hidden so
   *  no opening balance can be established here. The invoice-side Add Inventory
   *  modal sets this — invoice flows never establish stock (FR-8/AC-9). */
  hideOpeningStock = false,
}: {
  values: InventoryFormValues;
  onChange: (patch: Partial<InventoryFormValues>) => void;
  canEdit?: boolean;
  hideOpeningStock?: boolean;
}) {
  const { can } = usePermissions();
  const canViewCost = allow(can, CAP.sensitive.viewCost);
  const canEditCost = canEdit && allow(can, CAP.sensitive.editCost);

  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [uoms, setUoms] = useState<string[]>(UOMS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isService = values.kind === "service";

  const set = (patch: Partial<InventoryFormValues>) => onChange(patch);

  const health = useMemo(() => {
    const c = Number(values.currentStock || 0);
    const mn = Number(values.minStock || 0);
    const mx = Number(values.maxStock || 0);
    if (isService || !values.trackStock || (!values.minStock && !values.maxStock)) return null;
    return classifyStock(c, mn, mx || mn + 1);
  }, [values.currentStock, values.minStock, values.maxStock, values.trackStock, isService]);

  function generateSku() {
    const base = (values.name || "ITM").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
    const n = (Date.now() % 10000).toString().padStart(4, "0");
    set({ sku: `${base}-${n}` });
  }

  return (
    <div className="space-y-4">
      {/* ── Item Type — the ONE control (replaces Product/Service + Buy/Sell/Both) ── */}
      <Field label="Item Type">
        <SegmentedTabs
          className="w-full [&>button]:flex-1"
          options={[
            { label: "Part / Product", value: "part" },
            { label: "Repair Service / Labour", value: "service" },
          ]}
          value={values.kind}
          onChange={(v) => set({ kind: v as InventoryFormValues["kind"] })}
        />
      </Field>

      {/* ── Identity ── */}
      <SectionCard
        icon={isService ? Wrench : Package}
        title={isService ? "Service Identity" : "Item Identity"}
        description="Name, classification and reference codes"
        bodyClassName="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isService ? (
            <CodeChip label="Service Code" code={values.serviceCode} />
          ) : (
            <CodeChip label="Item Code" code={values.itemCode} />
          )}
          <Field label={isService ? "Service Name" : "Item Name"} required>
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} placeholder={isService ? "e.g. Water Damage Treatment" : "e.g. iPhone 15 Pro OLED Assembly"} />
          </Field>
        </div>

        {!isService && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="SKU" hint="Optional external reference">
              <div className="flex gap-2">
                <Input value={values.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="SKU-0001" className="font-mono" />
                <Button type="button" variant="soft" size="md" className="shrink-0 rounded-xl px-3" onClick={generateSku}>
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <Field label="Barcode" hint="Optional">
              <Input value={values.barcode} onChange={(e) => set({ barcode: e.target.value })} placeholder="Scan or enter barcode" className="font-mono" />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={isService ? "Service Category" : "Item Category"} required>
            <InlineCombo
              value={values.category}
              onChange={(v) => set({ category: v })}
              options={categories}
              onCreate={(n) => setCategories((c) => [n, ...c])}
              placeholder="Select or create category"
              createLabel="Create category"
            />
          </Field>
          <Field label={isService ? "Device / Model (brand · model)" : "Brand / Model"} hint="Optional">
            <Input value={values.brandModel} onChange={(e) => set({ brandModel: e.target.value })} placeholder={isService ? "e.g. Apple · iPhone 15" : "e.g. Apple · compatible model"} />
          </Field>
        </div>

        <Field label="Description" hint="Optional">
          <Input value={values.description} onChange={(e) => set({ description: e.target.value })} placeholder="Short description" />
        </Field>

        <Field label={isService ? "Unit / Billing basis" : "Unit of Measurement"}>
          <InlineCombo
            value={values.uom}
            onChange={(v) => set({ uom: v })}
            options={uoms}
            onCreate={(n) => setUoms((u) => [n, ...u])}
            placeholder="Select or create unit"
            createLabel="Create unit"
          />
        </Field>
      </SectionCard>

      {/* ── Pricing ── */}
      <SectionCard icon={IndianRupee} title={isService ? "Service Pricing" : "Pricing"} description={isService ? "Customer charge and estimated internal cost" : "Cost and selling price"} bodyClassName="space-y-4">
        {isService ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Service Charge" hint="Customer-facing default price">
              <Input type="number" inputMode="decimal" value={values.serviceCharge} onChange={(e) => set({ serviceCharge: e.target.value })} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
            </Field>
            {canViewCost && (
              <Field label="Standard Labour Cost" hint="Standard / estimated — not actual job cost">
                <Input type="number" inputMode="decimal" value={values.standardLabourCost} onChange={(e) => set({ standardLabourCost: e.target.value })} placeholder="Cost not configured" disabled={!canEditCost} iconLeft={<span className="text-[13px]">₹</span>} />
              </Field>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {canViewCost && (
                <Field label="Cost Price (CP)" hint="Internal default cost / unit">
                  <Input type="number" inputMode="decimal" value={values.costPrice} onChange={(e) => set({ costPrice: e.target.value })} placeholder="Cost not configured" disabled={!canEditCost} iconLeft={<span className="text-[13px]">₹</span>} />
                </Field>
              )}
              <Field label="Selling Price (SP)" hint="Customer default price / unit">
                <Input type="number" inputMode="decimal" value={values.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
              </Field>
            </div>

            {/* Advanced Pricing disclosure — tiers stored verbatim, never derived. */}
            <div className="rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
              >
                <span className="text-[13px] font-medium text-foreground">Advanced Pricing</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>
              {advancedOpen && (
                <div className="grid grid-cols-1 gap-4 border-t border-border p-3.5 sm:grid-cols-2">
                  <Field label="MRP">
                    <Input type="number" inputMode="decimal" value={values.mrp} onChange={(e) => set({ mrp: e.target.value })} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
                  </Field>
                  <Field label="Wholesale Price">
                    <Input type="number" inputMode="decimal" value={values.wholesaleBuyingPrice} onChange={(e) => set({ wholesaleBuyingPrice: e.target.value })} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
                  </Field>
                  <Field label="Dealer Price">
                    <Input type="number" inputMode="decimal" value={values.dealerPrice} onChange={(e) => set({ dealerPrice: e.target.value })} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
                  </Field>
                  <Field label="Distributor Price">
                    <Input type="number" inputMode="decimal" value={values.distributorPrice} onChange={(e) => set({ distributorPrice: e.target.value })} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Inventory Tracking (parts only — services never track stock) ── */}
      {!isService && (
        <SectionCard icon={Boxes} title="Inventory Tracking" description="Opening stock and reorder thresholds" bodyClassName="space-y-4">
          <label className="flex items-center gap-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={values.trackStock}
              onChange={(e) => set({ trackStock: e.target.checked })}
              className="h-4 w-4 rounded border-input text-[#4361EE] focus:ring-[#4361EE]/30"
            />
            <span className="font-medium text-foreground">Track stock for this item</span>
            <span className="text-muted-foreground">— off ⇒ sellable non-stock good (no availability / deduction)</span>
          </label>

          {values.trackStock && (
            <>
              {!hideOpeningStock && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Opening Quantity">
                    <Input type="number" inputMode="numeric" value={values.currentStock} onChange={(e) => set({ currentStock: e.target.value })} placeholder="0" />
                  </Field>
                  {canViewCost && (
                    <Field label="Opening Unit Cost" hint="Cost per unit of opening stock">
                      <Input type="number" inputMode="decimal" value={values.openingUnitCost} onChange={(e) => set({ openingUnitCost: e.target.value })} placeholder="0" disabled={!canEditCost} iconLeft={<span className="text-[13px]">₹</span>} />
                    </Field>
                  )}
                  <Field label="Store">
                    <Input value={values.store} onChange={(e) => set({ store: e.target.value })} placeholder="Main Store" />
                  </Field>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </>
          )}
        </SectionCard>
      )}

      {/* ── Tax ── */}
      <SectionCard icon={IndianRupee} title="Tax" description="Tax treatment" bodyClassName="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="HSN / SAC Code">
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
    </div>
  );
}
