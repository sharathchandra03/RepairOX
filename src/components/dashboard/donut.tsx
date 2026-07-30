"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { PieChart as PieChartIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { AnimatedNumber } from "./kpi-card";

const STATUS_COLORS: Record<string, string> = {
  received: "#4361EE",
  repairing: "#F59E0B",
  completed: "#22C55E",
  delivered: "#B3BFF6",
  "quality-check": "#8B5CF6",
  "waiting-parts": "#EF4444",
  cancelled: "#94A3B8",
};

const STATUS_DISPLAY: Record<string, string> = {
  received: "Received",
  repairing: "In Progress",
  completed: "Completed",
  delivered: "Delivered",
  "quality-check": "Quality Check",
  "waiting-parts": "Waiting for Parts",
  cancelled: "Cancelled",
};

export function TicketsDonut() {
  const { tickets } = useStore();

  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([status, value]) => ({
        name: STATUS_DISPLAY[status] || status,
        value,
        color: STATUS_COLORS[status] || "#94A3B8",
      }));
  }, [tickets]);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="rounded-2xl bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Tickets</p>
        </div>
        <div className="mt-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <PieChartIcon className="h-8 w-8 opacity-40" />
          <p className="text-[13px] font-medium">No data available</p>
          <p className="text-[11px]">No tickets found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Tickets</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live
        </span>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:grid sm:grid-cols-[150px_1fr] sm:items-center">
        {/* Chart */}
        <div className="relative h-[150px] w-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={52}
                outerRadius={70}
                paddingAngle={2}
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <div className="text-center">
              <p className="font-display text-[22px] font-extrabold tracking-tight tnum leading-none">
                <AnimatedNumber value={total} />
              </p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Total</p>
            </div>
          </motion.div>
        </div>

        {/* Legend */}
        <ul className="w-full space-y-1.5">
          {data.map((d, i) => (
            <motion.li
              key={d.name}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className="flex items-center justify-between rounded-lg bg-zinc-50/80 px-3 py-2 transition hover:bg-zinc-100/80"
            >
              <span className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm" style={{ background: d.color }} />
                <span className="text-[12px] font-medium text-zinc-700">{d.name}</span>
              </span>
              <span className="text-[12px] font-bold tnum text-zinc-900">{d.value.toLocaleString("en-IN")}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
