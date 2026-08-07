/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · KPI engine
   ──────────────────────────────────────────────────────────────────────────
   Computes the full KPI catalogue from the LIVE, filtered dataset — and again
   for the comparable previous period to derive the period-over-period delta on
   every card. Nothing is hardcoded: every value falls out of tickets, invoices,
   expenses, ledger, inventory and customers.
   ────────────────────────────────────────────────────────────────────────── */

import type { ReportDataset, ReportFilters, KpiResult, DateRange } from "./types";
import { rangeFromFilters, applyFilters } from "./filters";
import { previousRange, daysInRange, inRange } from "./date-ranges";

const CANCELLED = new Set(["cancelled", "draft"]);

interface CoreMetrics {
  ticketCount: number;
  ticketRevenue: number;
  avgTicketValue: number;
  repairSuccessRate: number;
  avgRepairTime: number;
  avgDeliveryDays: number;
  partsSold: number;

  invoiceCount: number;
  billed: number;
  collected: number;
  gst: number;
  collectionRate: number;
  pending: number;
  overdue: number;
  avgInvoiceValue: number;
  cancelledInvoices: number;

  expenseTotal: number;
  netRevenue: number;
  grossMargin: number;
  cashCollection: number;
  bankCollection: number;

  newCustomers: number;
  repeatCustomers: number;

  dailyAvgRevenue: number;
  monthlyProjection: number;
  yearlyProjection: number;

  inventoryValue: number;
  lowStock: number;
}

function computeCore(d: ReportDataset, range: DateRange, full: ReportDataset): CoreMetrics {
  /* Tickets */
  const ticketCount = d.tickets.length;
  const ticketRevenue = d.tickets.reduce((s, t) => s + (t.amount || 0), 0);
  const delivered = d.tickets.filter((t) => t.status === "repaired" || t.status === "repaired_collected" || t.status === "return_collected").length;
  const withTime = d.tickets.filter((t) => (t.resolutionMinutes ?? 0) > 0);
  const avgRepairTime = withTime.length
    ? withTime.reduce((s, t) => s + (t.resolutionMinutes || 0), 0) / withTime.length
    : 0;
  const partsSold = d.tickets.reduce(
    (s, t) => s + (t.parts ?? []).filter((p) => p.status === "used").reduce((a, p) => a + (p.qty || 0), 0),
    0
  );

  /* Invoices (exclude cancelled/draft from revenue) */
  const liveInvoices = d.invoices.filter((i) => !CANCELLED.has(i.status));
  const invoiceCount = liveInvoices.length;
  const billed = liveInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const collected = liveInvoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const gst = liveInvoices.reduce((s, i) => s + (i.tax || 0), 0);
  const now = Date.now();
  const overdue = d.invoices
    .filter((i) => {
      if (CANCELLED.has(i.status)) return false;
      if (i.status === "overdue") return true;
      const due = i.dueDate ? new Date(i.dueDate).getTime() : NaN;
      return !isNaN(due) && due < now && i.status !== "paid";
    })
    .reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.paidAmount || 0)), 0);
  const pending = Math.max(0, billed - collected);
  const cancelledInvoices = d.invoices.filter((i) => i.status === "cancelled").length;

  /* Expenses */
  const expenseTotal = d.expenses.reduce((s, e) => s + (e.amount || 0), 0);

  /* Ledger cash/bank inflow */
  const cashCollection = d.ledgerTx
    .filter((t) => t.direction === "inflow" && t.cashOrBank === "Cash")
    .reduce((s, t) => s + (t.amount || 0), 0);
  const bankCollection = d.ledgerTx
    .filter((t) => t.direction === "inflow" && t.cashOrBank === "Bank")
    .reduce((s, t) => s + (t.amount || 0), 0);

  /* Customers */
  const newCustomers = full.customers.filter((c) => inRange(c.createdAt, range)).length;
  const ticketsByCustomer = new Map<string, number>();
  for (const t of d.tickets) {
    const key = (t.customer || "").trim().toLowerCase();
    if (!key) continue;
    ticketsByCustomer.set(key, (ticketsByCustomer.get(key) ?? 0) + 1);
  }
  const repeatCustomers = [...ticketsByCustomer.values()].filter((n) => n >= 2).length;

  /* Projections */
  const days = daysInRange(range);
  const dailyAvgRevenue = collected / days;

  /* Inventory (snapshot — not date-scoped) */
  const inventoryValue = full.inventory.reduce(
    (s, it) => s + (it.currentStock || 0) * (it.regularBuyingPrice || 0),
    0
  );
  const lowStock = full.inventory.filter(
    (it) => (it.minStock || 0) > 0 && (it.currentStock || 0) <= (it.minStock || 0)
  ).length;

  const netRevenue = collected - expenseTotal;

  return {
    ticketCount,
    ticketRevenue,
    avgTicketValue: ticketCount ? ticketRevenue / ticketCount : 0,
    repairSuccessRate: ticketCount ? (delivered / ticketCount) * 100 : 0,
    avgRepairTime,
    avgDeliveryDays: 0,
    partsSold,
    invoiceCount,
    billed,
    collected,
    gst,
    collectionRate: billed ? (collected / billed) * 100 : 0,
    pending,
    overdue,
    avgInvoiceValue: invoiceCount ? billed / invoiceCount : 0,
    cancelledInvoices,
    expenseTotal,
    netRevenue,
    grossMargin: collected ? (netRevenue / collected) * 100 : 0,
    cashCollection,
    bankCollection,
    newCustomers,
    repeatCustomers,
    dailyAvgRevenue,
    monthlyProjection: dailyAvgRevenue * 30,
    yearlyProjection: dailyAvgRevenue * 365,
    inventoryValue,
    lowStock,
  };
}

function pct(cur: number, prev: number): number | null {
  if (!isFinite(cur) || !isFinite(prev)) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Full KPI catalogue with deltas vs the previous comparable period. */
export function computeKpis(full: ReportDataset, filters: ReportFilters): KpiResult[] {
  const range = rangeFromFilters(filters);
  const prev = previousRange(range);
  const cur = computeCore(applyFilters(full, filters, range), range, full);
  const pm = computeCore(applyFilters(full, filters, prev), prev, full);

  const K = (
    id: string,
    label: string,
    curVal: number,
    prevVal: number,
    format: KpiResult["format"],
    section: KpiResult["section"],
    tone: KpiResult["tone"],
    opts: { higherIsBetter?: boolean; hint?: string; drillHref?: string; progress?: number; noDelta?: boolean } = {}
  ): KpiResult => ({
    id,
    label,
    value: curVal,
    format,
    section,
    tone,
    deltaPct: opts.noDelta ? null : pct(curVal, prevVal),
    higherIsBetter: opts.higherIsBetter ?? true,
    hint: opts.hint,
    drillHref: opts.drillHref,
    progress: opts.progress,
  });

  return [
    /* Revenue */
    K("total_revenue", "Total Revenue (Billed)", cur.billed, pm.billed, "currency", "revenue", "emerald", { drillHref: "/invoice" }),
    K("collected", "Cash Collected", cur.collected, pm.collected, "currency", "revenue", "emerald", { drillHref: "/shop/payments" }),
    K("net_revenue", "Net Revenue", cur.netRevenue, pm.netRevenue, "currency", "revenue", "sky", { hint: "Collected − expenses" }),
    K("collection_rate", "Collection Rate", cur.collectionRate, pm.collectionRate, "percent", "revenue", "violet", { progress: cur.collectionRate }),
    K("avg_invoice", "Avg Invoice Value", cur.avgInvoiceValue, pm.avgInvoiceValue, "currency", "revenue", "sky"),
    K("gross_margin", "Gross Margin", cur.grossMargin, pm.grossMargin, "percent", "revenue", "emerald", { progress: Math.max(0, cur.grossMargin) }),
    K("gst", "GST Collected", cur.gst, pm.gst, "currency", "revenue", "amber", { hint: "Tax on invoices" }),
    K("daily_avg", "Daily Avg Revenue", cur.dailyAvgRevenue, pm.dailyAvgRevenue, "currency", "revenue", "sky"),
    K("monthly_proj", "Monthly Projection", cur.monthlyProjection, pm.monthlyProjection, "currency", "revenue", "violet", { noDelta: true, hint: "Daily avg × 30" }),
    K("yearly_proj", "Yearly Projection", cur.yearlyProjection, pm.yearlyProjection, "currency", "revenue", "violet", { noDelta: true, hint: "Daily avg × 365" }),

    /* Operations */
    K("total_tickets", "Total Tickets", cur.ticketCount, pm.ticketCount, "number", "operations", "sky", { drillHref: "/tickets" }),
    K("invoices_generated", "Invoices Generated", cur.invoiceCount, pm.invoiceCount, "number", "operations", "sky", { drillHref: "/invoice" }),
    K("avg_ticket", "Avg Ticket Value", cur.avgTicketValue, pm.avgTicketValue, "currency", "operations", "sky"),
    K("repair_success", "Repair Success Rate", cur.repairSuccessRate, pm.repairSuccessRate, "percent", "operations", "emerald", { progress: cur.repairSuccessRate }),
    K("avg_repair_time", "Avg Repair Time", cur.avgRepairTime, pm.avgRepairTime, "minutes", "operations", "amber", { higherIsBetter: false }),
    K("parts_sold", "Parts Used", cur.partsSold, pm.partsSold, "number", "operations", "violet"),
    K("cancelled_invoices", "Cancelled Invoices", cur.cancelledInvoices, pm.cancelledInvoices, "number", "operations", "rose", { higherIsBetter: false }),

    /* Customers */
    K("new_customers", "New Customers", cur.newCustomers, pm.newCustomers, "number", "customers", "emerald", { drillHref: "/contacts" }),
    K("repeat_customers", "Repeat Customers", cur.repeatCustomers, pm.repeatCustomers, "number", "customers", "violet", { hint: "2+ tickets in period" }),

    /* Financial */
    K("expenses", "Total Expenses", cur.expenseTotal, pm.expenseTotal, "currency", "financial", "rose", { higherIsBetter: false, drillHref: "/expenses" }),
    K("pending_payments", "Pending Payments", cur.pending, pm.pending, "currency", "financial", "amber", { higherIsBetter: false, drillHref: "/shop/payments" }),
    K("overdue", "Overdue", cur.overdue, pm.overdue, "currency", "financial", "rose", { higherIsBetter: false }),
    K("cash_collection", "Cash Collection", cur.cashCollection, pm.cashCollection, "currency", "financial", "emerald", { drillHref: "/accounts/ledger" }),
    K("bank_collection", "Bank Collection", cur.bankCollection, pm.bankCollection, "currency", "financial", "sky", { drillHref: "/accounts/ledger" }),

    /* Inventory (snapshot) */
    K("inventory_value", "Inventory Value", cur.inventoryValue, pm.inventoryValue, "currency", "inventory", "sky", { noDelta: true, drillHref: "/inventory" }),
    K("low_stock", "Low Stock Items", cur.lowStock, pm.lowStock, "number", "inventory", "rose", { noDelta: true, higherIsBetter: false, drillHref: "/stock" }),
  ];
}

/* ─── Value formatting shared by cards / tables / exports ───────────────── */

import { formatINR, formatNumber } from "@/lib/utils";

export function formatKpi(value: number, format: KpiResult["format"]): string {
  switch (format) {
    case "currency":
      return formatINR(Math.round(value));
    case "percent":
      return `${value.toFixed(1)}%`;
    case "minutes": {
      const m = Math.round(value);
      if (m < 60) return `${m} min`;
      const h = Math.floor(m / 60);
      const rem = m % 60;
      return rem ? `${h}h ${rem}m` : `${h}h`;
    }
    case "days":
      return `${value.toFixed(1)} d`;
    case "number":
    default:
      return formatNumber(Math.round(value));
  }
}
