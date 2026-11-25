/* Inventory insights — every number on the Stock Summary dashboard, derived from the
   Inventory Master, billed invoices, workflow documents (PO / GRN / transfer / return /
   count / write-off / old part / warranty) and serials. Pure functions, nothing stored.
   Cost figures are only used when `canCost` is true (sales users see selling-price values). */
import {
  availableStock, buildForecast, effectiveSellingPrice, planForecast, stockByCategory, stockByLocation, stockStatus,
  suggestedReorderQty, type ForecastPlan, type ForecastRow, type GroupRow,
} from "@/lib/inventory-analytics";
import { docUnits, type InvDoc, type Serial, type Vendor } from "@/lib/inventory-ops";
import type { InventoryItem } from "@/lib/inventory-data";

type InvoiceLike = Parameters<typeof buildForecast>[1];
export type Tone = "danger" | "warning" | "info" | "success";
export type Insight = { id: string; tone: Tone; title: string; detail: string; href: string; cta: string };
export type CoverBucket = { key: string; label: string; count: number; color: string };

const DAY = 86_400_000;
const num = (n: number | undefined) => (Number.isFinite(n) ? (n as number) : 0);

export function buildInventoryInsights(input: {
  items: InventoryItem[]; invoices: InvoiceLike; docs: InvDoc[]; serials: Serial[]; vendors: Vendor[]; canCost: boolean; now?: number;
}) {
  const { items, invoices, docs, serials, vendors, canCost } = input;
  const now = input.now ?? Date.now();
  const useCost = canCost && items.some((i) => i.costState === "configured" && i.costPrice !== undefined);
  const valueOf = (it: InventoryItem) => (useCost ? it.costPrice ?? 0 : effectiveSellingPrice(it));
  const stockValueOf = (it: InventoryItem) => Math.max(it.currentStock ?? 0, 0) * valueOf(it);

  const units = items.reduce((n, i) => n + Math.max(i.currentStock ?? 0, 0), 0);
  const reserved = items.reduce((n, i) => n + num(i.reservedStock), 0);
  const stockValue = items.reduce((n, i) => n + stockValueOf(i), 0);
  const sellValue = items.reduce((n, i) => n + Math.max(i.currentStock ?? 0, 0) * effectiveSellingPrice(i), 0);

  /* demand + forecast */
  const leadOf = (it: InventoryItem) => vendors.find((v) => v.name === it.vendor)?.leadTimeDays;
  const forecast: ForecastRow[] = buildForecast(items, invoices, 30, now);
  const hasDemand = forecast.some((r) => r.sold90 > 0);
  const plans: ForecastPlan[] = forecast.map((r) => planForecast(r, { horizon: 30, basis: 30, leadDays: leadOf(r.item), now }));
  const planOf = new Map(plans.map((p) => [p.row.item.id, p]));

  /* health */
  const counts = { in: 0, low: 0, out: 0 };
  const overstock: InventoryItem[] = [];
  const idle: { item: InventoryItem; value: number }[] = [];
  let healthy = 0;
  for (const r of forecast) {
    const it = r.item;
    const st = stockStatus(it);
    counts[st]++;
    const over = it.maxStock > 0 && availableStock(it) > it.maxStock;
    const isIdle = hasDemand && r.sold90 === 0 && (it.currentStock ?? 0) > 0;
    if (over) overstock.push(it);
    if (isIdle) idle.push({ item: it, value: stockValueOf(it) });
    if (st === "in" && !over && !isIdle) healthy++;
  }
  idle.sort((a, b) => b.value - a.value);
  const idleValue = idle.reduce((n, r) => n + r.value, 0);
  const score = items.length ? Math.round((healthy / items.length) * 100) : 0;

  /* main items vs SKUs: SKUs that share a variant group are one main item (e.g. one display, many grades) */
  const fam = new Map<string, InventoryItem[]>();
  for (const it of items) { const g = (it.variantGroup ?? "").trim(); if (g) fam.set(g, [...(fam.get(g) ?? []), it]); }
  const ungrouped = items.filter((i) => !(i.variantGroup ?? "").trim());
  const families = [...fam.entries()].map(([name, list]) => ({
    name, skus: list.length, grades: [...new Set(list.map((l) => l.grade).filter((g): g is string => !!g))],
    units: list.reduce((n, l) => n + Math.max(l.currentStock ?? 0, 0), 0), value: list.reduce((n, l) => n + stockValueOf(l), 0),
    out: list.filter((l) => stockStatus(l) === "out").length,
  })).sort((a, b) => b.skus - a.skus || b.value - a.value);
  const itemCatalog = {
    mainItems: families.length + ungrouped.length, skus: items.length, families: families.filter((f) => f.skus > 1).length,
    variantSkus: items.length - ungrouped.length, ungrouped: ungrouped.length, top: families.slice(0, 6),
  };

  /* stock-out risk */
  const atRisk = plans.filter((p) => p.cover !== null && p.status === "urgent").sort((a, b) => (a.cover ?? 0) - (b.cover ?? 0));
  const outWithDemand = atRisk.filter((p) => availableStock(p.row.item) <= 0).length;

  /* cover buckets */
  const bucketDefs: Omit<CoverBucket, "count">[] = [
    { key: "out", label: "Out", color: "#F43F5E" }, { key: "d7", label: "< 7 d", color: "#FB923C" },
    { key: "d14", label: "7–14 d", color: "#FBBF24" }, { key: "d30", label: "15–30 d", color: "#34D399" },
    { key: "d60", label: "31–60 d", color: "#10B981" }, { key: "d60p", label: "60 d +", color: "#4361EE" },
    { key: "none", label: "No demand", color: "#94A3B8" },
  ];
  const bucketCount: Record<string, number> = {};
  for (const r of forecast) {
    const avail = availableStock(r.item);
    const k = avail <= 0 ? "out" : r.daysCover === null ? "none" : r.daysCover < 7 ? "d7" : r.daysCover < 15 ? "d14" : r.daysCover < 31 ? "d30" : r.daysCover < 61 ? "d60" : "d60p";
    bucketCount[k] = (bucketCount[k] ?? 0) + 1;
  }
  const coverBuckets: CoverBucket[] = bucketDefs.map((b) => ({ ...b, count: bucketCount[b.key] ?? 0 }));

  /* ABC by stock value */
  const ranked = items.map((it) => ({ it, v: stockValueOf(it) })).sort((a, b) => b.v - a.v);
  const abc = { A: { n: 0, v: 0 }, B: { n: 0, v: 0 }, C: { n: 0, v: 0 } };
  let run = 0;
  const topA: { it: InventoryItem; v: number }[] = [];
  for (const r of ranked) {
    const before = stockValue > 0 ? run / stockValue : 1;
    const cls = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
    abc[cls].n++; abc[cls].v += r.v; run += r.v;
    if (cls === "A" && topA.length < 5) topA.push(r);
  }

  /* groupings */
  const groupTop = (rows: GroupRow[], n: number) => {
    if (rows.length <= n) return rows;
    const rest = rows.slice(n - 1).reduce((a, r) => ({ name: "Others", skus: a.skus + r.skus, units: a.units + r.units, value: a.value + r.value }), { name: "Others", skus: 0, units: 0, value: 0 });
    return [...rows.slice(0, n - 1), rest];
  };
  const byLocation = groupTop(stockByLocation(items, valueOf), 5);
  const byCategory = groupTop(stockByCategory(items, valueOf), 7);

  /* movers */
  const fastMovers = forecast.filter((r) => r.speed === "fast").sort((a, b) => b.sold30 - a.sold30).slice(0, 5);
  const slowMovers = forecast.filter((r) => (r.speed === "slow" || r.speed === "dead") && (r.item.currentStock ?? 0) > 0)
    .sort((a, b) => stockValueOf(b.item) - stockValueOf(a.item)).slice(0, 5);
  const fastCount = forecast.filter((r) => r.speed === "fast").length;
  const slowCount = forecast.filter((r) => (r.speed === "slow" || r.speed === "dead") && (r.item.currentStock ?? 0) > 0).length;

  /* margin (cost-gated) */
  const priced = canCost ? items.filter((i) => i.costState === "configured" && i.costPrice !== undefined && effectiveSellingPrice(i) > 0) : [];
  const marginRows = priced.map((i) => ({ item: i, pct: ((effectiveSellingPrice(i) - (i.costPrice as number)) / effectiveSellingPrice(i)) * 100 }));
  const margin = canCost && priced.length > 0 ? {
    potential: priced.reduce((n, i) => n + Math.max(i.currentStock ?? 0, 0) * (effectiveSellingPrice(i) - (i.costPrice as number)), 0),
    avgPct: marginRows.reduce((n, r) => n + r.pct, 0) / marginRows.length,
    thin: marginRows.filter((r) => r.pct >= 0 && r.pct < 15).length,
    negative: marginRows.filter((r) => r.pct < 0).length,
    lowest: [...marginRows].sort((a, b) => a.pct - b.pct).slice(0, 4),
  } : null;

  /* workflow pipeline */
  const of = (type: InvDoc["type"], ...st: string[]) => docs.filter((d) => d.type === type && st.includes(d.status));
  const openPOs = of("purchase_order", "sent", "partial");
  const expected = (d: InvDoc) => (typeof d.data.expectedDate === "string" ? d.data.expectedDate : "");
  const latePOs = openPOs.filter((d) => expected(d) && new Date(expected(d)).getTime() < now);
  const poRemaining = (d: InvDoc) => d.lines.reduce((n, l) => n + Math.max((l.qty || 0) - (l.received ?? 0), 0), 0);
  const onOrderUnits = openPOs.reduce((n, d) => n + poRemaining(d), 0);
  const onOrderValue = openPOs.reduce((n, d) => n + d.lines.reduce((m, l) => m + Math.max((l.qty || 0) - (l.received ?? 0), 0) * (l.unitCost ?? 0), 0), 0);
  const transfersRequested = of("transfer", "requested");
  const transfersMoving = of("transfer", "in_transit");
  const staleTransit = transfersMoving.filter((d) => now - new Date(d.updatedAt || d.createdAt).getTime() > 3 * DAY);
  const unitsInTransit = transfersMoving.reduce((n, d) => n + docUnits(d), 0);
  const grnDrafts = of("grn", "draft");
  const returnsOpen = of("vendor_return", "draft", "sent");
  const countsPending = of("stock_count", "submitted");
  const countsRunning = of("stock_count", "draft");
  const oldPending = of("old_part", "pending");
  const claimsOpen = of("warranty_claim", "raised", "sent", "approved");
  const serialsRma = serials.filter((s) => s.status === "rma");
  const pipeline = {
    openPOs: openPOs.length, latePOs: latePOs.length, grnDrafts: grnDrafts.length,
    transfersRequested: transfersRequested.length, transfersMoving: transfersMoving.length,
    returnsOpen: returnsOpen.length, countsPending: countsPending.length, countsRunning: countsRunning.length,
    oldPending: oldPending.length, claimsOpen: claimsOpen.length, serialsRma: serialsRma.length,
  };

  /* losses (last 90 days) */
  const since = now - 90 * DAY;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const lossMap = new Map<string, { reason: string; units: number; value: number; entries: number }>();
  for (const d of docs.filter((x) => x.type === "write_off" && new Date(x.createdAt).getTime() >= since)) {
    const reason = d.party || "Other";
    const row = lossMap.get(reason) ?? { reason, units: 0, value: 0, entries: 0 };
    row.entries++;
    for (const l of d.lines) { row.units += l.qty || 0; row.value += (l.qty || 0) * (itemById.get(l.itemId) ? valueOf(itemById.get(l.itemId)!) : 0); }
    lossMap.set(reason, row);
  }
  const losses = [...lossMap.values()].sort((a, b) => b.value - a.value || b.units - a.units);
  const lossUnits = losses.reduce((n, r) => n + r.units, 0);
  const lossValue = losses.reduce((n, r) => n + r.value, 0);

  /* reorder-now list */
  const reorder = plans
    .filter((p) => stockStatus(p.row.item) !== "in" || p.status === "urgent" || p.status === "soon")
    .map((p) => ({ plan: p, qty: Math.max(suggestedReorderQty(p.row.item), p.suggested), rank: stockStatus(p.row.item) === "out" ? 0 : p.status === "urgent" ? 1 : stockStatus(p.row.item) === "low" ? 2 : 3 }))
    .sort((a, b) => a.rank - b.rank || (a.plan.cover ?? 1e9) - (b.plan.cover ?? 1e9));

  /* vendors by open PO value */
  const vendorSpend = new Map<string, { name: string; open: number; pos: number }>();
  for (const d of openPOs) {
    const row = vendorSpend.get(d.party) ?? { name: d.party || "Unknown", open: 0, pos: 0 };
    row.pos++; row.open += d.lines.reduce((m, l) => m + Math.max((l.qty || 0) - (l.received ?? 0), 0) * (l.unitCost ?? 0), 0);
    vendorSpend.set(d.party, row);
  }

  /* insights, most urgent first */
  const ins: (Insight & { w: number })[] = [];
  const add = (w: number, i: Insight) => ins.push({ ...i, w });
  if (outWithDemand > 0) add(100, { id: "out", tone: "danger", title: `${outWithDemand} selling item${outWithDemand === 1 ? " is" : "s are"} out of stock`, detail: "You are losing sales on parts customers actually buy.", href: "/inventory/low-stock?status=out", cta: "Reorder" });
  const lateRisk = atRisk.length - outWithDemand;
  if (lateRisk > 0) add(90, { id: "risk", tone: "danger", title: `${lateRisk} item${lateRisk === 1 ? "" : "s"} will run out before a new order arrives`, detail: "Cover is shorter than the supplier lead time.", href: "/inventory/forecast", cta: "See forecast" });
  if (latePOs.length > 0) add(85, { id: "latepo", tone: "danger", title: `${latePOs.length} purchase order${latePOs.length === 1 ? " is" : "s are"} overdue`, detail: "Past the expected delivery date. Chase the vendor.", href: "/inventory/purchase-orders", cta: "Open POs" });
  if (staleTransit.length > 0) add(80, { id: "stale", tone: "warning", title: `${staleTransit.length} transfer${staleTransit.length === 1 ? " has" : "s have"} been in transit over 3 days`, detail: "Stock is out of the source store but not received yet.", href: "/inventory/stock-movement", cta: "Receive" });
  if (countsPending.length > 0) add(75, { id: "counts", tone: "warning", title: `${countsPending.length} stock count${countsPending.length === 1 ? " needs" : "s need"} approval`, detail: "Variances are not corrected until approved.", href: "/inventory/stock-count", cta: "Review" });
  if (idleValue > 0 && stockValue > 0 && idleValue / stockValue >= 0.1) add(70, { id: "idle", tone: "warning", title: `${Math.round((idleValue / stockValue) * 100)}% of stock value has not sold in 90 days`, detail: `${idle.length} item${idle.length === 1 ? "" : "s"} tie up this money. Discount, return or stop reordering.`, href: "/inventory/forecast", cta: "Review" });
  if (transfersRequested.length > 0) add(60, { id: "trf", tone: "info", title: `${transfersRequested.length} transfer${transfersRequested.length === 1 ? " is" : "s are"} waiting to be dispatched`, detail: "Stock has not left the source store yet.", href: "/inventory/stock-movement", cta: "Dispatch" });
  if (grnDrafts.length > 0) add(55, { id: "grn", tone: "info", title: `${grnDrafts.length} received delivery${grnDrafts.length === 1 ? " is" : "ies are"} not posted to stock`, detail: "Goods are on the shelf but not in the system.", href: "/inventory/receive-stock", cta: "Post" });
  if (returnsOpen.length + claimsOpen.length + oldPending.length > 0) add(50, { id: "ret", tone: "info", title: `${returnsOpen.length + claimsOpen.length + oldPending.length} return / claim item${returnsOpen.length + claimsOpen.length + oldPending.length === 1 ? "" : "s"} still open`, detail: `${returnsOpen.length} vendor returns · ${claimsOpen.length} warranty claims · ${oldPending.length} old parts`, href: "/inventory/vendor-returns", cta: "Follow up" });
  if (overstock.length > 0) add(45, { id: "over", tone: "warning", title: `${overstock.length} item${overstock.length === 1 ? " is" : "s are"} above the maximum level`, detail: "Overstock locks cash. Pause reordering.", href: "/inventory/item-master", cta: "Review" });
  if (margin && margin.negative > 0) add(65, { id: "neg", tone: "danger", title: `${margin.negative} item${margin.negative === 1 ? " sells" : "s sell"} below cost`, detail: "Selling price is lower than cost price.", href: "/inventory/price-control", cta: "Fix prices" });
  if (lossValue > 0 && stockValue > 0 && lossValue / stockValue >= 0.02) add(40, { id: "loss", tone: "warning", title: `${lossUnits} units written off in the last 90 days`, detail: `Mostly ${losses[0]?.reason.toLowerCase()}.`, href: "/inventory/loss-damage", cta: "Investigate" });
  const insights = ins.sort((a, b) => b.w - a.w).map(({ w: _w, ...rest }) => { void _w; return rest; });

  return {
    itemCatalog, healthy, useCost, valueOf, units, reserved, stockValue, sellValue, hasDemand, forecast,
    counts, overstock, idle, idleValue, score, atRisk, outWithDemand, coverBuckets, abc, topA, byLocation, byCategory,
    fastMovers, slowMovers, fastCount, slowCount, margin, pipeline, onOrderUnits, onOrderValue, unitsInTransit, openPOs: openPOs.length,
    losses, lossUnits, lossValue, reorder, vendorSpend: [...vendorSpend.values()].sort((a, b) => b.open - a.open).slice(0, 5), insights, planOf,
  };
}
export type InventoryInsights = ReturnType<typeof buildInventoryInsights>;
