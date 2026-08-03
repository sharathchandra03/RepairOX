/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Filter engine
   ──────────────────────────────────────────────────────────────────────────
   • buildFilterOptions() derives every dropdown's options from the LIVE dataset
     (so a brand/technician/category only appears once it exists in the data).
   • applyFilters() returns a new dataset with every collection narrowed to the
     active filters + date range. All report surfaces (KPIs, categories,
     comparison, builder) consume the SAME filtered dataset, so a filter change
     updates everything at once.
   ────────────────────────────────────────────────────────────────────────── */

import { STATUS_LABEL, INVOICE_STATUS_LABEL } from "@/lib/mock-data";
import type {
  ReportDataset,
  ReportFilters,
  FilterOption,
  FilterOptionSet,
  DateRange,
} from "./types";
import { resolveDateRange, inRange } from "./date-ranges";

/* ─── Option extraction ─────────────────────────────────────────────────── */

function uniq(values: (string | undefined | null)[]): FilterOption[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").toString().trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b)).map((v) => ({ label: v, value: v }));
}

export function buildFilterOptions(d: ReportDataset): FilterOptionSet {
  const statusOpts = (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => ({
    value: k as string,
    label: STATUS_LABEL[k],
  }));
  const invStatusOpts = (Object.keys(INVOICE_STATUS_LABEL) as (keyof typeof INVOICE_STATUS_LABEL)[]).map((k) => ({
    value: k as string,
    label: INVOICE_STATUS_LABEL[k],
  }));

  return {
    branches: uniq(d.team.map((t) => t.branch)),
    employees: uniq([
      ...d.invoices.map((i) => i.employee),
      ...d.expenses.map((e) => e.employee),
      ...d.team.map((t) => t.name),
    ]),
    technicians: uniq(d.tickets.map((t) => t.technician)),
    customers: uniq([
      ...d.tickets.map((t) => t.customer),
      ...d.invoices.map((i) => i.customer),
    ]).slice(0, 500),
    invoiceTypes: [
      { value: "retail", label: "Retail Invoice" },
      { value: "business", label: "Business Invoice" },
    ],
    ticketStatuses: statusOpts,
    paymentStatuses: invStatusOpts,
    paymentModes: uniq([
      ...d.invoices.map((i) => i.paymentMode),
      ...d.expenses.map((e) => e.paymentMode),
    ]),
    deviceCategories: uniq(d.tickets.map((t) => t.device)),
    brands: uniq([...d.brands.map((b) => b.name), ...d.tickets.map((t) => t.device)]),
    models: uniq(d.tickets.map((t) => t.model)).slice(0, 500),
    priorities: [
      { value: "normal", label: "Normal" },
      { value: "high", label: "High Priority" },
      { value: "critical", label: "Critical" },
    ],
    serviceTypes: [
      { value: "service", label: "Service" },
      { value: "accessories", label: "Accessories" },
    ],
  };
}

/* ─── Filter application ────────────────────────────────────────────────── */

export function rangeFromFilters(f: ReportFilters, now: Date = new Date()): DateRange {
  return resolveDateRange(f.preset, f.customFrom, f.customTo, now);
}

function eqi(a: string | undefined | null, b: string | undefined): boolean {
  if (!b) return true; // no constraint
  return (a ?? "").toString().trim().toLowerCase() === b.trim().toLowerCase();
}

/** Apply the active filters + date range to the whole dataset. Inventory,
 *  employees and brand catalogues are not date-scoped (they are stock/registry
 *  snapshots), so only their applicable attribute filters are applied. */
export function applyFilters(
  d: ReportDataset,
  f: ReportFilters,
  range: DateRange
): ReportDataset {
  const tickets = d.tickets.filter(
    (t) =>
      inRange(t.createdAt, range) &&
      eqi(t.technician, f.technician) &&
      eqi(t.customer, f.customer) &&
      eqi(t.status, f.ticketStatus) &&
      eqi(t.device, f.deviceCategory) &&
      eqi(t.model, f.model) &&
      eqi(t.priority, f.priority) &&
      (!f.brand || eqi(t.device, f.brand) || (t.model ?? "").toLowerCase().includes(f.brand.toLowerCase()))
  );

  const invoices = d.invoices.filter(
    (i) =>
      inRange(i.createdAt, range) &&
      eqi(i.employee, f.employee) &&
      eqi(i.customer, f.customer) &&
      eqi(i.invoiceType, f.invoiceType) &&
      eqi(i.status, f.paymentStatus) &&
      eqi(i.paymentMode, f.paymentMode) &&
      eqi(i.serviceCategory, f.serviceType)
  );

  const walkIns = d.walkIns.filter(
    (w) =>
      inRange(w.date, range) &&
      eqi(w.customer, f.customer) &&
      eqi(w.category, f.deviceCategory)
  );

  const expenses = d.expenses.filter(
    (e) =>
      e.status === "active" &&
      inRange(e.date, range) &&
      eqi(e.employee, f.employee) &&
      eqi(e.paymentMode, f.paymentMode)
  );

  const ledgerTx = d.ledgerTx.filter(
    (t) =>
      inRange(t.date, range) &&
      eqi(t.employee, f.employee) &&
      (!f.paymentMode || eqi(t.paymentMode, f.paymentMode))
  );

  const ledgerEntries = d.ledgerEntries.filter((e) => inRange(e.date, range));

  const customers = d.customers.filter((c) => eqi(c.city, undefined));

  const team = f.branch ? d.team.filter((t) => eqi(t.branch, f.branch)) : d.team;

  return {
    ...d,
    tickets,
    invoices,
    walkIns,
    expenses,
    ledgerTx,
    ledgerEntries,
    customers,
    team,
  };
}

/** Count of filters actively constraining the data (for the "N filters" chip). */
export function activeFilterCount(f: ReportFilters): number {
  const keys: (keyof ReportFilters)[] = [
    "branch", "employee", "technician", "customer", "invoiceType", "ticketStatus",
    "paymentStatus", "paymentMode", "deviceCategory", "brand", "model", "priority", "serviceType",
  ];
  return keys.reduce((n, k) => (f[k] ? n + 1 : n), 0);
}
