"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Report categories
   Curated, decision-oriented reports across every business area. Trends,
   leaderboards and breakdowns — all computed from the filtered dataset.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IndianRupee, Ticket, Users, Package, FileText, Receipt, UsersRound, Landmark,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Panel, DataTable, DownloadBtn, type Column } from "./report-ui";
import { BarChartView, LineChartView, AreaChartView, PieChartView, Leaderboard } from "./report-charts";
import { seriesByTime, groupBy } from "@/lib/reports/aggregations";
import { autoGranularity, inRange } from "@/lib/reports/date-ranges";
import { exportSingleCSV } from "@/lib/reports/export";
import { STATUS_LABEL, INVOICE_STATUS_LABEL } from "@/lib/mock-data";
import type { ReportDataset, DateRange, SeriesPoint } from "@/lib/reports/types";

type CategoryId = "revenue" | "tickets" | "customers" | "inventory" | "invoices" | "expenses" | "employees" | "financial";

const CATEGORIES: { id: CategoryId; label: string; icon: any }[] = [
  { id: "revenue", label: "Revenue", icon: IndianRupee },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "customers", label: "Customers", icon: Users },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "employees", label: "Employees", icon: UsersRound },
  { id: "financial", label: "Financial", icon: Landmark },
];

const LIVE = (s: string) => s !== "cancelled" && s !== "draft";

export function ReportCategories({ data, range }: { data: ReportDataset; range: DateRange }) {
  const [active, setActive] = useState<CategoryId>("revenue");

  return (
    <div className="grid gap-5 lg:grid-cols-[248px_1fr]">
      {/* Category nav — spacious, stays pinned in view while the report panel scrolls.
          Fixed to the available viewport height (not just its own content) so the
          panel background reaches the bottom of the page instead of stopping short,
          and scrolls independently if the category list ever grows taller than that. */}
      <div className="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
        <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card p-3 shadow-card lg:h-full lg:flex-col lg:gap-2.5 lg:overflow-y-auto lg:overflow-x-visible">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const on = active === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                className="inline-flex shrink-0 items-center lg:w-full lg:flex-1"
              >
                <span
                  className={cn(
                    "inline-flex w-full shrink-0 items-center gap-3.5 rounded-xl px-4 py-3 text-[15px] font-semibold transition-all duration-200",
                    on
                      ? "bg-[#4361EE] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.6)]"
                      : "text-zinc-600 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", on ? "text-white" : "text-muted-foreground")} />
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        {active === "revenue" && <RevenueReports data={data} range={range} />}
        {active === "tickets" && <TicketReports data={data} range={range} />}
        {active === "invoices" && <InvoiceReports data={data} range={range} />}
        {active === "customers" && <CustomerReports data={data} range={range} />}
        {active === "inventory" && <InventoryReports data={data} />}
        {active === "expenses" && <ExpenseReports data={data} range={range} />}
        {active === "employees" && <EmployeeReports data={data} />}
        {active === "financial" && <FinancialReports data={data} range={range} />}
      </div>
    </div>
  );
}

/* ─── shared helpers ────────────────────────────────────────────────────── */

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>;
}

function csvFromSeries(name: string, dimLabel: string, valLabel: string, series: SeriesPoint[], currency: boolean) {
  exportSingleCSV(
    name,
    [dimLabel, valLabel],
    series.map((s) => [s.label, currency ? Math.round(s.value) : s.value])
  );
}

/* ─── Revenue ───────────────────────────────────────────────────────────── */

function RevenueReports({ data, range }: { data: ReportDataset; range: DateRange }) {
  const g = autoGranularity(range);
  const live = useMemo(() => data.invoices.filter((i) => LIVE(i.status)), [data.invoices]);

  const trend = useMemo(() => seriesByTime(live, (i) => i.createdAt, (i) => i.total || 0, g), [live, g]);
  const byEmployee = useMemo(() => groupBy(live, (i) => i.employee || "Unassigned", (i) => i.total || 0).slice(0, 10), [live]);
  const byMode = useMemo(() => groupBy(live, (i) => i.paymentMode || "Unknown", (i) => i.total || 0), [live]);
  const byType = useMemo(() => groupBy(live, (i) => (i.invoiceType === "business" ? "Business" : "Retail"), (i) => i.total || 0), [live]);
  const byDevice = useMemo(() => groupBy(data.tickets, (t) => t.device || "Other", (t) => t.amount || 0).slice(0, 10), [data.tickets]);
  const byCustomer = useMemo(() => groupBy(live, (i) => i.customer || "Walk-in", (i) => i.total || 0).slice(0, 15), [live]);

  return (
    <div className="space-y-4">
      <Panel title="Revenue Trend" subtitle={`Billed revenue over ${range.label.toLowerCase()}`} actions={<DownloadBtn onClick={() => csvFromSeries("revenue-trend", "Period", "Revenue", trend, true)} />}>
        <AreaChartView data={trend} currency />
      </Panel>
      <Grid>
        <Panel title="Revenue by Employee" actions={<DownloadBtn onClick={() => csvFromSeries("revenue-by-employee", "Employee", "Revenue", byEmployee, true)} />}>
          <Leaderboard data={byEmployee} currency />
        </Panel>
        <Panel title="Revenue by Payment Mode">
          <PieChartView data={byMode} currency />
        </Panel>
        <Panel title="Revenue by Invoice Type">
          <BarChartView data={byType} currency height={220} />
        </Panel>
        <Panel title="Revenue by Device Category" actions={<DownloadBtn onClick={() => csvFromSeries("revenue-by-device", "Device", "Revenue", byDevice, true)} />}>
          <BarChartView data={byDevice} currency height={220} />
        </Panel>
      </Grid>
      <Panel title="Top Customers by Revenue" actions={<DownloadBtn onClick={() => csvFromSeries("revenue-by-customer", "Customer", "Revenue", byCustomer, true)} />}>
        <DataTable
          columns={[{ key: "c", label: "Customer" }, { key: "v", label: "Revenue", format: "currency" }] as Column[]}
          rows={byCustomer.map((s) => [s.label, s.value])}
        />
      </Panel>
    </div>
  );
}

/* ─── Tickets ───────────────────────────────────────────────────────────── */

function TicketReports({ data, range }: { data: ReportDataset; range: DateRange }) {
  const g = autoGranularity(range);
  const t = data.tickets;

  const trend = useMemo(() => seriesByTime(t, (x) => x.createdAt, () => 1, g), [t, g]);
  const byStatus = useMemo(
    () => groupBy(t, (x) => STATUS_LABEL[x.status] ?? x.status, () => 1, "count"),
    [t]
  );
  const byTech = useMemo(() => groupBy(t.filter((x) => x.technician), (x) => x.technician, () => 1, "count").slice(0, 10), [t]);
  const byPriority = useMemo(() => groupBy(t, (x) => x.priority, () => 1, "count"), [t]);
  const timeByTech = useMemo(() => {
    const withTime = t.filter((x) => (x.resolutionMinutes ?? 0) > 0 && x.technician);
    return groupBy(withTime, (x) => x.technician, (x) => x.resolutionMinutes || 0, "avg").slice(0, 10);
  }, [t]);

  return (
    <div className="space-y-4">
      <Panel title="Ticket Creation Trend" subtitle="New tickets over time">
        <LineChartView data={trend} />
      </Panel>
      <Grid>
        <Panel title="Tickets by Status">
          <BarChartView data={byStatus} height={220} />
        </Panel>
        <Panel title="Tickets by Priority">
          <PieChartView data={byPriority} height={220} />
        </Panel>
        <Panel title="Technician Leaderboard" subtitle="Tickets handled">
          <Leaderboard data={byTech} />
        </Panel>
        <Panel title="Avg Repair Time by Technician" subtitle="Minutes (lower is better)">
          <DataTable
            columns={[{ key: "t", label: "Technician" }, { key: "m", label: "Avg Minutes", numeric: true }] as Column[]}
            rows={timeByTech.map((s) => [s.label, Math.round(s.value)])}
          />
        </Panel>
      </Grid>
    </div>
  );
}

/* ─── Invoices ──────────────────────────────────────────────────────────── */

function InvoiceReports({ data, range }: { data: ReportDataset; range: DateRange }) {
  const g = autoGranularity(range);
  const inv = data.invoices;
  const live = useMemo(() => inv.filter((i) => LIVE(i.status)), [inv]);

  const collectionTrend = useMemo(() => seriesByTime(live, (i) => i.createdAt, (i) => i.paidAmount || 0, g), [live, g]);
  const gstTrend = useMemo(() => seriesByTime(live, (i) => i.createdAt, (i) => i.tax || 0, g), [live, g]);
  const byStatus = useMemo(() => groupBy(inv, (i) => INVOICE_STATUS_LABEL[i.status] ?? i.status, (i) => i.total || 0), [inv]);

  const paid = live.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
  const partial = live.filter((i) => i.status === "partial").reduce((s, i) => s + (i.total || 0), 0);
  const now = Date.now();
  const overdue = inv.filter((i) => LIVE(i.status) && i.status !== "paid" && i.dueDate && new Date(i.dueDate).getTime() < now)
    .reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.paidAmount || 0)), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Paid" value={formatINR(paid)} tone="emerald" />
        <MiniStat label="Partial" value={formatINR(partial)} tone="amber" />
        <MiniStat label="Overdue" value={formatINR(overdue)} tone="rose" />
      </div>
      <Grid>
        <Panel title="Collection Trend" subtitle="Amount collected over time">
          <AreaChartView data={collectionTrend} currency />
        </Panel>
        <Panel title="GST Trend" subtitle="Tax collected over time">
          <LineChartView data={gstTrend} currency />
        </Panel>
        <Panel title="Billed by Payment Status">
          <PieChartView data={byStatus} currency height={240} />
        </Panel>
        <Panel title="Invoices by Type">
          <BarChartView data={groupBy(live, (i) => (i.invoiceType === "business" ? "Business" : "Retail"), () => 1, "count")} height={240} />
        </Panel>
      </Grid>
    </div>
  );
}

/* ─── Customers ─────────────────────────────────────────────────────────── */

function CustomerReports({ data, range }: { data: ReportDataset; range: DateRange }) {
  const g = autoGranularity(range);
  const newInRange = useMemo(() => data.customers.filter((c) => inRange(c.createdAt, range)), [data.customers, range]);
  const growth = useMemo(() => seriesByTime(newInRange, (c) => c.createdAt, () => 1, g), [newInRange, g]);
  const topByValue = useMemo(
    () => groupBy(data.customers, (c) => c.fullName || c.mobile || "—", (c) => c.lifetimeValue || 0).slice(0, 12),
    [data.customers]
  );
  const byCity = useMemo(
    () => groupBy(data.customers.filter((c) => c.city), (c) => c.city, () => 1, "count").slice(0, 10),
    [data.customers]
  );

  return (
    <div className="space-y-4">
      <Panel title="Customer Growth" subtitle="New customers acquired over time">
        <AreaChartView data={growth} />
      </Panel>
      <Grid>
        <Panel title="Highest-Value Customers" subtitle="By lifetime value" actions={<DownloadBtn onClick={() => csvFromSeries("top-customers", "Customer", "Lifetime Value", topByValue, true)} />}>
          <Leaderboard data={topByValue} currency />
        </Panel>
        <Panel title="Customers by Location">
          <BarChartView data={byCity} height={240} />
        </Panel>
      </Grid>
    </div>
  );
}

/* ─── Inventory ─────────────────────────────────────────────────────────── */

function InventoryReports({ data }: { data: ReportDataset }) {
  const inv = data.inventory;
  const stockByCategory = useMemo(
    () => groupBy(inv, (i) => i.category || "Uncategorised", (i) => (i.currentStock || 0) * (i.regularBuyingPrice || 0)).slice(0, 10),
    [inv]
  );
  const fastMoving = useMemo(
    () => inv.filter((i) => (i.soldUnits || 0) > 0).sort((a, b) => (b.soldUnits || 0) - (a.soldUnits || 0)).slice(0, 12),
    [inv]
  );
  const deadStock = useMemo(
    () => inv.filter((i) => (i.soldUnits || 0) === 0 && (i.currentStock || 0) > 0).slice(0, 20),
    [inv]
  );
  const lowStock = useMemo(
    () => inv.filter((i) => (i.minStock || 0) > 0 && (i.currentStock || 0) <= (i.minStock || 0)),
    [inv]
  );

  return (
    <div className="space-y-4">
      <Grid>
        <Panel title="Stock Value by Category">
          <BarChartView data={stockByCategory} currency height={240} />
        </Panel>
        <Panel title="Fast-Moving Parts" subtitle="By units sold">
          <Leaderboard data={fastMoving.map((i) => ({ key: i.id, label: i.name, value: i.soldUnits || 0 }))} />
        </Panel>
      </Grid>
      <Grid>
        <Panel title="Low Stock — Reorder Needed" subtitle={`${lowStock.length} item(s) at or below minimum`}>
          <DataTable
            columns={[{ key: "n", label: "Item" }, { key: "s", label: "Stock", numeric: true }, { key: "m", label: "Min", numeric: true }] as Column[]}
            rows={lowStock.map((i) => [i.name, i.currentStock, i.minStock])}
            emptyLabel="All items above reorder level."
          />
        </Panel>
        <Panel title="Dead Stock" subtitle="In stock, never sold">
          <DataTable
            columns={[{ key: "n", label: "Item" }, { key: "s", label: "Stock", numeric: true }, { key: "v", label: "Tied-up Value", format: "currency" }] as Column[]}
            rows={deadStock.map((i) => [i.name, i.currentStock, (i.currentStock || 0) * (i.regularBuyingPrice || 0)])}
            emptyLabel="No dead stock."
          />
        </Panel>
      </Grid>
    </div>
  );
}

/* ─── Expenses ──────────────────────────────────────────────────────────── */

function ExpenseReports({ data, range }: { data: ReportDataset; range: DateRange }) {
  const g = autoGranularity(range);
  const exp = data.expenses;
  const byCategory = useMemo(() => groupBy(exp, (e) => e.category || "Uncategorised", (e) => e.amount || 0), [exp]);
  const trend = useMemo(() => seriesByTime(exp, (e) => e.date, (e) => e.amount || 0, g), [exp, g]);
  const byMode = useMemo(() => groupBy(exp, (e) => e.paymentMode || "—", (e) => e.amount || 0), [exp]);

  const totalExp = exp.reduce((s, e) => s + (e.amount || 0), 0);
  const totalRev = data.invoices.filter((i) => LIVE(i.status)).reduce((s, i) => s + (i.paidAmount || 0), 0);
  const expVsRev: SeriesPoint[] = [
    { key: "rev", label: "Revenue (collected)", value: totalRev },
    { key: "exp", label: "Expenses", value: totalExp },
  ];

  return (
    <div className="space-y-4">
      <Panel title="Expense Trend" subtitle="Spending over time">
        <LineChartView data={trend} currency />
      </Panel>
      <Grid>
        <Panel title="Expenses by Category" actions={<DownloadBtn onClick={() => csvFromSeries("expense-by-category", "Category", "Amount", byCategory, true)} />}>
          <BarChartView data={byCategory} currency height={240} />
        </Panel>
        <Panel title="Expenses by Payment Mode">
          <PieChartView data={byMode} currency height={240} />
        </Panel>
        <Panel title="Revenue vs Expenses" subtitle="Collected revenue against total spend">
          <BarChartView data={expVsRev} currency height={240} />
        </Panel>
        <Panel title="Category Breakdown">
          <DataTable
            columns={[{ key: "c", label: "Category" }, { key: "v", label: "Amount", format: "currency" }] as Column[]}
            rows={byCategory.map((s) => [s.label, s.value])}
          />
        </Panel>
      </Grid>
    </div>
  );
}

/* ─── Employees ─────────────────────────────────────────────────────────── */

function EmployeeReports({ data }: { data: ReportDataset }) {
  const revenueByEmp = useMemo(
    () => groupBy(data.invoices.filter((i) => LIVE(i.status)), (i) => i.employee || "Unassigned", (i) => i.total || 0).slice(0, 12),
    [data.invoices]
  );
  const ticketsByTech = useMemo(
    () => groupBy(data.tickets.filter((t) => t.technician), (t) => t.technician, () => 1, "count").slice(0, 12),
    [data.tickets]
  );
  const invoicesByEmp = useMemo(
    () => groupBy(data.invoices.filter((i) => LIVE(i.status)), (i) => i.employee || "Unassigned", () => 1, "count").slice(0, 12),
    [data.invoices]
  );

  return (
    <div className="space-y-4">
      <Grid>
        <Panel title="Revenue Generated by Employee" actions={<DownloadBtn onClick={() => csvFromSeries("revenue-by-employee", "Employee", "Revenue", revenueByEmp, true)} />}>
          <Leaderboard data={revenueByEmp} currency />
        </Panel>
        <Panel title="Tickets Handled by Technician">
          <Leaderboard data={ticketsByTech} />
        </Panel>
      </Grid>
      <Panel title="Invoices Created by Employee">
        <DataTable
          columns={[{ key: "e", label: "Employee" }, { key: "n", label: "Invoices", numeric: true }] as Column[]}
          rows={invoicesByEmp.map((s) => [s.label, s.value])}
        />
      </Panel>
    </div>
  );
}

/* ─── Financial ─────────────────────────────────────────────────────────── */

function FinancialReports({ data, range }: { data: ReportDataset; range: DateRange }) {
  const g = autoGranularity(range);
  const tx = data.ledgerTx;

  const cashIn = tx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Cash").reduce((s, t) => s + t.amount, 0);
  const bankIn = tx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Bank").reduce((s, t) => s + t.amount, 0);
  const cashOut = tx.filter((t) => t.direction === "outflow" && t.cashOrBank === "Cash").reduce((s, t) => s + t.amount, 0);
  const bankOut = tx.filter((t) => t.direction === "outflow" && t.cashOrBank === "Bank").reduce((s, t) => s + t.amount, 0);

  const flow: SeriesPoint[] = [
    { key: "ci", label: "Cash In", value: cashIn },
    { key: "bi", label: "Bank In", value: bankIn },
    { key: "co", label: "Cash Out", value: cashOut },
    { key: "bo", label: "Bank Out", value: bankOut },
  ];
  const inflowTrend = useMemo(
    () => seriesByTime(tx.filter((t) => t.direction === "inflow"), (t) => t.date, (t) => t.amount, g),
    [tx, g]
  );
  const byCategory = useMemo(() => groupBy(tx, (t) => t.category || t.module, (t) => t.amount), [tx]);
  const byModule = useMemo(() => groupBy(tx, (t) => t.module, (t) => t.amount), [tx]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Cash In" value={formatINR(cashIn)} tone="emerald" />
        <MiniStat label="Bank In" value={formatINR(bankIn)} tone="sky" />
        <MiniStat label="Cash Out" value={formatINR(cashOut)} tone="rose" />
        <MiniStat label="Bank Out" value={formatINR(bankOut)} tone="amber" />
      </div>
      <Grid>
        <Panel title="Inflow Trend" subtitle="Money received over time">
          <AreaChartView data={inflowTrend} currency />
        </Panel>
        <Panel title="Cash vs Bank Movement">
          <BarChartView data={flow} currency height={240} />
        </Panel>
        <Panel title="Transactions by Category">
          <BarChartView data={byCategory} currency height={240} />
        </Panel>
        <Panel title="Transactions by Module">
          <PieChartView data={byModule} currency height={240} />
        </Panel>
      </Grid>
    </div>
  );
}

/* ─── Mini stat ─────────────────────────────────────────────────────────── */

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "rose" | "sky" }) {
  const tones = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    sky: "text-sky-600",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-bold tabular-nums", tones[tone])}>{value}</p>
    </div>
  );
}
