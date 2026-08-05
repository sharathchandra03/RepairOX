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
import { DraggableKpiRow, type KpiCardItem } from "@/components/dashboard/draggable-kpi-row";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { OrdersStatusWidget } from "@/components/dashboard/orders-status-widget";
import { DateRangePicker, type DateRange } from "@/components/dashboard/date-range-picker";
import { Button } from "@/components/ui/button";
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
import { useDashboardOrder } from "@/lib/use-dashboard-order";
import { useGridLayout } from "@/lib/use-widget-order";
import { useMonthlyTarget } from "@/lib/use-monthly-target";
import { usePermissions } from "@/lib/permissions-context";

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
  const [dateRange, setDateRange] = useState<"yesterday" | "this_month" | "last_month" | "this_year" | "custom">("this_month");
  const [customRange, setCustomRange] = useState<DateRange>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { tickets, invoices, inventory } = useStore();
  const activities = useActivityLog();
  const [selectedActivity, setSelectedActivity] = useState<ActivityEntry | null>(null);
  const { cardOrder, reorder: reorderKpi } = useDashboardOrder();
  const { savedLayouts, persistLayout } = useGridLayout();
  const { target: monthlyTarget, updateTarget: setMonthlyTarget } = useMonthlyTarget();
  const [showTargetEdit, setShowTargetEdit] = useState(false);
  const [editTargetValue, setEditTargetValue] = useState("");
  const { can } = usePermissions();
  const canEditTarget = can("edit_dashboard_targets");

  // Date range label helper
  const dateRangeLabel = useMemo(() => {
    switch (dateRange) {
      case "yesterday": return "Yesterday";
      case "this_month": return "This Month";
      case "last_month": return "Last Month";
      case "this_year": return "This Year";
      case "custom": {
        if (customRange.start && customRange.end) {
          const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          return `${fmt(customRange.start)} – ${fmt(customRange.end)}`;
        }
        return "Custom Range";
      }
      default: return "This Month";
    }
  }, [dateRange, customRange]);

  // Apply filters to tickets
  const filteredTickets = useMemo(() => {
    let list = tickets;
    // Filter by status
    if (filterBy !== "all") list = list.filter((t) => t.status === filterBy);
    // Filter by date
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const ts = todayStart.getTime();
    list = list.filter((t) => {
      const created = new Date(t.createdAt).getTime();
      switch (dateRange) {
        case "yesterday": return created >= ts - 86_400_000 && created < ts;
        case "this_month": {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          return created >= monthStart;
        }
        case "last_month": {
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
          const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          return created >= lastMonthStart && created < thisMonthStart;
        }
        case "this_year": {
          const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
          return created >= yearStart;
        }
        case "custom": {
          if (!customRange.start || !customRange.end) return true;
          const s = new Date(customRange.start); s.setHours(0,0,0,0);
          const e = new Date(customRange.end); e.setHours(23,59,59,999);
          return created >= s.getTime() && created <= e.getTime();
        }
        default: return true;
      }
    });
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
  }, [tickets, filterBy, dateRange, customRange, sortBy]);

  // Compute live KPIs from real data
  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => { const d = new Date(now); d.setHours(0,0,0,0); return d; }, [now]);

  // Date range boundaries for KPI calculations — derived from the active filter
  const { rangeStart, rangeEnd, rangeDays } = useMemo(() => {
    const n = new Date();
    const today = new Date(n); today.setHours(0, 0, 0, 0);
    let start: Date;
    let end: Date = new Date(n); // now
    let days: number;

    switch (dateRange) {
      case "yesterday": {
        start = new Date(today.getTime() - 86_400_000);
        end = new Date(today.getTime() - 1); // end of yesterday
        days = 1;
        break;
      }
      case "this_month": {
        start = new Date(n.getFullYear(), n.getMonth(), 1);
        days = Math.max(1, n.getDate());
        break;
      }
      case "last_month": {
        start = new Date(n.getFullYear(), n.getMonth() - 1, 1);
        end = new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59, 999);
        days = end.getDate();
        break;
      }
      case "this_year": {
        start = new Date(n.getFullYear(), 0, 1);
        days = Math.max(1, Math.ceil((n.getTime() - start.getTime()) / 86_400_000));
        break;
      }
      case "custom": {
        if (customRange.start && customRange.end) {
          start = new Date(customRange.start); start.setHours(0, 0, 0, 0);
          end = new Date(customRange.end); end.setHours(23, 59, 59, 999);
          days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
        } else {
          start = new Date(n.getFullYear(), n.getMonth(), 1);
          days = Math.max(1, n.getDate());
        }
        break;
      }
      default: {
        start = new Date(n.getFullYear(), n.getMonth(), 1);
        days = Math.max(1, n.getDate());
      }
    }
    return { rangeStart: start, rangeEnd: end, rangeDays: days };
  }, [dateRange, customRange]);

  // Filtered invoices by date range
  const filteredInvoices = useMemo(() => {
    return invoices.filter((i) => {
      const created = new Date(i.createdAt).getTime();
      return created >= rangeStart.getTime() && created <= rangeEnd.getTime();
    });
  }, [invoices, rangeStart, rangeEnd]);

  // Revenue from invoices within the selected range
  const revenueMetrics = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((s, i) => s + i.total, 0);
    const avgRevenue = Math.round(totalRevenue / rangeDays);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projection = avgRevenue * daysInMonth;
    return { totalRevenue, avgRevenue, projection };
  }, [filteredInvoices, rangeDays, now]);

  // Stock value from inventory (cost basis — point-in-time, not date-filtered)
  const stockValue = useMemo(() => {
    if (inventory.length === 0) return 0;
    return inventory.reduce((s, item) => s + (item.currentStock * (item.regularBuyingPrice || item.defaultPrice || 0)), 0);
  }, [inventory]);

  // Dues outstanding from invoices within the selected range
  const duesMetrics = useMemo(() => {
    const outstanding = filteredInvoices.filter((i) => {
      if (i.status === "paid" || i.status === "cancelled") return false;
      return i.total - i.paidAmount > 0;
    });
    const totalDues = outstanding.reduce((s, i) => s + (i.total - i.paidAmount), 0);
    const overdueInvoices = filteredInvoices.filter((i) => {
      if (i.status === "paid" || i.status === "cancelled") return false;
      if (i.total - i.paidAmount <= 0) return false;
      return i.dueDate && Date.now() > new Date(i.dueDate).getTime();
    });
    const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.total - i.paidAmount), 0);
    return { totalDues, overdueCount: overdueInvoices.length, overdueAmount, outstandingCount: outstanding.length };
  }, [filteredInvoices]);

  // Tickets within selected range
  const ticketMetrics = useMemo(() => {
    const rangeTickets = filteredTickets.length;
    const avgPerDay = Math.round((rangeTickets / rangeDays) * 10) / 10;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projection = Math.round(avgPerDay * daysInMonth);
    return { rangeTickets, avgPerDay, projection };
  }, [filteredTickets, rangeDays, now]);

  // KPI cards map — each card definition keyed by its stable ID
  const kpiCardsMap = useMemo<Record<string, KpiCardItem>>(() => ({
    total_revenue: {
      id: "total_revenue",
      node: (
        <KpiCard
          title="Total Revenue"
          value={revenueMetrics.totalRevenue}
          format={formatINR}
          tone="emerald"
          delta={{ value: `Avg ${formatINR(revenueMetrics.avgRevenue)}/day`, up: true }}
          hint={`${rangeDays} day${rangeDays !== 1 ? "s" : ""} · ${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? "s" : ""}`}
          progress={{ value: Math.min(100, Math.round((revenueMetrics.totalRevenue / Math.max(monthlyTarget, 1)) * 100)), label: "Monthly Target", targetValue: formatINR(monthlyTarget) }}
          onCardClick={canEditTarget ? () => { setEditTargetValue(monthlyTarget.toLocaleString("en-IN")); setShowTargetEdit(true); } : undefined}
        />
      ),
    },
    stock_value: {
      id: "stock_value",
      node: (
        <KpiCard
          title="Stock Value"
          value={stockValue}
          format={formatINR}
          tone="amber"
          delta={{ value: inventory.length > 0 ? `${inventory.length} item${inventory.length !== 1 ? "s" : ""}` : "No items", up: inventory.length > 0 }}
          hint={inventory.length > 0 ? `${inventory.filter((i) => i.currentStock <= i.minStock && i.active).length} low stock items` : "Add inventory items to track stock value"}
          progress={{ value: inventory.length > 0 ? Math.min(100, Math.round((inventory.filter((i) => i.currentStock > i.minStock).length / inventory.length) * 100)) : 0, label: "Healthy stock" }}
        />
      ),
    },
    dues_outstanding: {
      id: "dues_outstanding",
      node: (
        <KpiCard
          title="Dues Outstanding"
          value={duesMetrics.totalDues}
          format={formatINR}
          tone="rose"
          delta={{ value: `${duesMetrics.overdueCount} overdue`, up: false }}
          hint={`${duesMetrics.outstandingCount} unpaid invoice${duesMetrics.outstandingCount !== 1 ? "s" : ""} · Overdue: ${formatINR(duesMetrics.overdueAmount)}`}
          progress={{ value: invoices.length > 0 ? Math.round(((invoices.reduce((s, i) => s + i.paidAmount, 0)) / Math.max(invoices.reduce((s, i) => s + i.total, 0), 1)) * 100) : 0, label: "Collection progress" }}
        />
      ),
    },
    tickets_today: {
      id: "tickets_today",
      node: (
        <KpiCard
          title="Tickets"
          value={ticketMetrics.rangeTickets}
          tone="violet"
          delta={{ value: `Avg ${ticketMetrics.avgPerDay}/day`, up: true }}
          hint={`Projection: ${ticketMetrics.projection} tickets this month`}
          progress={{ value: ticketMetrics.rangeTickets > 0 ? Math.min(100, Math.round((ticketMetrics.rangeTickets / Math.max(ticketMetrics.avgPerDay * rangeDays, 1)) * 100)) : 0, label: "vs avg" }}
        />
      ),
    },
  }), [revenueMetrics, stockValue, inventory, duesMetrics, invoices, ticketMetrics, monthlyTarget, canEditTarget, rangeDays, filteredInvoices]);

  // Ordered cards array based on saved user preference
  const orderedKpiCards = useMemo<KpiCardItem[]>(
    () => cardOrder.map((id) => kpiCardsMap[id]).filter(Boolean),
    [cardOrder, kpiCardsMap]
  );

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
        <Dropdown align="left" width="w-44" trigger={({ toggle }) => (
          <button onClick={toggle} className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[12px] font-medium transition", dateRange !== "this_month" ? "border-[#4361EE] text-[#4361EE] bg-indigo-50" : "border-border text-zinc-600 hover:bg-[#EEF1FD] hover:text-[#4361EE] hover:border-[#B3BFF6]/50")}>
            <CalendarDays className="h-3.5 w-3.5" /> {dateRangeLabel}
          </button>
        )}>
          {(close) => (<>
            <MenuItem onClick={() => { setDateRange("yesterday"); close(); }} className={cn(dateRange === "yesterday" && "bg-muted font-semibold")}>Yesterday</MenuItem>
            <MenuItem onClick={() => { setDateRange("this_month"); close(); }} className={cn(dateRange === "this_month" && "bg-muted font-semibold")}>This Month</MenuItem>
            <MenuItem onClick={() => { setDateRange("last_month"); close(); }} className={cn(dateRange === "last_month" && "bg-muted font-semibold")}>Last Month</MenuItem>
            <MenuItem onClick={() => { setDateRange("this_year"); close(); }} className={cn(dateRange === "this_year" && "bg-muted font-semibold")}>This Year</MenuItem>
            <MenuItem onClick={() => { setShowDatePicker(true); close(); }} className={cn(dateRange === "custom" && "bg-muted font-semibold")}>Custom Range</MenuItem>
          </>)}
        </Dropdown>

        {/* Quick date filter strip — right side */}
        <div className="ml-auto flex items-center gap-1.5">
          {([
            { label: "Yesterday", value: "yesterday" as const },
            { label: "This Month", value: "this_month" as const },
            { label: "Last Month", value: "last_month" as const },
            { label: "This Year", value: "this_year" as const },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium transition-all",
                dateRange === opt.value
                  ? "bg-[#4361EE] text-white shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Picker */}
      <DateRangePicker
        open={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onApply={(range) => { setCustomRange(range); setDateRange("custom"); }}
        initialRange={customRange}
      />

      {/* KPI Row — Draggable cards */}
      <DraggableKpiRow cards={orderedKpiCards} onReorder={reorderKpi} />

      {/* Main dashboard grid — all widgets are draggable and resizable */}
      <DashboardGrid
        keys={["revenue", "donut", "devices", "transactions", "todays_focus", "orders_status"]}
        savedLayouts={savedLayouts}
        onLayoutPersist={persistLayout}
      >
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
          <CardHeader title="Tickets by Device" badge={<span className="text-[11px] text-muted-foreground">Last 7 days</span>} />
          {deviceData.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-1 text-muted-foreground">
              <p className="text-[13px] font-medium">No data available</p>
              <p className="text-[11px]">No tickets found for this period</p>
            </div>
          ) : (<>
          <p className="text-[11px] text-muted-foreground mb-4">{deviceData.reduce((s,d)=>s+d.count,0)} total tickets</p>
          <div className="space-y-2.5">
            {deviceData.map((d) => (
              <div key={d.device} className="flex items-center gap-3">
                <span className="w-[56px] shrink-0 text-[12px] text-muted-foreground text-right">{d.device}</span>
                <div className="flex-1 h-6 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(d.count / Math.max(...deviceData.map(x => x.count), 1)) * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} className={`h-full rounded-full ${d.highlight ? "bg-orange-400" : "bg-[#4361EE]"}`} />
                </div>
                <span className="w-[24px] shrink-0 text-[12px] font-semibold tnum text-right">{d.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-400" /> {deviceData[0]?.device || "N/A"} flagged as highest volume</p>
          </>)}
        </div>

        {/* Transactions */}
        <div className="h-full rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] flex flex-col overflow-auto">
          <div className="drag-handle h-3 cursor-grab active:cursor-grabbing" />
          <CardHeader title="Recent Transactions" />
          {filteredTickets.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground"><p className="text-[13px] font-medium">No data available</p><p className="text-[11px]">No transactions found</p></div>
          ) : (
          <div className="flex-1 mt-2 space-y-0 overflow-auto min-h-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Recent</p>
            <ul className="space-y-1">
              {filteredTickets.slice(0, 20).map((tx, i) => (
                <motion.li key={tx.id} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#EEF1FD]/50 transition">
                  <Avatar name={tx.customer} size={30} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold leading-tight">{tx.customer}</p><p className="text-[11px] text-muted-foreground">{tx.model}</p></div>
                  <span className="text-[13px] font-bold text-[#4361EE] tnum whitespace-nowrap">{formatINR(tx.amount)}</span>
                </motion.li>
              ))}
            </ul>
          </div>
          )}
          <div className="mt-2 border-t border-border pt-3 flex items-center justify-between">
            <Can permission={["manage_reports", "export_reports"]}><button className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4361EE] hover:underline"><ArrowDownToLine className="h-3.5 w-3.5" /> Download Report</button></Can>
            <Link href="/reports" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">View All <ArrowRight className="h-3 w-3" /></Link>
          </div>
        </div>

        {/* Today's Focus */}
        <div className="h-full overflow-hidden flex flex-col">
          <div className="drag-handle h-4 cursor-grab active:cursor-grabbing" />
          <div className="flex-1 overflow-auto min-h-0"><TodoWidget /></div>
        </div>

        {/* Orders Status */}
        <div className="h-full overflow-hidden flex flex-col">
          <div className="drag-handle h-4 cursor-grab active:cursor-grabbing" />
          <div className="flex-1 overflow-auto"><OrdersStatusWidget /></div>
        </div>
      </DashboardGrid>

      {/* Critical tasks table — fixed position, not in grid */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Critical Tasks</p><h3 className="font-display mt-0.5 text-base font-bold">Critical & high-priority tickets to resolve</h3></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full"><Filter className="h-3.5 w-3.5" /> Filter</Button>
            <Can permission="export_reports"><Button variant="primary" size="sm" className="gap-1.5 rounded-full"><Download className="h-3.5 w-3.5" /> Export</Button></Can>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#EEF1FD]"><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70"><th className="w-[90px] px-5 py-2.5">Ticket</th><th className="py-2.5">Customer</th><th className="py-2.5">Device</th><th className="py-2.5 w-[80px]">Priority</th><th className="w-[140px] py-2.5">Status</th><th className="w-[100px] py-2.5">Waiting</th><th className="w-[100px] py-2.5 pr-5 text-right">Amount</th></tr></thead>
            <tbody>
              {filteredTickets.filter((t) => (t.priority === "critical" || t.priority === "high") && t.status !== "completed" && t.status !== "delivered").sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(0, 5).map((t, i) => (
                <motion.tr key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} className="group border-t border-border transition hover:bg-[#EEF1FD]/50">
                  <td className="px-5 py-3 whitespace-nowrap font-medium">{t.id}</td>
                  <td className="py-3"><div className="flex items-center gap-2"><Avatar name={t.customer} size={28} /><span className="whitespace-nowrap">{t.customer}</span></div></td>
                  <td className="py-3 whitespace-nowrap text-muted-foreground">{t.model}</td>
                  <td className="py-3"><span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", t.priority === "critical" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200")}>{t.priority === "critical" ? "Critical" : "High"}</span></td>
                  <td className="py-3"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${STATUS_TONE[t.status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABEL[t.status]}</span></td>
                  <td className="py-3 text-[12px] text-muted-foreground whitespace-nowrap">{(() => { const mins = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 60000); if (mins < 60) return `${mins}m`; if (mins < 1440) return `${Math.floor(mins/60)}h ${mins%60}m`; return `${Math.floor(mins/1440)}d`; })()}</td>
                  <td className="py-3 pr-5 text-right font-semibold tnum whitespace-nowrap">{formatINR(t.amount)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Showing {Math.min(5, filteredTickets.filter((t) => (t.priority === "critical" || t.priority === "high") && t.status !== "completed" && t.status !== "delivered").length)} critical/high priority</p>
          <Link href="/tickets" className="inline-flex items-center gap-1 text-sm font-semibold text-[#4361EE] hover:underline">View all tickets <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between gap-3 p-5 sm:px-6">
          <div><p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</p><h3 className="font-display mt-0.5 text-base font-bold">Audit trail across every module</h3></div>
          <Link href="/activity" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">View all activities <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="max-h-[420px] overflow-auto px-3 pb-3 sm:px-4"><ActivityTimeline entries={activities.slice(0, 15)} onSelect={setSelectedActivity} /></div>
      </div>
      <ActivityDetailDrawer entry={selectedActivity} onClose={() => setSelectedActivity(null)} />

      {/* Monthly Target Edit Modal */}
      {showTargetEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowTargetEdit(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold tracking-tight text-foreground">Set Monthly Target</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Enter your monthly revenue target. The progress bar will track your actual revenue against this goal.
            </p>
            <div className="mt-4 space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Target Amount (₹)</label>
              <input
                type="text"
                inputMode="numeric"
                value={editTargetValue}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  if (raw === "") { setEditTargetValue(""); return; }
                  const num = parseInt(raw, 10);
                  setEditTargetValue(num.toLocaleString("en-IN"));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = Number(editTargetValue.replace(/,/g, ""));
                    if (val > 0) { setMonthlyTarget(val); setShowTargetEdit(false); }
                  }
                }}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold tabular-nums outline-none ring-0 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20 transition"
                placeholder="e.g. 2,00,000"
                autoFocus
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowTargetEdit(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = Number(editTargetValue.replace(/,/g, ""));
                  if (val > 0) { setMonthlyTarget(val); setShowTargetEdit(false); }
                }}
                className="rounded-lg bg-[#4361EE] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3A56D4] shadow-sm transition"
              >
                Save Target
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
