"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./kpi-card";

export function TicketsDonut() {
  const data = [
    { name: "In Progress", value: 200, color: "#FBBF24" },
    { name: "Repaired",    value: 1500, color: "#22C55E" },
    { name: "Returned",    value: 300, color: "#F43F5E" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Total Tickets</p>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          live
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[160px_1fr] items-center gap-4">
        <div className="relative h-[160px] w-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={56} outerRadius={76} paddingAngle={4} stroke="none">
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <div className="text-center">
              <p className="font-display text-2xl font-extrabold tracking-tight tnum">
                <AnimatedNumber value={total} />
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</p>
            </div>
          </motion.div>
        </div>

        <ul className="space-y-2 text-sm">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <span className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                {d.name}
              </span>
              <span className="font-semibold tnum">{d.value.toLocaleString("en-IN")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
