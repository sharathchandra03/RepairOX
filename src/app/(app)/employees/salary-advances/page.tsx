"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, CheckCircle2, Clock, XCircle, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatINR } from "@/lib/utils";
import { useLedger } from "@/lib/accounting-service";

/* ─── Types ─────────────────────────────────────────────────────────── */

type SalaryAdvance = {
  id: string;
  employeeId: string;
  employeeName: string;
  branch: string;
  requestDate: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "recovered";
  approvedDate?: string;
  recoverySchedule?: string;
  recoveredAmount: number;
};

const STATUS_TONE: Record<SalaryAdvance["status"], string> = {
  pending: "bg-warning/10 text-amber-700 ring-warning/30",
  approved: "bg-success/10 text-emerald-700 ring-success/30",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  recovered: "bg-info/10 text-info ring-info/20",
};

/* ─── Seed ───────────────────────────────────────────────────────────── */

const SEED_ADVANCES: SalaryAdvance[] = [
  { id: "ADV-001", employeeId: "EMP-004", employeeName: "Anand Rao", branch: "BTM Layout (HQ)", requestDate: "2026-07-05", amount: 15000, reason: "Medical emergency", status: "approved", approvedDate: "2026-07-06", recoverySchedule: "3 months", recoveredAmount: 5000 },
  { id: "ADV-002", employeeId: "EMP-005", employeeName: "Pooja Iyer", branch: "Koramangala", requestDate: "2026-07-10", amount: 10000, reason: "House rent deposit", status: "approved", approvedDate: "2026-07-11", recoverySchedule: "2 months", recoveredAmount: 0 },
  { id: "ADV-003", employeeId: "EMP-007", employeeName: "Manoj S.", branch: "HSR Layout", requestDate: "2026-07-18", amount: 8000, reason: "Personal requirement", status: "pending", recoveredAmount: 0 },
  { id: "ADV-004", employeeId: "EMP-009", employeeName: "Imran Khan", branch: "HSR Layout", requestDate: "2026-06-20", amount: 12000, reason: "Education fees", status: "recovered", approvedDate: "2026-06-21", recoverySchedule: "2 months", recoveredAmount: 12000 },
  { id: "ADV-005", employeeId: "EMP-003", employeeName: "Anjali R.", branch: "BTM Layout (HQ)", requestDate: "2026-07-22", amount: 5000, reason: "Travel expense", status: "rejected", recoveredAmount: 0 },
];

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function SalaryAdvancesPage() {
  const [advances, setAdvances] = useState<SalaryAdvance[]>(SEED_ADVANCES);
  const { addEntry } = useLedger();

  const totalOutstanding = advances
    .filter((a) => a.status === "approved")
    .reduce((s, a) => s + (a.amount - a.recoveredAmount), 0);
  const pendingCount = advances.filter((a) => a.status === "pending").length;
  const totalDisbursed = advances
    .filter((a) => a.status === "approved" || a.status === "recovered")
    .reduce((s, a) => s + a.amount, 0);

  function approveAdvance(id: string) {
    const advance = advances.find((a) => a.id === id);
    if (!advance) return;

    setAdvances((prev) =>
      prev.map((a) => a.id === id ? { ...a, status: "approved" as const, approvedDate: new Date().toISOString().slice(0, 10), recoverySchedule: "3 months" } : a)
    );

    // Auto-create ledger entry for advance disbursement
    addEntry({
      date: new Date().toISOString().slice(0, 10),
      type: "advance_salary",
      account: "Salary Advance",
      description: `Salary advance disbursed - ${advance.employeeName}`,
      debit: advance.amount,
      credit: 0,
      reference: advance.id,
      createdBy: "System",
      status: "posted",
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Employees"
        title="Salary Advances"
        subtitle="Manage advance salary requests, approvals, and recovery schedules."
        actions={<Button size="md"><Plus className="h-4 w-4" /> New Request</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Outstanding" value={formatINR(totalOutstanding)} icon={<Wallet className="h-4 w-4 text-amber-600" />} />
        <StatCard label="Total Disbursed" value={formatINR(totalDisbursed)} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
        <StatCard label="Pending Requests" value={String(pendingCount)} icon={<Clock className="h-4 w-4 text-[#4361EE]" />} />
        <StatCard label="Total Requests" value={String(advances.length)} icon={<Wallet className="h-4 w-4 text-zinc-500" />} />
      </div>

      {/* Advances Table */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[1fr_120px_100px_120px_100px_90px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Employee</div>
          <div>Request Date</div>
          <div className="text-right">Amount</div>
          <div>Recovery</div>
          <div className="text-right">Remaining</div>
          <div className="text-center">Status</div>
        </div>

        <div className="divide-y divide-border">
          {advances.map((adv) => (
            <div key={adv.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EEF1FD] text-xs font-bold text-[#4361EE]">
                {adv.employeeName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </span>
              <div className="flex-1 min-w-0 sm:grid sm:grid-cols-[1fr_120px_100px_120px_100px_90px] sm:gap-2 sm:items-center">
                <div>
                  <p className="text-sm font-medium truncate">{adv.employeeName}</p>
                  <p className="text-[10px] text-muted-foreground">{adv.id} · {adv.reason}</p>
                </div>
                <div className="hidden sm:block text-[12px]">{new Date(adv.requestDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                <div className="hidden sm:block text-right text-[12px] font-semibold tabular-nums">{formatINR(adv.amount)}</div>
                <div className="hidden sm:block text-[12px] text-muted-foreground">{adv.recoverySchedule ?? "—"}</div>
                <div className="hidden sm:block text-right text-[12px] tabular-nums">
                  {adv.status === "approved" ? formatINR(adv.amount - adv.recoveredAmount) : "—"}
                </div>
                <div className="hidden sm:flex sm:justify-center">
                  {adv.status === "pending" ? (
                    <button
                      onClick={() => approveAdvance(adv.id)}
                      className="rounded-full bg-[#4361EE] px-3 py-1 text-[10px] font-semibold text-white hover:bg-[#3651DE] transition"
                    >
                      Approve
                    </button>
                  ) : (
                    <Badge className={cn("text-[10px]", STATUS_TONE[adv.status])}>
                      {adv.status.charAt(0).toUpperCase() + adv.status.slice(1)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
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
