"use client";

/**
 * RepairOX — Expense Accounting Event Emitter
 *
 * Architecture:
 *   Expense Created / Updated / Cancelled
 *     ↓
 *   Accounting Service (this file)
 *     ↓
 *   Daily Ledger (via useLedger().addEntry / reverseEntry)
 *     ↓
 *   Activity Log (via logActivity)
 *
 * The Expense module NEVER directly manipulates ledger balances.
 * It calls these emitter functions which coordinate with the
 * Accounting Service and Activity Log.
 */

import type { Expense, PaymentMode } from "./expense-store";
import { linkLedgerEntry } from "./expense-store";
import { logActivity } from "./activity-log";
import type { NewLedgerEntry } from "./accounting-service";
import {
  recordTransaction,
  updateTransaction,
  removeTransaction,
  getTransactionByExpenseId,
  type TransactionCategory,
  type PaymentMode as LedgerPaymentMode,
} from "./daily-ledger-service";

/* ─── Types ──────────────────────────────────────────────────────── */

export interface ExpenseAccountingEvent {
  type: "expense_created" | "expense_updated" | "expense_cancelled";
  expense: Expense;
  previousExpense?: Expense;
  reason?: string;
  actor: string;
}

/** The accounting context methods we need — passed in from the React component layer */
export interface AccountingBridge {
  addEntry: (entry: NewLedgerEntry) => { id: string };
  reverseEntry: (id: string) => void;
  getEntriesByReference: (reference: string) => { id: string; status: string }[];
}

/* ─── Payment Mode → Account Mapping ────────────────────────────── */

const PAYMENT_MODE_ACCOUNT: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank",
  card: "Card",
  cheque: "Bank",
  wallet: "Digital Wallet",
  other: "Miscellaneous",
};

/* ─── Event Handlers ─────────────────────────────────────────────── */

/**
 * Called after an expense is successfully created.
 * Posts a debit entry to the ledger and logs the activity.
 */
export function emitExpenseCreated(
  expense: Expense,
  accounting: AccountingBridge,
  actor: string
): void {
  // 1. Post to Ledger (debit the expense category account)
  const ledgerEntry = accounting.addEntry({
    date: expense.date,
    type: "expense",
    account: expense.category,
    description: expense.description,
    debit: expense.amount,
    credit: 0,
    reference: expense.expenseId,
    createdBy: actor,
    status: "posted",
  });

  // 2. Link the ledger entry back to the expense record
  linkLedgerEntry(expense.id, ledgerEntry.id);

  // 2b. Mirror the expense into the Daily Ledger as an outflow.
  recordExpenseInDailyLedger(expense, actor);

  // 3. Log to Activity Trail
  logActivity({
    module: "Expense",
    action: "Expense Created",
    severity: "success",
    entity: "Expense",
    reference: expense.expenseId,
    description: `New expense "${expense.description}" of ${formatAmount(expense.amount)} recorded under ${expense.category}.`,
    actor,
    meta: {
      "Amount": formatAmount(expense.amount),
      "Category": expense.category,
      "Payment Mode": expense.paymentMode,
      "Ledger Entry": ledgerEntry.id,
      ...(expense.vendor ? { "Vendor": expense.vendor } : {}),
    },
  });
}

/**
 * Called after an expense is successfully updated.
 * If the amount changed, reverses the old ledger entry and posts a new one.
 * Always logs the activity with field-level diffs.
 */
export function emitExpenseUpdated(
  updatedExpense: Expense,
  previousExpense: Expense,
  accounting: AccountingBridge,
  actor: string
): void {
  const amountChanged = updatedExpense.amount !== previousExpense.amount;
  const categoryChanged = updatedExpense.category !== previousExpense.category;
  const descriptionChanged = updatedExpense.description !== previousExpense.description;
  const paymentModeChanged = updatedExpense.paymentMode !== previousExpense.paymentMode;

  // If financial details changed, reverse old entry and create new one
  if (amountChanged || categoryChanged) {
    // Reverse old ledger entry
    if (previousExpense.ledgerEntryId) {
      accounting.reverseEntry(previousExpense.ledgerEntryId);
    }

    // Post new ledger entry
    const newLedgerEntry = accounting.addEntry({
      date: updatedExpense.date,
      type: "expense",
      account: updatedExpense.category,
      description: updatedExpense.description,
      debit: updatedExpense.amount,
      credit: 0,
      reference: updatedExpense.expenseId,
      createdBy: actor,
      status: "posted",
    });

    // Update link
    linkLedgerEntry(updatedExpense.id, newLedgerEntry.id);
  }

  // Keep the Daily Ledger row in sync with the edited expense. If none exists
  // yet (expense created before this bridge), create it now.
  const existingTx = getTransactionByExpenseId(updatedExpense.id);
  if (existingTx) {
    const { paymentMode, cashOrBank } = toLedgerPayment(updatedExpense.paymentMode);
    updateTransaction(
      existingTx.id,
      {
        date: updatedExpense.date,
        referenceId: updatedExpense.expenseId,
        description: updatedExpense.description,
        category: toLedgerCategory(updatedExpense.category),
        paymentMode,
        cashOrBank,
        amount: updatedExpense.amount,
        employee: updatedExpense.employee || actor,
      },
      actor
    );
  } else {
    recordExpenseInDailyLedger(updatedExpense, actor);
  }

  // Build field-level change diffs
  const changes: { field: string; from?: string; to?: string }[] = [];
  if (amountChanged) changes.push({ field: "Amount", from: formatAmount(previousExpense.amount), to: formatAmount(updatedExpense.amount) });
  if (categoryChanged) changes.push({ field: "Category", from: previousExpense.category, to: updatedExpense.category });
  if (descriptionChanged) changes.push({ field: "Description", from: previousExpense.description, to: updatedExpense.description });
  if (paymentModeChanged) changes.push({ field: "Payment Mode", from: previousExpense.paymentMode, to: updatedExpense.paymentMode });
  if (updatedExpense.vendor !== previousExpense.vendor) changes.push({ field: "Vendor", from: previousExpense.vendor || "—", to: updatedExpense.vendor || "—" });
  if (updatedExpense.employee !== previousExpense.employee) changes.push({ field: "Employee", from: previousExpense.employee || "—", to: updatedExpense.employee || "—" });

  // Log activity
  logActivity({
    module: "Expense",
    action: "Expense Updated",
    severity: "info",
    entity: "Expense",
    reference: updatedExpense.expenseId,
    description: `Expense "${updatedExpense.description}" updated${amountChanged ? ` (amount: ${formatAmount(previousExpense.amount)} → ${formatAmount(updatedExpense.amount)})` : ""}.`,
    actor,
    changes,
    meta: {
      "Expense ID": updatedExpense.expenseId,
      "Fields Changed": String(changes.length),
    },
  });
}

/**
 * Called after an expense is cancelled (soft-deleted).
 * Reverses the linked ledger entry and logs the cancellation with reason.
 */
export function emitExpenseCancelled(
  expense: Expense,
  reason: string,
  accounting: AccountingBridge,
  actor: string
): void {
  // 1. Reverse the linked ledger entry
  if (expense.ledgerEntryId) {
    accounting.reverseEntry(expense.ledgerEntryId);
  }

  // 1b. Remove the mirrored Daily Ledger outflow so the day balance is correct.
  const ledgerTx = getTransactionByExpenseId(expense.id);
  if (ledgerTx) removeTransaction(ledgerTx.id);

  // 2. Log to Activity Trail with reason
  logActivity({
    module: "Expense",
    action: "Expense Cancelled",
    severity: "warning",
    entity: "Expense",
    reference: expense.expenseId,
    description: `Expense "${expense.description}" (${formatAmount(expense.amount)}) cancelled and ledger entry reversed.`,
    actor,
    reason,
    meta: {
      "Amount": formatAmount(expense.amount),
      "Category": expense.category,
      "Reason": reason,
      "Ledger Entry Reversed": expense.ledgerEntryId || "N/A",
    },
  });
}

/* ─── Daily Ledger bridge ────────────────────────────────────────────
   Expenses must also show up in the Daily Ledger (the per-day cash/bank
   book at /accounts/ledger). The Daily Ledger is a separate store from the
   accounting ledger above, so we mirror every expense into it here — this is
   the single coordination point, so the UI never has to know about either. */

/** Expense payment mode → Daily Ledger payment mode + which balance it hits. */
function toLedgerPayment(mode: PaymentMode): { paymentMode: LedgerPaymentMode; cashOrBank: "Cash" | "Bank" } {
  switch (mode) {
    case "cash": return { paymentMode: "Cash", cashOrBank: "Cash" };
    case "upi": return { paymentMode: "UPI", cashOrBank: "Bank" };
    case "bank_transfer": return { paymentMode: "Bank", cashOrBank: "Bank" };
    case "card": return { paymentMode: "Card", cashOrBank: "Bank" };
    case "cheque": return { paymentMode: "Cheque", cashOrBank: "Bank" };
    case "wallet": return { paymentMode: "UPI", cashOrBank: "Bank" };
    default: return { paymentMode: "Cash", cashOrBank: "Cash" };
  }
}

/** Free-form expense category → the Daily Ledger's fixed category set. */
function toLedgerCategory(category: string): TransactionCategory {
  const c = category.toLowerCase();
  if (c.includes("rent")) return "Rent Expense";
  if (c.includes("salary") || c.includes("wage")) return "Salary Expense";
  if (c.includes("utilit")) return "Utilities";
  if (c.includes("office") || c.includes("supplies") || c.includes("stationery")) return "Office Supplies";
  if (c.includes("market")) return "Marketing";
  if (c.includes("fuel") || c.includes("travel")) return "Fuel & Travel";
  if (c.includes("courier") || c.includes("ship")) return "Courier & Shipping";
  return "Miscellaneous";
}

/** Record an expense as an outflow in the Daily Ledger. */
function recordExpenseInDailyLedger(expense: Expense, actor: string): void {
  const { paymentMode, cashOrBank } = toLedgerPayment(expense.paymentMode);
  recordTransaction({
    date: expense.date,
    module: "Expense",
    referenceId: expense.expenseId,
    description: expense.description,
    category: toLedgerCategory(expense.category),
    paymentMode,
    cashOrBank,
    direction: "outflow",
    amount: expense.amount,
    employee: expense.employee || actor,
    createdBy: actor,
    linkedExpenseId: expense.id,
  });
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function formatAmount(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
