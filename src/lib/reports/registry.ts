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

  /* ─── Sales Management data sources ───────────────────────────────────── */

  leads: {
    id: "leads",
    label: "Leads",
    icon: "Users",
    dateField: "createdAt",
    fields: [
      { key: "id", label: "Lead #", kind: "text" },
      { key: "name", label: "Name", kind: "text" },
      { key: "email", label: "Email", kind: "text" },
      { key: "phone", label: "Phone", kind: "text" },
      { key: "source", label: "Source", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "assignee", label: "Assignee", kind: "text" },
      { key: "score", label: "Score", kind: "number" },
      { key: "value", label: "Value", kind: "currency" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Status" },
      { key: "source", label: "Source" },
      { key: "assignee", label: "Sales Executive" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "value", label: "Lead Value" },
      { key: "score", label: "Lead Score" },
      { key: "__count", label: "Lead Count" },
    ],
  },
  deals: {
    id: "deals",
    label: "Deals",
    icon: "ClipboardList",
    dateField: "createdAt",
    fields: [
      { key: "id", label: "Deal #", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "contact", label: "Contact", kind: "text" },
      { key: "company", label: "Company", kind: "text" },
      { key: "stage", label: "Stage", kind: "status" },
      { key: "owner", label: "Owner", kind: "text" },
      { key: "value", label: "Value", kind: "currency" },
      { key: "probability", label: "Probability", kind: "number" },
      { key: "expectedClose", label: "Expected Close", kind: "date" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "stage", label: "Deal Stage" },
      { key: "owner", label: "Owner" },
      { key: "company", label: "Company" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "value", label: "Deal Value" },
      { key: "probability", label: "Win Probability" },
      { key: "__count", label: "Deal Count" },
    ],
  },
  quotations: {
    id: "quotations",
    label: "Quotations",
    icon: "FileText",
    dateField: "createdAt",
    fields: [
      { key: "id", label: "Quotation #", kind: "text" },
      { key: "contact", label: "Contact", kind: "text" },
      { key: "deal", label: "Deal", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "total", label: "Total", kind: "currency" },
      { key: "validUntil", label: "Valid Until", kind: "date" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Status" },
      { key: "contact", label: "Contact" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "total", label: "Quotation Value" },
      { key: "__count", label: "Quotation Count" },
    ],
  },
  contacts: {
    id: "contacts",
    label: "Contacts",
    icon: "BookUser",
    dateField: "createdAt",
    fields: [
      { key: "id", label: "ID", kind: "text" },
      { key: "name", label: "Name", kind: "text" },
      { key: "email", label: "Email", kind: "text" },
      { key: "company", label: "Company", kind: "text" },
      { key: "designation", label: "Designation", kind: "text" },
      { key: "city", label: "City", kind: "text" },
      { key: "totalDeals", label: "Total Deals", kind: "number" },
      { key: "lifetimeValue", label: "Lifetime Value", kind: "currency" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "company", label: "Company" },
      { key: "city", label: "City" },
      { key: "__date", label: "Date Joined" },
    ],
    metrics: [
      { key: "lifetimeValue", label: "Lifetime Value" },
      { key: "totalDeals", label: "Total Deals" },
      { key: "__count", label: "Contact Count" },
    ],
  },
  companies: {
    id: "companies",
    label: "Companies",
    icon: "Store",
    dateField: "createdAt",
    fields: [
      { key: "id", label: "ID", kind: "text" },
      { key: "name", label: "Company Name", kind: "text" },
      { key: "industry", label: "Industry", kind: "text" },
      { key: "size", label: "Size", kind: "text" },
      { key: "contactCount", label: "Contacts", kind: "number" },
      { key: "dealCount", label: "Deals", kind: "number" },
      { key: "totalRevenue", label: "Revenue", kind: "currency" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "industry", label: "Industry" },
      { key: "size", label: "Size" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "totalRevenue", label: "Revenue" },
      { key: "dealCount", label: "Deals" },
      { key: "__count", label: "Company Count" },
    ],
  },
  activities: {
    id: "activities",
    label: "Activities",
    icon: "Activity",
    dateField: "date",
    fields: [
      { key: "id", label: "ID", kind: "text" },
      { key: "type", label: "Type", kind: "text" },
      { key: "subject", label: "Subject", kind: "text" },
      { key: "contact", label: "Contact", kind: "text" },
      { key: "owner", label: "Owner", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "date", label: "Date", kind: "date" },
    ],
    groupBy: [
      { key: "type", label: "Activity Type" },
      { key: "owner", label: "Owner" },
      { key: "status", label: "Status" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "__count", label: "Activity Count" },
    ],
  },
  pipelines: {
    id: "pipelines",
    label: "Pipelines",
    icon: "GitBranch",
    dateField: "",
    fields: [
      { key: "id", label: "ID", kind: "text" },
      { key: "name", label: "Pipeline", kind: "text" },
      { key: "stages", label: "Stages", kind: "number" },
      { key: "activeDeals", label: "Active Deals", kind: "number" },
      { key: "totalValue", label: "Total Value", kind: "currency" },
      { key: "winRate", label: "Win Rate", kind: "number" },
    ],
    groupBy: [
      { key: "name", label: "Pipeline" },
    ],
    metrics: [
      { key: "totalValue", label: "Pipeline Value" },
      { key: "activeDeals", label: "Active Deals" },
      { key: "winRate", label: "Win Rate" },
      { key: "__count", label: "Pipeline Count" },
    ],
  },

  /* ─── Field Management data sources ───────────────────────────────────── */

  field_jobs: {
    id: "field_jobs",
    label: "Field Jobs",
    icon: "Wrench",
    dateField: "scheduledDate",
    fields: [
      { key: "id", label: "Job #", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "type", label: "Job Type", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "priority", label: "Priority", kind: "text" },
      { key: "amount", label: "Amount", kind: "currency" },
      { key: "scheduledDate", label: "Scheduled", kind: "date" },
      { key: "completedDate", label: "Completed", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Status" },
      { key: "technician", label: "Technician" },
      { key: "type", label: "Job Type" },
      { key: "priority", label: "Priority" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "amount", label: "Job Value" },
      { key: "__count", label: "Job Count" },
    ],
  },
  visits: {
    id: "visits",
    label: "Visits",
    icon: "MapPin",
    dateField: "visitDate",
    fields: [
      { key: "id", label: "Visit #", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "duration", label: "Duration (min)", kind: "number" },
      { key: "travelKm", label: "Travel (km)", kind: "number" },
      { key: "visitDate", label: "Visit Date", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Visit Status" },
      { key: "technician", label: "Technician" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "duration", label: "Duration" },
      { key: "travelKm", label: "Distance (km)" },
      { key: "__count", label: "Visit Count" },
    ],
  },
  routes: {
    id: "routes",
    label: "Routes",
    icon: "Map",
    dateField: "date",
    fields: [
      { key: "id", label: "Route #", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "stops", label: "Stops", kind: "number" },
      { key: "totalKm", label: "Total Km", kind: "number" },
      { key: "completedStops", label: "Completed", kind: "number" },
      { key: "efficiency", label: "Efficiency %", kind: "number" },
      { key: "date", label: "Date", kind: "date" },
    ],
    groupBy: [
      { key: "technician", label: "Technician" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "totalKm", label: "Total Distance" },
      { key: "stops", label: "Total Stops" },
      { key: "efficiency", label: "Efficiency" },
      { key: "__count", label: "Route Count" },
    ],
  },
  installations: {
    id: "installations",
    label: "Installations",
    icon: "Package",
    dateField: "installedDate",
    fields: [
      { key: "id", label: "Install #", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "product", label: "Product", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "value", label: "Value", kind: "currency" },
      { key: "installedDate", label: "Installed", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Status" },
      { key: "technician", label: "Technician" },
      { key: "product", label: "Product" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "value", label: "Installation Value" },
      { key: "__count", label: "Installation Count" },
    ],
  },
  technicians: {
    id: "technicians",
    label: "Technicians",
    icon: "UsersRound",
    dateField: "",
    fields: [
      { key: "id", label: "ID", kind: "text" },
      { key: "name", label: "Name", kind: "text" },
      { key: "zone", label: "Zone", kind: "text" },
      { key: "activeJobs", label: "Active Jobs", kind: "number" },
      { key: "completedJobs", label: "Completed", kind: "number" },
      { key: "rating", label: "Rating", kind: "number" },
      { key: "efficiency", label: "Efficiency %", kind: "number" },
    ],
    groupBy: [
      { key: "zone", label: "Zone" },
    ],
    metrics: [
      { key: "completedJobs", label: "Completed Jobs" },
      { key: "rating", label: "Rating" },
      { key: "efficiency", label: "Efficiency" },
      { key: "__count", label: "Technician Count" },
    ],
  },
  service_calls: {
    id: "service_calls",
    label: "Service Calls",
    icon: "Phone",
    dateField: "callDate",
    fields: [
      { key: "id", label: "Call #", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "issue", label: "Issue", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "resolution", label: "Resolution", kind: "text" },
      { key: "callDate", label: "Call Date", kind: "date" },
    ],
    groupBy: [
      { key: "status", label: "Status" },
      { key: "technician", label: "Technician" },
      { key: "__date", label: "Date" },
    ],
    metrics: [
      { key: "__count", label: "Call Count" },
    ],
  },
  van_inventory: {
    id: "van_inventory",
    label: "Van Inventory",
    icon: "Truck",
    dateField: "",
    fields: [
      { key: "id", label: "ID", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "item", label: "Item", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "quantity", label: "Quantity", kind: "number" },
      { key: "value", label: "Value", kind: "currency" },
    ],
    groupBy: [
      { key: "technician", label: "Technician" },
      { key: "category", label: "Category" },
    ],
    metrics: [
      { key: "value", label: "Stock Value" },
      { key: "quantity", label: "Quantity" },
      { key: "__count", label: "Item Count" },
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
    status: "available",
    sources: ["leads", "deals", "quotations", "contacts", "companies", "activities", "pipelines"],
  },
  {
    id: "field",
    label: "Field Management",
    short: "Field",
    icon: "Map",
    status: "available",
    sources: ["field_jobs", "visits", "routes", "installations", "technicians", "service_calls", "van_inventory"],
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
