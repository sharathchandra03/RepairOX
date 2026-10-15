/**
 * Inventory Master + Repair Service Costing — pure costing / profitability engine.
 *
 * This module is deliberately self-contained and side-effect-free (inv-design
 * §3.3, §3.5, §3.6, §3.7). It consumes only plain structural inputs so it can be
 * unit-tested without the Supabase-backed `useStore()` context and so no UI /
 * print surface ever imports internal cost through it by accident.
 *
 * Costing decisions implemented here:
 *  - Weighted-average part unit-cost resolution: branch-scoped ledger layers
 *    first, org-level CP fallback, else "not configured" (§3.3).
 *  - Parts / service / combined gross profit + margin over ELIGIBLE NET REVENUE
 *    (invoice-level discount split pro-rata by bucket revenue share; per-line
 *    discount deliberately ignored — the single-discount-source invariant,
 *    MEDIUM-1; GST excluded; `repairCost` folded into service revenue — HIGH-2).
 *  - Realized aggregates filter on `isFinalizedInvoice` from `leads-data.ts`
 *    via an explicit `toRevenueInvoiceLike` adapter (NIT-1).
 *
 * "not configured" is NEVER collapsed to ₹0: an intentionally-entered ₹0 cost is
 * a valid configured cost, while an absent cost renders "Cost not configured" and
 * never yields a 100% margin (§3.7 / FR-16 / AC-15).
 */

import { type ItemKind } from "./inventory-data";
import { isFinalizedInvoice, type RevenueInvoiceLike } from "./leads-data";

/* ────────────────────────────────────────────────────────────────────────────
 * Cost resolution (§3.3)
 * ────────────────────────────────────────────────────────────────────────── */

/** A cost-carrying stock layer (opening stock or a Purchase/Stock In receipt). */
export interface StockLayerLike {
  item_id: string;
  /** Units received at this layer's unit cost. */
  qty_in: number;
  /** Per-unit cost captured at receipt time. */
  unit_cost: number;
}

/** The subset of an InventoryItem the cost resolver reads. */
export interface CostableItemLike {
  costPrice?: number;
  costState?: "configured" | "not_configured";
}

/** Discriminated result of resolving a part's actual sold unit cost. */
export type ResolvedCost =
  | { kind: "resolved"; unitCost: number; source: "ledger" | "cp" }
  | { kind: "not_configured" };

/**
 * Resolve the ACTUAL sold unit cost for a part (never `defaultPrice*0.7`).
 *
 * Resolution order (§3.3, MEDIUM-2):
 *  1. Weighted average over the item's stock layers (the real cost of stock that
 *     physically entered this store — layers are expected to already be
 *     branch-scoped by the caller): `Σ(qty_in · unit_cost) / Σ(qty_in)`.
 *  2. Org-level default CP from the item (only when `costState === "configured"`
 *     and the CP is a non-negative number).
 *  3. Otherwise "not configured".
 */
export function resolvePartUnitCost(
  itemId: string,
  layers: readonly StockLayerLike[],
  item: CostableItemLike | undefined | null,
): ResolvedCost {
  const relevant = layers.filter((l) => l.item_id === itemId);
  const totalQty = relevant.reduce((s, l) => s + l.qty_in, 0);
  if (totalQty > 0) {
    const totalValue = relevant.reduce((s, l) => s + l.qty_in * l.unit_cost, 0);
    return { kind: "resolved", unitCost: totalValue / totalQty, source: "ledger" };
  }
  if (item && item.costState === "configured" && typeof item.costPrice === "number" && item.costPrice >= 0) {
    return { kind: "resolved", unitCost: item.costPrice, source: "cp" };
  }
  return { kind: "not_configured" };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Profitability (§3.5)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A line as seen by the costing engine. `kind` discriminates parts vs service;
 * `cost` is the resolved per-unit cost (undefined ⇒ not configured); `total` is
 * the billed `qty * price` the invoice already computed. Legacy lines without
 * `kind`/`cost` are tolerated (treated as a part with no configured cost).
 */
export interface CostingLineLike {
  kind?: ItemKind;
  qty: number;
  /** Billed line total (`qty * price`), as the invoice computes it. */
  total: number;
  /** Resolved per-unit cost; absent ⇒ not configured (never ₹0). */
  cost?: number;
  /** Resolved cost state; absent is treated as not configured. */
  costState?: "resolved" | "cp" | "not_configured";
}

/** The device-level repair/labour charge the invoice bills outside line items. */
export interface CostingDeviceLike {
  repairCost?: number;
}

/** The invoice shape the engine reconciles against. */
export interface CostingInvoiceLike {
  id: string;
  status: string;
  documentType?: "invoice" | "proforma";
  /** Billed subtotal = parts + service + repairCost (GST and discount excluded). */
  subtotal: number;
  /** The SINGLE invoice-level discount (per-line discount is ignored — MEDIUM-1). */
  discount: number;
  /** The grand total (reserved for `isFinalizedInvoice` mapping). */
  total: number;
  lines: readonly CostingLineLike[];
  devices?: readonly CostingDeviceLike[];
  /** Other direct costs, where the invoice supports them (0 today). */
  otherDirectCosts?: number;
}

/** A single row rendered in the profitability breakdown. */
export interface ProfitBreakdownLine {
  kind: ItemKind;
  qty: number;
  revenue: number;
  /** Resolved cost per unit; `null` ⇒ "Cost not configured" (never ₹0). */
  unitCost: number | null;
  /** Extended cost (`unitCost * qty`); `null` ⇒ not configured. */
  cost: number | null;
  /** True when this line's cost could not be resolved (renders "Cost not configured"). */
  notConfigured: boolean;
}

/** Full profitability result for one invoice. */
export interface InvoiceProfitability {
  partsRevenue: number;
  serviceRevenue: number;
  grossRevenue: number;

  partsDiscount: number;
  serviceDiscount: number;

  partsNet: number;
  serviceNet: number;
  eligibleNetRevenue: number;

  partsCost: number;
  labourCost: number;
  otherDirectCost: number;

  partsGP: number;
  serviceGP: number;
  combinedGP: number;

  /** Gross margin % over eligible net revenue; `null` ⇒ render "—" (AC-14). */
  grossMargin: number | null;

  /** True when ANY contributing cost was not configured (margin shown as partial). */
  costPartial: boolean;

  /** Per-line breakdown (parts + service lines, incl. the repairCost sub-line). */
  breakdown: ProfitBreakdownLine[];
}

/**
 * Compute parts / service / combined gross profit and margin for one invoice.
 *
 * `repairCost` folds into service revenue as an unconfigured-cost repair/labour
 * charge (HIGH-2), so `eligibleNetRevenue == max(0, subtotal − invoice.discount)`
 * and `partsGP + serviceGP == combinedGP + otherDirectCost` hold by construction.
 * The invoice-level discount is split pro-rata by each bucket's share of gross
 * revenue; per-line discounts are ignored (the single-discount-source invariant,
 * MEDIUM-1). `grossMargin` is `null` (rendered "—"/"Partial") when
 * `eligibleNetRevenue == 0` (AC-14) OR when the invoice is FULLY not-configured
 * (≥1 cost-bearing line, none configured) — so a "cost unknown" invoice never
 * reports a misleading 100% margin (AC-15 / math-review nit).
 */
export function computeInvoiceProfitability(inv: CostingInvoiceLike): InvoiceProfitability {
  const lines = inv.lines ?? [];
  const devices = inv.devices ?? [];

  const partLines = lines.filter((l) => lineKind(l) === "part");
  const serviceLines = lines.filter((l) => lineKind(l) === "service");

  const partsRevenue = sum(partLines.map((l) => l.total));
  const lineServiceRevenue = sum(serviceLines.map((l) => l.total));
  const repairChargeRevenue = sum(devices.map((d) => d.repairCost ?? 0));
  const serviceRevenue = lineServiceRevenue + repairChargeRevenue;
  const grossRevenue = partsRevenue + serviceRevenue; // == invoice.subtotal

  // Single invoice-level discount, distributed pro-rata by bucket revenue share.
  const discount = inv.discount ?? 0;
  let partsDiscount = 0;
  let serviceDiscount = 0;
  if (grossRevenue > 0) {
    partsDiscount = discount * (partsRevenue / grossRevenue);
    serviceDiscount = discount * (serviceRevenue / grossRevenue);
  }

  const partsNet = Math.max(0, partsRevenue - partsDiscount);
  const serviceNet = Math.max(0, serviceRevenue - serviceDiscount);
  const eligibleNetRevenue = partsNet + serviceNet; // == max(0, subtotal - invoice.discount)

  // Costs. A line whose cost is not configured contributes 0 to the cost total
  // but flags the bucket as partial (never silently ₹0 — §3.7).
  let partsCost = 0;
  let labourCost = 0;
  let costPartial = false;
  // Track whether ANY cost-bearing line/charge exists and whether ANY of them is
  // configured. When at least one cost line exists but NONE is configured, the
  // margin would compute to 100% purely because cost is unknown — a misleading
  // "100.0%". We suppress the numeric margin to null in that fully-unconfigured
  // case so the panel renders "—"/"Partial", never a false 100% (math-review nit).
  let costLineCount = 0;
  let configuredCostLineCount = 0;
  const breakdown: ProfitBreakdownLine[] = [];

  for (const l of partLines) {
    const configured = lineCostConfigured(l);
    const unitCost = configured ? (l.cost as number) : null;
    const extended = configured ? (l.cost as number) * l.qty : null;
    costLineCount += 1;
    if (configured) { partsCost += extended as number; configuredCostLineCount += 1; }
    else costPartial = true;
    breakdown.push({
      kind: "part",
      qty: l.qty,
      revenue: l.total,
      unitCost,
      cost: extended,
      notConfigured: !configured,
    });
  }

  for (const l of serviceLines) {
    const configured = lineCostConfigured(l);
    const unitCost = configured ? (l.cost as number) : null;
    const extended = configured ? (l.cost as number) * l.qty : null;
    costLineCount += 1;
    if (configured) { labourCost += extended as number; configuredCostLineCount += 1; }
    else costPartial = true;
    breakdown.push({
      kind: "service",
      qty: l.qty,
      revenue: l.total,
      unitCost,
      cost: extended,
      notConfigured: !configured,
    });
  }

  // repairCost repair/labour charges: billed service revenue with cost not
  // configured (there is no Standard Labour Cost on a free-form repair charge).
  for (const d of devices) {
    const repair = d.repairCost ?? 0;
    if (repair === 0) continue;
    costPartial = true;
    costLineCount += 1; // a repair charge is a cost-bearing line that is always unconfigured
    breakdown.push({
      kind: "service",
      qty: 1,
      revenue: repair,
      unitCost: null,
      cost: null,
      notConfigured: true,
    });
  }

  const otherDirectCost = inv.otherDirectCosts ?? 0;

  const partsGP = partsNet - partsCost;
  const serviceGP = serviceNet - labourCost;
  const combinedGP = eligibleNetRevenue - partsCost - labourCost - otherDirectCost;
  // A fully-not-configured invoice (≥1 cost-bearing line, none configured) would
  // otherwise report grossMargin 100% purely because cost is unknown. Suppress it
  // to null so the panel shows "—"/"Partial", never a false 100% (math-review nit).
  const fullyNotConfigured = costLineCount > 0 && configuredCostLineCount === 0;
  const grossMargin =
    eligibleNetRevenue > 0 && !fullyNotConfigured
      ? (combinedGP / eligibleNetRevenue) * 100
      : null;

  return {
    partsRevenue,
    serviceRevenue,
    grossRevenue,
    partsDiscount,
    serviceDiscount,
    partsNet,
    serviceNet,
    eligibleNetRevenue,
    partsCost,
    labourCost,
    otherDirectCost,
    partsGP,
    serviceGP,
    combinedGP,
    grossMargin,
    costPartial,
    breakdown,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Finalized-invoice eligibility (§3.6)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Map an invoice-like record into the `RevenueInvoiceLike` shape BEFORE calling
 * `isFinalizedInvoice` (NIT-1). `documentType` defaults to "invoice" so a record
 * with no explicit document type is treated as a normal invoice.
 */
export function toRevenueInvoiceLike(inv: {
  id: string;
  ticketId?: string;
  total: number;
  status: string;
  documentType?: "invoice" | "proforma";
}): RevenueInvoiceLike {
  return {
    id: inv.id,
    ticketId: inv.ticketId,
    total: inv.total,
    status: inv.status,
    documentType: inv.documentType ?? "invoice",
  };
}

/**
 * True when the invoice is a FINALIZED eligible invoice (paid, non-proforma) and
 * therefore contributes to realized revenue/profit aggregates (§3.6 / AC-17).
 * Drafts / proformas / quotations / estimates / cancelled contribute ZERO.
 */
export function isEligibleForRealizedProfit(inv: {
  id: string;
  ticketId?: string;
  total: number;
  status: string;
  documentType?: "invoice" | "proforma";
}): boolean {
  return isFinalizedInvoice(toRevenueInvoiceLike(inv));
}

/* ────────────────────────────────────────────────────────────────────────────
 * internal helpers
 * ────────────────────────────────────────────────────────────────────────── */

function sum(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

/** Legacy lines without `kind` are treated as parts. */
function lineKind(l: CostingLineLike): ItemKind {
  return l.kind === "service" ? "service" : "part";
}

/**
 * A line's cost is "configured" when a real numeric cost is attached and the
 * resolution did not report `not_configured`. An intentional ₹0 cost IS
 * configured; an absent cost (or an explicit `not_configured` state) is not.
 */
function lineCostConfigured(l: CostingLineLike): boolean {
  if (l.costState === "not_configured") return false;
  return typeof l.cost === "number";
}
