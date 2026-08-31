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
import {
  LEAD_DROPDOWN_FIELDS, monthFromDate, applyLeadFilters, pinnedFirst,
  EMPTY_LEAD_FILTERS,
  type Lead, type LeadDraft, type LeadOption, type LeadFieldKey, type LeadFilters,
} from "@/lib/leads-data";

/* ─── Local-storage keys (prototype mode) ─────────────────────────────── */
const LEADS_KEY = "repairox-leads";
const OPTIONS_KEY = "repairox-lead-options";
const SEQ_KEY = "repairox-lead-seq";

/* ─── Row mappers (snake_case DB ↔ camelCase app) ─────────────────────── */

function rowToLead(r: any): Lead {
  return {
    id: r.id,
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
  set("lead_month", l.month);
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
  /** Assign or reassign a lead to a staff member (pass "" to unassign). */
  assignLead: (id: string, staffId: string, staffName: string) => Promise<void>;
  /** Pin/unpin a lead so it floats to the top of the list (DB-backed). */
  pinLead: (id: string, pinned: boolean) => Promise<void>;

  addOption: (field: LeadFieldKey, value: string) => Promise<void>;
  updateOption: (id: string, value: string) => Promise<void>;
  setOptionActive: (id: string, active: boolean) => Promise<void>;
  reorderOptions: (field: LeadFieldKey, orderedIds: string[]) => Promise<void>;
  /** Permanently remove an option. */
  deleteOption: (id: string) => Promise<void>;
  /** How many existing leads currently use this option's value (safety check). */
  countLeadsUsingOption: (field: LeadFieldKey, value: string) => number;
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
  const [hydrated, setHydrated] = useState(false);
  const [filters, setFiltersState] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);

  const useDb = isSupabaseConfigured && !!supabase;
  const db = supabase!;
  const optionsRef = useRef<LeadOption[]>([]);
  optionsRef.current = options;
  const leadsRef = useRef<Lead[]>([]);
  leadsRef.current = leads;
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
      const [{ data: leadRows, error: leadErr }, { data: optRows, error: optErr }] = await Promise.all([
        db.from("leads").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("lead_options").select("*").order("field", { ascending: true }).order("sort_order", { ascending: true }),
      ]);
      if (!active) return;
      if (!leadErr && leadRows) setLeads(leadRows.map(rowToLead));

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
      const [{ data: leadRows }, { data: optRows }] = await Promise.all([
        db.from("leads").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("lead_options").select("*").order("field", { ascending: true }).order("sort_order", { ascending: true }),
      ]);
      if (!active) return;
      if (leadRows) setLeads(leadRows.map(rowToLead));
      if (optRows) setOptions(optRows.map(rowToOption));
    };
    for (const table of ["leads", "lead_options"]) {
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

  /* ── Lead CRUD ── */
  const addLead = useCallback(async (draft: LeadDraft): Promise<Lead | null> => {
    const { date, time, month } = nowParts();

    if (useDb) {
      // Ask the DB for the next org-scoped sequential Lead ID (gap-free).
      // The zero-arg overload derives the org from the signed-in user.
      let leadNo = "";
      const { data: seq, error: seqErr } = await db.rpc("next_lead_id");
      if (!seqErr && typeof seq === "string") leadNo = seq;
      else if (seqErr) console.error("[leads] next_lead_id failed:", seqErr.message);

      const row = {
        ...leadToRow({ ...draft, date, time, month } as Partial<Lead>),
        ...(leadNo ? { lead_no: leadNo } : {}),
      };
      const { data, error } = await db.from("leads").insert(row).select("*").single();
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
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setLeads((prev) => { const next = [lead, ...prev]; writeLS(LEADS_KEY, next); return next; });
    toast.success("Lead created", { description: `${lead.leadNo} · ${lead.name}` });
    return lead;
  }, [useDb, db, nextLeadNoLocal]);

  const updateLead = useCallback(async (id: string, updates: Partial<Lead>) => {
    if (useDb) {
      const { error } = await db.from("leads").update(leadToRow(updates)).eq("id", id);
      if (error) {
        console.error("[leads] updateLead failed:", error.message);
        toast.error("Changes not saved", { description: "We couldn't update this lead in the database. Please try again." });
        return;
      }
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l)));
      return;
    }
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l));
      writeLS(LEADS_KEY, next);
      return next;
    });
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

  /* ── Assignment ── */
  const assignLead = useCallback(async (id: string, staffId: string, staffName: string) => {
    const lead = leadsRef.current.find((l) => l.id === id);
    if (!lead) return;
    const previousAssignee = lead.assignedTo;
    const isReassign = !!previousAssignee && previousAssignee !== staffId;
    const nowIso = new Date().toISOString();

    const updates: Partial<Lead> = {
      assignedTo: staffId,
      assignedToName: staffName,
      assignedBy: currentUserIdRef.current || "",
      assignedByName: currentUserNameRef.current || "",
      assignedAt: staffId ? nowIso : "",
    };

    if (useDb) {
      const { error } = await db.from("leads").update(leadToRow(updates)).eq("id", id);
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

    // Notify — but only the ASSIGNED USER should get the "assigned to you" alert.
    // If the person doing the assigning is also the assignee, skip (they know).
    if (staffId && staffId === currentUserIdRef.current) {
      // Assigner assigned it to themselves — a quiet confirmation is enough.
      toast.success("Lead assigned to you", { description: `${lead.leadNo} · ${lead.name || "Unnamed"}` });
    }
    // For a different assignee, the notification fires in THEIR session — see
    // the assignment-watch effect below (realtime + reload picks it up).
  }, [useDb, db]);

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
    optionsFor, addLead, updateLead, deleteLead, assignLead, pinLead,
    addOption, updateOption, setOptionActive, reorderOptions, deleteOption, countLeadsUsingOption,
  }), [leads, filteredLeads, options, hydrated, useDb, filters, setFilters, clearFilters, optionsFor, addLead, updateLead, deleteLead, assignLead, pinLead, addOption, updateOption, setOptionActive, reorderOptions, deleteOption, countLeadsUsingOption]);

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used within a LeadsProvider");
  return ctx;
}
