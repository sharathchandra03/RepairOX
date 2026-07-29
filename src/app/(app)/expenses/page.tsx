"use client";

import { useState, useMemo } from "react";
import { Plus, Receipt, TrendingUp, AlertCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { useExpenses, type Expense } from "@/lib/expense-store";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { ExpenseModal } from "@/components/expenses/expense-modal";
import { ExpenseDetailDrawer } from "@/components/expenses/expense-detail-drawer";
import { ExpenseDeleteDialog } from "@/components/expenses/expense-delete-dialog";

export default function ExpensesPage() {
  const expenses = useExpenses();

  // Modal / Drawer state
  const [modalOpen, setModalOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [drawerExpense, setDrawerExpense] = useState<Expense | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);

  // Stats
  const stats = useMemo(() => {
    const active = expenses.filter((e) => e.status === "active");
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const thisMonth = active.filter((e) => e.date >= thisMonthStart);
    const thisMonthTotal = thisMonth.reduce((s, e) => s + e.amount, 0);
    const totalAll = active.reduce((s, e) => s + e.amount, 0);

    // Top category this month
    const catMap = new Map<string, number>();
    for (const e of thisMonth) catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount);
    let topCategory = "—";
    let topCatAmount = 0;
    for (const [cat, amt] of catMap) {
      if (amt > topCatAmount) { topCategory = cat; topCatAmount = amt; }
    }

    const cancelled = expenses.filter((e) => e.status === "cancelled").length;

    return { thisMonthTotal, totalAll, topCategory, topCatAmount, activeCount: active.length, cancelled, thisMonthCount: thisMonth.length };
  }, [expenses]);

  // Handlers
  const handleRowClick = (expense: Expense) => setDrawerExpense(expense);
  const handleEdit = (expense: Expense) => {
    setDrawerExpense(null);
    setTimeout(() => { setEditExpense(expense); setModalOpen(true); }, 200);
  };
  const handleDelete = (expense: Expense) => {
    setDrawerExpense(null);
    setTimeout(() => setDeleteExpense(expense), 200);
  };
  const handleDeleteSuccess = () => {
    setDeleteExpense(null);
  };
  const handleModalClose = () => {
    setModalOpen(false);
    setEditExpense(null);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition">Dashboard</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Expenses</span>
      </div>

      {/* Page Header */}
      <PageHeader
        eyebrow="Administration"
        title="Expense Management"
        subtitle="Track, categorize, and manage all business expenses with full accounting integration."
        actions={
          <Button size="md" onClick={() => { setEditExpense(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Expense
          </Button>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="This Month"
          value={formatINR(stats.thisMonthTotal)}
          sub={`${stats.thisMonthCount} expenses`}
          icon={<Receipt className="h-4 w-4 text-[#4361EE]" />}
        />
        <StatCard
          label="Total (All Time)"
          value={formatINR(stats.totalAll)}
          sub={`${stats.activeCount} active`}
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
        />
        <StatCard
          label="Top Category"
          value={stats.topCategory}
          sub={stats.topCatAmount > 0 ? formatINR(stats.topCatAmount) : "No data"}
        />
        <StatCard
          label="Cancelled"
          value={String(stats.cancelled)}
          sub="soft-deleted"
          icon={stats.cancelled > 0 ? <AlertCircle className="h-4 w-4 text-rose-400" /> : undefined}
        />
      </div>

      {/* Expenses Table */}
      <ExpenseTable expenses={expenses} onRowClick={handleRowClick} />

      {/* Add/Edit Modal */}
      <ExpenseModal
        open={modalOpen}
        onClose={handleModalClose}
        editExpense={editExpense}
      />

      {/* Detail Drawer */}
      <ExpenseDetailDrawer
        expense={drawerExpense}
        open={!!drawerExpense}
        onClose={() => setDrawerExpense(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation */}
      <ExpenseDeleteDialog
        expense={deleteExpense}
        open={!!deleteExpense}
        onClose={() => setDeleteExpense(null)}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────────── */

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums truncate">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
