/* ──────────────────────────────────────────────────────────────────────────
   Purchase Order maths (pure, tested in purchase-order.test.ts).
   A PO is an inventory_docs row (type purchase_order). Lines carry qty, unit
   cost (buying price) and GST %. Totals:
     line base    = qty × unit cost
     discount     = flat ₹ or % of the subtotal, spread over lines by value
     taxable      = base − its share of the discount
     GST          = taxable × GST %   (split CGST + SGST when the supplier is in
                    the buyer's state, else IGST)
     extra charges (freight, packing…) are added after tax, untaxed
     round-off    = to the nearest rupee when enabled
   ────────────────────────────────────────────────────────────────────────── */

export type PoLineLike = { qty: number; unitCost?: number; taxPct?: number };
export type PoCharge = { label: string; amount: number };
export type PoDiscount = { type: "amount" | "percent"; value: number };

export type PoTotals = {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  /** True when CGST + SGST applies (same state), false for IGST. */
  intraState: boolean;
  charges: number;
  beforeRound: number;
  roundOff: number;
  grandTotal: number;
  /** Per-line: taxable value, tax, total (same order as input). */
  lines: { base: number; taxable: number; tax: number; total: number }[];
};

export const GST_RATES = [0, 5, 12, 18, 28];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** First two digits of a GSTIN = state code. */
export function gstStateCode(gstin?: string): string {
  const m = /^(\d{2})/.exec((gstin ?? "").trim());
  return m ? m[1] : "";
}

/** Same-state supply → CGST + SGST; otherwise IGST. GSTIN codes win; falls back to state names. */
export function isIntraState(buyer: { gstin?: string; state?: string }, supplier: { gstin?: string; state?: string }): boolean {
  const a = gstStateCode(buyer.gstin), b = gstStateCode(supplier.gstin);
  if (a && b) return a === b;
  const sa = (buyer.state ?? "").trim().toLowerCase(), sb = (supplier.state ?? "").trim().toLowerCase();
  return !sa || !sb || sa === sb;
}

export function computePoTotals(
  lines: readonly PoLineLike[],
  opts: { discount?: PoDiscount; charges?: readonly PoCharge[]; roundOff?: boolean; intraState?: boolean } = {},
): PoTotals {
  const bases = lines.map((l) => Math.max(0, (l.qty || 0) * (l.unitCost || 0)));
  const subtotal = bases.reduce((s, b) => s + b, 0);
  const d = opts.discount;
  const rawDisc = !d || !(d.value > 0) ? 0 : d.type === "percent" ? (subtotal * Math.min(d.value, 100)) / 100 : d.value;
  const discount = Math.min(rawDisc, subtotal);
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  const per = lines.map((l, i) => {
    const taxable = bases[i] * factor;
    const tax = (taxable * (l.taxPct || 0)) / 100;
    return { base: r2(bases[i]), taxable: r2(taxable), tax: r2(tax), total: r2(taxable + tax) };
  });
  const taxable = per.reduce((s, l) => s + l.taxable, 0);
  const tax = per.reduce((s, l) => s + l.tax, 0);
  const charges = (opts.charges ?? []).reduce((s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);
  const beforeRound = r2(taxable + tax + charges);
  const rounded = opts.roundOff ? Math.round(beforeRound) : beforeRound;
  return {
    subtotal: r2(subtotal), discount: r2(discount), taxable: r2(taxable), tax: r2(tax),
    intraState: opts.intraState ?? true, charges: r2(charges), beforeRound,
    roundOff: r2(rounded - beforeRound), grandTotal: r2(rounded), lines: per,
  };
}
