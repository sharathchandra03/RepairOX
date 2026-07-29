"use client";

/**
 * RepairOX — Expense Management Store
 *
 * Handles all expense CRUD, expense categories master list, ID generation,
 * and persistence. The store NEVER touches accounting logic directly — it
 * exposes hooks and functions that the UI layer uses to coordinate with the
 * separate Accounting Service via event emission.
 */

import { useSyncExternalStore } from "react";

/* ─── Types ──────────────────────────────────────────────────────── */

export type PaymentMode = "cash" | "upi" | "bank_transfer" | "card" | "cheque" | "wallet" | "other";

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  card: "Card",
  cheque: "Cheque",
  wallet: "Wallet",
  other: "Other",
};

export const PAYMENT_MODE_OPTIONS: { label: string; value: string }[] = Object.entries(PAYMENT_MODE_LABELS).map(
  ([value, label]) => ({ value, label })
);

export type ExpenseStatus = "active" | "cancelled";

export interface ExpenseCategory {
  id: string;
  label: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  /** Unique formatted ID like EXP-20260729-001 */
  expenseId: string;
  category: string;
  amount: number;
  paymentMode: PaymentMode;
  description: string;
  vendor: string;
  employee: string;
  attachment: string | null;
  date: string;
  time: string;
  internalNotes: string;
  status: ExpenseStatus;
  /** Reason captured on soft-delete */
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  /** Ledger entry ID linked after accounting event */
  ledgerEntryId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NewExpense = Omit<Expense, "id" | "expenseId" | "status" | "createdAt" | "updatedAt" | "ledgerEntryId" | "cancellationReason" | "cancelledAt" | "cancelledBy">;

/* ─── Constants ──────────────────────────────────────────────────── */

const EXPENSES_KEY = "repairox-expenses";
const CATEGORIES_KEY = "repairox-expense-categories";

/* ─── Default Categories ─────────────────────────────────────────── */

const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  { id: "cat-rent", label: "Rent", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-salary", label: "Salary & Wages", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-utilities", label: "Utilities", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-courier", label: "Courier & Shipping", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-fuel", label: "Fuel & Travel", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-office-supplies", label: "Office Supplies", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-marketing", label: "Marketing & Ads", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-repairs", label: "Repairs & Maintenance", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-food", label: "Food & Refreshments", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-subscriptions", label: "Subscriptions & Software", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cat-misc", label: "Miscellaneous", createdAt: "2026-01-01T00:00:00Z" },
];

/* ─── Expense ID Generation ──────────────────────────────────────── */

function formatExpenseId(date: string, sequence: number): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `EXP-${y}${m}${day}-${String(sequence).padStart(3, "0")}`;
}

function getNextSequence(expenses: Expense[], date: string): number {
  const d = new Date(date);
  const prefix = `EXP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-`;
  const existing = expenses
    .filter((e) => e.expenseId.startsWith(prefix))
    .map((e) => parseInt(e.expenseId.slice(-3), 10))
    .filter((n) => !isNaN(n));
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

/* ─── Persistence ────────────────────────────────────────────────── */

function loadExpenses(): Expense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXPENSES_KEY);
    return raw ? JSON.parse(raw) : SEED_EXPENSES;
  } catch { return []; }
}

function saveExpenses(data: Expense[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(EXPENSES_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

function loadCategories(): ExpenseCategory[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CATEGORIES;
  } catch { return DEFAULT_CATEGORIES; }
}

function saveCategories(data: ExpenseCategory[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

/* ─── Seed Data ──────────────────────────────────────────────────── */

const SEED_EXPENSES: Expense[] = [
  {
    id: "exp-seed-001", expenseId: "EXP-20260705-001", category: "Office Supplies",
    amount: 2500, paymentMode: "upi", description: "Stationery and printer cartridges",
    vendor: "Priya Stationery Store", employee: "Radha Iyer", attachment: null,
    date: "2026-07-05", time: "14:20", internalNotes: "Monthly stationery restock",
    status: "active", ledgerEntryId: "LED-SEED-007", createdBy: "Radha Iyer",
    createdAt: "2026-07-05T14:20:00Z", updatedAt: "2026-07-05T14:20:00Z",
  },
  {
    id: "exp-seed-002", expenseId: "EXP-20260710-001", category: "Fuel & Travel",
    amount: 1800, paymentMode: "cash", description: "Fuel for delivery bike",
    vendor: "HP Petrol Pump", employee: "Manoj S.", attachment: null,
    date: "2026-07-10", time: "16:45", internalNotes: "",
    status: "active", ledgerEntryId: "LED-SEED-008", createdBy: "Manoj S.",
    createdAt: "2026-07-10T16:45:00Z", updatedAt: "2026-07-10T16:45:00Z",
  },
  {
    id: "exp-seed-003", expenseId: "EXP-20260712-001", category: "Rent",
    amount: 45000, paymentMode: "bank_transfer", description: "Monthly rent - BTM Layout (HQ)",
    vendor: "Landlord - Suresh Gowda", employee: "Kalai S.", attachment: null,
    date: "2026-07-12", time: "09:00", internalNotes: "Rent for July 2026",
    status: "active", ledgerEntryId: "LED-SEED-009", createdBy: "Kalai S.",
    createdAt: "2026-07-12T09:00:00Z", updatedAt: "2026-07-12T09:00:00Z",
  },
  {
    id: "exp-seed-004", expenseId: "EXP-20260715-001", category: "Courier & Shipping",
    amount: 3200, paymentMode: "upi", description: "Courier charges for parts delivery",
    vendor: "DTDC Express", employee: "Vikas Nair", attachment: null,
    date: "2026-07-15", time: "11:30", internalNotes: "Shipment of 3 packages to Bangalore East hub",
    status: "active", ledgerEntryId: "LED-SEED-010", createdBy: "Vikas Nair",
    createdAt: "2026-07-15T11:30:00Z", updatedAt: "2026-07-15T11:30:00Z",
  },
  {
    id: "exp-seed-005", expenseId: "EXP-20260718-001", category: "Utilities",
    amount: 8500, paymentMode: "bank_transfer", description: "Electricity bill - July",
    vendor: "BESCOM", employee: "Radha Iyer", attachment: null,
    date: "2026-07-18", time: "10:15", internalNotes: "Bill period: 15 Jun - 15 Jul",
    status: "active", ledgerEntryId: "LED-SEED-011", createdBy: "Radha Iyer",
    createdAt: "2026-07-18T10:15:00Z", updatedAt: "2026-07-18T10:15:00Z",
  },
  {
    id: "exp-seed-006", expenseId: "EXP-20260722-001", category: "Marketing & Ads",
    amount: 15000, paymentMode: "card", description: "Google Ads - July campaign",
    vendor: "Google", employee: "Kalai S.", attachment: null,
    date: "2026-07-22", time: "13:00", internalNotes: "Performance Max campaign for mobile repair services",
    status: "active", ledgerEntryId: "LED-SEED-015", createdBy: "Kalai S.",
    createdAt: "2026-07-22T13:00:00Z", updatedAt: "2026-07-22T13:00:00Z",
  },
  {
    id: "exp-seed-007", expenseId: "EXP-20260725-001", category: "Food & Refreshments",
    amount: 1200, paymentMode: "cash", description: "Team lunch - Friday",
    vendor: "Meghana Foods", employee: "Anjali R.", attachment: null,
    date: "2026-07-25", time: "13:30", internalNotes: "",
    status: "active", createdBy: "Anjali R.",
    createdAt: "2026-07-25T13:30:00Z", updatedAt: "2026-07-25T13:30:00Z",
  },
  {
    id: "exp-seed-008", expenseId: "EXP-20260728-001", category: "Repairs & Maintenance",
    amount: 4500, paymentMode: "upi", description: "AC servicing - shop floor",
    vendor: "CoolCare Services", employee: "Ritesh Kumar", attachment: null,
    date: "2026-07-28", time: "10:00", internalNotes: "Annual maintenance contract",
    status: "active", createdBy: "Ritesh Kumar",
    createdAt: "2026-07-28T10:00:00Z", updatedAt: "2026-07-28T10:00:00Z",
  },
];

/* ─── Store (module singleton) ───────────────────────────────────── */

let expenses: Expense[] = [];
let categories: ExpenseCategory[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  expenses = loadExpenses();
  categories = loadCategories();
}

/* ─── Expense Operations ─────────────────────────────────────────── */

export function getExpenses(): Expense[] {
  ensureHydrated();
  return expenses;
}

export function getExpenseById(id: string): Expense | undefined {
  ensureHydrated();
  return expenses.find((e) => e.id === id);
}

export function addExpense(input: NewExpense): Expense {
  ensureHydrated();
  const seq = getNextSequence(expenses, input.date);
  const expense: Expense = {
    ...input,
    id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    expenseId: formatExpenseId(input.date, seq),
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  expenses = [expense, ...expenses];
  saveExpenses(expenses);
  emit();
  return expense;
}

export function updateExpense(id: string, updates: Partial<NewExpense>): Expense | null {
  ensureHydrated();
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  expenses = expenses.map((e) =>
    e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
  );
  saveExpenses(expenses);
  emit();
  return expenses.find((e) => e.id === id) ?? null;
}

export function cancelExpense(id: string, reason: string, cancelledBy: string): Expense | null {
  ensureHydrated();
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  expenses = expenses.map((e) =>
    e.id === id
      ? { ...e, status: "cancelled" as const, cancellationReason: reason, cancelledAt: new Date().toISOString(), cancelledBy, updatedAt: new Date().toISOString() }
      : e
  );
  saveExpenses(expenses);
  emit();
  return expenses.find((e) => e.id === id) ?? null;
}

/** Link ledger entry ID back to the expense after accounting posts it */
export function linkLedgerEntry(expenseId: string, ledgerEntryId: string) {
  ensureHydrated();
  expenses = expenses.map((e) =>
    e.id === expenseId ? { ...e, ledgerEntryId } : e
  );
  saveExpenses(expenses);
  emit();
}

/* ─── Category Operations ────────────────────────────────────────── */

export function getCategories(): ExpenseCategory[] {
  ensureHydrated();
  return categories;
}

export function addCategory(label: string): ExpenseCategory {
  ensureHydrated();
  const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const cat: ExpenseCategory = { id, label: label.trim(), createdAt: new Date().toISOString() };
  categories = [...categories, cat];
  saveCategories(categories);
  emit();
  return cat;
}

export function removeCategory(id: string) {
  ensureHydrated();
  categories = categories.filter((c) => c.id !== id);
  saveCategories(categories);
  emit();
}

export function resetCategories() {
  categories = [...DEFAULT_CATEGORIES];
  saveCategories(categories);
  emit();
}

/* ─── React Hooks ────────────────────────────────────────────────── */

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useExpenses(): Expense[] {
  return useSyncExternalStore(subscribe, getExpenses, () => []);
}

export function useExpenseCategories(): ExpenseCategory[] {
  return useSyncExternalStore(subscribe, getCategories, () => DEFAULT_CATEGORIES);
}
