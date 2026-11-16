/* Inventory helpers for the Ninja app. Read-only view of the Inventory Master: a Ninja searches
   items and bills them on an invoice line; stock is never edited here (the server finalize-costing
   route owns the single, idempotent stock deduction). Cost prices are never shown. */
import type { InventoryItem } from "@/lib/inventory-data";

export type StockState = "service" | "in" | "low" | "out";

export const isService = (i: InventoryItem) => i.kind === "service" || i.trackStock === false;
export const sellPrice = (i: InventoryItem) => Number((isService(i) ? i.serviceCharge : undefined) || i.regularSellingPrice || i.defaultPrice || 0);
export const availableQty = (i: InventoryItem) => Math.max(0, Number(i.currentStock || 0) - Number(i.reservedStock || 0));

export function stockState(i: InventoryItem): StockState {
  if (isService(i)) return "service";
  const a = availableQty(i);
  if (a <= 0) return "out";
  return a <= Math.max(0, Number(i.minStock || 0)) ? "low" : "in";
}

export const STOCK_LABEL: Record<StockState, string> = { service: "Service", in: "In stock", low: "Low stock", out: "Out of stock" };
export const STOCK_TONE: Record<StockState, "green" | "amber" | "rose" | "sky"> = { service: "sky", in: "green", low: "amber", out: "rose" };

/** Structured-field search (name, SKU, item code, barcode, category, brand/model, HSN). Every word must match. */
export function searchStock(items: InventoryItem[], q: string): InventoryItem[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((i) => {
    const hay = [i.name, i.id, i.itemCode, i.serviceCode, i.barcode, i.category, i.brandModel, i.hsnCode].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
