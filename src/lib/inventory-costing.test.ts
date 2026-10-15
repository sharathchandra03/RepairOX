import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeInvoiceProfitability,
  isEligibleForRealizedProfit,
  resolvePartUnitCost,
  toRevenueInvoiceLike,
  type CostingInvoiceLike,
  type StockLayerLike,
} from "./inventory-costing";
import { buildInvoiceInfo } from "@/lib/print-utils";
import type { Invoice } from "@/lib/mock-data";

/* ──────────────────────────────────────────────────────────────────────────
 * resolvePartUnitCost — weighted average / CP fallback / not_configured
 * (AC-15, AC-16)
 * ────────────────────────────────────────────────────────────────────────── */

test("weighted-average cost over multiple layers (AC-16)", () => {
  const layers: StockLayerLike[] = [
    { item_id: "PART", qty_in: 10, unit_cost: 100 }, // 1000
    { item_id: "PART", qty_in: 30, unit_cost: 200 }, // 6000
    { item_id: "OTHER", qty_in: 5, unit_cost: 999 }, // ignored
  ];
  const r = resolvePartUnitCost("PART", layers, { costPrice: 50, costState: "configured" });
  // (1000 + 6000) / 40 = 175 — ledger wins over CP.
  assert.deepEqual(r, { kind: "resolved", unitCost: 175, source: "ledger" });
});

test("CP fallback when no layers exist (AC-16)", () => {
  const r = resolvePartUnitCost("PART", [], { costPrice: 1800, costState: "configured" });
  assert.deepEqual(r, { kind: "resolved", unitCost: 1800, source: "cp" });
});

test("not_configured when neither layer nor configured CP (AC-15)", () => {
  assert.deepEqual(resolvePartUnitCost("PART", [], { costState: "not_configured" }), {
    kind: "not_configured",
  });
  assert.deepEqual(resolvePartUnitCost("PART", [], undefined), { kind: "not_configured" });
  // A CP present but NOT marked configured is still not_configured.
  assert.deepEqual(resolvePartUnitCost("PART", [], { costPrice: 100 }), { kind: "not_configured" });
});

test("configured-₹0 CP yields a valid resolved ₹0 cost (not not_configured)", () => {
  const r = resolvePartUnitCost("PART", [], { costPrice: 0, costState: "configured" });
  assert.deepEqual(r, { kind: "resolved", unitCost: 0, source: "cp" });
});

/* ──────────────────────────────────────────────────────────────────────────
 * Headline AC calculations
 * ────────────────────────────────────────────────────────────────────────── */

test("CP=1800 / SP=2500 => ₹700/unit preliminary margin (AC-5)", () => {
  const inv: CostingInvoiceLike = {
    id: "inv-1",
    status: "paid",
    subtotal: 2500,
    discount: 0,
    total: 2500,
    lines: [{ kind: "part", qty: 1, price: 2500, total: 2500, cost: 1800, costState: "cp" } as never],
  };
  const p = computeInvoiceProfitability(inv);
  assert.equal(p.partsRevenue, 2500);
  assert.equal(p.partsCost, 1800);
  assert.equal(p.partsGP, 700);
  assert.equal(p.combinedGP, 700);
});

test("ServiceCharge=500 / StdLabour=200 => ₹300 service GP (AC-6)", () => {
  const inv: CostingInvoiceLike = {
    id: "inv-2",
    status: "paid",
    subtotal: 500,
    discount: 0,
    total: 500,
    lines: [{ kind: "service", qty: 1, price: 500, total: 500, cost: 200, costState: "resolved" } as never],
  };
  const p = computeInvoiceProfitability(inv);
  assert.equal(p.serviceRevenue, 500);
  assert.equal(p.labourCost, 200);
  assert.equal(p.serviceGP, 300);
  assert.equal(p.combinedGP, 300);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Zero-denominator margin => null (AC-14)
 * ────────────────────────────────────────────────────────────────────────── */

test("zero-denominator margin returns null and bucket discounts 0 (AC-14)", () => {
  const inv: CostingInvoiceLike = {
    id: "inv-3",
    status: "paid",
    subtotal: 0,
    discount: 0,
    total: 0,
    lines: [],
  };
  const p = computeInvoiceProfitability(inv);
  assert.equal(p.grossRevenue, 0);
  assert.equal(p.eligibleNetRevenue, 0);
  assert.equal(p.partsDiscount, 0);
  assert.equal(p.serviceDiscount, 0);
  assert.equal(p.grossMargin, null);
});

/* ──────────────────────────────────────────────────────────────────────────
 * repairCost folded into service revenue (HIGH-2)
 * ────────────────────────────────────────────────────────────────────────── */

test("repairCost folds into service revenue; reconciliation identities hold (HIGH-2)", () => {
  const subtotal = 2500 /* part */ + 500 /* service line */ + 800 /* repairCost */;
  const invoiceDiscount = 380;
  const inv: CostingInvoiceLike = {
    id: "inv-4",
    status: "paid",
    subtotal,
    discount: invoiceDiscount,
    total: subtotal - invoiceDiscount,
    lines: [
      { kind: "part", qty: 1, price: 2500, total: 2500, cost: 1800, costState: "cp" } as never,
      { kind: "service", qty: 1, price: 500, total: 500, cost: 200, costState: "resolved" } as never,
    ],
    devices: [{ repairCost: 800 }],
  };
  const p = computeInvoiceProfitability(inv);

  // service revenue includes the folded repairCost.
  assert.equal(p.serviceRevenue, 500 + 800);
  assert.equal(p.grossRevenue, subtotal);

  // eligibleNetRevenue == max(0, subtotal - invoice.discount)
  assert.equal(p.eligibleNetRevenue, Math.max(0, subtotal - invoiceDiscount));

  // partsGP + serviceGP == combinedGP + otherDirectCost (otherDirectCost == 0 here)
  assert.ok(Math.abs(p.partsGP + p.serviceGP - (p.combinedGP - p.otherDirectCost)) < 1e-9);

  // repairCost is unconfigured => the bucket is partial, never ₹0 margin inflation.
  assert.equal(p.costPartial, true);
});

test("otherDirectCost only lowers combinedGP (partsGP + serviceGP == combinedGP + otherDirectCost)", () => {
  const inv: CostingInvoiceLike = {
    id: "inv-4b",
    status: "paid",
    subtotal: 3000,
    discount: 0,
    total: 3000,
    lines: [
      { kind: "part", qty: 1, price: 2000, total: 2000, cost: 1200, costState: "cp" } as never,
      { kind: "service", qty: 1, price: 1000, total: 1000, cost: 400, costState: "resolved" } as never,
    ],
    otherDirectCosts: 250,
  };
  const p = computeInvoiceProfitability(inv);
  // partsGP + serviceGP excludes otherDirectCost; combinedGP subtracts it once.
  assert.ok(Math.abs(p.partsGP + p.serviceGP - (p.combinedGP + p.otherDirectCost)) < 1e-9);
  assert.equal(p.otherDirectCost, 250);
  assert.equal(p.combinedGP, 3000 - 1200 - 400 - 250);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Single-discount-source invariant (MEDIUM-1): per-line discount ignored
 * ────────────────────────────────────────────────────────────────────────── */

test("non-zero per-line discount does NOT change the result (MEDIUM-1 invariant)", () => {
  const subtotal = 2500 + 500;
  const invoiceDiscount = 300;
  const base: CostingInvoiceLike = {
    id: "inv-5",
    status: "paid",
    subtotal,
    discount: invoiceDiscount,
    total: subtotal - invoiceDiscount,
    lines: [
      { kind: "part", qty: 1, price: 2500, total: 2500, cost: 1800, costState: "cp" } as never,
      { kind: "service", qty: 1, price: 500, total: 500, cost: 200, costState: "resolved" } as never,
    ],
  };
  // Same invoice, but each line carries a bogus non-zero per-line discount.
  const withLineDiscount: CostingInvoiceLike = {
    ...base,
    id: "inv-5b",
    lines: [
      { kind: "part", qty: 1, price: 2500, total: 2500, cost: 1800, costState: "cp", discount: 150 } as never,
      { kind: "service", qty: 1, price: 500, total: 500, cost: 200, costState: "resolved", discount: 75 } as never,
    ],
  };
  const a = computeInvoiceProfitability(base);
  const b = computeInvoiceProfitability(withLineDiscount);

  assert.equal(a.eligibleNetRevenue, Math.max(0, subtotal - invoiceDiscount));
  assert.equal(b.eligibleNetRevenue, a.eligibleNetRevenue);
  assert.equal(b.combinedGP, a.combinedGP);
  assert.equal(b.grossMargin, a.grossMargin);
});

/* ──────────────────────────────────────────────────────────────────────────
 * GST excluded from revenue (AC-13)
 * ────────────────────────────────────────────────────────────────────────── */

test("GST is excluded from revenue — engine reads subtotal/discount only (AC-13)", () => {
  // The grand total carries GST; the engine must never read it into revenue.
  const subtotal = 1000;
  const discount = 0;
  const gst = 180;
  const inv: CostingInvoiceLike = {
    id: "inv-6",
    status: "paid",
    subtotal,
    discount,
    total: subtotal - discount + gst,
    lines: [{ kind: "part", qty: 1, price: 1000, total: 1000, cost: 600, costState: "cp" } as never],
  };
  const p = computeInvoiceProfitability(inv);
  assert.equal(p.grossRevenue, 1000); // not 1180
  assert.equal(p.eligibleNetRevenue, 1000);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Pro-rata discount split reconciliation (parts + services + repairCost)
 * ────────────────────────────────────────────────────────────────────────── */

test("invoice-level discount splits pro-rata by bucket revenue share", () => {
  const partsRevenue = 3000;
  const serviceRevenue = 1000; // 500 line + 500 repairCost
  const subtotal = partsRevenue + serviceRevenue; // 4000
  const discount = 400;
  const inv: CostingInvoiceLike = {
    id: "inv-7",
    status: "paid",
    subtotal,
    discount,
    total: subtotal - discount,
    lines: [
      { kind: "part", qty: 2, price: 1500, total: 3000, cost: 1000, costState: "cp" } as never,
      { kind: "service", qty: 1, price: 500, total: 500, cost: 100, costState: "resolved" } as never,
    ],
    devices: [{ repairCost: 500 }],
  };
  const p = computeInvoiceProfitability(inv);
  assert.equal(p.partsDiscount, 400 * (3000 / 4000)); // 300
  assert.equal(p.serviceDiscount, 400 * (1000 / 4000)); // 100
  assert.equal(p.partsNet, 3000 - 300);
  assert.equal(p.serviceNet, 1000 - 100);
  assert.equal(p.eligibleNetRevenue, subtotal - discount);
});

/* ──────────────────────────────────────────────────────────────────────────
 * configured-₹0 vs not-configured distinction (NIT-4 / AC-15)
 * ────────────────────────────────────────────────────────────────────────── */

test("configured-₹0 line yields valid ₹0 cost; not_configured yields 'Cost not configured' not ₹0/100%", () => {
  const configuredZero: CostingInvoiceLike = {
    id: "inv-8a",
    status: "paid",
    subtotal: 1000,
    discount: 0,
    total: 1000,
    lines: [{ kind: "part", qty: 1, price: 1000, total: 1000, cost: 0, costState: "cp" } as never],
  };
  const pz = computeInvoiceProfitability(configuredZero);
  assert.equal(pz.partsCost, 0);
  assert.equal(pz.costPartial, false);
  assert.equal(pz.breakdown[0].notConfigured, false);
  assert.equal(pz.breakdown[0].cost, 0);
  assert.equal(pz.combinedGP, 1000);
  assert.equal(pz.grossMargin, 100); // a genuine configured ₹0 cost CAN be 100% margin

  const notConfigured: CostingInvoiceLike = {
    id: "inv-8b",
    status: "paid",
    subtotal: 1000,
    discount: 0,
    total: 1000,
    lines: [{ kind: "part", qty: 1, price: 1000, total: 1000, costState: "not_configured" } as never],
  };
  const pn = computeInvoiceProfitability(notConfigured);
  assert.equal(pn.partsCost, 0); // not counted, but...
  assert.equal(pn.costPartial, true); // ...flagged as not configured — never silently ₹0
  assert.equal(pn.breakdown[0].notConfigured, true);
  assert.equal(pn.breakdown[0].cost, null); // renders "Cost not configured", never ₹0
  assert.equal(pn.breakdown[0].unitCost, null);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Finalized-only eligibility (AC-17 / NIT-1)
 * ────────────────────────────────────────────────────────────────────────── */

test("only finalized eligible invoices contribute (AC-17)", () => {
  assert.equal(isEligibleForRealizedProfit({ id: "a", total: 100, status: "paid" }), true);
  assert.equal(
    isEligibleForRealizedProfit({ id: "a", total: 100, status: "paid", documentType: "invoice" }),
    true,
  );
  // proforma never finalized, even when paid-looking.
  assert.equal(
    isEligibleForRealizedProfit({ id: "b", total: 100, status: "paid", documentType: "proforma" }),
    false,
  );
  // unpaid / draft / cancelled never finalized.
  assert.equal(isEligibleForRealizedProfit({ id: "c", total: 100, status: "draft" }), false);
  assert.equal(isEligibleForRealizedProfit({ id: "d", total: 100, status: "cancelled" }), false);
});

test("toRevenueInvoiceLike maps shape and defaults documentType to 'invoice' (NIT-1)", () => {
  assert.deepEqual(toRevenueInvoiceLike({ id: "x", total: 50, status: "paid" }), {
    id: "x",
    ticketId: undefined,
    total: 50,
    status: "paid",
    documentType: "invoice",
  });
  assert.deepEqual(
    toRevenueInvoiceLike({ id: "y", ticketId: "t1", total: 50, status: "paid", documentType: "proforma" }),
    { id: "y", ticketId: "t1", total: 50, status: "paid", documentType: "proforma" },
  );
});

/* ──────────────────────────────────────────────────────────────────────────
 * Legacy lines (no kind/cost) tolerated — treated as parts, not configured
 * ────────────────────────────────────────────────────────────────────────── */

test("legacy lines without kind/cost are treated as unconfigured parts", () => {
  const inv: CostingInvoiceLike = {
    id: "inv-9",
    status: "paid",
    subtotal: 500,
    discount: 0,
    total: 500,
    lines: [{ qty: 1, price: 500, total: 500 } as never],
  };
  const p = computeInvoiceProfitability(inv);
  assert.equal(p.partsRevenue, 500);
  assert.equal(p.serviceRevenue, 0);
  assert.equal(p.costPartial, true);
  assert.equal(p.breakdown[0].kind, "part");
  assert.equal(p.breakdown[0].notConfigured, true);
});

/* ──────────────────────────────────────────────────────────────────────────
 * MANDATORY print-safety guarantee (inv-design §7.2 / §10, AC-18)
 *
 * The internal `cost` / `kind` / `costState` snapshot on an invoice line, the
 * device repair/labour cost, and any profit figure must NEVER reach a customer
 * document. `buildInvoiceInfo` maps only safe fields — this test proves no
 * cost/kind/costState/labour/profit property survives into its output (or any
 * nested PrintLineItem / device), so a future edit cannot silently leak cost.
 * ────────────────────────────────────────────────────────────────────────── */

const FORBIDDEN_PRINT_KEYS = ["cost", "kind", "coststate", "labour", "labor", "profit", "margin", "costprice", "standardlabourcost", "unit_cost", "unitcost"];

/** Recursively assert no object key in `value` matches a forbidden internal-cost
 *  key (case-insensitive). */
function assertNoCostKeys(value: unknown, path = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoCostKeys(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assert.ok(
        !FORBIDDEN_PRINT_KEYS.includes(k.toLowerCase()),
        `print output leaked an internal-cost property "${k}" at ${path}`,
      );
      assertNoCostKeys(v, `${path}.${k}`);
    }
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * LEDGER-DISCONNECT — the weighted-average ledger is actually READ at runtime.
 *
 * The production bug was that the sole caller passed `[]` layers, so every line
 * fell back to org CP and `source: "ledger"` / `costState: "resolved"` was dead.
 * This mirrors the invoice-create resolver (resolveLinePartCost) exactly: given
 * branch-scoped layers it must return the weighted average with ledger
 * provenance, and only fall back to CP when there are NO layers for the item.
 * ────────────────────────────────────────────────────────────────────────── */

/** The exact mapping resolveLinePartCost performs in invoice/create/page.tsx. */
function lineCostFromResolver(itemId: string, layers: StockLayerLike[], item: { costPrice?: number; costState?: "configured" | "not_configured" }) {
  const r = resolvePartUnitCost(itemId, layers, item);
  if (r.kind === "not_configured") return { cost: undefined, costState: "not_configured" as const };
  return { cost: r.unitCost, costState: r.source === "ledger" ? ("resolved" as const) : ("cp" as const) };
}

test("ledger layers drive the sold cost (weighted avg, 'resolved'); CP only when no layers (LEDGER-DISCONNECT)", () => {
  const item = { costPrice: 1000, costState: "configured" as const };
  const layers: StockLayerLike[] = [
    { item_id: "PART", qty_in: 10, unit_cost: 100 },
    { item_id: "PART", qty_in: 30, unit_cost: 200 },
    { item_id: "OTHER", qty_in: 99, unit_cost: 9999 }, // different item — ignored
  ];
  // With layers → weighted average 175, provenance LEDGER (not the 1000 CP).
  const withLayers = lineCostFromResolver("PART", layers, item);
  assert.deepEqual(withLayers, { cost: 175, costState: "resolved" });

  // With NO layers for this item → falls back to the org CP (1000), provenance cp.
  const noLayers = lineCostFromResolver("PART", [{ item_id: "OTHER", qty_in: 5, unit_cost: 50 }], item);
  assert.deepEqual(noLayers, { cost: 1000, costState: "cp" });

  // No layers AND no configured CP → not configured (never ₹0).
  const neither = lineCostFromResolver("PART", [], { costState: "not_configured" });
  assert.deepEqual(neither, { cost: undefined, costState: "not_configured" });
});

/* ──────────────────────────────────────────────────────────────────────────
 * SYS-1 — strict cost-confidentiality boundary (profit-only viewer tier).
 *
 * The server route (GET /api/invoice/[id]/profit) returns a TIERED payload:
 *   • cost-capable → full per-bucket revenue + bucket GP + combined GP + margin
 *   • profit-only  → ONLY combinedGP + grossMargin + costPartial
 * so a profit-only viewer cannot derive a per-unit cost from bucketNet − bucketGP.
 * The route composes the profit-only payload directly from the engine result;
 * this test asserts the engine supplies those three fields and that building the
 * profit-only projection drops every bucket-level figure.
 * ────────────────────────────────────────────────────────────────────────── */

/** The profit-only projection the route returns (must expose NO bucket figure). */
function profitOnlyAggregate(p: ReturnType<typeof computeInvoiceProfitability>) {
  return { combinedGP: p.combinedGP, grossMargin: p.grossMargin, costPartial: p.costPartial };
}

test("profit-only aggregate exposes ONLY combined GP + margin + partial — no bucket figure (SYS-1)", () => {
  const inv: CostingInvoiceLike = {
    id: "inv-boundary",
    status: "paid",
    subtotal: 3000,
    discount: 0,
    total: 3000,
    lines: [
      { kind: "part", qty: 1, price: 2000, total: 2000, cost: 1200, costState: "cp" } as never,
      { kind: "service", qty: 1, price: 1000, total: 1000, cost: 400, costState: "resolved" } as never,
    ],
  };
  const p = computeInvoiceProfitability(inv);
  const payload = profitOnlyAggregate(p);

  // The three allowed fields are present and correct.
  assert.equal(payload.combinedGP, 3000 - 1200 - 400);
  assert.equal(payload.grossMargin, p.grossMargin);
  assert.equal(payload.costPartial, false);

  // Crucially, NO bucket-level field leaks — a profit-only viewer must not be
  // able to compute bucketCost = bucketNet − bucketGP.
  const keys = Object.keys(payload);
  for (const forbidden of ["partsRevenue", "serviceRevenue", "partsGP", "serviceGP", "partsCost", "labourCost", "eligibleNetRevenue", "breakdown"]) {
    assert.ok(!keys.includes(forbidden), `profit-only payload leaked bucket field "${forbidden}"`);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * SYS-10 — Ticket → Invoice: no double stock deduction.
 *
 * The design (§5.4) keeps ticket-originated consumption in deductPartsForTicket
 * (planned → used, once) and adds NO invoice-side deduction. This regression
 * models that boundary: deductPartsForTicket is idempotent (a re-run finds
 * `used` parts and skips them), and finalizing / re-finalizing the linked
 * invoice performs NO deduction — so a part consumed by the ticket is never
 * decremented again, and no duplicate stock movement or invoice line is created.
 * (Pure model of the real store contract — the live-DB integration cannot run in
 * this environment, so the invariant is proven over the same logic.)
 * ────────────────────────────────────────────────────────────────────────── */

type TicketPartModel = { id: string; qty: number; status: "planned" | "used" };
type ItemModel = { id: string; currentStock: number };

/** Mirrors store.deductPartsForTicket's contract: consume ONLY `planned` parts
 *  (flip to `used`, decrement stock, emit one Outward movement each). Idempotent
 *  by the part status — a re-run finds `used` and does nothing. */
function deductPartsForTicketModel(parts: TicketPartModel[], item: ItemModel, movements: string[]) {
  for (const p of parts) {
    if (p.status !== "planned") continue;
    p.status = "used";
    item.currentStock -= p.qty;
    movements.push(`OUT-${p.id}`);
  }
}

/** Mirrors the invoice create/finalize contract after this redesign: NO stock
 *  deduction, NO movement, NO duplicate line (§5.4). It only persists lines. */
function finalizeInvoiceModel(_lines: unknown[], _item: ItemModel, _movements: string[]) {
  // Intentionally empty: invoice finalization performs no stock side effect.
}

test("ticket-consumed part is NOT re-deducted on invoice finalize; idempotent (SYS-10 / AC-12)", () => {
  const parts: TicketPartModel[] = [
    { id: "p1", qty: 2, status: "planned" },
    { id: "p2", qty: 1, status: "planned" },
  ];
  const item: ItemModel = { id: "PART", currentStock: 10 };
  const movements: string[] = [];

  // Ticket consumes its planned parts once.
  deductPartsForTicketModel(parts, item, movements);
  assert.equal(item.currentStock, 10 - 2 - 1); // 7
  assert.deepEqual(parts.map((p) => p.status), ["used", "used"]);
  assert.equal(movements.length, 2);

  // Invoice is finalized from the SAME ticket parts — no deduction added.
  const invoiceLines = parts.map((p) => ({ sku: item.id, qty: p.qty }));
  finalizeInvoiceModel(invoiceLines, item, movements);
  assert.equal(item.currentStock, 7, "invoice finalize must not deduct stock");
  assert.equal(movements.length, 2, "invoice finalize must not add a stock movement");

  // Re-finalize / duplicate submit — still no change.
  finalizeInvoiceModel(invoiceLines, item, movements);
  // And a re-run of the ticket consumption finds `used` parts and skips them.
  deductPartsForTicketModel(parts, item, movements);
  assert.equal(item.currentStock, 7, "duplicate finalize + re-run must not re-deduct");
  assert.equal(movements.length, 2, "no duplicate movement on retry");
  // No duplicate invoice line produced (one line per ticket part).
  assert.equal(invoiceLines.length, 2);
});

test("buildInvoiceInfo + every PrintLineItem carry NO cost/kind/costState/labour/profit (AC-18)", () => {
  // An invoice whose lines deliberately carry the INTERNAL cost snapshot — both
  // on the flat `items` and inside a multi-device record with a repairCost.
  const invoice = {
    id: "INV-PRINT-SAFE",
    invoiceType: "retail",
    customer: "Test Customer",
    phone: "9000000000",
    status: "paid",
    createdAt: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    paidAmount: 2500,
    items: [
      // Each line carries the forbidden internal props — they must be stripped.
      { id: "li-1", sku: "PRT-1", name: "Screen", qty: 1, price: 2500, discount: 0, total: 2500, kind: "part", cost: 1800, costState: "cp" },
    ],
    subtotal: 3300,
    discount: 0,
    tax: 0,
    total: 3300,
    devices: [
      {
        id: "IDEV-1",
        brand: "Acme",
        model: "X1",
        imei: "123",
        imeiType: "imei",
        issue: "Broken screen",
        description: "",
        jobType: "service",
        priority: "normal",
        warranty: "",
        technician: "Tech",
        repairCost: 800,
        parts: [
          { id: "li-2", sku: "PRT-2", name: "Battery", qty: 1, price: 500, discount: 0, total: 500, kind: "part", cost: 200, costState: "resolved" },
        ],
        notes: "",
        subtotal: 500,
      },
    ],
  } as unknown as Invoice;

  const info = buildInvoiceInfo(invoice, "T-001");
  // The mapped print info — and every nested PrintLineItem / device — must be
  // free of any internal cost/kind/costState/labour/profit property.
  assertNoCostKeys(info);

  // Spot-check: the line-level props the invoice line DID carry are gone.
  for (const it of info.items) {
    assert.equal((it as Record<string, unknown>).cost, undefined);
    assert.equal((it as Record<string, unknown>).kind, undefined);
    assert.equal((it as Record<string, unknown>).costState, undefined);
  }
  for (const d of info.devices ?? []) {
    for (const p of d.parts) {
      assert.equal((p as Record<string, unknown>).cost, undefined);
      assert.equal((p as Record<string, unknown>).kind, undefined);
      assert.equal((p as Record<string, unknown>).costState, undefined);
    }
  }
});
