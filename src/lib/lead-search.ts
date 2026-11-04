/* ──────────────────────────────────────────────────────────────────────────
   Lead Intelligence Search — client contract + RPC wrappers.

   The server (migration 0088: lead_search / lead_reference_get /
   lead_customer_history / lead_repeat_check / lead_request_handoff /
   lead_handoff_decide) owns visibility, matching, normalisation and ranking.
   This module only:
     • types the payloads,
     • calls the RPCs (never fetches whole tables),
     • provides a small LOCAL-MODE fallback over already-loaded arrays when
       Supabase is not configured (demo mode),
     • exposes display helpers (match highlighting, URLs).

   Searching / opening a lead is NOT a sales activity: nothing in here writes a
   lead, an activity row, a follow-up or a status.
   ────────────────────────────────────────────────────────────────────────── */
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeCustomerPhone as normalizeMobile } from "@/lib/customer-data";

export type LeadSearchEntity = "all" | "customers" | "leads" | "contacts" | "followups";
export type LeadSearchActive = "all" | "active" | "history";

export interface LeadSearchParams {
  query: string;
  entity?: LeadSearchEntity;
  limit?: number;
  offset?: number;
  status?: string;
  contactStatus?: string;
  agentId?: string;
  branchId?: string;
  region?: string;
  source?: string;
  from?: string; // yyyy-mm-dd
  to?: string;
  active?: LeadSearchActive;
  sort?: "relevance" | "recent";
}

export interface LeadHit {
  id: string;
  lead_no: string;
  name: string;
  number: string;
  email: string;
  device: string;
  issue: string;
  status: string;
  contact_status: string;
  lead_nature: string;
  result: string;
  assigned_user_id: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  branch_id: string | null;
  store_name: string | null;
  region: string;
  source: string;
  capture_channel: string;
  lead_date: string | null;
  created_at: string;
  assigned_at: string | null;
  customer_id: string | null;
  closed: boolean;
  is_owner: boolean;
  /** true = the caller can see this lead through normal (own/team) visibility. */
  ordinary: boolean;
  open_followup: boolean;
  next_followup_at: string | null;
  last_activity: string | null;
  score: number;
  match_field: string;
}

export interface CustomerHit {
  id: string;
  name: string;
  mobile: string;
  alt_mobile: string | null;
  email: string | null;
  company: string | null;
  created_at: string;
  branch_id: string | null;
  lead_count: number;
  active_count: number;
  agents: string[];
  last_activity: string | null;
  score: number;
  match_field: string;
}

export interface ContactHit {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  customer_id: string | null;
  score: number;
  match_field: string;
}

export interface FollowUpHit {
  id: string;
  lead_id: string;
  lead_no: string;
  customer_name: string;
  scheduled_at: string | null;
  status: string;
  comments: string | null;
  completed_at: string | null;
  agent_name: string | null;
  is_open: boolean;
}

export interface Group<T> {
  total: number;
  rows: T[];
}

export interface LeadSearchResponse {
  forbidden: boolean;
  leads: Group<LeadHit>;
  customers: Group<CustomerHit>;
  contacts: Group<ContactHit>;
  followups: Group<FollowUpHit>;
}

export const EMPTY_SEARCH: LeadSearchResponse = {
  forbidden: false,
  leads: { total: 0, rows: [] },
  customers: { total: 0, rows: [] },
  contacts: { total: 0, rows: [] },
  followups: { total: 0, rows: [] },
};

export const MIN_QUERY_LENGTH = 2;

function normaliseResponse(raw: Partial<LeadSearchResponse> | null): LeadSearchResponse {
  if (!raw) return EMPTY_SEARCH;
  return {
    forbidden: !!raw.forbidden,
    leads: raw.leads ?? EMPTY_SEARCH.leads,
    customers: raw.customers ?? EMPTY_SEARCH.customers,
    contacts: raw.contacts ?? EMPTY_SEARCH.contacts,
    followups: raw.followups ?? EMPTY_SEARCH.followups,
  };
}

/** Server-side search. Throws on transport / SQL error (UI shows the error state). */
export async function rpcLeadSearch(p: LeadSearchParams): Promise<LeadSearchResponse> {
  if (!supabase) throw new Error("Search backend unavailable");
  const { data, error } = await supabase.rpc("lead_search", {
    p_query: p.query,
    p_entity: p.entity ?? "all",
    p_limit: p.limit ?? 5,
    p_offset: p.offset ?? 0,
    p_status: p.status || null,
    p_contact_status: p.contactStatus || null,
    p_agent: p.agentId || null,
    p_branch: p.branchId || null,
    p_region: p.region || null,
    p_source: p.source || null,
    p_from: p.from || null,
    p_to: p.to || null,
    p_active: p.active ?? "all",
    p_sort: p.sort ?? "relevance",
  });
  if (error) throw new Error(error.message);
  return normaliseResponse(data as Partial<LeadSearchResponse>);
}

export const isDbSearch = () => isSupabaseConfigured && !!supabase;

/* ── Reference / history / repeat-check / handoff ───────────────────────── */

export interface ReferenceBundle {
  reference: boolean;
  lead: Record<string, unknown>;
  created_by_name: string | null;
  updated_by_name: string | null;
  store_name: string | null;
  last_activity: string | null;
  assignment: Record<string, unknown>[];
  followups: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  status_history: Record<string, unknown>[];
  conversion: Record<string, unknown>[];
  pending_handoff: HandoffRequest | null;
}

export interface HandoffRequest {
  id: string;
  lead_id: string;
  lead_no: string | null;
  customer_name: string | null;
  owner_staff_id: string | null;
  owner_name: string | null;
  requested_by: string;
  requested_by_name: string | null;
  reason: string;
  note: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export async function rpcLeadReference(leadId: string, via: "lead" | "customer_history" = "lead"): Promise<ReferenceBundle | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("lead_reference_get", { p_lead_id: leadId, p_via: via });
  if (error) throw new Error(error.message);
  return (data as ReferenceBundle | null) ?? null;
}

export interface CustomerHistory {
  customer: { id: string; name: string; mobile: string; alt_mobile: string | null; email: string | null; company: string | null; status: string; created_at: string };
  full_history: boolean;
  leads: CustomerHistoryLead[];
  timeline: TimelineEvent[];
}
export interface CustomerHistoryLead {
  id: string;
  lead_no: string;
  name: string;
  device: string;
  issue: string;
  source: string;
  status: string;
  contact_status: string;
  result: string;
  lead_nature: string;
  assigned_user_id: string | null;
  assigned_to_name: string | null;
  created_by_name: string | null;
  created_at: string;
  assigned_at: string | null;
  closed: boolean;
  ordinary: boolean;
  is_owner: boolean;
  store_name: string | null;
  next_followup_at: string | null;
  open_followup: boolean;
  overdue_followup: boolean;
  last_activity: string | null;
}
export interface TimelineEvent {
  lead_id: string;
  lead_no: string;
  kind: "lead_created" | "assignment" | "activity" | "followup" | "status" | "conversion";
  title: string;
  detail: string | null;
  actor: string | null;
  at: string;
}

export async function rpcCustomerHistory(customerId: string): Promise<CustomerHistory | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("lead_customer_history", { p_customer_id: customerId });
  if (error) throw new Error(error.message);
  return (data as CustomerHistory | null) ?? null;
}

export interface RepeatCheck {
  customer: { id: string; name: string; mobile: string; email: string | null } | null;
  leads: {
    id: string; lead_no: string; name: string; device: string; issue: string; status: string;
    contact_status: string; assigned_user_id: string | null; assigned_to_name: string | null;
    created_at: string; is_owner: boolean; ordinary: boolean; similar: boolean;
  }[];
}

export async function rpcRepeatCheck(a: { phone?: string; email?: string; customerId?: string; device?: string; issue?: string }): Promise<RepeatCheck | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("lead_repeat_check", {
    p_phone: a.phone || null, p_email: a.email || null, p_customer_id: a.customerId || null,
    p_device: a.device || null, p_issue: a.issue || null,
  });
  if (error) throw new Error(error.message);
  return (data as RepeatCheck | null) ?? null;
}

export async function rpcRequestHandoff(leadId: string, reason: string, note?: string): Promise<void> {
  if (!supabase) throw new Error("Handoff requests need the database");
  const { error } = await supabase.rpc("lead_request_handoff", { p_lead_id: leadId, p_reason: reason, p_note: note || null });
  if (error) throw new Error(friendlyHandoffError(error.message));
}

export async function rpcDecideHandoff(requestId: string, decision: "approve" | "decline" | "cancel", note?: string): Promise<void> {
  if (!supabase) throw new Error("Handoff requests need the database");
  const { error } = await supabase.rpc("lead_handoff_decide", { p_request_id: requestId, p_decision: decision, p_note: note || null });
  if (error) throw new Error(friendlyHandoffError(error.message));
}

export function friendlyHandoffError(msg: string): string {
  if (msg.includes("handoff_reason_required")) return "Please give a reason for the handoff request.";
  if (msg.includes("handoff_already_owner")) return "You already own this lead.";
  if (msg.includes("handoff_lead_unassigned")) return "This lead has no owner yet — assign it directly instead.";
  if (msg.includes("lead_not_found")) return "You don't have access to this lead.";
  if (msg.includes("lhr_one_pending_per_requester")) return "You already have a pending handoff request for this lead.";
  if (msg.includes("handoff_forbidden")) return "You are not allowed to act on this request.";
  if (msg.includes("request_not_pending")) return "This request has already been decided.";
  if (msg.includes("handoff_owner_changed")) return "The lead owner changed since this request was made.";
  if (msg.includes("lead_reassign_forbidden") || msg.includes("lead_assign_forbidden")) return "You don't have permission to transfer this lead.";
  if (msg.includes("lead_owner_not_eligible")) return "The requester is not an eligible Sales Agent for this store.";
  return msg;
}

/* ── Local-mode fallback (no Supabase): rank already-loaded, already-scoped rows ── */

interface LocalLead {
  id: string; leadNo?: string; name?: string; number?: string; email?: string; device?: string; issue?: string;
  status?: string; contactStatus?: string; leadNature?: string; result?: string; assignedTo?: string;
  assignedToName?: string; createdBy?: string; branchId?: string; region?: string; source?: string;
  captureChannel?: string; date?: string; createdAt?: string; assignedAt?: string; customerId?: string;
  comments?: string; finalRemarks?: string; followUpComments?: string; alternateNumber?: string; category?: string;
}

export function localLeadSearch(query: string, leads: LocalLead[], me: string, limit = 8): LeadSearchResponse {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY_LENGTH) return EMPTY_SEARCH;
  const digits = q.replace(/\D/g, "");
  const numeric = /^[+0-9()\s.-]+$/.test(q);
  const hits: LeadHit[] = [];
  for (const l of leads) {
    const phone = normalizeMobile(l.number || "");
    const alt = normalizeMobile(l.alternateNumber || "");
    let score = 0;
    let field = "";
    const set = (s: number, f: string) => { if (s > score) { score = s; field = f; } };
    if (digits.length >= 10 && (phone === digits.slice(-10) || alt === digits.slice(-10))) set(100, "Mobile Number Match");
    if (q.includes("@") && (l.email || "").trim().toLowerCase() === q) set(96, "Email Match");
    if ((l.leadNo || "").toLowerCase() === q) set(90, "Lead ID Match");
    if ((l.name || "").trim().toLowerCase() === q) set(85, "Name Match");
    if (numeric && digits.length >= 4 && digits.length <= 9 && (phone.includes(digits) || alt.includes(digits))) set(70, "Mobile Number Match");
    if (!numeric) {
      if ((l.email || "").toLowerCase().includes(q)) set(68, "Email Match");
      if ((l.name || "").toLowerCase().startsWith(q)) set(60, "Name Match");
      else if ((l.name || "").toLowerCase().includes(q)) set(50, "Name Match");
      if ([l.device, l.issue, l.category].some((v) => (v || "").toLowerCase().includes(q))) set(40, "Device / Issue Match");
      if ([l.assignedToName, l.status, l.contactStatus, l.leadNature, l.result, l.region, l.source, l.captureChannel].some((v) => (v || "").toLowerCase().includes(q))) set(30, "Lead Detail Match");
      if ([l.comments, l.finalRemarks, l.followUpComments].some((v) => (v || "").toLowerCase().includes(q))) set(25, "Comment / Remark Match");
    }
    if ((l.leadNo || "").toLowerCase().includes(q)) set(66, "Lead ID Match");
    if (score === 0) continue;
    hits.push({
      id: l.id, lead_no: l.leadNo || l.id, name: l.name || "", number: l.number || "", email: l.email || "",
      device: l.device || "", issue: l.issue || "", status: l.status || "", contact_status: l.contactStatus || "",
      lead_nature: l.leadNature || "", result: l.result || "", assigned_user_id: l.assignedTo || null,
      assigned_to_name: l.assignedToName || null, created_by: l.createdBy || null, created_by_name: null,
      branch_id: l.branchId || null, store_name: null, region: l.region || "", source: l.source || "",
      capture_channel: l.captureChannel || "", lead_date: l.date || null, created_at: l.createdAt || "",
      assigned_at: l.assignedAt || null, customer_id: l.customerId || null,
      closed: /(lost|won|converted|closed)/i.test(l.status || ""), is_owner: l.assignedTo === me, ordinary: true,
      open_followup: false, next_followup_at: null, last_activity: l.createdAt || null, score, match_field: field,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return { ...EMPTY_SEARCH, leads: { total: hits.length, rows: hits.slice(0, limit) } };
}

/* ── Display helpers ─────────────────────────────────────────────────────── */

/** Split text into [plain, match, plain…] segments for highlighting the query. */
export function highlightSegments(text: string, query: string): { text: string; match: boolean }[] {
  const t = text || "";
  const q = query.trim();
  if (!t || q.length < 1) return [{ text: t, match: false }];
  const lower = t.toLowerCase();
  const ql = q.toLowerCase();
  const out: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < t.length) {
    const j = lower.indexOf(ql, i);
    if (j === -1) { out.push({ text: t.slice(i), match: false }); break; }
    if (j > i) out.push({ text: t.slice(i, j), match: false });
    out.push({ text: t.slice(j, j + ql.length), match: true });
    i = j + ql.length;
  }
  return out;
}

export const leadHref = (id: string) => `/leads/${id}?from=search`;
/** Lead Management's own customer view — NOT the Customer Master page. */
export const customerHref = (id: string) => `/leads/customer/${encodeURIComponent(id)}`;
export const searchPageHref = (q: string, entity: LeadSearchEntity = "all") =>
  `/leads/search?q=${encodeURIComponent(q)}${entity !== "all" ? `&type=${entity}` : ""}`;
export const newLeadForCustomerHref = (customerId: string) =>
  `/leads/list?action=new&customerId=${encodeURIComponent(customerId)}`;

/** Flat, ordered list of navigable dropdown rows (keyboard navigation order). */
export type FlatRow =
  | { kind: "customer"; id: string; item: CustomerHit }
  | { kind: "lead"; id: string; item: LeadHit }
  | { kind: "contact"; id: string; item: ContactHit }
  | { kind: "followup"; id: string; item: FollowUpHit };

export function flattenResults(r: LeadSearchResponse): FlatRow[] {
  return [
    ...r.customers.rows.map((item) => ({ kind: "customer" as const, id: item.id, item })),
    ...r.leads.rows.map((item) => ({ kind: "lead" as const, id: item.id, item })),
    ...r.contacts.rows.map((item) => ({ kind: "contact" as const, id: item.id, item })),
    ...r.followups.rows.map((item) => ({ kind: "followup" as const, id: item.id, item })),
  ];
}

export function hrefForRow(row: FlatRow): string {
  switch (row.kind) {
    case "customer": return customerHref(row.id);
    case "lead": return leadHref(row.id);
    case "contact": return row.item.customer_id ? customerHref(row.item.customer_id) : `/leads/contacts?q=${encodeURIComponent(row.item.name)}`;
    case "followup": return leadHref(row.item.lead_id);
  }
}
