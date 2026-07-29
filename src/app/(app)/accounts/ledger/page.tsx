"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  CalendarDays, ArrowDownLeft, ArrowUpRight, Landmark,
  Wallet, TrendingUp, Lock, Unlock, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { cn, formatINR } from "@/lib/utils";
import { useDailyLedger, type DailySummary } from "@/lib/daily-ledger-service";

export default function LedgerDashboard() {
  const { getAllDailySummaries } = useDailyLedger();
  const router = useRouter();
  const summaries = getAllDailySummaries();

  // Aggregate KPIs
  const todaySummary = summaries[0];
  const totalCashPosition = todaySummary?.closingCash ?? 0;
  const totalBankPosition = todaySummary?.closingBank ?? 0;
  const totalNetPosition = totalCashPosition + totalBankPosition;
  const openDays = summaries.filter((s) => s.status === "open").length;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="hover:text-foreground cursor-pointer transition">Accounts</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Daily Ledger</span>
      </nav>

      <PageHeader
        eyebrow="Accounts"
        title="Daily Ledger"
        subtitle="Each day is a financial session. Track opening & closing balances, cash & bank flows, and close days when balanced."
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Cash Position"
          value={formatINR(totalCashPosition)}
          icon={<Wallet className="h-4 w-4 text-emerald-500" />}
        />
        <KpiCard
          label="Bank Position"
          value={formatINR(totalBankPosition)}
          icon={<Landmark className="h-4 w-4 text-blue-500" />}
        />
        <KpiCard
          label="Net Position"
          value={formatINR(totalNetPosition)}
          icon={<TrendingUp className="h-4 w-4 text-[#4361EE]" />}
        />
        <KpiCard
          label="Open Days"
          value={String(openDays)}
          icon={<Unlock className="h-4 w-4 text-amber-500" />}
        />
      </div>

      {/* Daily Sessions Table */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        {/* Table header */}
        <div className="hidden lg:grid lg:grid-cols-[100px_90px_90px_80px_80px_80px_80px_90px_90px_90px_60px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Date</div>
          <div className="text-right">Open Cash</div>
          <div className="text-right">Open Bank</div>
          <div className="text-right">Cash In</div>
          <div className="text-right">Cash Out</div>
          <div className="text-right">Bank In</div>
          <div className="text-right">Bank Out</div>
          <div className="text-right">Close Cash</div>
          <div className="text-right">Close Bank</div>
          <div className="text-right">Net</div>
          <div className="text-center">Status</div>
        </div>

        {/* Table body */}
        <div className="divide-y divide-border">
          {summaries.length > 0 ? (
            summaries.map((day, idx) => (
              <DayRow key={day.date} day={day} index={idx} onClick={() => router.push(`/accounts/ledger/${day.date}`)} />
            ))
          ) : (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No daily sessions yet. Transactions will create sessions automatically.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Day Row ────────────────────────────────────────────────────── */

function DayRow({ day, index, onClick }: { day: DailySummary; index: number; onClick: () => void }) {
  const dateObj = new Date(day.date + "T00:00:00");
  const isToday = day.date === new Date().toISOString().split("T")[0];
  const dateLabel = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const dayName = dateObj.toLocaleDateString("en-IN", { weekday: "short" });

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      onClick={onClick}
      className="w-full text-left px-5 py-3.5 hover:bg-[#EEF1FD]/40 transition-colors cursor-pointer group"
    >
      {/* Mobile layout */}
      <div className="lg:hidden space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{dateLabel}</span>
            <span className="text-[11px] text-muted-foreground">{dayName}</span>
            {isToday && <Badge tone="brand" className="text-[9px] px-1.5">Today</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={day.status === "open" ? "warning" : "success"} className="text-[9px] px-1.5">
              {day.status === "open" ? "Open" : "Closed"}
            </Badge>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[#4361EE] transition" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div><span className="text-muted-foreground">Net: </span><span className="font-semibold">{formatINR(day.netPosition)}</span></div>
          <div><span className="text-muted-foreground">Cash: </span><span className="font-semibold text-emerald-600">{formatINR(day.closingCash)}</span></div>
          <div><span className="text-muted-foreground">Bank: </span><span className="font-semibold text-blue-600">{formatINR(day.closingBank)}</span></div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden lg:grid lg:grid-cols-[100px_90px_90px_80px_80px_80px_80px_90px_90px_90px_60px] gap-2 items-center">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold tabular-nums">{dateLabel}</span>
            {isToday && <Badge tone="brand" className="text-[8px] px-1">Today</Badge>}
          </div>
          <span className="text-[10px] text-muted-foreground">{dayName}</span>
        </div>
        <div className="text-right text-[12px] tabular-nums">{formatINR(day.openingCash)}</div>
        <div className="text-right text-[12px] tabular-nums">{formatINR(day.openingBank)}</div>
        <div className="text-right text-[12px] tabular-nums font-medium text-emerald-600">
          {day.totalCashIn > 0 ? `+${formatINR(day.totalCashIn)}` : "—"}
        </div>
        <div className="text-right text-[12px] tabular-nums font-medium text-rose-600">
          {day.totalCashOut > 0 ? `-${formatINR(day.totalCashOut)}` : "—"}
        </div>
        <div className="text-right text-[12px] tabular-nums font-medium text-emerald-600">
          {day.totalBankIn > 0 ? `+${formatINR(day.totalBankIn)}` : "—"}
        </div>
        <div className="text-right text-[12px] tabular-nums font-medium text-rose-600">
          {day.totalBankOut > 0 ? `-${formatINR(day.totalBankOut)}` : "—"}
        </div>
        <div className="text-right text-[12px] font-bold tabular-nums">{formatINR(day.closingCash)}</div>
        <div className="text-right text-[12px] font-bold tabular-nums">{formatINR(day.closingBank)}</div>
        <div className="text-right text-[12px] font-bold tabular-nums text-[#4361EE]">{formatINR(day.netPosition)}</div>
        <div className="flex justify-center">
          {day.status === "open" ? (
            <Unlock className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <Lock className="h-3.5 w-3.5 text-emerald-500" />
          )}
        </div>
      </div>
    </motion.button>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────── */

function KpiCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
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
