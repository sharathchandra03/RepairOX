"use client";
/* Inventory → Low Stock Alerts: items at or below their minimum level, with a
   suggested reorder quantity (to reach max, or 2× min when no max is set).
   Ordering goes through a 2-step review wizard (LowStockPoDialog) — never a blind one-click PO. */
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Can } from "@/components/common/can";
import { CAP } from "@/lib/capabilities";
import { AlertTriangle, PackageX, TrendingDown, ShoppingCart, Truck, X } from "lucide-react";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { ExportMenu } from "@/components/inventory/export-menu";
import { LowStockPoDialog } from "@/components/inventory/low-stock-po-dialog";
import { InvKpi, InvPageHeader, ItemCell, StatusTabs, StockStatusPill, useInventoryScope } from "@/components/inventory/inv-ui";
import { availableStock, stockStatus, suggestedReorderQty } from "@/lib/inventory-analytics";
import { exportStock } from "@/lib/inventory-export";
import { cn, formatINR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";
type Tab = "all" | "low" | "out";

/** Available vs target (max, or 2× min) as a thin bar so severity reads at a glance. */
function LevelBar({ item }: { item: InventoryItem }) {
  const avail = availableStock(item);
  const target = item.maxStock > 0 ? item.maxStock : Math.max(item.minStock * 2, 1);
  const pct = Math.max(0, Math.min(100, (avail / target) * 100));
  const out = stockStatus(item) === "out";
  return (
    <div className="flex items-center gap-2" title={`${avail} of ${target} target`}>
      <span className="mx-auto h-1.5 w-full max-w-[56px] overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", out ? "bg-rose-500" : "bg-amber-500")} style={{ width: `${Math.max(pct, out ? 3 : 6)}%` }} />
      </span>
    </div>
  );
}

function LowStockInner() {
  const params = useSearchParams();
  const { stockItems, canViewCost } = useInventoryScope();
  const [tab, setTab] = useState<Tab>(params.get("status") === "out" ? "out" : params.get("status") === "low" ? "low" : "all");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [orderItems, setOrderItems] = useState<InventoryItem[] | null>(null);

  const alerts = useMemo(() => stockItems.filter((i) => stockStatus(i) !== "in"), [stockItems]);
  const locations = useMemo(() => [...new Set(alerts.map((i) => i.store).filter(Boolean))].sort(), [alerts]);
  const vendors = useMemo(() => [...new Set(alerts.map((i) => i.vendor).filter(Boolean) as string[])].sort(), [alerts]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts
      .filter((i) =>
        (tab === "all" || stockStatus(i) === tab) &&
        (location === "all" || i.store === location) &&
        (vendor === "all" || (vendor === "none" ? !i.vendor : i.vendor === vendor)) &&
        (!q || `${i.name} ${i.id} ${i.itemCode ?? ""} ${i.category} ${i.vendor ?? ""}`.toLowerCase().includes(q)))
      .sort((a, b) => availableStock(a) - availableStock(b));
  }, [alerts, tab, query, location, vendor]);

  const nLow = alerts.filter((i) => stockStatus(i) === "low").length;
  const nOut = alerts.length - nLow;
  const noVendor = alerts.filter((i) => !i.vendor).length;
  const toOrder = alerts.filter((i) => suggestedReorderQty(i) > 0);
  const unitsToOrder = toOrder.reduce((s, i) => s + suggestedReorderQty(i), 0);
  const orderValue = toOrder.reduce((s, i) => s + suggestedReorderQty(i) * (i.costPrice ?? 0), 0);
  const picked = rows.filter((r) => selected.has(r.id));
  const orderable = (list: InventoryItem[]) => list.filter((i) => suggestedReorderQty(i) > 0);
  const filtersOn = location !== "all" || vendor !== "all";

  const columns: InvColumn<InventoryItem>[] = [
    { key: "item", pct: 25, header: "Item", render: (r) => <ItemCell name={r.name} code={r.itemCode ?? r.id} sub={r.category} /> },
    { key: "loc", pct: 11, header: "Location", render: (r) => <span className="block truncate" title={r.store}>{r.store || "—"}</span> },
    {
      key: "vendor", pct: 15, header: "Vendor",
      render: (r) => r.vendor
        ? <span className="block truncate text-muted-foreground" title={r.vendor}>{r.vendor}</span>
        : <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">No vendor</span>,
    },
    { key: "level", pct: 8, header: "Level", align: "center", render: (r) => <LevelBar item={r} /> },
    { key: "avail", pct: 7, header: "Available", align: "right", render: (r) => <span className="font-bold tabular-nums text-rose-600">{availableStock(r)}</span> },
    { key: "min", pct: 5, header: "Min", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.minStock}</span> },
    { key: "max", pct: 5, header: "Max", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.maxStock || "—"}</span> },
    { key: "order", pct: 8, header: "Suggested", align: "right", render: (r) => <span className="font-semibold tabular-nums">{suggestedReorderQty(r)}</span> },
    { key: "status", pct: 11, header: "Status", align: "center", render: (r) => <StockStatusPill status={stockStatus(r)} /> },
    {
      key: "act", pct: 8, header: "Action", align: "center",
      render: (r) => (
        <Can permission={CAP.inventory.purchase}>
          <Button size="sm" variant="outline" disabled={suggestedReorderQty(r) <= 0} onClick={(e) => { e.stopPropagation(); setOrderItems([r]); }}>Reorder</Button>
        </Can>
      ),
    },
  ];

  const bulkTarget = picked.length > 0 ? picked : rows;
  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={AlertTriangle}
        title="Low Stock Alerts"
        subtitle="Items at or below their minimum level. Reserved units are not counted as available."
        actions={
          <>
            <Can permission={CAP.inventory.purchase}>
              <Button className="gap-2" disabled={orderable(bulkTarget).length === 0} onClick={() => setOrderItems(orderable(bulkTarget))}>
                <ShoppingCart className="h-4 w-4" />
                {picked.length > 0 ? `Order selected (${orderable(picked).length})` : "Create purchase order"}
              </Button>
            </Can>
            <ExportMenu onExport={(f) => exportStock(rows, canViewCost, f, "repairox-low-stock")} />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InvKpi label="Out of stock" value={nOut} icon={PackageX} tone="rose" hint={nOut ? "Needs ordering now" : "None"} hintTone={nOut ? "danger" : "success"} />
        <InvKpi label="Low stock" value={nLow} icon={TrendingDown} tone="amber" hint="At or below minimum" />
        <InvKpi label="Units to reorder" value={unitsToOrder} icon={ShoppingCart} tone="brand" hint={canViewCost ? `≈ ${formatINR(orderValue)} at cost` : `${toOrder.length} items`} />
        <InvKpi label="Missing vendor" value={noVendor} icon={Truck} tone="violet" hint={noVendor ? "Assign one when ordering" : "All items have a vendor"} hintTone={noVendor ? "danger" : "success"} />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: `All (${alerts.length})` },
            { value: "low", label: `Low (${nLow})` },
            { value: "out", label: `Out of stock (${nOut})` },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select className="h-[34px] min-w-[150px]" value={location} onChange={(e) => setLocation(e.target.value)} options={[{ label: "All locations", value: "all" }, ...locations.map((l) => ({ label: l, value: l }))]} />
          <Select className="h-[34px] min-w-[160px]" value={vendor} onChange={(e) => setVendor(e.target.value)} options={[{ label: "All vendors", value: "all" }, { label: "No vendor", value: "none" }, ...vendors.map((v) => ({ label: v, value: v }))]} />
          {filtersOn && (
            <button onClick={() => { setLocation("all"); setVendor("all"); }} className="inline-flex h-[34px] items-center gap-1 rounded-full border border-input px-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />Clear
            </button>
          )}
          <TableSearch
            value={query}
            onChange={setQuery}
            placeholder="Search alerts by item, SKU, category or vendor…"
            animatedPrefix="Search by "
            animatedWords={["item name", "SKU", "category", "vendor"]}
            className="w-full sm:w-64"
          />
        </div>
      </div>
      <InvTable
        fill
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        selectLabel="Select all alerts"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        resetKey={`${tab}|${query}|${location}|${vendor}`}
        emptyTitle="No stock alerts"
        emptyHint="Every tracked item is above its minimum level."
        itemLabel="alert"
      />
      <LowStockPoDialog open={orderItems !== null} items={orderItems ?? []} canViewCost={canViewCost} onClose={() => { setOrderItems(null); setSelected(new Set()); }} />
    </div>
  );
}
export default function LowStockPage() {
  return <Suspense fallback={null}><LowStockInner /></Suspense>;
}
