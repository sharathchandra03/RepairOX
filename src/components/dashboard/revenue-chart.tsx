"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";
import { motion } from "framer-motion";
import { SegmentedTabs } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";
import { formatINR } from "@/lib/utils";
import { TrendingUp, BarChart3 } from "lucide-react";

function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-zinc-900 px-4 py-3 text-white shadow-2xl pointer-events-none border border-zinc-700/50">
      <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">{label}</p>
      <p className="text-base font-bold tnum">{formatINR(payload[0].value)}</p>
    </div>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function RevenueChart({ darkTooltip = false }: { darkTooltip?: boolean }) {
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const { invoices } = useStore();

  const now = useMemo(() => new Date(), []);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysElapsed = Math.max(1, now.getDate());

  // Monthly view: group invoices by day of the current month
  const monthlyData = useMemo(() => {
    const dailyTotals: Record<number, number> = {};
    invoices.forEach((inv) => {
      const d = new Date(inv.createdAt);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        const day = d.getDate();
        dailyTotals[day] = (dailyTotals[day] || 0) + inv.total;
      }
    });
    // Group into ~10 buckets for readability
    const bucketSize = Math.max(1, Math.ceil(daysInMonth / 10));
    const buckets: { m: string; v: number }[] = [];
    for (let start = 1; start <= daysInMonth; start += bucketSize) {
      const end = Math.min(start + bucketSize - 1, daysInMonth);
      let sum = 0;
      for (let d = start; d <= end; d++) sum += dailyTotals[d] || 0;
      buckets.push({ m: start === end ? `${start}` : `${start}-${end}`, v: sum });
    }
    return buckets;
  }, [invoices, currentMonth, currentYear, daysInMonth]);

  // Yearly view: group invoices by month of the current year
  const yearlyData = useMemo(() => {
    const monthlyTotals = new Array(12).fill(0);
    invoices.forEach((inv) => {
      const d = new Date(inv.createdAt);
      if (d.getFullYear() === currentYear) {
        monthlyTotals[d.getMonth()] += inv.total;
      }
    });
    return MONTH_LABELS.map((label, i) => ({ m: label, v: monthlyTotals[i] }));
  }, [invoices, currentYear]);

  const data = view === "monthly" ? monthlyData : yearlyData;

  // Compute totals from live data
  const totalRevenue = useMemo(() => {
    if (view === "monthly") {
      return invoices
        .filter((inv) => {
          const d = new Date(inv.createdAt);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((s, inv) => s + inv.total, 0);
    }
    return invoices
      .filter((inv) => new Date(inv.createdAt).getFullYear() === currentYear)
      .reduce((s, inv) => s + inv.total, 0);
  }, [invoices, view, currentMonth, currentYear]);

  // Compute delta percentage vs prior period
  const deltaLabel = useMemo(() => {
    if (view === "monthly") {
      const avgPerDay = daysElapsed > 0 ? totalRevenue / daysElapsed : 0;
      if (avgPerDay === 0) return null;
      return `Avg ${formatINR(Math.round(avgPerDay))}/day`;
    }
    // yearly: compare to last year
    const lastYearTotal = invoices
      .filter((inv) => new Date(inv.createdAt).getFullYear() === currentYear - 1)
      .reduce((s, inv) => s + inv.total, 0);
    if (lastYearTotal === 0 && totalRevenue === 0) return null;
    if (lastYearTotal === 0) return "New data";
    const pct = ((totalRevenue - lastYearTotal) / lastYearTotal) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs last year`;
  }, [invoices, view, totalRevenue, currentYear, daysElapsed]);

  const hasData = data.some((d) => d.v > 0);

  return (
    <div className="rounded-2xl bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Revenue · {view === "monthly" ? "this month" : "this year"}
          </p>
          <p className="font-display mt-1.5 text-2xl font-extrabold tracking-tight tnum">
            {formatINR(totalRevenue)}
          </p>
          {deltaLabel && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{deltaLabel}</span>
            </p>
          )}
        </div>
        <SegmentedTabs
          value={view}
          onChange={(v) => setView(v as any)}
          options={[
            { label: "Monthly", value: "monthly" },
            { label: "Yearly", value: "yearly" },
          ]}
          size="sm"
        />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mt-5 h-[200px] w-full"
      >
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={18} barGap={8} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="bar-brand-v2" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#4361EE" stopOpacity="1" />
                  <stop offset="100%" stopColor="#4361EE" stopOpacity="0.7" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(228 20% 92%)" strokeOpacity={0.8} />
              <XAxis
                dataKey="m"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "hsl(228 12% 55%)", fontWeight: 500 }}
                dy={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "hsl(228 12% 55%)" }}
                width={36}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                cursor={{ fill: "hsl(228 30% 95% / 0.6)", radius: 8 }}
                content={darkTooltip ? <DarkTooltip /> : undefined}
                contentStyle={darkTooltip ? undefined : {
                  background: "#fff",
                  border: "1px solid hsl(228 20% 90%)",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 8px 24px -8px rgba(20,30,80,0.12)",
                  padding: "8px 12px",
                }}
                formatter={darkTooltip ? undefined : (v: number) => [formatINR(v), "Revenue"]}
              />
              <Bar dataKey="v" radius={[8, 8, 4, 4]}>
                {data.map((_, i) => (
                  <Cell key={i} fill="url(#bar-brand-v2)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <BarChart3 className="h-8 w-8 opacity-40" />
            <p className="text-[13px] font-medium">No data available</p>
            <p className="text-[11px]">No invoice data for this period</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
