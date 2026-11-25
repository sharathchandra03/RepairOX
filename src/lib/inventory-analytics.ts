/* ──────────────────────────────────────────────────────────────────────────
   Inventory analytics — pure derivations over the canonical Inventory Master
   (useStore().inventory), stock movements and finalized-ish invoice lines.

   Nothing here is stored: every number is computed from real records, never a
   manual counter. Cost is optional (only callers holding CAP.inventory.viewCost
   ever receive a populated costPrice on the item), so every value helper has a
   selling-price variant that is safe for sales users.
   ────────────────────────────────────────────────────────────────────────── */
import type { InventoryItem, StockMovement } from "@/lib/inventory-data";

export type StockStatus = "in" | "low" | "out";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  in: "In Stock",
  low: "Low Stock",
  out: "Out of Stock",
};

/** Parts that actually carry stock (services and non-tracked goods are excluded). */
export function isStockItem(it: InventoryItem): boolean {
  const kind = it.kind ?? (it.type === "Service" ? "service" : "part");
  return kind === "part" && it.trackStock !== false && it.active !== false;
}

/** Selling price a customer pays — the ONLY price sales users see. */
export function effectiveSellingPrice(it: InventoryItem): number {
  return (it.sellingPrice ?? 0) > 0 ? (it.sellingPrice as number) : it.regularSellingPrice || 0;
}

/** Units free to sell = on hand − reserved by tickets. */
export function availableStock(it: InventoryItem): number {
  return (it.currentStock ?? 0) - (it.reservedStock ?? 0);
}

export function stockStatus(it: InventoryItem): StockStatus {
  const avail = availableStock(it);
  if (avail <= 0) return "out";
  if ((it.minStock ?? 0) > 0 && avail <= it.minStock) return "low";
  return "in";
}

/** Units to order to get back to max (or 2× min when no max is set). */
export function suggestedReorderQty(it: InventoryItem): number {
  const target = it.maxStock > 0 ? it.maxStock : Math.max(it.minStock * 2, 0);
  return Math.max(0, Math.ceil(target - availableStock(it)));
}

/* ── Totals ─────────────────────────────────────────────────────────────── */

export type StockTotals = {
  skus: number;
  units: number;
  reserved: number;
  low: number;
  out: number;
  /** Value at selling price (always available). */
  sellValue: number;
  /** Value at cost — undefined when no item carries a cost (sales users). */
  costValue: number | undefined;
};

export function stockTotals(items: InventoryItem[]): StockTotals {
  let units = 0, reserved = 0, low = 0, out = 0, sellValue = 0, costValue = 0, anyCost = false;
  for (const it of items) {
    const cur = Math.max(it.currentStock ?? 0, 0);
    units += cur;
    reserved += it.reservedStock ?? 0;
    sellValue += cur * effectiveSellingPrice(it);
    if (it.costState === "configured" && it.costPrice !== undefined) {
      costValue += cur * it.costPrice;
      anyCost = true;
    }
    const st = stockStatus(it);
    if (st === "low") low++;
    if (st === "out") out++;
  }
  return { skus: items.length, units, reserved, low, out, sellValue, costValue: anyCost ? costValue : undefined };
}

export type GroupRow = { name: string; skus: number; units: number; value: number };

function groupBy(items: InventoryItem[], keyOf: (it: InventoryItem) => string, valueOf: (it: InventoryItem) => number): GroupRow[] {
  const m = new Map<string, GroupRow>();
  for (const it of items) {
    const key = keyOf(it) || "Unassigned";
    const row = m.get(key) ?? { name: key, skus: 0, units: 0, value: 0 };
    const cur = Math.max(it.currentStock ?? 0, 0);
    row.skus += 1;
    row.units += cur;
    row.value += cur * valueOf(it);
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.value - a.value || b.units - a.units);
}

export const stockByLocation = (items: InventoryItem[], valueOf = effectiveSellingPrice) => groupBy(items, (i) => i.store, valueOf);
export const stockByCategory = (items: InventoryItem[], valueOf = effectiveSellingPrice) => groupBy(items, (i) => i.category, valueOf);

/* ── Consumption (what actually sold / got used) ───────────────────────────
   Derived from billed invoice lines (draft / cancelled / proforma excluded),
   keyed by SKU. This is the forecast's demand signal. */

type InvoiceLike = {
  status: string;
  createdAt: string;
  documentType?: string;
  items: { sku?: string; qty: number; kind?: string }[];
};

export function consumptionBySku(invoices: InvoiceLike[], days: number, now = Date.now()): Map<string, number> {
  const since = now - days * 86_400_000;
  const out = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status === "draft" || inv.status === "cancelled" || inv.documentType === "proforma") continue;
    const t = new Date(inv.createdAt).getTime();
    if (!Number.isFinite(t) || t < since || t > now) continue;
    for (const line of inv.items ?? []) {
      if (!line.sku || line.kind === "service") continue;
      out.set(line.sku, (out.get(line.sku) ?? 0) + (line.qty || 0));
    }
  }
  return out;
}

export type ForecastRow = {
  item: InventoryItem;
  sold30: number;
  sold90: number;
  /** Average units per day over the last 30 days. */
  perDay: number;
  /** Days the available stock lasts at the current pace (null = no demand). */
  daysCover: number | null;
  /** Units to order to cover `horizonDays` of demand (+ min stock buffer). */
  orderQty: number;
  speed: "fast" | "medium" | "slow" | "dead";
};

export function buildForecast(items: InventoryItem[], invoices: InvoiceLike[], horizonDays = 30, now = Date.now()): ForecastRow[] {
  const c30 = consumptionBySku(invoices, 30, now);
  const c90 = consumptionBySku(invoices, 90, now);
  const rows = items.map((item) => {
    const sold30 = c30.get(item.id) ?? 0;
    const sold90 = c90.get(item.id) ?? 0;
    const perDay = sold30 / 30;
    const avail = Math.max(availableStock(item), 0);
    const daysCover = perDay > 0 ? avail / perDay : null;
    const need = Math.ceil(perDay * horizonDays) + (item.minStock ?? 0) - avail;
    return { item, sold30, sold90, perDay, daysCover, orderQty: Math.max(need, 0), speed: "dead" as ForecastRow["speed"] };
  });
  // Speed bands are relative to the shop's own demand (top third / middle / rest).
  const active = rows.filter((r) => r.sold30 > 0).sort((a, b) => b.sold30 - a.sold30);
  active.forEach((r, i) => {
    r.speed = i < Math.ceil(active.length / 3) ? "fast" : i < Math.ceil((active.length * 2) / 3) ? "medium" : "slow";
  });
  rows.forEach((r) => { if (r.sold30 === 0 && r.sold90 > 0) r.speed = "slow"; });
  return rows;
}

/* ── Forecast plan (demand × lead time) ─────────────────────────────────
   daily sales = units sold ÷ days in the sales window
   forecast demand = daily sales × horizon
   days of cover = available ÷ daily sales
   buffer = cover − supplier lead time (days left before you must order)
   Urgent  : out of stock, or cover ≤ lead time (the order is already late)
   Soon    : buffer ≤ SOON_BUFFER_DAYS
   Healthy : otherwise · No demand : nothing sold in the window */
export const SOON_BUFFER_DAYS = 7;
export const DEFAULT_LEAD_DAYS = 7;
export type ForecastStatus = "urgent" | "soon" | "healthy" | "none";
export type ForecastPlan = {
  row: ForecastRow;
  perDay: number;
  demand: number;
  cover: number | null;
  leadDays: number;
  leadAssumed: boolean;
  buffer: number | null;
  stockOutDate: Date | null;
  orderByDate: Date | null;
  suggested: number;
  status: ForecastStatus;
};
export function planForecast(row: ForecastRow, opts: { horizon: number; basis: 30 | 90; leadDays?: number; now?: number }): ForecastPlan {
  const now = opts.now ?? Date.now();
  const perDay = (opts.basis === 30 ? row.sold30 : row.sold90) / opts.basis;
  const avail = Math.max(availableStock(row.item), 0);
  const leadAssumed = opts.leadDays === undefined;
  const leadDays = opts.leadDays ?? DEFAULT_LEAD_DAYS;
  const demand = Math.ceil(perDay * opts.horizon);
  const cover = perDay > 0 ? avail / perDay : null;
  const buffer = cover === null ? null : cover - leadDays;
  const at = (d: number) => new Date(now + Math.max(d, 0) * 86_400_000);
  const status: ForecastStatus = cover === null ? "none" : cover <= leadDays ? "urgent" : buffer! <= SOON_BUFFER_DAYS ? "soon" : "healthy";
  return {
    row, perDay, demand, cover, leadDays, leadAssumed, buffer,
    stockOutDate: cover === null ? null : at(cover),
    orderByDate: buffer === null ? null : at(buffer),
    suggested: perDay > 0 ? Math.max(demand + (row.item.minStock ?? 0) - avail, 0) : 0,
    status,
  };
}
/* ── Movements ──────────────────────────────────────────────────────────── */

/** Movement dates are stored as en-IN "dd/mm/yyyy" strings by the app and as ISO by the DB. */
export function parseMovementDate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s.trim());
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type MovementDay = { label: string; Inward: number; Outward: number; Return: number; Adjustment: number };

export function movementSeries(movements: StockMovement[], days = 30, now = new Date()): MovementDay[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const buckets: MovementDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * 86_400_000);
    buckets.push({ label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), Inward: 0, Outward: 0, Return: 0, Adjustment: 0 });
  }
  for (const mv of movements) {
    const d = parseMovementDate(mv.date);
    if (!d) continue;
    const idx = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start) / 86_400_000);
    if (idx < 0 || idx >= days) continue;
    if (mv.type === "Inward" || mv.type === "Outward" || mv.type === "Return" || mv.type === "Adjustment") {
      buckets[idx][mv.type] += mv.items || 0;
    }
  }
  return buckets;
}

/* ── Loss / damage write-offs (stored as Adjustment movements, WO- prefix) ── */
export const WRITE_OFF_PREFIX = "WO-";
export const WRITE_OFF_REASONS = ["Damaged", "Lost / Missing", "Expired / Defective", "Used for testing", "Theft", "Other"] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

export const isWriteOff = (m: StockMovement) => m.docNumber.startsWith(WRITE_OFF_PREFIX);
export const writeOffReason = (m: StockMovement) => m.toStore.replace(/^Write-off:\s*/, "") || "Other";

/* ── Price List link (SKU = Price List part number) ────────────────────────
   One rule: a Price List part whose part number equals an inventory SKU
   (item id, item code or barcode — case-insensitive) is LINKED. The inventory
   Selling Price is the single source of truth for linked parts. */
export type SkuIndex = Map<string, InventoryItem>;

export function buildSkuIndex(items: InventoryItem[]): SkuIndex {
  const m: SkuIndex = new Map();
  for (const it of items) {
    for (const key of [it.id, it.itemCode, it.barcode]) {
      const k = (key ?? "").trim().toLowerCase();
      if (k && !m.has(k)) m.set(k, it);
    }
  }
  return m;
}

export const findLinkedItem = (index: SkuIndex, partNumber?: string): InventoryItem | undefined =>
  index.get((partNumber ?? "").trim().toLowerCase());

/** Price List availability label derived from live stock. */
export function availabilityFromStock(it: InventoryItem): "In Stock" | "Limited" | "Out of Stock" {
  const s = stockStatus(it);
  return s === "out" ? "Out of Stock" : s === "low" ? "Limited" : "In Stock";
}

/** Overlay live inventory selling price + availability onto linked Price List
 *  parts. A no-op for users who can't read inventory (the DB trigger in
 *  migration 0118 keeps price_list_parts itself fresh for them). */
export function overlayInventoryOnParts<P extends { partNumber: string; price: number; priceKnown?: boolean; availability: "In Stock" | "Limited" | "Out of Stock" }>(
  parts: P[],
  items: InventoryItem[]
): P[] {
  if (items.length === 0) return parts;
  const index = buildSkuIndex(items.filter((i) => (i.kind ?? "part") === "part"));
  let changed = false;
  const out = parts.map((p) => {
    const it = findLinkedItem(index, p.partNumber);
    if (!it) return p;
    const sell = effectiveSellingPrice(it);
    const availability = it.trackStock === false ? p.availability : availabilityFromStock(it);
    if ((sell <= 0 || (p.price === sell && p.priceKnown !== false)) && p.availability === availability) return p;
    changed = true;
    return sell > 0 ? { ...p, price: sell, priceKnown: true, availability } : { ...p, availability };
  });
  return changed ? out : parts;
}
