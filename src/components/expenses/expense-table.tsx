"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Download, ChevronLeft, ChevronRight, Filter,
  CalendarDays, Tag, CreditCard, User, X, IndianRupee,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import {
  type Expense,
  type PaymentMode,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODE_OPTIONS,
  useExpenseCategories,
} from "@/lib/expense-store";

/* ─── Constants ──────────────────────────────────────────────────── */

const PAGE_SIZE = 10;

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};

const PAYMENT_TONE: Record<PaymentMode, string> = {
  cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  upi: "bg-violet-50 text-violet-700 ring-violet-200",
  bank_transfer: "bg-blue-50 text-blue-700 ring-blue-200",
  card: "bg-amber-50 text-amber-700 ring-amber-200",
  cheque: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  wallet: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  other: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

type DateFilter = "all" | "today" | "7days" | "30days" | "custom";
const DATE_LABELS: Record<DateFilter, string> = {
  all: "All Time",
  today: "Today",
  "7days": "Last 7 Days",
  "30days": "Last 30 Days",
  custom: "Custom",
};

/* ─── Props ──────────────────────────────────────────────────────── */

interface ExpenseTableProps {
  expenses: Expense[];
  onRowClick: (expense: Expense) => void;
}

/* ─── Component ──────────────────────────────────────────────────── */

export function ExpenseTable({ expenses, onRowClick }: ExpenseTableProps) {
  const categories = useExpenseCategories();

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // Distinct employees for filter
  const employees = useMemo(() => {
    const set = new Set(expenses.filter((e) => e.employee).map((e) => e.employee));
    return Array.from(set).sort();
  }, [expenses]);

  const categoryOptions = useMemo(
    () => [{ label: "All Categories", value: "all" }, ...categories.map((c) => ({ label: c.label, value: c.label }))],
    [categories]
  );
  const paymentOptions = useMemo(
    () => [{ label: "All Modes", value: "all" }, ...PAYMENT_MODE_OPTIONS],
    []
  );
  const employeeOptions = useMemo(
    () => [{ label: "All Employees", value: "all" }, ...employees.map((e) => ({ label: e, value: e }))],
    [employees]
  );

  // Filtered + searched data
  const filtered = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const ts = todayStart.getTime();
    const q = search.trim().toLowerCase();

    return expenses.filter((e) => {
      // Search
      if (q) {
        const hay = `${e.expenseId} ${e.description} ${e.category} ${e.vendor} ${e.employee} ${PAYMENT_MODE_LABELS[e.paymentMode]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Category
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      // Payment mode
      if (paymentFilter !== "all" && e.paymentMode !== paymentFilter) return false;
      // Employee
      if (employeeFilter !== "all" && e.employee !== employeeFilter) return false;
      // Date
      if (dateFilter !== "all") {
        const eDate = new Date(e.date).getTime();
        switch (dateFilter) {
          case "today": if (eDate < ts) return false; break;
          case "7days": if (eDate < ts - 7 * 86_400_000) return false; break;
          case "30days": if (eDate < ts - 30 * 86_400_000) return false; break;
        }
      }
      return true;
    });
  }, [expenses, search, categoryFilter, paymentFilter, employeeFilter, dateFilter]);

  // Sort by date descending
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
    [filtered]
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page on filter change
  useMemo(() => { setPage(1); }, [search, categoryFilter, paymentFilter, employeeFilter, dateFilter]);

  // Stats
  const totalActive = filtered.filter((e) => e.status === "active").reduce((s, e) => s + e.amount, 0);

  // CSV export
  const handleExport = () => {
    const header = "Expense ID,Date,Category,Description,Amount,Payment Mode,Vendor,Employee,Status\n";
    const rows = sorted.map((e) =>
      `"${e.expenseId}","${e.date}","${e.category}","${e.description.replace(/"/g, '""')}",${e.amount},"${PAYMENT_MODE_LABELS[e.paymentMode]}","${e.vendor}","${e.employee}","${e.status}"`
    ).join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = categoryFilter !== "all" || paymentFilter !== "all" || employeeFilter !== "all" || dateFilter !== "all";

  const clearFilters = () => {
    setCategoryFilter("all");
    setPaymentFilter("all");
    setEmployeeFilter("all");
    setDateFilter("all");
    setSearch("");
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Input
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            placeholder="Search expenses…"
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition",
              showFilters || hasActiveFilters
                ? "border-[#4361EE] text-[#4361EE] bg-indigo-50"
                : "border-border bg-card text-zinc-600 hover:bg-[#EEF1FD] hover:text-[#4361EE]"
            )}
          >
            <Filter className="h-3.5 w-3.5" /> Filters
            {hasActiveFilters && (
              <span className="ml-1 grid h-4 w-4 place-items-center rounded-full bg-[#4361EE] text-[9px] font-bold text-white">
                {[categoryFilter !== "all", paymentFilter !== "all", employeeFilter !== "all", dateFilter !== "all"].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Date quick filters */}
          {(["all", "today", "7days", "30days"] as DateFilter[]).map((d) => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
                dateFilter === d
                  ? "bg-[#4361EE] text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-slate-200"
              )}
            >
              {DATE_LABELS[d]}
            </button>
          ))}

          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* Extended Filters Panel */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" /> Category
              </label>
              <RSelect
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={categoryOptions}
                searchable
                placeholder="All Categories"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Payment Mode
              </label>
              <RSelect
                value={paymentFilter}
                onChange={setPaymentFilter}
                options={paymentOptions}
                searchable
                placeholder="All Modes"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> Employee
              </label>
              <RSelect
                value={employeeFilter}
                onChange={setEmployeeFilter}
                options={employeeOptions}
                searchable
                placeholder="All Employees"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 transition"
            >
              <X className="h-3 w-3" /> Clear all filters
            </button>
          )}
        </motion.div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <span>{sorted.length} expense{sorted.length !== 1 ? "s" : ""}</span>
        <span className="h-3 w-px bg-border" />
        <span>Total: <span className="font-semibold text-foreground">{formatINR(totalActive)}</span></span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid sm:grid-cols-[130px_minmax(190px,1.4fr)_minmax(150px,1fr)_120px_120px_100px] gap-3 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>ID</div>
          <div>Description</div>
          <div>Category</div>
          <div className="text-right">Amount</div>
          <div className="text-center">Payment</div>
          <div className="text-center">Status</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {pageData.length > 0 ? pageData.map((expense) => (
            <button
              key={expense.id}
              type="button"
              onClick={() => onRowClick(expense)}
              className="w-full text-left sm:grid sm:grid-cols-[130px_minmax(190px,1.4fr)_minmax(150px,1fr)_120px_120px_100px] gap-3 px-5 py-3.5 hover:bg-muted/30 transition items-center"
            >
              {/* ID + Date */}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#4361EE] tabular-nums whitespace-nowrap">{expense.expenseId}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(expense.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              </div>

              {/* Description + Meta */}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{expense.description}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {expense.vendor && `${expense.vendor} · `}
                  {expense.employee && `by ${expense.employee}`}
                </p>
              </div>

              {/* Category */}
              <div className="hidden sm:block min-w-0">
                <span className="inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-zinc-600">
                  <Tag className="h-3 w-3 shrink-0 text-zinc-400" />
                  <span className="truncate">{expense.category}</span>
                </span>
              </div>

              {/* Amount */}
              <div className="hidden sm:block text-right">
                <span className="text-sm font-bold tabular-nums whitespace-nowrap">{formatINR(expense.amount)}</span>
              </div>

              {/* Payment Mode */}
              <div className="hidden sm:flex sm:justify-center">
                <Badge className={cn("text-[9px] px-1.5 whitespace-nowrap", PAYMENT_TONE[expense.paymentMode])}>
                  {PAYMENT_MODE_LABELS[expense.paymentMode]}
                </Badge>
              </div>

              {/* Status */}
              <div className="hidden sm:flex sm:justify-center">
                <Badge className={cn("text-[9px] px-1.5 whitespace-nowrap", STATUS_TONE[expense.status])}>
                  {expense.status === "active" ? "Active" : "Cancelled"}
                </Badge>
              </div>
            </button>
          )) : (
            <div className="px-5 py-12 text-center">
              <IndianRupee className="mx-auto h-8 w-8 text-zinc-300 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search || hasActiveFilters ? "No expenses match your filters." : "No expenses recorded yet."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-[12px] text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <span key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-muted-foreground">…</span>}
                  <button
                    onClick={() => setPage(p)}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-lg text-[12px] font-medium transition",
                      p === page
                        ? "bg-[#4361EE] text-white shadow-sm"
                        : "border border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
