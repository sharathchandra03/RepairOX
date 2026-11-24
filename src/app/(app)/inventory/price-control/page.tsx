"use client";
/* Inventory → Price List Edit (stock team's cost & price control).
   Pick Category → Brand → Model and manage every Price List part of that model
   in one table:
     • edit the Selling Price (it is the ONE price; the Price List follows via the
       0118 link + 0124 price-change tracking, so the old price shows struck
       through there for a few days),
     • see Latest cost, Average cost, Gross profit and Margin live while typing
       (cost columns only for CAP.sensitive.viewCost),
     • link an unlinked Price List part to an existing inventory SKU, or create a
       new inventory item and link it in one step.
   Two more tabs: SKU Cost Ledger and the Price Change Audit (stock team only). */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, History, IndianRupee, Layers, Link2, Link2Off, Package, Save, TrendingDown, TrendingUp, Percent, Plus, Pencil, MoreHorizontal, Unlink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { TableSearch } from "@/components/common/table-utility-bar";
import { DeviceQuickSearch } from "@/components/inventory/device-quick-search";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { AddInventoryModal } from "@/components/inventory/add-inventory-modal";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { PriceLinkPanel } from "@/components/inventory/price-link-panel";
import { InvKpi, InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { useCatalog, brandsForCategory, modelsForBrand, partsForModel, sortCategories } from "@/lib/catalog-context";
import { useStore } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { availableStock, buildSkuIndex, effectiveSellingPrice, findLinkedItem } from "@/lib/inventory-analytics";
import { averagePurchaseCost, latestUnitCost, AVG_COST_WINDOW_DAYS, type StockLayerLike } from "@/lib/inventory-costing";
import { priceChangeInfo, PRICE_CHANGE_WINDOW_DAYS, type DevicePart } from "@/lib/price-list-data";
import type { InventoryItem } from "@/lib/inventory-data";
import { cn, formatINR } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { CAP, allow } from "@/lib/capabilities";

/** Margin (on selling price) below which a row is flagged for review. */
const LOW_MARGIN_PCT = 20;

type Tab = "price" | "link" | "ledger" | "audit";
type Row = { part: DevicePart; item?: InventoryItem; sp: number; latest?: number; avg?: number; avgFromPurchases?: boolean };

const pct = (n: number) => `${n.toFixed(1)}%`;
const signed = (n: number, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;

/** Latest cost = Cost price (a GRN updates it). Avg = simple average of buying
 *  prices received in the last AVG_COST_WINDOW_DAYS days (falls back to latest). */
function costOf(layers: readonly StockLayerLike[], item?: InventoryItem): { latest?: number; avg?: number; avgFromPurchases?: boolean } {
  if (!item) return {};
  const latest = latestUnitCost(item.id, layers, item);
  const avg = averagePurchaseCost(item.id, layers);
  return { latest, avg: avg ?? latest, avgFromPurchases: avg !== undefined };
}

/** Margin colour scale (shown as a legend under the table). */
const MARGIN_BANDS: { label: string; min: number; cls: string }[] = [
  { label: "100%+", min: 100, cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  { label: "70–99%", min: 70, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { label: "50–69%", min: 50, cls: "bg-green-50 text-green-700 ring-green-200" },
  { label: "40–49%", min: 40, cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  { label: "30–39%", min: 30, cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  { label: "20–29%", min: 20, cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  { label: "Below 20%", min: 0, cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  { label: "Loss", min: -Infinity, cls: "bg-red-100 text-red-800 ring-red-300" },
];
function marginTone(m: number) {
  return (MARGIN_BANDS.find((b) => m >= b.min) ?? MARGIN_BANDS[MARGIN_BANDS.length - 1]).cls;
}
const WARRANTIES = ["No Warranty", "7 Days", "15 Days", "30 Days", "90 Days", "3 Months", "6 Months", "1 Year"].map((w) => ({ label: w, value: w }));

export default function PriceControlPage() {
  const { categories, brands, models, parts, updatePart, addPart } = useCatalog();
  const { inventory, inventoryStockLayers, updateInventoryItem } = useStore();
  const { canViewCost, canEdit, canCreate } = useInventoryScope();
  const { can } = usePermissions();
  const canEditCost = allow(can, CAP.sensitive.editCost);
  const canAdjust = allow(can, CAP.inventory.adjust);
  const { adjust } = useInventoryActions();
  const [costFor, setCostFor] = useState<Row | null>(null);
  const [costValue, setCostValue] = useState("");

  const [tab, setTab] = useState<Tab>("price");
  const [partQ, setPartQ] = useState("");
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);
  const [syncSlot, setSyncSlot] = useState<HTMLElement | null>(null);
  // Old /inventory/price-sync links arrive as ?tab=link.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "link") setTab("link"); }, []);
  const [catId, setCatId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [linkTarget, setLinkTarget] = useState<Row | null>(null);
  const [picked, setPicked] = useState<InventoryItem | null>(null);
  const [createFor, setCreateFor] = useState<Row | null>(null);
  // Add / edit Price List part dialog (target = existing row, or "new").
  const [partForm, setPartForm] = useState<{ row: Row | null; name: string; sku: string; price: string; warranty: string; cost: string; stock: string } | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<Row | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [createAfterAdd, setCreateAfterAdd] = useState(false);

  const cats = useMemo(() => sortCategories(categories.filter((c) => c.enabled !== false)), [categories]);
  const effCat = cats.some((c) => c.id === catId) ? catId : "";
  const brandList = useMemo(() => brandsForCategory(brands, effCat), [brands, effCat]);
  const effBrand = brandList.some((b) => b.id === brandId) ? brandId : "";
  const modelList = useMemo(() => modelsForBrand(models, effBrand), [models, effBrand]);
  const effModel = modelList.some((m) => m.id === modelId) ? modelId : "";
  const model = modelList.find((m) => m.id === effModel);
  const brand = brandList.find((b) => b.id === effBrand);

  const index = useMemo(() => buildSkuIndex(inventory.filter((i) => (i.kind ?? "part") === "part")), [inventory]);

  const rows = useMemo<Row[]>(
    () =>
      partsForModel(parts, effModel).map((part) => {
        const item = findLinkedItem(index, part.partNumber);
        const sp = item ? effectiveSellingPrice(item) || part.price : part.price;
        return { part, item, sp, ...(canViewCost ? costOf(inventoryStockLayers, item) : {}) };
      }),
    [parts, effModel, index, inventoryStockLayers, canViewCost],
  );

  const visibleRows = useMemo(() => {
    const t = partQ.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.part.partName} ${r.part.partNumber} ${r.item?.id ?? ""}`.toLowerCase().includes(t)) : rows;
  }, [rows, partQ]);

  const draftSp = (r: Row) => {
    const t = draft[r.part.id];
    return t === undefined || t === "" ? r.sp : Number(t);
  };
  const dirty = rows.filter((r) => draft[r.part.id] !== undefined && draft[r.part.id] !== "" && Number(draft[r.part.id]) > 0 && Number(draft[r.part.id]) !== r.sp);
  const linked = rows.filter((r) => r.item).length;
  const lowMargin = rows.filter((r) => r.latest !== undefined && draftSp(r) > 0 && ((draftSp(r) - r.latest) / draftSp(r)) * 100 < LOW_MARGIN_PCT).length;
  const activeChanges = rows.filter((r) => priceChangeInfo(r.part)).length;
  const belowCost = dirty.filter((r) => r.latest !== undefined && Number(draft[r.part.id]) < r.latest);

  // Drop unsaved edits when the model changes.
  useEffect(() => { setDraft({}); setPartQ(""); }, [effModel]);

  async function save() {
    if (saving || dirty.length === 0 || !canEdit) return;
    setSaving(true);
    try {
      for (const r of dirty) {
        const sp = Number(draft[r.part.id]);
        // Inventory is the single source of truth; the DB link copies it to the
        // Price List. updatePart mirrors it locally (and in demo mode).
        // Unlinked parts have no inventory item, so their Price List price is edited directly.
        if (r.item) await updateInventoryItem(r.item.id, { sellingPrice: sp, regularSellingPrice: sp, defaultPrice: sp });
        updatePart(r.part.id, { price: sp, priceKnown: true });
      }
      toast.success(`${dirty.length} selling price${dirty.length === 1 ? "" : "s"} saved. Price List updated.`);
      setDraft({});
    } catch {
      toast.error("Couldn't save the selling prices. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function savePartForm() {
    if (!partForm || savingForm) return;
    const name = partForm.name.trim();
    const price = Number(partForm.price);
    if (!name) { toast.error("Enter the part name."); return; }
    if (partForm.row) {
      const r = partForm.row;
      const item = r.item;
      setSavingForm(true);
      try {
        // Price: linked parts save on the inventory item (the single source of
        // truth); the DB link copies it to the Price List and records the change.
        const priceChanged = price > 0 && price !== r.sp;
        if (priceChanged && item) await updateInventoryItem(item.id, { sellingPrice: price, regularSellingPrice: price, defaultPrice: price });
        updatePart(r.part.id, {
          partName: name, partNumber: partForm.sku.trim(), warranty: partForm.warranty,
          ...(priceChanged ? { price, priceKnown: true } : {}),
        });
        if (item && canEditCost && partForm.cost.trim() !== "") {
          const c = Number(partForm.cost);
          if (Number.isFinite(c) && c >= 0 && !(item.costState === "configured" && item.costPrice === c)) {
            await updateInventoryItem(item.id, {}, { cost: { costPrice: c, standardLabourCost: 0, configured: true } });
          }
        }
        // Stock goes through the audited stock-adjustment path (movement row), never a raw overwrite.
        if (item && canAdjust && partForm.stock.trim() !== "") {
          const delta = Math.round(Number(partForm.stock)) - (item.currentStock ?? 0);
          if (Number.isFinite(delta) && delta !== 0) {
            await adjust({ itemId: item.id, delta, label: "Price List Edit adjustment", type: "Adjustment", doc: `ADJ-${Date.now()}` });
          }
        }
        setDraft((d) => { const n = { ...d }; delete n[r.part.id]; return n; });
        toast.success(`${name} updated`);
      } finally {
        setSavingForm(false);
      }
    } else {
      if (!effModel) return;
      const part = addPart({ partName: name, partNumber: partForm.sku.trim(), price: price > 0 ? price : 0, priceKnown: price > 0, warranty: partForm.warranty, modelId: effModel });
      toast.success(`${name} added to ${model?.name ?? "the model"}`);
      if (createAfterAdd && canCreate) setCreateFor({ part, sp: part.price });
    }
    setPartForm(null);
  }

  async function saveCost() {
    if (!costFor?.item) return;
    const v = Number(costValue);
    if (costValue.trim() === "" || !Number.isFinite(v) || v < 0) { toast.error("Enter a valid cost price."); return; }
    await updateInventoryItem(costFor.item.id, {}, { cost: { costPrice: v, standardLabourCost: 0, configured: true } });
    toast.success(`Cost price set for ${costFor.part.partName}`);
    setCostFor(null);
  }

  function confirmUnlink() {
    if (!unlinkTarget) return;
    // Clearing the part number breaks the SKU match. The current price stays;
    // the part just stops following inventory.
    updatePart(unlinkTarget.part.id, { partNumber: "" });
    toast.success(`${unlinkTarget.part.partName} unlinked from ${unlinkTarget.item?.id ?? "inventory"}`);
    setUnlinkTarget(null);
  }

  function confirmLink() {
    if (!linkTarget || !picked) return;
    const sell = effectiveSellingPrice(picked);
    updatePart(linkTarget.part.id, {
      partNumber: picked.id,
      ...(sell > 0 ? { price: sell, priceKnown: true } : {}),
    });
    toast.success(`${linkTarget.part.partName} linked to ${picked.id}`);
    setLinkTarget(null);
    setPicked(null);
  }

  const columns: InvColumn<Row>[] = [
    {
      key: "part", pct: 20, header: "Part / SKU", render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold" title={r.part.partName}>{r.part.partName}</p>
          <p className="truncate font-mono text-[11.5px] text-muted-foreground">{r.item ? r.item.id : r.part.partNumber || "No SKU"}</p>
        </div>
      ),
    },
    ...(canViewCost
      ? ([
          {
            key: "latest", pct: 9, header: "Latest cost", align: "center", render: (r) => r.latest !== undefined
              ? <span className="font-bold tabular-nums" title="Cost price. Updated by edits and by every received purchase (GRN).">{formatINR(r.latest)}</span>
              : r.item && canEditCost
                ? <button onClick={() => { setCostFor(r); setCostValue(""); }} className="rounded-full border border-dashed border-[#4361EE]/50 px-2.5 py-1 text-[11.5px] font-semibold text-[#4361EE] hover:bg-[#EEF1FD]">Set cost</button>
                : <span className="text-[12px] text-muted-foreground" title={r.item ? "No purchase or cost price recorded for this item" : "Link this part to inventory first"}>{r.item ? "Not set" : "—"}</span>,
          },
          {
            key: "avg", pct: 9, header: "Avg. cost", align: "center", render: (r) => r.avg === undefined
              ? <span className="text-muted-foreground">—</span>
              : <span className="tabular-nums" title={r.avgFromPurchases ? `Average buying price of purchases in the last ${AVG_COST_WINDOW_DAYS} days` : `No purchase in the last ${AVG_COST_WINDOW_DAYS} days, showing the latest cost`}>{formatINR(r.avg)}{!r.avgFromPurchases && <span className="ml-0.5 text-muted-foreground">*</span>}</span>,
          },
        ] as InvColumn<Row>[])
      : []),
    {
      key: "sp", pct: 15, header: "Selling price (edit)", align: "center", render: (r) => {
        const ch = priceChangeInfo(r.part);
        const t = draft[r.part.id];
        const next = t === undefined || t === "" ? undefined : Number(t);
        const changed = next !== undefined && next > 0 && next !== r.sp;
        return (
          <div className="flex flex-col items-center">
            <input
              inputMode="numeric"
              disabled={!canEdit}
              value={t ?? (!r.sp || (r.part.priceKnown === false && !r.item) ? "" : String(r.sp))}
              placeholder="Set price"
              onChange={(e) => setDraft((d) => ({ ...d, [r.part.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
              aria-label={`Selling price for ${r.part.partName}`}
              className={cn("h-9 w-32 rounded-lg border bg-muted/30 px-3 text-[13.5px] font-semibold tabular-nums focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15 disabled:opacity-60", changed ? "border-[#4361EE] bg-[#EEF1FD]/50" : "border-input")}
            />
            {changed ? (
              <p className="mt-1 flex items-center justify-center gap-1 text-[11.5px] tabular-nums">
                <span className="text-muted-foreground line-through">{formatINR(r.sp)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-semibold">{formatINR(next!)}</span>
                <span className={cn("font-bold", next! < r.sp ? "text-rose-600" : "text-blue-600")}>{signed(((next! - r.sp) / r.sp) * 100)}</span>
              </p>
            ) : ch ? (
              <p className="mt-1 flex items-center justify-center gap-1.5 text-[11.5px] tabular-nums">
                <span className="text-muted-foreground line-through">{formatINR(ch.previous)}</span>
                <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold uppercase", ch.direction === "drop" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700")}>
                  {ch.direction === "drop" ? "↓ drop" : "↑ increase"} · {ch.daysLeft}d
                </span>
              </p>
            ) : null}
          </div>
        );
      },
    },
    ...(canViewCost
      ? ([
          {
            key: "gp", pct: 10, header: "Gross profit", align: "center", render: (r) => {
              const sp = draftSp(r);
              if (r.latest === undefined || !sp) return <span className="text-muted-foreground">—</span>;
              const gp = sp - r.latest;
              return <span className={cn("font-bold tabular-nums", gp < 0 && "text-rose-600")}>{formatINR(gp)}</span>;
            },
          },
          {
            key: "margin", pct: 9, header: "Margin", align: "center", render: (r) => {
              const sp = draftSp(r);
              if (r.latest === undefined || !sp) return <span className="text-[12px] text-muted-foreground">Cost not set</span>;
              const m = ((sp - r.latest) / sp) * 100;
              return <span className={cn("flex h-7 w-full min-w-0 items-center justify-center rounded-full px-2.5 text-[11px] font-bold tabular-nums ring-1 ring-inset", marginTone(m))}>{pct(m)}</span>;
            },
          },
        ] as InvColumn<Row>[])
      : []),
    { key: "stock", pct: 7, header: "Available", align: "center", render: (r) => r.item ? <span className="tabular-nums">{availableStock(r.item)}</span> : <span className="text-muted-foreground">—</span> },
    {
      key: "link", pct: 13, header: "Inventory link", align: "center", render: (r) =>
        r.item ? (
          <div className="flex items-center justify-center">
            <span className="flex h-7 w-full max-w-[140px] items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <Link2 className="h-3 w-3 shrink-0" /><span className="truncate">Linked</span>
            </span>
          </div>
        ) : !canEdit ? (
          <span className="flex h-7 w-full items-center justify-center gap-1.5 rounded-full bg-zinc-100 px-2.5 text-[11px] font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200"><Link2Off className="h-3 w-3" />Not linked</span>
        ) : (
          <div className="flex justify-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => { setLinkTarget(r); setPicked(null); }}>Link</Button>
            {canCreate && <Button size="sm" variant="outline" onClick={() => setCreateFor(r)}>Create</Button>}
          </div>
        ),
    },
    {
      key: "actions", pct: 9, header: "Actions", align: "center", render: (r) => !canEdit ? <span className="text-muted-foreground">—</span> : (
        <div className="flex items-center justify-center gap-0.5">
          <button
          onClick={() => setPartForm({
            row: r, name: r.part.partName, sku: r.part.partNumber,
            price: draft[r.part.id] ?? String(r.sp || ""),
            warranty: r.part.warranty || "30 Days",
            cost: r.item?.costState === "configured" ? String(r.item.costPrice ?? "") : "",
            stock: r.item ? String(r.item.currentStock ?? 0) : "",
          })}
          title="Edit this row" aria-label={`Edit ${r.part.partName}`}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        ><Pencil className="h-4 w-4" /></button>
          {r.item && (
              <Dropdown
                align="right"
                width="w-48"
                trigger={({ toggle }) => (
                  <button onClick={toggle} aria-label={`More actions for ${r.part.partName}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem icon={Search} onClick={() => { setLinkTarget(r); setPicked(null); close(); }}>Link a different item</MenuItem>
                    {canEditCost && <MenuItem icon={IndianRupee} onClick={() => { setCostFor(r); setCostValue(r.item?.costState === "configured" ? String(r.item.costPrice ?? "") : ""); close(); }}>Set cost price</MenuItem>}
                    <MenuItem icon={Unlink} danger onClick={() => { setUnlinkTarget(r); close(); }}>Unlink</MenuItem>
                  </>
                )}
              </Dropdown>
          )}
        </div>
      ),
    },
  ];

  const tabs = [
    { value: "price" as Tab, label: "Edit by Model" },
    { value: "link" as Tab, label: "Link Health" },
    ...(canViewCost ? [{ value: "ledger" as Tab, label: "SKU Cost Ledger" }, { value: "audit" as Tab, label: "Price Change Audit" }] : []),
  ];

  return (
    <div className="space-y-4">
      <InvPageHeader
        icon={IndianRupee}
        title="Price List Edit"
        subtitle="Edit selling prices by model, link Price List parts to inventory, and track cost, profit and changes."
        actions={
          tab === "price" && canEdit ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2" disabled={!effModel} onClick={() => { setCreateAfterAdd(false); setPartForm({ row: null, name: "", sku: "", price: "", warranty: "30 Days", cost: "", stock: "" }); }}>
                <Plus className="h-4 w-4" />Add part
              </Button>
              <Button className="gap-2" onClick={save} disabled={saving || dirty.length === 0}>
              <Save className="h-4 w-4" />Save selling prices{dirty.length ? ` (${dirty.length})` : ""}
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Tabs and device search share one line. Picking a device always jumps to Edit by Model. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {tabs.length > 1 ? <StatusTabs value={tab} onChange={setTab} options={tabs} /> : <span />}
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
        <div ref={setSyncSlot} className="contents" />
        <DeviceQuickSearch
          className="w-full sm:w-[340px] sm:shrink-0"
          onSelect={(m) => { setCatId(m.categoryId); setBrandId(m.brandId); setModelId(m.id); setTab("price"); }}
        />
        <div ref={setSearchSlot} className="contents" />
        {tab === "price" && effModel && (
          <TableSearch
            value={partQ}
            onChange={setPartQ}
            placeholder="Search parts in this device by name or SKU…"
            animatedPrefix="Search parts by "
            animatedWords={["part name", "SKU", "part number"]}
            className="w-full sm:w-64"
          />
        )}
        </div>
      </div>

      {tab === "price" && !effModel && (
        <div className="grid place-items-center rounded-2xl border-2 border-dashed border-[#4361EE]/30 bg-[#EEF1FD]/40 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#4361EE]/10 text-[#4361EE]"><Search className="h-6 w-6" /></span>
          <p className="mt-3 font-display text-[16px] font-bold">Select a device to start</p>
          <p className="mt-1 max-w-md text-[13px] text-muted-foreground">Use <span className="font-semibold text-[#4361EE]">Search device</span> above to pick a model. Its parts, prices and profit will load here.</p>
        </div>
      )}

      {tab === "price" && effModel && (
        <>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[12.5px] text-muted-foreground">
            Showing parts for
            <span className="rounded-full bg-[#4361EE]/10 px-2.5 py-0.5 font-semibold text-[#4361EE]">
              {[cats.find((c) => c.id === effCat)?.name, brand?.name, model?.name].filter(Boolean).join(" · ") || "no device selected"}
            </span>
          </p>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <InvKpi label="Parts in model" value={rows.length} icon={Layers} tone="sky" hint={[brand?.name, model?.name].filter(Boolean).join(" · ") || undefined} />
            <InvKpi label="Linked to inventory" value={linked} icon={Link2} tone="emerald" />
            <InvKpi label="Not linked" value={rows.length - linked} icon={Link2Off} tone="rose" hint={rows.length - linked ? "Link or create below" : "All parts linked"} hintTone={rows.length - linked ? "danger" : "success"} />
            {canViewCost
              ? <InvKpi label={`Margin below ${LOW_MARGIN_PCT}%`} value={lowMargin} icon={Percent} tone="amber" hint={lowMargin ? "Review these prices" : "Margins look healthy"} hintTone={lowMargin ? "danger" : "success"} />
              : <InvKpi label={`Price changes (${PRICE_CHANGE_WINDOW_DAYS} days)`} value={activeChanges} icon={TrendingDown} tone="amber" />}
          </div>

          {belowCost.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] text-rose-700">
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{belowCost.length === 1 ? `${belowCost[0].part.partName} is` : `${belowCost.length} prices are`} set below the latest cost and would sell at a loss.</span>
            </div>
          )}

          <InvTable
            columns={columns}
            rows={visibleRows}
            flow
            rowKey={(r) => String(r.part.id)}
            resetKey={`${tab}|${effModel}|${partQ}`}
            emptyTitle="No parts for this model"
            emptyHint="Add parts to this model in Settings → Device Catalog, then link them here."
            itemLabel="part"
          />
          {canViewCost && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
              <span className="mr-1 text-[12px] font-semibold">Margin colour scale</span>
              {MARGIN_BANDS.map((b) => <span key={b.label} className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", b.cls)}>{b.label}</span>)}
            </div>
          )}
          {canViewCost && <p className="text-[12px] text-muted-foreground">Latest cost = cost price (updated by every received purchase). Avg. cost = average buying price of the last 3 months (* = no purchase in that time). Gross profit and margin use the latest cost.</p>}
        </>
      )}

      {tab === "link" && <PriceLinkPanel actionsSlot={syncSlot} />}
      {tab === "ledger" && canViewCost && <CostLedger inventory={inventory} layers={inventoryStockLayers} slot={searchSlot} />}
      {tab === "audit" && canViewCost && <PriceAudit slot={searchSlot} />}

      <RoxCenteredForm
        open={!!linkTarget}
        onClose={() => { setLinkTarget(null); setPicked(null); }}
        title="Link to inventory SKU"
        subtitle={linkTarget ? `${linkTarget.part.partName} · ${model?.name ?? ""}` : undefined}
        icon={Link2}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setLinkTarget(null); setPicked(null); }}>Cancel</Button>
            <Button onClick={confirmLink} disabled={!picked}>Link & use inventory price</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Label>Inventory item</Label>
          {picked ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-input px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Package className="h-4 w-4 shrink-0 text-[#4361EE]" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{picked.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{picked.id} · Selling {formatINR(effectiveSellingPrice(picked))} · Available {availableStock(picked)}</p>
                </div>
              </div>
              <button onClick={() => setPicked(null)} className="text-[12px] font-semibold text-[#4361EE] hover:underline">Change</button>
            </div>
          ) : (
            <InventorySearchBox kind="part" onSelect={setPicked} placeholder="Search the matching inventory part by name, SKU or category…" />
          )}
          <p className="text-[12px] text-muted-foreground">The part number becomes the SKU. From now on the Price List price follows this item&apos;s selling price.</p>
        </div>
      </RoxCenteredForm>

      <RoxCenteredForm
        open={!!costFor}
        onClose={() => setCostFor(null)}
        title="Set cost price"
        subtitle={costFor ? `${costFor.part.partName} · ${costFor.item?.id ?? ""}` : undefined}
        icon={IndianRupee}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCostFor(null)}>Cancel</Button>
            <Button onClick={saveCost}>Save cost</Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label>Cost price per unit (₹)</Label>
          <Input inputMode="decimal" value={costValue} onChange={(e) => setCostValue(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 4200" autoFocus />
          <p className="text-[12px] text-muted-foreground">Used for profit and margin until stock is received. After a goods receipt (GRN) the average purchase cost is used instead. Sales never see this.</p>
        </div>
      </RoxCenteredForm>

      <ConfirmDialog
        open={!!unlinkTarget}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={confirmUnlink}
        title="Unlink from inventory?"
        description={unlinkTarget ? `${unlinkTarget.part.partName} will keep its current price of ${formatINR(unlinkTarget.part.price)} but will no longer follow ${unlinkTarget.item?.id ?? "the inventory item"}. The inventory item is not changed. You can link it again any time.` : undefined}
        confirmLabel="Unlink"
        danger={false}
      />

      <RoxCenteredForm
        open={!!partForm}
        onClose={() => setPartForm(null)}
        title={partForm?.row ? "Edit Price List part" : "Add Price List part"}
        subtitle={[brand?.name, model?.name].filter(Boolean).join(" · ")}
        icon={partForm?.row ? Pencil : Plus}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPartForm(null)}>Cancel</Button>
            <Button onClick={savePartForm} disabled={savingForm}>{savingForm ? "Saving…" : partForm?.row ? "Save changes" : "Add part"}</Button>
          </div>
        }
      >
        {partForm && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Part name</Label><Input value={partForm.name} onChange={(e) => setPartForm({ ...partForm, name: e.target.value })} placeholder="e.g. Display Assembly" /></div>
            <div className="space-y-1.5"><Label>SKU / part number</Label><Input value={partForm.sku} onChange={(e) => setPartForm({ ...partForm, sku: e.target.value })} placeholder="Matches the inventory SKU to link" /></div>
            <div className="space-y-1.5"><Label>Warranty</Label><Select value={partForm.warranty} onChange={(e) => setPartForm({ ...partForm, warranty: e.target.value })} options={WARRANTIES.some((w) => w.value === partForm.warranty) ? WARRANTIES : [{ label: partForm.warranty, value: partForm.warranty }, ...WARRANTIES]} className="h-[36px]" /></div>
            {partForm.row && (() => {
              const item = partForm.row.item;
              const sp = Number(partForm.price) || 0;
              const avg = partForm.row.avg;
              const costNum = partForm.cost.trim() !== "" ? Number(partForm.cost) : undefined;
              // Profit preview uses the latest cost: the cost price being typed, else the current one.
              const base = costNum ?? partForm.row.latest;
              return (
                <>
                  <div className="space-y-1.5"><Label>Selling price (₹)</Label><Input inputMode="numeric" value={partForm.price} onChange={(e) => setPartForm({ ...partForm, price: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Set price" /></div>
                  {item && canEditCost ? (
                    <div className="space-y-1.5"><Label>Cost price (₹)</Label><Input inputMode="decimal" value={partForm.cost} onChange={(e) => setPartForm({ ...partForm, cost: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Not set" /></div>
                  ) : <div />}
                  {item && (
                    <div className="space-y-1.5">
                      <Label>Stock on hand</Label>
                      <Input inputMode="numeric" disabled={!canAdjust} value={partForm.stock} onChange={(e) => setPartForm({ ...partForm, stock: e.target.value.replace(/[^0-9]/g, "") })} />
                    </div>
                  )}
                  {item && canViewCost && (
                    <div className="space-y-1.5">
                      <Label>Avg. cost (3 months)</Label>
                      <div className="flex h-[36px] items-center rounded-xl border border-border bg-muted/30 px-3 text-[13px] tabular-nums text-muted-foreground">
                        {avg !== undefined ? formatINR(avg) : "—"}
                      </div>
                    </div>
                  )}
                  {canViewCost && base !== undefined && sp > 0 && (
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5 sm:col-span-2">
                      <span className="text-[12.5px] text-muted-foreground">Gross profit · Margin (on latest cost)</span>
                      <span className="flex items-center gap-2 text-[13.5px] font-bold tabular-nums">
                        <span className={cn(sp - base < 0 && "text-rose-600")}>{formatINR(sp - base)}</span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] ring-1 ring-inset", marginTone(((sp - base) / sp) * 100))}>{pct(((sp - base) / sp) * 100)}</span>
                      </span>
                    </div>
                  )}
                  {!item && <p className="text-[12px] text-muted-foreground sm:col-span-2">Link this part to inventory to manage cost and stock.</p>}
                  {item && <p className="text-[12px] text-muted-foreground sm:col-span-2">A stock change is saved as a stock adjustment in Stock Movement. Receiving a purchase (GRN) updates the cost price to that buying price.</p>}
                </>
              );
            })()}
            {!partForm.row && (
              <>
                <div className="space-y-1.5"><Label>Selling price (₹)</Label><Input inputMode="numeric" value={partForm.price} onChange={(e) => setPartForm({ ...partForm, price: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Optional" /></div>
                {canCreate && (
                  <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
                    <input type="checkbox" checked={createAfterAdd} onChange={(e) => setCreateAfterAdd(e.target.checked)} />
                    Also create the inventory item (set cost &amp; stock)
                  </label>
                )}
              </>
            )}
          </div>
        )}
      </RoxCenteredForm>

      <AddInventoryModal
        open={!!createFor}
        onClose={() => setCreateFor(null)}
        initialName={createFor ? `${model?.name ?? ""} ${createFor.part.partName}`.trim() : undefined}
        initialValues={createFor ? {
          sku: createFor.part.partNumber || "",
          sellingPrice: createFor.part.priceKnown === false ? "" : String(createFor.part.price),
          brandModel: [brand?.name, model?.name].filter(Boolean).join(" "),
        } : undefined}
        onCreated={(item) => {
          if (createFor) updatePart(createFor.part.id, { partNumber: item.id });
          setCreateFor(null);
        }}
      />
    </div>
  );
}

/* ── SKU Cost Ledger ─────────────────────────────────────────────────────── */
function CostLedger({ inventory, layers, slot }: { inventory: InventoryItem[]; layers: readonly StockLayerLike[]; slot: HTMLElement | null }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inventory
      .filter((i) => (i.kind ?? "part") === "part" && i.active !== false)
      .filter((i) => !s || `${i.name} ${i.id} ${i.store}`.toLowerCase().includes(s))
      .map((item) => ({ item, ...costOf(layers, item) }))
      .filter((r) => r.latest !== undefined || r.avg !== undefined);
  }, [inventory, layers, q]);
  type L = (typeof rows)[number];
  const columns: InvColumn<L>[] = [
    { key: "p", pct: 30, header: "Part / SKU", render: (r) => (<div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{r.item.name}</p><p className="truncate font-mono text-[11.5px] text-muted-foreground">{r.item.id}</p></div>) },
    { key: "loc", pct: 18, header: "Location", align: "center", render: (r) => <span className="truncate">{r.item.store || "—"}</span> },
    { key: "qty", pct: 10, header: "Qty", align: "center", render: (r) => <span className="tabular-nums">{r.item.currentStock}</span> },
    { key: "latest", pct: 14, header: "Latest cost", align: "center", render: (r) => <span className="tabular-nums">{r.latest !== undefined ? formatINR(r.latest) : "—"}</span> },
    { key: "avg", pct: 14, header: "Avg. cost (3 mo.)", align: "center", render: (r) => <span className="font-bold tabular-nums">{r.avg !== undefined ? formatINR(r.avg) : "—"}</span> },
    {
      key: "chg", pct: 14, header: "Latest vs avg.", align: "center", render: (r) => {
        if (r.latest === undefined || !r.avg) return <span className="text-muted-foreground">—</span>;
        const c = ((r.latest - r.avg) / r.avg) * 100;
        const tone = Math.abs(c) < 0.005 ? "bg-blue-50 text-blue-700 ring-blue-200" : c > 0 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
        return <span className={cn("flex h-7 w-full items-center justify-center rounded-full px-2.5 text-[11px] font-bold tabular-nums ring-1 ring-inset", tone)}>{signed(c, 2)}</span>;
      },
    },
  ];
  return (
    <>
      {slot && createPortal(<TableSearch value={q} onChange={setQ} placeholder="Search SKU, part or location…" animatedPrefix="Search by " animatedWords={["SKU", "part", "location"]} className="w-full sm:w-64" />, slot)}
      <InvTable columns={columns} rows={rows} rowKey={(r) => r.item.id} flow resetKey={q} emptyTitle="No cost recorded yet" emptyHint="Costs appear after a purchase is received (GRN) or an item has a cost price." itemLabel="SKU" />
      <p className="text-[12px] text-muted-foreground">Latest cost is the cost price; every confirmed goods receipt updates it. Avg. cost is the average buying price of the last 3 months. Pending purchases do not change either. Purchases are recorded under Purchasing → Receive Stock (GRN).</p>
    </>
  );
}

/* ── Price change audit (append-only, stock team only) ──────────────────── */
type AuditRow = { id: string; part_name: string | null; part_number: string | null; old_price: number; new_price: number; changed_by_name: string | null; source: string; changed_at: string };
const SOURCE_LABEL: Record<string, string> = { inventory: "Inventory", price_list: "Price List", sync: "Sync" };

function PriceAudit({ slot }: { slot: HTMLElement | null }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [q, setQ] = useState("");
  const live = isSupabaseConfigured && !!supabase;
  useEffect(() => {
    if (!live || !supabase) return;
    let off = false;
    supabase.from("price_change_log").select("id, part_name, part_number, old_price, new_price, changed_by_name, source, changed_at").order("changed_at", { ascending: false }).limit(500)
      .then(({ data }) => { if (!off) setRows((data ?? []).map((r: any) => ({ ...r, old_price: Number(r.old_price), new_price: Number(r.new_price) }))); });
    return () => { off = true; };
  }, [live]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || `${r.part_name} ${r.part_number} ${r.changed_by_name}`.toLowerCase().includes(s));
  }, [rows, q]);
  const columns: InvColumn<AuditRow>[] = [
    { key: "at", pct: 17, header: "When", render: (r) => <span className="whitespace-nowrap text-[12.5px]">{new Date(r.changed_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span> },
    { key: "p", pct: 27, header: "Part / SKU", render: (r) => (<div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{r.part_name ?? "—"}</p><p className="truncate font-mono text-[11.5px] text-muted-foreground">{r.part_number || "—"}</p></div>) },
    { key: "chg", pct: 20, header: "Price change", align: "center", render: (r) => (<span className="flex items-center justify-center gap-1.5 tabular-nums"><span className="text-muted-foreground line-through">{formatINR(r.old_price)}</span><ArrowRight className="h-3 w-3 text-muted-foreground" /><span className="font-semibold">{formatINR(r.new_price)}</span></span>) },
    {
      key: "pct", pct: 12, header: "Change", align: "center", render: (r) => {
        const c = ((r.new_price - r.old_price) / r.old_price) * 100;
        const up = c > 0;
        return <span className={cn("flex h-7 w-full items-center justify-center gap-1 rounded-full px-2.5 text-[11px] font-bold tabular-nums ring-1 ring-inset", up ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-rose-50 text-rose-700 ring-rose-200")}>{up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{signed(c)}</span>;
      },
    },
    { key: "by", pct: 14, header: "Changed by", align: "center", render: (r) => <span className="truncate">{r.changed_by_name || "System"}</span> },
    { key: "src", pct: 10, header: "Source", align: "center", render: (r) => <span className="text-[12.5px]">{SOURCE_LABEL[r.source] ?? r.source}</span> },
  ];
  if (!live) return <p className="rounded-2xl border border-border bg-card p-6 text-[13px] text-muted-foreground shadow-card"><History className="mb-2 h-5 w-5" />The price change audit is recorded by the database. Connect Supabase and apply migration 0124 to see it.</p>;
  return (
    <>
      {slot && createPortal(<TableSearch value={q} onChange={setQ} placeholder="Search part, SKU or user…" animatedPrefix="Search by " animatedWords={["part", "SKU", "changed by"]} className="w-full sm:w-64" />, slot)}
      <InvTable columns={columns} rows={shown} rowKey={(r) => r.id} flow resetKey={q} emptyTitle="No price changes yet" emptyHint="Every selling-price change is logged here automatically." itemLabel="change" />
    </>
  );
}
