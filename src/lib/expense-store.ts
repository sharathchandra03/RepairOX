"use client";

/**
 * RepairOX — Expense Management Store (Supabase-first).
 *
 * When Supabase is configured, expenses and categories are loaded from DB on
 * hydration, mutations write to DB first, and realtime keeps state in sync.
 * Falls back to localStorage when Supabase is not configured.
 */

import { useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

/* ─── Types ──────────────────────────────────────────────────────── */

export type PaymentMode = "cash" | "upi" | "bank_transfer" | "card" | "cheque" | "wallet" | "other";

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer",
  card: "Card", cheque: "Cheque", wallet: "Wallet", other: "Other",
};

export const PAYMENT_MODE_OPTIONS: { label: string; value: string }[] =
  Object.entries(PAYMENT_MODE_LABELS).map(([value, label]) => ({ value, label }));

export type ExpenseStatus = "active" | "cancelled";

export interface ExpenseCategory {
  id: string;
  label: string;
  createdAt: string;
}

export interface Expense {
  id: string;
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
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  ledgerEntryId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NewExpense = Omit<Expense, "id" | "expenseId" | "status" | "createdAt" | "updatedAt" | "ledgerEntryId" | "cancellationReason" | "cancelledAt" | "cancelledBy">;

/* ─── Row <-> App Model ──────────────────────────────────────────── */

function rowToExpense(r: any): Expense {
  return {
    id: r.id,
    expenseId: r.expense_id ?? r.id,
    category: r.category ?? "",
    amount: Number(r.amount ?? 0),
    paymentMode: r.payment_mode ?? "cash",
    description: r.description ?? "",
    vendor: r.vendor ?? "",
    employee: r.employee ?? "",
    attachment: r.attachment ?? null,
    date: r.expense_date ?? "",
    time: r.time_label ?? "",
    internalNotes: r.internal_notes ?? "",
    status: r.status ?? "active",
    cancellationReason: r.cancellation_reason ?? undefined,
    cancelledAt: r.cancelled_at ?? undefined,
    cancelledBy: r.cancelled_by ?? undefined,
    ledgerEntryId: r.ledger_entry_id ?? undefined,
    createdBy: r.created_by ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

function expenseToRow(e: Expense | NewExpense & { id: string; expenseId: string; status: string }): Record<string, unknown> {
  return {
    id: (e as any).id,
    expense_id: (e as any).expenseId ?? null,
    category: e.category || null,
    amount: e.amount,
    payment_mode: e.paymentMode || null,
    description: e.description || null,
    vendor: e.vendor || null,
    employee: e.employee || null,
    attachment: e.attachment || null,
    expense_date: e.date || null,
    time_label: e.time || null,
    internal_notes: e.internalNotes || null,
    status: (e as any).status ?? "active",
  };
}

function rowToCategory(r: any): ExpenseCategory {
  return { id: r.id, label: r.label ?? "", createdAt: r.created_at ?? new Date().toISOString() };
}

/* ─── Constants ──────────────────────────────────────────────────── */

const EXPENSES_KEY = "repairox-expenses";
const CATEGORIES_KEY = "repairox-expense-categories";

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

/* ─── Local Persistence (fallback) ───────────────────────────────── */

function loadExpensesLocal(): Expense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXPENSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveExpensesLocal(data: Expense[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(EXPENSES_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

function loadCategoriesLocal(): ExpenseCategory[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CATEGORIES;
  } catch { return DEFAULT_CATEGORIES; }
}

function saveCategoriesLocal(data: ExpenseCategory[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

/* ─── Store (module singleton) ───────────────────────────────────── */

let expenses: Expense[] = [];
let categories: ExpenseCategory[] = [];
let hydrated = false;
let mode: "db" | "local" = isSupabaseConfigured ? "db" : "local";
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

async function hydrateFromDb() {
  if (!supabase) return;
  const [{ data: expRows }, { data: catRows }] = await Promise.all([
    supabase.from("expenses").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("expense_categories").select("*").order("created_at", { ascending: true }),
  ]);
  expenses = (expRows ?? []).map(rowToExpense);
  categories = (catRows && catRows.length > 0) ? catRows.map(rowToCategory) : DEFAULT_CATEGORIES;
  emit();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  if (isSupabaseConfigured && supabase) {
    mode = "db";
    hydrateFromDb();
    // Realtime subscription for expenses.
    const channel = supabase.channel("expenses-realtime")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "expenses" }, (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row) return;
        const isDelete = payload.eventType === "DELETE" || row.deleted_at != null;
        if (isDelete) { expenses = expenses.filter((e) => e.id !== row.id); }
        else {
          const exp = rowToExpense(row);
          const idx = expenses.findIndex((e) => e.id === exp.id);
          if (idx === -1) expenses = [exp, ...expenses];
          else { const next = [...expenses]; next[idx] = exp; expenses = next; }
        }
        emit();
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "expense_categories" }, (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row) return;
        if (payload.eventType === "DELETE") { categories = categories.filter((c) => c.id !== row.id); }
        else {
          const cat = rowToCategory(row);
          const idx = categories.findIndex((c) => c.id === cat.id);
          if (idx === -1) categories = [...categories, cat];
          else { const next = [...categories]; next[idx] = cat; categories = next; }
        }
        emit();
      })
      .subscribe();
    // Store channel ref for potential cleanup (not critical for singleton).
    (globalThis as any).__expenseChannel = channel;
  } else {
    mode = "local";
    expenses = loadExpensesLocal();
    categories = loadCategoriesLocal();
  }
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

export async function addExpense(input: NewExpense): Promise<Expense> {
  ensureHydrated();
  const seq = getNextSequence(expenses, input.date);
  const id = `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const expenseId = formatExpenseId(input.date, seq);
  const now = new Date().toISOString();

  const expense: Expense = {
    ...input, id, expenseId, status: "active", createdAt: now, updatedAt: now,
  };

  if (mode === "db" && supabase) {
    const { data, error } = await supabase.from("expenses").insert(expenseToRow(expense)).select("*").single();
    if (error || !data) { console.error("[expense-store] addExpense failed:", error?.message); return expense; }
    const saved = rowToExpense(data);
    expenses = [saved, ...expenses];
    emit();
    return saved;
  }

  expenses = [expense, ...expenses];
  saveExpensesLocal(expenses);
  emit();
  return expense;
}

export async function updateExpense(id: string, updates: Partial<NewExpense>): Promise<Expense | null> {
  ensureHydrated();
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  if (mode === "db" && supabase) {
    const row: Record<string, unknown> = {};
    if ("category" in updates) row.category = updates.category ?? null;
    if ("amount" in updates) row.amount = updates.amount;
    if ("paymentMode" in updates) row.payment_mode = updates.paymentMode ?? null;
    if ("description" in updates) row.description = updates.description ?? null;
    if ("vendor" in updates) row.vendor = updates.vendor ?? null;
    if ("employee" in updates) row.employee = updates.employee ?? null;
    if ("attachment" in updates) row.attachment = updates.attachment ?? null;
    if ("date" in updates) row.expense_date = updates.date ?? null;
    if ("time" in updates) row.time_label = updates.time ?? null;
    if ("internalNotes" in updates) row.internal_notes = updates.internalNotes ?? null;
    const { error } = await supabase.from("expenses").update(row).eq("id", id);
    if (error) { console.error("[expense-store] updateExpense failed:", error.message); return null; }
  }

  expenses = expenses.map((e) => e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e);
  if (mode === "local") saveExpensesLocal(expenses);
  emit();
  return expenses.find((e) => e.id === id) ?? null;
}

export async function cancelExpense(id: string, reason: string, cancelledBy: string): Promise<Expense | null> {
  ensureHydrated();
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();

  if (mode === "db" && supabase) {
    const { error } = await supabase.from("expenses").update({
      status: "cancelled", cancellation_reason: reason, cancelled_at: now, cancelled_by: cancelledBy,
    }).eq("id", id);
    if (error) { console.error("[expense-store] cancelExpense failed:", error.message); return null; }
  }

  expenses = expenses.map((e) => e.id === id
    ? { ...e, status: "cancelled" as const, cancellationReason: reason, cancelledAt: now, cancelledBy, updatedAt: now }
    : e);
  if (mode === "local") saveExpensesLocal(expenses);
  emit();
  return expenses.find((e) => e.id === id) ?? null;
}

export function linkLedgerEntry(expenseId: string, ledgerEntryId: string) {
  ensureHydrated();
  expenses = expenses.map((e) => e.id === expenseId ? { ...e, ledgerEntryId } : e);
  if (mode === "db" && supabase) {
    supabase.from("expenses").update({ ledger_entry_id: ledgerEntryId }).eq("id", expenseId).then();
  }
  if (mode === "local") saveExpensesLocal(expenses);
  emit();
}

/* ─── Category Operations ────────────────────────────────────────── */

export function getCategories(): ExpenseCategory[] {
  ensureHydrated();
  return categories;
}

export async function addCategory(label: string): Promise<ExpenseCategory> {
  ensureHydrated();
  const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const cat: ExpenseCategory = { id, label: label.trim(), createdAt: new Date().toISOString() };

  if (mode === "db" && supabase) {
    const { data, error } = await supabase.from("expense_categories").insert({ id, label: cat.label }).select("*").single();
    if (!error && data) {
      const saved = rowToCategory(data);
      categories = [...categories, saved];
      emit();
      return saved;
    }
  }

  categories = [...categories, cat];
  if (mode === "local") saveCategoriesLocal(categories);
  emit();
  return cat;
}

export async function removeCategory(id: string) {
  ensureHydrated();
  if (mode === "db" && supabase) {
    await supabase.from("expense_categories").delete().eq("id", id);
  }
  categories = categories.filter((c) => c.id !== id);
  if (mode === "local") saveCategoriesLocal(categories);
  emit();
}

export function resetCategories() {
  categories = [...DEFAULT_CATEGORIES];
  if (mode === "local") saveCategoriesLocal(categories);
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
