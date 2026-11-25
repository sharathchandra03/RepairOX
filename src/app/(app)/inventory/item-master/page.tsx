"use client";

/* Inventory → Item Master: the catalogue of every part and service.
   Columns fit their content; price tiers that rarely matter (wholesale, dealer,
   distributor) stay in the item form instead of widening this table. Cost and
   margin only render for users with CAP.sensitive.viewCost. */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, Copy, MoreHorizontal, Pencil, Plus, Tag, Trash2, Upload, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/input";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { ExportMenu } from "@/components/inventory/export-menu";
import { InvPageHeader, StatusTabs, StockStatusPill, useInventoryScope } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { effectiveSellingPrice, stockStatus } from "@/lib/inventory-analytics";
import { exportStock } from "@/lib/inventory-export";
import { cn, formatINR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";

type Tab = "all" | "part" | "service" | "attention" | "inactive" | "needs_review";

const MIGRATION_FLAG_LABEL: Record<string, string> = {
  unrecognised_item_type: "Unrecognised legacy item type",
  service_with_stock: "Service carrying stray stock values",
};
const kindOf = (i: InventoryItem) => i.kind ?? (i.type === "Service" ? "service" : "part");
const isTracked = (i: InventoryItem) => kindOf(i) === "part" && i.trackStock !== false;
const needsAttention = (i: InventoryItem) => i.active && isTracked(i) && stockStatus(i) !== "in";

function ItemMasterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermissions();
  const { deleteInventoryItem, reconcileMigrationFlag } = useStore();
  const { inventory, canViewCost, canEdit } = useInventoryScope();
  const canDelete = allow(can, CAP.inventory.delete);

  const [tab, setTab] = useState<Tab>("all");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewItem, setReviewItem] = useState<InventoryItem | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);

  const hasFlagged = useMemo(() => inventory.some((i) => !!i.migrationFlag), [inventory]);
  useEffect(() => {
    const s = params.get("status");
    if (s === "low" || s === "out") setTab("attention");
    else if (s === "inactive") setTab("inactive");
  }, [params]);

  const categories = useMemo(() => [...new Set(inventory.map((i) => i.category).filter(Boolean))].sort(), [inventory]);
  const locations = useMemo(() => [...new Set(inventory.map((i) => i.store).filter(Boolean))].sort(), [inventory]);

  const counts = useMemo(() => ({
    all: inventory.length,
    part: inventory.filter((i) => kindOf(i) === "part").length,
    service: inventory.filter((i) => kindOf(i) === "service").length,
    attention: inventory.filter(needsAttention).length,
    inactive: inventory.filter((i) => !i.active).length,
    needs_review: inventory.filter((i) => !!i.migrationFlag).length,
  }), [inventory]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter((i) => {
      if (tab === "part" && kindOf(i) !== "part") return false;
      if (tab === "service" && kindOf(i) !== "service") return false;
      if (tab === "attention" && !needsAttention(i)) return false;
      if (tab === "inactive" && i.active) return false;
      if (tab === "needs_review" && !i.migrationFlag) return false;
      if (category !== "all" && i.category !== category) return false;
      if (location !== "all" && i.store !== location) return false;
      if (q && !`${i.name} ${i.id} ${i.itemCode ?? ""} ${i.serviceCode ?? ""} ${i.barcode ?? ""} ${i.brandModel ?? ""} ${i.category} ${i.hsnCode} ${i.vendor ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inventory, tab, category, location, query]);

  const selectedItems = useMemo(() => inventory.filter((i) => selected.has(i.id)), [inventory, selected]);

  async function confirmDelete() {
    if (!deleteIds || !canDelete) return;
    for (const id of deleteIds) await deleteInventoryItem(id);
    toast.success(`${deleteIds.length} item${deleteIds.length === 1 ? "" : "s"} deleted`);
    setSelected((p) => { const n = new Set(p); deleteIds.forEach((id) => n.delete(id)); return n; });
    setDeleteIds(null);
  }

  const marginPct = (i: InventoryItem) => {
    const sp = effectiveSellingPrice(i);
    const cp = kindOf(i) === "service" ? i.standardLabourCost : i.costPrice;
    return cp === undefined || i.costState !== "configured" || sp <= 0 ? null : Math.round(((sp - cp) / sp) * 100);
  };

  const columns: InvColumn<InventoryItem>[] = [
    {
      key: "item", header: "Item", grow: true, min: 260,
      render: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", kindOf(r) === "service" ? "bg-violet-50 text-violet-600" : "bg-[#EEF1FD] text-[#4361EE]")}>
            {kindOf(r) === "service" ? <Wrench className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[13.5px] font-semibold" title={r.name}>{r.name}</p>
              {!r.active && <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-px text-[10px] font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200">Inactive</span>}
              {canEdit && r.migrationFlag && (
                <button type="button" title={MIGRATION_FLAG_LABEL[r.migrationFlag] ?? "Needs review"} onClick={(e) => { e.stopPropagation(); setReviewItem(r); }} className="shrink-0 rounded-full bg-amber-50 px-2 py-px text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
                  Needs review
                </button>
              )}
            </div>
            <p className="truncate text-[11.5px] text-muted-foreground">{[r.itemCode || r.serviceCode || r.id, r.brandModel].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", align: "center", min: 84, render: (r) => <span className={cn("flex h-7 w-full items-center justify-center rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", kindOf(r) === "service" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-sky-50 text-sky-700 ring-sky-200")}>{kindOf(r) === "service" ? "Service" : "Part"}</span> },
    { key: "category", header: "Category", max: 150, render: (r) => <span title={r.category}>{r.category || "—"}</span> },
    { key: "loc", header: "Location", max: 120, render: (r) => <span className="text-muted-foreground" title={r.store}>{r.store || "—"}</span> },
    {
      key: "stock", header: "Stock", align: "center",
      render: (r) => isTracked(r)
        ? <span className={cn("font-semibold tabular-nums", r.currentStock < 0 && "text-rose-600")}>{r.currentStock}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "status", header: "Status", align: "center", min: 120,
      render: (r) => isTracked(r) ? <StockStatusPill status={stockStatus(r)} /> : <span className="text-muted-foreground">—</span>,
    },
    { key: "sell", header: "Selling Price", align: "center", render: (r) => { const p = kindOf(r) === "service" ? r.serviceCharge || effectiveSellingPrice(r) : effectiveSellingPrice(r); return <span className={cn("font-semibold tabular-nums", p <= 0 && "text-amber-600")}>{p > 0 ? formatINR(p) : "Not set"}</span>; } },
    { key: "mrp", header: "MRP", align: "center", render: (r) => <span className="tabular-nums text-muted-foreground">{r.mrp ? formatINR(r.mrp) : "—"}</span> },
    { key: "cost", header: "Cost", align: "center", hidden: !canViewCost, render: (r) => { const c = kindOf(r) === "service" ? r.standardLabourCost : r.costPrice; return <span className="tabular-nums text-muted-foreground">{c !== undefined && r.costState === "configured" ? formatINR(c) : "—"}</span>; } },
    { key: "margin", header: "Margin", align: "center", hidden: !canViewCost, render: (r) => { const m = marginPct(r); return m === null ? <span className="text-muted-foreground">—</span> : <span className={cn("font-semibold tabular-nums", m < 15 ? "text-amber-600" : "text-emerald-600")}>{m}%</span>; } },
    { key: "tax", header: "GST · HSN", align: "center", render: (r) => <div className="leading-tight"><span className="font-semibold tabular-nums">{r.tax}%</span><span className="block font-mono text-[11px] text-muted-foreground">{r.hsnCode && r.hsnCode !== "—" ? r.hsnCode : "no HSN"}</span></div> },
    { key: "vendor", header: "Vendor", max: 140, render: (r) => <span className="text-muted-foreground" title={r.vendor}>{r.vendor || "—"}</span> },
    {
      key: "actions", header: "", align: "right", min: 52,
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            width="w-44"
            trigger={({ toggle }) => <button onClick={toggle} aria-label="Row actions" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>}
          >
            {(close) => (
              <>
                {canEdit && <MenuItem icon={Pencil} onClick={() => { close(); router.push(`/inventory/add-item?edit=${encodeURIComponent(r.id)}`); }}>Edit item</MenuItem>}
                {allow(can, CAP.inventory.create) && <MenuItem icon={Copy} onClick={() => { close(); router.push(`/inventory/add-item?copy=${encodeURIComponent(r.id)}`); }}>Duplicate</MenuItem>}
                {canDelete && <MenuItem icon={Trash2} danger onClick={() => { close(); setDeleteIds([r.id]); }}>Delete</MenuItem>}
              </>
            )}
          </Dropdown>
        </div>
      ),
    },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={Boxes}
        title="Item Master"
        subtitle="Every part and service you stock or bill, with prices and stock health"
        actions={
          <>
            <ExportMenu onExport={(f) => exportStock(rows.filter((i) => kindOf(i) === "part"), canViewCost, f, "repairox-item-master")} />
            <Can permission={CAP.inventory.create}>
              <Link href="/inventory/import-export"><Button variant="outline" className="gap-2"><Upload className="h-4 w-4" />Import</Button></Link>
              <Link href="/inventory/add-item"><Button className="gap-2"><Plus className="h-4 w-4" />Add Item</Button></Link>
            </Can>
          </>
        }
      />


      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <StatusTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: `All (${counts.all})` },
            { value: "part", label: `Parts (${counts.part})` },
            { value: "service", label: `Services (${counts.service})` },
            { value: "attention", label: `Needs attention (${counts.attention})` },
            { value: "inactive", label: `Inactive (${counts.inactive})` },
            ...(canEdit && hasFlagged ? [{ value: "needs_review" as Tab, label: `Needs review (${counts.needs_review})` }] : []),
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select className="h-[34px] min-w-[150px]" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ label: "All categories", value: "all" }, ...categories.map((c) => ({ label: c, value: c }))]} />
          <Select className="h-[34px] min-w-[150px]" value={location} onChange={(e) => setLocation(e.target.value)} options={[{ label: "All locations", value: "all" }, ...locations.map((c) => ({ label: c, value: c }))]} />
          <TableSearch
            value={query}
            onChange={setQuery}
            placeholder="Search items by name, SKU, code, barcode, model, HSN or vendor…"
            animatedPrefix="Search by "
            animatedWords={["item name", "SKU", "item code", "barcode", "brand / model", "HSN", "vendor"]}
            className="w-full sm:w-64"
          />
        </div>
      </div>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD] px-4 py-2.5">
          <span className="rounded-full bg-[#4361EE] px-3 py-1 text-[12px] font-semibold text-white">{selectedItems.length} selected</span>
          <ExportMenu label="Export selected" onExport={(f) => exportStock(selectedItems.filter((i) => kindOf(i) === "part"), canViewCost, f, "repairox-selected-items")} />
          {canDelete && <Button variant="destructive" className="gap-2" onClick={() => setDeleteIds(selectedItems.map((i) => i.id))}><Trash2 className="h-4 w-4" />Delete</Button>}
          <button onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#4361EE] hover:underline"><X className="h-3.5 w-3.5" />Clear</button>
        </div>
      )}

      <InvTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        selectLabel="Select all items"
        onRowClick={canEdit ? (r) => router.push(`/inventory/add-item?edit=${encodeURIComponent(r.id)}`) : undefined}
        resetKey={`${tab}|${category}|${location}|${query}`}
        emptyTitle="No items found"
        emptyHint="Adjust the filters or search, or add a new item."
        itemLabel="item"
      />

      <ConfirmDialog
        open={!!deleteIds}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
        title={`Delete ${deleteIds?.length ?? 0} item${deleteIds?.length === 1 ? "" : "s"}?`}
        description="Deleted items disappear from the catalogue and from new invoices. Existing documents keep their history."
        confirmLabel="Delete"
      />
      {/* Deliberate, confirmed reconciliation of a legacy review flag. */}
      <ConfirmDialog
        open={!!reviewItem}
        onClose={() => setReviewItem(null)}
        onConfirm={() => { if (reviewItem) reconcileMigrationFlag(reviewItem.id); setReviewItem(null); }}
        danger={false}
        title="Mark this item reviewed?"
        description={reviewItem?.migrationFlag === "service_with_stock"
          ? "This clears the review flag and resets the stray stock (quantity, min, max) that a service should not carry. This cannot be undone."
          : "This clears the legacy review flag now that the item type is valid."}
        confirmLabel="Mark reviewed"
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />}>
      <ItemMasterInner />
    </Suspense>
  );
}
