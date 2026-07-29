"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, FolderTree, Edit2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────── */

type AccountHead = {
  id: string;
  name: string;
  type: "income" | "expense" | "asset" | "liability" | "equity";
  parent?: string;
  description: string;
  status: "active" | "inactive";
};

const TYPE_TONE: Record<AccountHead["type"], string> = {
  income: "bg-success/10 text-emerald-700 ring-success/30",
  expense: "bg-rose-50 text-rose-700 ring-rose-200",
  asset: "bg-[#EEF1FD] text-[#4361EE] ring-[#4361EE]/20",
  liability: "bg-amber-50 text-amber-700 ring-amber-200",
  equity: "bg-violet-50 text-violet-700 ring-violet-200",
};

/* ─── Seed ───────────────────────────────────────────────────────────── */

const SEED_ACCOUNTS: AccountHead[] = [
  // Income accounts
  { id: "ACC-001", name: "Service Revenue", type: "income", description: "Revenue from repair services", status: "active" },
  { id: "ACC-002", name: "Product Sales", type: "income", description: "Revenue from product sales and accessories", status: "active" },
  { id: "ACC-003", name: "Consultation Fees", type: "income", description: "Revenue from device consultation", status: "active" },

  // Expense accounts
  { id: "ACC-004", name: "Salary Expense", type: "expense", description: "Employee salary and wages", status: "active" },
  { id: "ACC-005", name: "Rent Expense", type: "expense", description: "Shop and office rent", status: "active" },
  { id: "ACC-006", name: "Utilities", type: "expense", description: "Electricity, water, internet", status: "active" },
  { id: "ACC-007", name: "Office Supplies", type: "expense", description: "Stationery, consumables", status: "active" },
  { id: "ACC-008", name: "Fuel & Travel", type: "expense", description: "Transportation and fuel costs", status: "active" },
  { id: "ACC-009", name: "Marketing", type: "expense", description: "Advertising and promotions", status: "active" },
  { id: "ACC-010", name: "Courier & Shipping", type: "expense", description: "Logistics and delivery costs", status: "active" },

  // Assets
  { id: "ACC-011", name: "Cash", type: "asset", description: "Cash on hand", status: "active" },
  { id: "ACC-012", name: "Bank", type: "asset", description: "Bank account balances", status: "active" },
  { id: "ACC-013", name: "Inventory", type: "asset", description: "Stock and spare parts", status: "active" },
  { id: "ACC-014", name: "Equipment", type: "asset", description: "Tools and repair equipment", status: "active" },
  { id: "ACC-015", name: "Accounts Receivable", type: "asset", description: "Outstanding customer payments", status: "active" },

  // Liabilities
  { id: "ACC-016", name: "Accounts Payable", type: "liability", description: "Outstanding vendor payments", status: "active" },
  { id: "ACC-017", name: "Salary Payable", type: "liability", description: "Unpaid employee salaries", status: "active" },
  { id: "ACC-018", name: "Loan Payable", type: "liability", description: "Business loans", status: "active" },
  { id: "ACC-019", name: "Salary Advance", type: "liability", description: "Advances given to employees (recoverable)", status: "active" },

  // Equity
  { id: "ACC-020", name: "Owner's Capital", type: "equity", description: "Owner's investment", status: "active" },
  { id: "ACC-021", name: "Retained Earnings", type: "equity", description: "Accumulated profits", status: "active" },
];

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function AccountManagementPage() {
  const [accounts] = useState<AccountHead[]>(SEED_ACCOUNTS);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const types: AccountHead["type"][] = ["income", "expense", "asset", "liability", "equity"];

  let filtered = accounts;
  if (typeFilter !== "all") {
    filtered = filtered.filter((a) => a.type === typeFilter);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Account Management"
        subtitle="Manage the chart of accounts — income, expense, asset, liability, and equity heads."
        actions={<Button size="md"><Plus className="h-4 w-4" /> Add Account Head</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {types.map((type) => (
          <motion.div
            key={type}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-3.5 shadow-card cursor-pointer hover:shadow-md transition"
            onClick={() => setTypeFilter(typeFilter === type ? "all" : type)}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{type}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{accounts.filter((a) => a.type === type).length}</p>
          </motion.div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={cn(
            "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
            typeFilter === "all" ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200"
          )}
        >
          All ({accounts.length})
        </button>
        {types.map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all capitalize",
              typeFilter === type ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200"
            )}
          >
            {type} ({accounts.filter((a) => a.type === type).length})
          </button>
        ))}
      </div>

      {/* Accounts Table */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[60px_1fr_1fr_80px_60px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Code</div>
          <div>Account Name</div>
          <div>Description</div>
          <div className="text-center">Type</div>
          <div className="text-center">Actions</div>
        </div>

        <div className="divide-y divide-border">
          {filtered.map((acc, i) => (
            <motion.div
              key={acc.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="sm:grid sm:grid-cols-[60px_1fr_1fr_80px_60px] gap-2 px-5 py-3 hover:bg-muted/30 transition items-center"
            >
              <div className="text-[11px] text-muted-foreground font-mono">{acc.id.split("-")[1]}</div>
              <div>
                <p className="text-sm font-medium">{acc.name}</p>
              </div>
              <div className="hidden sm:block text-[12px] text-muted-foreground truncate">{acc.description}</div>
              <div className="hidden sm:flex sm:justify-center">
                <Badge className={cn("text-[9px] capitalize", TYPE_TONE[acc.type])}>{acc.type}</Badge>
              </div>
              <div className="hidden sm:flex sm:justify-center gap-1">
                <button className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted transition">
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
