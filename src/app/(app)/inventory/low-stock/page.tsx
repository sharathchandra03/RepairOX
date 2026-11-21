"use client";

/* Inventory → Low Stock Alerts: items at or below their minimum level, with a
   suggested reorder quantity (to reach max, or 2× min when no max is set). */

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { CAP } from "@/lib/capabilities";
import { toast } from "@/components/ui/toaster";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { AlertTriangle } from "lucide-react";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { ExportMenu } from "@/components/inventory/export-menu";
import { InvPageHeader, ItemCell, StatusTabs, StockStatusPill, useInventoryScope } from "@/components/inventory/inv-ui";
import { availableStock, stockStatus, suggestedReorderQty } from "@/lib/inventory-analytics";
import { exportStock } from "@/lib/inventory-export";
import type { InventoryItem } from "@/lib/inventory-data";

type Tab = "all" | "low" | "out";

function LowStockInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { createDoc } = useInventoryActions();
  const [creating, setCreating] = useState(false);
  const { stockItems, canViewCost } = useInventoryScope();
  const [tab, setTab] = useState<Tab>(params.get("status") === "out" ? "out" : params.get("status") === "low" ? "low" : "all");
  const [query, setQuery] = useState("");

  const alerts = useMemo(() => stockItems.filter((i) => stockStatus(i) !== "in"), [stockItems]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts
      .filter((i) => (tab === "all" || stockStatus(i) === tab) && (!q || `${i.name} ${i.id} ${i.itemCode ?? ""} ${i.category} ${i.vendor ?? ""}`.toLowerCase().includes(q)))
      .sort((a, b) => availableStock(a) - availableStock(b));
  }, [alerts, tab, query]);

  /** One draft PO per vendor, with the suggested reorder quantities. */
  async function createPos() {
    if (creating) return;
    const byVendor = new Map<string, InventoryItem[]>();
    let noVendor = 0;
    for (const i of rows) {
      if (suggestedReorderQty(i) <= 0) continue;
      if (!i.vendor) { noVendor++; continue; }
      byVendor.set(i.vendor, [...(byVendor.get(i.vendor) ?? []), i]);
    }
    if (byVendor.size === 0) { toast.error(noVendor ? "Set a vendor on these items first (Item Master)" : "Nothing to order"); return; }
    setCreating(true);
    let last: string | null = null;
    for (const [vendor, items] of byVendor) {
      const doc = await createDoc("purchase_order", {
        party: vendor,
        lines: items.map((i) => ({ itemId: i.id, name: i.name, qty: suggestedReorderQty(i), unitCost: canViewCost ? i.costPrice ?? 0 : 0 })),
        data: { notes: "Created from Low Stock Alerts" },
      });
      if (doc) last = doc.id;
    }
    setCreating(false);
    toast.success(`${byVendor.size} draft purchase order${byVendor.size === 1 ? "" : "s"} created${noVendor ? ` · ${noVendor} item(s) skipped (no vendor)` : ""}`);
    if (last && byVendor.size === 1) router.push(`/inventory/docs/${last}`); else router.push("/inventory/purchase-orders");
  }

  const nLow = alerts.filter((i) => stockStatus(i) === "low").length;
  const nOut = alerts.length - nLow;

  const columns: InvColumn<InventoryItem>[] = [
    { key: "item", grow: true, header: "Item", render: (r) => <ItemCell name={r.name} code={r.itemCode ?? r.id} sub={r.category} /> },
    { key: "loc", header: "Location", render: (r) => <span className="block truncate" title={r.store}>{r.store || "—"}</span> },
    { key: "vendor", header: "Vendor", render: (r) => <span className="block truncate text-muted-foreground" title={r.vendor}>{r.vendor || "—"}</span> },
    { key: "avail", header: "Available", align: "right", render: (r) => <span className="font-bold tabular-nums text-rose-600">{availableStock(r)}</span> },
    { key: "min", header: "Min", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.minStock}</span> },
    { key: "max", header: "Max", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.maxStock || "—"}</span> },
    { key: "order", header: "Suggested Order", align: "right", render: (r) => <span className="font-semibold tabular-nums">{suggestedReorderQty(r)}</span> },
    { key: "status", min: 130, header: "Status", render: (r) => <StockStatusPill status={stockStatus(r)} /> },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={AlertTriangle}
        title="Low Stock Alerts"
        subtitle="Items at or below their minimum level. Reserved units are not counted as available."
        actions={
          <>
            <Can permission={CAP.inventory.purchase}><Button className="gap-2" onClick={createPos} disabled={creating || rows.length === 0}>{creating ? "Creating…" : "Create purchase orders"}</Button></Can>
            <ExportMenu onExport={(f) => exportStock(rows, canViewCost, f, "repairox-low-stock")} />
          </>
        }
      />
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
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Search alerts by item, SKU, category or vendor…"
          animatedPrefix="Search by "
          animatedWords={["item name", "SKU", "category", "vendor"]}
          className="w-full sm:w-64"
        />
      </div>
      <InvTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        resetKey={`${tab}|${query}`}
        emptyTitle="No stock alerts"
        emptyHint="Every tracked item is above its minimum level."
        itemLabel="alert"
      />
    </div>
  );
}

export default function LowStockPage() {
  return <Suspense fallback={null}><LowStockInner /></Suspense>;
}
