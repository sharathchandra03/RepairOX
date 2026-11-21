/* Inventory spreadsheet helpers — ONE row-builder feeds both Excel and CSV so
   the two formats always contain identical data (spreadsheet standard).
   Cost columns are only emitted for users who hold CAP.inventory.viewCost. */
import type { InventoryItem } from "@/lib/inventory-data";
import { availableStock, effectiveSellingPrice, STOCK_STATUS_LABEL, stockStatus } from "@/lib/inventory-analytics";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";

export function stockExportTable(items: InventoryItem[], canCost: boolean): { headers: string[]; rows: (string | number)[][] } {
  const headers = [
    "SKU", "Item Code", "Item Name", "Category", "Brand / Model", "Location", "Unit",
    "On Hand", "Reserved", "Available", "Min Stock", "Max Stock", "Status",
    "Selling Price", "Stock Value (Selling)", "Vendor", "Barcode",
    ...(canCost ? ["Cost Price", "Stock Value (Cost)"] : []),
  ];
  const rows = items.map((it) => {
    const sp = effectiveSellingPrice(it);
    const base: (string | number)[] = [
      it.id, it.itemCode ?? "", it.name, it.category, it.brandModel ?? "", it.store, it.uom,
      it.currentStock, it.reservedStock ?? 0, availableStock(it), it.minStock, it.maxStock,
      STOCK_STATUS_LABEL[stockStatus(it)], sp, Math.max(it.currentStock, 0) * sp, it.vendor ?? "", it.barcode ?? "",
    ];
    if (canCost) {
      const cp = it.costPrice ?? "";
      base.push(cp, typeof cp === "number" ? Math.max(it.currentStock, 0) * cp : "");
    }
    return base;
  });
  return { headers, rows };
}

export async function exportStock(items: InventoryItem[], canCost: boolean, format: "xlsx" | "csv", name = "repairox-stock") {
  const { headers, rows } = stockExportTable(items, canCost);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") await downloadXLSX(`${name}-${stamp}`, headers, rows, "Stock");
  else downloadCSV(`${name}-${stamp}.csv`, toCSV(headers, rows));
}

/** ₹1.2Cr / ₹28.5L / ₹4.2K — compact money for KPI cards. */
export function compactINR(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, "")}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, "")}L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `${s}₹${Math.round(a)}`;
}
