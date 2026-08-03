/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Module & Data-source Registry
   ──────────────────────────────────────────────────────────────────────────
   The heart of the future-proof architecture. Each business area is a report
   module that declares which data sources it owns. Each data source declares
   its selectable fields and grouping dimensions. The Custom Report Builder,
   Combined Analytics and Exports are all driven by this registry — so adding a
   new module (or a new field on an existing source) never requires touching
   the engine or the UI.

   To add a future module (e.g. "field"), give it a REGISTRY entry with
   `status: "available"` and register its data sources. Everything downstream
   (builder steps, combined analytics selector, export field pickers) picks it
   up automatically.
   ────────────────────────────────────────────────────────────────────────── */

import type {
  ReportModuleId,
  DataSourceId,
  FieldDef,
  GroupByDef,
  VisualizationId,
} from "./types";

export interface DataSourceDef {
  id: DataSourceId;
  label: string;
  /** Icon (lucide name) for pickers. */
  icon: string;
  /** Selectable columns for table mode. */
  fields: FieldDef[];
  /** Grouping dimensions for charts / grouped tables. */
  groupBy: GroupByDef[];
  /** Numeric fields that can be aggregated. */
  metrics: { key: string; label: string }[];
  /** The record field carrying the date used for range filtering. */
  dateField: string;
}

export interface ModuleDef {
  id: ReportModuleId;
  label: string;
  short: string;
  icon: string;
  /** "available" modules power live reports; "planned" render as coming-soon. */
  status: "available" | "planned";
  /** Data sources owned by this module. */
  sources: DataSourceId[];
}

/* ─── Data source catalogue ─────────────────────────────────────────────── */

export const DATA_SOURCES: Record<DataSourceId, DataSourceDef> = {
  tickets: {
    id: "tickets",
    label: "Tickets",
    icon: "Ticket",
    dateField: "createdAt",
    fields: [
      { key: "id", label: "Ticket #", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "device", label: "Device", kind: "text" },
      { key: "model", label: "Model", kind: "text" },
      { key: "issue", label: "Issue", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "priority", label: "Priority", kind: "text" },
      { key: "amount", label: "Amount", kind: "currency" },
      { key: "resolutionMinutes", label: "Repair Time", kind: "number" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Status" },
      { key: "technician", label: "Technician" },
      { key: "device", label: "Device Category" },
      { key: "priority", label: "Priority" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "amount", label: "Ticket Value" },
      { key: "__count", label: "Ticket Count" },
      { key: "resolutionMinutes", label: "Repair Time" },
    ],
  },
  invoices: {
    id: "invoices",
    label: "Invoices",
    icon: "FileText",
    dateField: "createdAt",
    fields: [
      { key: "id", label: "Invoice #", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "invoiceType", label: "Type", kind: "text" },
      { key: "employee", label: "Employee", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "paymentMode", label: "Payment Mode", kind: "text" },
      { key: "subtotal", label: "Subtotal", kind: "currency" },
      { key: "tax", label: "GST", kind: "currency" },
      { key: "total", label: "Total", kind: "currency" },
      { key: "paidAmount", label: "Paid", kind: "currency" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Payment Status" },
      { key: "invoiceType", label: "Invoice Type" },
      { key: "employee", label: "Employee" },
      { key: "paymentMode", label: "Payment Mode" },
      { key: "serviceCategory", label: "Service Type" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "total", label: "Billed Amount" },
      { key: "paidAmount", label: "Collected" },
      { key: "tax", label: "GST" },
      { key: "__count", label: "Invoice Count" },
    ],
  },
  walkins: {
    id: "walkins",
    label: "Walk-Ins",
    icon: "Store",
    dateField: "date",
    fields: [
      { key: "customer", label: "Customer", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "model", label: "Model", kind: "text" },
      { key: "source", label: "Source", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "businessValue", label: "Business Value", kind: "currency" },
      { key: "date", label: "Date", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Status" },
      { key: "source", label: "Source" },
      { key: "category", label: "Category" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "businessValue", label: "Business Value" },
      { key: "invoiceValue", label: "Invoice Value" },
      { key: "__count", label: "Walk-In Count" },
    ],
  },
  inventory: {
    id: "inventory",
    label: "Inventory",
    icon: "Package",
    dateField: "",
    fields: [
      { key: "name", label: "Item", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "currentStock", label: "Stock", kind: "number" },
      { key: "minStock", label: "Min Stock", kind: "number" },
      { key: "regularBuyingPrice", label: "Buy Price", kind: "currency" },
      { key: "regularSellingPrice", label: "Sell Price", kind: "currency" },
      { key: "soldUnits", label: "Sold", kind: "number" },
      { key: "purchasedUnits", label: "Purchased", kind: "number" },
    ],
    groupBy: [
      { key: "category", label: "Category" },
      { key: "store", label: "Store" },
    ],
    metrics: [
      { key: "__stockValue", label: "Stock Value" },
      { key: "currentStock", label: "Stock Qty" },
      { key: "soldUnits", label: "Units Sold" },
      { key: "__count", label: "Item Count" },
    ],
  },
  expenses: {
    id: "expenses",
    label: "Expenses",
    icon: "Receipt",
    dateField: "date",
    fields: [
      { key: "expenseId", label: "Expense #", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "vendor", label: "Vendor", kind: "text" },
      { key: "employee", label: "Employee", kind: "text" },
      { key: "paymentMode", label: "Payment Mode", kind: "text" },
      { key: "amount", label: "Amount", kind: "currency" },
      { key: "date", label: "Date", kind: "date" },
    ],
    groupBy: [
      { key: "category", label: "Category" },
      { key: "paymentMode", label: "Payment Mode" },
      { key: "employee", label: "Employee" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "amount", label: "Expense Amount" },
      { key: "__count", label: "Expense Count" },
    ],
  },
  customers: {
    id: "customers",
    label: "Customers",
    icon: "Users",
    dateField: "createdAt",
    fields: [
      { key: "fullName", label: "Name", kind: "text" },
      { key: "mobile", label: "Mobile", kind: "text" },
      { key: "city", label: "City", kind: "text" },
      { key: "totalTickets", label: "Tickets", kind: "number" },
      { key: "totalInvoices", label: "Invoices", kind: "number" },
      { key: "lifetimeValue", label: "Lifetime Value", kind: "currency" },
      { key: "createdAt", label: "Since", kind: "date" },
    ],
    groupBy: [
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "type", label: "Type" },
      { key: "__date", label: "Date Joined" },
    ],
    metrics: [
      { key: "lifetimeValue", label: "Lifetime Value" },
      { key: "totalTickets", label: "Tickets" },
      { key: "__count", label: "Customer Count" },
    ],
  },
  employees: {
    id: "employees",
    label: "Employees",
    icon: "UsersRound",
    dateField: "",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "designation", label: "Designation", kind: "text" },
      { key: "branch", label: "Branch", kind: "text" },
      { key: "department", label: "Department", kind: "text" },
      { key: "salaryAmount", label: "Salary", kind: "currency" },
    ],
    groupBy: [
      { key: "branch", label: "Branch" },
      { key: "department", label: "Department" },
      { key: "roleId", label: "Role" },
    ],
    metrics: [
      { key: "__count", label: "Employee Count" },
      { key: "salaryAmount", label: "Salary" },
    ],
  },
  ledger: {
    id: "ledger",
    label: "Daily Ledger",
    icon: "BookOpen",
    dateField: "date",
    fields: [
      { key: "date", label: "Date", kind: "date" },
      { key: "module", label: "Module", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "paymentMode", label: "Mode", kind: "text" },
      { key: "cashOrBank", label: "Cash/Bank", kind: "text" },
      { key: "direction", label: "Direction", kind: "text" },
      { key: "amount", label: "Amount", kind: "currency" },
      { key: "employee", label: "Employee", kind: "text" },
    ],
    groupBy: [
      { key: "module", label: "Module" },
      { key: "category", label: "Category" },
      { key: "cashOrBank", label: "Cash/Bank" },
      { key: "direction", label: "Direction" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "amount", label: "Amount" },
      { key: "__count", label: "Transaction Count" },
    ],
  },
};

/* ─── Module catalogue ──────────────────────────────────────────────────── */

export const REPORT_MODULES: ModuleDef[] = [
  {
    id: "shop",
    label: "Shop Management",
    short: "Shop",
    icon: "Store",
    status: "available",
    sources: ["tickets", "invoices", "walkins", "inventory", "expenses", "customers", "employees", "ledger"],
  },
  {
    id: "sales",
    label: "Sales Management",
    short: "Sales",
    icon: "TrendingUp",
    status: "planned",
    sources: [],
  },
  {
    id: "field",
    label: "Field Management",
    short: "Field",
    icon: "Map",
    status: "planned",
    sources: [],
  },
];

export const MODULE_MAP: Record<ReportModuleId, ModuleDef> = Object.fromEntries(
  REPORT_MODULES.map((m) => [m.id, m])
) as Record<ReportModuleId, ModuleDef>;

export function availableModules(): ModuleDef[] {
  return REPORT_MODULES.filter((m) => m.status === "available");
}

export function sourcesForModule(id: ReportModuleId): DataSourceDef[] {
  return (MODULE_MAP[id]?.sources ?? []).map((s) => DATA_SOURCES[s]);
}

/* ─── Visualisation catalogue ───────────────────────────────────────────── */

export const VISUALIZATIONS: { id: VisualizationId; label: string; icon: string }[] = [
  { id: "table", label: "Table", icon: "Table" },
  { id: "bar", label: "Bar", icon: "BarChart3" },
  { id: "line", label: "Line", icon: "LineChart" },
  { id: "area", label: "Area", icon: "AreaChart" },
  { id: "stacked", label: "Stacked", icon: "BarChartHorizontal" },
  { id: "pie", label: "Pie", icon: "PieChart" },
  { id: "leaderboard", label: "Leaderboard", icon: "Trophy" },
  { id: "kpi", label: "KPI Cards", icon: "LayoutGrid" },
];
