"use client";

import { useMemo, useState } from "react";
import { Download, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatINR } from "@/lib/utils";
import { useLedger } from "@/lib/accounting-service";
import { usePermissions } from "@/lib/permissions-context";

/* ─── Types ─────────────────────────────────────────────────────────── */

type PayrollEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  branch: string;
  month: string;
  baseSalary: number;
  deductions: number;
  netPay: number;
  status: "paid" | "pending" | "processing";
  paidDate?: string;
};

const STATUS_TONE: Record<PayrollEntry["status"], string> = {
  paid: "bg-success/10 text-emerald-700 ring-success/30",
  pending: "bg-warning/10 text-amber-700 ring-warning/30",
  processing: "bg-info/10 text-info ring-info/20",
};

/** Standard statutory deduction rate applied to gross pay. */
const DEDUCTION_RATE = 0.07;
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function PayrollPage() {
  // Salaries flow straight from the staff profiles created in Roles &
  // Permissions / Employee Directory — no separate payroll data to maintain.
  const { team, getRoleById } = usePermissions();
  const { addEntry } = useLedger();
  // Tracks who has been paid this session (id -> paid date).
  const [paidMap, setPaidMap] = useState<Record<string, string>>({});

  const payroll = useMemo<PayrollEntry[]>(() => {
    return team
      .filter((m) => (m.salaryAmount ?? 0) > 0)
      .map((m) => {
        const baseSalary = m.salaryAmount ?? 0;
        const deductions = Math.round(baseSalary * DEDUCTION_RATE);
        const paidDate = paidMap[m.id];
        return {
          id: `PAY-${m.id}`,
          employeeId: m.id,
          employeeName: m.name,
          department: m.department || getRoleById(m.roleId)?.label || "General",
          branch: m.branch,
          month: CURRENT_MONTH,
          baseSalary,
          deductions,
          netPay: baseSalary - deductions,
          status: paidDate ? "paid" : "pending",
          paidDate,
        };
      });
  }, [team, paidMap, getRoleById]);

  const totalPaid = payroll.filter((p) => p.status === "paid").reduce((s, p) => s + p.netPay, 0);
  const totalPending = payroll.filter((p) => p.status !== "paid").reduce((s, p) => s + p.netPay, 0);
  const paidCount = payroll.filter((p) => p.status === "paid").length;

  function processSalary(entry: PayrollEntry) {
    setPaidMap((prev) => ({ ...prev, [entry.employeeId]: new Date().toISOString().slice(0, 10) }));

    // Auto-create ledger entry
    addEntry({
      date: new Date().toISOString().slice(0, 10),
      type: "salary",
      account: "Salary Expense",
      description: `Salary payment - ${entry.employeeName} (${entry.month})`,
      debit: entry.netPay,
      credit: 0,
      reference: entry.id,
      createdBy: "System",
      status: "posted",
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Employees"
        title="Payroll & Salary"
        subtitle="Process monthly salary, view payroll history, and generate payslips."
        actions={<Button size="md"><Download className="h-4 w-4" /> Export Payroll</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Disbursed" value={formatINR(totalPaid)} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
        <StatCard label="Pending Payout" value={formatINR(totalPending)} icon={<Clock className="h-4 w-4 text-amber-600" />} />
        <StatCard label="Paid Employees" value={`${paidCount} / ${payroll.length}`} icon={<CheckCircle2 className="h-4 w-4 text-[#4361EE]" />} />
        <StatCard label="Current Month" value="July 2026" icon={<AlertCircle className="h-4 w-4 text-zinc-500" />} />
      </div>

      {/* Payroll Table */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[1fr_120px_100px_100px_100px_90px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Employee</div>
          <div>Department</div>
          <div className="text-right">Gross</div>
          <div className="text-right">Deductions</div>
          <div className="text-right">Net Pay</div>
          <div className="text-center">Status</div>
        </div>

        <div className="divide-y divide-border">
          {payroll.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EEF1FD] text-xs font-bold text-[#4361EE]">
                {entry.employeeName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </span>
              <div className="flex-1 min-w-0 sm:grid sm:grid-cols-[1fr_120px_100px_100px_100px_90px] sm:gap-2 sm:items-center">
                <div>
                  <p className="text-sm font-medium truncate">{entry.employeeName}</p>
                  <p className="text-[10px] text-muted-foreground">{entry.id} · {entry.branch}</p>
                </div>
                <div className="hidden sm:block text-[12px] truncate">{entry.department}</div>
                <div className="hidden sm:block text-right text-[12px] tabular-nums">{formatINR(entry.baseSalary)}</div>
                <div className="hidden sm:block text-right text-[12px] tabular-nums text-rose-600">-{formatINR(entry.deductions)}</div>
                <div className="hidden sm:block text-right text-[12px] font-semibold tabular-nums">{formatINR(entry.netPay)}</div>
                <div className="hidden sm:flex sm:justify-center">
                  {entry.status === "paid" ? (
                    <Badge className={cn("text-[10px]", STATUS_TONE.paid)}>Paid</Badge>
                  ) : (
                    <button
                      onClick={() => processSalary(entry)}
                      className="rounded-full bg-[#4361EE] px-3 py-1 text-[10px] font-semibold text-white hover:bg-[#3651DE] transition"
                    >
                      Pay Now
                    </button>
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
