"use client";

/**
 * RepairOX — Daily Ledger Service
 * ────────────────────────────────────────────────────────────────────────
 * The single financial source of truth. Every financial event in RepairOX
 * flows through this service. Each day is a financial session with opening
 * and closing balances, and all transactions are recorded chronologically.
 *
 * Architecture:
 * ┌────────────────┐
 * │  Expenses      │──▶┐
 * │  Ticket Pay    │──▶│  Accounting   ┌───────────────────┐
 * │  Invoice Pay   │──▶│  Event        │  Daily Ledger     │
 * │  Salary        │──▶├─────────────▶│  (per-day session) │
 * │  Advances      │──▶│              └───────────────────┘
 * │  Refunds       │──▶│
 * │  Transfers     │──▶│
 * │  Manual        │──▶┘
 * └────────────────┘
 */

import { useSyncExternalStore } from "react";

/* ─── Types ──────────────────────────────────────────────────────── */

export type TransactionModule =
  | "Expense"
  | "Ticket"
  | "Invoice"
  | "Salary"
  | "Salary Advance"
  | "Refund"
  | "Banking"
  | "Manual";

export type TransactionCategory =
  | "Service Revenue"
  | "Parts Revenue"
  | "Salary Expense"
  | "Rent Expense"
  | "Utilities"
  | "Office Supplies"
  | "Marketing"
  | "Fuel & Travel"
  | "Courier & Shipping"
  | "Miscellaneous"
  | "Transfer"
  | "Adjustment"
  | "Advance"
  | "Refund";

export type PaymentMode = "Cash" | "Bank" | "UPI" | "Card" | "Cheque";

export type TransactionDirection = "inflow" | "outflow";

export type TransactionColorCode = "green" | "red" | "blue" | "orange" | "gray";

export type ManualTransactionType = "Cash In" | "Cash Out" | "Transfer" | "Adjustment";

export type DayStatus = "open" | "closed";

export interface LedgerTransaction {
  id: string;
  /** ISO date string (YYYY-MM-DD) for the day this belongs to */
  date: string;
  /** ISO datetime string for exact time */
  timestamp: string;
  module: TransactionModule;
  referenceId: string;
  description: string;
  category: TransactionCategory;
  paymentMode: PaymentMode;
  /** Whether it hits Cash or Bank */
  cashOrBank: "Cash" | "Bank";
  direction: TransactionDirection;
  amount: number;
  employee: string;
  createdBy: string;
  colorCode: TransactionColorCode;
  /** Linked entity IDs */
  linkedExpenseId?: string;
  linkedInvoiceId?: string;
  linkedTicketId?: string;
  /** Audit trail */
  auditHistory: AuditEntry[];
}

export interface AuditEntry {
  action: string;
  by: string;
  at: string;
  details?: string;
}

export interface DailySession {
  date: string;
  status: DayStatus;
  openingCash: number;
  openingBank: number;
  closedAt?: string;
  closedBy?: string;
  actualClosingCash?: number;
  actualClosingBank?: number;
  notes?: string;
}

export interface DailySummary {
  date: string;
  status: DayStatus;
  openingCash: number;
  openingBank: number;
  totalCashIn: number;
  totalCashOut: number;
  totalBankIn: number;
  totalBankOut: number;
  closingCash: number;
  closingBank: number;
  netPosition: number;
  transactionCount: number;
}

export interface NewTransaction {
  date: string;
  module: TransactionModule;
  referenceId: string;
  description: string;
  category: TransactionCategory;
  paymentMode: PaymentMode;
  cashOrBank: "Cash" | "Bank";
  direction: TransactionDirection;
  amount: number;
  employee: string;
  createdBy: string;
  linkedExpenseId?: string;
  linkedInvoiceId?: string;
  linkedTicketId?: string;
}

/* ─── Color code logic ───────────────────────────────────────────── */

function deriveColorCode(module: TransactionModule, direction: TransactionDirection): TransactionColorCode {
  if (module === "Banking") return "blue";
  if (module === "Manual") return "gray";
  if (module === "Refund") return "orange";
  return direction === "inflow" ? "green" : "red";
}

/* ─── Store (module singleton — same pattern as activity-log) ─────── */

const TX_STORAGE_KEY = "repairox-daily-ledger-transactions";
const SESSION_STORAGE_KEY = "repairox-daily-ledger-sessions";

let transactions: LedgerTransaction[] = [];
let sessions: DailySession[] = [];
let hydrated = false;
const listeners = new Set<() => void>();
let _counter = 0;

function genTxId(): string {
  _counter += 1;
  return `TXN-${Date.now().toString(36).toUpperCase()}-${_counter.toString().padStart(3, "0")}`;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(transactions));
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  } catch { /* storage full */ }
}

function emit() {
  _version += 1;
  for (const l of listeners) l();
}

/* ─── Seed Data ──────────────────────────────────────────────────── */

function seedTransactions(): LedgerTransaction[] {
  return [
    {
      id: "TXN-SEED-001",
      date: "2026-07-28",
      timestamp: "2026-07-28T09:15:00Z",
      module: "Ticket",
      referenceId: "TKT-1842",
      description: "Payment received - iPhone 15 Pro screen repair",
      category: "Service Revenue",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "inflow",
      amount: 12500,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "green",
      linkedTicketId: "TKT-1842",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-28T09:15:00Z" }],
    },
    {
      id: "TXN-SEED-002",
      date: "2026-07-28",
      timestamp: "2026-07-28T10:30:00Z",
      module: "Expense",
      referenceId: "EXP-012",
      description: "Tea & snacks for staff",
      category: "Miscellaneous",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "outflow",
      amount: 250,
      employee: "Radha Iyer",
      createdBy: "Radha Iyer",
      colorCode: "red",
      linkedExpenseId: "EXP-012",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-28T10:30:00Z" }],
    },
    {
      id: "TXN-SEED-003",
      date: "2026-07-28",
      timestamp: "2026-07-28T11:45:00Z",
      module: "Invoice",
      referenceId: "INV-2026-058",
      description: "Invoice payment - Samsung Galaxy S24 battery replacement",
      category: "Service Revenue",
      paymentMode: "UPI",
      cashOrBank: "Bank",
      direction: "inflow",
      amount: 4500,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "green",
      linkedInvoiceId: "INV-2026-058",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-28T11:45:00Z" }],
    },
    {
      id: "TXN-SEED-004",
      date: "2026-07-28",
      timestamp: "2026-07-28T14:00:00Z",
      module: "Salary Advance",
      referenceId: "ADV-005",
      description: "Salary advance disbursed - Pooja Iyer",
      category: "Advance",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "outflow",
      amount: 5000,
      employee: "Pooja Iyer",
      createdBy: "Kalai S.",
      colorCode: "red",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-28T14:00:00Z" }],
    },
    {
      id: "TXN-SEED-005",
      date: "2026-07-28",
      timestamp: "2026-07-28T16:20:00Z",
      module: "Banking",
      referenceId: "TRF-008",
      description: "Transfer to savings account",
      category: "Transfer",
      paymentMode: "Bank",
      cashOrBank: "Bank",
      direction: "outflow",
      amount: 20000,
      employee: "Kalai S.",
      createdBy: "Kalai S.",
      colorCode: "blue",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-28T16:20:00Z" }],
    },
    {
      id: "TXN-SEED-006",
      date: "2026-07-28",
      timestamp: "2026-07-28T17:00:00Z",
      module: "Refund",
      referenceId: "REF-003",
      description: "Refund issued - Customer overcharged on TKT-1840",
      category: "Refund",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "outflow",
      amount: 800,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "orange",
      linkedTicketId: "TKT-1840",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-28T17:00:00Z" }],
    },
    {
      id: "TXN-SEED-007",
      date: "2026-07-28",
      timestamp: "2026-07-28T18:10:00Z",
      module: "Manual",
      referenceId: "MAN-001",
      description: "Petty cash adjustment - counted ₹200 extra",
      category: "Adjustment",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "inflow",
      amount: 200,
      employee: "Radha Iyer",
      createdBy: "Radha Iyer",
      colorCode: "gray",
      auditHistory: [{ action: "Created", by: "Radha Iyer", at: "2026-07-28T18:10:00Z" }],
    },
    // July 27 transactions
    {
      id: "TXN-SEED-008",
      date: "2026-07-27",
      timestamp: "2026-07-27T09:30:00Z",
      module: "Ticket",
      referenceId: "TKT-1839",
      description: "Payment received - MacBook Pro keyboard repair",
      category: "Service Revenue",
      paymentMode: "Card",
      cashOrBank: "Bank",
      direction: "inflow",
      amount: 8500,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "green",
      linkedTicketId: "TKT-1839",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-27T09:30:00Z" }],
    },
    {
      id: "TXN-SEED-009",
      date: "2026-07-27",
      timestamp: "2026-07-27T11:00:00Z",
      module: "Expense",
      referenceId: "EXP-011",
      description: "Courier charges - parts delivery from vendor",
      category: "Courier & Shipping",
      paymentMode: "UPI",
      cashOrBank: "Bank",
      direction: "outflow",
      amount: 1200,
      employee: "Vikas Nair",
      createdBy: "Vikas Nair",
      colorCode: "red",
      linkedExpenseId: "EXP-011",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-27T11:00:00Z" }],
    },
    {
      id: "TXN-SEED-010",
      date: "2026-07-27",
      timestamp: "2026-07-27T13:45:00Z",
      module: "Ticket",
      referenceId: "TKT-1840",
      description: "Payment received - OnePlus 12 back glass replacement",
      category: "Service Revenue",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "inflow",
      amount: 3800,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "green",
      linkedTicketId: "TKT-1840",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-27T13:45:00Z" }],
    },
    {
      id: "TXN-SEED-011",
      date: "2026-07-27",
      timestamp: "2026-07-27T15:30:00Z",
      module: "Expense",
      referenceId: "EXP-010",
      description: "Electricity bill payment - July partial",
      category: "Utilities",
      paymentMode: "Bank",
      cashOrBank: "Bank",
      direction: "outflow",
      amount: 4200,
      employee: "Radha Iyer",
      createdBy: "Radha Iyer",
      colorCode: "red",
      linkedExpenseId: "EXP-010",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-27T15:30:00Z" }],
    },
    {
      id: "TXN-SEED-012",
      date: "2026-07-27",
      timestamp: "2026-07-27T17:00:00Z",
      module: "Invoice",
      referenceId: "INV-2026-057",
      description: "Invoice payment - bulk repair order (3 devices)",
      category: "Service Revenue",
      paymentMode: "Bank",
      cashOrBank: "Bank",
      direction: "inflow",
      amount: 15000,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "green",
      linkedInvoiceId: "INV-2026-057",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-27T17:00:00Z" }],
    },
    // July 26 transactions
    {
      id: "TXN-SEED-013",
      date: "2026-07-26",
      timestamp: "2026-07-26T10:00:00Z",
      module: "Salary",
      referenceId: "PAY-JUL-ADV",
      description: "Mid-month salary advance - Anand Rao",
      category: "Salary Expense",
      paymentMode: "Bank",
      cashOrBank: "Bank",
      direction: "outflow",
      amount: 15000,
      employee: "Anand Rao",
      createdBy: "System",
      colorCode: "red",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-26T10:00:00Z" }],
    },
    {
      id: "TXN-SEED-014",
      date: "2026-07-26",
      timestamp: "2026-07-26T12:30:00Z",
      module: "Ticket",
      referenceId: "TKT-1838",
      description: "Payment received - iPad Air charging port",
      category: "Service Revenue",
      paymentMode: "UPI",
      cashOrBank: "Bank",
      direction: "inflow",
      amount: 6500,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "green",
      linkedTicketId: "TKT-1838",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-26T12:30:00Z" }],
    },
    {
      id: "TXN-SEED-015",
      date: "2026-07-26",
      timestamp: "2026-07-26T14:15:00Z",
      module: "Expense",
      referenceId: "EXP-009",
      description: "Fuel for delivery - field service",
      category: "Fuel & Travel",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "outflow",
      amount: 1500,
      employee: "Manoj S.",
      createdBy: "Manoj S.",
      colorCode: "red",
      linkedExpenseId: "EXP-009",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-26T14:15:00Z" }],
    },
    // July 29 (today) transactions
    {
      id: "TXN-SEED-016",
      date: "2026-07-29",
      timestamp: "2026-07-29T09:00:00Z",
      module: "Ticket",
      referenceId: "TKT-1843",
      description: "Payment received - Google Pixel 8 screen replacement",
      category: "Service Revenue",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "inflow",
      amount: 9800,
      employee: "Anjali R.",
      createdBy: "Anjali R.",
      colorCode: "green",
      linkedTicketId: "TKT-1843",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-29T09:00:00Z" }],
    },
    {
      id: "TXN-SEED-017",
      date: "2026-07-29",
      timestamp: "2026-07-29T10:30:00Z",
      module: "Expense",
      referenceId: "EXP-013",
      description: "Printer paper & toner cartridge",
      category: "Office Supplies",
      paymentMode: "Cash",
      cashOrBank: "Cash",
      direction: "outflow",
      amount: 1800,
      employee: "Radha Iyer",
      createdBy: "Radha Iyer",
      colorCode: "red",
      linkedExpenseId: "EXP-013",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-29T10:30:00Z" }],
    },
    {
      id: "TXN-SEED-018",
      date: "2026-07-29",
      timestamp: "2026-07-29T12:15:00Z",
      module: "Invoice",
      referenceId: "INV-2026-059",
      description: "Invoice payment - Corporate bulk order (5 laptops)",
      category: "Service Revenue",
      paymentMode: "Bank",
      cashOrBank: "Bank",
      direction: "inflow",
      amount: 45000,
      employee: "Ritesh Kumar",
      createdBy: "Ritesh Kumar",
      colorCode: "green",
      linkedInvoiceId: "INV-2026-059",
      auditHistory: [{ action: "Created", by: "System", at: "2026-07-29T12:15:00Z" }],
    },
  ];
}

function seedSessions(): DailySession[] {
  return [
    { date: "2026-07-26", status: "closed", openingCash: 25000, openingBank: 150000, closedAt: "2026-07-26T19:00:00Z", closedBy: "Kalai S.", actualClosingCash: 30000, actualClosingBank: 141500 },
    { date: "2026-07-27", status: "closed", openingCash: 30000, openingBank: 141500, closedAt: "2026-07-27T19:30:00Z", closedBy: "Kalai S.", actualClosingCash: 33800, actualClosingBank: 151100 },
    { date: "2026-07-28", status: "closed", openingCash: 33800, openingBank: 151100, closedAt: "2026-07-28T19:15:00Z", closedBy: "Kalai S.", actualClosingCash: 40450, actualClosingBank: 135600 },
    { date: "2026-07-29", status: "open", openingCash: 40450, openingBank: 135600 },
  ];
}

/* ─── Hydration ──────────────────────────────────────────────────── */

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const txRaw = localStorage.getItem(TX_STORAGE_KEY);
    const sessRaw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (txRaw) {
      const parsed = JSON.parse(txRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        transactions = parsed;
        sessions = sessRaw ? JSON.parse(sessRaw) : seedSessions();
        _version += 1;
        return;
      }
    }
  } catch { /* ignore */ }
  transactions = seedTransactions();
  sessions = seedSessions();
  _version += 1;
  persist();
}

/* ─── Public API (imperative, module-level) ──────────────────────── */

/** Record a new transaction from any module */
export function recordTransaction(input: NewTransaction): LedgerTransaction {
  ensureHydrated();
  const tx: LedgerTransaction = {
    ...input,
    id: genTxId(),
    timestamp: new Date().toISOString(),
    colorCode: deriveColorCode(input.module, input.direction),
    auditHistory: [{ action: "Created", by: input.createdBy, at: new Date().toISOString() }],
  };
  transactions = [tx, ...transactions];

  // Ensure a session exists for this date
  if (!sessions.find((s) => s.date === input.date)) {
    const prevSession = getLatestClosedSession();
    sessions = [...sessions, {
      date: input.date,
      status: "open",
      openingCash: prevSession?.actualClosingCash ?? prevSession?.openingCash ?? 0,
      openingBank: prevSession?.actualClosingBank ?? prevSession?.openingBank ?? 0,
    }];
  }

  persist();
  emit();
  return tx;
}

function getLatestClosedSession(): DailySession | undefined {
  return [...sessions]
    .filter((s) => s.status === "closed")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Close a day — lock all transactions */
export function closeDay(date: string, actualClosingCash: number, actualClosingBank: number, closedBy: string, notes?: string) {
  ensureHydrated();
  sessions = sessions.map((s) =>
    s.date === date
      ? { ...s, status: "closed" as const, closedAt: new Date().toISOString(), closedBy, actualClosingCash, actualClosingBank, notes }
      : s
  );
  persist();
  emit();
}

/** Reopen a day (admin only) */
export function reopenDay(date: string, reopenedBy: string) {
  ensureHydrated();
  sessions = sessions.map((s) =>
    s.date === date
      ? { ...s, status: "open" as const, closedAt: undefined, closedBy: undefined, actualClosingCash: undefined, actualClosingBank: undefined, notes: `Reopened by ${reopenedBy} at ${new Date().toISOString()}` }
      : s
  );
  persist();
  emit();
}

/** Get all transactions for a specific date */
export function getTransactionsForDate(date: string): LedgerTransaction[] {
  ensureHydrated();
  return transactions
    .filter((t) => t.date === date)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Get session for a specific date */
export function getSession(date: string): DailySession | undefined {
  ensureHydrated();
  return sessions.find((s) => s.date === date);
}

/** Compute daily summary for a date */
export function getDailySummary(date: string): DailySummary | null {
  ensureHydrated();
  const session = sessions.find((s) => s.date === date);
  if (!session) return null;

  const dayTx = transactions.filter((t) => t.date === date);
  const totalCashIn = dayTx.filter((t) => t.cashOrBank === "Cash" && t.direction === "inflow").reduce((s, t) => s + t.amount, 0);
  const totalCashOut = dayTx.filter((t) => t.cashOrBank === "Cash" && t.direction === "outflow").reduce((s, t) => s + t.amount, 0);
  const totalBankIn = dayTx.filter((t) => t.cashOrBank === "Bank" && t.direction === "inflow").reduce((s, t) => s + t.amount, 0);
  const totalBankOut = dayTx.filter((t) => t.cashOrBank === "Bank" && t.direction === "outflow").reduce((s, t) => s + t.amount, 0);

  const closingCash = session.openingCash + totalCashIn - totalCashOut;
  const closingBank = session.openingBank + totalBankIn - totalBankOut;
  const netPosition = closingCash + closingBank;

  return {
    date,
    status: session.status,
    openingCash: session.openingCash,
    openingBank: session.openingBank,
    totalCashIn,
    totalCashOut,
    totalBankIn,
    totalBankOut,
    closingCash,
    closingBank,
    netPosition,
    transactionCount: dayTx.length,
  };
}

/** Get all daily summaries sorted descending */
export function getAllDailySummaries(): DailySummary[] {
  ensureHydrated();
  return sessions
    .map((s) => getDailySummary(s.date))
    .filter((s): s is DailySummary => s !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Get a single transaction by ID */
export function getTransactionById(id: string): LedgerTransaction | undefined {
  ensureHydrated();
  return transactions.find((t) => t.id === id);
}

/** Find the transaction linked to a given expense (by the expense's internal id). */
export function getTransactionByExpenseId(expenseId: string): LedgerTransaction | undefined {
  ensureHydrated();
  return transactions.find((t) => t.linkedExpenseId === expenseId);
}

/** Update an existing transaction — used when its source record (e.g. an
 *  expense) is edited. Recomputes the colour code and appends an audit entry. */
export function updateTransaction(
  id: string,
  patch: Partial<Omit<LedgerTransaction, "id" | "auditHistory">>,
  by = "System"
): LedgerTransaction | null {
  ensureHydrated();
  if (!transactions.some((t) => t.id === id)) return null;
  transactions = transactions.map((t) => {
    if (t.id !== id) return t;
    const merged: LedgerTransaction = { ...t, ...patch };
    merged.colorCode = deriveColorCode(merged.module, merged.direction);
    merged.auditHistory = [...t.auditHistory, { action: "Updated", by, at: new Date().toISOString() }];
    return merged;
  });
  persist();
  emit();
  return transactions.find((t) => t.id === id) ?? null;
}

/** Remove a transaction — used when its source record (e.g. an expense) is
 *  cancelled, so the day's cash/bank position stays correct. */
export function removeTransaction(id: string): boolean {
  ensureHydrated();
  const before = transactions.length;
  transactions = transactions.filter((t) => t.id !== id);
  if (transactions.length === before) return false;
  persist();
  emit();
  return true;
}

/* ─── React Hook (useSyncExternalStore) ──────────────────────────── */

/** Stable snapshot reference — only replaced when data changes (via emit) */
let _snapshot: { transactions: LedgerTransaction[]; sessions: DailySession[] } = { transactions: [], sessions: [] };
let _snapshotVersion = -1;
let _version = 0;

function subscribe(listener: () => void) {
  ensureHydrated();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): { transactions: LedgerTransaction[]; sessions: DailySession[] } {
  ensureHydrated();
  if (_snapshotVersion !== _version) {
    _snapshot = { transactions, sessions };
    _snapshotVersion = _version;
  }
  return _snapshot;
}

function getServerSnapshot(): { transactions: LedgerTransaction[]; sessions: DailySession[] } {
  return { transactions: [], sessions: [] };
}

/** React hook — subscribe to the daily ledger store */
export function useDailyLedger() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    transactions: store.transactions,
    sessions: store.sessions,
    getAllDailySummaries,
    getDailySummary,
    getTransactionsForDate,
    getTransactionById,
    getTransactionByExpenseId,
    getSession,
    recordTransaction,
    updateTransaction,
    removeTransaction,
    closeDay,
    reopenDay,
  };
}

/* ─── Color code helpers for UI ──────────────────────────────────── */

export const COLOR_CODE_STYLES: Record<TransactionColorCode, { bg: string; text: string; label: string }> = {
  green: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Income" },
  red: { bg: "bg-rose-50", text: "text-rose-700", label: "Expense" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", label: "Transfer" },
  orange: { bg: "bg-orange-50", text: "text-orange-700", label: "Adjustment" },
  gray: { bg: "bg-zinc-100", text: "text-zinc-700", label: "Manual" },
};

export const MODULE_ICONS: Record<TransactionModule, string> = {
  Expense: "Receipt",
  Ticket: "Ticket",
  Invoice: "FileText",
  Salary: "Banknote",
  "Salary Advance": "WalletCards",
  Refund: "ArrowDownLeft",
  Banking: "Landmark",
  Manual: "Pencil",
};
