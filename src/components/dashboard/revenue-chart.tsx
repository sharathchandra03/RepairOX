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
    <div className="rounded-xl bg-zinc-900 px-4 py-3 text-white shadow-2xl pointer-events-none border border-zinc-700/50">
      <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">{label}</p>
      <p className="text-base font-bold tnum">{formatINR(payload[0].value * 1000)}</p>
    </div>
  );
}

export function RevenueChart({ darkTooltip = false }: { darkTooltip?: boolean }) {
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const data = revenueMonthly.map((d) => ({ ...d, v: view === "monthly" ? d.v : d.v * 12 }));

  return (
    <div className="rounded-2xl bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Revenue · {view === "monthly" ? "this month" : "this year"}
          </p>
          <p className="font-display mt-1.5 text-2xl font-extrabold tracking-tight tnum">
            {formatINR(view === "monthly" ? 250000 : 250000 * 12)}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
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
        transition={{ duration: 0.5 }}
        className="mt-5 h-[200px] w-full"
      >
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
              formatter={darkTooltip ? undefined : (v: number) => [formatINR(v * 1000), "Revenue"]}
            />
            <Bar dataKey="v" radius={[8, 8, 4, 4]}>
              {data.map((_, i) => (
                <Cell key={i} fill="url(#bar-brand-v2)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
