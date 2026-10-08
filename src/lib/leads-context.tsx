"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Management data context (Supabase-first, dual-mode).

   Mirrors the store.tsx contract: when Supabase is configured, all lead data
   and configurable dropdown options live in the database (public.leads and
   public.lead_options), sync via Realtime, and every mutation writes to the DB
   first. When Supabase is NOT configured, it transparently falls back to
   localStorage so the prototype keeps working offline.

   Exposes:
     • leads, leadsHydrated
     • options (LeadOption[]) + optionsFor(field) helper
     • addLead / updateLead / deleteLead   (auto Lead ID, date, time, month)
     • addOption / updateOption / setOptionActive / reorderOptions
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { demoKey } from "@/lib/demo-mode";
import { toast } from "@/components/ui/toaster";
import { logActivity } from "@/lib/activity-log";
import { notify } from "@/lib/notifications";
import { createProspectContact, findContactMatches } from "@/lib/contact-service";
import { recordTemperatureChange } from "@/hooks/use-lead-temperature";
import { CAP, allow } from "@/lib/capabilities";
import {
  agentsForStore, computeLocalSalesAgents, friendlyLeadOwnershipError, isAgentEligible,
  rowToSalesAgent, type SalesAgent,
} from "@/lib/sales-agents";
import {
  LEAD_DROPDOWN_FIELDS, monthFromDate, applyLeadFilters, pinnedFirst,
  isQualifiedStatus, isWonStatus, isLostStatus,
  isNotContactedStatus, isNotContactedLocked,
  computeLeadMetrics, openFollowUp, leadsOwnedBy,
  type LeadFollowUp, type LeadFollowUpDraft, type LeadAssignmentEvent, type LeadMetrics,
  operationalRecordAttributedElsewhere, findOpenLeadMatches,
  type LeadConversionEvent, type LeadConversionEventType, type LeadConversionTargetType,
  EMPTY_LEAD_FILTERS,
  type Lead, type LeadDraft, type LeadOption, type LeadFieldKey, type LeadFilters, type Contact,
} from "@/lib/leads-data";

/* ─── Local-storage keys (prototype mode) ─────────────────────────────── */
const LEADS_KEY = "repairox-leads";
const OPTIONS_KEY = "repairox-lead-options";
const SEQ_KEY = "repairox-lead-seq";
const CONTACTS_KEY = "repairox-contacts";
/** Session key for the owner "View as agent" read-only scope (per tab). */
const VIEW_AS_AGENT_KEY = "repairox-leads-view-as-agent";
const FOLLOWUPS_KEY = "repairox-lead-followups";
const ASSIGN_HISTORY_KEY = "repairox-lead-assignment-history";
const CONVERSION_HISTORY_KEY = "repairox-lead-conversion-history";

/* ─── Row mappers (snake_case DB ↔ camelCase app) ─────────────────────── */

function rowToLead(r: any): Lead {
  return {
    id: r.id,
    branchId: r.branch_id ?? "",
    leadNo: r.lead_no ?? "",
    date: r.lead_date ?? "",
    time: r.lead_time ?? "",
    month: r.lead_month ?? "",
    region: r.region ?? "",
    source: r.source ?? "",
    modeOfContact: r.mode_of_contact ?? "",
    captureChannel: r.capture_channel ?? "",
    agent: r.agent ?? "",
    qualification: r.qualification ?? "",
    name: r.name ?? "",
    number: r.number ?? "",
    alternateNumber: r.alternate_number ?? "",
    email: r.email ?? "",
    location: r.location ?? "",
    locationUnit: r.location_unit ?? "",
    locationLat: r.location_lat == null ? null : Number(r.location_lat),
    locationLng: r.location_lng == null ? null : Number(r.location_lng),
    locationMapsUrl: r.location_maps_url ?? "",
    device: r.device ?? "",
    deviceCategoryId: r.device_category_id ?? "",
    deviceBrandId: r.device_brand_id ?? "",
    deviceModelId: r.device_model_id ?? "",
    issue: r.issue ?? "",
    category: r.category ?? "",
    subCategory: r.sub_category ?? "",
    estimate: r.estimate == null ? null : Number(r.estimate),
    discount: r.discount == null ? null : Number(r.discount),
    discountType: r.discount_type === "percent" ? "percent" : "amount",
    leadCategory: r.lead_category ?? "",
    leadNature: r.lead_nature ?? "",
    priority: r.priority ?? "",
    comments: r.comments ?? "",
    contactStatus: r.contact_status ?? "",
    status: r.status ?? "",
    result: r.result ?? "",
    finalRemarks: r.final_remarks ?? "",
    followUpDate: r.follow_up_date ?? "",
    followUpAgent: r.follow_up_agent ?? "",
    followUpAgentId: r.follow_up_agent_id ?? "",
    finalResult: r.final_result ?? "",
    followUpComments: r.follow_up_comments ?? "",
    notContactedSince: r.not_contacted_since ?? "",
    // assigned_user_id is the canonical owner (0045); assigned_to is its mirror.
    assignedTo: r.assigned_user_id ?? r.assigned_to ?? "",
    assignedToName: r.assigned_to_name ?? "",
    assignedBy: r.assigned_by ?? "",
    assignedByName: r.assigned_by_name ?? "",
    assignedAt: r.assigned_at ?? "",
    pinnedAt: r.pinned_at ?? "",
    fulfilmentRoute: r.fulfilment_route ?? "",
    assignedStore: r.assigned_store ?? "",
    routedAt: r.routed_at ?? "",
    linkedWalkInId: r.linked_walk_in_id ?? "",
    linkedFieldJobId: r.linked_field_job_id ?? "",
    linkedTicketId: r.linked_ticket_id ?? "",
    linkedInvoiceId: r.linked_invoice_id ?? "",
    contactId: r.contact_id ?? "",
    customerId: r.customer_id ?? "",
    companyId: r.company_id ?? undefined,
    expectedValue: r.expected_value == null ? null : Number(r.expected_value),
    firstContactedAt: r.first_contacted_at ?? undefined,
    qualifiedAt: r.qualified_at ?? undefined,
    convertedAt: r.converted_at ?? undefined,
    lostAt: r.lost_at ?? undefined,
    lostReason: r.lost_reason ?? undefined,
    nextFollowUpAt: r.next_followup_at ?? undefined,
    convertedBy: r.converted_by ?? undefined,
    conversionSource: r.conversion_source ?? undefined,
    attributionMode: r.attribution_mode ?? undefined,
    createdBy: r.created_by ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

/** Build a DB row from a lead. Only maps business columns (identity + audit
 *  columns are set by the DB / caller). */
function leadToRow(l: Partial<Lead>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (col: string, v: unknown) => { if (v !== undefined) row[col] = v === "" ? null : v; };
  set("lead_no", l.leadNo);
  set("lead_date", l.date);
  set("lead_time", l.time);
  // NOTE: `lead_month` is a STORED GENERATED column (derived from lead_date via
  // migration 0045) — the DB rejects any write to it. Never map it to a row.
  // It is read back in rowToLead(); the derivation lives in the database.
  set("region", l.region);
  set("source", l.source);
  set("mode_of_contact", l.modeOfContact);
  set("capture_channel", l.captureChannel);
  set("agent", l.agent);
  set("qualification", l.qualification);
  set("name", l.name);
  set("number", l.number);
  set("alternate_number", l.alternateNumber);
  set("email", l.email);
  set("location", l.location);
  set("location_unit", l.locationUnit);
  // Map pin coordinates: numeric passthrough (never ""→null coerce so a real 0
  // is preserved); the shareable URL is a plain string.
  if (l.locationLat !== undefined) row.location_lat = l.locationLat;
  if (l.locationLng !== undefined) row.location_lng = l.locationLng;
  set("location_maps_url", l.locationMapsUrl);
  set("device", l.device);
  set("device_category_id", l.deviceCategoryId);
  set("device_brand_id", l.deviceBrandId);
  set("device_model_id", l.deviceModelId);
  set("issue", l.issue);
  set("category", l.category);
  set("sub_category", l.subCategory);
  if (l.estimate !== undefined) row.estimate = l.estimate;
  if (l.discount !== undefined) row.discount = l.discount;
  set("discount_type", l.discountType);
  set("lead_category", l.leadCategory);
  set("lead_nature", l.leadNature);
  set("priority", l.priority);
  set("comments", l.comments);
  set("contact_status", l.contactStatus);
  set("status", l.status);
  set("result", l.result);
  set("final_remarks", l.finalRemarks);
  set("follow_up_date", l.followUpDate);
  set("follow_up_agent", l.followUpAgent);
  set("follow_up_agent_id", l.followUpAgentId);
  set("final_result", l.finalResult);
  set("follow_up_comments", l.followUpComments);
  // Not-Contacted lock timestamp — explicit so "" clears it to NULL and
  // undefined leaves it untouched (the lock is derived from this + contactStatus).
  if (l.notContactedSince !== undefined) row.not_contacted_since = l.notContactedSince || null;
  // Assignment columns (uuid FKs — null when unassigned)
  if (l.assignedTo !== undefined) row.assigned_to = l.assignedTo || null;
  if (l.assignedBy !== undefined) row.assigned_by = l.assignedBy || null;
  if (l.assignedToName !== undefined) row.assigned_to_name = l.assignedToName || null;
  if (l.assignedByName !== undefined) row.assigned_by_name = l.assignedByName || null;
  if (l.assignedAt !== undefined) row.assigned_at = l.assignedAt || null;
  if (l.pinnedAt !== undefined) row.pinned_at = l.pinnedAt || null;
  // Fulfilment routing + downstream links (nullable columns; added idempotently
  // in supabase/field-management.sql — safe to skip if the column is missing).
  set("fulfilment_route", l.fulfilmentRoute);
  set("assigned_store", l.assignedStore);
  if (l.routedAt !== undefined) row.routed_at = l.routedAt || null;
  set("linked_walk_in_id", l.linkedWalkInId);
  set("linked_field_job_id", l.linkedFieldJobId);
  set("linked_ticket_id", l.linkedTicketId);
  set("linked_invoice_id", l.linkedInvoiceId);
  set("contact_id", l.contactId);
  set("customer_id", l.customerId);
  set("company_id", l.companyId);
  if (l.expectedValue !== undefined) row.expected_value = l.expectedValue;
  if (l.firstContactedAt !== undefined) row.first_contacted_at = l.firstContactedAt || null;
  if (l.qualifiedAt !== undefined) row.qualified_at = l.qualifiedAt || null;
  if (l.convertedAt !== undefined) row.converted_at = l.convertedAt || null;
  if (l.lostAt !== undefined) row.lost_at = l.lostAt || null;
  if (l.lostReason !== undefined) row.lost_reason = l.lostReason || null;
  if (l.nextFollowUpAt !== undefined) row.next_followup_at = l.nextFollowUpAt || null;
  if (l.convertedBy !== undefined) row.converted_by = l.convertedBy || null;
  set("conversion_source", l.conversionSource);
  if (l.attributionMode !== undefined) row.attribution_mode = l.attributionMode || null;
  return row;
}

function rowToOption(r: any): LeadOption {
  return {
    id: r.id,
    field: r.field as LeadFieldKey,
    value: r.value ?? "",
    sortOrder: Number(r.sort_order ?? 0),
    active: r.active !== false,
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

function rowToContact(r: any): Contact {
  return {
    id: r.id,
    customerId: r.customer_id ?? undefined,
    companyId: r.company_id ?? undefined,
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    fullName: r.full_name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    mobile: r.mobile ?? undefined,
    designation: r.designation ?? undefined,
    department: r.department ?? undefined,
    role: r.role ?? undefined,
    source: r.source ?? undefined,
    status: r.status ?? "active",
    owner: r.owner ?? undefined,
    address: r.address ?? undefined,
    city: r.city ?? undefined,
    lastContactAt: r.last_contact_at ?? undefined,
    communicationPreferences: r.communication_preferences ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

function contactToRow(c: Partial<Contact>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (col: string, v: unknown) => { if (v !== undefined) row[col] = v === "" ? null : v; };
  if (c.id !== undefined) row.id = c.id;
  set("customer_id", c.customerId);
  set("company_id", c.companyId);
  set("first_name", c.firstName);
  set("last_name", c.lastName);
  set("full_name", c.fullName ?? (c.firstName || c.lastName ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : undefined));
  set("email", c.email);
  set("phone", c.phone);
  set("mobile", c.mobile);
  set("designation", c.designation);
  set("department", c.department);
  set("role", c.role);
  set("source", c.source);
  set("status", c.status);
  set("owner", c.owner);
  set("address", c.address);
  set("city", c.city);
  if (c.lastContactAt !== undefined) row.last_contact_at = c.lastContactAt || null;
  set("communication_preferences", c.communicationPreferences);
  set("notes", c.notes);
  return row;
}

/* ─── Follow-up + assignment-history row mappers ──────────────────────── */

function rowToFollowUp(r: any): LeadFollowUp {
  return {
    id: r.id,
    leadId: r.lead_id,
    seq: Number(r.seq ?? 0),
    dueAt: r.scheduled_at ?? "",
    followUpUserId: r.followup_user_id ?? "",
    followUpUserName: r.followup_user_name ?? "",
    createdBy: r.created_by ?? "",
    createdByName: r.created_by_name ?? "",
    status: (r.status ?? "scheduled") as LeadFollowUp["status"],
    completedAt: r.completed_at ?? undefined,
    outcome: r.outcome ?? r.result ?? undefined,
    comments: r.comments ?? undefined,
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

function rowToAssignmentEvent(r: any): LeadAssignmentEvent {
  return {
    id: r.id,
    leadId: r.lead_id,
    fromUserId: r.from_user_id ?? undefined,
    fromUserName: r.from_user_name ?? undefined,
    toUserId: r.to_user_id ?? undefined,
    toUserName: r.to_user_name ?? undefined,
    assignedBy: r.assigned_by ?? undefined,
    assignedByName: r.assigned_by_name ?? undefined,
    reason: r.reason ?? undefined,
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

function rowToConversionEvent(r: any): LeadConversionEvent {
  return {
    id: r.id,
    leadId: r.lead_id,
    eventType: r.event_type as LeadConversionEventType,
    targetType: (r.target_type ?? undefined) as LeadConversionTargetType | undefined,
    targetId: r.target_id ?? undefined,
    targetLabel: r.target_label ?? r.note ?? undefined,
    value: r.value == null ? null : Number(r.value),
    note: r.note ?? undefined,
    actorName: r.actor_name ?? undefined,
    occurredAt: r.occurred_at ?? r.created_at ?? new Date().toISOString(),
  };
}

/** public.contacts is created by the (optional, not-yet-required)
 *  0031_customer_master_integration.sql migration. On a DB that hasn't run
 *  it yet, every contacts query fails with "relation does not exist" —
 *  treat that the same as "no contacts yet" instead of surfacing an error,
 *  mirroring how LEAD_OPTIONAL_COLUMNS degrades gracefully above. */
function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /relation .* does not exist/i.test(err.message ?? "");
}

/* ─── Context shape ───────────────────────────────────────────────────── */

interface LeadsContextValue {
  /** Leads the signed-in user may see: see-all roles get every lead in their
   *  store scope; everyone else gets created / owned / follow-up leads only.
   *  (RLS enforces the same rule in the DB — this keeps local mode + UI aligned.) */
  leads: Lead[];
  /** Leads after applying the SHARED filters, pinned-first. The list table and
   *  the dashboard both read this so they always agree on the dataset. */
  filteredLeads: Lead[];
  options: LeadOption[];
  hydrated: boolean;
  /** Data sources that failed initial loading. Analytical surfaces must never
   * render these as legitimate zero values. */
  loadErrors: string[];
  mode: "db" | "local";

  /** Shared filter state (used by list + dashboard). */
  filters: LeadFilters;
  setFilters: (updater: LeadFilters | ((prev: LeadFilters) => LeadFilters)) => void;
  clearFilters: () => void;

  /** Active option values for a field, in sort order. */
  optionsFor: (field: LeadFieldKey) => LeadOption[];

  addLead: (draft: LeadDraft) => Promise<Lead | null>;
  /** Resolves false when nothing (or not everything) could be saved. */
  updateLead: (id: string, updates: Partial<Lead>) => Promise<boolean>;
  /** May the current user change THIS lead's owner (mirrors the DB guard)? */
  canChangeLeadOwner: (lead: Pick<Lead, "assignedTo" | "createdBy">) => boolean;
  deleteLead: (id: string) => Promise<void>;
  /** Assign or reassign a lead to an eligible Sales Agent (pass "" to unassign).
   *  The DB validates eligibility + permission and writes the assignment-history
   *  row in the same transaction; this also notifies the assignee. */
  assignLead: (id: string, staffId: string, staffName: string, reason?: string) => Promise<boolean>;

  /* ── Sales Agents (eligible lead owners — real user ids) ── */
  /** Every eligible Sales Agent the caller may see (store-scoped by the DB). */
  salesAgents: SalesAgent[];
  salesAgentsReady: boolean;
  /** Eligible Sales Agents for a lead in `storeId` ("" = org-wide lead). */
  salesAgentsFor: (storeId?: string | null) => SalesAgent[];
  /** Is `userId` an eligible Sales Agent for a lead in `storeId`? */
  isEligibleSalesAgent: (userId: string, storeId?: string | null) => boolean;
  /** True when the signed-in user is themselves an eligible Sales Agent for `storeId`. */
  currentUserIsSalesAgent: (storeId?: string | null) => boolean;
  refreshSalesAgents: () => Promise<void>;
  /** Whether the signed-in user sees every lead in their store scope (vs own only). */
  canSeeAllLeads: boolean;

  /* ── Owner "View as agent" scope (Option A — NOT impersonation) ──
     An authorized owner (see-all / performanceAll) can scope the Leads
     workspace to ONE agent's leads, READ-ONLY. The session identity never
     changes — this is an analytical scope layered on the owner's own
     visibility, mirroring the Agent-Intelligence "subject, not session" model. */
  /** The agent user id currently being viewed ("" = not active / not authorized). */
  viewAsAgentId: string;
  /** Whether the current user may use the view-as-agent scope at all. */
  canViewAsAgent: boolean;
  /** True while a view-as scope is active → the Leads workspace is read-only. */
  viewAsReadOnly: boolean;
  /** Enter the view-as scope for an agent user id (pass "" to exit). No-op
   *  without cross-agent authority. */
  setViewAsAgent: (agentId: string) => void;
  /** Pin/unpin a lead so it floats to the top of the list (DB-backed). */
  pinLead: (id: string, pinned: boolean) => Promise<void>;
  /** Record the Sales service-route decision (Store / Pickup & Drop / On-Site). */
  routeLead: (id: string, route: "STORE_VISIT" | "PICKUP_DROP" | "ON_SITE", opts?: { assignedStore?: string; assignedStoreId?: string; fieldManagerId?: string }) => Promise<void>;
  /** Change a lead's lifecycle status; writes status-history + terminal
   *  timestamps (qualified/converted/lost). Never auto-wins from a follow-up. */
  changeLeadStatus: (id: string, status: string, opts?: { note?: string; finalResult?: string; lostReason?: string }) => Promise<void>;

  /* ── Structured follow-ups (public.lead_followup_history) ── */
  /** All follow-ups across all loaded leads (newest first). */
  followUps: LeadFollowUp[];
  /** Follow-ups for one lead, ordered by sequence (Follow-up #1, #2, …). */
  followUpsFor: (leadId: string) => LeadFollowUp[];
  /** The single OPEN (scheduled) follow-up per lead — the datetime-precise
   *  source of a lead's follow-up urgency (row red-tint / cell / filter). */
  openFollowUpsByLead: Map<string, LeadFollowUp>;
  /** Schedule a NEW follow-up (keeps all previous follow-up records). */
  scheduleFollowUp: (leadId: string, draft: LeadFollowUpDraft) => Promise<LeadFollowUp | null>;
  /** Complete a follow-up with a structured outcome. Optionally schedule the
   *  next follow-up in the same action (retains history). Does NOT win the lead. */
  completeFollowUp: (followUpId: string, outcome: string, opts?: { comments?: string; next?: LeadFollowUpDraft }) => Promise<void>;
  /** Cancel a scheduled follow-up (kept in history as cancelled). */
  cancelFollowUp: (followUpId: string, reason?: string) => Promise<void>;

  /* ── Assignment history (public.lead_assignment_history) ── */
  assignmentHistory: LeadAssignmentEvent[];
  assignmentHistoryFor: (leadId: string) => LeadAssignmentEvent[];

  /* ── Conversion / handoff history (public.lead_conversion_history) ── */
  conversionHistory: LeadConversionEvent[];
  conversionHistoryFor: (leadId: string) => LeadConversionEvent[];
  /** Append a conversion/handoff event (routed / *_created / won / lost). The
   *  operational modules call this so the Lead's trail is always complete. */
  recordConversionEvent: (leadId: string, eventType: LeadConversionEventType, opts?: { targetType?: LeadConversionTargetType; targetId?: string; targetLabel?: string; value?: number | null; note?: string }) => Promise<void>;
  /** Link an existing operational record (walk-in / field job / ticket / invoice)
   *  to a lead — used by open-lead detection + the unattributed safety net.
   *  Writes the lead's linked_* id + a conversion event; guards duplicate attribution. */
  linkOperationalRecord: (leadId: string, kind: "walk_in" | "field_job" | "ticket" | "invoice", recordId: string, recordLabel?: string) => Promise<void>;
  /** Attribution safety net (AUTOMATIC): when a ticket/invoice/walk-in/field
   *  record is created for a customer identity that matches an OPEN lead, link
   *  it back so the originating Sales Agent keeps credit — WITHOUT a manual
   *  click. Resolves the open lead via Customer id → phone → email (never name),
   *  skips if already attributed, and no-ops when nothing matches. Returns the
   *  linked lead id, or "" when none. Reuses linkOperationalRecord (so it marks
   *  back_matched + records the conversion event). */
  autoLinkByIdentity: (
    kind: "walk_in" | "field_job" | "ticket" | "invoice",
    recordId: string,
    ident: { customerId?: string; phone?: string; email?: string },
    recordLabel?: string,
  ) => Promise<string>;

  /** Derived salesperson metrics for a scope: "me" (own), "all" (loaded set),
   *  or an explicit ownerId. Computed from lead + follow-up records — never a
   *  stored counter. Pass `revenue` (store tickets+invoices) to derive Revenue
   *  Won from FINALIZED invoices; omit it for pipeline-only metrics. */
  leadMetrics: (scope?: "me" | "all" | { ownerId: string }, revenue?: { tickets: any[]; invoices: any[] }) => LeadMetrics;

  addOption: (field: LeadFieldKey, value: string) => Promise<void>;
  updateOption: (id: string, value: string) => Promise<void>;
  setOptionActive: (id: string, active: boolean) => Promise<void>;
  reorderOptions: (field: LeadFieldKey, orderedIds: string[]) => Promise<void>;
  /** Permanently remove an option. */
  deleteOption: (id: string) => Promise<void>;
  /** How many existing leads currently use this option's value (safety check). */
  countLeadsUsingOption: (field: LeadFieldKey, value: string) => number;

  /* ── CRM Contacts (people, optionally linked to a Customer Master record
     and/or a Company) — see public.contacts, 0031_customer_master_integration.sql.
     Degrades gracefully (empty list, no-op writes) if that migration hasn't
     been applied yet on this database. */
  contacts: Contact[];
  addContact: (input: Omit<Contact, "id" | "fullName" | "createdAt" | "updatedAt"> & { fullName?: string }) => Promise<Contact | null>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
}

const LeadsContext = createContext<LeadsContextValue | null>(null);

/* ─── Local helpers ───────────────────────────────────────────────────── */

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(demoKey(key)); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function writeLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(demoKey(key), JSON.stringify(value)); } catch { /* ignore quota */ }
}

/* ─── Schema-drift resilience ───────────────────────────────────────────
   The fulfilment-route + downstream-link columns (fulfilment_route,
   assigned_store, routed_at, linked_walk_in_id, linked_field_job_id,
   linked_ticket_id, customer_id) are added by the OPTIONAL
   supabase/field-management.sql migration. If it hasn't been applied, the DB
   rejects the whole write with an "undefined column" error. Rather than fail
   the user's action, we drop the missing column(s) and retry — the routing
   still succeeds locally (optimistic state) and persists whatever columns exist.
   Mirrors the same pattern used in store.tsx for tickets/customers. */

/** Optional lead columns that may be absent before the migration is applied. */
const LEAD_OPTIONAL_COLUMNS = [
  "fulfilment_route", "assigned_store", "routed_at",
  "linked_walk_in_id", "linked_field_job_id", "linked_ticket_id", "linked_invoice_id", "contact_id", "customer_id", "company_id",
  "expected_value", "first_contacted_at", "qualified_at", "lost_at", "lost_reason", "next_followup_at",
  "converted_at", "converted_by", "conversion_source", "attribution_mode",
  "device_category_id", "device_brand_id", "device_model_id", "discount_type", "follow_up_agent_id",
  "location_lat", "location_lng", "location_maps_url", "location_unit",
];

function isUndefinedColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(err.message ?? "")
  );
}

function extractMissingColumn(err: { message?: string } | null): string | null {
  const m = err?.message ?? "";
  const a = /column "?([a-z0-9_]+)"? does not exist/i.exec(m);
  if (a) return a[1];
  const b = /could not find the '?([a-z0-9_]+)'? column/i.exec(m);
  if (b) return b[1];
  return null;
}

function omitKeys(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...row };
  for (const k of keys) delete next[k];
  return next;
}

/* ─── Fulfilment overlay (durable without the DB migration) ─────────────
   The routing + downstream-link fields live in real DB columns once the
   optional migration is applied. Until then, we ALSO mirror them to a small
   localStorage overlay keyed by lead id, so the routing survives a page
   refresh (which re-reads leads from the DB and would otherwise drop them).
   When the columns exist, the DB value wins; the overlay is a harmless mirror. */
const LEAD_FULFILMENT_KEY = "repairox-lead-fulfilment";
type LeadFulfilmentOverlay = Partial<Pick<Lead,
  "fulfilmentRoute" | "assignedStore" | "routedAt"
  | "linkedWalkInId" | "linkedFieldJobId" | "linkedTicketId" | "contactId" | "customerId">>;

function readFulfilmentOverlay(): Record<string, LeadFulfilmentOverlay> {
  return readLS<Record<string, LeadFulfilmentOverlay>>(LEAD_FULFILMENT_KEY, {});
}
function writeFulfilmentOverlay(map: Record<string, LeadFulfilmentOverlay>) {
  writeLS(LEAD_FULFILMENT_KEY, map);
}
/** Record the fulfilment/link fields present in `updates` into the overlay. */
function mergeFulfilmentOverlay(id: string, updates: Partial<Lead>) {
  const keys: (keyof LeadFulfilmentOverlay)[] = [
    "fulfilmentRoute", "assignedStore", "routedAt",
    "linkedWalkInId", "linkedFieldJobId", "linkedTicketId", "contactId", "customerId",
  ];
  const patch: LeadFulfilmentOverlay = {};
  let touched = false;
  for (const k of keys) {
    if (updates[k] !== undefined) { (patch as any)[k] = updates[k]; touched = true; }
  }
  if (!touched) return;
  const map = readFulfilmentOverlay();
  map[id] = { ...(map[id] || {}), ...patch };
  writeFulfilmentOverlay(map);
}
/** Apply the overlay on top of DB-loaded leads (DB non-empty values win). */
function applyFulfilmentOverlay(leads: Lead[]): Lead[] {
  const map = readFulfilmentOverlay();
  if (!map || Object.keys(map).length === 0) return leads;
  return leads.map((l) => {
    const o = map[l.id];
    if (!o) return l;
    return {
      ...l,
      fulfilmentRoute: l.fulfilmentRoute || o.fulfilmentRoute || "",
      assignedStore: l.assignedStore || o.assignedStore || "",
      routedAt: l.routedAt || o.routedAt || "",
      linkedWalkInId: l.linkedWalkInId || o.linkedWalkInId || "",
      linkedFieldJobId: l.linkedFieldJobId || o.linkedFieldJobId || "",
      linkedTicketId: l.linkedTicketId || o.linkedTicketId || "",
      contactId: l.contactId || o.contactId || "",
      customerId: l.customerId || o.customerId || "",
    };
  });
}

function nowParts() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time, month: monthFromDate(date) };
}

/** Identity for a specific assignment event (changes when assignee or the
 *  assignment timestamp changes → a reassignment re-notifies). */
function assignmentKey(l: Lead): string {
  return `${l.id}:${l.assignedTo}:${l.assignedAt}`;
}

/** Custom event the Lead list listens for to open the detail view when the
 *  assigned user clicks "View Lead" in the notification. */
export const LEAD_OPEN_EVENT = "repairox:open-lead";

/** Fire the "New Lead Assigned" popup to the assigned user, with a View Lead
 *  action that opens the existing Lead Detail view. */
function emitAssignmentNotification(l: Lead) {
  const assignedAt = l.assignedAt ? new Date(l.assignedAt) : new Date();
  const when = isNaN(assignedAt.getTime())
    ? ""
    : assignedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const by = l.assignedByName ? ` by ${l.assignedByName}` : "";
  toast.info("New Lead Assigned", {
    description: `${l.leadNo} · ${l.name || "Unnamed"} — assigned to you${by}${when ? ` · ${when}` : ""}.`,
    duration: 9000,
    action: {
      label: "View Lead",
      onClick: () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(LEAD_OPEN_EVENT, { detail: { id: l.id } }));
        }
      },
    },
  });
}

/* ─── Provider ────────────────────────────────────────────────────────── */

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { authReady, can, grants, team, getRoleById } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [options, setOptions] = useState<LeadOption[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<LeadAssignmentEvent[]>([]);
  const [conversionHistory, setConversionHistory] = useState<LeadConversionEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [filters, setFiltersState] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);
  /** OWNER "View as agent" scope (Option A — NOT impersonation). When an owner
   *  (see-all / performanceAll) sets this to an agent's USER id, the Leads
   *  workspace scopes to that agent's leads and renders READ-ONLY. The signed-in
   *  session identity (useSession) is NEVER changed — this is an analytical
   *  scope on top of the owner's own see-all visibility, mirroring the
   *  Agent-Intelligence "subject, not session" model. */
  const [viewAsAgentId, setViewAsAgentId] = useState<string>(() => {
    // Session-scoped persistence so the read-only scope survives in-module
    // navigation + a hard refresh on a sub-page (no ?viewAs= needed), and
    // auto-clears when the tab closes. Never localStorage — this is a
    // temporary analytical lens, not a saved preference.
    if (typeof window === "undefined") return "";
    try { return window.sessionStorage.getItem(VIEW_AS_AGENT_KEY) || ""; } catch { return ""; }
  });

  const useDb = isSupabaseConfigured && !!supabase;
  const db = supabase!;
  const optionsRef = useRef<LeadOption[]>([]);
  optionsRef.current = options;
  const leadsRef = useRef<Lead[]>([]);
  leadsRef.current = leads;
  const contactsRef = useRef<Contact[]>([]);
  contactsRef.current = contacts;
  const followUpsRef = useRef<LeadFollowUp[]>([]);
  followUpsRef.current = followUps;
  const conversionHistoryRef = useRef<LeadConversionEvent[]>([]);
  conversionHistoryRef.current = conversionHistory;
  const currentUserIdRef = useRef<string | undefined>(currentUserId);
  currentUserIdRef.current = currentUserId;
  const currentUserNameRef = useRef<string>(currentUserName);
  currentUserNameRef.current = currentUserName;
  // Tracks leads we've already notified the current user about (this session)
  // so realtime reloads don't re-fire the same "assigned to you" toast.
  const notifiedRef = useRef<Set<string>>(new Set());
  const notifyReadyRef = useRef(false);

  /* ── Sales Agents: the ONLY people offered as lead owner / follow-up agent ──
     DB mode reads the store-scoped RPC (role holds `leads_sales_agent` + active
     + store authorization — the same predicate the DB triggers enforce). Local
     mode derives it from the team + role grants. Re-resolved whenever the team
     or role grants change (role removed / user deactivated → drops out). */
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [salesAgentsReady, setSalesAgentsReady] = useState(false);
  const salesAgentsRef = useRef<SalesAgent[]>([]);
  salesAgentsRef.current = salesAgents;
  const salesAgentsReadyRef = useRef(false);
  salesAgentsReadyRef.current = salesAgentsReady;

  const refreshSalesAgents = useCallback(async () => {
    if (useDb) {
      if (!authReady) return;
      const { data, error } = await db.rpc("lead_sales_agents");
      if (error) {
        // Function missing (migration 0049 not applied) → no eligible agents;
        // never fall back to the whole staff directory.
        console.error("[leads] loading sales agents failed:", error.message);
        setSalesAgents([]);
        setLoadErrors((previous) => previous.includes("salesAgents") ? previous : [...previous, "salesAgents"]);
      } else {
        setSalesAgents(((data as any[]) ?? []).map(rowToSalesAgent));
        setLoadErrors((previous) => previous.filter((source) => source !== "salesAgents"));
      }
      setSalesAgentsReady(true);
      return;
    }
    setSalesAgents(computeLocalSalesAgents(team, grants, (rid) => getRoleById(rid)?.label ?? rid));
    setSalesAgentsReady(true);
  }, [useDb, db, authReady, team, grants, getRoleById]);

  useEffect(() => { void refreshSalesAgents(); }, [refreshSalesAgents]);

  // Other sessions changing a user's role / status / store grants converge live.
  useEffect(() => {
    if (!useDb || !authReady) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void refreshSalesAgents(); }, 300); };
    const channel = db.channel("lead-sales-agents");
    for (const table of ["staff", "user_stores", "role_permissions"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();
    return () => { if (timer) clearTimeout(timer); db.removeChannel(channel); };
  }, [useDb, authReady, db, refreshSalesAgents]);

  const salesAgentsFor = useCallback((storeId?: string | null) => agentsForStore(salesAgents, storeId), [salesAgents]);
  const isEligibleSalesAgent = useCallback(
    (userId: string, storeId?: string | null) => isAgentEligible(salesAgents, userId, storeId),
    [salesAgents],
  );
  const currentUserIsSalesAgent = useCallback(
    (storeId?: string | null) => !!currentUserId && isAgentEligible(salesAgents, currentUserId, storeId),
    [salesAgents, currentUserId],
  );
  /** Client pre-check before a write. Until the directory has loaded we defer
   *  to the database (the trigger is the real gate). */
  const eligibleOrUnknown = (userId: string, storeId?: string | null) =>
    !salesAgentsReadyRef.current || isAgentEligible(salesAgentsRef.current, userId, storeId);

  /** Lead visibility scope (UI = RLS): see-all keys vs own/assigned/follow-up. */
  const canSeeAllLeads = allow(can, CAP.lead.viewTeam);
  const canSeeAllLeadsRef = useRef(canSeeAllLeads);
  canSeeAllLeadsRef.current = canSeeAllLeads;

  /** May the current user change THIS lead's owner? Mirrors the DB guard
   *  (0050): reassign-level keys → any visible lead; `leads_assign` → only
   *  leads they own/created, or any lead with a see-all key. A follow-up agent
   *  can't take over someone else's lead. */
  const canChangeLeadOwner = useCallback((lead: Pick<Lead, "assignedTo" | "createdBy">): boolean => {
    if (allow(can, CAP.lead.reassignAny)) return true;
    const me = currentUserId || "";
    const mine = !!me && (lead.assignedTo === me || lead.createdBy === me);
    return allow(can, ["leads_assign"]) && (mine || canSeeAllLeads);
  }, [can, currentUserId, canSeeAllLeads]);
  const canChangeLeadOwnerRef = useRef(canChangeLeadOwner);
  canChangeLeadOwnerRef.current = canChangeLeadOwner;

  /** Show a DB ownership-guard error as a clear message (falls back to `fallback`). */
  const reportLeadError = (title: string, message: string | undefined, fallback: string) => {
    toast.error(title, { description: friendlyLeadOwnershipError(message) ?? fallback });
  };

  /* ── Seed default options in LOCAL mode (once) ── */
  const seedLocalOptionsIfEmpty = useCallback((existing: LeadOption[]): LeadOption[] => {
    if (existing.length > 0) return existing;
    const seeded: LeadOption[] = [];
    for (const field of LEAD_DROPDOWN_FIELDS) {
      field.defaults.forEach((value, i) => {
        seeded.push({ id: uid(), field: field.key, value, sortOrder: i, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      });
    }
    return seeded;
  }, []);

  /* ── Hydration ── */
  useEffect(() => {
    let active = true;

    async function loadFromDb() {
      const [
        { data: leadRows, error: leadErr },
        { data: optRows, error: optErr },
        { data: contactRows, error: contactErr },
        { data: fuRows, error: fuErr },
        { data: ahRows, error: ahErr },
        { data: chRows, error: chErr },
      ] = await Promise.all([
        db.from("leads").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("lead_options").select("*").order("field", { ascending: true }).order("sort_order", { ascending: true }),
        db.from("contacts").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("lead_followup_history").select("*").order("created_at", { ascending: false }),
        db.from("lead_assignment_history").select("*").order("created_at", { ascending: false }),
        db.from("lead_conversion_history").select("*").order("occurred_at", { ascending: false }),
      ]);
      if (!active) return;
      setLoadErrors((previous) => [
        ...previous.filter((source) => source === "salesAgents"),
        ...(leadErr ? ["leads"] : []),
        ...(fuErr ? ["followUps"] : []),
      ]);
      if (!leadErr && leadRows) setLeads(applyFulfilmentOverlay(leadRows.map(rowToLead)));

      // contacts table only exists once 0031_customer_master_integration.sql
      // has been applied — treat "table missing" as "no contacts yet", not
      // an error, so this doesn't block lead/option loading on an
      // un-migrated database.
      if (!contactErr && contactRows) setContacts(contactRows.map(rowToContact));
      else if (contactErr && !isMissingTableError(contactErr)) console.error("[leads] loading contacts failed:", contactErr.message);

      // Follow-up + assignment history come from migration 0045/0046. Degrade
      // gracefully (empty) when the tables aren't there yet — never block leads.
      if (!fuErr && fuRows) setFollowUps(fuRows.map(rowToFollowUp));
      else if (fuErr && !isMissingTableError(fuErr)) console.error("[leads] loading follow-ups failed:", fuErr.message);
      if (!ahErr && ahRows) setAssignmentHistory(ahRows.map(rowToAssignmentEvent));
      else if (ahErr && !isMissingTableError(ahErr)) console.error("[leads] loading assignment history failed:", ahErr.message);
      if (!chErr && chRows) setConversionHistory(chRows.map(rowToConversionEvent));
      else if (chErr && !isMissingTableError(chErr)) console.error("[leads] loading conversion history failed:", chErr.message);

      if (!optErr && optRows) {
        if (optRows.length === 0) {
          // First run against a fresh DB — seed the default option catalog.
          await seedDefaultOptionsToDb();
        } else {
          setOptions(optRows.map(rowToOption));
        }
      }
      setHydrated(true);
    }

    async function seedDefaultOptionsToDb() {
      const rows: Record<string, unknown>[] = [];
      for (const field of LEAD_DROPDOWN_FIELDS) {
        if (field.usesStaff) continue; // agent lists come from live staff
        field.defaults.forEach((value, i) => rows.push({ field: field.key, value, sort_order: i, active: true }));
      }
      if (rows.length === 0) { setOptions([]); return; }
      const { data, error } = await db.from("lead_options").insert(rows).select("*");
      if (!active) return;
      if (!error && data) setOptions(data.map(rowToOption));
      else setOptions([]); // RLS may block seeding for non-admins; that's fine
    }

    if (useDb) {
      if (!authReady) return; // wait for auth so RLS reads succeed
      loadFromDb();
    } else {
      setLoadErrors([]);
      const localLeads = readLS<Lead[]>(LEADS_KEY, []);
      let localOpts = readLS<LeadOption[]>(OPTIONS_KEY, []);
      localOpts = seedLocalOptionsIfEmpty(localOpts);
      if (localOpts.length && readLS<LeadOption[]>(OPTIONS_KEY, []).length === 0) writeLS(OPTIONS_KEY, localOpts);
      setLeads(localLeads);
      setOptions(localOpts);
      setContacts(readLS<Contact[]>(CONTACTS_KEY, []));
      setFollowUps(readLS<LeadFollowUp[]>(FOLLOWUPS_KEY, []));
      setAssignmentHistory(readLS<LeadAssignmentEvent[]>(ASSIGN_HISTORY_KEY, []));
      setConversionHistory(readLS<LeadConversionEvent[]>(CONVERSION_HISTORY_KEY, []));
      setHydrated(true);
    }

    return () => { active = false; };
  }, [useDb, authReady, db, seedLocalOptionsIfEmpty]);

  /* ── Realtime (DB mode) ── */
  useEffect(() => {
    if (!useDb || !authReady) return;
    let active = true;
    const channel = db.channel("leads-realtime");
    const reload = async () => {
      const [{ data: leadRows }, { data: optRows }, { data: contactRows }, { data: fuRows, error: fuErr }, { data: ahRows, error: ahErr }, { data: chRows, error: chErr }] = await Promise.all([
        db.from("leads").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("lead_options").select("*").order("field", { ascending: true }).order("sort_order", { ascending: true }),
        db.from("contacts").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("lead_followup_history").select("*").order("created_at", { ascending: false }),
        db.from("lead_assignment_history").select("*").order("created_at", { ascending: false }),
        db.from("lead_conversion_history").select("*").order("occurred_at", { ascending: false }),
      ]);
      if (!active) return;
      if (leadRows) setLeads(applyFulfilmentOverlay(leadRows.map(rowToLead)));
      if (optRows) setOptions(optRows.map(rowToOption));
      if (contactRows) setContacts(contactRows.map(rowToContact));
      if (!fuErr && fuRows) setFollowUps(fuRows.map(rowToFollowUp));
      if (!ahErr && ahRows) setAssignmentHistory(ahRows.map(rowToAssignmentEvent));
      if (!chErr && chRows) setConversionHistory(chRows.map(rowToConversionEvent));
    };
    for (const table of ["leads", "lead_options", "contacts", "lead_followup_history", "lead_assignment_history", "lead_conversion_history"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, reload);
    }
    channel.subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [useDb, authReady, db]);

  /* ── Assignment notification watcher ──
     Fires a "New Lead Assigned" popup to the ASSIGNED USER when a lead becomes
     (or was just reassigned to) theirs. Runs on every leads change (initial
     load + realtime). The first pass only establishes a baseline so we never
     spam the user about leads that were already theirs before they logged in;
     after that, any newly-appearing assigned lead triggers the toast. */
  useEffect(() => {
    if (!hydrated || !currentUserId) return;
    const mine = leads.filter((l) => l.assignedTo && l.assignedTo === currentUserId);

    if (!notifyReadyRef.current) {
      // Baseline: remember what's already assigned to me — no toast on first load.
      mine.forEach((l) => notifiedRef.current.add(assignmentKey(l)));
      notifyReadyRef.current = true;
      return;
    }

    for (const l of mine) {
      const key = assignmentKey(l);
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);
      // Don't notify if I assigned it to myself (assignLead already confirmed).
      if (l.assignedBy && l.assignedBy === currentUserId) continue;
      emitAssignmentNotification(l);
    }
  }, [leads, hydrated, currentUserId]);

  /* ── Lead ID generation ── */
  const nextLeadNoLocal = useCallback((): string => {
    const current = readLS<number>(SEQ_KEY, 0) + 1;
    writeLS(SEQ_KEY, current);
    return `L-${String(current).padStart(3, "0")}`;
  }, []);

  /* ── Prospect Contact resolution ──
     Every new Lead resolves to a CRM Contact, never directly to a Customer.
     Customer promotion is a separate Ticket/Invoice/manual action. */
  const resolveLeadContact = useCallback(async (draft: LeadDraft): Promise<string> => {
    if (draft.contactId) return draft.contactId;
    // Only auto-reuse a DEFINITE (high-confidence exact phone/email) contact.
    // A "low"-confidence fuzzy name/city match is a POSSIBILITY surfaced to the
    // user at capture — never silently merged here (could be a different
    // person with the same name).
    const matches = findContactMatches(contactsRef.current, {
      phone: draft.number, email: draft.email, fullName: draft.name, city: draft.location,
    });
    const existing = matches.find((m) => (m.confidence ?? "high") === "high")?.contact;
    if (existing) return existing.id;

    const contact = createProspectContact({
      fullName: draft.name,
      phone: draft.number,
      email: draft.email,
      address: draft.location,
      source: draft.source,
      owner: draft.agent || currentUserNameRef.current,
    });

    if (useDb) {
      const { data, error } = await db.from("contacts").insert(contactToRow(contact)).select("*").single();
      if (!error && data) {
        const saved = rowToContact(data);
        setContacts((prev) => [saved, ...prev]);
        return saved.id;
      }
      if (error && !isMissingTableError(error)) {
        console.error("[leads] prospect contact save failed:", error.message);
        throw new Error("The CRM contact could not be saved.");
      }
    }

    setContacts((prev) => {
      const next = [contact, ...prev];
      if (!useDb) writeLS(CONTACTS_KEY, next);
      return next;
    });
    return contact.id;
  }, [useDb, db]);

  /* ── Lead CRUD ── */
  const addLead = useCallback(async (draft: LeadDraft): Promise<Lead | null> => {
    const { date, time, month } = nowParts();
    let contactId = draft.contactId ?? "";
    try {
      contactId = await resolveLeadContact(draft);
    } catch (error) {
      toast.error("Lead not saved", { description: error instanceof Error ? error.message : "The CRM contact could not be saved." });
      return null;
    }
    const me = currentUserIdRef.current || "";
    const storeId = draft.branchId || "";

    // ── Ownership (AGENTS = a Sales Agent's USER ID) ──
    // Default owner = the logged-in user when they are an eligible Sales Agent
    // (IVR / phone capture: no need to search for yourself). The DB applies the
    // same default + validation, so this is a mirror, not the gate.
    let ownerId = draft.assignedTo || "";
    if (!ownerId && me && isAgentEligible(salesAgentsRef.current, me, storeId)) ownerId = me;
    const ownerName = ownerId
      ? (salesAgentsRef.current.find((a) => a.id === ownerId)?.name || draft.assignedToName || (ownerId === me ? currentUserNameRef.current : "") || "")
      : "";
    if (ownerId && !eligibleOrUnknown(ownerId, storeId)) {
      toast.error("Lead not saved", { description: "The lead owner must be an active Sales Agent who can work this store." });
      return null;
    }
    if (ownerId && ownerId !== me && !allow(can, CAP.lead.assign)) {
      toast.error("Lead not saved", { description: "You can only create leads owned by yourself." });
      return null;
    }
    if (draft.followUpAgentId && !eligibleOrUnknown(draft.followUpAgentId, storeId)) {
      toast.error("Lead not saved", { description: "The follow-up agent must be an active Sales Agent who can work this store." });
      return null;
    }

    // Not-Contacted lock clock: a lead created at "Not Contacted" starts the
    // countdown now; a lead created already contacted has no lock.
    const bornNotContacted = isNotContactedStatus(draft.contactStatus ?? "");
    const notContactedSince = bornNotContacted ? new Date().toISOString() : "";

    const resolvedDraft: LeadDraft = {
      ...draft, contactId, customerId: draft.customerId ?? "",
      assignedTo: ownerId, assignedToName: ownerName, agent: ownerName || draft.agent || "",
      notContactedSince,
    };

    if (useDb) {
      // Ask the DB for the next org-scoped sequential Lead ID (gap-free).
      // The zero-arg overload derives the org from the signed-in user.
      let leadNo = "";
      const { data: seq, error: seqErr } = await db.rpc("next_lead_id");
      if (!seqErr && typeof seq === "string") leadNo = seq;
      else if (seqErr) console.error("[leads] next_lead_id failed:", seqErr.message);

      // Owner = assigned_user_id (canonical). created_by, assigned_by/at and the
      // cached names are stamped by the DB ownership guard (migration 0049), and
      // the assignment-history row is written by the DB in the same transaction.
      let row: Record<string, unknown> = {
        ...omitKeys(leadToRow({ ...resolvedDraft, date, time, month } as Partial<Lead>), ["assigned_by", "assigned_by_name", "assigned_at"]),
        assigned_user_id: ownerId || null,
        assigned_to: ownerId || null,
        // The lead's STORE is the one the form validated the owner against
        // (never left to the DB's home-store default).
        ...(storeId ? { branch_id: storeId } : {}),
        ...(leadNo ? { lead_no: leadNo } : {}),
      };
      let res = await db.from("leads").insert(row).select("*").single();
      // Schema-drift: drop optional columns the DB doesn't have yet and retry.
      let heal = 0;
      while (res.error && isUndefinedColumnError(res.error) && heal < 8) {
        heal += 1;
        const col = extractMissingColumn(res.error);
        row = omitKeys(row, col ? [col] : LEAD_OPTIONAL_COLUMNS);
        res = await db.from("leads").insert(row).select("*").single();
        if (!res.error) console.warn("[leads] addLead: retried without missing column(s) (schema drift).");
      }
      const { data, error } = res;
      if (error || !data) {
        console.error("[leads] addLead failed:", error?.message);
        reportLeadError("Lead not saved", error?.message, "We couldn't save this lead to the database. Please try again.");
        return null;
      }
      const created = applyFulfilmentOverlay([rowToLead(data)])[0];
      setLeads((prev) => [created, ...prev]);
      // Pull the DB-written ownership history row for this lead.
      const { data: hist } = await db.from("lead_assignment_history").select("*").eq("lead_id", created.id);
      if (hist && hist.length) {
        setAssignmentHistory((prev) => [...hist.map(rowToAssignmentEvent), ...prev.filter((h) => h.leadId !== created.id)]);
      }
      afterLeadCreated(created);
      return created;
    }

    // Local mode
    const lead: Lead = {
      id: uid(),
      branchId: draft.branchId ?? "",
      leadNo: nextLeadNoLocal(),
      date, time, month,
      region: draft.region ?? "", source: draft.source ?? "", modeOfContact: draft.modeOfContact ?? "", captureChannel: draft.captureChannel ?? "", agent: draft.agent ?? "", qualification: draft.qualification ?? "",
      name: draft.name ?? "", number: draft.number ?? "", alternateNumber: draft.alternateNumber ?? "", email: draft.email ?? "", location: draft.location ?? "", locationUnit: draft.locationUnit ?? "",
      locationLat: draft.locationLat ?? null, locationLng: draft.locationLng ?? null, locationMapsUrl: draft.locationMapsUrl ?? "",
      device: draft.device ?? "", deviceCategoryId: draft.deviceCategoryId ?? "", deviceBrandId: draft.deviceBrandId ?? "", deviceModelId: draft.deviceModelId ?? "",
      issue: draft.issue ?? "", category: draft.category ?? "", subCategory: draft.subCategory ?? "",
      estimate: draft.estimate ?? null, discount: draft.discount ?? null, discountType: draft.discountType ?? "amount",
      leadCategory: draft.leadCategory ?? "", leadNature: draft.leadNature ?? "", priority: draft.priority ?? "",
      comments: draft.comments ?? "", contactStatus: draft.contactStatus ?? "", status: draft.status ?? "",
      result: draft.result ?? "", finalRemarks: draft.finalRemarks ?? "", followUpDate: draft.followUpDate ?? "",
      followUpAgent: draft.followUpAgent ?? "", followUpAgentId: draft.followUpAgentId ?? "", finalResult: draft.finalResult ?? "", followUpComments: draft.followUpComments ?? "",
      notContactedSince,
      // AGENTS = the primary owner (user id). The draft's agent picker sets these.
      assignedTo: ownerId, assignedToName: ownerName,
      assignedBy: ownerId ? me : "", assignedByName: ownerId ? currentUserNameRef.current || "" : "",
      assignedAt: ownerId ? new Date().toISOString() : "",
      pinnedAt: "",
      fulfilmentRoute: draft.fulfilmentRoute ?? "", assignedStore: draft.assignedStore ?? "", routedAt: "",
      linkedWalkInId: "", linkedFieldJobId: "", linkedTicketId: "", linkedInvoiceId: "", contactId, customerId: resolvedDraft.customerId ?? "",
      convertedAt: draft.convertedAt, convertedBy: draft.convertedBy, conversionSource: draft.conversionSource,
      createdBy: me,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    lead.agent = ownerName || lead.agent;
    setLeads((prev) => { const next = [lead, ...prev]; writeLS(LEADS_KEY, next); return next; });
    if (ownerId) {
      // Local mirror of the DB's create-time assignment history row.
      const ev: LeadAssignmentEvent = {
        id: uid(), leadId: lead.id, toUserId: ownerId, toUserName: ownerName,
        assignedBy: me || undefined, assignedByName: currentUserNameRef.current || undefined,
        reason: "Lead created", createdAt: new Date().toISOString(),
      };
      setAssignmentHistory((prev) => { const next = [ev, ...prev]; writeLS(ASSIGN_HISTORY_KEY, next); return next; });
    }
    afterLeadCreated(lead);
    return lead;
  }, [useDb, db, can, nextLeadNoLocal, resolveLeadContact]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Shared post-create side effects: confirmation, audit, and notifications to
   *  the owner / follow-up agent when they aren't the creator. */
  function afterLeadCreated(created: Lead) {
    const me = currentUserIdRef.current || "";
    const by = currentUserNameRef.current || "";
    // Seed the "initial temperature at creation" fact ONCE, so the full
    // Hot → … history always starts from the real starting point even if the
    // temperature is changed before anyone opens View Lead. Append-only; no-ops
    // when the lead has no temperature.
    if (created.leadNature) {
      recordTemperatureChange({
        leadId: created.id,
        fromValue: "",
        toValue: created.leadNature,
        changedBy: created.createdBy || me,
        changedByName: created.assignedToName || created.agent || by,
        reason: "Initial temperature at lead creation.",
      });
    }
    toast.success("Lead created", {
      description: `${created.leadNo} · ${created.name}${created.assignedToName ? ` — owner: ${created.assignedToName}` : ""}`,
    });
    logActivity({
      module: "Lead", action: "Lead Created", severity: "success", entity: "Lead", reference: created.leadNo,
      description: `Created ${created.leadNo} (${created.name || "Unnamed"})${created.assignedToName ? `, owned by ${created.assignedToName}` : ""}.`,
    });
    if (created.assignedTo && created.assignedTo !== me) {
      notify({
        kind: "lead_assigned",
        recipientId: created.assignedTo,
        title: "New lead assigned to you",
        body: `${created.leadNo} · ${created.name || "Unnamed"}${by ? ` — by ${by}` : ""}.`,
        href: `/leads/list?lead=${created.id}`,
        reference: created.leadNo,
        dedupeKey: `lead-assigned:${created.id}:${created.assignedTo}:create`,
      });
    }
    if (created.followUpAgentId && created.followUpAgentId !== me && created.followUpAgentId !== created.assignedTo) {
      notify({
        kind: "lead_assigned",
        recipientId: created.followUpAgentId,
        title: "Follow-up assigned to you",
        body: `${created.leadNo} · ${created.name || "Unnamed"}${by ? ` — by ${by}` : ""}.`,
        href: `/leads/list?lead=${created.id}`,
        reference: created.leadNo,
        dedupeKey: `lead-followup-agent:${created.id}:${created.followUpAgentId}:create`,
      });
    }
  }

  /** Low-level lead write (optimistic + DB). Callers that change OWNERSHIP or
   *  the FOLLOW-UP AGENT must go through updateLead / assignLead instead. */
  const persistLeadPatch = useCallback(async (id: string, updates: Partial<Lead>): Promise<boolean> => {
    // Mirror any fulfilment/link fields to the durable overlay so they survive a
    // DB reload even before the optional migration adds the real columns.
    mergeFulfilmentOverlay(id, updates);
    // Apply the optimistic update FIRST so the route/link changes reflect in the
    // UI (and downstream Store/Field handoff) even if the DB is missing the
    // optional columns. In local mode this is also the persistence.
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l));
      if (!useDb) writeLS(LEADS_KEY, next);
      return next;
    });

    if (useDb) {
      let row = leadToRow(updates);
      let res = await db.from("leads").update(row).eq("id", id);
      // Schema-drift: the fulfilment_route / linked_* / customer_id columns are
      // added by the optional migration. Drop any the DB doesn't have and retry
      // so routing/linking never fails the user's action.
      let heal = 0;
      while (res.error && isUndefinedColumnError(res.error) && Object.keys(row).length > 0 && heal < 8) {
        heal += 1;
        const col = extractMissingColumn(res.error);
        row = omitKeys(row, col ? [col] : LEAD_OPTIONAL_COLUMNS);
        if (Object.keys(row).length === 0) { res = { error: null } as any; break; }
        res = await db.from("leads").update(row).eq("id", id);
        if (!res.error) console.warn("[leads] updateLead: retried without missing column(s) (schema drift).");
      }
      if (res.error) {
        console.error("[leads] updateLead failed:", res.error.message);
        reportLeadError("Changes not saved", res.error.message, "We couldn't update this lead in the database. Please try again.");
        // Roll the optimistic change back to the authoritative row.
        const { data: fresh } = await db.from("leads").select("*").eq("id", id).maybeSingle();
        if (fresh) setLeads((prev) => prev.map((l) => (l.id === id ? applyFulfilmentOverlay([rowToLead(fresh)])[0] : l)));
        return false;
      }
    }
    return true;
  }, [useDb, db]); // eslint-disable-line react-hooks/exhaustive-deps

  // Late-bound refs so updateLead can route ownership/follow-up-agent changes
  // through their dedicated flows (defined further below).
  const assignLeadRef = useRef<(id: string, staffId: string, staffName: string, reason?: string) => Promise<boolean>>(async () => false);
  const reassignOpenFollowUpsRef = useRef<(leadId: string, userId: string, userName: string, previousName?: string) => Promise<void>>(async () => {});

  /** Update a lead. Ownership fields are NEVER written directly: an owner
   *  change is routed through assignLead (permission + eligibility + history +
   *  notification); a follow-up agent change is validated against the Sales
   *  Agent directory and moves the OPEN follow-up to the new agent. created_by
   *  and the cached AGENTS label are server-owned. */
  const updateLead = useCallback(async (id: string, updatesIn: Partial<Lead>): Promise<boolean> => {
    const current = leadsRef.current.find((l) => l.id === id);
    const {
      assignedTo, assignedToName,
      assignedBy: _ab, assignedByName: _abn, assignedAt: _at, createdBy: _cb, agent: _agent,
      ...updates
    } = updatesIn;
    const ownerChange = assignedTo !== undefined && !!current && (assignedTo || "") !== (current.assignedTo || "");
    const fuChange = updates.followUpAgentId !== undefined && !!current && (updates.followUpAgentId || "") !== (current.followUpAgentId || "");

    // ── Not-Contacted lock clock ────────────────────────────────────────────
    // Keep `notContactedSince` in lockstep with contactStatus, UNLESS the caller
    // set it explicitly (e.g. a reassignment restarting the clock).
    if (updates.contactStatus !== undefined && current && updates.notContactedSince === undefined) {
      const wasNC = isNotContactedStatus(current.contactStatus);
      const willNC = isNotContactedStatus(updates.contactStatus);
      if (willNC && !wasNC) {
        // Re-entered Not-Contacted → restart the 48h countdown.
        updates.notContactedSince = new Date().toISOString();
      } else if (!willNC && wasNC) {
        // Contacted at last → clear the lock (leaves the Not-Contacted queue).
        updates.notContactedSince = "";
      }
      // willNC && wasNC → leave the existing since untouched (clock keeps running).
    }
    const storeId = updates.branchId ?? current?.branchId ?? "";
    const previousFollowUpAgent = current?.followUpAgent || "";

    // Validate EVERY part of the change before writing anything, so a save is
    // never half-applied (fields saved but the owner change rejected).
    if (ownerChange && current && !canChangeLeadOwnerRef.current(current)) {
      toast.error("Changes not saved", { description: "You don't have permission to change the owner of this lead." });
      return false;
    }
    if (ownerChange && assignedTo && !eligibleOrUnknown(assignedTo, storeId)) {
      toast.error("Changes not saved", { description: "Only active Sales Agents who can work this store can own a lead." });
      return false;
    }
    if (fuChange && updates.followUpAgentId && !eligibleOrUnknown(updates.followUpAgentId, storeId)) {
      toast.error("Changes not saved", { description: "The follow-up agent must be an active Sales Agent who can work this store." });
      return false;
    }
    if (fuChange) {
      const agent = salesAgentsRef.current.find((a) => a.id === updates.followUpAgentId);
      updates.followUpAgent = updates.followUpAgentId ? (agent?.name || updates.followUpAgent || "") : "";
    } else if (updates.followUpAgent !== undefined && current?.followUpAgentId) {
      // The cached follow-up agent name always follows the id.
      delete updates.followUpAgent;
    }

    // Capture the temperature (leadNature) transition BEFORE writing, so the
    // "from" value is the authoritative previous one. This is the single choke
    // point: ANY surface that changes leadNature through updateLead (the detail
    // drawer, the capture-flow edit, the Lead Table inline edit, the Temperature
    // section) appends a reversible history event — never just the first/last.
    const natureChange =
      updates.leadNature !== undefined && !!current &&
      (updates.leadNature || "").trim() !== (current.leadNature || "").trim();
    const natureFrom = current?.leadNature || "";
    const natureTo = (updates.leadNature || "").trim();

    let saved = true;
    if (Object.keys(updates).length > 0) saved = await persistLeadPatch(id, updates);
    if (!saved) return false;
    if (natureChange) {
      recordTemperatureChange({
        leadId: id,
        fromValue: natureFrom,
        toValue: natureTo,
        changedBy: currentUserIdRef.current || "",
        changedByName: currentUserNameRef.current || "",
      });
    }
    if (fuChange) await reassignOpenFollowUpsRef.current(id, updates.followUpAgentId || "", updates.followUpAgent || "", previousFollowUpAgent);
    if (ownerChange) return assignLeadRef.current(id, assignedTo || "", assignedToName || "");
    return true;
  }, [persistLeadPatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteLead = useCallback(async (id: string) => {
    if (useDb) {
      const { error } = await db.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) {
        console.error("[leads] deleteLead failed:", error.message);
        reportLeadError("Lead not deleted", error.message, "We couldn't delete this lead in the database. Please try again.");
        return;
      }
    }
    setLeads((prev) => { const next = prev.filter((l) => l.id !== id); if (!useDb) writeLS(LEADS_KEY, next); return next; });
  }, [useDb, db]);

  /* ── CRM Contacts ── */
  const addContact = useCallback(async (input: Omit<Contact, "id" | "fullName" | "createdAt" | "updatedAt"> & { fullName?: string }): Promise<Contact | null> => {
    const now = new Date().toISOString();
    const fullName = input.fullName ?? `${input.firstName} ${input.lastName ?? ""}`.trim();

    if (useDb) {
      const row = contactToRow({ ...input, fullName, id: uid() });
      const { data, error } = await db.from("contacts").insert(row).select("*").single();
      if (error) {
        if (isMissingTableError(error)) {
          // Migration not applied yet — degrade to local state only, rather
          // than lose the contact the user just filled in a whole form for.
          console.warn("[leads] contacts table not found (migration 0031 not applied) — keeping contact in memory only.");
          const local: Contact = { ...input, id: uid(), fullName, createdAt: now, updatedAt: now };
          setContacts((prev) => [local, ...prev]);
          return local;
        }
        console.error("[leads] addContact failed:", error.message);
        toast.error("Contact not saved", { description: "We couldn't save this contact to the database. Please try again." });
        return null;
      }
      const created = rowToContact(data);
      setContacts((prev) => [created, ...prev]);
      logActivity({ module: "Lead", action: "Contact Created", severity: "success", entity: "Contact", reference: created.id, description: `Added new contact ${created.fullName}.` });
      return created;
    }

    const local: Contact = { ...input, id: uid(), fullName, createdAt: now, updatedAt: now };
    setContacts((prev) => { const next = [local, ...prev]; writeLS(CONTACTS_KEY, next); return next; });
    logActivity({ module: "Lead", action: "Contact Created", severity: "success", entity: "Contact", reference: local.id, description: `Added new contact ${local.fullName}.` });
    return local;
  }, [useDb, db]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    if (useDb) {
      const row = contactToRow(updates);
      const { error } = await db.from("contacts").update(row).eq("id", id);
      if (error && !isMissingTableError(error)) {
        console.error("[leads] updateContact failed:", error.message);
        toast.error("Contact not updated", { description: "We couldn't save these changes. Please try again." });
        return;
      }
    }
    setContacts((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
      if (!useDb) writeLS(CONTACTS_KEY, next);
      return next;
    });
  }, [useDb, db]);

  const deleteContact = useCallback(async (id: string) => {
    if (useDb) {
      const { error } = await db.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error && !isMissingTableError(error)) {
        console.error("[leads] deleteContact failed:", error.message);
        toast.error("Contact not deleted", { description: "We couldn't delete this contact. Please try again." });
        return;
      }
    }
    setContacts((prev) => { const next = prev.filter((c) => c.id !== id); if (!useDb) writeLS(CONTACTS_KEY, next); return next; });
  }, [useDb, db]);

  /* ── Assignment ── */
  /** LOCAL-MODE mirror of an assignment-history row. In DB mode the history is
   *  written by the database itself (leads_record_assignment trigger, migration
   *  0049) in the same transaction as the owner change — never by the client,
   *  so it can't be skipped or duplicated. */
  const recordAssignmentEvent = useCallback(async (ev: Omit<LeadAssignmentEvent, "id" | "createdAt"> & { branchId?: string | null }) => {
    if (useDb) return;
    const local: LeadAssignmentEvent = { ...ev, id: uid(), createdAt: new Date().toISOString() };
    setAssignmentHistory((prev) => {
      const next = [local, ...prev];
      writeLS(ASSIGN_HISTORY_KEY, next);
      return next;
    });
  }, [useDb]);

  const assignLead = useCallback(async (id: string, staffId: string, staffNameIn: string, reason?: string): Promise<boolean> => {
    const lead = leadsRef.current.find((l) => l.id === id);
    if (!lead) return false;
    const previousAssignee = lead.assignedTo;
    if ((previousAssignee || "") === (staffId || "")) return true;
    const isReassign = !!previousAssignee;
    const nowIso = new Date().toISOString();

    // ── Client mirror of the DB ownership guard (the trigger is the real gate) ──
    if (!canChangeLeadOwnerRef.current(lead)) {
      toast.error("Assignment failed", { description: "You don't have permission to change the owner of this lead." });
      return false;
    }
    if (staffId && !eligibleOrUnknown(staffId, lead.branchId)) {
      toast.error("Assignment failed", { description: "Only active Sales Agents who can work this store can own a lead." });
      return false;
    }
    const staffName = staffId ? (salesAgentsRef.current.find((a) => a.id === staffId)?.name || staffNameIn) : "";

    // ── Reassigning a stale Not-Contacted lead: fresh start for the NEW owner ──
    // When a senior reassigns a lead that had aged out at "Not Contacted", the
    // new owner starts clean: the 48h lock clock restarts NOW (a real new owner)
    // and attribution resets so any conversion CREDIT/REWARD is earned by the
    // NEW owner through their own work — never inherited by the previous owner.
    // (Ownership already routes each lead's metrics to its current owner; this
    // also drops any stale agent-driven flag so the new owner earns it fresh.)
    const wasNotContacted = isNotContactedStatus(lead.contactStatus);
    const freshStart = isReassign && !!staffId && wasNotContacted;

    const updates: Partial<Lead> = {
      assignedTo: staffId,
      assignedToName: staffName,
      agent: staffName,
      assignedBy: currentUserIdRef.current || "",
      assignedByName: currentUserNameRef.current || "",
      assignedAt: staffId ? nowIso : "",
      ...(freshStart
        ? {
            // Restart the Not-Contacted countdown for the new owner.
            notContactedSince: nowIso,
            // Reset effort attribution so credit is the new owner's to earn.
            attributionMode: "",
            routedAt: "",
          }
        : {}),
    };

    if (useDb) {
      // Canonical owner = assigned_user_id (assigned_to mirrors it). The DB
      // stamps assigned_by/at + names and writes lead_assignment_history in the
      // same transaction. NO .select() here: RETURNING would require the caller
      // to still SEE the lead after handing it to someone else.
      let row: Record<string, unknown> = {
        assigned_user_id: staffId || null,
        assigned_to: staffId || null,
        last_assignment_reason: reason || null,
        ...(freshStart
          ? { not_contacted_since: nowIso, attribution_mode: null, routed_at: null }
          : {}),
      };
      let { error } = await db.from("leads").update(row).eq("id", id);
      // Heal schema drift: drop optional columns the DB may not have yet.
      let healA = 0;
      while (error && isUndefinedColumnError(error) && healA < 4) {
        healA += 1;
        const col = extractMissingColumn(error);
        row = omitKeys(row, col ? [col] : ["last_assignment_reason", "not_contacted_since", "attribution_mode", "routed_at"]);
        ({ error } = await db.from("leads").update(row).eq("id", id));
      }
      if (error) {
        console.error("[leads] assignLead failed:", error.message);
        reportLeadError("Assignment failed", error.message, "We couldn't save the assignment. Please try again.");
        return false;
      }
      // Re-read the authoritative row (it may no longer be visible to the caller
      // if they handed off a lead they don't own/created) + its history.
      const [{ data: fresh }, { data: hist }] = await Promise.all([
        db.from("leads").select("*").eq("id", id).maybeSingle(),
        db.from("lead_assignment_history").select("*").eq("lead_id", id),
      ]);
      setLeads((prev) => fresh
        ? prev.map((l) => (l.id === id ? applyFulfilmentOverlay([rowToLead(fresh)])[0] : l))
        : prev.filter((l) => l.id !== id));
      if (hist) setAssignmentHistory((prev) => [...hist.map(rowToAssignmentEvent), ...prev.filter((h) => h.leadId !== id)]);
    } else {
      setLeads((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: nowIso } : l));
        writeLS(LEADS_KEY, next);
        return next;
      });
      // Local mirror of the DB-written ownership history row.
      await recordAssignmentEvent({
        leadId: id,
        fromUserId: previousAssignee || undefined,
        fromUserName: lead.assignedToName || undefined,
        toUserId: staffId || undefined,
        toUserName: staffName || undefined,
        assignedBy: currentUserIdRef.current || undefined,
        assignedByName: currentUserNameRef.current || undefined,
        reason,
      });
    }

    // Audit trail (reuses the existing activity/audit system).
    logActivity({
      module: "Lead",
      action: staffId ? (isReassign ? "Lead Reassigned" : "Lead Assigned") : "Lead Unassigned",
      severity: "info",
      entity: "Lead",
      reference: lead.leadNo,
      description: staffId
        ? `${isReassign ? "Reassigned" : "Assigned"} ${lead.leadNo} (${lead.name || "Unnamed"}) to ${staffName}.`
        : `Removed assignment from ${lead.leadNo} (${lead.name || "Unnamed"}).`,
      changes: [{ field: "Assigned To", from: lead.assignedToName || "Unassigned", to: staffName || "Unassigned" }],
    });

    // Notify the ASSIGNED USER (durable bell entry), unless they assigned it to
    // themselves. Reuses the shared notifications feed — no separate system.
    if (staffId && staffId !== currentUserIdRef.current) {
      notify({
        kind: "lead_assigned",
        recipientId: staffId,
        title: isReassign ? "A lead was reassigned to you" : "New lead assigned to you",
        body: `${lead.leadNo} · ${lead.name || "Unnamed"}${currentUserNameRef.current ? ` — by ${currentUserNameRef.current}` : ""}.`,
        href: `/leads/list?lead=${id}`,
        reference: lead.leadNo,
        dedupeKey: `lead-assigned:${id}:${staffId}:${nowIso}`,
      });
    } else if (staffId && staffId === currentUserIdRef.current) {
      toast.success("Lead assigned to you", { description: `${lead.leadNo} · ${lead.name || "Unnamed"}` });
    }
    return true;
  }, [useDb, db, can, recordAssignmentEvent]); // eslint-disable-line react-hooks/exhaustive-deps
  assignLeadRef.current = assignLead;

  /** Follow-up agent changed on a lead → move its OPEN (scheduled) follow-up(s)
   *  to the new agent, notify them, and audit it. Completed/cancelled
   *  follow-ups are history and keep their original agent. The lead OWNER is
   *  untouched (follow-up responsibility ≠ ownership). */
  const reassignOpenFollowUps = useCallback(async (leadId: string, userId: string, userName: string, previousName?: string) => {
    const lead = leadsRef.current.find((l) => l.id === leadId);
    const open = followUpsRef.current.filter((f) => f.leadId === leadId && f.status === "scheduled" && (f.followUpUserId || "") !== (userId || ""));
    for (const f of open) {
      if (useDb) {
        const { error } = await db.from("lead_followup_history").update({ followup_user_id: userId || null, followup_user_name: userName || null }).eq("id", f.id);
        if (error) {
          console.error("[leads] follow-up agent change failed:", error.message);
          reportLeadError("Follow-up not reassigned", error.message, "We couldn't move the open follow-up to the new agent.");
          continue;
        }
      }
      setFollowUps((prev) => {
        const next = prev.map((x) => (x.id === f.id ? { ...x, followUpUserId: userId, followUpUserName: userName } : x));
        if (!useDb) writeLS(FOLLOWUPS_KEY, next);
        return next;
      });
    }
    if (!lead) return;
    logActivity({
      module: "Lead", action: "Follow-up Agent Changed", severity: "info", entity: "Lead", reference: lead.leadNo,
      description: `Follow-up agent for ${lead.leadNo} set to ${userName || "none"} (owner unchanged: ${lead.assignedToName || "Unassigned"}).`,
      changes: [{ field: "Follow-Up Agent", from: previousName || "—", to: userName || "—" }],
    });
    if (userId && userId !== currentUserIdRef.current) {
      notify({
        kind: "lead_assigned",
        recipientId: userId,
        title: "Follow-up assigned to you",
        body: `${lead.leadNo} · ${lead.name || "Unnamed"}${currentUserNameRef.current ? ` — by ${currentUserNameRef.current}` : ""}.`,
        href: `/leads/list?lead=${leadId}`,
        reference: lead.leadNo,
        dedupeKey: `lead-followup-agent:${leadId}:${userId}:${Date.now()}`,
      });
    }
  }, [useDb, db]); // eslint-disable-line react-hooks/exhaustive-deps
  reassignOpenFollowUpsRef.current = reassignOpenFollowUps;

  /* ── Pin ── */
  const pinLead = useCallback(async (id: string, pinned: boolean) => {
    const pinnedAt = pinned ? new Date().toISOString() : "";
    // Optimistic update first so pinning reflects instantly.
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, pinnedAt } : l));
      if (!useDb) writeLS(LEADS_KEY, next);
      return next;
    });
    if (useDb) {
      const { error } = await db.from("leads").update({ pinned_at: pinnedAt || null }).eq("id", id);
      if (error) console.error("[leads] pinLead failed:", error.message);
    }
  }, [useDb, db]);

  /* ── Conversion / handoff history ──────────────────────────────────────
     Append-only trail of the Lead → operations journey. Every operational
     module (route, walk-in, field job, ticket, invoice) records its event here
     so Sales never loses visibility after handoff. */
  const conversionHistoryFor = useCallback((leadId: string): LeadConversionEvent[] => {
    return conversionHistory.filter((e) => e.leadId === leadId).sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }, [conversionHistory]);

  const recordConversionEvent = useCallback(async (
    leadId: string,
    eventType: LeadConversionEventType,
    opts?: { targetType?: LeadConversionTargetType; targetId?: string; targetLabel?: string; value?: number | null; note?: string },
  ) => {
    const lead = leadsRef.current.find((l) => l.id === leadId);
    // Idempotency: don't record the same (event, target) twice for a lead.
    const dup = conversionHistoryRef.current.some(
      (e) => e.leadId === leadId && e.eventType === eventType && (opts?.targetId ? e.targetId === opts.targetId : true),
    );
    if (dup) return;
    const nowIso = new Date().toISOString();
    const ev: LeadConversionEvent = {
      id: uid(), leadId, eventType,
      targetType: opts?.targetType, targetId: opts?.targetId, targetLabel: opts?.targetLabel,
      value: opts?.value ?? null, note: opts?.note, actorName: currentUserNameRef.current || undefined,
      occurredAt: nowIso,
    };
    setConversionHistory((prev) => { const next = [ev, ...prev]; if (!useDb) writeLS(CONVERSION_HISTORY_KEY, next); return next; });

    if (useDb) {
      const row: Record<string, unknown> = {
        lead_id: leadId, branch_id: (lead as any)?.branchId ?? null,
        event_type: eventType, target_type: opts?.targetType ?? null, target_id: opts?.targetId ?? null,
        value: opts?.value ?? null,
        // target_label lives in `note` when the column isn't present; prefer note.
        note: opts?.note ?? opts?.targetLabel ?? null,
      };
      const { error } = await db.from("lead_conversion_history").insert(row);
      if (error && !isMissingTableError(error) && !isUndefinedColumnError(error)) {
        console.error("[leads] conversion history insert failed:", error.message);
      }
    }
  }, [useDb, db]);

  /* ── Fulfilment routing ──
     Records the Sales routing decision on the lead (route + optional store).
     Creating the downstream Walk-In / Field Job happens in the UI layer where
     both useLeads and useField/useStore are available — this keeps the leads
     context free of cross-module dependencies. */
  const routeLead = useCallback(async (
    id: string,
    route: "STORE_VISIT" | "PICKUP_DROP" | "ON_SITE",
    opts?: { assignedStore?: string; assignedStoreId?: string; fieldManagerId?: string },
  ) => {
    const lead = leadsRef.current.find((l) => l.id === id);
    if (!lead) return;
    const routeLabel = route === "STORE_VISIT" ? "Store / Walk-In" : route === "ON_SITE" ? "On-Site" : "Pickup & Drop";
    const updates: Partial<Lead> = {
      fulfilmentRoute: route,
      assignedStore: route === "STORE_VISIT" ? (opts?.assignedStore ?? "") : "",
      routedAt: new Date().toISOString(),
      // The agent WORKED this lead and routed it forward → agent-driven credit.
      attributionMode: "agent_routed",
    };
    await updateLead(id, updates);
    // Persist assigned_store_id (uuid) when a store id is available.
    if (useDb && route === "STORE_VISIT" && opts?.assignedStoreId) {
      const res = await db.from("leads").update({ assigned_store_id: opts.assignedStoreId }).eq("id", id);
      if (res.error && !isUndefinedColumnError(res.error)) console.error("[leads] routeLead store id failed:", res.error.message);
    }

    // Conversion trail: the route decision is the first handoff event.
    await recordConversionEvent(id, "routed", { note: routeLabel });

    logActivity({
      module: "Lead", action: "Lead Routed", severity: "info", entity: "Lead",
      reference: lead.leadNo,
      description: `${lead.leadNo} (${lead.name || "Unnamed"}) routed to ${routeLabel}${updates.assignedStore ? ` · ${updates.assignedStore}` : ""}.`,
      changes: [{ field: "Service Route", from: lead.fulfilmentRoute || "Unrouted", to: routeLabel }],
    });

    // Confirmation to the sales person who routed it.
    toast.success("Lead routed", { description: `${lead.leadNo} → ${routeLabel}` });
  }, [updateLead, useDb, db, recordConversionEvent]);

  /* ── Lead status change (writes status-history + terminal timestamps) ──
     A follow-up completing NEVER lands here automatically — the lead status is
     an explicit, separate decision. This sets qualified_at/converted_at/lost_at
     the first time a lead reaches those states so time-to-* is derivable. */
  const changeLeadStatus = useCallback(async (
    id: string,
    status: string,
    opts?: { note?: string; finalResult?: string; lostReason?: string },
  ) => {
    const lead = leadsRef.current.find((l) => l.id === id);
    if (!lead || status === lead.status) return;
    const nowIso = new Date().toISOString();
    const finalResult = opts?.finalResult ?? lead.finalResult;

    const updates: Partial<Lead> = { status };
    if (opts?.finalResult !== undefined) updates.finalResult = opts.finalResult;
    // Terminal / milestone timestamps — set once (first time reached).
    const extraCols: Record<string, unknown> = {};
    if (isQualifiedStatus(status) && !(lead as any).qualifiedAt) extraCols.qualified_at = nowIso;
    if (isWonStatus(status, finalResult)) { extraCols.converted_at = nowIso; extraCols.converted_by = currentUserIdRef.current || null; }
    if (isLostStatus(status, finalResult)) { extraCols.lost_at = nowIso; if (opts?.lostReason) extraCols.lost_reason = opts.lostReason; }

    await updateLead(id, updates);
    if (useDb && Object.keys(extraCols).length > 0) {
      let row = { ...extraCols };
      let res = await db.from("leads").update(row).eq("id", id);
      let heal = 0;
      while (res.error && isUndefinedColumnError(res.error) && Object.keys(row).length > 0 && heal < 6) {
        heal += 1;
        const col = extractMissingColumn(res.error);
        row = omitKeys(row, col ? [col] : Object.keys(extraCols));
        if (Object.keys(row).length === 0) break;
        res = await db.from("leads").update(row).eq("id", id);
      }
    }

    // Status-history event (append-only).
    const histRow: Record<string, unknown> = {
      lead_id: id, branch_id: (lead as any).branchId ?? null,
      from_status: lead.status || null, to_status: status, note: opts?.note || null,
    };
    if (useDb) {
      const { error } = await db.from("lead_status_history").insert(histRow);
      if (error && !isMissingTableError(error) && !isUndefinedColumnError(error)) console.error("[leads] status history insert failed:", error.message);
    }

    logActivity({
      module: "Lead",
      action: isWonStatus(status, finalResult) ? "Lead Converted" : isLostStatus(status, finalResult) ? "Lead Lost" : "Lead Status Changed",
      severity: isWonStatus(status, finalResult) ? "success" : "info",
      entity: "Lead", reference: lead.leadNo,
      description: `${lead.leadNo} (${lead.name || "Unnamed"}) status → ${status}.`,
      changes: [{ field: "Status", from: lead.status || "—", to: status }],
    });
  }, [useDb, db, updateLead]);

  /* ── Structured follow-ups ──────────────────────────────────────────────
     A follow-up is its OWN record. Scheduling a new one keeps all previous
     follow-ups. Completing records the activity + outcome, and can schedule the
     NEXT follow-up in the same action — it never changes the lead's status. */
  const followUpsFor = useCallback((leadId: string): LeadFollowUp[] => {
    return followUpsRef.current.filter((f) => f.leadId === leadId).sort((a, b) => a.seq - b.seq);
  }, []);

  const scheduleFollowUp = useCallback(async (leadId: string, draft: LeadFollowUpDraft): Promise<LeadFollowUp | null> => {
    const lead = leadsRef.current.find((l) => l.id === leadId);
    if (!lead || !draft.dueAt) return null;
    const nowIso = new Date().toISOString();
    // Follow-up agent: explicit pick, else the lead's follow-up agent, else the
    // owner, else me — the first one who is an ELIGIBLE Sales Agent for the
    // lead's store (legacy/inactive owners are skipped, never assigned work).
    if (draft.followUpUserId && !eligibleOrUnknown(draft.followUpUserId, lead.branchId)) {
      toast.error("Follow-up not saved", { description: "The follow-up agent must be an active Sales Agent who can work this store." });
      return null;
    }
    const fuUserId = draft.followUpUserId
      || [lead.followUpAgentId, lead.assignedTo, currentUserIdRef.current || ""].find((uid) => !!uid && eligibleOrUnknown(uid, lead.branchId))
      || "";
    const fuUserName = fuUserId
      ? (salesAgentsRef.current.find((a) => a.id === fuUserId)?.name
        || draft.followUpUserName
        || (fuUserId === lead.followUpAgentId ? lead.followUpAgent : fuUserId === lead.assignedTo ? lead.assignedToName : currentUserNameRef.current)
        || "")
      : "";
    const existing = followUpsRef.current.filter((f) => f.leadId === leadId);
    const seq = existing.reduce((m, f) => Math.max(m, f.seq), 0) + 1;

    const fu: LeadFollowUp = {
      id: uid(), leadId, seq, dueAt: draft.dueAt,
      followUpUserId: fuUserId, followUpUserName: fuUserName,
      createdBy: currentUserIdRef.current || "", createdByName: currentUserNameRef.current || "",
      status: "scheduled", comments: draft.comments, createdAt: nowIso,
    };

    if (useDb) {
      const row: Record<string, unknown> = {
        lead_id: leadId, branch_id: (lead as any).branchId ?? null,
        scheduled_at: draft.dueAt, followup_user_id: fuUserId || null, followup_user_name: fuUserName || null,
        created_by: currentUserIdRef.current || null, created_by_name: currentUserNameRef.current || null,
        status: "scheduled", comments: draft.comments || null,
      };
      const { data, error } = await db.from("lead_followup_history").insert(row).select("*").single();
      if (error) {
        if (!isMissingTableError(error)) {
          console.error("[leads] scheduleFollowUp failed:", error.message);
          reportLeadError("Follow-up not saved", error.message, "We couldn't schedule this follow-up. Please try again.");
          return null;
        }
      } else if (data) {
        const saved = rowToFollowUp(data);
        setFollowUps((prev) => [saved, ...prev]);
        await afterFollowUpScheduled(lead, saved, fuUserId, fuUserName, draft.dueAt);
        return saved;
      }
    }

    setFollowUps((prev) => { const next = [fu, ...prev]; if (!useDb) writeLS(FOLLOWUPS_KEY, next); return next; });
    await afterFollowUpScheduled(lead, fu, fuUserId, fuUserName, draft.dueAt);
    return fu;
  }, [useDb, db, persistLeadPatch]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Keep the lead's quick-glance follow-up (date + agent ID + name) in sync,
   *  audit it, and notify the follow-up agent when it isn't the scheduler. The
   *  lead OWNER never changes here (follow-up responsibility ≠ ownership). */
  async function afterFollowUpScheduled(lead: Lead, saved: LeadFollowUp, fuUserId: string, fuUserName: string, dueAt: string) {
    await persistLeadPatch(lead.id, { followUpDate: dueAt.slice(0, 10), followUpAgentId: fuUserId, followUpAgent: fuUserName });
    logActivity({ module: "Lead", action: "Follow-up Scheduled", severity: "info", entity: "Lead", reference: lead.leadNo, description: `Follow-up #${saved.seq} scheduled for ${lead.leadNo} on ${dueAt.slice(0, 10)}${fuUserName ? ` · ${fuUserName}` : ""}.` });
    if (fuUserId && fuUserId !== currentUserIdRef.current) {
      notify({
        kind: "lead_assigned",
        recipientId: fuUserId,
        title: "Follow-up assigned to you",
        body: `${lead.leadNo} · ${lead.name || "Unnamed"} — due ${new Date(dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`,
        href: `/leads/list?lead=${lead.id}`,
        reference: lead.leadNo,
        followUpId: saved.id,
        dedupeKey: `lead-followup-assigned:${saved.id}`,
      });
    }
  }

  const completeFollowUp = useCallback(async (followUpId: string, outcome: string, opts?: { comments?: string; next?: LeadFollowUpDraft }) => {
    const fu = followUpsRef.current.find((f) => f.id === followUpId);
    if (!fu) return;
    const lead = leadsRef.current.find((l) => l.id === fu.leadId);
    const nowIso = new Date().toISOString();
    const patch: Partial<LeadFollowUp> = { status: "completed", completedAt: nowIso, outcome, comments: opts?.comments ?? fu.comments };

    setFollowUps((prev) => { const next = prev.map((f) => (f.id === followUpId ? { ...f, ...patch } : f)); if (!useDb) writeLS(FOLLOWUPS_KEY, next); return next; });
    if (useDb) {
      const { error } = await db.from("lead_followup_history").update({ status: "completed", completed_at: nowIso, outcome, result: outcome, comments: opts?.comments ?? fu.comments ?? null }).eq("id", followUpId);
      if (error && !isMissingTableError(error)) console.error("[leads] completeFollowUp failed:", error.message);
    }
    logActivity({ module: "Lead", action: "Follow-up Completed", severity: "success", entity: "Lead", reference: lead?.leadNo || fu.leadId, description: `Follow-up #${fu.seq} completed — outcome: ${outcome}. (Lead status unchanged.)` });

    // Optionally chain the NEXT follow-up while retaining this one's history.
    if (opts?.next?.dueAt) await scheduleFollowUp(fu.leadId, opts.next);
    else await updateLead(fu.leadId, { followUpDate: "" }); // no open follow-up left
    toast.success("Follow-up completed", { description: `Outcome: ${outcome}` });
  }, [useDb, db, scheduleFollowUp, updateLead]);

  const cancelFollowUp = useCallback(async (followUpId: string, reason?: string) => {
    const fu = followUpsRef.current.find((f) => f.id === followUpId);
    if (!fu) return;
    const lead = leadsRef.current.find((l) => l.id === fu.leadId);
    setFollowUps((prev) => { const next = prev.map((f) => (f.id === followUpId ? { ...f, status: "cancelled" as const, comments: reason ?? f.comments } : f)); if (!useDb) writeLS(FOLLOWUPS_KEY, next); return next; });
    if (useDb) {
      const { error } = await db.from("lead_followup_history").update({ status: "cancelled", comments: reason ?? fu.comments ?? null }).eq("id", followUpId);
      if (error && !isMissingTableError(error)) console.error("[leads] cancelFollowUp failed:", error.message);
    }
    logActivity({ module: "Lead", action: "Follow-up Cancelled", severity: "info", entity: "Lead", reference: lead?.leadNo || fu.leadId, description: `Follow-up #${fu.seq} cancelled${reason ? ` — ${reason}` : ""}.` });
    // If no other open follow-up remains, clear the lead's quick-glance date.
    // A cancelled follow-up must not leave its agent holding the lead: when the
    // lead-level follow-up agent was this follow-up's agent, hand it to the next
    // open follow-up's agent (or clear it). The OWNER is never touched.
    const nextOpen = followUpsRef.current
      .filter((f) => f.leadId === fu.leadId && f.id !== followUpId && f.status === "scheduled")
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];
    const patch: Partial<Lead> = {};
    if (!nextOpen) patch.followUpDate = "";
    if (lead?.followUpAgentId && lead.followUpAgentId === fu.followUpUserId) {
      patch.followUpAgentId = nextOpen?.followUpUserId || "";
      patch.followUpAgent = nextOpen?.followUpUserName || "";
    }
    if (Object.keys(patch).length > 0) await persistLeadPatch(fu.leadId, patch);
  }, [useDb, db, persistLeadPatch]);

  const assignmentHistoryFor = useCallback((leadId: string): LeadAssignmentEvent[] => {
    return assignmentHistory.filter((h) => h.leadId === leadId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [assignmentHistory]);

  /** Link an existing operational record to a lead (open-lead detection +
   *  unattributed safety net). Sets the lead's linked_* id, resolves the
   *  customer link, records a conversion event, and guards against attributing
   *  the SAME record to a different lead. */
  const linkOperationalRecord = useCallback(async (
    leadId: string,
    kind: "walk_in" | "field_job" | "ticket" | "invoice",
    recordId: string,
    recordLabel?: string,
  ) => {
    const lead = leadsRef.current.find((l) => l.id === leadId);
    if (!lead || !recordId) return;
    // Duplicate-attribution guard: a single operational record must not be
    // attributed to two leads. If it's already on another lead, block + warn.
    const other = operationalRecordAttributedElsewhere(leadsRef.current, kind, recordId, leadId);
    if (other) {
      toast.error("Already attributed", { description: `${kind.replace("_", " ")} ${recordLabel || recordId} is already linked to ${other.leadNo}.` });
      return;
    }
    const field = kind === "walk_in" ? "linkedWalkInId" : kind === "field_job" ? "linkedFieldJobId" : kind === "ticket" ? "linkedTicketId" : "linkedInvoiceId";
    const eventType: LeadConversionEventType = kind === "walk_in" ? "walk_in_created" : kind === "field_job" ? "field_job_created" : kind === "ticket" ? "ticket_created" : "invoice_created";
    // Back-matched: this operational record was created SELF-INITIATED (the
    // customer came in on their own) and only now linked to the lead. It does
    // NOT earn the agent credit — unless the agent had already routed the lead
    // forward (routedAt set), in which case the agent-driven mode stands.
    const linkUpdates: Partial<Lead> = { [field]: recordId } as Partial<Lead>;
    if (!lead.routedAt && lead.attributionMode !== "agent_routed") {
      linkUpdates.attributionMode = "back_matched";
    }
    await updateLead(leadId, linkUpdates);
    await recordConversionEvent(leadId, eventType, {
      targetType: kind as LeadConversionTargetType, targetId: recordId, targetLabel: recordLabel,
    });
    logActivity({
      module: "Lead", action: "Operational Record Linked", severity: "success", entity: "Lead",
      reference: lead.leadNo,
      description: `${lead.leadNo} linked to ${kind.replace("_", " ")} ${recordLabel || recordId}.`,
    });
  }, [updateLead, recordConversionEvent]);

  /* ── Automatic attribution safety net ──
     When an operational record is created for a customer identity that matches
     an OPEN lead, link it back automatically so the originating Sales Agent
     keeps credit — no manual "link" click needed. This is what makes a routed
     Walk-In lead (which never got a two-way link at routing time) flip to
     "Ticket Created" / "Invoice Created" the moment the ticket/invoice is made.
     Identity match is Customer id → phone → email (never name). It is a no-op
     when nothing matches, and linkOperationalRecord already guards against
     double-attributing one record to two leads. */
  const autoLinkByIdentity = useCallback(async (
    kind: "walk_in" | "field_job" | "ticket" | "invoice",
    recordId: string,
    ident: { customerId?: string; phone?: string; email?: string },
    recordLabel?: string,
  ): Promise<string> => {
    if (!recordId) return "";
    if (!ident.customerId && !ident.phone && !ident.email) return "";
    // Already attributed to a lead? Then there's nothing to recover.
    if (operationalRecordAttributedElsewhere(leadsRef.current, kind, recordId, "")) return "";
    const matches = findOpenLeadMatches(leadsRef.current, ident);
    const top = matches[0];
    if (!top) return "";
    await linkOperationalRecord(top.lead.id, kind, recordId, recordLabel);
    return top.lead.id;
  }, [linkOperationalRecord]);

  /* ── Lead visibility scope (UI = RLS) ──
     See-all roles (CAP.lead.viewTeam ≡ DB auth_lead_see_all) see every lead
     in their store scope. Everyone else — e.g. a Sales Agent — sees only leads
     they CREATED, OWN, or carry FOLLOW-UP responsibility for (the lead's
     follow-up agent or an assigned follow-up record). In DB mode RLS already
     returns exactly this set; the filter keeps local mode + optimistic state
     consistent and is defence-in-depth, never the security boundary. */
  /** The owner may only "view as" an agent when they already have cross-agent
   *  authority (see-all leads, or the all-agent performance key). Otherwise the
   *  scope is ignored — a plain Sales Agent can never scope to someone else. */
  const canViewAsAgent = canSeeAllLeads || allow(can, CAP.lead.performanceAll);
  /** The agent id actually in effect (empty when not authorized / not set). */
  const effectiveViewAsId = canViewAsAgent ? viewAsAgentId : "";
  // Ref mirror so leadMetrics (a stable useCallback) can read the live scope
  // without being re-created on every scope change.
  const effectiveViewAsIdRef = useRef(effectiveViewAsId);
  effectiveViewAsIdRef.current = effectiveViewAsId;
  /** True while an owner is viewing an agent's workspace → the whole Leads
   *  workspace is read-only (defence-in-depth; server + RLS stay the boundary). */
  const viewAsReadOnly = !!effectiveViewAsId;

  const scopedLeads = useMemo(() => {
    // OWNER view-as: scope the owner's (already see-all) visible leads down to
    // the selected agent's leads. Never widens beyond what the owner may see.
    if (effectiveViewAsId) return leadsOwnedBy(canSeeAllLeads ? leads : [], effectiveViewAsId);
    if (canSeeAllLeads) return leads;
    const me = currentUserId || "";
    if (!me) return [];
    const followUpLeadIds = new Set(
      followUps.filter((f) => f.followUpUserId === me && f.status !== "cancelled").map((f) => f.leadId),
    );
    return leads.filter((l) => {
      const mine = l.createdBy === me || l.assignedTo === me || l.followUpAgentId === me || followUpLeadIds.has(l.id);
      if (!mine) return false;
      // Not-Contacted lock: once a lead has aged out at "Not Contacted" (48h+),
      // the Sales Agent loses access to the flow until a senior reassigns it.
      // Seniors/owners (canSeeAllLeads) never hit this branch. A locked lead is
      // hidden from the agent entirely here (defence-in-depth); the DB RLS is
      // the real boundary. It reappears the moment it's reassigned (fresh clock).
      if (isNotContactedLocked(l)) return false;
      return true;
    });
  }, [leads, followUps, canSeeAllLeads, currentUserId, effectiveViewAsId]);

  /** Set/clear the owner "view as agent" scope. Passing "" exits the scope.
   *  No-op for a user without cross-agent authority (the scope would be
   *  ignored anyway) — keeps the setter safe to call from the URL sync. */
  const setViewAsAgent = useCallback((agentId: string) => {
    const next = agentId || "";
    setViewAsAgentId(next);
    if (typeof window !== "undefined") {
      try {
        if (next) window.sessionStorage.setItem(VIEW_AS_AGENT_KEY, next);
        else window.sessionStorage.removeItem(VIEW_AS_AGENT_KEY);
      } catch { /* ignore */ }
    }
  }, []);

  const leadMetrics = useCallback((scope: "me" | "all" | { ownerId: string } = "all", revenue?: { tickets: any[]; invoices: any[] }): LeadMetrics => {
    // Under an owner "view as agent" scope, "me" resolves to the AGENT being
    // viewed (not the owner) so a personal dashboard shows the agent's numbers.
    // `scopedLeads` is already narrowed to that agent, so this keeps the owner
    // filter from zeroing everything out.
    const meId = effectiveViewAsIdRef.current || currentUserIdRef.current || "";
    const ownerId = scope === "me" ? meId : typeof scope === "object" ? scope.ownerId : "";
    // "all" = everything the caller may see (never beyond their scope). An
    // explicit other owner requires the all-performance capability.
    if (typeof scope === "object" && scope.ownerId !== currentUserIdRef.current && !allow(can, CAP.lead.performanceAll)) {
      return computeLeadMetrics([], new Map(), revenue, []);
    }
    const scoped = ownerId ? leadsOwnedBy(scopedLeads, ownerId) : scopedLeads;
    // Build leadId → open (scheduled) follow-up, so pending/overdue derive from
    // real follow-up records.
    const byLead = new Map<string, LeadFollowUp[]>();
    for (const f of followUps) {
      const arr = byLead.get(f.leadId) ?? [];
      arr.push(f); byLead.set(f.leadId, arr);
    }
    const openByLead = new Map<string, LeadFollowUp>();
    for (const [leadId, list] of byLead) {
      const o = openFollowUp(list);
      if (o) openByLead.set(leadId, o);
    }
    // Pass the FULL follow-up set too so the follow-up engine metrics (Due Today
    // / Overdue / Upcoming / Completed / Completion Rate) derive from records.
    return computeLeadMetrics(scoped, openByLead, revenue, followUps);
  }, [scopedLeads, followUps, can]);

  /* ── Shared filters ── */
  const setFilters = useCallback((updater: LeadFilters | ((prev: LeadFilters) => LeadFilters)) => {
    setFiltersState((prev) => (typeof updater === "function" ? (updater as (p: LeadFilters) => LeadFilters)(prev) : updater));
  }, []);
  const clearFilters = useCallback(() => setFiltersState(EMPTY_LEAD_FILTERS), []);

  /* leadId → its single OPEN (scheduled) follow-up. Derived once from the
   * structured lead_followup_history records so the list filter, the table row
   * red-tint / cell, and the metrics all share ONE datetime-precise source of
   * follow-up urgency (never the flat calendar-date field). */
  const openFollowUpsByLead = useMemo(() => {
    const byLead = new Map<string, LeadFollowUp[]>();
    for (const f of followUps) {
      const arr = byLead.get(f.leadId) ?? [];
      arr.push(f); byLead.set(f.leadId, arr);
    }
    const open = new Map<string, LeadFollowUp>();
    for (const [leadId, list] of byLead) {
      const o = openFollowUp(list);
      if (o) open.set(leadId, o);
    }
    return open;
  }, [followUps]);

  const filteredLeads = useMemo(
    () => pinnedFirst(applyLeadFilters(scopedLeads, filters, openFollowUpsByLead)),
    [scopedLeads, filters, openFollowUpsByLead],
  );

  /* ── Option CRUD ── */
  const addOption = useCallback(async (field: LeadFieldKey, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const existing = optionsRef.current.filter((o) => o.field === field);
    if (existing.some((o) => o.value.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Already exists", { description: `"${trimmed}" is already an option.` });
      return;
    }
    const sortOrder = existing.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;

    if (useDb) {
      const { data, error } = await db.from("lead_options").insert({ field, value: trimmed, sort_order: sortOrder, active: true }).select("*").single();
      if (error || !data) {
        console.error("[leads] addOption failed:", error?.message);
        toast.error("Option not added", { description: "We couldn't save this option. Check your permissions and try again." });
        return;
      }
      setOptions((prev) => [...prev, rowToOption(data)]);
      return;
    }
    const opt: LeadOption = { id: uid(), field, value: trimmed, sortOrder, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setOptions((prev) => { const next = [...prev, opt]; writeLS(OPTIONS_KEY, next); return next; });
  }, [useDb, db]);

  const updateOption = useCallback(async (id: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (useDb) {
      const { error } = await db.from("lead_options").update({ value: trimmed }).eq("id", id);
      if (error) { console.error("[leads] updateOption failed:", error.message); toast.error("Option not renamed", { description: "We couldn't rename this option. Please try again." }); return; }
    }
    setOptions((prev) => { const next = prev.map((o) => (o.id === id ? { ...o, value: trimmed } : o)); if (!useDb) writeLS(OPTIONS_KEY, next); return next; });
  }, [useDb, db]);

  const setOptionActive = useCallback(async (id: string, activeState: boolean) => {
    if (useDb) {
      const { error } = await db.from("lead_options").update({ active: activeState }).eq("id", id);
      if (error) { console.error("[leads] setOptionActive failed:", error.message); toast.error("Option not updated", { description: "We couldn't update this option. Please try again." }); return; }
    }
    setOptions((prev) => { const next = prev.map((o) => (o.id === id ? { ...o, active: activeState } : o)); if (!useDb) writeLS(OPTIONS_KEY, next); return next; });
  }, [useDb, db]);

  const reorderOptions = useCallback(async (field: LeadFieldKey, orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    setOptions((prev) => {
      const next = prev.map((o) => (o.field === field && orderMap.has(o.id) ? { ...o, sortOrder: orderMap.get(o.id)! } : o));
      if (!useDb) writeLS(OPTIONS_KEY, next);
      return next;
    });
    if (useDb) {
      for (const [id, i] of orderMap.entries()) {
        const { error } = await db.from("lead_options").update({ sort_order: i }).eq("id", id);
        if (error) console.error("[leads] reorderOptions failed:", error.message);
      }
    }
  }, [useDb, db]);

  const countLeadsUsingOption = useCallback((field: LeadFieldKey, value: string) => {
    if (!value) return 0;
    // The Lead property name matches the option field key (region, source, …).
    return leadsRef.current.filter((l) => String((l as any)[field] ?? "") === value).length;
  }, []);

  const deleteOption = useCallback(async (id: string) => {
    if (useDb) {
      const { error } = await db.from("lead_options").delete().eq("id", id);
      if (error) {
        console.error("[leads] deleteOption failed:", error.message);
        toast.error("Option not deleted", { description: "We couldn't delete this option. Please try again." });
        return;
      }
    }
    setOptions((prev) => { const next = prev.filter((o) => o.id !== id); if (!useDb) writeLS(OPTIONS_KEY, next); return next; });
  }, [useDb, db]);

  const optionsFor = useCallback((field: LeadFieldKey) => {
    return options
      .filter((o) => o.field === field && o.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [options]);

  const value = useMemo<LeadsContextValue>(() => ({
    leads: scopedLeads, filteredLeads, options, hydrated, loadErrors, mode: useDb ? "db" : "local",
    filters, setFilters, clearFilters,
    optionsFor, addLead, updateLead, deleteLead, assignLead, pinLead, routeLead, changeLeadStatus,
    salesAgents, salesAgentsReady, salesAgentsFor, isEligibleSalesAgent, currentUserIsSalesAgent, refreshSalesAgents, canSeeAllLeads, canChangeLeadOwner,
    viewAsAgentId: effectiveViewAsId, canViewAsAgent, viewAsReadOnly, setViewAsAgent,
    followUps, followUpsFor, openFollowUpsByLead, scheduleFollowUp, completeFollowUp, cancelFollowUp,
    assignmentHistory, assignmentHistoryFor,
    conversionHistory, conversionHistoryFor, recordConversionEvent, linkOperationalRecord, autoLinkByIdentity,
    leadMetrics,
    addOption, updateOption, setOptionActive, reorderOptions, deleteOption, countLeadsUsingOption,
    contacts, addContact, updateContact, deleteContact,
  }), [scopedLeads, filteredLeads, options, hydrated, loadErrors, useDb, filters, setFilters, clearFilters, optionsFor, addLead, updateLead, deleteLead, assignLead, pinLead, routeLead, changeLeadStatus,
    salesAgents, salesAgentsReady, salesAgentsFor, isEligibleSalesAgent, currentUserIsSalesAgent, refreshSalesAgents, canSeeAllLeads, canChangeLeadOwner, effectiveViewAsId, canViewAsAgent, viewAsReadOnly, setViewAsAgent, followUps, followUpsFor, openFollowUpsByLead, scheduleFollowUp, completeFollowUp, cancelFollowUp, assignmentHistory, assignmentHistoryFor, conversionHistory, conversionHistoryFor, recordConversionEvent, linkOperationalRecord, autoLinkByIdentity, leadMetrics, addOption, updateOption, setOptionActive, reorderOptions, deleteOption, countLeadsUsingOption, contacts, addContact, updateContact, deleteContact]);

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used within a LeadsProvider");
  return ctx;
}
