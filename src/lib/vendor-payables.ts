/* Vendor payables — what we owe suppliers. A POSTED GRN is the vendor bill (its value at
   unit cost); payments recorded on that GRN reduce it. Due date = GRN date + the vendor's
   payment-terms days ("30 days", "Net 15"; no number = due on receipt). Purchasing docs are
   cost-gated by RLS, so a user without purchasing/cost access simply sees nothing. */
import { docValue, type InvDoc, type Vendor } from "@/lib/inventory-ops";

const DAY = 86_400_000;
export const termsDays = (terms?: string) => { const m = /(\d+)/.exec(terms ?? ""); return m ? Number(m[1]) : 0; };
export const grnPaid = (d: InvDoc) => (typeof d.data.paidAmount === "number" ? d.data.paidAmount : 0);
export const grnBalance = (d: InvDoc) => Math.max(docValue(d) - grnPaid(d), 0);

export function grnDueDate(d: InvDoc, vendors: Vendor[]): Date {
  const base = new Date(d.createdAt || Date.now()).getTime();
  return new Date(base + termsDays(vendors.find((v) => v.name === d.party)?.paymentTerms) * DAY);
}

export type VendorPayable = { vendor: string; billed: number; paid: number; outstanding: number; overdue: number; bills: number };

export function vendorPayables(docs: InvDoc[], vendors: Vendor[], now = Date.now()) {
  const m = new Map<string, VendorPayable>();
  for (const d of docs) {
    if (d.type !== "grn" || d.status !== "posted") continue;
    const bal = grnBalance(d);
    const row = m.get(d.party) ?? { vendor: d.party || "Unknown vendor", billed: 0, paid: 0, outstanding: 0, overdue: 0, bills: 0 };
    row.billed += docValue(d); row.paid += grnPaid(d); row.outstanding += bal;
    if (bal > 0) { row.bills++; if (grnDueDate(d, vendors).getTime() < now) row.overdue += bal; }
    m.set(d.party, row);
  }
  const rows = [...m.values()].filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  return {
    rows, byVendor: m,
    outstanding: rows.reduce((n, r) => n + r.outstanding, 0),
    overdue: rows.reduce((n, r) => n + r.overdue, 0),
    vendors: rows.length, bills: rows.reduce((n, r) => n + r.bills, 0),
  };
}
