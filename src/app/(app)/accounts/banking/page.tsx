"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, ArrowLeftRight, Landmark, Wallet, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatINR } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────── */

type BankAccount = {
  id: string;
  name: string;
  type: "bank" | "cash";
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  balance: number;
  status: "active" | "inactive";
};

type Transfer = {
  id: string;
  date: string;
  from: string;
  to: string;
  amount: number;
  note: string;
  status: "completed" | "pending";
};

/* ─── Seed ───────────────────────────────────────────────────────────── */

const SEED_ACCOUNTS: BankAccount[] = [
  { id: "BA-001", name: "Main Business Account", type: "bank", bankName: "HDFC Bank", accountNumber: "****4521", ifsc: "HDFC0001234", balance: 485000, status: "active" },
  { id: "BA-002", name: "Payroll Account", type: "bank", bankName: "ICICI Bank", accountNumber: "****7832", ifsc: "ICIC0005678", balance: 220000, status: "active" },
  { id: "BA-003", name: "Petty Cash - HQ", type: "cash", balance: 15000, status: "active" },
  { id: "BA-004", name: "Petty Cash - Koramangala", type: "cash", balance: 8500, status: "active" },
  { id: "BA-005", name: "Savings Account", type: "bank", bankName: "SBI", accountNumber: "****1190", ifsc: "SBIN0009876", balance: 150000, status: "inactive" },
];

const SEED_TRANSFERS: Transfer[] = [
  { id: "TRF-001", date: "2026-07-28", from: "Main Business Account", to: "Payroll Account", amount: 350000, note: "Monthly payroll funding", status: "completed" },
  { id: "TRF-002", date: "2026-07-25", from: "Main Business Account", to: "Petty Cash - HQ", amount: 20000, note: "Cash replenishment", status: "completed" },
  { id: "TRF-003", date: "2026-07-22", from: "Main Business Account", to: "Petty Cash - Koramangala", amount: 10000, note: "Branch cash fund", status: "completed" },
  { id: "TRF-004", date: "2026-07-20", from: "Savings Account", to: "Main Business Account", amount: 100000, note: "Capital injection", status: "completed" },
  { id: "TRF-005", date: "2026-07-29", from: "Main Business Account", to: "Petty Cash - HQ", amount: 5000, note: "Emergency cash", status: "pending" },
];

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function BankingPage() {
  const [accounts] = useState<BankAccount[]>(SEED_ACCOUNTS);
  const [transfers] = useState<Transfer[]>(SEED_TRANSFERS);

  const totalBankBalance = accounts.filter((a) => a.type === "bank" && a.status === "active").reduce((s, a) => s + a.balance, 0);
  const totalCashBalance = accounts.filter((a) => a.type === "cash" && a.status === "active").reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Banking & Transfers"
        subtitle="Manage bank accounts, cash accounts, deposits, withdrawals, and inter-account transfers."
        actions={
          <div className="flex gap-2">
            <Button size="md" variant="outline"><ArrowLeftRight className="h-4 w-4" /> New Transfer</Button>
            <Button size="md"><Plus className="h-4 w-4" /> Add Account</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Bank Balance" value={formatINR(totalBankBalance)} icon={<Landmark className="h-4 w-4 text-[#4361EE]" />} />
        <StatCard label="Cash Balance" value={formatINR(totalCashBalance)} icon={<Wallet className="h-4 w-4 text-emerald-600" />} />
        <StatCard label="Active Accounts" value={String(accounts.filter((a) => a.status === "active").length)} icon={<TrendingUp className="h-4 w-4 text-violet-600" />} />
        <StatCard label="This Month Transfers" value={String(transfers.length)} icon={<ArrowLeftRight className="h-4 w-4 text-amber-600" />} />
      </div>

      {/* Bank Accounts */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Accounts</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <motion.div
              key={acc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-md",
                acc.status === "inactive" && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={cn(
                    "grid h-9 w-9 place-items-center rounded-xl",
                    acc.type === "bank" ? "bg-[#EEF1FD] text-[#4361EE]" : "bg-emerald-50 text-emerald-700"
                  )}>
                    {acc.type === "bank" ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{acc.name}</p>
                    {acc.bankName && <p className="text-[11px] text-muted-foreground">{acc.bankName} · {acc.accountNumber}</p>}
                    {!acc.bankName && <p className="text-[11px] text-muted-foreground">Cash Account</p>}
                  </div>
                </div>
                <Badge className={cn("text-[9px]", acc.status === "active" ? "bg-success/10 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>
                  {acc.status}
                </Badge>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">{formatINR(acc.balance)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Transfers */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Recent Transfers</h3>
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="hidden sm:grid sm:grid-cols-[80px_1fr_1fr_100px_100px_80px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Date</div>
            <div>From</div>
            <div>To</div>
            <div className="text-right">Amount</div>
            <div>Note</div>
            <div className="text-center">Status</div>
          </div>
          <div className="divide-y divide-border">
            {transfers.map((t) => (
              <div key={t.id} className="sm:grid sm:grid-cols-[80px_1fr_1fr_100px_100px_80px] gap-2 px-5 py-3 hover:bg-muted/30 transition items-center">
                <div className="text-[12px] text-muted-foreground tabular-nums">
                  {new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
                <div className="text-[12px] truncate">{t.from}</div>
                <div className="text-[12px] truncate">{t.to}</div>
                <div className="text-right text-[12px] font-semibold tabular-nums">{formatINR(t.amount)}</div>
                <div className="text-[11px] text-muted-foreground truncate">{t.note}</div>
                <div className="hidden sm:flex sm:justify-center">
                  <Badge className={cn("text-[9px]", t.status === "completed" ? "bg-success/10 text-emerald-700" : "bg-warning/10 text-amber-700")}>
                    {t.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
