"use client";
/**
 * RepairOX — Refund Accounting Event Emitter (journal projection).
 *
 * Architecture (mirrors expense-accounting-emitter.ts):
 *   succeeded / reversed refund (DB invoice_refunds row — the AUTHORITY)
 *     ↓  observed once per refund uuid in a UI effect (seen-set)
 *   Accounting journal (via AccountingBridge = useLedger().addEntry/reverseEntry)
 *
 * The DB `invoice_refunds` ledger is the financial-reversal AUTHORITY; this
 * journal is a demo/localStorage PRESENTATION projection. The daily-ledger
 * projection already runs inside the store action (processRefund/reverseRefund
 * via module-level recordTransaction); this file adds ONLY the journal side.
 *
 * Idempotency: per refund_no — the journal `reference` + the caller's UI
 * seen-set guarantee a realtime re-emit never doubles an entry.
 *
 * Design: app/.agents/tasks/invoice-refunds-design.md §6 / §8 (Finding-3).
 */
import { logActivity } from "./activity-log";
import type { NewLedgerEntry } from "./accounting-service";
import type { InvoiceRefund } from "./mock-data";

/** The accounting methods we need — passed in from the React component layer
 *  (useLedger()), never called as a hook from a store action. */
export interface AccountingBridge {
  addEntry: (entry: NewLedgerEntry) => { id: string };
  reverseEntry: (id: string) => void;
  getEntriesByReference: (reference: string) => { id: string; status: string }[];
}

/** Map a refund method to a ledger account label (same convention as expenses). */
const METHOD_ACCOUNT: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank",
  card: "Card",
  cheque: "Bank",
  wallet: "Digital Wallet",
  other: "Miscellaneous",
};

function accountFor(method: string): string {
  return METHOD_ACCOUNT[method] ?? method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function refundRef(refund: InvoiceRefund): string {
  return refund.refundNo || refund.id;
}

/**
 * Post a journal entry for a newly-observed `succeeded` refund. A refund is a
 * debit (money out) against the refund method account. Idempotent: skips when
 * a non-reversed entry already exists for this refund reference.
 */
export function emitRefundSucceeded(refund: InvoiceRefund, accounting: AccountingBridge, actor: string): void {
  const reference = refundRef(refund);
  const existing = accounting.getEntriesByReference(reference);
  if (existing.some((e) => e.status !== "reversed")) return; // already posted
  const entry = accounting.addEntry({
    date: (refund.processedAt || refund.createdAt || new Date().toISOString()).slice(0, 10),
    type: "refund",
    account: accountFor(refund.method),
    description: `Refund ${reference} on invoice ${refund.invoiceReference || refund.invoiceId}`,
    debit: refund.refundAmount,
    credit: 0,
    reference,
    createdBy: actor,
    status: "posted",
  });
  logActivity({
    module: "Invoice",
    action: "Refund Journal Posted",
    severity: "info",
    entity: "Refund",
    reference,
    description: `Posted refund ${reference} to the accounting journal.`,
    meta: { "Ledger Entry": entry.id, Amount: String(refund.refundAmount) },
  });
}

/**
 * Reverse the journal entry for a refund that has been reversed. Idempotent:
 * reverses any still-posted entry for this refund reference.
 */
export function emitRefundReversed(refund: InvoiceRefund, accounting: AccountingBridge, actor: string): void {
  const reference = refundRef(refund);
  const posted = accounting.getEntriesByReference(reference).filter((e) => e.status !== "reversed");
  if (posted.length === 0) return;
  for (const e of posted) accounting.reverseEntry(e.id);
  logActivity({
    module: "Invoice",
    action: "Refund Journal Reversed",
    severity: "info",
    entity: "Refund",
    reference,
    description: `Reversed refund ${reference} in the accounting journal.`,
    actor,
  });
}
