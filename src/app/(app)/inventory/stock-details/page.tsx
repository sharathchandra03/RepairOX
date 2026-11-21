"use client";

/* Inventory → Stock Details: item-level stock with a visual stock meter, reserved
   vs available, reorder band and value. Columns fit their content (see InvTable);
   brand / model and code live under the item name instead of taking their own
   columns. Cost appears only for users with CAP.sensitive.viewCost. */

import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, IndianRupee, PackageX, Table2 } from "lucide-react";
import { Select } from "@/components/ui/input";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { ExportMenu } from "@/components/inventory/export-menu";
import { InvKpi, InvPageHeader, ItemCell, StatusTabs, StockStatusPill, useInventoryScope } from "@/components/inventory/inv-ui";
import { availableStock, effectiveSellingPrice, stockStatus, stockTotals, type StockStatus } from "@/lib/inventory-analytics";
import { compactINR, exportStock } from "@/lib/inventory-export";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";

type Tab = "all" | StockStatus;

const BAR: Record<StockStatus, string> = { in: "bg-emerald-500", low: "bg-amber-500", out: "bg-rose-500" };

/** On-hand number with a thin meter: full = max level (or 3× min when no max). */
function StockMeter({ item }: { item: InventoryItem }) {
  const st = stockStatus(item);
  const cap = item.maxStock > 0 ? item.maxStock : Math.max(item.minStock * 3, item.currentStock, 1);
  const pct = Math.max(0, Math.min(100, (item.currentStock / cap) * 100));
  return (
    <div className="inline-flex min-w-[76px] flex-col items-end gap-1">
      <span className="font-semibold tabular-nums">{item.currentStock}</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", BAR[st])} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

export default function StockDetailsPage() {
  const { stockItems, canViewCost } = useInventoryScope();
  const [tab, setTab] = useState<Tab>("all");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => [...new Set(stockItems.map((i) => i.category).filter(Boolean))].sort(), [stockItems]);
  const locations = useMemo(() => [...new Set(stockItems.map((i) => i.store).filter(Boolean))].sort(), [stockItems]);
  const totals = useMemo(() => stockTotals(stockItems), [stockItems]);
  const useCost = canViewCost && totals.costValue !== undefined;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stockItems.filter((i) => {
      if (tab !== "all" && stockStatus(i) !== tab) return false;
      if (category !== "all" && i.category !== category) return false;
      if (location !== "all" && i.store !== location) return false;
      if (q && !`${i.name} ${i.id} ${i.itemCode ?? ""} ${i.barcode ?? ""} ${i.brandModel ?? ""} ${i.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stockItems, tab, category, location, query]);

  const counts = useMemo(() => {
    const c = { all: stockItems.length, in: 0, low: 0, out: 0 };
    stockItems.forEach((i) => { c[stockStatus(i)]++; });
    return c;
  }, [stockItems]);

  const columns: InvColumn<InventoryItem>[] = [
    { key: "item", header: "Item", grow: true, render: (r) => <ItemCell name={r.name} code={r.itemCode || r.id} sub={r.brandModel} /> },
    { key: "category", header: "Category", max: 150, render: (r) => <span title={r.category}>{r.category || "—"}</span> },
    { key: "loc", header: "Location", max: 130, render: (r) => <span className="text-muted-foreground" title={r.store}>{r.store || "—"}</span> },
    { key: "onhand", header: "On Hand", align: "right", render: (r) => <StockMeter item={r} /> },
    {
      key: "avail", header: "Available", align: "right",
      render: (r) => {
        const a = availableStock(r); const res = r.reservedStock ?? 0;
        return (
          <div className="inline-flex flex-col items-end leading-tight">
            <span className={a <= 0 ? "font-bold tabular-nums text-rose-600" : "font-semibold tabular-nums"}>{a}</span>
            {res > 0 && <span className="text-[11px] text-muted-foreground">{res} reserved</span>}
          </div>
        );
      },
    },
    { key: "band", header: "Min / Max", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.minStock} / {r.maxStock || "—"}</span> },
    { key: "cost", header: "Cost", align: "right", hidden: !canViewCost, render: (r) => <span className="tabular-nums text-muted-foreground">{r.costPrice !== undefined && r.costState === "configured" ? formatINR(r.costPrice) : "—"}</span> },
    { key: "sell", header: "Selling Price", align: "right", render: (r) => <span className="font-semibold tabular-nums">{formatINR(effectiveSellingPrice(r))}</span> },
    { key: "value", header: "Stock Value", align: "right", render: (r) => <span className="tabular-nums">{formatINR(Math.max(r.currentStock, 0) * effectiveSellingPrice(r))}</span> },
    { key: "status", header: "Status", min: 124, render: (r) => <StockStatusPill status={stockStatus(r)} /> },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={Table2}
        title="Stock Details"
        subtitle="Item-level stock across every location"
        actions={<ExportMenu onExport={(f) => exportStock(rows, canViewCost, f, "repairox-stock-details")} />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <InvKpi label="Items tracked" value={formatNumber(totals.skus)} hint={`${formatNumber(totals.units)} units on hand`} icon={Boxes} />
        <InvKpi label={useCost ? "Stock value (cost)" : "Stock value"} value={compactINR(useCost ? (totals.costValue as number) : totals.sellValue)} hint={useCost ? `${compactINR(totals.sellValue)} at selling price` : "At selling price"} icon={IndianRupee} tone="emerald" />
        <InvKpi label="Low stock" value={counts.low} hint={counts.low ? "At or below minimum" : "All healthy"} hintTone={counts.low ? "danger" : "success"} icon={AlertTriangle} tone="amber" />
        <InvKpi label="Out of stock" value={counts.out} hint={counts.out ? "Not available to sell" : "None"} hintTone={counts.out ? "danger" : "success"} icon={PackageX} tone="rose" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: `All (${counts.all})` },
            { value: "in", label: `In Stock (${counts.in})` },
            { value: "low", label: `Low (${counts.low})` },
            { value: "out", label: `Out (${counts.out})` },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select className="h-[34px] min-w-[150px]" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ label: "All categories", value: "all" }, ...categories.map((c) => ({ label: c, value: c }))]} />
          <Select className="h-[34px] min-w-[150px]" value={location} onChange={(e) => setLocation(e.target.value)} options={[{ label: "All locations", value: "all" }, ...locations.map((c) => ({ label: c, value: c }))]} />
          <TableSearch
            value={query}
            onChange={setQuery}
            placeholder="Search items by name, SKU, barcode, model or category…"
            animatedPrefix="Search by "
            animatedWords={["item name", "SKU", "barcode", "brand / model", "category"]}
            className="w-full sm:w-64"
          />
        </div>
      </div>

      <InvTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        resetKey={`${tab}|${category}|${location}|${query}`}
        emptyTitle="No stock items match"
        emptyHint="Try a different status, category or search."
        itemLabel="item"
      />
    </div>
  );
}
