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
import { Wand2, Package, IndianRupee, Boxes, Info, Wrench, Lock, ChevronDown, Truck } from "lucide-react";
import { Input, Label, Select, type FieldAccent } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import { SectionCard, HealthBadge } from "@/components/inventory/widgets";
import { InlineCombo } from "@/components/inventory/inline-combo";
import { ScanButton } from "@/components/inventory/barcode-scanner";
import { CATEGORIES, UOMS, classifyStock, type InventoryItem } from "@/lib/inventory-data";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { formatINR, cn } from "@/lib/utils";

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
  vendor: string;                      // optional supplier / vendor
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
  tax: string;                         // GST % on the selling price (SP)
  costTax: string;                     // GST % on the cost price (CP)
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
    name: "", sku: "", barcode: "", description: "", category: "", brandModel: "", vendor: "",
    uom: "Piece",
    costPrice: "", sellingPrice: "", mrp: "", wholesaleBuyingPrice: "", dealerPrice: "", distributorPrice: "",
    serviceCharge: "", standardLabourCost: "",
    hsn: "", tax: "0", costTax: "0",
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
    vendor: item.vendor ?? "",
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
    costTax: item.costTax != null ? String(item.costTax) : String(item.tax || "0"),
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

/** The form fields that are MANDATORY (marked with `*` in the UI). */
export type InventoryFieldKey = keyof InventoryFormValues;

/** Returns the set of mandatory fields that are still empty/invalid so the UI
 *  can highlight each one with a red border and scroll to the first. Keep this
 *  in lockstep with `validateInventoryForm` (same required rules). Only the
 *  fields marked with `*` in the UI are mandatory — everything else is
 *  implicitly optional. `0` / `₹0` stay valid (design-system rule). */
export function invalidInventoryFields(v: InventoryFormValues): Set<InventoryFieldKey> {
  const bad = new Set<InventoryFieldKey>();
  if (!v.name.trim()) bad.add("name");
  if (!v.category) bad.add("category");
  return bad;
}

/** Scroll the first invalid field (by data-field key) into view and focus its
 *  first input, so a failed save visibly takes the user to the problem. Runs on
 *  the next frame so freshly-rendered rose borders are present. */
export function focusFirstInvalidField(invalid: Set<InventoryFieldKey>) {
  if (typeof document === "undefined" || invalid.size === 0) return;
  requestAnimationFrame(() => {
    for (const key of invalid) {
      const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.querySelector<HTMLElement>("input, button, textarea")?.focus({ preventScroll: true });
        break;
      }
    }
  });
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
    costTax: Number(v.costTax || 0),
    minStock: isService ? 0 : Number(v.minStock || 0),
    maxStock: isService ? 0 : Number(v.maxStock || 0),
    reservedStock: 0,
    soldUnits: 0,
    purchasedUnits: 0,
    barcode: v.barcode.trim() || undefined,
    brandModel: v.brandModel.trim() || undefined,
    vendor: v.vendor.trim() || undefined,
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
  // item_kind (and its legacy `type` mirror) is a PERMANENT identity and is
  // DELIBERATELY NOT in the update patch (review finding #10): the DB rejects a
  // kind change and the UI locks the control on edit, so an ordinary edit never
  // attempts to re-write the item's kind/type.
  const patch: Partial<InventoryItem> = {
    name: v.name.trim(),
    category: v.category,
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
    costTax: Number(v.costTax || 0),
    barcode: v.barcode.trim() || undefined,
    brandModel: v.brandModel.trim() || undefined,
    vendor: v.vendor.trim() || undefined,
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

const ACCENT_LABEL: Record<FieldAccent, string> = {
  emerald: "text-emerald-700",
  blue: "text-[#4361EE]",
};

function Field({
  label,
  required,
  hint,
  children,
  invalid,
  fieldKey,
  accent,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  /** When true, mark the field invalid: label turns rose and a required note
   *  shows. The companion input is highlighted via the shared `invalid` prop. */
  invalid?: boolean;
  /** Stable key used as the scroll/focus target on a failed save. */
  fieldKey?: string;
  /** Semantic colour accent for the label (e.g. Cost vs Selling). */
  accent?: FieldAccent;
}) {
  return (
    // Fixed single-line header (label + optional (i) hint) directly above the
    // pill. Keeping the hint inside an (i) tooltip — instead of a sub-line —
    // means a hinted field and a non-hinted field keep an IDENTICAL header
    // height, so every pill in a row stays baseline-aligned regardless of hint
    // length. The required-error note is the only thing allowed to add a line.
    <div className="flex flex-col gap-1.5" data-field={fieldKey}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <Label className={cn("leading-tight", invalid ? "text-rose-600" : accent && ACCENT_LABEL[accent])}>
            {label}
            {required && <span className="ml-0.5 text-rose-500">*</span>}
          </Label>
          {hint && <InfoHint content={hint} label={`About ${label}`} />}
        </div>
        {invalid && (
          <span className="text-[11px] leading-tight font-medium text-rose-600">This field is required</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

/** A GST-rate control: preset dropdown (0/8/12/24) or a free "Custom %" input.
 *  Reused for both the CP GST and the SP GST so they look + behave identically. */
function GstField({
  label,
  value,
  onChange,
  custom,
  setCustom,
  disabled,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  custom: boolean;
  setCustom: (b: boolean) => void;
  disabled?: boolean;
  accent?: FieldAccent;
}) {
  return (
    <Field label={label} accent={accent}>
      {custom ? (
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Custom %"
            disabled={disabled}
            accent={accent}
            iconRight={<span className="text-[12px] text-muted-foreground">%</span>}
          />
          <Button
            type="button"
            variant="outline"
            size="md"
            className="h-[34px] shrink-0 rounded-xl px-3 text-[12px]"
            disabled={disabled}
            onClick={() => { setCustom(false); onChange("0"); }}
          >
            Presets
          </Button>
        </div>
      ) : (
        <Select
          value={GST_PRESETS.includes(value) ? value : "custom"}
          onChange={(e) => {
            if (e.target.value === "custom") { setCustom(true); return; }
            onChange(e.target.value);
          }}
          className="h-[34px] px-3 text-[13px]"
          disabled={disabled}
          accent={accent}
          options={GST_OPTIONS.map((t) => ({ value: t, label: t === "custom" ? "Custom…" : `${t}%` }))}
        />
      )}
    </Field>
  );
}

/** A read-only auto-code chip (Item Code / Service Code). Blank on create. */
function CodeChip({ label, code }: { label: string; code: string }) {
  return (
    <Field label={label} hint={code ? "Permanent · auto-generated" : "Auto-generated on save"}>
      <div className="flex h-[34px] items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 font-mono text-[13px] text-muted-foreground">
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
/** GST rate choices for the pricing section. "custom" reveals a free % input. */
const GST_OPTIONS = ["0", "8", "12", "24", "custom"] as const;
const GST_PRESETS = ["0", "8", "12", "24"];

export function InventoryItemFields({
  values,
  onChange,
  /** False when the surrounding form is read-only (view-tier user). */
  canEdit = true,
  /** When true the opening-stock inputs (Opening Qty / Unit Cost) are hidden so
   *  no opening balance can be established here. The invoice-side Add Inventory
   *  modal sets this — invoice flows never establish stock (FR-8/AC-9). */
  hideOpeningStock = false,
  /** When true the Item Type control is read-only (edit mode). item_kind is a
   *  PERMANENT identity: the per-org PRT-/SRV- code is kind-specific and never
   *  re-stamped on update, so a kind flip would strand the code's identity. The
   *  DB enforces this too (inventory_items_lock_code rejects a kind change —
   *  review finding #10); locking the control here keeps the UI honest. */
  lockItemType = false,
  /** Mandatory fields that failed validation on the last save attempt — each is
   *  highlighted with a rose border + "required" note (from invalidInventoryFields). */
  invalidFields,
}: {
  values: InventoryFormValues;
  onChange: (patch: Partial<InventoryFormValues>) => void;
  canEdit?: boolean;
  hideOpeningStock?: boolean;
  lockItemType?: boolean;
  invalidFields?: Set<InventoryFieldKey>;
}) {
  const { can } = usePermissions();
  const canViewCost = allow(can, CAP.sensitive.viewCost);
  const canEditCost = canEdit && allow(can, CAP.sensitive.editCost);

  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [uoms, setUoms] = useState<string[]>(UOMS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // "custom" GST mode when the stored rate isn't one of the presets.
  const [customGst, setCustomGst] = useState(() => !GST_PRESETS.includes(values.tax));
  const [customCostGst, setCustomCostGst] = useState(() => !GST_PRESETS.includes(values.costTax));
  const isService = values.kind === "service";
  const bad = (k: InventoryFieldKey) => invalidFields?.has(k) ?? false;

  const set = (patch: Partial<InventoryFormValues>) => onChange(patch);

  // Combined price + GST breakdown. CP and SP each have their OWN GST rate, so
  // each gets its own GST amount + gross figure.
  const gstRate = Number(values.tax || 0);
  const costGstRate = Number(values.costTax || 0);
  const costBase = Number((isService ? values.standardLabourCost : values.costPrice) || 0);
  const costGst = Math.max(0, costBase) * (costGstRate / 100);
  const costGross = costBase + costGst;
  const baseAmount = Number((isService ? values.serviceCharge : values.sellingPrice) || 0);
  const gstAmount = Math.max(0, baseAmount) * (gstRate / 100);
  const finalPrice = baseAmount + gstAmount;
  // Margin on the pre-GST figures (CP → SP), shown only when a cost is known.
  const margin = baseAmount - costBase;
  const marginPct = costBase > 0 ? (margin / costBase) * 100 : null;

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
      {/* ── Item Type — the ONE control (replaces Product/Service + Buy/Sell/Both) ──
          Immutable once the item exists (lockItemType): the permanent PRT-/SRV-
          code is kind-specific, so Item Type can only be chosen at creation. */}
      <Field label="Item Type">
        {lockItemType ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm font-medium text-foreground">
              {isService ? "Repair Service / Labour" : "Part / Product"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Item Type is permanent and can&apos;t be changed after creation.
            </span>
          </div>
        ) : (
          <SegmentedTabs
            className="w-full [&>button]:flex-1"
            options={[
              { label: "Part / Product", value: "part" },
              { label: "Repair Service / Labour", value: "service" },
            ]}
            value={values.kind}
            onChange={(v) => set({ kind: v as InventoryFormValues["kind"] })}
          />
        )}
      </Field>

      {/* ── Identity ── */}
      <SectionCard
        icon={isService ? Wrench : Package}
        title={isService ? "Service Identity" : "Item Identity"}
        description="Name, classification and reference codes"
        bodyClassName="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
          {isService ? (
            <CodeChip label="Service Code" code={values.serviceCode} />
          ) : (
            <CodeChip label="Item Code" code={values.itemCode} />
          )}
          <Field label={isService ? "Service Name" : "Item Name"} required invalid={bad("name")} fieldKey="name">
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} invalid={bad("name")} placeholder={isService ? "e.g. Water Damage Treatment" : "e.g. iPhone 15 Pro OLED Assembly"} />
          </Field>
        </div>

        {!isService && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="SKU">
              <div className="flex gap-2">
                <Input value={values.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="SKU-0001" className="font-mono" />
                <Button type="button" variant="soft" size="md" className="shrink-0 rounded-xl px-3" onClick={generateSku}>
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <Field label="Barcode / QR">
              <div className="flex gap-2">
                <Input value={values.barcode} onChange={(e) => set({ barcode: e.target.value })} placeholder="Scan or enter barcode / QR" className="font-mono" />
                <ScanButton onDetect={(v) => set({ barcode: v })} disabled={!canEdit} />
              </div>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={isService ? "Service Category" : "Item Category"} required invalid={bad("category")} fieldKey="category">
            <InlineCombo
              value={values.category}
              onChange={(v) => set({ category: v })}
              options={categories}
              onCreate={(n) => setCategories((c) => [n, ...c])}
              placeholder="Select or create category"
              createLabel="Create category"
              invalid={bad("category")}
            />
          </Field>
          <Field label={isService ? "Device / Model (brand · model)" : "Brand / Model"}>
            <Input value={values.brandModel} onChange={(e) => set({ brandModel: e.target.value })} placeholder={isService ? "e.g. Apple · iPhone 15" : "e.g. Apple · compatible model"} />
          </Field>
        </div>

        <Field label="Vendor" hint={isService ? "Service partner / vendor" : "Supplier this item is bought from"}>
          <Input
            value={values.vendor}
            onChange={(e) => set({ vendor: e.target.value })}
            placeholder={isService ? "e.g. Apple Authorised Partner" : "e.g. Mobilex Distributors"}
            iconLeft={<Truck className="h-4 w-4" />}
          />
        </Field>

        <Field label="Description">
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

      {/* ── Pricing (price + GST combined) ──
          CP pill → Selling amount → GST dropdown → live breakdown (base + GST
          amount = final price) → SP / GST / Total summary. Identical structure
          for both Part and Repair Service (the labels differ). */}
      <SectionCard icon={IndianRupee} title={isService ? "Service Pricing" : "Pricing"} description="Price and GST combined" bodyClassName="space-y-4">
        {/* CP (emerald) on the left, SP (blue) on the right. Laid out as two
            aligned ROWS — prices on top, GST below — so the price pills align
            with each other and the GST pills align with each other regardless
            of how many lines each label takes (sm:items-end bottom-aligns). */}
        {/* Row 1 — prices */}
        <div className={cn("grid grid-cols-1 gap-4 sm:items-end", canViewCost && "sm:grid-cols-2")}>
          {canViewCost && (
            <Field
              label={isService ? "Cost (Standard Labour Cost)" : "Cost Price (CP)"}
              hint={isService ? "Standard / estimated — not actual job cost" : "Internal default cost / unit"}
              accent="emerald"
            >
              <Input
                type="number"
                inputMode="decimal"
                value={isService ? values.standardLabourCost : values.costPrice}
                onChange={(e) => set(isService ? { standardLabourCost: e.target.value } : { costPrice: e.target.value })}
                placeholder="Cost not configured"
                disabled={!canEditCost}
                accent="emerald"
                iconLeft={<span className="text-[13px]">₹</span>}
              />
            </Field>
          )}
          <Field label={isService ? "Service Charge (SP)" : "Selling Price (SP)"} hint="Base price, before GST" accent="blue">
            <Input
              type="number"
              inputMode="decimal"
              value={isService ? values.serviceCharge : values.sellingPrice}
              onChange={(e) => set(isService ? { serviceCharge: e.target.value } : { sellingPrice: e.target.value })}
              placeholder="0"
              accent="blue"
              iconLeft={<span className="text-[13px]">₹</span>}
            />
          </Field>
        </div>

        {/* Row 2 — per-side GST */}
        <div className={cn("grid grid-cols-1 gap-4 sm:items-end", canViewCost && "sm:grid-cols-2")}>
          {canViewCost && (
            <GstField
              label="GST on cost"
              value={values.costTax}
              onChange={(v) => set({ costTax: v })}
              custom={customCostGst}
              setCustom={setCustomCostGst}
              disabled={!canEditCost}
              accent="emerald"
            />
          )}
          <GstField
            label="GST on selling"
            value={values.tax}
            onChange={(v) => set({ tax: v })}
            custom={customGst}
            setCustom={setCustomGst}
            accent="blue"
          />
        </div>

        {/* Price summary — GST applies to BOTH cost and selling price. Two
            parallel columns (Cost vs Selling, each: base → +GST → gross) so
            there's no duplicated chip row; the selling gross is the headline. */}
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="bg-muted/40 px-3.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price summary</p>
          </div>
          <div className={cn("grid divide-border", canViewCost ? "grid-cols-2 divide-x" : "grid-cols-1")}>
            {canViewCost && (
              <PriceColumn
                heading={isService ? "Cost (Labour)" : "Cost (CP)"}
                priceLabel="CP"
                base={costBase}
                gstRate={costGstRate}
                gst={costGst}
                gross={costGross}
                tone="emerald"
              />
            )}
            <PriceColumn
              heading={isService ? "Selling (Charge)" : "Selling (SP)"}
              priceLabel="SP"
              base={baseAmount}
              gstRate={gstRate}
              gst={gstAmount}
              gross={finalPrice}
              tone="blue"
            />
          </div>
          {canViewCost && (
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3.5 py-2 text-[12px]">
              <span className="font-medium text-muted-foreground">Margin</span>
              <span className={cn("font-semibold tnum", margin < 0 ? "text-rose-600" : "text-emerald-600")}>
                {formatINR(margin)}
                {marginPct !== null && <span className="ml-1 font-normal">({marginPct.toFixed(0)}%)</span>}
              </span>
            </div>
          )}
        </div>

        {/* Advanced Pricing disclosure (parts only) — tiers stored verbatim. */}
        {!isService && (
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

      {/* ── Tax (HSN/SAC only — the GST rate lives in Pricing) ── */}
      <SectionCard icon={IndianRupee} title="Tax" description="HSN / SAC classification" bodyClassName="space-y-4">
        <Field label="HSN / SAC Code">
          <Input value={values.hsn} onChange={(e) => set({ hsn: e.target.value })} placeholder="8517xx" className="font-mono" />
        </Field>
      </SectionCard>
    </div>
  );
}

/** One column of the price summary as three line-separated rows:
 *  CP/SP (base) → GST → Total. The selling column is accented (brand). */
const TONE_TEXT: Record<FieldAccent, string> = {
  emerald: "text-emerald-700",
  blue: "text-[#4361EE]",
};
const TONE_BG: Record<FieldAccent, string> = {
  emerald: "bg-emerald-50/40",
  blue: "bg-[#EEF1FD]/40",
};

function PriceColumn({
  heading,
  priceLabel,
  base,
  gstRate,
  gst,
  gross,
  tone,
}: {
  /** Column heading (e.g. "Cost (CP)" / "Selling (SP)"). */
  heading: string;
  /** Row label for the base price — "CP" or "SP". */
  priceLabel: string;
  base: number;
  gstRate: number;
  gst: number;
  gross: number;
  /** Semantic colour for the heading + Total (Cost vs Selling). */
  tone: FieldAccent;
}) {
  return (
    <div className={TONE_BG[tone]}>
      <p className={cn("border-b border-border px-3.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider", TONE_TEXT[tone])}>
        {heading}
      </p>
      <div className="divide-y divide-border">
        <SummaryLine label={priceLabel} value={formatINR(base)} />
        <SummaryLine label={`GST (${gstRate || 0}%)`} value={formatINR(gst)} />
        <SummaryLine label="Total" value={formatINR(gross)} total toneText={TONE_TEXT[tone]} />
      </div>
    </div>
  );
}

/** A single label / value row inside a price-summary column. */
function SummaryLine({
  label,
  value,
  total,
  toneText,
}: {
  label: string;
  value: string;
  total?: boolean;
  toneText?: string;
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2">
      <span
        className={cn(
          "text-[12px]",
          total ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tnum",
          total
            ? cn("font-display text-[15px] font-extrabold", toneText ?? "text-foreground")
            : "text-[13px] font-medium text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
