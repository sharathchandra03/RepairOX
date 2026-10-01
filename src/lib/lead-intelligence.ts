/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — deterministic Lead Intelligence engine.

   This is descriptive/diagnostic analytics only. It accepts records already
   authorized by Lead RLS + store scope and never widens visibility. The period
   is a LEAD-CREATED COHORT: outcomes and finalized invoice revenue observed up
   to `asOf` are attributed back to leads created inside the selected period.
   No metric is stored and no probability/predictive score is fabricated.
   ────────────────────────────────────────────────────────────────────────── */

import { isDownstreamGated, isNotQualified } from "@/lib/lead-workflow";
import {
  followUpLifecycle,
  isFinalizedInvoice,
  isLostStatus,
  isQualifiedLead,
  isWonStatus,
  leadExpectedValue,
  revenueWonForLead,
  type Lead,
  type LeadFollowUp,
  type RevenueInvoiceLike,
  type RevenueTicketLike,
} from "@/lib/leads-data";

export const LEAD_INTELLIGENCE_MIN_SAMPLE = 10;
export const LEAD_INTELLIGENCE_MATERIAL_LIFT = 0.05;
const DAY = 86_400_000;

export type IntelligenceDateRange =
  | "today"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "custom"
  | "all";

export type IntelligenceRoute = "" | "STORE_VISIT" | "PICKUP_DROP" | "ON_SITE";

export interface LeadIntelligenceFilters {
  dateRange: IntelligenceDateRange;
  customFrom?: string;
  customTo?: string;
  storeIds: string[];
  source: string;
  modeOfLead: string;
  leadCategory: string;
  subCategory: string;
  priority: string;
  status: string;
  route: IntelligenceRoute;
  deviceCategoryId: string;
  deviceBrandId: string;
}

export const EMPTY_INTELLIGENCE_FILTERS: LeadIntelligenceFilters = {
  dateRange: "thisMonth",
  customFrom: "",
  customTo: "",
  storeIds: [],
  source: "",
  modeOfLead: "",
  leadCategory: "",
  subCategory: "",
  priority: "",
  status: "",
  route: "",
  deviceCategoryId: "",
  deviceBrandId: "",
};

export interface IntelligencePeriod {
  key: IntelligenceDateRange;
  label: string;
  from: number | null;
  to: number | null;
  fromISO: string;
  toISO: string;
  semantics: "lead-created cohort";
}

export interface IntelligenceRevenueSources {
  tickets: (RevenueTicketLike & { createdAt?: string })[];
  invoices: (RevenueInvoiceLike & { createdAt?: string })[];
}

export interface IntelligenceLabels {
  stores?: Record<string, string>;
  deviceCategories?: Record<string, string>;
  deviceBrands?: Record<string, string>;
}

export interface IntelligenceSummary {
  totalLeads: number;
  qualified: number;
  converted: number;
  conversionRate: number;
  revenueWon: number;
  pipelineValue: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  averageLeadValue: number;
  averageInvoiceValue: number;
  finalizedInvoices: number;
}

export interface FunnelStage {
  key: "total" | "contacted" | "qualified" | "active" | "ticket" | "won";
  label: string;
  count: number;
  fromPreviousRate: number | null;
  evidenceIds: string[];
}

export interface FunnelLeakage {
  from: string;
  to: string;
  lost: number;
  passRate: number;
  sufficient: boolean;
  evidenceIds: string[];
}

export type IntelligenceDimension =
  | "source"
  | "modeOfLead"
  | "leadCategory"
  | "subCategory"
  | "priority"
  | "deviceCategory"
  | "deviceBrand"
  | "route"
  | "region"
  | "store";

export interface SegmentPerformance {
  dimension: IntelligenceDimension;
  key: string;
  label: string;
  leads: number;
  qualified: number;
  converted: number;
  qualificationRate: number;
  conversionRate: number;
  revenueWon: number;
  averageInvoiceValue: number;
  liftVsOverall: number;
  sufficient: boolean;
  evidenceIds: string[];
}

export interface ConversionPattern {
  key: string;
  label: string;
  dimensions: IntelligenceDimension[];
  leads: number;
  converted: number;
  conversionRate: number;
  revenueWon: number;
  liftVsOverall: number;
  sufficient: boolean;
  evidenceIds: string[];
}

export interface FollowUpIntelligence {
  scheduled: number;
  completed: number;
  overdue: number;
  pending: number;
  completionRate: number;
  convertedWithCompleted: number;
  leadsWithCompleted: number;
  conversionWithCompletedRate: number;
  conversionWithoutCompletedRate: number;
  associationSupported: boolean;
  withCompletedEvidenceIds: string[];
  withoutCompletedEvidenceIds: string[];
}

export interface AgingBucket {
  key: "0-1" | "2-3" | "4-7" | "8-14" | "15+";
  label: string;
  leads: number;
  openLeads: number;
  converted: number;
  conversionRate: number;
  pipelineValue: number;
  evidenceIds: string[];
}

export interface LossReasonRow {
  reason: string;
  count: number;
  share: number;
  potentialValue: number;
  evidenceIds: string[];
}

export interface ValueSegment {
  key: string;
  label: string;
  leads: number;
  converted: number;
  conversionRate: number;
  pipelineValue: number;
  revenueWon: number;
  sufficient: boolean;
  evidenceIds: string[];
}

export interface TimingMetric {
  key: "firstContact" | "qualification" | "conversion" | "qualificationToTicket" | "ticketToInvoice";
  label: string;
  medianHours: number | null;
  samples: number;
  sufficient: boolean;
  evidenceIds: string[];
}

export interface ContactSpeedBucket {
  key: string;
  label: string;
  leads: number;
  converted: number;
  conversionRate: number;
  sufficient: boolean;
  evidenceIds: string[];
}

export interface StalledLeadAnalysis {
  highValueThreshold: number | null;
  highValueStalled: Lead[];
  qualifiedWithoutFutureFollowUp: Lead[];
  overdueQualified: Lead[];
  repeatedIncompleteFollowUps: Lead[];
  stalePipeline: Lead[];
  highValueStalledValue: number;
  qualifiedWithoutFollowUpValue: number;
  overdueQualifiedValue: number;
  stalePipelineValue: number;
}

export interface EvidenceInsight {
  id: string;
  category: string;
  title: string;
  metric: string;
  interpretation: string;
  numerator: number;
  denominator: number;
  sampleSize: number;
  baseline: number | null;
  periodLabel: string;
  evidenceIds: string[];
  tone: "positive" | "attention" | "neutral";
}

export interface TrendComparison {
  available: boolean;
  label: string;
  current: IntelligenceSummary;
  previous: IntelligenceSummary | null;
}

export interface LeadIntelligenceResult {
  period: IntelligencePeriod;
  minSample: number;
  cohort: Lead[];
  summary: IntelligenceSummary;
  summaryEvidence: {
    total: string[];
    qualified: string[];
    converted: string[];
    revenueWon: string[];
    pipelineValue: string[];
    pendingFollowUps: string[];
    overdueFollowUps: string[];
  };
  funnel: FunnelStage[];
  leakage: FunnelLeakage | null;
  segments: Record<IntelligenceDimension, SegmentPerformance[]>;
  supportedDimensions: IntelligenceDimension[];
  strongestPatterns: ConversionPattern[];
  weakestPatterns: SegmentPerformance[];
  strongestProfile: ConversionPattern | null;
  followUp: FollowUpIntelligence;
  aging: AgingBucket[];
  lossReasons: LossReasonRow[];
  valueSegments: ValueSegment[];
  timing: TimingMetric[];
  contactSpeed: ContactSpeedBucket[];
  stalls: StalledLeadAnalysis;
  focusInsights: EvidenceInsight[];
  dataQualityWarnings: string[];
  trend: TrendComparison;
}

export interface CalculateLeadIntelligenceInput {
  leads: Lead[];
  followUps: LeadFollowUp[];
  revenue: IntelligenceRevenueSources;
  filters: LeadIntelligenceFilters;
  agentUserId: string;
  /** Follow-up ownership may differ from Lead ownership. Defaults to agentUserId. */
  followUpUserId?: string;
  labels?: IntelligenceLabels;
  minSample?: number;
  asOf?: number;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function endOfDay(t: number): number { return startOfDay(t) + DAY - 1; }
function isoDay(t: number | null): string { return t == null ? "" : new Date(t).toISOString().slice(0, 10); }

export function resolveIntelligencePeriod(
  range: IntelligenceDateRange,
  customFrom = "",
  customTo = "",
  asOf = Date.now(),
): IntelligencePeriod {
  const now = new Date(asOf);
  const today = startOfDay(asOf);
  let from: number | null = null;
  let to: number | null = asOf;
  let label = "All time";
  if (range === "today") { from = today; to = endOfDay(today); label = "Today"; }
  if (range === "thisWeek") {
    from = today - ((now.getDay() + 6) % 7) * DAY;
    to = endOfDay(today);
    label = "This week";
  }
  if (range === "thisMonth") {
    from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    to = endOfDay(today);
    label = "This month";
  }
  if (range === "lastMonth") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    to = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
    label = "Last month";
  }
  if (range === "last3Months") {
    from = new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
    to = endOfDay(today);
    label = "Last 3 months";
  }
  if (range === "custom") {
    from = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null;
    to = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : asOf;
    if (from != null && Number.isNaN(from)) from = null;
    if (to != null && Number.isNaN(to)) to = asOf;
    label = customFrom || customTo ? `${customFrom || "Start"} – ${customTo || "Today"}` : "Custom";
  }
  if (range === "all") to = null;
  return { key: range, label, from, to, fromISO: isoDay(from), toISO: isoDay(to), semantics: "lead-created cohort" };
}

function leadCreatedAt(lead: Lead): number {
  const t = new Date(lead.createdAt || `${lead.date}T${lead.time || "00:00"}:00`).getTime();
  return Number.isNaN(t) ? 0 : t;
}
function inPeriod(lead: Lead, period: IntelligencePeriod): boolean {
  const t = leadCreatedAt(lead);
  return t > 0 && (period.from == null || t >= period.from) && (period.to == null || t <= period.to);
}
function rate(n: number, d: number): number { return d > 0 ? n / d : 0; }
function value(lead: Lead): number { return Math.max(0, Number(leadExpectedValue(lead) || 0)); }
function won(lead: Lead): boolean { return isWonStatus(lead.status, lead.finalResult); }
function lost(lead: Lead): boolean { return isLostStatus(lead.status, lead.finalResult) || !!lead.lostAt; }
function open(lead: Lead): boolean { return !won(lead) && !lost(lead); }
function contacted(lead: Lead): boolean {
  if (lead.firstContactedAt || lead.linkedWalkInId || lead.linkedFieldJobId || lead.linkedTicketId) return true;
  const s = (lead.contactStatus || "").trim().toLowerCase();
  return !!s && !/not\s*contacted|^new$/.test(s);
}

function finalizedInvoicesForLead(lead: Lead, revenue: IntelligenceRevenueSources) {
  const ticket = lead.linkedTicketId
    ? revenue.tickets.find((t) => t.id === lead.linkedTicketId || t.ticketNo === lead.linkedTicketId)
    : undefined;
  const ids = new Set<string>();
  const rows = revenue.invoices.filter((inv) => {
    if (!isFinalizedInvoice(inv)) return false;
    const viaTicket = !!ticket && !!inv.ticketId && (inv.ticketId === ticket.id || inv.ticketId === ticket.ticketNo);
    const direct = !!lead.linkedInvoiceId && inv.id === lead.linkedInvoiceId;
    if (!(viaTicket || direct) || ids.has(inv.id)) return false;
    ids.add(inv.id);
    return true;
  });
  return rows;
}

export function applyLeadIntelligenceFilters(
  leads: Lead[],
  filters: LeadIntelligenceFilters,
  period: IntelligencePeriod,
): Lead[] {
  return leads.filter((lead) => {
    if (!inPeriod(lead, period)) return false;
    if (filters.storeIds.length > 0 && !filters.storeIds.includes(lead.branchId)) return false;
    if (filters.source && lead.source !== filters.source) return false;
    if (filters.modeOfLead && lead.modeOfContact !== filters.modeOfLead) return false;
    if (filters.leadCategory && lead.leadCategory !== filters.leadCategory) return false;
    if (filters.subCategory && lead.subCategory !== filters.subCategory) return false;
    if (filters.priority && lead.priority !== filters.priority) return false;
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.route && (lead.fulfilmentRoute || "").toUpperCase() !== filters.route) return false;
    if (filters.deviceCategoryId && lead.deviceCategoryId !== filters.deviceCategoryId) return false;
    if (filters.deviceBrandId && lead.deviceBrandId !== filters.deviceBrandId) return false;
    return true;
  });
}

function summaryFor(
  cohort: Lead[],
  followUps: LeadFollowUp[],
  revenue: IntelligenceRevenueSources,
  followUpUserId: string,
  asOf: number,
): IntelligenceSummary {
  const ids = new Set(cohort.map((l) => l.id));
  const ownedFollowUps = followUps.filter((f) => ids.has(f.leadId) && (!followUpUserId || f.followUpUserId === followUpUserId));
  const openFollowUps = ownedFollowUps.filter((f) => f.status === "scheduled" || f.status === "missed");
  const converted = cohort.filter(won);
  const invoiceIds = new Set<string>();
  let revenueWon = 0;
  for (const lead of cohort) {
    for (const inv of finalizedInvoicesForLead(lead, revenue)) {
      if (!invoiceIds.has(inv.id)) { invoiceIds.add(inv.id); revenueWon += Number(inv.total || 0); }
    }
  }
  const pipeline = cohort.filter((lead) => open(lead) && !isDownstreamGated(lead)).reduce((sum, l) => sum + value(l), 0);
  const expected = cohort.reduce((sum, l) => sum + value(l), 0);
  return {
    totalLeads: cohort.length,
    qualified: cohort.filter(isQualifiedLead).length,
    converted: converted.length,
    conversionRate: rate(converted.length, cohort.length),
    revenueWon,
    pipelineValue: pipeline,
    pendingFollowUps: openFollowUps.length,
    overdueFollowUps: openFollowUps.filter((f) => followUpLifecycle(f, asOf) === "Overdue").length,
    averageLeadValue: rate(expected, cohort.length),
    averageInvoiceValue: rate(revenueWon, invoiceIds.size),
    finalizedInvoices: invoiceIds.size,
  };
}

function labelForDimension(
  lead: Lead,
  dimension: IntelligenceDimension,
  labels: IntelligenceLabels,
): { key: string; label: string } {
  const routeLabel: Record<string, string> = { STORE_VISIT: "Walk-In", PICKUP_DROP: "Pickup & Drop", ON_SITE: "On-Site" };
  if (dimension === "source") return { key: lead.source, label: lead.source };
  if (dimension === "modeOfLead") return { key: lead.modeOfContact, label: lead.modeOfContact };
  if (dimension === "leadCategory") return { key: lead.leadCategory, label: lead.leadCategory };
  if (dimension === "subCategory") return { key: lead.subCategory, label: lead.subCategory };
  if (dimension === "priority") return { key: lead.priority, label: lead.priority };
  if (dimension === "deviceCategory") return { key: lead.deviceCategoryId, label: labels.deviceCategories?.[lead.deviceCategoryId] || lead.deviceCategoryId };
  if (dimension === "deviceBrand") return { key: lead.deviceBrandId, label: labels.deviceBrands?.[lead.deviceBrandId] || lead.deviceBrandId };
  if (dimension === "route") {
    const key = (lead.fulfilmentRoute || "").toUpperCase();
    return { key, label: routeLabel[key] || key };
  }
  if (dimension === "region") return { key: lead.region, label: lead.region };
  return { key: lead.branchId, label: labels.stores?.[lead.branchId] || lead.branchId };
}

function buildSegments(
  cohort: Lead[],
  revenue: IntelligenceRevenueSources,
  labels: IntelligenceLabels,
  overallRate: number,
  minSample: number,
): Record<IntelligenceDimension, SegmentPerformance[]> {
  const dimensions: IntelligenceDimension[] = [
    "source", "modeOfLead", "leadCategory", "subCategory", "priority",
    "deviceCategory", "deviceBrand", "route", "region", "store",
  ];
  const result = {} as Record<IntelligenceDimension, SegmentPerformance[]>;
  for (const dimension of dimensions) {
    const groups = new Map<string, { label: string; leads: Lead[] }>();
    for (const lead of cohort) {
      const item = labelForDimension(lead, dimension, labels);
      if (!item.key) continue;
      const group = groups.get(item.key) ?? { label: item.label, leads: [] };
      group.leads.push(lead);
      groups.set(item.key, group);
    }
    result[dimension] = [...groups.entries()].map(([key, group]) => {
      const converted = group.leads.filter(won).length;
      const qualified = group.leads.filter(isQualifiedLead).length;
      const revenueWon = group.leads.reduce((sum, l) => sum + revenueWonForLead(l, revenue.tickets, revenue.invoices), 0);
      const invoiceCount = group.leads.reduce((sum, l) => sum + finalizedInvoicesForLead(l, revenue).length, 0);
      const conversionRate = rate(converted, group.leads.length);
      return {
        dimension, key, label: group.label || key, leads: group.leads.length,
        qualified, converted, qualificationRate: rate(qualified, group.leads.length),
        conversionRate, revenueWon, averageInvoiceValue: rate(revenueWon, invoiceCount),
        liftVsOverall: conversionRate - overallRate,
        sufficient: group.leads.length >= minSample,
        evidenceIds: group.leads.map((l) => l.id),
      };
    }).sort((a, b) => b.leads - a.leads || b.conversionRate - a.conversionRate);
  }
  return result;
}

function buildPatterns(
  cohort: Lead[],
  revenue: IntelligenceRevenueSources,
  labels: IntelligenceLabels,
  overallRate: number,
  minSample: number,
): ConversionPattern[] {
  const combinations: IntelligenceDimension[][] = [
    ["source", "deviceCategory"],
    ["source", "priority"],
    ["source", "route"],
    ["modeOfLead", "priority"],
    ["leadCategory", "subCategory"],
    ["deviceCategory", "priority"],
    ["source", "deviceCategory", "priority"],
    ["source", "deviceCategory", "priority", "route"],
  ];
  const patterns: ConversionPattern[] = [];
  for (const dimensions of combinations) {
    const groups = new Map<string, { labels: string[]; leads: Lead[] }>();
    for (const lead of cohort) {
      const values = dimensions.map((d) => labelForDimension(lead, d, labels));
      if (values.some((v) => !v.key)) continue;
      const key = values.map((v) => v.key).join("::");
      const group = groups.get(key) ?? { labels: values.map((v) => v.label), leads: [] };
      group.leads.push(lead);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      const converted = group.leads.filter(won).length;
      const conversionRate = rate(converted, group.leads.length);
      patterns.push({
        key: `${dimensions.join("+")}:${key}`,
        label: group.labels.join(" + "),
        dimensions,
        leads: group.leads.length,
        converted,
        conversionRate,
        revenueWon: group.leads.reduce((sum, l) => sum + revenueWonForLead(l, revenue.tickets, revenue.invoices), 0),
        liftVsOverall: conversionRate - overallRate,
        sufficient: group.leads.length >= minSample,
        evidenceIds: group.leads.map((l) => l.id),
      });
    }
  }
  return patterns
    .filter((p) => p.sufficient)
    .sort((a, b) => b.liftVsOverall - a.liftVsOverall || b.revenueWon - a.revenueWon || b.leads - a.leads)
    .slice(0, 8);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildFollowUp(
  cohort: Lead[],
  followUps: LeadFollowUp[],
  followUpUserId: string,
  minSample: number,
  asOf: number,
): FollowUpIntelligence {
  const ids = new Set(cohort.map((l) => l.id));
  const rows = followUps.filter((f) => ids.has(f.leadId) && (!followUpUserId || f.followUpUserId === followUpUserId) && f.status !== "cancelled");
  const completed = rows.filter((f) => f.status === "completed");
  const openRows = rows.filter((f) => f.status === "scheduled" || f.status === "missed");
  const completedLeadIds = new Set(completed.map((f) => f.leadId));
  const withCompleted = cohort.filter((l) => completedLeadIds.has(l.id));
  const withoutCompleted = cohort.filter((l) => !completedLeadIds.has(l.id));
  return {
    scheduled: rows.length,
    completed: completed.length,
    overdue: openRows.filter((f) => followUpLifecycle(f, asOf) === "Overdue").length,
    pending: openRows.filter((f) => followUpLifecycle(f, asOf) !== "Overdue").length,
    completionRate: rate(completed.length, rows.length),
    convertedWithCompleted: withCompleted.filter(won).length,
    leadsWithCompleted: withCompleted.length,
    conversionWithCompletedRate: rate(withCompleted.filter(won).length, withCompleted.length),
    conversionWithoutCompletedRate: rate(withoutCompleted.filter(won).length, withoutCompleted.length),
    associationSupported: withCompleted.length >= minSample && withoutCompleted.length >= minSample
      && withCompleted.filter(won).length >= 2 && withoutCompleted.filter(won).length >= 2
      && Math.abs(rate(withCompleted.filter(won).length, withCompleted.length) - rate(withoutCompleted.filter(won).length, withoutCompleted.length)) >= LEAD_INTELLIGENCE_MATERIAL_LIFT,
    withCompletedEvidenceIds: withCompleted.map((l) => l.id),
    withoutCompletedEvidenceIds: withoutCompleted.map((l) => l.id),
  };
}

function buildAging(cohort: Lead[], revenue: IntelligenceRevenueSources, asOf: number): AgingBucket[] {
  const defs: { key: AgingBucket["key"]; label: string; min: number; max: number }[] = [
    { key: "0-1", label: "0–1 day", min: 0, max: 1 },
    { key: "2-3", label: "2–3 days", min: 2, max: 3 },
    { key: "4-7", label: "4–7 days", min: 4, max: 7 },
    { key: "8-14", label: "8–14 days", min: 8, max: 14 },
    { key: "15+", label: "15+ days", min: 15, max: Infinity },
  ];
  const eligible = cohort.filter((lead) => {
    if (open(lead)) return !isDownstreamGated(lead);
    if (!won(lead) || !lead.convertedAt) return false;
    const convertedAt = new Date(lead.convertedAt).getTime();
    return Number.isFinite(convertedAt) && convertedAt >= leadCreatedAt(lead);
  });
  return defs.map((def) => {
    const leads = eligible.filter((lead) => {
      const endpoint = won(lead) ? new Date(lead.convertedAt as string).getTime() : asOf;
      const days = Math.max(0, Math.floor((endpoint - leadCreatedAt(lead)) / DAY));
      return days >= def.min && days <= def.max;
    });
    const converted = leads.filter(won).length;
    return {
      key: def.key, label: def.label, leads: leads.length, openLeads: leads.filter(open).length,
      converted, conversionRate: rate(converted, leads.length),
      pipelineValue: leads.filter((lead) => open(lead) && !isDownstreamGated(lead)).reduce((sum, l) => sum + value(l), 0),
      evidenceIds: leads.map((l) => l.id),
    };
  });
}

function buildLossReasons(cohort: Lead[]): LossReasonRow[] {
  const closedLeads = cohort.filter((lead) => lost(lead) || isNotQualified(lead.qualification));
  const groups = new Map<string, Lead[]>();
  for (const lead of closedLeads) {
    const rawReason = lead.lostReason || (isNotQualified(lead.qualification) ? lead.finalRemarks : "");
    const reason = (rawReason || "Unspecified").trim() || "Unspecified";
    groups.set(reason, [...(groups.get(reason) ?? []), lead]);
  }
  return [...groups.entries()].map(([reason, leads]) => ({
    reason, count: leads.length, share: rate(leads.length, closedLeads.length),
    potentialValue: leads.reduce((sum, l) => sum + value(l), 0), evidenceIds: leads.map((l) => l.id),
  })).sort((a, b) => b.potentialValue - a.potentialValue || b.count - a.count);
}

function buildValueSegments(cohort: Lead[], revenue: IntelligenceRevenueSources, minSample: number): ValueSegment[] {
  const defs = [
    { key: "0-5k", label: "₹0–₹5k", min: 0, max: 5_000 },
    { key: "5k-15k", label: "₹5k–₹15k", min: 5_000, max: 15_000 },
    { key: "15k+", label: "₹15k+", min: 15_000, max: Infinity },
  ];
  return defs.map((def, index) => {
    const leads = cohort.filter((l) => {
      const v = value(l);
      return index === 0 ? v >= def.min && v <= def.max : v > def.min && v <= def.max;
    });
    const converted = leads.filter(won).length;
    return {
      key: def.key, label: def.label, leads: leads.length, converted,
      conversionRate: rate(converted, leads.length),
      pipelineValue: leads.filter((lead) => open(lead) && !isDownstreamGated(lead)).reduce((sum, l) => sum + value(l), 0),
      revenueWon: leads.reduce((sum, l) => sum + revenueWonForLead(l, revenue.tickets, revenue.invoices), 0),
      sufficient: leads.length >= minSample, evidenceIds: leads.map((l) => l.id),
    };
  });
}

function buildTiming(cohort: Lead[], revenue: IntelligenceRevenueSources, minSample: number): TimingMetric[] {
  const empty = () => ({ values: [] as number[], ids: [] as string[] });
  const buckets: Record<TimingMetric["key"], { values: number[]; ids: string[] }> = {
    firstContact: empty(), qualification: empty(), conversion: empty(), qualificationToTicket: empty(), ticketToInvoice: empty(),
  };
  const add = (key: TimingMetric["key"], lead: Lead, hours: number) => {
    buckets[key].values.push(hours);
    buckets[key].ids.push(lead.id);
  };
  for (const lead of cohort) {
    const created = leadCreatedAt(lead);
    const firstContact = lead.firstContactedAt ? new Date(lead.firstContactedAt).getTime() : NaN;
    const qualified = lead.qualifiedAt ? new Date(lead.qualifiedAt).getTime() : NaN;
    const converted = lead.convertedAt ? new Date(lead.convertedAt).getTime() : NaN;
    const ticket = lead.linkedTicketId ? revenue.tickets.find((t) => t.id === lead.linkedTicketId || t.ticketNo === lead.linkedTicketId) : undefined;
    const ticketAt = ticket?.createdAt ? new Date(ticket.createdAt).getTime() : NaN;
    const invoiceTimes = finalizedInvoicesForLead(lead, revenue).map((i) => i.createdAt ? new Date(i.createdAt).getTime() : NaN).filter(Number.isFinite);
    const invoiceAt = invoiceTimes.length ? Math.min(...invoiceTimes) : NaN;
    if (Number.isFinite(firstContact) && firstContact >= created) add("firstContact", lead, (firstContact - created) / 3_600_000);
    if (Number.isFinite(qualified) && qualified >= created) add("qualification", lead, (qualified - created) / 3_600_000);
    if (Number.isFinite(converted) && converted >= created) add("conversion", lead, (converted - created) / 3_600_000);
    if (Number.isFinite(qualified) && Number.isFinite(ticketAt) && ticketAt >= qualified) add("qualificationToTicket", lead, (ticketAt - qualified) / 3_600_000);
    if (Number.isFinite(ticketAt) && Number.isFinite(invoiceAt) && invoiceAt >= ticketAt) add("ticketToInvoice", lead, (invoiceAt - ticketAt) / 3_600_000);
  }
  const labels: Record<TimingMetric["key"], string> = {
    firstContact: "Lead → first contact", qualification: "Lead → qualification", conversion: "Lead → conversion",
    qualificationToTicket: "Qualification → Ticket", ticketToInvoice: "Ticket → finalized Invoice",
  };
  return (Object.keys(buckets) as TimingMetric["key"][]).map((key) => ({
    key, label: labels[key], medianHours: median(buckets[key].values), samples: buckets[key].values.length,
    sufficient: buckets[key].values.length >= minSample, evidenceIds: buckets[key].ids,
  }));
}

function buildContactSpeed(cohort: Lead[], minSample: number): ContactSpeedBucket[] {
  const defs = [
    { key: "under15", label: "<15 min", min: 0, max: 0.25 },
    { key: "15to60", label: "15–60 min", min: 0.25, max: 1 },
    { key: "1to4", label: "1–4 hr", min: 1, max: 4 },
    { key: "4plus", label: "4+ hr", min: 4, max: Infinity },
  ];
  return defs.map((def, index) => {
    const leads = cohort.filter((lead) => {
      if (!lead.firstContactedAt) return false;
      const hours = (new Date(lead.firstContactedAt).getTime() - leadCreatedAt(lead)) / 3_600_000;
      return Number.isFinite(hours) && hours >= def.min && (index === 0 ? hours < def.max : hours >= def.min && hours < def.max);
    });
    const converted = leads.filter(won).length;
    return { key: def.key, label: def.label, leads: leads.length, converted, conversionRate: rate(converted, leads.length), sufficient: leads.length >= minSample, evidenceIds: leads.map((l) => l.id) };
  });
}

function latestActivityAt(lead: Lead, followUps: LeadFollowUp[]): number {
  const times = [lead.updatedAt, lead.routedAt, lead.firstContactedAt, lead.qualifiedAt]
    .filter(Boolean).map((v) => new Date(v as string).getTime()).filter(Number.isFinite);
  for (const f of followUps) {
    if (f.leadId !== lead.id) continue;
    for (const raw of [f.completedAt, f.createdAt]) {
      if (!raw) continue;
      const t = new Date(raw).getTime();
      if (Number.isFinite(t)) times.push(t);
    }
  }
  return times.length ? Math.max(...times) : leadCreatedAt(lead);
}

function buildStalls(cohort: Lead[], followUps: LeadFollowUp[], followUpUserId: string, asOf: number): StalledLeadAnalysis {
  const openQualified = cohort.filter((l) => open(l) && isQualifiedLead(l) && !isDownstreamGated(l));
  const positiveValues = openQualified.map(value).filter((v) => v > 0);
  const highValueThreshold = positiveValues.length >= 4 ? percentile(positiveValues, 0.75) : null;
  const rowsFor = (leadId: string) => followUps.filter((f) => f.leadId === leadId && (!followUpUserId || f.followUpUserId === followUpUserId));
  const hasFuture = (lead: Lead) => rowsFor(lead.id).some((f) => f.status === "scheduled" && new Date(f.dueAt).getTime() > asOf);
  const isOverdue = (lead: Lead) => rowsFor(lead.id).some((f) => (f.status === "scheduled" || f.status === "missed") && followUpLifecycle(f, asOf) === "Overdue");
  const qualifiedWithoutFutureFollowUp = openQualified.filter((l) => !hasFuture(l));
  const overdueQualified = openQualified.filter(isOverdue);
  const repeatedIncompleteFollowUps = openQualified.filter((l) => rowsFor(l.id).filter((f) => f.status === "missed" || ((f.status === "scheduled") && followUpLifecycle(f, asOf) === "Overdue")).length >= 2);
  const stalePipeline = cohort.filter((l) => open(l) && !isDownstreamGated(l) && asOf - latestActivityAt(l, rowsFor(l.id)) >= 7 * DAY);
  const highValueComparator = highValueThreshold == null
    ? () => false
    : positiveValues.some((v) => v > highValueThreshold)
      ? (lead: Lead) => value(lead) > highValueThreshold
      : (lead: Lead) => value(lead) >= highValueThreshold;
  const highValueStalled = highValueThreshold == null ? [] : openQualified.filter((l) => highValueComparator(l) && (!hasFuture(l) || isOverdue(l) || asOf - latestActivityAt(l, rowsFor(l.id)) >= 7 * DAY));
  const sum = (leads: Lead[]) => leads.reduce((total, l) => total + value(l), 0);
  return {
    highValueThreshold, highValueStalled, qualifiedWithoutFutureFollowUp, overdueQualified,
    repeatedIncompleteFollowUps, stalePipeline,
    highValueStalledValue: sum(highValueStalled), qualifiedWithoutFollowUpValue: sum(qualifiedWithoutFutureFollowUp),
    overdueQualifiedValue: sum(overdueQualified), stalePipelineValue: sum(stalePipeline),
  };
}

function funnelFor(cohort: Lead[], revenue: IntelligenceRevenueSources): FunnelStage[] {
  const total = cohort;
  const contactedLeads = total.filter(contacted);
  const qualifiedLeads = contactedLeads.filter(isQualifiedLead);
  const activeLeads = qualifiedLeads.filter((l) => !isDownstreamGated(l) && (open(l) || !!l.fulfilmentRoute || !!l.linkedTicketId || won(l)));
  const ticketLeads = activeLeads.filter((l) => !!l.linkedTicketId);
  const invoicedLeads = ticketLeads.filter((l) => finalizedInvoicesForLead(l, revenue).length > 0);
  const sets: { key: FunnelStage["key"]; label: string; leads: Lead[] }[] = [
    { key: "total", label: "Total", leads: total },
    { key: "contacted", label: "Contacted", leads: contactedLeads },
    { key: "qualified", label: "Qualified", leads: qualifiedLeads },
    { key: "active", label: "Active workflow", leads: activeLeads },
    { key: "ticket", label: "Ticket", leads: ticketLeads },
    { key: "won", label: "Finalized invoice", leads: invoicedLeads },
  ];
  return sets.map((stage, index) => ({
    key: stage.key, label: stage.label, count: stage.leads.length,
    fromPreviousRate: index === 0 ? null : rate(stage.leads.length, sets[index - 1].leads.length),
    evidenceIds: stage.leads.map((l) => l.id),
  }));
}

function previousPeriod(period: IntelligencePeriod): IntelligencePeriod | null {
  if (period.from == null || period.to == null) return null;
  const duration = Math.max(DAY, period.to - period.from + 1);
  const to = period.from - 1;
  const from = to - duration + 1;
  return { key: "custom", label: "Previous comparable period", from, to, fromISO: isoDay(from), toISO: isoDay(to), semantics: "lead-created cohort" };
}

function generateFocusInsights(
  result: Omit<LeadIntelligenceResult, "focusInsights" | "trend">,
): EvidenceInsight[] {
  const insights: EvidenceInsight[] = [];
  const periodLabel = result.period.label;
  const add = (i: EvidenceInsight) => { if (i.evidenceIds.length) insights.push(i); };
  if (result.stalls.highValueStalled.length > 0) add({
    id: "high-value-stalls", category: "High-value stalls", title: "Value needing attention",
    metric: currency(result.stalls.highValueStalledValue),
    interpretation: `${result.stalls.highValueStalled.length} qualified high-value lead${result.stalls.highValueStalled.length === 1 ? "" : "s"} have an overdue, missing, or stale follow-up signal.`,
    numerator: result.stalls.highValueStalled.length, denominator: result.summary.totalLeads,
    sampleSize: result.stalls.highValueStalled.length, baseline: result.stalls.highValueThreshold,
    periodLabel, evidenceIds: result.stalls.highValueStalled.map((l) => l.id), tone: "attention",
  });
  if (result.stalls.qualifiedWithoutFutureFollowUp.length > 0) add({
    id: "qualified-no-follow-up", category: "Pipeline coverage", title: "Qualified without next follow-up",
    metric: currency(result.stalls.qualifiedWithoutFollowUpValue),
    interpretation: `${result.stalls.qualifiedWithoutFutureFollowUp.length} open qualified lead${result.stalls.qualifiedWithoutFutureFollowUp.length === 1 ? " has" : "s have"} no future follow-up.`,
    numerator: result.stalls.qualifiedWithoutFutureFollowUp.length, denominator: result.summary.qualified,
    sampleSize: result.stalls.qualifiedWithoutFutureFollowUp.length, baseline: null,
    periodLabel, evidenceIds: result.stalls.qualifiedWithoutFutureFollowUp.map((l) => l.id), tone: "attention",
  });
  const strongest = result.strongestPatterns.find((p) => p.liftVsOverall >= LEAD_INTELLIGENCE_MATERIAL_LIFT && p.converted >= 2);
  if (strongest) add({
    id: `strong-${strongest.key}`, category: "Observed strongest pattern", title: strongest.label,
    metric: percent(strongest.conversionRate),
    interpretation: `${strongest.converted} of ${strongest.leads} leads converted; ${signedPoints(strongest.liftVsOverall)} vs your overall cohort.`,
    numerator: strongest.converted, denominator: strongest.leads, sampleSize: strongest.leads,
    baseline: result.summary.conversionRate, periodLabel, evidenceIds: strongest.evidenceIds, tone: "positive",
  });
  const topSource = result.segments.source.filter((s) => s.sufficient && s.converted >= 2 && s.liftVsOverall >= LEAD_INTELLIGENCE_MATERIAL_LIFT).sort((a, b) => b.conversionRate - a.conversionRate || b.leads - a.leads)[0];
  if (topSource) add({
    id: `source-${topSource.key}`, category: "Source quality", title: topSource.label,
    metric: percent(topSource.conversionRate),
    interpretation: `${topSource.converted} converted across ${topSource.leads} leads; observed against ${percent(result.summary.conversionRate)} overall.`,
    numerator: topSource.converted, denominator: topSource.leads, sampleSize: topSource.leads,
    baseline: result.summary.conversionRate, periodLabel, evidenceIds: topSource.evidenceIds, tone: "neutral",
  });
  if (result.followUp.associationSupported) add({
    id: "follow-up-association", category: "Follow-up association", title: "Completed follow-up cohort",
    metric: percent(result.followUp.conversionWithCompletedRate),
    interpretation: `Observed conversion with a completed follow-up vs ${percent(result.followUp.conversionWithoutCompletedRate)} without one; this is association, not causation.`,
    numerator: result.followUp.convertedWithCompleted, denominator: result.followUp.leadsWithCompleted,
    sampleSize: result.followUp.leadsWithCompleted, baseline: result.followUp.conversionWithoutCompletedRate,
    periodLabel, evidenceIds: result.followUp.withCompletedEvidenceIds, tone: "neutral",
  });
  return insights.slice(0, 5);
}

function percent(v: number): string { return `${Math.round(v * 100)}%`; }
function signedPoints(v: number): string { return `${v >= 0 ? "+" : ""}${Math.round(v * 100)} pts`; }
function currency(v: number): string { return `₹${Math.round(v).toLocaleString("en-IN")}`; }

export function calculateLeadIntelligence(input: CalculateLeadIntelligenceInput): LeadIntelligenceResult {
  const asOf = input.asOf ?? Date.now();
  const minSample = Math.max(3, input.minSample ?? LEAD_INTELLIGENCE_MIN_SAMPLE);
  const followUpUserId = input.followUpUserId ?? input.agentUserId;
  const labels = input.labels ?? {};
  const period = resolveIntelligencePeriod(input.filters.dateRange, input.filters.customFrom, input.filters.customTo, asOf);
  // Ownership is canonical staff.id. Caller supplies an already-authorized set;
  // this additional predicate prevents accidental cross-agent aggregation.
  const owned = input.leads.filter((l) => l.assignedTo === input.agentUserId);
  const cohort = applyLeadIntelligenceFilters(owned, input.filters, period);
  const summary = summaryFor(cohort, input.followUps, input.revenue, followUpUserId, asOf);
  const cohortIds = new Set(cohort.map((lead) => lead.id));
  const pendingRows = input.followUps.filter((followUp) => cohortIds.has(followUp.leadId) && (!followUpUserId || followUp.followUpUserId === followUpUserId) && (followUp.status === "scheduled" || followUp.status === "missed"));
  const summaryEvidence: LeadIntelligenceResult["summaryEvidence"] = {
    total: cohort.map((lead) => lead.id),
    qualified: cohort.filter(isQualifiedLead).map((lead) => lead.id),
    converted: cohort.filter(won).map((lead) => lead.id),
    revenueWon: cohort.filter((lead) => finalizedInvoicesForLead(lead, input.revenue).length > 0).map((lead) => lead.id),
    pipelineValue: cohort.filter((lead) => open(lead) && !isDownstreamGated(lead)).map((lead) => lead.id),
    pendingFollowUps: [...new Set(pendingRows.map((followUp) => followUp.leadId))],
    overdueFollowUps: [...new Set(pendingRows.filter((followUp) => followUpLifecycle(followUp, asOf) === "Overdue").map((followUp) => followUp.leadId))],
  };
  const funnel = funnelFor(cohort, input.revenue);
  const leakages = funnel.slice(1).map((stage, index) => {
    const previous = funnel[index];
    const progressed = new Set(stage.evidenceIds);
    return {
      from: previous.label, to: stage.label, lost: previous.count - stage.count,
      passRate: rate(stage.count, previous.count), sufficient: previous.count >= minSample,
      evidenceIds: previous.evidenceIds.filter((id) => !progressed.has(id)),
    };
  }).filter((l) => l.sufficient);
  const leakage = leakages.sort((a, b) => b.lost - a.lost || a.passRate - b.passRate)[0] ?? null;
  const segments = buildSegments(cohort, input.revenue, labels, summary.conversionRate, minSample);
  const supportedDimensions = (Object.keys(segments) as IntelligenceDimension[]).filter((d) => segments[d].some((s) => s.sufficient));
  const strongestPatterns = buildPatterns(cohort, input.revenue, labels, summary.conversionRate, minSample);
  const weakestPatterns = (Object.values(segments).flat() as SegmentPerformance[])
    .filter((s) => s.sufficient && s.converted < s.leads && s.liftVsOverall <= -LEAD_INTELLIGENCE_MATERIAL_LIFT)
    .sort((a, b) => a.conversionRate - b.conversionRate || b.leads - a.leads).slice(0, 4);
  const strongestProfile = strongestPatterns.find((p) => p.dimensions.length >= 3 && p.liftVsOverall >= LEAD_INTELLIGENCE_MATERIAL_LIFT && p.converted >= 2) ?? strongestPatterns.find((p) => p.liftVsOverall >= LEAD_INTELLIGENCE_MATERIAL_LIFT && p.converted >= 2) ?? null;
  const followUp = buildFollowUp(cohort, input.followUps, followUpUserId, minSample, asOf);
  const aging = buildAging(cohort, input.revenue, asOf);
  const lossReasons = buildLossReasons(cohort);
  const valueSegments = buildValueSegments(cohort, input.revenue, minSample);
  const timing = buildTiming(cohort, input.revenue, minSample);
  const contactSpeed = buildContactSpeed(cohort, minSample);
  const stalls = buildStalls(cohort, input.followUps, followUpUserId, asOf);
  const dataQualityWarnings: string[] = [];
  const missingOutcome = cohort.filter((l) => !won(l) && !lost(l)).length;
  const missingSource = cohort.filter((l) => !l.source).length;
  const convertedWithoutTimestamp = cohort.filter((l) => won(l) && !l.convertedAt).length;
  const invalidConversionChronology = cohort.filter((lead) => {
    if (!won(lead) || !lead.convertedAt) return false;
    const convertedAt = new Date(lead.convertedAt).getTime();
    return !Number.isFinite(convertedAt) || convertedAt < leadCreatedAt(lead);
  }).length;
  const closedWithoutReason = cohort.filter((lead) => {
    if (lost(lead)) return !lead.lostReason && !(isNotQualified(lead.qualification) && !!lead.finalRemarks);
    return isNotQualified(lead.qualification) && !lead.finalRemarks;
  }).length;
  if (missingOutcome > 0) dataQualityWarnings.push(`${missingOutcome} lead${missingOutcome === 1 ? " has" : "s have"} no final outcome yet; conversion findings remain cohort observations.`);
  if (missingSource > 0) dataQualityWarnings.push(`${missingSource} lead${missingSource === 1 ? " is" : "s are"} missing Source and is excluded from source comparisons.`);
  if (convertedWithoutTimestamp > 0) dataQualityWarnings.push(`${convertedWithoutTimestamp} converted lead${convertedWithoutTimestamp === 1 ? " lacks" : "s lack"} a reliable conversion timestamp.`);
  if (invalidConversionChronology > 0) dataQualityWarnings.push(`${invalidConversionChronology} converted lead${invalidConversionChronology === 1 ? " has" : "s have"} a conversion timestamp before creation and is excluded from aging/timing.`);
  if (closedWithoutReason > 0) dataQualityWarnings.push(`${closedWithoutReason} lost/disqualified lead${closedWithoutReason === 1 ? " has" : "s have"} no structured reason.`);
  if (stalls.stalePipeline.length > 0) dataQualityWarnings.push("Stale-pipeline age uses Lead and structured follow-up timestamps; normalized activity-history timestamps are not yet available in this client view.");
  if (cohort.length > 0 && !timing.some((t) => t.sufficient)) dataQualityWarnings.push(`Timing insights need at least ${minSample} leads with reliable event timestamps.`);
  if (cohort.length > 0 && summary.finalizedInvoices === 0) dataQualityWarnings.push("No finalized linked invoices were found for this cohort; Revenue Won is ₹0.");

  const baseWithoutInsights: Omit<LeadIntelligenceResult, "focusInsights" | "trend"> = {
    period, minSample, cohort, summary, summaryEvidence, funnel, leakage, segments, supportedDimensions,
    strongestPatterns, weakestPatterns, strongestProfile, followUp, aging, lossReasons,
    valueSegments, timing, contactSpeed, stalls, dataQualityWarnings,
  };
  const focusInsights = generateFocusInsights(baseWithoutInsights);
  const prev = previousPeriod(period);
  let previousSummary: IntelligenceSummary | null = null;
  if (prev) {
    const previousCohort = applyLeadIntelligenceFilters(owned, { ...input.filters, dateRange: "custom", customFrom: prev.fromISO, customTo: prev.toISO }, prev);
    previousSummary = summaryFor(previousCohort, input.followUps, input.revenue, followUpUserId, asOf);
  }
  return {
    ...baseWithoutInsights,
    focusInsights,
    trend: { available: !!previousSummary, label: prev?.label ?? "", current: summary, previous: previousSummary },
  };
}
