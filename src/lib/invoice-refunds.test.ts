/**
 * RepairOX — Invoice Refund engine acceptance tests (pure, no DB/React).
 * Run: npx tsx --test src/lib/invoice-refunds.test.ts
 *
 * Covers the design §15/§16 fixtures: eligibility caps, scope/allocation,
 * budget-split tax (Σ === invoice.tax), full-scope scaling on a partially-paid
 * invoice, ₹0-net scope ⇒ ₹0 tax, and derived refund status.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refundableBase,
  remainingRefundable,
  eligibility,
  allocateScope,
  scaleAllocation,
  distributePartial,
  refundStatus,
  buildScopeTree,
} from "./invoice-refunds";
import type { Invoice, InvoiceRefund } from "./mock-data";

/* ─── fixtures ──────────────────────────────────────────────────────── */

function mkInvoice(p: Partial<Invoice>): Invoice {
  return {
    id: "INV-1",
    reference: "INV-1",
    invoiceType: "retail",
    customer: "Test",
    phone: "",
    email: "",
    company: "",
    status: "paid",
    dueDate: "",
    paidAmount: 1180,
    subtotal: 1000,
    discount: 0,
    tax: 180,
    total: 1180,
    notes: "",
    terms: "",
    slogan: "",
    footer: "",
    employee: "",
    items: [],
    devices: [],
    createdAt: new Date().toISOString(),
    ...p,
  } as Invoice;
}

function mkRefund(p: Partial<InvoiceRefund>): InvoiceRefund {
  return {
    id: Math.random().toString(36).slice(2),
    invoiceId: "INV-1",
    scope: "invoice",
    refundKind: "partial",
    refundNet: 0,
    refundTax: 0,
    refundDiscount: 0,
    refundAmount: 0,
    reasonCode: "Customer requested",
    method: "cash",
    status: "succeeded",
    ...p,
  } as InvoiceRefund;
}

// A flat (legacy) invoice: one synthetic device wrapping items.
const flat = mkInvoice({
  items: [
    { id: "L1", name: "Screen", qty: 1, price: 1000, discount: 0, total: 1000 },
  ],
});

// A multi-device invoice: 2 devices, repairCost + parts, discount + tax.
const multi = mkInvoice({
  subtotal: 2000,
  discount: 200,
  tax: 324, // 18% of (2000-200)
  total: 2124,
  paidAmount: 2124,
  devices: [
    { id: "D1", brand: "Apple", model: "iPhone", repairCost: 500, parts: [
      { id: "L1", name: "Battery", qty: 1, price: 500, discount: 0, total: 500 },
    ], subtotal: 1000 } as any,
    { id: "D2", brand: "Samsung", model: "S21", repairCost: 400, parts: [
      { id: "L2", name: "Glass", qty: 2, price: 300, discount: 0, total: 600 },
    ], subtotal: 1000 } as any,
  ],
});

/* ─── tests ─────────────────────────────────────────────────────────── */

test("refundableBase reads real money state (min(paid,total))", () => {
  assert.equal(refundableBase(flat), 1180);
  assert.equal(refundableBase(mkInvoice({ paidAmount: 500, total: 1180, status: "partial" })), 500);
  assert.equal(refundableBase(mkInvoice({ status: "draft" })), 0);
  assert.equal(refundableBase(mkInvoice({ status: "cancelled" })), 0);
  assert.equal(refundableBase(mkInvoice({ documentType: "proforma" })), 0);
});

test("eligibility blocks proforma/draft/unpaid, allows finalized paid", () => {
  assert.equal(eligibility(flat, []).eligible, true);
  assert.equal(eligibility(mkInvoice({ status: "draft" }), []).reasonWhenBlocked, "draft");
  assert.equal(eligibility(mkInvoice({ documentType: "proforma" }), []).reasonWhenBlocked, "proforma");
  assert.equal(eligibility(mkInvoice({ status: "sent", paidAmount: 0 }), []).reasonWhenBlocked, "unpaid_use_credit");
});

test("over-refund: remaining caps at base − prior; fully refunded blocks", () => {
  const r1 = mkRefund({ refundAmount: 1180, refundNet: 1000, refundTax: 180 });
  assert.equal(remainingRefundable(flat, [r1]), 0);
  assert.equal(eligibility(flat, [r1]).eligible, false);
  assert.equal(eligibility(flat, [r1]).reasonWhenBlocked, "fully_refunded");
  // reversed/failed free the balance.
  assert.equal(remainingRefundable(flat, [mkRefund({ refundAmount: 1180, status: "reversed" })]), 1180);
});

test("budget-split tax: Σ(line tax) over full invoice === invoice.tax exactly", () => {
  const tree = buildScopeTree(multi);
  const allIds = tree.flatMap((d) => d.lines).map((l) => l.lineId);
  const alloc = allocateScope(multi, allIds);
  assert.equal(alloc.tax, multi.tax); // provable, not approximate
  // net === subtotal − discount (2000 − 200 = 1800)
  assert.equal(alloc.net, 1800);
  assert.equal(alloc.amount, 1800 + 324);
});

test("partial scope tax ≤ invoice.tax; ₹0-net scope ⇒ ₹0 tax", () => {
  // Only device D1's parts line (net 500 before discount).
  const one = allocateScope(multi, ["L1"]);
  assert.ok(one.tax <= multi.tax);
  assert.ok(one.tax > 0);
  // A ₹0 line (100% discounted) → zero net → zero tax.
  const zeroNet = mkInvoice({
    subtotal: 1000, discount: 1000, tax: 0, total: 0, paidAmount: 0,
    items: [{ id: "Z", name: "Free", qty: 1, price: 1000, discount: 1000, total: 0 }],
  });
  const za = allocateScope(zeroNet, ["Z"]);
  assert.equal(za.tax, 0);
  assert.equal(za.net, 0);
});

test("full-scope scaling never exceeds remainingRefundable (partially paid)", () => {
  // total 1180 but only 590 paid → base 590. Full-scope alloc (1180) scaled to 590.
  const partPaid = mkInvoice({
    paidAmount: 590, status: "partial",
    items: [{ id: "L1", name: "Screen", qty: 1, price: 1000, discount: 0, total: 1000 }],
  });
  const remaining = remainingRefundable(partPaid, []);
  assert.equal(remaining, 590);
  const alloc = allocateScope(partPaid, ["L1"]);
  const scaled = scaleAllocation(alloc, remaining);
  assert.ok(scaled.amount <= remaining + 0.01);
  assert.equal(scaled.amount, 590);
});

test("distributePartial shrinks proportionally", () => {
  const alloc = allocateScope(flat, ["L1"]); // 1180
  const part = distributePartial(alloc, 590);
  assert.ok(part.amount <= 590 + 0.01);
  assert.ok(part.net > 0 && part.tax >= 0);
});

test("derived refund status", () => {
  assert.equal(refundStatus(flat, []), "no_refund");
  assert.equal(refundStatus(flat, [mkRefund({ refundAmount: 100 })]), "partially_refunded");
  assert.equal(refundStatus(flat, [mkRefund({ refundAmount: 1180 })]), "fully_refunded");
  assert.equal(refundStatus(flat, [mkRefund({ refundAmount: 100, status: "pending" })]), "refund_pending");
  assert.equal(refundStatus(flat, [mkRefund({ refundAmount: 100, status: "reversed" })]), "refund_failed_reversed");
  // partially-paid invoice fully refunded of its SETTLED money → fully_refunded.
  const partPaid = mkInvoice({ paidAmount: 590, status: "partial" });
  assert.equal(refundStatus(partPaid, [mkRefund({ refundAmount: 590 })]), "fully_refunded");
});
