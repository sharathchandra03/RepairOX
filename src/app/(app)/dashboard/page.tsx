"use client";

import { motion } from "framer-motion";
import {
  Plus, Filter, Download, Wand2, ArrowRight, AlertCircle, AlertTriangle, CheckCircle2, ListChecks,
} from "lucide-react";
import Link from "next/link";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TicketsDonut } from "@/components/dashboard/donut";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { useState } from "react";
import { ordersStatus, todos, tickets, STATUS_LABEL, STATUS_TONE } from "@/lib/mock-data";
import { formatINR } from "@/lib/utils";

const RANGES = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "lastMonth" },
  { label: "This Year", value: "year" },
];

export default function Dashboard() {
  const [range, setRange] = useState("today");

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Welcome back</p>
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display mt-1 text-3xl font-extrabold tracking-tight md:text-4xl"
          >
            Hello, <span className="brand-gradient-text">Shop Owner</span>
          </motion.h1>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening across your shop today.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs options={RANGES} value={range} onChange={setRange} size="sm" />
          <Link href="/tickets/new">
            <Button size="md" className="rounded-full">
              <Plus className="h-4 w-4" /> New Ticket
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Business Revenue"
          value={15000}
          format={formatINR}
          tone="emerald"
          delta={{ value: "+12.4%", up: true }}
          hint="Avg/day ₹10,000 · Month prediction ₹3,00,000"
        />
        <KpiCard
          title="Stock"
          value={200000}
          format={formatINR}
          tone="amber"
          delta={{ value: "+1.8%", up: true }}
          hint="Spare parts: ₹1,50,000 · Accessories: ₹50,000"
        />
        <KpiCard
          title="Due"
          value={10000}
          format={formatINR}
          tone="rose"
          delta={{ value: "−2.1%", up: false }}
          hint="From 6 customers · 2 overdue"
        />
        <KpiCard
          title="Tickets Today"
          value={28}
          tone="violet"
          delta={{ value: "+9", up: true }}
          hint="6 walk-in · 12 pickup · 10 on-site"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>

        {/* Orders status */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Orders Status</p>
            <Badge tone="info" dot>real-time</Badge>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-3 bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div>Order Detail</div>
              <div className="text-center">Assigned</div>
              <div className="text-center">Received</div>
            </div>
            <ul>
              {ordersStatus.map((row, i) => (
                <motion.li
                  key={row.detail}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="grid grid-cols-3 items-center px-3 py-2.5 text-sm odd:bg-background even:bg-muted/40"
                >
                  <div className="font-medium">{row.detail}</div>
                  <div className="text-center tabular-nums">{row.assigned}</div>
                  <div className="text-center tabular-nums">{row.received}</div>
                </motion.li>
              ))}
              <li className="grid grid-cols-3 items-center bg-brand-50/40 px-3 py-2.5 text-sm font-semibold">
                <div>Total</div>
                <div className="text-center tabular-nums">6</div>
                <div className="text-center tabular-nums">6</div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Donut + To-Do (paired row) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <TicketsDonut />
        </div>

        {/* To-Do list */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Today&apos;s Focus</p>
                <h3 className="font-display mt-0.5 text-lg font-bold flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-brand-600" /> To-Do List
                </h3>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {todos.map((t, i) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3 transition hover:bg-muted/40"
                >
                  <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-inset ${
                    t.flag === "danger" ? "bg-rose-100 text-rose-600 ring-rose-200" :
                    t.flag === "warn" ? "bg-amber-100 text-amber-700 ring-amber-200" :
                    "bg-sky-100 text-sky-700 ring-sky-200"
                  }`}>
                    {t.flag === "danger" ? <AlertCircle className="h-3 w-3" /> :
                     t.flag === "warn" ? <AlertTriangle className="h-3 w-3" /> :
                     <CheckCircle2 className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                </motion.li>
              ))}
            </ul>

            {/* AI assistant CTA */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-brand-300 bg-brand-50/60 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white">
                  <Wand2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Auto-prioritise tasks</p>
                  <p className="text-[11px] text-muted-foreground">Let RepairOX rank your day</p>
                </div>
              </div>
              <Button size="sm" variant="soft">Run</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Critical tasks - full width */}
      <div className="rounded-2xl border border-border bg-card shadow-card">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Critical Tasks</p>
            <h3 className="font-display mt-0.5 text-lg font-bold">High-priority tickets to resolve today</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-3.5 w-3.5" /> Filter</Button>
            <Button variant="primary" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-[110px] px-5 py-2.5">Date</th>
                <th className="w-[90px] py-2.5">Ticket</th>
                <th className="py-2.5">Customer</th>
                <th className="py-2.5">Device</th>
                <th className="w-[140px] py-2.5">Status</th>
                <th className="w-[120px] py-2.5 pr-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {tickets.slice(0, 5).map((t, i) => (
                <motion.tr
                  key={t.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="group border-t border-border transition hover:bg-muted/40"
                >
                  <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{t.createdAt}</td>
                  <td className="py-3 whitespace-nowrap font-medium">{t.id}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={t.customer} size={28} />
                      <span className="whitespace-nowrap">{t.customer}</span>
                    </div>
                  </td>
                  <td className="py-3 whitespace-nowrap text-muted-foreground">{t.model}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${STATUS_TONE[t.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="py-3 pr-5 text-right font-semibold tnum whitespace-nowrap">{formatINR(t.amount)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Showing 5 of {tickets.length} active</p>
          <Link href="/tickets" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            View all tickets <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
