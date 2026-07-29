"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChevronRight, Wallet, Landmark, ArrowDownLeft, ArrowUpRight,
  TrendingUp, Clock, Search, Filter, Plus, Lock, Unlock,
  Ticket, FileText, Receipt, Banknote, WalletCards, Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatINR } from "@/lib/utils";
import {
  useDailyLedger,
  COLOR_CODE_STYLES,
  type LedgerTransaction,
  type TransactionModule,
  type TransactionColorCode,
} from "@/lib/daily-ledger-service";
import { ManualTransactionModal } from "@/components/ledger/manual-transaction-modal";
import { CloseDayModal } from "@/components/ledger/close-day-modal";

/* Icon map for modules */
const MODULE_ICON_MAP: Record<TransactionModule, React.ComponentType<{ className?: string }>> = {
  Expense: Receipt,
  Ticket: Ticket,
  Invoice: FileText,
  Salary: Banknote,
  "Salary Advance": WalletCards,
  Refund: ArrowDownLeft,
  Banking: Landmark,
  Manual: Pencil,
};

export default function DailyLedgerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const date = params.date as string;
  const { getDailySummary, getTransactionsForDate, getSession } = useDailyLedger();

  const summary = getDailySummary(date);
  const session = getSession(date);
  const allTransactions = getTransactionsForDate(date);

  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [selectedTx, setSelectedTx] = useState<LedgerTransaction | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Filter transactions
  const filtered = useMemo(() => {
    let list = allTransactions;
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.referenceId.toLowerCase().includes(q) ||
          t.employee.toLowerCase().includes(q) ||
          t.module.toLowerCase().includes(q)
      );
    }
    if (moduleFilter !== "all") {
      list = list.filter((t) => t.module === moduleFilter);
    }
    return list;
  }, [allTransactions, query, moduleFilter]);

  // Format date for display
  const dateObj = new Date(date + "T00:00:00");
  const dateDisplay = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const dayName = dateObj.toLocaleDateString("en-IN", { weekday: "long" });

  // Distinct modules for filter
  const modules = useMemo(() => {
    const set = new Set(allTransactions.map((t) => t.module));
    return Array.from(set);
  }, [allTransactions]);

  if (!summary || !session) {
    return (
      <div className="space-y-5">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Link href="/accounts/ledger" className="hover:text-foreground transition">Accounts</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/accounts/ledger" className="hover:text-foreground transition">Daily Ledger</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">{date}</span>
        </nav>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">No session found for this date.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/accounts/ledger")}>
            Back to Ledger
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Link href="/accounts/ledger" className="hover:text-foreground transition">Accounts</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/accounts/ledger" className="hover:text-foreground transition">Daily Ledger</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">{dateDisplay}</span>
      </nav>

      <PageHeader
        eyebrow={dayName}
        title={dateDisplay}
        subtitle={`${allTransactions.length} transaction${allTransactions.length !== 1 ? "s" : ""} · ${session.status === "open" ? "Day is open" : "Day closed"}`}
        actions={
          <div className="flex items-center gap-2">
            {session.status === "open" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowManualModal(true)}>
                  <Plus className="h-3.5 w-3.5" /> Manual Entry
                </Button>
                <Button variant="soft" size="sm" onClick={() => setShowCloseModal(true)}>
                  <Lock className="h-3.5 w-3.5" /> Close Day
                </Button>
              </>
            )}
            <Badge tone={session.status === "open" ? "warning" : "success"} dot>
              {session.status === "open" ? "Open" : "Closed"}
            </Badge>
          </div>
        }
      />

      {/* Financial Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <SummaryCard label="Opening Cash" value={formatINR(summary.openingCash)} icon={<Wallet className="h-3.5 w-3.5 text-zinc-400" />} />
        <SummaryCard label="Opening Bank" value={formatINR(summary.openingBank)} icon={<Landmark className="h-3.5 w-3.5 text-zinc-400" />} />
        <SummaryCard label="Cash In" value={formatINR(summary.totalCashIn)} icon={<ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />} highlight="green" />
        <SummaryCard label="Cash Out" value={formatINR(summary.totalCashOut)} icon={<ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />} highlight="red" />
        <SummaryCard label="Bank In" value={formatINR(summary.totalBankIn)} icon={<ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />} highlight="green" />
        <SummaryCard label="Bank Out" value={formatINR(summary.totalBankOut)} icon={<ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />} highlight="red" />
        <SummaryCard label="Closing Cash" value={formatINR(summary.closingCash)} icon={<Wallet className="h-3.5 w-3.5 text-emerald-600" />} bold />
        <SummaryCard label="Closing Bank" value={formatINR(summary.closingBank)} icon={<Landmark className="h-3.5 w-3.5 text-blue-600" />} bold />
      </div>

      {/* Transaction Timeline Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          Transaction Timeline
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative max-w-[220px]">
            <Input
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder="Search transactions…"
              iconLeft={<Search className="h-3.5 w-3.5" />}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip active={moduleFilter === "all"} onClick={() => setModuleFilter("all")}>All</FilterChip>
            {modules.map((m) => (
              <FilterChip key={m} active={moduleFilter === m} onClick={() => setModuleFilter(m)}>{m}</FilterChip>
            ))}
          </div>
        </div>
      </div>

      {/* Transaction Timeline */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        {/* Table header (desktop) */}
        <div className="hidden md:grid md:grid-cols-[60px_80px_1fr_100px_80px_70px_90px_70px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Time</div>
          <div>Module</div>
          <div>Description</div>
          <div>Category</div>
          <div>Mode</div>
          <div>Cash/Bank</div>
          <div className="text-right">Amount</div>
          <div>Employee</div>
        </div>

        <div className="divide-y divide-border">
          {filtered.length > 0 ? (
            filtered.map((tx, idx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                index={idx}
                onClick={() => setSelectedTx(tx)}
              />
            ))
          ) : (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {query ? `No transactions match "${query}"` : "No transactions recorded for this day."}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Detail Drawer */}
      {selectedTx && (
        <TransactionDrawer tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}

      {/* Manual Transaction Modal */}
      <ManualTransactionModal
        open={showManualModal}
        onClose={() => setShowManualModal(false)}
        date={date}
      />

      {/* Close Day Modal */}
      {summary && (
        <CloseDayModal
          open={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          summary={summary}
        />
      )}
    </div>
  );
}

/* ─── Transaction Row ────────────────────────────────────────────── */

function TransactionRow({ tx, index, onClick }: { tx: LedgerTransaction; index: number; onClick: () => void }) {
  const Icon = MODULE_ICON_MAP[tx.module] ?? Receipt;
  const color = COLOR_CODE_STYLES[tx.colorCode];
  const time = new Date(tx.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <motion.button
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.15 }}
      onClick={onClick}
      className="w-full text-left px-5 py-3 hover:bg-[#EEF1FD]/40 transition-colors cursor-pointer group"
    >
      {/* Mobile layout */}
      <div className="md:hidden space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("grid h-7 w-7 place-items-center rounded-lg ring-1 ring-inset", color.bg, `ring-current/20`)}>
              <Icon className={cn("h-3.5 w-3.5", color.text)} />
            </span>
            <div>
              <p className="text-[12px] font-semibold truncate max-w-[180px]">{tx.description}</p>
              <p className="text-[10px] text-muted-foreground">{tx.module} · {tx.referenceId} · {time}</p>
            </div>
          </div>
          <span className={cn("text-[13px] font-bold tabular-nums", tx.direction === "inflow" ? "text-emerald-600" : "text-rose-600")}>
            {tx.direction === "inflow" ? "+" : "-"}{formatINR(tx.amount)}
          </span>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:grid md:grid-cols-[60px_80px_1fr_100px_80px_70px_90px_70px] gap-2 items-center">
        <div className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {time}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("grid h-6 w-6 place-items-center rounded-md", color.bg)}>
            <Icon className={cn("h-3 w-3", color.text)} />
          </span>
          <span className="text-[11px] font-medium truncate">{tx.module}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-medium truncate">{tx.description}</p>
          <p className="text-[10px] text-muted-foreground truncate">Ref: {tx.referenceId} · by {tx.createdBy}</p>
        </div>
        <div className="text-[11px] truncate">{tx.category}</div>
        <div className="text-[11px]">{tx.paymentMode}</div>
        <div>
          <Badge tone={tx.cashOrBank === "Cash" ? "success" : "info"} className="text-[9px] px-1.5">
            {tx.cashOrBank}
          </Badge>
        </div>
        <div className={cn("text-right text-[12px] font-bold tabular-nums", tx.direction === "inflow" ? "text-emerald-600" : "text-rose-600")}>
          {tx.direction === "inflow" ? "+" : "-"}{formatINR(tx.amount)}
        </div>
        <div className="text-[11px] truncate text-muted-foreground">{tx.employee}</div>
      </div>
    </motion.button>
  );
}

/* ─── Transaction Detail Drawer ──────────────────────────────────── */

import { Drawer, DetailRow } from "@/components/ui/drawer";

function TransactionDrawer({ tx, onClose }: { tx: LedgerTransaction; onClose: () => void }) {
  const Icon = MODULE_ICON_MAP[tx.module] ?? Receipt;
  const color = COLOR_CODE_STYLES[tx.colorCode];

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={tx.description}
      subtitle={`${tx.module} · ${tx.referenceId}`}
      icon={Icon}
    >
      <div className="space-y-5">
        {/* Amount highlight */}
        <div className={cn("rounded-xl p-4 text-center", color.bg)}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {tx.direction === "inflow" ? "Inflow" : "Outflow"}
          </p>
          <p className={cn("text-2xl font-bold tabular-nums", color.text)}>
            {tx.direction === "inflow" ? "+" : "-"}{formatINR(tx.amount)}
          </p>
        </div>

        {/* Details */}
        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          <DetailRow label="Transaction ID">{tx.id}</DetailRow>
          <DetailRow label="Reference Module">{tx.module}</DetailRow>
          <DetailRow label="Reference ID">
            <span className="font-mono text-[11px] rounded bg-muted px-1.5 py-0.5">{tx.referenceId}</span>
          </DetailRow>
          <DetailRow label="Created By">{tx.createdBy}</DetailRow>
          <DetailRow label="Created At">
            {new Date(tx.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </DetailRow>
          <DetailRow label="Payment Mode">{tx.paymentMode}</DetailRow>
          <DetailRow label="Cash / Bank">
            <Badge tone={tx.cashOrBank === "Cash" ? "success" : "info"} className="text-[9px]">{tx.cashOrBank}</Badge>
          </DetailRow>
          <DetailRow label="Category">{tx.category}</DetailRow>
          <DetailRow label="Employee">{tx.employee}</DetailRow>
          <DetailRow label="Description">{tx.description}</DetailRow>
          {tx.linkedExpenseId && <DetailRow label="Linked Expense">{tx.linkedExpenseId}</DetailRow>}
          {tx.linkedInvoiceId && <DetailRow label="Linked Invoice">{tx.linkedInvoiceId}</DetailRow>}
          {tx.linkedTicketId && <DetailRow label="Linked Ticket">{tx.linkedTicketId}</DetailRow>}
        </div>

        {/* Audit History */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Audit History
          </h3>
          <div className="space-y-2">
            {tx.auditHistory.map((audit, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4361EE]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium">{audit.action}</p>
                  <p className="text-[10px] text-muted-foreground">
                    by {audit.by} · {new Date(audit.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  {audit.details && <p className="text-[10px] text-muted-foreground mt-0.5">{audit.details}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/* ─── Summary Card ───────────────────────────────────────────────── */

function SummaryCard({ label, value, icon, highlight, bold }: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: "green" | "red";
  bold?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-3 shadow-card",
      highlight === "green" && "border-emerald-100 bg-emerald-50/30",
      highlight === "red" && "border-rose-100 bg-rose-50/30",
    )}>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={cn(
        "mt-1 text-[14px] tabular-nums",
        bold ? "font-bold" : "font-semibold",
        highlight === "green" && "text-emerald-700",
        highlight === "red" && "text-rose-700",
      )}>
        {value}
      </p>
    </div>
  );
}

/* ─── Filter Chip ────────────────────────────────────────────────── */

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
        active ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200"
      )}
    >
      {children}
    </button>
  );
}
