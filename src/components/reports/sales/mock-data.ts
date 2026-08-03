/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Sales Management · SAMPLE DATA ONLY
   ──────────────────────────────────────────────────────────────────────────
   Everything in this file is static placeholder data so the Sales Management
   reports UI can be built, reviewed and demoed end to end before the backend
   team wires up the real Sales/CRM data source.

   HOW TO WIRE THIS UP LATER (for the backend team):
   1. Register "sales" as an `available` module in `lib/reports/registry.ts`
      and list its real data sources (e.g. leads, deals, quotations, campaigns).
   2. Add the equivalent of `lib/reports/selectors.ts` computations for Sales —
      same shapes (MetricCard[], SeriesPoint[], CollectionsData, etc.) but
      sourced from real leads/deals/quotations data instead of these mocks.
   3. Swap the imports in `sales-overview.tsx` / `sales-report-categories.tsx`
      from this file to the new selectors. No UI changes should be required —
      every component below already accepts the exact same prop shapes used
      by the live Shop Management dashboard.

   No calculation logic lives here — only illustrative numbers.
   ────────────────────────────────────────────────────────────────────────── */

import type { SeriesPoint, Insight } from "@/lib/reports/types";
import type { MetricCard } from "../selectors";
import type { CollectionsData } from "../selectors";
import type { PerformerDimension } from "../top-performers";

/* ─── Section 1 — Executive Summary ─────────────────────────────────────── */

const trendUp = (base: number, points = 8, vol = 0.18): SeriesPoint[] =>
  Array.from({ length: points }, (_, i) => {
    const wave = Math.sin(i / 1.6) * vol + (i / points) * 0.35;
    return { key: `p${i}`, label: `D${i + 1}`, value: Math.max(0, Math.round(base * (0.7 + wave))) };
  });

export const salesExecutiveCards: MetricCard[] = [
  {
    id: "pipeline_value", label: "Pipeline Value", value: 1842000, previous: 1605000, deltaPct: 14.8,
    format: "currency", tone: "revenue", sparkline: trendUp(180000), higherIsBetter: true,
    hint: "Open deals across all stages",
  },
  {
    id: "open_deals", label: "Open Deals", value: 46, previous: 39, deltaPct: 17.9,
    format: "number", tone: "collection", sparkline: trendUp(5, 8, 0.4), higherIsBetter: true,
    hint: "Deals not yet won or lost",
  },
  {
    id: "won_revenue", label: "Won Revenue", value: 612000, previous: 548000, deltaPct: 11.7,
    format: "currency", tone: "profit", sparkline: trendUp(65000), higherIsBetter: true,
    hint: "Closed-won this period",
  },
  {
    id: "win_rate", label: "Win Rate", value: 38.5, previous: 34.2, deltaPct: 12.6,
    format: "percent", tone: "collection", sparkline: trendUp(4, 8, 0.3), higherIsBetter: true,
    hint: "Won ÷ (won + lost)",
  },
];

/* ─── Section 2 — Business Performance (Pipeline Trend + Split) ─────────── */

export const salesPipelineTrend: SeriesPoint[] = trendUp(190000, 10, 0.22);

export const salesPipelineSplit: SeriesPoint[] = [
  { key: "new", label: "New Business", value: 820000 },
  { key: "renewal", label: "Renewals", value: 460000 },
  { key: "upsell", label: "Upsell / Add-on", value: 340000 },
  { key: "referral", label: "Referral", value: 222000 },
];

/* ─── Section 3 — Collections (mapped to Sales: Won / In Progress / At Risk) ── */

export const salesCollections: CollectionsData = {
  collected: 612000,
  pending: 890000,
  overdue: 340000,
  total: 1842000,
};

/* ─── Section 4 — Operations (Pipeline health) ──────────────────────────── */

export const salesOperationsCards: MetricCard[] = [
  { id: "leads_created", label: "Leads Created", value: 128, previous: 104, deltaPct: 23.1, format: "number", tone: "neutral", sparkline: trendUp(14, 8, 0.35), higherIsBetter: true },
  { id: "quotations_sent", label: "Quotations Sent", value: 64, previous: 58, deltaPct: 10.3, format: "number", tone: "collection", sparkline: trendUp(7, 8, 0.3), higherIsBetter: true },
  { id: "avg_deal_size", label: "Avg Deal Size", value: 40100, previous: 37650, deltaPct: 6.5, format: "currency", tone: "revenue", sparkline: trendUp(4200), higherIsBetter: true },
  { id: "avg_sales_cycle", label: "Avg Sales Cycle", value: 9, previous: 11, deltaPct: -18.2, format: "days", tone: "expenses", sparkline: trendUp(1, 8, 0.4), higherIsBetter: false },
  { id: "conversion_rate", label: "Lead → Deal Conv.", value: 31.4, previous: 27.9, deltaPct: 12.5, format: "percent", tone: "revenue", sparkline: trendUp(3, 8, 0.3), higherIsBetter: true },
  { id: "deals_lost", label: "Deals Lost", value: 12, previous: 15, deltaPct: -20, format: "number", tone: "overdue", sparkline: trendUp(1, 8, 0.4), higherIsBetter: false },
];

/* ─── Section 5 — Financial Health ──────────────────────────────────────── */

export const salesFinancialCards: MetricCard[] = [
  { id: "sales_expenses", label: "Sales Expenses", value: 84500, previous: 76200, deltaPct: 10.9, format: "currency", tone: "expenses", sparkline: trendUp(9000), higherIsBetter: false },
  { id: "net_new_revenue", label: "Net New Revenue", value: 527500, previous: 471800, deltaPct: 11.8, format: "currency", tone: "profit", sparkline: trendUp(55000), higherIsBetter: true },
  { id: "cac", label: "Customer Acq. Cost", value: 2640, previous: 2910, deltaPct: -9.3, format: "currency", tone: "collection", sparkline: trendUp(280), higherIsBetter: false },
  { id: "arpu", label: "Avg Revenue / Customer", value: 18950, previous: 17400, deltaPct: 8.9, format: "currency", tone: "collection", sparkline: trendUp(1900), higherIsBetter: true },
  { id: "commission_payable", label: "Commission Payable", value: 36700, previous: 31200, deltaPct: 17.6, format: "currency", tone: "gst", sparkline: trendUp(3800), higherIsBetter: false },
  { id: "sales_margin", label: "Sales Margin", value: 42.3, previous: 39.6, deltaPct: 6.8, format: "percent", tone: "profit", sparkline: trendUp(4, 8, 0.3), higherIsBetter: true },
];

/* ─── Section 6 — Impact Panel (Campaign / Channel Impact) ──────────────── */

export const salesTopCampaigns: SeriesPoint[] = [
  { key: "c1", label: "Diwali Offer Blast", value: 21 },
  { key: "c2", label: "Referral Program", value: 17 },
  { key: "c3", label: "WhatsApp Broadcast", value: 14 },
  { key: "c4", label: "Instagram Ads", value: 9 },
  { key: "c5", label: "Walk-in Counter Pitch", value: 6 },
];

export const salesTopChannels: SeriesPoint[] = [
  { key: "ref", label: "Referral", value: 268000 },
  { key: "walkin", label: "Walk-in", value: 194000 },
  { key: "social", label: "Social Media", value: 142000 },
  { key: "phone", label: "Phone Enquiry", value: 88000 },
];

export const salesAtRiskDeals = [
  { label: "Rangan Enterprises", detail: "₹1.2L stalled 14d" },
  { label: "Priya Retail Chain", detail: "₹86K stalled 9d" },
  { label: "Kumar & Sons", detail: "₹54K stalled 21d" },
];

/* ─── Section 7 — Insights (illustrative, NOT computed) ─────────────────── */

export const salesInsights: Insight[] = [
  {
    id: "s1", tone: "positive", icon: "TrendingUp",
    title: "Pipeline value up 15% this period",
    detail: "New business deals are driving most of the growth. Sample insight — replace with a real computation.",
    metric: "+15%",
  },
  {
    id: "s2", tone: "positive", icon: "Trophy",
    title: "Win rate improved to 38.5%",
    detail: "Up from 34.2% last period. Sample insight — replace with a real computation.",
    metric: "+4.3pt",
  },
  {
    id: "s3", tone: "warning", icon: "AlertTriangle",
    title: "3 deals stalled over 7 days",
    detail: "Worth a combined ₹2.6L. Sample insight — replace with a real computation.",
    metric: "₹2.6L",
  },
  {
    id: "s4", tone: "neutral", icon: "Megaphone",
    title: "Referral Program is the top channel",
    detail: "Generated ₹2.68L in closed revenue this period. Sample insight — replace with a real computation.",
    metric: "₹2.68L",
  },
  {
    id: "s5", tone: "negative", icon: "TrendingDown",
    title: "Average sales cycle still above target",
    detail: "9 days vs a 7-day target, though improving. Sample insight — replace with a real computation.",
    metric: "9d",
  },
];

/* ─── Section 8 — Top Performers dimensions ─────────────────────────────── */

export const salesPerformerDimensions: PerformerDimension[] = [
  {
    id: "reps", label: "Sales Reps", currency: true,
    data: [
      { key: "r1", label: "Ananya Rao", value: 214000 },
      { key: "r2", label: "Vikram Shetty", value: 178500 },
      { key: "r3", label: "Divya Menon", value: 142200 },
      { key: "r4", label: "Rahul Nair", value: 98700 },
    ],
  },
  {
    id: "customers", label: "Customers", currency: true,
    data: [
      { key: "cu1", label: "Rangan Enterprises", value: 186000 },
      { key: "cu2", label: "Priya Retail Chain", value: 152000 },
      { key: "cu3", label: "Kumar & Sons", value: 97500 },
    ],
  },
  {
    id: "products", label: "Products / Plans", currency: true,
    data: [
      { key: "pl1", label: "Annual Care Plan", value: 264000 },
      { key: "pl2", label: "Bulk Repair Contract", value: 198000 },
      { key: "pl3", label: "Accessory Bundle", value: 86000 },
    ],
  },
  {
    id: "sources", label: "Lead Sources", currency: false,
    data: [
      { key: "ls1", label: "Referral", value: 42 },
      { key: "ls2", label: "Walk-in", value: 31 },
      { key: "ls3", label: "Social Media", value: 28 },
      { key: "ls4", label: "Phone Enquiry", value: 19 },
    ],
  },
];

/* ─── Reports-tab category browser sample data ──────────────────────────── */

export const salesCategoryTrend = trendUp(150000, 10, 0.25);

export const salesByStage: SeriesPoint[] = [
  { key: "prospecting", label: "Prospecting", value: 18 },
  { key: "qualified", label: "Qualified", value: 14 },
  { key: "proposal", label: "Proposal Sent", value: 9 },
  { key: "negotiation", label: "Negotiation", value: 5 },
  { key: "won", label: "Closed Won", value: 12 },
];

export const salesByOwner: SeriesPoint[] = salesPerformerDimensions[0].data;

export const salesLeadSourceTable: (string | number)[][] = [
  ["Referral", 42, 268000, "18.4%"],
  ["Walk-in", 31, 194000, "22.1%"],
  ["Social Media", 28, 142000, "9.8%"],
  ["Phone Enquiry", 19, 88000, "12.5%"],
];


/* ─── Comparison Engine configs (mock) ──────────────────────────────────── */

import type { KpiFormat } from "@/lib/reports/types";

export interface SalesMetricRow {
  key: string;
  label: string;
  format: KpiFormat;
}

export const salesComparisonMetrics: SalesMetricRow[] = [
  { key: "pipeline_value", label: "Pipeline Value", format: "currency" },
  { key: "won_revenue", label: "Won Revenue", format: "currency" },
  { key: "open_deals", label: "Open Deals", format: "number" },
  { key: "win_rate", label: "Win Rate", format: "percent" },
  { key: "leads_created", label: "Leads Created", format: "number" },
  { key: "quotations_sent", label: "Quotations Sent", format: "number" },
  { key: "avg_deal_size", label: "Avg Deal Size", format: "currency" },
  { key: "conversion_rate", label: "Lead → Deal Conv.", format: "percent" },
  { key: "commission_payable", label: "Commission Payable", format: "currency" },
  { key: "cac", label: "Customer Acq. Cost", format: "currency" },
];

export const salesComparisonBase: Record<string, number> = {
  pipeline_value: 1842000,
  won_revenue: 612000,
  open_deals: 46,
  win_rate: 38,
  leads_created: 128,
  quotations_sent: 64,
  avg_deal_size: 40100,
  conversion_rate: 31,
  commission_payable: 36700,
  cac: 2640,
};

export const salesEntityDimensions = [
  {
    key: "reps",
    label: "Sales Reps",
    options: [
      { label: "Ananya Rao", value: "ananya" },
      { label: "Vikram Shetty", value: "vikram" },
      { label: "Divya Menon", value: "divya" },
      { label: "Rahul Nair", value: "rahul" },
    ],
  },
  {
    key: "sources",
    label: "Lead Sources",
    options: [
      { label: "Referral", value: "referral" },
      { label: "Walk-in", value: "walkin" },
      { label: "Social Media", value: "social" },
      { label: "Phone Enquiry", value: "phone" },
    ],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    options: [
      { label: "Diwali Offer Blast", value: "diwali" },
      { label: "Referral Program", value: "refprog" },
      { label: "WhatsApp Broadcast", value: "whatsapp" },
      { label: "Instagram Ads", value: "insta" },
    ],
  },
  {
    key: "products",
    label: "Products / Plans",
    options: [
      { label: "Annual Care Plan", value: "annual" },
      { label: "Bulk Repair Contract", value: "bulk" },
      { label: "Accessory Bundle", value: "accessory" },
    ],
  },
];

/* ─── Builder mock data source definitions ──────────────────────────────── */

import type { MockDataSourceDef } from "../module-mock-shared";

export const salesBuilderSources: MockDataSourceDef[] = [
  {
    id: "leads",
    label: "Leads",
    fields: [
      { key: "name", label: "Lead Name", kind: "text" },
      { key: "source", label: "Source", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "value", label: "Value", kind: "currency" },
      { key: "score", label: "Score", kind: "number" },
      { key: "created", label: "Created", kind: "date" },
    ],
    groupBy: [
      { key: "source", label: "Source" },
      { key: "status", label: "Status" },
      { key: "owner", label: "Owner" },
    ],
    metrics: [
      { key: "value", label: "Value" },
      { key: "__count", label: "Lead Count" },
      { key: "score", label: "Score" },
    ],
    groupSamples: {
      source: [
        { key: "ref", label: "Referral", value: 42 },
        { key: "walkin", label: "Walk-in", value: 31 },
        { key: "social", label: "Social Media", value: 28 },
        { key: "phone", label: "Phone Enquiry", value: 19 },
      ],
      status: [
        { key: "new", label: "New", value: 14 },
        { key: "contacted", label: "Contacted", value: 9 },
        { key: "quoted", label: "Quoted", value: 6 },
        { key: "won", label: "Won", value: 4 },
      ],
      owner: [
        { key: "ananya", label: "Ananya Rao", value: 38 },
        { key: "vikram", label: "Vikram Shetty", value: 31 },
        { key: "divya", label: "Divya Menon", value: 28 },
      ],
    },
  },
  {
    id: "deals",
    label: "Deals & Quotations",
    fields: [
      { key: "deal_name", label: "Deal", kind: "text" },
      { key: "customer", label: "Customer", kind: "text" },
      { key: "stage", label: "Stage", kind: "status" },
      { key: "value", label: "Value", kind: "currency" },
      { key: "close_date", label: "Close Date", kind: "date" },
      { key: "owner", label: "Owner", kind: "text" },
    ],
    groupBy: [
      { key: "stage", label: "Stage" },
      { key: "owner", label: "Owner" },
      { key: "customer", label: "Customer" },
    ],
    metrics: [
      { key: "value", label: "Deal Value" },
      { key: "__count", label: "Deal Count" },
    ],
    groupSamples: {
      stage: salesByStage,
      owner: salesByOwner,
      customer: [
        { key: "c1", label: "Rangan Enterprises", value: 186000 },
        { key: "c2", label: "Priya Retail Chain", value: 152000 },
        { key: "c3", label: "Kumar & Sons", value: 97500 },
      ],
    },
  },
  {
    id: "campaigns",
    label: "Campaigns",
    fields: [
      { key: "name", label: "Campaign Name", kind: "text" },
      { key: "channel", label: "Channel", kind: "text" },
      { key: "leads", label: "Leads Generated", kind: "number" },
      { key: "revenue", label: "Revenue Attributed", kind: "currency" },
      { key: "status", label: "Status", kind: "status" },
    ],
    groupBy: [
      { key: "channel", label: "Channel" },
      { key: "status", label: "Status" },
    ],
    metrics: [
      { key: "leads", label: "Leads" },
      { key: "revenue", label: "Revenue" },
      { key: "__count", label: "Campaign Count" },
    ],
    groupSamples: {
      channel: salesTopChannels,
      status: [
        { key: "active", label: "Active", value: 3 },
        { key: "paused", label: "Paused", value: 1 },
        { key: "completed", label: "Completed", value: 2 },
      ],
    },
  },
];

/* ─── Saved reports sample entries ──────────────────────────────────────── */

export const salesSavedReports = [
  {
    id: "sr-1",
    name: "Monthly Pipeline Summary",
    description: "Pipeline value by stage — auto-generated every month",
    createdAt: "2026-07-01T10:00:00Z",
    pinned: true,
    scheduled: "monthly",
  },
  {
    id: "sr-2",
    name: "Rep Commission Report",
    description: "Commission payable breakdown by sales representative",
    createdAt: "2026-07-15T09:30:00Z",
    pinned: false,
    scheduled: null,
  },
  {
    id: "sr-3",
    name: "Lead Source ROI",
    description: "Cost per lead and conversion rate by acquisition channel",
    createdAt: "2026-07-20T14:00:00Z",
    pinned: true,
    scheduled: "weekly",
  },
  {
    id: "sr-4",
    name: "Deal Velocity Analysis",
    description: "Average days to close by deal size bucket",
    createdAt: "2026-07-25T11:00:00Z",
    pinned: false,
    scheduled: null,
  },
  {
    id: "sr-5",
    name: "Win/Loss Ratio by Owner",
    description: "Won vs lost deals for each sales rep",
    createdAt: "2026-07-28T16:00:00Z",
    pinned: false,
    scheduled: null,
  },
];
