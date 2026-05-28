"use client";

import { useState } from "react";
import {
  Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";
import { motion } from "framer-motion";
import { SegmentedTabs } from "@/components/ui/tabs";
import { revenueMonthly } from "@/lib/mock-data";
import { formatINR } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-zinc-900 px-3.5 py-2.5 text-white shadow-xl pointer-events-none">
      <p className="text-[11px] text-zinc-400 mb-0.5">{label}</p>
      <p className="text-sm font-bold">{formatINR(payload[0].value * 1000)}</p>
    </div>
  );
}

export function RevenueChart({ darkTooltip = false }: { darkTooltip?: boolean }) {
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const data = revenueMonthly.map((d) => ({ ...d, v: view === "monthly" ? d.v : d.v * 12 }));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Revenue · {view === "monthly" ? "this month" : "this year"}
          </p>
          <p className="font-display mt-2 text-3xl font-extrabold tracking-tight tnum">
            {formatINR(view === "monthly" ? 250000 : 250000 * 12)}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>+2.25% vs last week</span>
          </p>
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
        transition={{ duration: 0.4 }}
        className="mt-4 h-[260px] w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={20} barGap={6} margin={{ top: 10, right: 0, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="bar-brand" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#4361EE" stopOpacity="1" />
                <stop offset="100%" stopColor="#3B54E8" stopOpacity="0.88" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={42} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted)/0.4)", radius: 8 }}
              content={darkTooltip ? <DarkTooltip /> : undefined}
              contentStyle={darkTooltip ? undefined : {
                background: "#fff",
                border: "1px solid hsl(var(--border))",
                borderRadius: 14,
                fontSize: 12,
                boxShadow: "0 8px 24px -8px rgba(20,30,80,0.14)",
              }}
              formatter={darkTooltip ? undefined : (v: number) => [formatINR(v * 1000), "Revenue"]}
            />
            <Bar dataKey="v" radius={[10, 10, 5, 5]}>
              {data.map((_, i) => (
                <Cell key={i} fill="url(#bar-brand)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
