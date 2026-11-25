import test from "node:test";
import assert from "node:assert/strict";
import { computePoTotals, isIntraState, gstStateCode } from "./purchase-order";

test("subtotal, GST per line and grand total", () => {
  const t = computePoTotals([{ qty: 12, unitCost: 15500, taxPct: 18 }, { qty: 20, unitCost: 2700, taxPct: 18 }]);
  assert.equal(t.subtotal, 240000);
  assert.equal(t.tax, 43200);
  assert.equal(t.grandTotal, 283200);
});

test("percent discount is spread before tax", () => {
  const t = computePoTotals([{ qty: 1, unitCost: 1000, taxPct: 18 }, { qty: 1, unitCost: 1000, taxPct: 0 }], { discount: { type: "percent", value: 10 } });
  assert.equal(t.discount, 200);
  assert.equal(t.taxable, 1800);
  assert.equal(t.tax, 162); // 18% of the discounted 900 only
  assert.equal(t.grandTotal, 1962);
});

test("flat discount never exceeds the subtotal; charges added after tax; round-off", () => {
  const t = computePoTotals([{ qty: 3, unitCost: 333.33, taxPct: 5 }], { discount: { type: "amount", value: 5000 }, charges: [{ label: "Freight", amount: 150.4 }], roundOff: true });
  assert.equal(t.discount, 999.99);
  assert.equal(t.tax, 0);
  assert.equal(t.beforeRound, 150.4);
  assert.equal(t.grandTotal, 150);
  assert.equal(t.roundOff, -0.4);
});

test("empty PO is all zeros", () => {
  const t = computePoTotals([]);
  assert.equal(t.grandTotal, 0);
  assert.equal(t.subtotal, 0);
});

test("intra-state from GSTIN codes, else state names", () => {
  assert.equal(gstStateCode("27AACCF7457K1Z7"), "27");
  assert.equal(isIntraState({ gstin: "27ABCDE1234F1Z5" }, { gstin: "27AACCF7457K1Z7" }), true);
  assert.equal(isIntraState({ gstin: "29ABCDE1234F1Z5" }, { gstin: "27AACCF7457K1Z7" }), false);
  assert.equal(isIntraState({ state: "Karnataka" }, { state: "Maharashtra" }), false);
  assert.equal(isIntraState({ state: "Karnataka" }, { state: "karnataka " }), true);
});
