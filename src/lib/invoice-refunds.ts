/**
 * RepairOX — Invoice Refund engine (pure, no DB, no React)
 *
 * The ONE source of refund eligibility, scope/allocation math and the DERIVED
 * refund status. Consumed by the store action, the refund flow UI, the invoice
 * table/view, and reports — so every surface agrees. Mirrors how leads-data.ts
 * holds pure lead helpers.
 *
 * Design: app/.agents/tasks/invoice-refunds-design.md §5.
 *
 * Core rules:
 *  • refundableBase(invoice) reads REAL money state = min(paidAmount, total),
 *    0 for proforma/draft/cancelled (never the status label alone).
 *  • Realized refunded = Σ refundAmount where status === 'succeeded' (reports +
 *    derived status). Guard-reserved = Σ where status in succeeded|pending|
 *    processing (the over-refund reservation).
 *  • Tax is a BUDGET SPLIT of invoice.tax (never an independent rate multiply),
 *    with residual-paisa to the largest line, so Σ(line tax) === invoice.tax
 *    exactly for a full scope and a ₹0-net scope ⇒ ₹0 tax.
 *  • fully_refunded ⇔ priorRefunded === refundableBase (±1 paisa) — a money-base
 *    test, independent of line-sum arithmetic.
 */
import {
  getInvoiceDevices,
  getDocumentType,
  type Invoice,
  type InvoiceDeviceRecord,
  type InvoiceLineItem,
  type InvoiceRefund,
  type InvoiceRefundAllocation,
  type RefundStatus,
  type RefundScope,
} from "./mock-data";

const PAISA = 0.01;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ───────────────────────── refundable base + balances ─────────────────── */

/** The settled refundable amount — reads real money state, not the label. */
export function refundableBase(invoice: Invoice): number {
  if (getDocumentType(invoice) === "proforma") return 0;
  if (invoice.status === "draft" || invoice.status === "cancelled") return 0;
  const paid = invoice.paidAmount ?? 0;
  const total = invoice.total ?? 0;
  return Math.max(0, Math.min(paid, total));
}

/** REALIZED refunded (reports + derived status): succeeded refunds only. */
export function priorRefunded(refunds: InvoiceRefund[]): number {
  return round2(
    refunds
      .filter((r) => r.status === "succeeded")
      .reduce((s, r) => s + (r.refundAmount || 0), 0),
  );
}

/** GUARD-reserved (over-refund reservation): succeeded + in-flight. */
export function guardReserved(refunds: InvoiceRefund[]): number {
  return round2(
    refunds
      .filter((r) => r.status === "succeeded" || r.status === "pending" || r.status === "processing")
      .reduce((s, r) => s + (r.refundAmount || 0), 0),
  );
}

/** What the UI may offer = base − realized refunded. */
export function remainingRefundable(invoice: Invoice, refunds: InvoiceRefund[]): number {
  return round2(Math.max(0, refundableBase(invoice) - priorRefunded(refunds)));
}

/* ───────────────────────── scope tree (device/line) ───────────────────── */

export type ScopeLine = {
  deviceId: string;
  ticketDeviceId?: string;
  lineId: string;
  lineComponent: "line" | "repair_cost";
  sku?: string;
  name: string;
  /** full invoiced qty of this line (1 for a repair_cost component) */
  qty: number;
  /** gross net (price*qty − perLineDiscount) before proportional invoice discount */
  grossNet: number;
};

export type ScopeDevice = {
  deviceId: string;
  ticketDeviceId?: string;
  brand: string;
  model: string;
  lines: ScopeLine[];
};

/** Build the device/line tree from getInvoiceDevices() so legacy flat and
 *  multi-device invoices behave identically. */
export function buildScopeTree(invoice: Invoice): ScopeDevice[] {
  const devices = getInvoiceDevices(invoice);
  return devices.map((d: InvoiceDeviceRecord) => {
    const lines: ScopeLine[] = [];
    (d.parts || []).forEach((p: InvoiceLineItem) => {
      const grossNet = Math.max(0, (p.price || 0) * (p.qty || 0) - (p.discount || 0));
      lines.push({
        deviceId: d.id,
        ticketDeviceId: d.ticketDeviceId,
        lineId: p.id,
        lineComponent: "line",
        sku: p.sku,
        name: p.name,
        qty: p.qty || 0,
        grossNet,
      });
    });
    const repair = d.repairCost ?? 0;
    if (repair > 0) {
      lines.push({
        deviceId: d.id,
        ticketDeviceId: d.ticketDeviceId,
        lineId: `${d.id}::repair_cost`,
        lineComponent: "repair_cost",
        name: "Repair / Labour",
        qty: 1,
        grossNet: repair,
      });
    }
    return {
      deviceId: d.id,
      ticketDeviceId: d.ticketDeviceId,
      brand: d.brand,
      model: d.model,
      lines,
    };
  });
}

/** Σ of every device/line gross net = subtotal + Σ repairCost. */
export function invoiceNet(invoice: Invoice): number {
  return round2(
    buildScopeTree(invoice).reduce(
      (s, d) => s + d.lines.reduce((ls, l) => ls + l.grossNet, 0),
      0,
    ),
  );
}

/** Proportional discount factor against invoice net. */
function discountFactor(invoice: Invoice): number {
  const net = invoiceNet(invoice);
  return net > 0 ? (invoice.discount || 0) / net : 0;
}

/** The full refundable value of a single line id (net-after-discount + its tax
 *  share) — restated here beside the per-line remaining (NIT-1). */
export function lineRefundableValue(invoice: Invoice, lineId: string): number {
  const alloc = allocateScope(invoice, [lineId]);
  const only = alloc.lines.find((l) => l.lineId === lineId);
  return only ? round2(only.allocNet + only.allocTax) : 0;
}

/* ───────────────────────── allocation math (§5.4) ─────────────────────── */

export type AllocatedLine = {
  deviceId: string;
  ticketDeviceId?: string;
  lineId: string;
  lineComponent: "line" | "repair_cost";
  sku?: string;
  name: string;
  qty: number;
  /** net share after proportional invoice discount */
  allocNet: number;
  /** budget-split tax share of invoice.tax */
  allocTax: number;
  /** allocNet + allocTax */
  allocAmount: number;
};

export type Allocation = {
  lines: AllocatedLine[];
  net: number;
  tax: number;
  amount: number;
};

/**
 * Allocate the given scope (a set of line ids, with optional per-line qty) and
 * compute net-after-discount + a budget-split of invoice.tax (residual paisa to
 * the largest line). Σ(line tax) over a FULL-invoice scope === invoice.tax
 * exactly; a ₹0-net scope ⇒ ₹0 tax.
 *
 * @param lineIds   the selected line ids
 * @param qtyByLine optional partial qty per line id (defaults to full qty)
 */
export function allocateScope(
  invoice: Invoice,
  lineIds: string[],
  qtyByLine?: Record<string, number>,
): Allocation {
  const tree = buildScopeTree(invoice);
  const allLines = tree.flatMap((d) => d.lines);
  const factor = discountFactor(invoice);
  const selected = new Set(lineIds);

  // 1. net-after-discount per selected line (prorated to the selected qty).
  const partial: AllocatedLine[] = [];
  for (const l of allLines) {
    if (!selected.has(l.lineId)) continue;
    const fullQty = l.qty || 0;
    const useQty = qtyByLine && qtyByLine[l.lineId] != null ? qtyByLine[l.lineId] : fullQty;
    const qtyFactor = fullQty > 0 ? Math.min(1, Math.max(0, useQty / fullQty)) : 1;
    const grossNet = l.grossNet * qtyFactor;
    const netAfterDisc = Math.max(0, grossNet * (1 - factor));
    partial.push({
      deviceId: l.deviceId,
      ticketDeviceId: l.ticketDeviceId,
      lineId: l.lineId,
      lineComponent: l.lineComponent,
      sku: l.sku,
      name: l.name,
      qty: l.lineComponent === "repair_cost" ? 1 : useQty,
      allocNet: round2(netAfterDisc),
      allocTax: 0,
      allocAmount: 0,
    });
  }

  const totalSelectedNet = partial.reduce((s, l) => s + l.allocNet, 0);
  const invoiceTax = invoice.tax || 0;

  // 2. budget-split of invoice.tax weighted by net-after-discount.
  if (totalSelectedNet > 0 && invoiceTax > 0) {
    let assigned = 0;
    for (const l of partial) {
      l.allocTax = round2((invoiceTax * l.allocNet) / totalSelectedNet);
      assigned += l.allocTax;
    }
    // Residual paisa → the largest-net line, so a full scope's Σ === invoice.tax
    // exactly. For a partial scope this keeps Σ ≤ invoice.tax.
    const fullScopeNet = invoiceNet(invoice);
    const scopeTaxBudget =
      fullScopeNet > 0 ? round2((invoiceTax * totalSelectedNet) / fullScopeNet) : 0;
    // Full-invoice selection → budget is the entire invoice.tax.
    const isFullInvoice = Math.abs(totalSelectedNet - fullScopeNet) < PAISA;
    const budget = isFullInvoice ? invoiceTax : Math.min(scopeTaxBudget, invoiceTax);
    const residual = round2(budget - assigned);
    if (Math.abs(residual) >= PAISA && partial.length > 0) {
      const largest = partial.reduce((a, b) => (b.allocNet > a.allocNet ? b : a), partial[0]);
      largest.allocTax = round2(largest.allocTax + residual);
    }
  }

  for (const l of partial) {
    l.allocAmount = round2(l.allocNet + l.allocTax);
  }

  const net = round2(partial.reduce((s, l) => s + l.allocNet, 0));
  const tax = round2(partial.reduce((s, l) => s + l.allocTax, 0));
  const amount = round2(net + tax);
  return { lines: partial, net, tax, amount };
}

/* ───────────────────── per-line / per-device remaining ────────────────── */

/** Σ succeeded allocation amount for a line id. */
export function lineRefundedAmount(
  lineId: string,
  refunds: InvoiceRefund[],
  allocations: InvoiceRefundAllocation[],
): number {
  const succeeded = new Set(refunds.filter((r) => r.status === "succeeded").map((r) => r.id));
  return round2(
    allocations
      .filter((a) => a.lineId === lineId && succeeded.has(a.refundId))
      .reduce((s, a) => s + (a.allocAmount || 0), 0),
  );
}

/** Σ succeeded allocation qty for a line id. */
export function lineRefundedQty(
  lineId: string,
  refunds: InvoiceRefund[],
  allocations: InvoiceRefundAllocation[],
): number {
  const succeeded = new Set(refunds.filter((r) => r.status === "succeeded").map((r) => r.id));
  return round2(
    allocations
      .filter((a) => a.lineId === lineId && succeeded.has(a.refundId))
      .reduce((s, a) => s + (a.qty || 0), 0),
  );
}

export function lineRemainingValue(
  invoice: Invoice,
  lineId: string,
  refunds: InvoiceRefund[],
  allocations: InvoiceRefundAllocation[],
): number {
  return round2(
    Math.max(0, lineRefundableValue(invoice, lineId) - lineRefundedAmount(lineId, refunds, allocations)),
  );
}

export function lineRemainingQty(
  invoice: Invoice,
  lineId: string,
  refunds: InvoiceRefund[],
  allocations: InvoiceRefundAllocation[],
): number {
  const tree = buildScopeTree(invoice);
  const line = tree.flatMap((d) => d.lines).find((l) => l.lineId === lineId);
  const fullQty = line?.qty ?? 0;
  return round2(Math.max(0, fullQty - lineRefundedQty(lineId, refunds, allocations)));
}

/* ───────────────────────── eligibility (§5.3) ─────────────────────────── */

export type EligibilityReason =
  | "proforma"
  | "draft"
  | "cancelled_use_credit"
  | "unpaid_use_credit"
  | "fully_refunded"
  | "no_balance";

export type Eligibility = {
  eligible: boolean;
  reasonWhenBlocked?: EligibilityReason;
  base: number;
  priorRefunded: number;
  remaining: number;
  suggestedAlternative?: { label: string; href: string };
};

export function eligibility(invoice: Invoice, refunds: InvoiceRefund[]): Eligibility {
  const base = refundableBase(invoice);
  const prior = priorRefunded(refunds);
  const remaining = round2(Math.max(0, base - prior));

  if (getDocumentType(invoice) === "proforma") {
    return { eligible: false, reasonWhenBlocked: "proforma", base, priorRefunded: prior, remaining };
  }
  if (invoice.status === "draft") {
    return { eligible: false, reasonWhenBlocked: "draft", base, priorRefunded: prior, remaining };
  }
  if (invoice.status === "cancelled") {
    return {
      eligible: false,
      reasonWhenBlocked: "cancelled_use_credit",
      base,
      priorRefunded: prior,
      remaining,
      suggestedAlternative: { label: "View Invoice", href: `/invoice/${invoice.id}` },
    };
  }
  if (base <= 0) {
    // Unpaid (sent/overdue, paidAmount 0) → cancellation/credit path, not cash.
    return {
      eligible: false,
      reasonWhenBlocked: "unpaid_use_credit",
      base,
      priorRefunded: prior,
      remaining,
      suggestedAlternative: { label: "Cancel Invoice", href: `/invoice/${invoice.id}` },
    };
  }
  if (remaining <= 0) {
    return { eligible: false, reasonWhenBlocked: "fully_refunded", base, priorRefunded: prior, remaining };
  }
  return { eligible: true, base, priorRefunded: prior, remaining };
}

/* ───────────────── full-scope scaling + partial distribution ──────────── */

/** Scale an allocation so its total never exceeds the money cap (full-scope on
 *  a partially-paid invoice). The scale only ever SHRINKS (min(1, cap/sum)). */
export function scaleAllocation(alloc: Allocation, cap: number): Allocation {
  if (alloc.amount <= 0 || cap >= alloc.amount) return alloc;
  const scale = Math.min(1, cap / alloc.amount);
  const lines = alloc.lines.map((l) => ({
    ...l,
    allocNet: round2(l.allocNet * scale),
    allocTax: round2(l.allocTax * scale),
    allocAmount: round2((l.allocNet + l.allocTax) * scale),
  }));
  // residual to the largest line so Σ === cap exactly
  let sum = round2(lines.reduce((s, l) => s + l.allocAmount, 0));
  if (lines.length > 0 && Math.abs(sum - round2(cap)) >= PAISA) {
    const diff = round2(round2(cap) - sum);
    const largest = lines.reduce((a, b) => (b.allocAmount > a.allocAmount ? b : a), lines[0]);
    largest.allocAmount = round2(largest.allocAmount + diff);
    largest.allocNet = round2(largest.allocAmount - largest.allocTax);
    sum = round2(cap);
  }
  const net = round2(lines.reduce((s, l) => s + l.allocNet, 0));
  const tax = round2(lines.reduce((s, l) => s + l.allocTax, 0));
  return { lines, net, tax, amount: round2(net + tax) };
}

/** Distribute a partial money amount downward across an allocation, re-deriving
 *  each line's net/tax proportionally so the net/tax split stays consistent. */
export function distributePartial(alloc: Allocation, amount: number): Allocation {
  if (alloc.amount <= 0) return alloc;
  const scale = Math.min(1, Math.max(0, amount / alloc.amount));
  const scaled = scaleAllocation(
    { ...alloc, lines: alloc.lines.map((l) => ({ ...l })) },
    round2(alloc.amount * scale),
  );
  return scaled;
}

/* ───────────────────────── derived refund status (§5.5) ───────────────── */

export function refundStatus(invoice: Invoice, refunds: InvoiceRefund[]): RefundStatus {
  const succeeded = refunds.filter((r) => r.status === "succeeded");
  const prior = priorRefunded(refunds);
  const anyPendingOrProcessing = refunds.some(
    (r) => r.status === "pending" || r.status === "processing",
  );
  const anyFailedOrReversed = refunds.some((r) => r.status === "failed" || r.status === "reversed");

  if (succeeded.length === 0 && anyPendingOrProcessing) return "refund_pending";
  if (succeeded.length === 0 && anyFailedOrReversed) return "refund_failed_reversed";
  if (prior <= 0) return "no_refund";

  const base = refundableBase(invoice);
  if (prior >= base - PAISA) return "fully_refunded";
  return "partially_refunded";
}

/** Convenience: filter a refund set to one invoice. */
export function refundsForInvoice(refunds: InvoiceRefund[], invoiceId: string): InvoiceRefund[] {
  return refunds.filter((r) => r.invoiceId === invoiceId);
}

/** Convenience: allocations for one invoice. */
export function allocationsForInvoice(
  allocations: InvoiceRefundAllocation[],
  invoiceId: string,
): InvoiceRefundAllocation[] {
  return allocations.filter((a) => a.invoiceId === invoiceId);
}

export const INVOICE_REFUNDS_PAISA = PAISA;
export { round2 as roundMoney };
