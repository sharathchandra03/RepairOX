/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Field Management · SAMPLE DATA ONLY
   ──────────────────────────────────────────────────────────────────────────
   Everything in this file is static placeholder data so the Field Management
   reports UI can be built, reviewed and demoed end to end before the backend
   team wires up the real Field Ops data source (field visits, route plans,
   on-site technicians, vendors/purchasing).

   HOW TO WIRE THIS UP LATER (for the backend team):
   1. Register "field" as an `available` module in `lib/reports/registry.ts`
      and list its real data sources (visits, routes, vendors, purchase
      orders, transfers — several already exist under /operations).
   2. Add the equivalent of `lib/reports/selectors.ts` computations for Field —
      same shapes (MetricCard[], SeriesPoint[], CollectionsData, etc.) but
      sourced from real field-ops data instead of these mocks.
   3. Swap the imports in `field-overview.tsx` / `field-report-categories.tsx`
      from this file to the new selectors. No UI changes should be required —
      every component below already accepts the exact same prop shapes used
      by the live Shop Management dashboard.

   No calculation logic lives here — only illustrative numbers.
   ────────────────────────────────────────────────────────────────────────── */

import type { SeriesPoint, Insight } from "@/lib/reports/types";
import type { MetricCard, CollectionsData } from "../selectors";
import type { PerformerDimension } from "../top-performers";

const trendUp = (base: number, points = 8, vol = 0.18): SeriesPoint[] =>
  Array.from({ length: points }, (_, i) => {
    const wave = Math.sin(i / 1.4 + 1) * vol + (i / points) * 0.28;
    return { key: `p${i}`, label: `D${i + 1}`, value: Math.max(0, Math.round(base * (0.72 + wave))) };
  });

/* ─── Section 1 — Executive Summary ─────────────────────────────────────── */

export const fieldExecutiveCards: MetricCard[] = [
  {
    id: "field_revenue", label: "On-Site Revenue", value: 386000, previous: 341000, deltaPct: 13.2,
    format: "currency", tone: "revenue", sparkline: trendUp(40000), higherIsBetter: true,
    hint: "Billed from field visits",
  },
  {
    id: "visits_completed", label: "Visits Completed", value: 92, previous: 81, deltaPct: 13.6,
    format: "number", tone: "collection", sparkline: trendUp(10, 8, 0.35), higherIsBetter: true,
    hint: "On-site jobs closed",
  },
  {
    id: "route_efficiency", label: "Route Efficiency", value: 78.4, previous: 72.1, deltaPct: 8.7,
    format: "percent", tone: "profit", sparkline: trendUp(8, 8, 0.3), higherIsBetter: true,
    hint: "Planned vs actual travel time",
  },
  {
    id: "avg_visit_time", label: "Avg Visit Time", value: 46, previous: 52, deltaPct: -11.5,
    format: "minutes", tone: "expenses", sparkline: trendUp(5, 8, 0.35), higherIsBetter: false,
    hint: "Time on-site per visit",
  },
];

/* ─── Section 2 — Business Performance (Visit Trend + Split) ───────────── */

export const fieldVisitTrend: SeriesPoint[] = trendUp(38000, 10, 0.22);

export const fieldRevenueSplit: SeriesPoint[] = [
  { key: "onsite_repair", label: "On-Site Repair", value: 186000 },
  { key: "installation", label: "Installation", value: 94000 },
  { key: "amc_visit", label: "AMC Visit", value: 68000 },
  { key: "pickup_drop", label: "Pickup & Drop", value: 38000 },
];

/* ─── Section 3 — Collections (mapped to Field: Settled / Pending / Overdue) ── */

export const fieldCollections: CollectionsData = {
  collected: 296000,
  pending: 74000,
  overdue: 16000,
  total: 386000,
};

/* ─── Section 4 — Operations (Field jobs health) ────────────────────────── */

export const fieldOperationsCards: MetricCard[] = [
  { id: "visits_scheduled", label: "Visits Scheduled", value: 108, previous: 95, deltaPct: 13.7, format: "number", tone: "neutral", sparkline: trendUp(12, 8, 0.3), higherIsBetter: true },
  { id: "routes_planned", label: "Routes Planned", value: 24, previous: 21, deltaPct: 14.3, format: "number", tone: "collection", sparkline: trendUp(3, 8, 0.3), higherIsBetter: true },
  { id: "avg_travel_time", label: "Avg Travel Time", value: 28, previous: 33, deltaPct: -15.2, format: "minutes", tone: "expenses", sparkline: trendUp(3, 8, 0.35), higherIsBetter: false },
  { id: "first_time_fix", label: "First-Time Fix Rate", value: 84.2, previous: 79.6, deltaPct: 5.8, format: "percent", tone: "revenue", sparkline: trendUp(9, 8, 0.25), higherIsBetter: true },
  { id: "reassigned_visits", label: "Reassigned Visits", value: 6, previous: 9, deltaPct: -33.3, format: "number", tone: "overdue", sparkline: trendUp(1, 8, 0.4), higherIsBetter: false },
  { id: "sla_breaches", label: "SLA Breaches", value: 3, previous: 5, deltaPct: -40, format: "number", tone: "overdue", sparkline: trendUp(1, 8, 0.4), higherIsBetter: false },
];

/* ─── Section 5 — Financial Health ──────────────────────────────────────── */

export const fieldFinancialCards: MetricCard[] = [
  { id: "fuel_travel_cost", label: "Fuel & Travel Cost", value: 28400, previous: 31900, deltaPct: -11, format: "currency", tone: "expenses", sparkline: trendUp(3000), higherIsBetter: false },
  { id: "net_field_revenue", label: "Net Field Revenue", value: 357600, previous: 309100, deltaPct: 15.7, format: "currency", tone: "profit", sparkline: trendUp(37000), higherIsBetter: true },
  { id: "cash_on_visit", label: "Cash Collected On-Site", value: 168000, previous: 149000, deltaPct: 12.8, format: "currency", tone: "collection", sparkline: trendUp(17000), higherIsBetter: true },
  { id: "digital_on_visit", label: "Digital Collected On-Site", value: 128000, previous: 112000, deltaPct: 14.3, format: "currency", tone: "collection", sparkline: trendUp(13000), higherIsBetter: true },
  { id: "vendor_payouts", label: "Vendor Payouts", value: 41200, previous: 38700, deltaPct: 6.5, format: "currency", tone: "gst", sparkline: trendUp(4200), higherIsBetter: false },
  { id: "field_margin", label: "Field Margin", value: 46.8, previous: 43.1, deltaPct: 8.6, format: "percent", tone: "profit", sparkline: trendUp(5, 8, 0.3), higherIsBetter: true },
];

/* ─── Section 6 — Impact Panel (Parts Used On-Site) ─────────────────────── */

export const fieldTopPartsUsed: SeriesPoint[] = [
  { key: "p1", label: "Display Assembly", value: 18 },
  { key: "p2", label: "Battery Pack", value: 15 },
  { key: "p3", label: "Charging Port", value: 11 },
  { key: "p4", label: "Speaker Module", value: 7 },
  { key: "p5", label: "Back Cover", value: 5 },
];

export const fieldFastMovingVanStock: SeriesPoint[] = [
  { key: "v1", label: "Van 1 — Suresh K.", value: 34 },
  { key: "v2", label: "Van 2 — Manoj R.", value: 27 },
  { key: "v3", label: "Van 3 — Farhan A.", value: 19 },
];

export const fieldLowStockVans = [
  { label: "Van 2 — Battery Pack", detail: "2 units left" },
  { label: "Van 3 — Charging Port", detail: "1 unit left" },
];

/* ─── Section 7 — Insights (illustrative, NOT computed) ─────────────────── */

export const fieldInsights: Insight[] = [
  {
    id: "f1", tone: "positive", icon: "TrendingUp",
    title: "On-site revenue up 13% this period",
    detail: "AMC visits and installations are growing fastest. Sample insight — replace with a real computation.",
    metric: "+13%",
  },
  {
    id: "f2", tone: "positive", icon: "Gauge",
    title: "Route efficiency improved to 78.4%",
    detail: "Better route planning cut average travel time by 5 minutes. Sample insight — replace with a real computation.",
    metric: "+6.3pt",
  },
  {
    id: "f3", tone: "warning", icon: "AlertTriangle",
    title: "2 field vans running low on stock",
    detail: "Battery packs and charging ports need restocking before tomorrow's routes. Sample insight — replace with a real computation.",
    metric: "2 vans",
  },
  {
    id: "f4", tone: "neutral", icon: "MapPinned",
    title: "Van 1 is the busiest this period",
    detail: "Suresh K. completed 34 on-site jobs. Sample insight — replace with a real computation.",
    metric: "34 jobs",
  },
  {
    id: "f5", tone: "negative", icon: "TrendingDown",
    title: "SLA breaches down but still present",
    detail: "3 visits missed their service window this period. Sample insight — replace with a real computation.",
    metric: "3",
  },
];

/* ─── Section 8 — Top Performers dimensions ─────────────────────────────── */

export const fieldPerformerDimensions: PerformerDimension[] = [
  {
    id: "technicians", label: "Field Technicians", currency: true,
    data: [
      { key: "t1", label: "Suresh K.", value: 128000 },
      { key: "t2", label: "Manoj R.", value: 104500 },
      { key: "t3", label: "Farhan A.", value: 86200 },
      { key: "t4", label: "Deepak V.", value: 67300 },
    ],
  },
  {
    id: "routes", label: "Routes", currency: false,
    data: [
      { key: "rt1", label: "North Zone — Route A", value: 28 },
      { key: "rt2", label: "East Zone — Route C", value: 22 },
      { key: "rt3", label: "South Zone — Route B", value: 19 },
    ],
  },
  {
    id: "customers", label: "Customers", currency: true,
    data: [
      { key: "c1", label: "Greenview Apartments", value: 94000 },
      { key: "c2", label: "Silver Oak Corporate Park", value: 76500 },
      { key: "c3", label: "Lakeside Residency", value: 52000 },
    ],
  },
  {
    id: "service_types", label: "Service Types", currency: true,
    data: [
      { key: "st1", label: "On-Site Repair", value: 186000 },
      { key: "st2", label: "Installation", value: 94000 },
      { key: "st3", label: "AMC Visit", value: 68000 },
    ],
  },
];

/* ─── Reports-tab category browser sample data ──────────────────────────── */

export const fieldCategoryTrend = trendUp(32000, 10, 0.25);

export const fieldVisitsByStatus: SeriesPoint[] = [
  { key: "completed", label: "Completed", value: 92 },
  { key: "scheduled", label: "Scheduled", value: 16 },
  { key: "in_progress", label: "In Progress", value: 8 },
  { key: "cancelled", label: "Cancelled", value: 4 },
];

export const fieldRouteTable: (string | number)[][] = [
  ["Route A — North Zone", 28, "94 km", "92%"],
  ["Route B — South Zone", 19, "71 km", "88%"],
  ["Route C — East Zone", 22, "83 km", "90%"],
];

export const fieldVendorPayoutTable: (string | number)[][] = [
  ["Metro Auto Spares", 18400, "Paid"],
  ["QuickFix Logistics", 12800, "Pending"],
  ["City Fuel Co-op", 10000, "Paid"],
];


/* ─── Comparison Engine configs (mock) ──────────────────────────────────── */

import type { KpiFormat } from "@/lib/reports/types";

export interface FieldMetricRow {
  key: string;
  label: string;
  format: KpiFormat;
}

export const fieldComparisonMetrics: FieldMetricRow[] = [
  { key: "field_revenue", label: "On-Site Revenue", format: "currency" },
  { key: "visits_completed", label: "Visits Completed", format: "number" },
  { key: "route_efficiency", label: "Route Efficiency", format: "percent" },
  { key: "avg_visit_time", label: "Avg Visit Time", format: "number" },
  { key: "visits_scheduled", label: "Visits Scheduled", format: "number" },
  { key: "routes_planned", label: "Routes Planned", format: "number" },
  { key: "first_time_fix", label: "First-Time Fix Rate", format: "percent" },
  { key: "fuel_travel_cost", label: "Fuel & Travel Cost", format: "currency" },
  { key: "net_field_revenue", label: "Net Field Revenue", format: "currency" },
  { key: "field_margin", label: "Field Margin", format: "percent" },
];

export const fieldComparisonBase: Record<string, number> = {
  field_revenue: 386000,
  visits_completed: 92,
  route_efficiency: 78,
  avg_visit_time: 46,
  visits_scheduled: 108,
  routes_planned: 24,
  first_time_fix: 84,
  fuel_travel_cost: 28400,
  net_field_revenue: 357600,
  field_margin: 47,
};

export const fieldEntityDimensions = [
  {
    key: "technicians",
    label: "Technicians",
    options: [
      { label: "Suresh K.", value: "suresh" },
      { label: "Manoj R.", value: "manoj" },
      { label: "Farhan A.", value: "farhan" },
      { label: "Deepak V.", value: "deepak" },
    ],
  },
  {
    key: "routes",
    label: "Routes",
    options: [
      { label: "North Zone — Route A", value: "route_a" },
      { label: "South Zone — Route B", value: "route_b" },
      { label: "East Zone — Route C", value: "route_c" },
    ],
  },
  {
    key: "service_types",
    label: "Service Types",
    options: [
      { label: "On-Site Repair", value: "repair" },
      { label: "Installation", value: "install" },
      { label: "AMC Visit", value: "amc" },
      { label: "Pickup & Drop", value: "pickup" },
    ],
  },
  {
    key: "zones",
    label: "Zones",
    options: [
      { label: "North Zone", value: "north" },
      { label: "South Zone", value: "south" },
      { label: "East Zone", value: "east" },
      { label: "West Zone", value: "west" },
    ],
  },
];

/* ─── Builder mock data source definitions ──────────────────────────────── */

import type { MockDataSourceDef } from "../module-mock-shared";

export const fieldBuilderSources: MockDataSourceDef[] = [
  {
    id: "visits",
    label: "Field Visits",
    fields: [
      { key: "job_id", label: "Job ID", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "technician", label: "Technician", kind: "text" },
      { key: "service_type", label: "Service Type", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "billed", label: "Billed Amount", kind: "currency" },
      { key: "visit_date", label: "Visit Date", kind: "date" },
    ],
    groupBy: [
      { key: "technician", label: "Technician" },
      { key: "service_type", label: "Service Type" },
      { key: "status", label: "Status" },
      { key: "zone", label: "Zone" },
    ],
    metrics: [
      { key: "billed", label: "Billed Amount" },
      { key: "__count", label: "Visit Count" },
    ],
    groupSamples: {
      technician: [
        { key: "t1", label: "Suresh K.", value: 128000 },
        { key: "t2", label: "Manoj R.", value: 104500 },
        { key: "t3", label: "Farhan A.", value: 86200 },
        { key: "t4", label: "Deepak V.", value: 67300 },
      ],
      service_type: [
        { key: "st1", label: "On-Site Repair", value: 186000 },
        { key: "st2", label: "Installation", value: 94000 },
        { key: "st3", label: "AMC Visit", value: 68000 },
        { key: "st4", label: "Pickup & Drop", value: 38000 },
      ],
      status: fieldVisitsByStatus,
      zone: [
        { key: "z1", label: "North Zone", value: 38 },
        { key: "z2", label: "East Zone", value: 28 },
        { key: "z3", label: "South Zone", value: 19 },
        { key: "z4", label: "West Zone", value: 7 },
      ],
    },
  },
  {
    id: "routes",
    label: "Routes",
    fields: [
      { key: "route_name", label: "Route", kind: "text" },
      { key: "visits", label: "Visits", kind: "number" },
      { key: "distance", label: "Distance (km)", kind: "number" },
      { key: "on_time_pct", label: "On-Time %", kind: "number" },
      { key: "technician", label: "Assigned Tech", kind: "text" },
      { key: "date", label: "Date", kind: "date" },
    ],
    groupBy: [
      { key: "technician", label: "Technician" },
      { key: "zone", label: "Zone" },
    ],
    metrics: [
      { key: "visits", label: "Total Visits" },
      { key: "distance", label: "Distance" },
      { key: "__count", label: "Route Count" },
    ],
    groupSamples: {
      technician: [
        { key: "t1", label: "Suresh K.", value: 12 },
        { key: "t2", label: "Manoj R.", value: 8 },
        { key: "t3", label: "Farhan A.", value: 6 },
      ],
      zone: [
        { key: "z1", label: "North Zone", value: 28 },
        { key: "z2", label: "East Zone", value: 22 },
        { key: "z3", label: "South Zone", value: 19 },
      ],
    },
  },
  {
    id: "van_stock",
    label: "Van Stock",
    fields: [
      { key: "part_name", label: "Part Name", kind: "text" },
      { key: "van", label: "Van / Technician", kind: "text" },
      { key: "qty", label: "Quantity", kind: "number" },
      { key: "value", label: "Stock Value", kind: "currency" },
      { key: "last_restocked", label: "Last Restocked", kind: "date" },
    ],
    groupBy: [
      { key: "van", label: "Van" },
      { key: "part_name", label: "Part" },
    ],
    metrics: [
      { key: "qty", label: "Quantity" },
      { key: "value", label: "Stock Value" },
      { key: "__count", label: "SKU Count" },
    ],
    groupSamples: {
      van: fieldFastMovingVanStock,
      part_name: fieldTopPartsUsed,
    },
  },
];

/* ─── Saved reports sample entries ──────────────────────────────────────── */

export const fieldSavedReports = [
  {
    id: "fr-1",
    name: "Daily Route Summary",
    description: "Route performance, on-time %, and distance covered — auto-generated daily",
    createdAt: "2026-07-01T08:00:00Z",
    pinned: true,
    scheduled: "daily",
  },
  {
    id: "fr-2",
    name: "Technician Productivity Report",
    description: "Visits completed, avg time on-site, and first-time fix rate per tech",
    createdAt: "2026-07-10T09:00:00Z",
    pinned: true,
    scheduled: "weekly",
  },
  {
    id: "fr-3",
    name: "Van Stock Consumption",
    description: "Parts consumed per van with restock recommendations",
    createdAt: "2026-07-18T14:30:00Z",
    pinned: false,
    scheduled: null,
  },
  {
    id: "fr-4",
    name: "Field Revenue by Zone",
    description: "On-site revenue breakdown by service zone",
    createdAt: "2026-07-22T11:00:00Z",
    pinned: false,
    scheduled: "monthly",
  },
  {
    id: "fr-5",
    name: "SLA Breach Analysis",
    description: "Visits that missed their service window with root cause",
    createdAt: "2026-07-26T16:00:00Z",
    pinned: false,
    scheduled: null,
  },
];
