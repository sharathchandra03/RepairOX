"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Centralized Accounting Service
   ──────────────────────────────────────────────────────────────────────────
   Single source of truth for all financial transactions. Every module that
   produces a financial event (Expenses, Salary, Advance Salary, Ticket
   Payments, Invoice Payments, Bank Transfers, Refunds) posts through this
   service — the Ledger page reads from it.

   Architecture:
   ┌────────────┐   ┌────────────┐   ┌──────────────────┐
   │  Expenses  │──▶│            │   │                  │
   ├────────────┤   │  Accounting│──▶│  Ledger (read)   │
   │  Payroll   │──▶│  Service   │   │                  │
   ├────────────┤   │            │   └──────────────────┘
   │  Advances  │──▶│  addEntry()│
   ├────────────┤   │            │
   │  Payments  │──▶│            │  ← Future integrations
   └────────────┘   └────────────┘
   ────────────────────────────────────────────────────────────────────────── */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

/* ── Types ───────────────────────────────────────────────────────────── */

export type LedgerEntryType =
  | "expense"
  | "salary"
  | "advance_salary"
  | "ticket_payment"
  | "invoice_payment"
  | "bank_transfer"
  | "refund"
  | "manual";

export type LedgerEntryStatus = "posted" | "pending" | "reversed";

export interface LedgerEntry {
  id: string;
  date: string;
  type: LedgerEntryType;
  account: string;
  description: string;
  debit: number;
  credit: number;
  reference: string;
  createdBy: string;
  status: LedgerEntryStatus;
  createdAt: string;
}

export interface NewLedgerEntry {
  date: string;
  type: LedgerEntryType;
  account: string;
  description: string;
  debit: number;
  credit: number;
  reference: string;
  createdBy: string;
  status?: LedgerEntryStatus;
}

/* ── Context shape ───────────────────────────────────────────────────── */

interface AccountingContextValue {
  entries: LedgerEntry[];
  addEntry: (entry: NewLedgerEntry) => LedgerEntry;
  addEntries: (entries: NewLedgerEntry[]) => LedgerEntry[];
  getEntriesByType: (type: LedgerEntryType) => LedgerEntry[];
  getEntriesByReference: (reference: string) => LedgerEntry[];
  reverseEntry: (id: string) => void;
  totalDebit: number;
  totalCredit: number;
}

const AccountingContext = createContext<AccountingContextValue | null>(null);

/* ── Persistence ─────────────────────────────────────────────────────── */

const STORAGE_KEY = "repairox-ledger";

function generateId(): string {
  return `LED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function loadLedger(): LedgerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LedgerEntry[];
  } catch {
    return [];
  }
}

function saveLedger(entries: LedgerEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or unavailable
  }
}

/* ── Seed ledger entries (initial demo data) ─────────────────────────── */

const SEED_LEDGER: LedgerEntry[] = [
  {
    id: "LED-SEED-001",
    date: "2026-07-01",
    type: "salary",
    account: "Salary Expense",
    description: "Salary payment - Kalai S. (2026-07)",
    debit: 74400,
    credit: 0,
    reference: "PAY-001",
    createdBy: "System",
    status: "posted",
    createdAt: "2026-07-01T10:00:00Z",
  },
  {
    id: "LED-SEED-002",
    date: "2026-07-01",
    type: "salary",
    account: "Salary Expense",
    description: "Salary payment - Ritesh Kumar (2026-07)",
    debit: 51150,
    credit: 0,
    reference: "PAY-002",
    createdBy: "System",
    status: "posted",
    createdAt: "2026-07-01T10:01:00Z",
  },
  {
    id: "LED-SEED-003",
    date: "2026-07-01",
    type: "salary",
    account: "Salary Expense",
    description: "Salary payment - Anjali R. (2026-07)",
    debit: 26040,
    credit: 0,
    reference: "PAY-003",
    createdBy: "System",
    status: "posted",
    createdAt: "2026-07-01T10:02:00Z",
  },
  {
    id: "LED-SEED-004",
    date: "2026-07-01",
    type: "salary",
    account: "Salary Expense",
    description: "Salary payment - Anand Rao (2026-07)",
    debit: 39060,
    credit: 0,
    reference: "PAY-004",
    createdBy: "System",
    status: "posted",
    createdAt: "2026-07-01T10:03:00Z",
  },
  {
    id: "LED-SEED-005",
    date: "2026-07-06",
    type: "advance_salary",
    account: "Salary Advance",
    description: "Salary advance disbursed - Anand Rao",
    debit: 15000,
    credit: 0,
    reference: "ADV-001",
    createdBy: "System",
    status: "posted",
    createdAt: "2026-07-06T11:00:00Z",
  },
  {
    id: "LED-SEED-006",
    date: "2026-07-11",
    type: "advance_salary",
    account: "Salary Advance",
    description: "Salary advance disbursed - Pooja Iyer",
    debit: 10000,
    credit: 0,
    reference: "ADV-002",
    createdBy: "System",
    status: "posted",
    createdAt: "2026-07-11T09:30:00Z",
  },
  {
    id: "LED-SEED-007",
    date: "2026-07-05",
    type: "expense",
    account: "Office Supplies",
    description: "Stationery and printer cartridges",
    debit: 2500,
    credit: 0,
    reference: "EXP-001",
    createdBy: "Radha Iyer",
    status: "posted",
    createdAt: "2026-07-05T14:20:00Z",
  },
  {
    id: "LED-SEED-008",
    date: "2026-07-10",
    type: "expense",
    account: "Fuel & Travel",
    description: "Fuel for delivery bike",
    debit: 1800,
    credit: 0,
    reference: "EXP-002",
    createdBy: "Manoj S.",
    status: "posted",
    createdAt: "2026-07-10T16:45:00Z",
  },
  {
    id: "LED-SEED-009",
    date: "2026-07-12",
    type: "expense",
    account: "Rent Expense",
    description: "Monthly rent - BTM Layout (HQ)",
    debit: 45000,
    credit: 0,
    reference: "EXP-003",
    createdBy: "Kalai S.",
    status: "posted",
    createdAt: "2026-07-12T09:00:00Z",
  },
  {
    id: "LED-SEED-010",
    date: "2026-07-15",
    type: "expense",
    account: "Courier & Shipping",
    description: "Courier charges for parts delivery",
    debit: 3200,
    credit: 0,
    reference: "EXP-004",
    createdBy: "Vikas Nair",
    status: "posted",
    createdAt: "2026-07-15T11:30:00Z",
  },
  {
    id: "LED-SEED-011",
    date: "2026-07-18",
    type: "expense",
    account: "Utilities",
    description: "Electricity bill - July",
    debit: 8500,
    credit: 0,
    reference: "EXP-005",
    createdBy: "Radha Iyer",
    status: "posted",
    createdAt: "2026-07-18T10:15:00Z",
  },
  {
    id: "LED-SEED-012",
    date: "2026-07-03",
    type: "ticket_payment",
    account: "Service Revenue",
    description: "Payment received - Ticket #1837 (iPhone 16 Pro Max screen)",
    debit: 0,
    credit: 18500,
    reference: "TKT-1837",
    createdBy: "Anjali R.",
    status: "posted",
    createdAt: "2026-07-03T15:20:00Z",
  },
  {
    id: "LED-SEED-013",
    date: "2026-07-08",
    type: "invoice_payment",
    account: "Service Revenue",
    description: "Invoice payment - INV-2026-042",
    debit: 0,
    credit: 12000,
    reference: "INV-2026-042",
    createdBy: "Anjali R.",
    status: "posted",
    createdAt: "2026-07-08T12:00:00Z",
  },
  {
    id: "LED-SEED-014",
    date: "2026-07-20",
    type: "bank_transfer",
    account: "Bank",
    description: "Transfer from Savings to Main Business Account",
    debit: 0,
    credit: 100000,
    reference: "TRF-004",
    createdBy: "Kalai S.",
    status: "posted",
    createdAt: "2026-07-20T08:00:00Z",
  },
  {
    id: "LED-SEED-015",
    date: "2026-07-22",
    type: "expense",
    account: "Marketing",
    description: "Google Ads - July campaign",
    debit: 15000,
    credit: 0,
    reference: "EXP-006",
    createdBy: "Kalai S.",
    status: "posted",
    createdAt: "2026-07-22T13:00:00Z",
  },
  {
    id: "LED-SEED-016",
    date: "2026-07-01",
    type: "salary",
    account: "Salary Expense",
    description: "Salary payment - Radha Iyer (2026-07)",
    debit: 24180,
    credit: 0,
    reference: "PAY-008",
    createdBy: "System",
    status: "posted",
    createdAt: "2026-07-01T10:07:00Z",
  },
];

/* ── Provider ────────────────────────────────────────────────────────── */

export function AccountingProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LedgerEntry[]>(() => {
    const saved = loadLedger();
    return saved.length > 0 ? saved : SEED_LEDGER;
  });

  // Persist on change
  useEffect(() => {
    saveLedger(entries);
  }, [entries]);

  const addEntry = useCallback((newEntry: NewLedgerEntry): LedgerEntry => {
    const entry: LedgerEntry = {
      ...newEntry,
      id: generateId(),
      status: newEntry.status ?? "posted",
      createdAt: new Date().toISOString(),
    };
    setEntries((prev) => [...prev, entry]);
    return entry;
  }, []);

  const addEntries = useCallback((newEntries: NewLedgerEntry[]): LedgerEntry[] => {
    const created: LedgerEntry[] = newEntries.map((ne) => ({
      ...ne,
      id: generateId(),
      status: ne.status ?? "posted",
      createdAt: new Date().toISOString(),
    }));
    setEntries((prev) => [...prev, ...created]);
    return created;
  }, []);

  const getEntriesByType = useCallback((type: LedgerEntryType): LedgerEntry[] => {
    return entries.filter((e) => e.type === type);
  }, [entries]);

  const getEntriesByReference = useCallback((reference: string): LedgerEntry[] => {
    return entries.filter((e) => e.reference === reference);
  }, [entries]);

  const reverseEntry = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "reversed" as const } : e))
    );
  }, []);

  const totalDebit = entries.filter((e) => e.status === "posted").reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.filter((e) => e.status === "posted").reduce((s, e) => s + e.credit, 0);

  return (
    <AccountingContext.Provider value={{
      entries,
      addEntry,
      addEntries,
      getEntriesByType,
      getEntriesByReference,
      reverseEntry,
      totalDebit,
      totalCredit,
    }}>
      {children}
    </AccountingContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────────────────────── */

export function useLedger(): AccountingContextValue {
  const ctx = useContext(AccountingContext);
  if (!ctx) {
    throw new Error("useLedger must be used within an AccountingProvider");
  }
  return ctx;
}
