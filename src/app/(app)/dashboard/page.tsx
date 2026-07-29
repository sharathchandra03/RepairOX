  "use client";

import { motion } from "framer-motion";
import {
  Plus, Filter, Download, ArrowRight, MoreHorizontal, ArrowDownToLine,
  ArrowUpDown, SlidersHorizontal, CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TicketsDonut } from "@/components/dashboard/donut";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { Can } from "@/components/common/can";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { useState, useMemo } from "react";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { formatINR, cn } from "@/lib/utils";
import { useActivityLog, type ActivityEntry } from "@/lib/activity-log";
import { ActivityTimeline, ActivityDetailDrawer } from "@/components/activity/activity-log-ui";

/* ── Device breakdown — computed from store data in component ── */

/* ── Transaction feed data — derived from store in component ── */

/* ── Card header with ... menu ── */
function CardHeader({ title, badge }: { title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex items-center gap-1.5">
        {badge}
        <button className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] transition">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount_high" | "amount_low">("newest");
  const [filterBy, setFilterBy] = useState<"all" | "received" | "repairing" | "completed" | "delivered">("all");
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "7days" | "30days" | "all">("all");
  const { tickets, orders: ordersStatus } = useStore();
  const activities = useActivityLog();
  const [selectedActivity, setSelectedActivity] = useState<ActivityEntry | null>(null);

  // Apply filters to tickets
  const filteredTickets = useMemo(() => {
    let list = tickets;
    // Filter by status
    if (filterBy !== "all") list = list.filter((t) => t.status === filterBy);
    // Filter by date
    if (dateRange !== "all") {
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const ts = todayStart.getTime();
      list = list.filter((t) => {
        const created = new Date(t.createdAt).getTime();
        switch (dateRange) {
          case "today": return created >= ts;
          case "yesterday": return created >= ts - 86_400_000 && created < ts;
          case "7days": return created >= ts - 7 * 86_400_000;
          case "30days": return created >= ts - 30 * 86_400_000;
          default: return true;
        }
      });
    }
    // Sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "amount_high": return b.amount - a.amount;
        case "amount_low": return a.amount - b.amount;
        default: return 0;
      }
    });
    return list;
  }, [tickets, filterBy, dateRange, sortBy]);

  // Compute live KPIs from filtered data
  const totalRevenue = useMemo(() => filteredTickets.reduce((s, t) => s + (t.amount || 0), 0), [filteredTickets]);
  const ticketsToday = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    return filteredTickets.filter((t) => new Date(t.createdAt).getTime() >= todayStart.getTime()).length;
  }, [filteredTickets]);
  const duesOutstanding = useMemo(() => {
    return filteredTickets.filter((t) => t.status !== "delivered" && t.status !== "completed").reduce((s, t) => s + (t.amount || 0), 0);
  }, [filteredTickets]);

  // Compute device breakdown from actual ticket data
  const deviceData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTickets.forEach((t) => { const d = t.device || "Others"; counts[d] = (counts[d] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const maxCount = sorted[0]?.[1] || 1;
    return sorted.slice(0, 6).map(([device, count]) => ({ device, count, highlight: count === maxCount }));
  }, [filteredTickets]);

  return (
    <div className="relative space-y-6">
      {/* Ambient background wash — subtle, matches RepairOX blue */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-[#EEF1FD]/60 via-[#EEF1FD]/15 to-transparent" />

      <PageHeader
        title="Analytics Overview"
        actions={
          <Can permission="manage_repair_jobs">
            <Link href="/tickets/new">
              <Button size="sm" className="rounded-full gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add New
              </Button>
            </Link>
          </Can>
        }
      />

      {/* Functional filter bar */}
      <div className="flex flex-wrap items-center gap-2 -mt-3">
        {/* Sort By */}
        <Dropdown align="left" width="w-44" trigger={({ toggle }) => (
          <button onClick={toggle} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-[#EEF1FD] hover:text-[#4361EE] hover:border-[#B3BFF6]/50 transition">
            <ArrowUpDown className="h-3.5 w-3.5" /> Sort By
          </button>
        )}>
          {(close) => (<>
            <MenuItem onClick={() => { setSortBy("newest"); close(); }} className={cn(sortBy === "newest" && "bg-muted font-semibold")}>Newest First</MenuItem>
            <MenuItem onClick={() => { setSortBy("oldest"); close(); }} className={cn(sortBy === "oldest" && "bg-muted font-semibold")}>Oldest First</MenuItem>
            <MenuItem onClick={() => { setSortBy("amount_high"); close(); }} className={cn(sortBy === "amount_high" && "bg-muted font-semibold")}>Amount High → Low</MenuItem>
            <MenuItem onClick={() => { setSortBy("amount_low"); close(); }} className={cn(sortBy === "amount_low" && "bg-muted font-semibold")}>Amount Low → High</MenuItem>
          </>)}
        </Dropdown>

        {/* Filter By */}
        <Dropdown align="left" width="w-44" trigger={({ toggle }) => (
          <button onClick={toggle} className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[12px] font-medium transition", filterBy !== "all" ? "border-[#4361EE] text-[#4361EE] bg-indigo-50" : "border-border text-zinc-600 hover:bg-[#EEF1FD] hover:text-[#4361EE] hover:border-[#B3BFF6]/50")}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filter By {filterBy !== "all" && <span className="h-1.5 w-1.5 rounded-full bg-[#4361EE]" />}
          </button>
        )}>
          {(close) => (<>
            <MenuItem onClick={() => { setFilterBy("all"); close(); }} className={cn(filterBy === "all" && "bg-muted font-semibold")}>All Tickets</MenuItem>
            <MenuItem onClick={() => { setFilterBy("received"); close(); }} className={cn(filterBy === "received" && "bg-muted font-semibold")}>Received</MenuItem>
            <MenuItem onClick={() => { setFilterBy("repairing"); close(); }} className={cn(filterBy === "repairing" && "bg-muted font-semibold")}>Repairing</MenuItem>
            <MenuItem onClick={() => { setFilterBy("completed"); close(); }} className={cn(filterBy === "completed" && "bg-muted font-semibold")}>Completed</MenuItem>
            <MenuItem onClick={() => { setFilterBy("delivered"); close(); }} className={cn(filterBy === "delivered" && "bg-muted font-semibold")}>Delivered</MenuItem>
          </>)}
        </Dropdown>

        {/* Date */}
        <Dropdown align="left" width="w-40" trigger={({ toggle }) => (
          <button onClick={toggle} className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[12px] font-medium transition", dateRange !== "all" ? "border-[#4361EE] text-[#4361EE] bg-indigo-50" : "border-border text-zinc-600 hover:bg-[#EEF1FD] hover:text-[#4361EE] hover:border-[#B3BFF6]/50")}>
            <CalendarDays className="h-3.5 w-3.5" /> {dateRange === "all" ? "All Time" : dateRange === "today" ? "Today" : dateRange === "yesterday" ? "Yesterday" : dateRange === "7days" ? "Last 7 Days" : "Last 30 Days"}
          </button>
        )}>
          {(close) => (<>
            <MenuItem onClick={() => { setDateRange("all"); close(); }} className={cn(dateRange === "all" && "bg-muted font-semibold")}>All Time</MenuItem>
            <MenuItem onClick={() => { setDateRange("today"); close(); }} className={cn(dateRange === "today" && "bg-muted font-semibold")}>Today</MenuItem>
            <MenuItem onClick={() => { setDateRange("yesterday"); close(); }} className={cn(dateRange === "yesterday" && "bg-muted font-semibold")}>Yesterday</MenuItem>
            <MenuItem onClick={() => { setDateRange("7days"); close(); }} className={cn(dateRange === "7days" && "bg-muted font-semibold")}>Last 7 Days</MenuItem>
            <MenuItem onClick={() => { setDateRange("30days"); close(); }} className={cn(dateRange === "30days" && "bg-muted font-semibold")}>Last 30 Days</MenuItem>
          </>)}
        </Dropdown>

        <span className="ml-auto text-[11px] text-muted-foreground">{filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""}</span>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Business Revenue"
          value={totalRevenue}
          format={formatINR}
          tone="emerald"
          delta={{ value: "+12.4%", up: true }}
          hint={`${tickets.length} total tickets`}
          progress={{ value: Math.min(100, Math.round((totalRevenue / 300000) * 100)), label: "Monthly target" }}
        />
        <KpiCard
          title="Stock Value"
          value={200000}
          format={formatINR}
          tone="amber"
          delta={{ value: "+1.8%", up: true }}
          hint="Spare parts: ₹1,50,000 · Accessories: ₹50,000"
          progress={{ value: 75, label: "Inventory capacity" }}
        />
        <KpiCard
          title="Dues Outstanding"
          value={duesOutstanding}
          format={formatINR}
          tone="rose"
          delta={{ value: "−2.1%", up: false }}
          hint={`From ${tickets.filter((t) => t.status !== "delivered" && t.status !== "completed").length} active tickets`}
          progress={{ value: totalRevenue > 0 ? Math.round(((totalRevenue - duesOutstanding) / totalRevenue) * 100) : 0, label: "Collection progress" }}
        />
        <KpiCard
          title="Tickets Today"
          value={ticketsToday}
          tone="violet"
          delta={{ value: "+9 vs yesterday", up: true }}
          hint="6 walk-in · 12 pickup · 10 on-site"
          progress={{ value: ticketsToday > 0 ? Math.min(100, Math.round((ticketsToday / 30) * 100)) : 0, label: "Daily target" }}
        />
      </div>

      {/* Resizable dashboard widgets — drag edges to resize, drag title to reorder */}
      <DashboardGrid keys={["revenue", "donut", "devices", "transactions"]}>
        {/* Revenue Chart */}
        <div className="h-full rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="drag-handle h-4 cursor-grab active:cursor-grabbing" />
          <div className="px-1 pb-1 h-[calc(100%-16px)]">
            <RevenueChart darkTooltip />
          </div>
        </div>

        {/* Tickets Donut */}
        <div className="h-full rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="drag-handle h-4 cursor-grab active:cursor-grabbing" />
          <div className="px-1 pb-1 h-[calc(100%-16px)]">
            <TicketsDonut />
          </div>
        </div>

        {/* Tickets by Device */}
        <div className="h-full rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] overflow-auto">
          <div className="drag-handle h-3 cursor-grab active:cursor-grabbing" />
          <CardHeader title="Tickets by Device" badge={
            <span className="text-[11px] text-muted-foreground">Last 7 days</span>
          } />
          <p className="text-[11px] text-muted-foreground mb-4">{deviceData.reduce((s,d)=>s+d.count,0)} total tickets</p>
          <div className="space-y-2.5">
            {deviceData.map((d) => (
              <div key={d.device} className="flex items-center gap-3">
                <span className="w-[56px] shrink-0 text-[12px] text-muted-foreground text-right">{d.device}</span>
                <div className="flex-1 h-6 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.count / Math.max(...deviceData.map(x => x.count), 1)) * 100}%` }}
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className={`h-full rounded-full ${d.highlight ? "bg-orange-400" : "bg-[#4361EE]"}`}
                  />
                </div>
                <span className="w-[24px] shrink-0 text-[12px] font-semibold tnum text-right">{d.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-400" /> {deviceData[0]?.device || "N/A"} flagged as highest volume
          </p>
        </div>

        {/* Transactions */}
        <div className="h-full rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] flex flex-col overflow-auto">
          <div className="drag-handle h-3 cursor-grab active:cursor-grabbing" />
          <CardHeader title="Recent Transactions" />
          <div className="flex-1 mt-2 space-y-0 overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Recent</p>
            <ul className="space-y-1">
              {filteredTickets.slice(0, 6).map((tx, i) => (
                <motion.li
                  key={tx.id}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#EEF1FD]/50 transition"
                >
                  <Avatar name={tx.customer} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight">{tx.customer}</p>
                    <p className="text-[11px] text-muted-foreground">{tx.model}</p>
                  </div>
                  <span className="text-[13px] font-bold text-[#4361EE] tnum whitespace-nowrap">
                    {formatINR(tx.amount)}
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
          <div className="mt-2 border-t border-border pt-3 flex items-center justify-between">
            <Can permission={["manage_reports", "export_reports"]}>
              <button className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4361EE] hover:underline">
                <ArrowDownToLine className="h-3.5 w-3.5" /> Download Report
              </button>
            </Can>
            <Link href="/reports" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </DashboardGrid>

      {/* Critical tasks table — full width */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Critical Tasks</p>
            <h3 className="font-display mt-0.5 text-base font-bold">Critical & high-priority tickets to resolve</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
              <Filter className="h-3.5 w-3.5" /> Filter
            </Button>
            <Can permission="export_reports">
              <Button variant="primary" size="sm" className="gap-1.5 rounded-full">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </Can>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#EEF1FD]">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">
                <th className="w-[90px] px-5 py-2.5">Ticket</th>
                <th className="py-2.5">Customer</th>
                <th className="py-2.5">Device</th>
                <th className="py-2.5 w-[80px]">Priority</th>
                <th className="w-[140px] py-2.5">Status</th>
                <th className="w-[100px] py-2.5">Waiting</th>
                <th className="w-[100px] py-2.5 pr-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.filter((t) => (t.priority === "critical" || t.priority === "high") && t.status !== "completed" && t.status !== "delivered").sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(0, 5).map((t, i) => (
                <motion.tr
                  key={t.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="group border-t border-border transition hover:bg-[#EEF1FD]/50"
                >
                  <td className="px-5 py-3 whitespace-nowrap font-medium">{t.id}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={t.customer} size={28} />
                      <span className="whitespace-nowrap">{t.customer}</span>
                    </div>
                  </td>
                  <td className="py-3 whitespace-nowrap text-muted-foreground">{t.model}</td>
                  <td className="py-3">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", t.priority === "critical" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200")}>
                      {t.priority === "critical" ? "Critical" : "High"}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${STATUS_TONE[t.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="py-3 text-[12px] text-muted-foreground whitespace-nowrap">{(() => { const mins = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 60000); if (mins < 60) return `${mins}m`; if (mins < 1440) return `${Math.floor(mins/60)}h ${mins%60}m`; return `${Math.floor(mins/1440)}d`; })()}</td>
                  <td className="py-3 pr-5 text-right font-semibold tnum whitespace-nowrap">{formatINR(t.amount)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Showing {Math.min(5, filteredTickets.filter((t) => (t.priority === "critical" || t.priority === "high") && t.status !== "completed" && t.status !== "delivered").length)} critical/high priority</p>
          <Link href="/tickets" className="inline-flex items-center gap-1 text-sm font-semibold text-[#4361EE] hover:underline">
            View all tickets <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Recent Activity — centralized audit trail (latest entries only) */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between gap-3 p-5 sm:px-6">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</p>
            <h3 className="font-display mt-0.5 text-base font-bold">Audit trail across every module</h3>
          </div>
          <Link href="/activity" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
            View all activities <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="max-h-[420px] overflow-auto px-3 pb-3 sm:px-4">
          <ActivityTimeline entries={activities.slice(0, 15)} onSelect={setSelectedActivity} />
        </div>
      </div>
      <ActivityDetailDrawer entry={selectedActivity} onClose={() => setSelectedActivity(null)} />

      {/* Row 4: Orders status + To-Do */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

        {/* Orders status */}
        <div className="lg:col-span-2 rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] sm:p-6">
          <CardHeader title="Orders Status" badge={<Badge tone="info" dot>live</Badge>} />
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-3 bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div>Type</div>
              <div className="text-center">Assigned</div>
              <div className="text-center">Received</div>
            </div>
            <ul>
              {ordersStatus.map((row, i) => (
                <motion.li
                  key={row.detail}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="grid grid-cols-3 items-center px-3 py-2.5 text-sm odd:bg-background even:bg-muted/40"
                >
                  <div className="font-medium">{row.detail}</div>
                  <div className="text-center tabular-nums">{row.assigned}</div>
                  <div className="text-center tabular-nums">{row.received}</div>
                </motion.li>
              ))}
              <li className="grid grid-cols-3 items-center bg-[#EEF1FD] px-3 py-2.5 text-sm font-semibold">
                <div>Total</div>
                <div className="text-center tabular-nums">6</div>
                <div className="text-center tabular-nums">6</div>
              </li>
            </ul>
          </div>
        </div>

        {/* To-Do list — sticky pad design */}
        <div className="lg:col-span-3">
          <TodoWidget />
        </div>
      </div>
    </div>
  );
}
