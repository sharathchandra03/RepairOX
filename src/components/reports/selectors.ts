/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Presentation selectors
   ──────────────────────────────────────────────────────────────────────────
   Pure, presentation-layer data shaping for the redesigned dashboard. Every
   selector here is built ONLY by composing the existing reporting engine
   (lib/reports/*) — applyFilters, rangeFromFilters, previousRange,
   seriesByTime, groupBy, computeKpis. No calculation, filter, export, or
   report-builder logic is duplicated or changed; this file only reshapes
   already-correct numbers for the new visual components.
   ────────────────────────────────────────────────────────────────────────── */

import { STATUS_LABEL } from "@/lib/mock-data";
import { applyFilters, rangeFromFilters } from "@/lib/reports/filters";
import { previousRange, autoGranularity } from "@/lib/reports/date-ranges";
import { seriesByTime, groupBy } from "@/lib/reports/aggregations";
import type { ReportDataset, ReportFilters, SeriesPoint, KpiFormat } from "@/lib/reports/types";
import type { MetricTone } from "./report-theme";

const LIVE_INVOICE = (s: string) => s !== "cancelled" && s !== "draft";

export interface MetricCard {
  id: string;
  label: string;
  value: number;
  previous: number;
  deltaPct: number | null;
  format: KpiFormat;
  tone: MetricTone;
  sparkline: SeriesPoint[];
  hint?: string;
  drillHref?: string;
  higherIsBetter: boolean;
}

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Shared scaffolding: filtered current dataset, comparable previous dataset,
 *  and a bucketing granularity — reused by every section selector below.
 *  (Pure function — NOT a React hook, despite operating on hook-sourced data.) */
export function computeReportWindow(full: ReportDataset, filters: ReportFilters) {
  const range = rangeFromFilters(filters);
  const prevRange = previousRange(range);
  const current = applyFilters(full, filters, range);
  const previous = applyFilters(full, filters, prevRange);
  const granularity = autoGranularity(range);
  return { range, prevRange, current, previous, granularity };
}

function card(
  id: string,
  label: string,
  value: number,
  previous: number,
  format: KpiFormat,
  tone: MetricTone,
  sparkline: SeriesPoint[],
  opts: { hint?: string; drillHref?: string; higherIsBetter?: boolean } = {}
): MetricCard {
  return {
    id, label, value, previous, format, tone, sparkline,
    deltaPct: pct(value, previous),
    hint: opts.hint,
    drillHref: opts.drillHref,
    higherIsBetter: opts.higherIsBetter ?? true,
  };
}

/* ─── Section 1 — Executive Summary (max 4 cards) ───────────────────────── */

export function executiveSummary(full: ReportDataset, filters: ReportFilters): MetricCard[] {
  const { current, previous, range, granularity } = computeReportWindow(full, filters);
  const liveCur = current.invoices.filter((i) => LIVE_INVOICE(i.status));
  const livePrev = previous.invoices.filter((i) => LIVE_INVOICE(i.status));

  const revenue = liveCur.reduce((s, i) => s + (i.total || 0), 0);
  const revenuePrev = livePrev.reduce((s, i) => s + (i.total || 0), 0);
  const revenueTrend = seriesByTime(liveCur, (i) => i.createdAt, (i) => i.total || 0, granularity);
  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000));

  const collected = liveCur.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const outstanding = Math.max(0, revenue - collected);
  const outstandingPrev = Math.max(0, revenuePrev - livePrev.reduce((s, i) => s + (i.paidAmount || 0), 0));
  const outstandingTrend = seriesByTime(liveCur, (i) => i.createdAt, (i) => Math.max(0, (i.total || 0) - (i.paidAmount || 0)), granularity);

  const expenses = current.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const expensesPrev = previous.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const profit = collected - expenses;
  const profitPrev = livePrev.reduce((s, i) => s + (i.paidAmount || 0), 0) - expensesPrev;
  // Net position trend: cumulative collected-minus-spent shape, bucketed the same way as revenue.
  const collectedTrend = seriesByTime(liveCur, (i) => i.createdAt, (i) => i.paidAmount || 0, granularity);
  const expenseTrend = seriesByTime(current.expenses, (e) => e.date, (e) => e.amount || 0, granularity);
  const expenseByKey = new Map(expenseTrend.map((p) => [p.key, p.value]));
  const profitTrend = collectedTrend.map((p) => ({ ...p, value: p.value - (expenseByKey.get(p.key) ?? 0) }));

  const collectionRate = revenue ? (collected / revenue) * 100 : 0;
  const collectionRatePrev = revenuePrev ? ((livePrev.reduce((s, i) => s + (i.paidAmount || 0), 0)) / revenuePrev) * 100 : 0;

  return [
    card("revenue", "Revenue", revenue, revenuePrev, "currency", "revenue", revenueTrend, {
      hint: `Daily average ${formatHint(revenue / days)}`,
      drillHref: "/invoice",
    }),
    card("outstanding", "Outstanding", outstanding, outstandingPrev, "currency", "pending", outstandingTrend, {
      hint: "Billed minus collected", drillHref: "/shop/payments", higherIsBetter: false,
    }),
    card("profit", "Profit", profit, profitPrev, "currency", "profit", profitTrend, {
      hint: "Collected minus expenses", drillHref: "/accounts/ledger",
    }),
    card("collection_rate", "Collection Rate", collectionRate, collectionRatePrev, "percent", "collection", revenueTrend, {
      hint: "Collected ÷ billed", drillHref: "/shop/payments",
    }),
  ];
}

function formatHint(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

/* ─── Section 2 — Business Performance ──────────────────────────────────── */

export function revenueTrendSeries(full: ReportDataset, filters: ReportFilters): SeriesPoint[] {
  const { current, granularity } = computeReportWindow(full, filters);
  const live = current.invoices.filter((i) => LIVE_INVOICE(i.status));
  return seriesByTime(live, (i) => i.createdAt, (i) => i.total || 0, granularity);
}

export function revenueSplit(full: ReportDataset, filters: ReportFilters): SeriesPoint[] {
  const { current } = computeReportWindow(full, filters);
  const live = current.invoices.filter((i) => LIVE_INVOICE(i.status));
  const service = live.filter((i) => (i.serviceCategory ?? "service") === "service").reduce((s, i) => s + (i.subtotal || 0), 0);
  const accessories = live.filter((i) => i.serviceCategory === "accessories").reduce((s, i) => s + (i.subtotal || 0), 0);
  const tax = live.reduce((s, i) => s + (i.tax || 0), 0);
  const known = service + accessories + tax;
  const total = live.reduce((s, i) => s + (i.total || 0), 0);
  const otherAmt = Math.max(0, total - known);
  return [
    { key: "service", label: "Service", value: service },
    { key: "accessories", label: "Accessories", value: accessories },
    { key: "tax", label: "Tax (GST)", value: tax },
    { key: "other", label: "Other", value: otherAmt },
  ].filter((s) => s.value > 0);
}

/* ─── Section 3 — Collections ────────────────────────────────────────────── */

export interface CollectionsData {
  collected: number;
  pending: number;
  overdue: number;
  total: number;
}

export function collectionsBreakdown(full: ReportDataset, filters: ReportFilters): CollectionsData {
  const { current } = computeReportWindow(full, filters);
  const live = current.invoices.filter((i) => LIVE_INVOICE(i.status));
  const now = Date.now();
  const collected = live.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const overdue = live
    .filter((i) => i.status !== "paid" && i.dueDate && new Date(i.dueDate).getTime() < now)
    .reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.paidAmount || 0)), 0);
  const billed = live.reduce((s, i) => s + (i.total || 0), 0);
  const pending = Math.max(0, billed - collected - overdue);
  return { collected, pending, overdue, total: Math.max(1, billed) };
}

/* ─── Section 4 — Operations ─────────────────────────────────────────────── */

export function operationsHealth(full: ReportDataset, filters: ReportFilters): MetricCard[] {
  const { current, previous, granularity } = computeReportWindow(full, filters);
  const liveCur = current.invoices.filter((i) => LIVE_INVOICE(i.status));
  const livePrev = previous.invoices.filter((i) => LIVE_INVOICE(i.status));

  const ticketsTrend = seriesByTime(current.tickets, (t) => t.createdAt, () => 1, granularity);
  const invoicesTrend = seriesByTime(liveCur, (i) => i.createdAt, () => 1, granularity);
  const avgTicketTrend = seriesByTime(current.tickets, (t) => t.createdAt, (t) => t.amount || 0, granularity);

  const ticketRevCur = current.tickets.reduce((s, t) => s + (t.amount || 0), 0);
  const ticketRevPrev = previous.tickets.reduce((s, t) => s + (t.amount || 0), 0);
  const avgTicketCur = current.tickets.length ? ticketRevCur / current.tickets.length : 0;
  const avgTicketPrev = previous.tickets.length ? ticketRevPrev / previous.tickets.length : 0;

  const withTimeCur = current.tickets.filter((t) => (t.resolutionMinutes ?? 0) > 0);
  const withTimePrev = previous.tickets.filter((t) => (t.resolutionMinutes ?? 0) > 0);
  const avgTimeCur = withTimeCur.length ? withTimeCur.reduce((s, t) => s + (t.resolutionMinutes || 0), 0) / withTimeCur.length : 0;
  const avgTimePrev = withTimePrev.length ? withTimePrev.reduce((s, t) => s + (t.resolutionMinutes || 0), 0) / withTimePrev.length : 0;
  const timeTrend = seriesByTime(withTimeCur, (t) => t.createdAt, (t) => t.resolutionMinutes || 0, granularity);

  const deliveredCur = current.tickets.filter((t) => t.status === "repaired" || t.status === "repaired_collected" || t.status === "return_collected").length;
  const deliveredPrev = previous.tickets.filter((t) => t.status === "repaired" || t.status === "repaired_collected" || t.status === "return_collected").length;
  const successCur = current.tickets.length ? (deliveredCur / current.tickets.length) * 100 : 0;
  const successPrev = previous.tickets.length ? (deliveredPrev / previous.tickets.length) * 100 : 0;
  const successTrend = ticketsTrend; // ticket volume shape doubles as an activity trend

  const cancelledCur = current.invoices.filter((i) => i.status === "cancelled").length;
  const cancelledPrev = previous.invoices.filter((i) => i.status === "cancelled").length;
  const cancelledTrend = seriesByTime(current.invoices.filter((i) => i.status === "cancelled"), (i) => i.createdAt, () => 1, granularity);

  return [
    card("tickets_created", "Tickets Created", current.tickets.length, previous.tickets.length, "number", "neutral", ticketsTrend, { drillHref: "/tickets" }),
    card("invoices_generated", "Invoices Generated", liveCur.length, livePrev.length, "number", "collection", invoicesTrend, { drillHref: "/invoice" }),
    card("avg_ticket_value", "Avg Ticket Value", avgTicketCur, avgTicketPrev, "currency", "revenue", avgTicketTrend),
    card("avg_repair_time", "Avg Repair Time", avgTimeCur, avgTimePrev, "minutes", "expenses", timeTrend, { higherIsBetter: false }),
    card("repair_success", "Repair Success", successCur, successPrev, "percent", "revenue", successTrend),
    card("cancelled", "Cancelled", cancelledCur, cancelledPrev, "number", "overdue", cancelledTrend, { higherIsBetter: false }),
  ];
}

/* ─── Section 5 — Financial Health ───────────────────────────────────────── */

export function financialHealth(full: ReportDataset, filters: ReportFilters): MetricCard[] {
  const { current, previous, granularity } = computeReportWindow(full, filters);
  const liveCur = current.invoices.filter((i) => LIVE_INVOICE(i.status));
  const livePrev = previous.invoices.filter((i) => LIVE_INVOICE(i.status));

  const expensesCur = current.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const expensesPrev = previous.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const expTrend = seriesByTime(current.expenses, (e) => e.date, (e) => e.amount || 0, granularity);

  const collectedCur = liveCur.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const collectedPrev = livePrev.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const netCur = collectedCur - expensesCur;
  const netPrev = collectedPrev - expensesPrev;
  const netTrend = seriesByTime(liveCur, (i) => i.createdAt, (i) => i.paidAmount || 0, granularity);

  const cashCur = current.ledgerTx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Cash").reduce((s, t) => s + t.amount, 0);
  const cashPrev = previous.ledgerTx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Cash").reduce((s, t) => s + t.amount, 0);
  const cashTrend = seriesByTime(current.ledgerTx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Cash"), (t) => t.date, (t) => t.amount, granularity);

  const bankCur = current.ledgerTx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Bank").reduce((s, t) => s + t.amount, 0);
  const bankPrev = previous.ledgerTx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Bank").reduce((s, t) => s + t.amount, 0);
  const bankTrend = seriesByTime(current.ledgerTx.filter((t) => t.direction === "inflow" && t.cashOrBank === "Bank"), (t) => t.date, (t) => t.amount, granularity);

  const gstCur = liveCur.reduce((s, i) => s + (i.tax || 0), 0);
  const gstPrev = livePrev.reduce((s, i) => s + (i.tax || 0), 0);
  const gstTrend = seriesByTime(liveCur, (i) => i.createdAt, (i) => i.tax || 0, granularity);

  const grossCur = collectedCur ? (netCur / collectedCur) * 100 : 0;
  const grossPrev = collectedPrev ? (netPrev / collectedPrev) * 100 : 0;

  return [
    card("expenses", "Expenses", expensesCur, expensesPrev, "currency", "expenses", expTrend, { higherIsBetter: false, drillHref: "/expenses" }),
    card("net_revenue", "Net Revenue", netCur, netPrev, "currency", "profit", netTrend, { drillHref: "/accounts/ledger" }),
    card("cash", "Cash Collected", cashCur, cashPrev, "currency", "collection", cashTrend, { drillHref: "/accounts/ledger" }),
    card("bank", "Bank Collected", bankCur, bankPrev, "currency", "collection", bankTrend, { drillHref: "/accounts/banking" }),
    card("gst", "GST Collected", gstCur, gstPrev, "currency", "gst", gstTrend),
    card("gross_margin", "Gross Margin", grossCur, grossPrev, "percent", "profit", netTrend),
  ];
}

/* ─── Section 6 — Inventory Impact ───────────────────────────────────────── */

export interface InventoryImpactData {
  usedUnits: number;
  usedValue: number;
  inventoryValue: number;
  lowStockCount: number;
  topConsumed: SeriesPoint[];
  fastMoving: SeriesPoint[];
  lowStock: { name: string; stock: number; min: number }[];
}

export function inventoryImpact(full: ReportDataset, filters: ReportFilters): InventoryImpactData {
  const { current } = computeReportWindow(full, filters);

  const usedParts = current.tickets.flatMap((t) => (t.parts ?? []).filter((p) => p.status === "used"));
  const usedUnits = usedParts.reduce((s, p) => s + (p.qty || 0), 0);
  const usedValue = usedParts.reduce((s, p) => s + (p.total || 0), 0);

  const topConsumed = groupBy(usedParts, (p) => p.name, (p) => p.qty || 0, "sum").slice(0, 8);

  const fastMoving = full.inventory
    .filter((i) => (i.soldUnits || 0) > 0)
    .sort((a, b) => (b.soldUnits || 0) - (a.soldUnits || 0))
    .slice(0, 8)
    .map((i) => ({ key: i.id, label: i.name, value: i.soldUnits || 0 }));

  const lowStockItems = full.inventory.filter((i) => (i.minStock || 0) > 0 && (i.currentStock || 0) <= (i.minStock || 0));
  const inventoryValue = full.inventory.reduce((s, i) => s + (i.currentStock || 0) * (i.regularBuyingPrice || 0), 0);

  return {
    usedUnits,
    usedValue,
    inventoryValue,
    lowStockCount: lowStockItems.length,
    topConsumed,
    fastMoving,
    lowStock: lowStockItems.slice(0, 8).map((i) => ({ name: i.name, stock: i.currentStock || 0, min: i.minStock || 0 })),
  };
}

/* ─── Section 8 — Top Performers ─────────────────────────────────────────── */

export interface TopPerformers {
  employees: SeriesPoint[];
  technicians: SeriesPoint[];
  customers: SeriesPoint[];
  services: SeriesPoint[];
  brands: SeriesPoint[];
  models: SeriesPoint[];
  accessories: SeriesPoint[];
}

export function topPerformers(full: ReportDataset, filters: ReportFilters): TopPerformers {
  const { current } = computeReportWindow(full, filters);
  const live = current.invoices.filter((i) => LIVE_INVOICE(i.status));

  const employees = groupBy(live, (i) => i.employee || "Unassigned", (i) => i.total || 0).slice(0, 8);
  const technicians = groupBy(current.tickets.filter((t) => t.technician), (t) => t.technician, () => 1, "count").slice(0, 8);
  const customers = groupBy(live, (i) => i.customer || "Walk-in", (i) => i.total || 0).slice(0, 8);
  const services = groupBy(current.tickets.filter((t) => t.service), (t) => t.service as string, (t) => t.amount || 0).slice(0, 8);
  const brands = groupBy(current.tickets.filter((t) => t.device), (t) => t.device, (t) => t.amount || 0).slice(0, 8);
  const models = groupBy(current.tickets.filter((t) => t.model), (t) => t.model, (t) => t.amount || 0).slice(0, 8);
  const accessoryInvoices = live.filter((i) => i.serviceCategory === "accessories");
  const accessories = groupBy(
    accessoryInvoices.flatMap((i) => i.items ?? []),
    (it) => it.name || "Accessory",
    (it) => it.total || 0
  ).slice(0, 8);

  return { employees, technicians, customers, services, brands, models, accessories };
}

/* ─── Ticket status labels (for operations breakdowns) ──────────────────── */

export function ticketStatusLabel(status: string): string {
  return STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status;
}
