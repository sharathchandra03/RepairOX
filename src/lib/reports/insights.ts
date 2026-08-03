/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Smart Insights ("RepairOX Insights")
   ──────────────────────────────────────────────────────────────────────────
   Generates plain-language, decision-oriented insights STRICTLY from the data.
   Every statement is backed by a computed figure — there is no AI guesswork or
   fabricated trend. Insights that can't be supported by the current dataset are
   simply not shown.
   ────────────────────────────────────────────────────────────────────────── */

import type { ReportDataset, ReportFilters, Insight } from "./types";
import { rangeFromFilters, applyFilters } from "./filters";
import { previousRange, inRange } from "./date-ranges";
import { groupBy } from "./aggregations";
import { formatINR } from "@/lib/utils";

export function generateInsights(full: ReportDataset, filters: ReportFilters): Insight[] {
  const range = rangeFromFilters(filters);
  const prev = previousRange(range);
  const cur = applyFilters(full, filters, range);
  const pm = applyFilters(full, filters, prev);

  const insights: Insight[] = [];
  const live = (arr: typeof cur.invoices) => arr.filter((i) => i.status !== "cancelled" && i.status !== "draft");

  /* Revenue movement */
  const curRev = live(cur.invoices).reduce((s, i) => s + (i.total || 0), 0);
  const prevRev = live(pm.invoices).reduce((s, i) => s + (i.total || 0), 0);
  if (prevRev > 0) {
    const change = ((curRev - prevRev) / prevRev) * 100;
    if (Math.abs(change) >= 3) {
      insights.push({
        id: "revenue_trend",
        tone: change >= 0 ? "positive" : "negative",
        icon: change >= 0 ? "TrendingUp" : "TrendingDown",
        title: `Revenue ${change >= 0 ? "increased" : "declined"} ${Math.abs(change).toFixed(0)}%`,
        detail: `Billed ${formatINR(curRev)} this period vs ${formatINR(prevRev)} previously.`,
        metric: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
        drillHref: "/invoice",
      });
    }
  }

  /* Top brand / device category by ticket volume */
  const byDevice = groupBy(cur.tickets, (t) => t.device || "Unknown", () => 1, "count");
  if (byDevice.length && byDevice[0].key !== "—" && byDevice[0].value > 0) {
    const prevByDevice = new Map(groupBy(pm.tickets, (t) => t.device || "Unknown", () => 1, "count").map((s) => [s.key, s.value]));
    const top = byDevice[0];
    const prevVal = prevByDevice.get(top.key) ?? 0;
    const growing = prevVal > 0 && top.value > prevVal;
    insights.push({
      id: "top_device",
      tone: "neutral",
      icon: "Smartphone",
      title: `${top.key} leads repairs`,
      detail: growing
        ? `${top.key} repairs are growing — ${top.value} this period, up from ${prevVal}.`
        : `${top.value} ${top.key} repairs handled this period.`,
      metric: `${top.value}`,
      drillHref: "/tickets",
    });
  }

  /* Top technician by tickets handled */
  const byTech = groupBy(cur.tickets.filter((t) => t.technician), (t) => t.technician, () => 1, "count");
  if (byTech.length) {
    const top = byTech[0];
    const total = cur.tickets.length || 1;
    const share = (top.value / total) * 100;
    insights.push({
      id: "top_tech",
      tone: "positive",
      icon: "Wrench",
      title: `${top.key} is the top technician`,
      detail: `${top.key} handled ${top.value} tickets (${share.toFixed(0)}% of the total).`,
      metric: `${top.value}`,
      drillHref: "/tickets",
    });
  }

  /* Top customer by billed value in period */
  const byCustomer = groupBy(live(cur.invoices), (i) => i.customer || "Walk-in", (i) => i.total || 0, "sum");
  if (byCustomer.length && byCustomer[0].value > 0) {
    const top = byCustomer[0];
    insights.push({
      id: "top_customer",
      tone: "positive",
      icon: "Crown",
      title: `Top customer generated ${formatINR(top.value)}`,
      detail: `${top.key} is the highest-billing customer this period.`,
      metric: formatINR(top.value),
      drillHref: "/contacts",
    });
  }

  /* Most profitable / fastest-moving inventory item */
  const movers = full.inventory
    .filter((i) => (i.soldUnits || 0) > 0)
    .sort((a, b) => (b.soldUnits || 0) - (a.soldUnits || 0));
  if (movers.length) {
    const top = movers[0];
    insights.push({
      id: "fast_mover",
      tone: "neutral",
      icon: "Zap",
      title: `${top.name} is the fastest-moving part`,
      detail: `${top.soldUnits} units sold. ${top.currentStock} left in stock.`,
      metric: `${top.soldUnits} sold`,
      drillHref: "/inventory",
    });
  }

  /* Low stock warning */
  const low = full.inventory.filter((i) => (i.minStock || 0) > 0 && (i.currentStock || 0) <= (i.minStock || 0));
  if (low.length) {
    insights.push({
      id: "low_stock",
      tone: "warning",
      icon: "AlertTriangle",
      title: `${low.length} item${low.length > 1 ? "s" : ""} at or below reorder level`,
      detail: low.slice(0, 3).map((i) => i.name).join(", ") + (low.length > 3 ? "…" : ""),
      metric: `${low.length}`,
      drillHref: "/stock",
    });
  }

  /* Outstanding / overdue movement */
  const now = Date.now();
  const overdue = cur.invoices
    .filter((i) => i.status !== "cancelled" && i.status !== "paid" && i.dueDate && new Date(i.dueDate).getTime() < now)
    .reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.paidAmount || 0)), 0);
  if (overdue > 0) {
    insights.push({
      id: "overdue",
      tone: "warning",
      icon: "Clock",
      title: `${formatINR(overdue)} in overdue invoices`,
      detail: "Follow up on unpaid invoices past their due date to improve cash flow.",
      metric: formatINR(overdue),
      drillHref: "/shop/payments",
    });
  }

  /* Expense spike */
  const curExp = cur.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const prevExp = pm.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  if (prevExp > 0 && curExp > prevExp * 1.2) {
    const change = ((curExp - prevExp) / prevExp) * 100;
    insights.push({
      id: "expense_spike",
      tone: "negative",
      icon: "Receipt",
      title: `Expenses up ${change.toFixed(0)}%`,
      detail: `Spent ${formatINR(curExp)} vs ${formatINR(prevExp)} previously. Review the largest categories.`,
      metric: `+${change.toFixed(0)}%`,
      drillHref: "/expenses",
    });
  }

  /* New customers */
  const newCust = full.customers.filter((c) => inRange(c.createdAt, range)).length;
  if (newCust > 0) {
    insights.push({
      id: "new_customers",
      tone: "positive",
      icon: "UserPlus",
      title: `${newCust} new customer${newCust > 1 ? "s" : ""} acquired`,
      detail: "New customer records created in this period.",
      metric: `+${newCust}`,
      drillHref: "/contacts",
    });
  }

  return insights;
}
