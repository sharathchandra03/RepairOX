/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Business Intelligence & Reporting Engine · Shared Types
   ──────────────────────────────────────────────────────────────────────────
   Every report, KPI, chart, table and comparison in RepairOX is computed from
   these primitives. Nothing here is hardcoded — the engine consumes the live
   business dataset (tickets, invoices, expenses, ledger, inventory, customers,
   employees) and derives every figure dynamically.

   The architecture is module-first: each business area (Shop, Sales, Field) is
   an independent "report module" that registers its data sources. Combined
   Analytics simply selects more than one module. Adding a future module never
   requires rewriting the engine — it registers itself (see registry.ts).
   ────────────────────────────────────────────────────────────────────────── */

import type { Ticket, Invoice, WalkIn, TeamMember } from "@/lib/mock-data";
import type { InventoryItem } from "@/lib/inventory-data";
import type { Customer } from "@/lib/customer-data";
import type { Brand, DeviceModel } from "@/lib/brand-model-data";
import type { Expense } from "@/lib/expense-store";
import type { LedgerTransaction, DailySummary } from "@/lib/daily-ledger-service";
import type { LedgerEntry } from "@/lib/accounting-service";

/* ─── Report modules (the three independent engines + combined) ─────────── */

export type ReportModuleId = "shop" | "sales" | "field";

/* ─── Data sources ──────────────────────────────────────────────────────── */

export type DataSourceId =
  | "tickets"
  | "invoices"
  | "walkins"
  | "inventory"
  | "expenses"
  | "customers"
  | "employees"
  | "ledger"
  // Sales Management
  | "leads"
  | "deals"
  | "quotations"
  | "contacts"
  | "companies"
  | "activities"
  | "pipelines"
  // Field Management
  | "field_jobs"
  | "visits"
  | "routes"
  | "installations"
  | "technicians"
  | "service_calls"
  | "van_inventory";

/* ─── Date range presets ────────────────────────────────────────────────── */

export type DatePresetId =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "quarter"
  | "financial_year"
  | "custom";

export interface DateRange {
  /** Inclusive start (local midnight). */
  from: Date;
  /** Inclusive end (local end-of-day). */
  to: Date;
  /** Human label for headers / exports. */
  label: string;
  presetId: DatePresetId;
}

/* ─── Filters ───────────────────────────────────────────────────────────── */

/** Every filter is optional. An empty/`all` value means "no constraint".
 *  Filters are applied together (logical AND) across all report surfaces. */
export interface ReportFilters {
  preset: DatePresetId;
  /** Only used when preset === "custom". ISO yyyy-mm-dd strings. */
  customFrom?: string;
  customTo?: string;

  branch?: string;
  employee?: string;
  technician?: string;
  customer?: string;
  invoiceType?: string;     // retail | business
  ticketStatus?: string;
  paymentStatus?: string;   // invoice status
  paymentMode?: string;
  deviceCategory?: string;
  brand?: string;
  model?: string;
  priority?: string;
  serviceType?: string;     // service | accessories
}

export const EMPTY_FILTERS: ReportFilters = { preset: "last_30" };

/** A single selectable option surfaced dynamically from the dataset. */
export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterOptionSet {
  branches: FilterOption[];
  employees: FilterOption[];
  technicians: FilterOption[];
  customers: FilterOption[];
  invoiceTypes: FilterOption[];
  ticketStatuses: FilterOption[];
  paymentStatuses: FilterOption[];
  paymentModes: FilterOption[];
  deviceCategories: FilterOption[];
  brands: FilterOption[];
  models: FilterOption[];
  priorities: FilterOption[];
  serviceTypes: FilterOption[];
}

/* ─── The unified dataset ───────────────────────────────────────────────── */

/** A snapshot of all business data, already sourced from the live stores.
 *  Every report reads from this — the single in-memory source of truth for
 *  the reporting layer. */
export interface ReportDataset {
  tickets: Ticket[];
  invoices: Invoice[];
  walkIns: WalkIn[];
  inventory: InventoryItem[];
  customers: Customer[];
  brands: Brand[];
  deviceModels: DeviceModel[];
  team: TeamMember[];
  expenses: Expense[];
  ledgerTx: LedgerTransaction[];
  ledgerEntries: LedgerEntry[];
  ledgerSummaries: DailySummary[];
  hydrated: boolean;
}

/* ─── KPI results ───────────────────────────────────────────────────────── */

export type KpiFormat = "currency" | "number" | "percent" | "minutes" | "days";
export type KpiTone = "rose" | "amber" | "emerald" | "sky" | "violet";

export type KpiSection =
  | "revenue"
  | "operations"
  | "customers"
  | "inventory"
  | "financial";

export interface KpiResult {
  id: string;
  label: string;
  value: number;
  format: KpiFormat;
  section: KpiSection;
  tone: KpiTone;
  /** Percentage change vs the comparable previous period (null if incomputable). */
  deltaPct: number | null;
  /** Whether an increase is good (drives the up/down colour semantics). */
  higherIsBetter: boolean;
  hint?: string;
  /** Optional drill-down destination (an app route). */
  drillHref?: string;
  /** Progress bar target (0–100) when relevant, e.g. collection rate. */
  progress?: number;
}

/* ─── Aggregation primitives (feed tables + charts) ─────────────────────── */

export interface SeriesPoint {
  /** Bucket key, e.g. "2026-07" or "Apple" or "Anjali R.". */
  key: string;
  /** Display label. */
  label: string;
  /** Primary metric (usually revenue / count). */
  value: number;
  /** Optional secondary metrics keyed by name (for multi-series charts). */
  extra?: Record<string, number>;
}

export type Granularity = "day" | "week" | "month" | "quarter" | "year";

/* ─── Insights ──────────────────────────────────────────────────────────── */

export type InsightTone = "positive" | "negative" | "neutral" | "warning";

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: string;             // lucide icon name
  title: string;
  detail: string;
  /** Optional metric shown as a chip (e.g. "+18%"). */
  metric?: string;
  drillHref?: string;
}

/* ─── Comparison ────────────────────────────────────────────────────────── */

export interface ComparisonMetric {
  label: string;
  format: KpiFormat;
  a: number;
  b: number;
  deltaPct: number | null;
  higherIsBetter: boolean;
}

/* ─── Custom report builder ─────────────────────────────────────────────── */

export type VisualizationId =
  | "table"
  | "bar"
  | "line"
  | "area"
  | "stacked"
  | "pie"
  | "leaderboard"
  | "kpi";

export interface FieldDef {
  key: string;
  label: string;
  /** How to render / aggregate the value. */
  kind: "text" | "number" | "currency" | "date" | "status";
}

export interface GroupByDef {
  key: string;
  label: string;
}

export type AggregationOp = "sum" | "count" | "avg" | "min" | "max";

export interface CustomReportConfig {
  id: string;
  name: string;
  module: ReportModuleId | "combined";
  dataSource: DataSourceId;
  /** Columns to show in table mode. */
  fields: string[];
  /** Grouping dimension key (from the data source's group options). */
  groupBy?: string;
  /** Which numeric field to aggregate for charts / grouped tables. */
  metric?: string;
  aggregation: AggregationOp;
  visualization: VisualizationId;
  filters: ReportFilters;
  /** Persistence metadata. */
  favorite?: boolean;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}
