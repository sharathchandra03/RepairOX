import {
  EMPTY_INTELLIGENCE_FILTERS,
  type IntelligenceDateRange,
  type IntelligenceRoute,
  type LeadIntelligenceFilters,
  type IntelligencePeriod,
} from "@/lib/lead-intelligence";

const DATE_RANGES = new Set<IntelligenceDateRange>(["today", "thisWeek", "thisMonth", "lastMonth", "last3Months", "custom", "all"]);
const ROUTES = new Set<IntelligenceRoute>(["", "STORE_VISIT", "PICKUP_DROP", "ON_SITE"]);

export function parseIntelligenceFilters(params: Pick<URLSearchParams, "get" | "getAll">): LeadIntelligenceFilters {
  const date = params.get("period") as IntelligenceDateRange | null;
  const route = (params.get("route") ?? "") as IntelligenceRoute;
  return {
    ...EMPTY_INTELLIGENCE_FILTERS,
    dateRange: date && DATE_RANGES.has(date) ? date : EMPTY_INTELLIGENCE_FILTERS.dateRange,
    customFrom: params.get("from") ?? "",
    customTo: params.get("to") ?? "",
    storeIds: params.getAll("store").filter(Boolean),
    source: params.get("source") ?? "",
    modeOfLead: params.get("mode") ?? "",
    leadCategory: params.get("leadCategory") ?? "",
    subCategory: params.get("subCategory") ?? "",
    priority: params.get("priority") ?? "",
    status: params.get("status") ?? "",
    route: ROUTES.has(route) ? route : "",
    deviceCategoryId: params.get("deviceCategory") ?? "",
    deviceBrandId: params.get("deviceBrand") ?? "",
  };
}

export function intelligenceFilterParams(filters: LeadIntelligenceFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.dateRange !== EMPTY_INTELLIGENCE_FILTERS.dateRange) params.set("period", filters.dateRange);
  if (filters.customFrom) params.set("from", filters.customFrom);
  if (filters.customTo) params.set("to", filters.customTo);
  filters.storeIds.forEach((id) => params.append("store", id));
  if (filters.source) params.set("source", filters.source);
  if (filters.modeOfLead) params.set("mode", filters.modeOfLead);
  if (filters.leadCategory) params.set("leadCategory", filters.leadCategory);
  if (filters.subCategory) params.set("subCategory", filters.subCategory);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.status) params.set("status", filters.status);
  if (filters.route) params.set("route", filters.route);
  if (filters.deviceCategoryId) params.set("deviceCategory", filters.deviceCategoryId);
  if (filters.deviceBrandId) params.set("deviceBrand", filters.deviceBrandId);
  return params;
}

export function buildAgentIntelligenceHref(agentId: string, filters: LeadIntelligenceFilters): string {
  const query = intelligenceFilterParams(filters).toString();
  return `/leads/intelligence/agents/${encodeURIComponent(agentId)}${query ? `?${query}` : ""}`;
}

const MAX_INLINE_EVIDENCE_IDS = 40;
const EVIDENCE_PREFIX = "repairox-lead-evidence::";

function evidenceToken(ids: string[], agentUserId: string): string {
  let hash = 2166136261;
  const source = `${agentUserId}|${ids.join("|")}`;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${ids.length}-${(hash >>> 0).toString(36)}`;
}

function persistEvidence(ids: string[], agentUserId: string): string | null {
  const token = evidenceToken(ids, agentUserId);
  if (typeof window === "undefined") return null;
  try {
    window.localStorage.setItem(`${EVIDENCE_PREFIX}${agentUserId}::${token}`, JSON.stringify({ ids, expiresAt: Date.now() + 86_400_000 }));
    return token;
  } catch { return null; }
}

export function resolveLeadEvidenceIds(params: Pick<URLSearchParams, "get">): string[] {
  const inline = (params.get("evidenceIds") || "").split(",").map((id) => id.trim()).filter(Boolean);
  if (inline.length) return inline;
  const token = params.get("evidenceToken");
  const agent = params.get("assignedTo") || "";
  if (!token || !agent || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${EVIDENCE_PREFIX}${agent}::${token}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ids?: unknown; expiresAt?: number };
    if (!parsed.expiresAt || parsed.expiresAt < Date.now() || !Array.isArray(parsed.ids)) {
      window.localStorage.removeItem(`${EVIDENCE_PREFIX}${agent}::${token}`);
      return [];
    }
    return parsed.ids.filter((id): id is string => typeof id === "string" && !!id);
  } catch { return []; }
}

/** Exact evidence links use inline ids for compact cohorts and a bounded,
 * user/subject-scoped 24-hour browser token for large cohorts. RLS remains the
 * authority when the Lead Table resolves either representation. */
export function buildLeadEvidenceHref(
  ids: string[],
  filters: LeadIntelligenceFilters,
  period: IntelligencePeriod,
  agentUserId: string,
): string {
  const params = new URLSearchParams();
  if (ids.length > MAX_INLINE_EVIDENCE_IDS) {
    const token = persistEvidence(ids, agentUserId);
    if (token) params.set("evidenceToken", token);
    else params.set("evidenceIds", ids.join(",")); // exact fail-safe when browser storage is unavailable
  } else if (ids.length) params.set("evidenceIds", ids.join(","));
  if (agentUserId) params.set("assignedTo", agentUserId);
  if (period.fromISO || period.toISO) {
    params.set("dateRange", "custom");
    if (period.fromISO) params.set("from", period.fromISO);
    if (period.toISO) params.set("to", period.toISO);
  }
  if (filters.source) params.set("source", filters.source);
  if (filters.modeOfLead) params.set("modeOfContact", filters.modeOfLead);
  if (filters.leadCategory) params.set("leadCategory", filters.leadCategory);
  if (filters.subCategory) params.set("subCategory", filters.subCategory);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.status) params.set("status", filters.status);
  if (filters.route) params.set("fulfilmentRoute", filters.route);
  if (filters.deviceCategoryId) params.set("deviceCategoryId", filters.deviceCategoryId);
  if (filters.deviceBrandId) params.set("deviceBrandId", filters.deviceBrandId);
  return `/leads/list?${params.toString()}`;
}
