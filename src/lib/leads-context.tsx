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
import {
  LEAD_DROPDOWN_FIELDS, monthFromDate, applyLeadFilters, pinnedFirst,
  isQualifiedStatus, isWonStatus, isLostStatus,
  computeLeadMetrics, openFollowUp, leadsOwnedBy,
  type LeadFollowUp, type LeadFollowUpDraft, type LeadAssignmentEvent, type LeadMetrics,
  operationalRecordAttributedElsewhere,
  type LeadConversionEvent, type LeadConversionEventType, type LeadConversionTargetType,
  EMPTY_LEAD_FILTERS,
  type Lead, type LeadDraft, type LeadOption, type LeadFieldKey, type LeadFilters, type Contact,
} from "@/lib/leads-data";

/* ─── Local-storage keys (prototype mode) ─────────────────────────────── */
const LEADS_KEY = "repairox-leads";
const OPTIONS_KEY = "repairox-lead-options";
const SEQ_KEY = "repairox-lead-seq";
const CONTACTS_KEY = "repairox-contacts";
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
    agent: r.agent ?? "",
    name: r.name ?? "",
    number: r.number ?? "",
    email: r.email ?? "",
    location: r.location ?? "",
    device: r.device ?? "",
    issue: r.issue ?? "",
    category: r.category ?? "",
    estimate: r.estimate == null ? null : Number(r.estimate),
    discount: r.discount == null ? null : Number(r.discount),
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
    finalResult: r.final_result ?? "",
    followUpComments: r.follow_up_comments ?? "",
    assignedTo: r.assigned_to ?? "",
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
    convertedAt: r.converted_at ?? undefined,
    convertedBy: r.converted_by ?? undefined,
    conversionSource: r.conversion_source ?? undefined,
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
  set("agent", l.agent);
  set("name", l.name);
  set("number", l.number);
  set("email", l.email);
  set("location", l.location);
  set("device", l.device);
  set("issue", l.issue);
  set("category", l.category);
  if (l.estimate !== undefined) row.estimate = l.estimate;
  if (l.discount !== undefined) row.discount = l.discount;
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
  set("final_result", l.finalResult);
  set("follow_up_comments", l.followUpComments);
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
  if (l.convertedAt !== undefined) row.converted_at = l.convertedAt || null;
  if (l.convertedBy !== undefined) row.converted_by = l.convertedBy || null;
  set("conversion_source", l.conversionSource);
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
  leads: Lead[];
  /** Leads after applying the SHARED filters, pinned-first. The list table and
   *  the dashboard both read this so they always agree on the dataset. */
  filteredLeads: Lead[];
  options: LeadOption[];
  hydrated: boolean;
  mode: "db" | "local";

  /** Shared filter state (used by list + dashboard). */
  filters: LeadFilters;
  setFilters: (updater: LeadFilters | ((prev: LeadFilters) => LeadFilters)) => void;
  clearFilters: () => void;

  /** Active option values for a field, in sort order. */
  optionsFor: (field: LeadFieldKey) => LeadOption[];

  addLead: (draft: LeadDraft) => Promise<Lead | null>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  /** Assign or reassign a lead to a staff member (pass "" to unassign).
   *  Writes an assignment-history row + a durable notification to the assignee. */
  assignLead: (id: string, staffId: string, staffName: string, reason?: string) => Promise<void>;
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
  "linked_walk_in_id", "linked_field_job_id", "linked_ticket_id", "linked_invoice_id", "contact_id", "customer_id",
  "converted_at", "converted_by", "conversion_source",
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
  const { authReady } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [options, setOptions] = useState<LeadOption[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<LeadAssignmentEvent[]>([]);
  const [conversionHistory, setConversionHistory] = useState<LeadConversionEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [filters, setFiltersState] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);

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
    const existing = findContactMatches(contactsRef.current, { phone: draft.number, email: draft.email })[0]?.contact;
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
    const resolvedDraft: LeadDraft = { ...draft, contactId, customerId: draft.customerId ?? "" };

    if (useDb) {
      // Ask the DB for the next org-scoped sequential Lead ID (gap-free).
      // The zero-arg overload derives the org from the signed-in user.
      let leadNo = "";
      const { data: seq, error: seqErr } = await db.rpc("next_lead_id");
      if (!seqErr && typeof seq === "string") leadNo = seq;
      else if (seqErr) console.error("[leads] next_lead_id failed:", seqErr.message);

      let row: Record<string, unknown> = {
        ...leadToRow({ ...resolvedDraft, date, time, month } as Partial<Lead>),
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
        toast.error("Lead not saved", { description: "We couldn't save this lead to the database. Please try again." });
        return null;
      }
      const created = rowToLead(data);
      setLeads((prev) => [created, ...prev]);
      toast.success("Lead created", { description: `${created.leadNo} · ${created.name}` });
      return created;
    }

    // Local mode
    const lead: Lead = {
      id: uid(),
      branchId: draft.branchId ?? "",
      leadNo: nextLeadNoLocal(),
      date, time, month,
      region: draft.region ?? "", source: draft.source ?? "", agent: draft.agent ?? "",
      name: draft.name ?? "", number: draft.number ?? "", email: draft.email ?? "", location: draft.location ?? "",
      device: draft.device ?? "", issue: draft.issue ?? "", category: draft.category ?? "",
      estimate: draft.estimate ?? null, discount: draft.discount ?? null,
      leadCategory: draft.leadCategory ?? "", leadNature: draft.leadNature ?? "", priority: draft.priority ?? "",
      comments: draft.comments ?? "", contactStatus: draft.contactStatus ?? "", status: draft.status ?? "",
      result: draft.result ?? "", finalRemarks: draft.finalRemarks ?? "", followUpDate: draft.followUpDate ?? "",
      followUpAgent: draft.followUpAgent ?? "", finalResult: draft.finalResult ?? "", followUpComments: draft.followUpComments ?? "",
      assignedTo: "", assignedToName: "", assignedBy: "", assignedByName: "", assignedAt: "",
      pinnedAt: "",
      fulfilmentRoute: draft.fulfilmentRoute ?? "", assignedStore: draft.assignedStore ?? "", routedAt: "",
      linkedWalkInId: "", linkedFieldJobId: "", linkedTicketId: "", linkedInvoiceId: "", contactId, customerId: resolvedDraft.customerId ?? "",
      convertedAt: draft.convertedAt, convertedBy: draft.convertedBy, conversionSource: draft.conversionSource,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setLeads((prev) => { const next = [lead, ...prev]; writeLS(LEADS_KEY, next); return next; });
    toast.success("Lead created", { description: `${lead.leadNo} · ${lead.name}` });
    return lead;
  }, [useDb, db, nextLeadNoLocal, resolveLeadContact]);

  const updateLead = useCallback(async (id: string, updates: Partial<Lead>) => {
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
        toast.error("Changes not saved", { description: "We couldn't update this lead in the database. Please try again." });
      }
    }
  }, [useDb, db]);

  const deleteLead = useCallback(async (id: string) => {
    if (useDb) {
      const { error } = await db.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) {
        console.error("[leads] deleteLead failed:", error.message);
        toast.error("Lead not deleted", { description: "We couldn't delete this lead in the database. Please try again." });
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
  /** Append an assignment-history row (DB append-only table, or local mirror).
   *  Ownership is NEVER overwritten without leaving this trail. */
  const recordAssignmentEvent = useCallback(async (ev: Omit<LeadAssignmentEvent, "id" | "createdAt"> & { branchId?: string | null }) => {
    const lead = leadsRef.current.find((l) => l.id === ev.leadId);
    const local: LeadAssignmentEvent = { ...ev, id: uid(), createdAt: new Date().toISOString() };
    setAssignmentHistory((prev) => {
      const next = [local, ...prev];
      if (!useDb) writeLS(ASSIGN_HISTORY_KEY, next);
      return next;
    });
    if (useDb) {
      const row: Record<string, unknown> = {
        lead_id: ev.leadId,
        branch_id: (lead as any)?.branchId ?? ev.branchId ?? null,
        from_user_id: ev.fromUserId || null,
        from_user_name: ev.fromUserName || null,
        to_user_id: ev.toUserId || null,
        to_user_name: ev.toUserName || null,
        assigned_by: ev.assignedBy || null,
        assigned_by_name: ev.assignedByName || null,
        reason: ev.reason || null,
      };
      const { error } = await db.from("lead_assignment_history").insert(row);
      if (error && !isMissingTableError(error) && !isUndefinedColumnError(error)) {
        console.error("[leads] assignment history insert failed:", error.message);
      }
    }
  }, [useDb, db]);

  const assignLead = useCallback(async (id: string, staffId: string, staffName: string, reason?: string) => {
    const lead = leadsRef.current.find((l) => l.id === id);
    if (!lead) return;
    const previousAssignee = lead.assignedTo;
    const isReassign = !!previousAssignee && previousAssignee !== staffId;
    const nowIso = new Date().toISOString();

    const updates: Partial<Lead> = {
      assignedTo: staffId,
      // assigned_user_id (canonical ownership) is kept in lockstep by the DB
      // trigger (0045); mirror it locally too so local mode agrees.
      assignedToName: staffName,
      assignedBy: currentUserIdRef.current || "",
      assignedByName: currentUserNameRef.current || "",
      assignedAt: staffId ? nowIso : "",
    };

    if (useDb) {
      const row = { ...leadToRow(updates), assigned_user_id: staffId || null };
      const { error } = await db.from("leads").update(row).eq("id", id);
      if (error) {
        console.error("[leads] assignLead failed:", error.message);
        toast.error("Assignment failed", { description: "We couldn't save the assignment. Please try again." });
        return;
      }
    }
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: nowIso } : l));
      if (!useDb) writeLS(LEADS_KEY, next);
      return next;
    });

    // Ownership history — never overwrite an owner without a trail.
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
  }, [useDb, db, recordAssignmentEvent]);

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
    // Follow-up agent defaults to the lead owner but may differ (§12).
    const fuUserId = draft.followUpUserId || lead.assignedTo || currentUserIdRef.current || "";
    const fuUserName = draft.followUpUserName || lead.assignedToName || currentUserNameRef.current || "";
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
          toast.error("Follow-up not saved", { description: "We couldn't schedule this follow-up. Please try again." });
          return null;
        }
      } else if (data) {
        const saved = rowToFollowUp(data);
        setFollowUps((prev) => [saved, ...prev]);
        // Keep the lead's quick-glance next-follow-up in sync (denormalized).
        await updateLead(leadId, { followUpDate: draft.dueAt.slice(0, 10), followUpAgent: fuUserName });
        logActivity({ module: "Lead", action: "Follow-up Scheduled", severity: "info", entity: "Lead", reference: lead.leadNo, description: `Follow-up #${saved.seq} scheduled for ${lead.leadNo} on ${draft.dueAt.slice(0, 10)}${fuUserName ? ` · ${fuUserName}` : ""}.` });
        return saved;
      }
    }

    setFollowUps((prev) => { const next = [fu, ...prev]; if (!useDb) writeLS(FOLLOWUPS_KEY, next); return next; });
    await updateLead(leadId, { followUpDate: draft.dueAt.slice(0, 10), followUpAgent: fuUserName });
    logActivity({ module: "Lead", action: "Follow-up Scheduled", severity: "info", entity: "Lead", reference: lead.leadNo, description: `Follow-up #${fu.seq} scheduled for ${lead.leadNo} on ${draft.dueAt.slice(0, 10)}${fuUserName ? ` · ${fuUserName}` : ""}.` });
    return fu;
  }, [useDb, db, updateLead]);

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
    const stillOpen = followUpsRef.current.some((f) => f.leadId === fu.leadId && f.id !== followUpId && f.status === "scheduled");
    if (!stillOpen) await updateLead(fu.leadId, { followUpDate: "" });
  }, [useDb, db, updateLead]);

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
    await updateLead(leadId, { [field]: recordId } as Partial<Lead>);
    await recordConversionEvent(leadId, eventType, {
      targetType: kind as LeadConversionTargetType, targetId: recordId, targetLabel: recordLabel,
    });
    logActivity({
      module: "Lead", action: "Operational Record Linked", severity: "success", entity: "Lead",
      reference: lead.leadNo,
      description: `${lead.leadNo} linked to ${kind.replace("_", " ")} ${recordLabel || recordId}.`,
    });
  }, [updateLead, recordConversionEvent]);

  const leadMetrics = useCallback((scope: "me" | "all" | { ownerId: string } = "all", revenue?: { tickets: any[]; invoices: any[] }): LeadMetrics => {
    const ownerId = scope === "me" ? (currentUserIdRef.current || "") : typeof scope === "object" ? scope.ownerId : "";
    const scoped = ownerId ? leadsOwnedBy(leads, ownerId) : leads;
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
    return computeLeadMetrics(scoped, openByLead, revenue);
  }, [leads, followUps]);

  /* ── Shared filters ── */
  const setFilters = useCallback((updater: LeadFilters | ((prev: LeadFilters) => LeadFilters)) => {
    setFiltersState((prev) => (typeof updater === "function" ? (updater as (p: LeadFilters) => LeadFilters)(prev) : updater));
  }, []);
  const clearFilters = useCallback(() => setFiltersState(EMPTY_LEAD_FILTERS), []);

  const filteredLeads = useMemo(() => pinnedFirst(applyLeadFilters(leads, filters)), [leads, filters]);

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
    leads, filteredLeads, options, hydrated, mode: useDb ? "db" : "local",
    filters, setFilters, clearFilters,
    optionsFor, addLead, updateLead, deleteLead, assignLead, pinLead, routeLead, changeLeadStatus,
    followUps, followUpsFor, scheduleFollowUp, completeFollowUp, cancelFollowUp,
    assignmentHistory, assignmentHistoryFor,
    conversionHistory, conversionHistoryFor, recordConversionEvent, linkOperationalRecord,
    leadMetrics,
    addOption, updateOption, setOptionActive, reorderOptions, deleteOption, countLeadsUsingOption,
    contacts, addContact, updateContact, deleteContact,
  }), [leads, filteredLeads, options, hydrated, useDb, filters, setFilters, clearFilters, optionsFor, addLead, updateLead, deleteLead, assignLead, pinLead, routeLead, changeLeadStatus, followUps, followUpsFor, scheduleFollowUp, completeFollowUp, cancelFollowUp, assignmentHistory, assignmentHistoryFor, conversionHistory, conversionHistoryFor, recordConversionEvent, linkOperationalRecord, leadMetrics, addOption, updateOption, setOptionActive, reorderOptions, deleteOption, countLeadsUsingOption, contacts, addContact, updateContact, deleteContact]);

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used within a LeadsProvider");
  return ctx;
}
