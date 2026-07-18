"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./kpi-card";

export function TicketsDonut() {
  const data = [
    { name: "In Progress",          value: 200,  color: "#4361EE" },
    { name: "Repaired",             value: 1500, color: "#22C55E" },
    { name: "Returned",             value: 300,  color: "#B3BFF6" },
    { name: "Waiting for Approval", value: 85,   color: "#F59E0B" },
    { name: "Waiting for Parts",    value: 120,  color: "#EF4444" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

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
