"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Management data context (Pickup & Drop logistics).

   Owns the live list of Field Jobs and exposes CRUD + lifecycle transitions.
   Follows the same dual-mode contract as leads-context.tsx: when a Supabase
   `field_jobs` table is reachable it reads/writes/subscribes there; otherwise
   it transparently falls back to localStorage so the prototype keeps working.

   Every meaningful transition:
     • writes the new state,
     • records an audit event via logActivity (module "Field"),
     • fires targeted notifications (notify) to Sales / Field Manager / Ninja.

   It NEVER duplicates master data — a FieldJob references customerId, leadId,
   linkedTicketId, and staff ids only.
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
import {
  genFieldJobId, nextFieldJobNo, applyFieldFilters, EMPTY_FIELD_FILTERS,
  FIELD_STATUS_LABEL,
  type FieldJob, type FieldJobDraft, type FieldJobStatus, type FieldJobFilters, type FieldProof,
} from "@/lib/field-data";

const JOBS_KEY = "repairox-field-jobs";

/* ─── Row mappers (snake_case DB ↔ camelCase app) — used only in DB mode ── */

function rowToJob(r: any): FieldJob {
  return {
    id: r.id,
    jobNo: r.job_no ?? "",
    leadId: r.lead_id ?? "",
    leadNo: r.lead_no ?? "",
    customerId: r.customer_id ?? "",
    linkedTicketId: r.linked_ticket_id ?? "",
    linkedInvoiceId: r.linked_invoice_id ?? "",
    customer: r.customer ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    device: r.device ?? "",
    modelId: r.model_id ?? "",
    category: r.category ?? "",
    issue: r.issue ?? "",
    branch: r.branch ?? "",
    salesPersonId: r.sales_person_id ?? "",
    salesPersonName: r.sales_person_name ?? "",
    fieldManagerId: r.field_manager_id ?? "",
    fieldManagerName: r.field_manager_name ?? "",
    ninjaId: r.ninja_id ?? "",
    ninjaName: r.ninja_name ?? "",
    dropNinjaId: r.drop_ninja_id ?? "",
    dropNinjaName: r.drop_ninja_name ?? "",
    pickupAddress: r.pickup_address ?? "",
    pickupDate: r.pickup_date ?? "",
    pickupTime: r.pickup_time ?? "",
    pickupProof: r.pickup_proof ?? undefined,
    dropAddress: r.drop_address ?? "",
    dropDate: r.drop_date ?? "",
    dropTime: r.drop_time ?? "",
    dropProof: r.drop_proof ?? undefined,
    status: (r.status ?? "pending_assignment") as FieldJobStatus,
    notes: r.notes ?? "",
    deliveryConfirmed: !!r.delivery_confirmed,
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

function jobToRow(j: Partial<FieldJob>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (col: string, v: unknown) => { if (v !== undefined) row[col] = v === "" ? null : v; };
  set("job_no", j.jobNo);
  set("lead_id", j.leadId);
  set("lead_no", j.leadNo);
  set("customer_id", j.customerId);
  set("linked_ticket_id", j.linkedTicketId);
  set("linked_invoice_id", j.linkedInvoiceId);
  set("customer", j.customer);
  set("phone", j.phone);
  set("email", j.email);
  set("device", j.device);
  set("model_id", j.modelId);
  set("category", j.category);
  set("issue", j.issue);
  set("branch", j.branch);
  set("sales_person_id", j.salesPersonId);
  set("sales_person_name", j.salesPersonName);
  set("field_manager_id", j.fieldManagerId);
  set("field_manager_name", j.fieldManagerName);
  set("ninja_id", j.ninjaId);
  set("ninja_name", j.ninjaName);
  set("drop_ninja_id", j.dropNinjaId);
  set("drop_ninja_name", j.dropNinjaName);
  set("pickup_address", j.pickupAddress);
  set("pickup_date", j.pickupDate);
  set("pickup_time", j.pickupTime);
  if (j.pickupProof !== undefined) row.pickup_proof = j.pickupProof ?? null;
  set("drop_address", j.dropAddress);
  set("drop_date", j.dropDate);
  set("drop_time", j.dropTime);
  if (j.dropProof !== undefined) row.drop_proof = j.dropProof ?? null;
  set("status", j.status);
  set("notes", j.notes);
  if (j.deliveryConfirmed !== undefined) row.delivery_confirmed = j.deliveryConfirmed;
  return row;
}

/* ─── Context shape ───────────────────────────────────────────────────── */

interface FieldContextValue {
  jobs: FieldJob[];
  filteredJobs: FieldJob[];
  hydrated: boolean;
  mode: "db" | "local";

  filters: FieldJobFilters;
  setFilters: (u: FieldJobFilters | ((p: FieldJobFilters) => FieldJobFilters)) => void;
  clearFilters: () => void;

  getJob: (id: string) => FieldJob | undefined;
  /** Find an active (non-terminal) field job already linked to a lead. */
  activeJobForLead: (leadId: string) => FieldJob | undefined;

  createJob: (draft: FieldJobDraft) => Promise<FieldJob | null>;
  updateJob: (id: string, updates: Partial<FieldJob>) => Promise<void>;

  /** Field Manager takes ownership. */
  assignFieldManager: (id: string, managerId: string, managerName: string) => Promise<void>;
  /** Assign / reassign the pickup Ninja (moves job to "assigned"). */
  assignNinja: (id: string, ninjaId: string, ninjaName: string, date?: string, time?: string) => Promise<void>;
  /** Assign / reassign the drop Ninja (moves job to "drop_scheduled"). */
  assignDropNinja: (id: string, ninjaId: string, ninjaName: string, date?: string, time?: string) => Promise<void>;
  /** Generic guarded status transition with audit + notification. */
  transition: (id: string, status: FieldJobStatus, extra?: Partial<FieldJob>) => Promise<void>;
  /** Confirm pickup with proof; moves to "picked_up". */
  confirmPickup: (id: string, proof: FieldProof) => Promise<void>;
  /** Store receives the device; moves to "at_store". */
  receiveAtStore: (id: string) => Promise<void>;
  /** Repair complete → device ready to go back; moves to "ready_for_drop". */
  markReadyForDrop: (id: string) => Promise<void>;
  /** Confirm delivery with proof; moves to "delivered" then "completed". */
  confirmDelivery: (id: string, proof: FieldProof) => Promise<void>;
  /** Cancel the job (non-destructive; preserves history). */
  cancelJob: (id: string, reason?: string) => Promise<void>;
  /** Link a repair Ticket (and optionally set in_repair). */
  linkTicket: (id: string, ticketId: string, opts?: { setInRepair?: boolean }) => Promise<void>;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/* ─── Local helpers ───────────────────────────────────────────────────── */

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(demoKey(key)); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function writeLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(demoKey(key), JSON.stringify(value)); } catch { /* quota */ }
}

/** Custom event so any page can open a specific Field Job drawer. */
export const FIELD_OPEN_EVENT = "repairox:open-field-job";
export function openFieldJob(id: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIELD_OPEN_EVENT, { detail: { id } }));
  }
}

/* ─── Provider ────────────────────────────────────────────────────────── */

export function FieldProvider({ children }: { children: ReactNode }) {
  const { authReady } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [filters, setFiltersState] = useState<FieldJobFilters>(EMPTY_FIELD_FILTERS);
  // Whether a live `field_jobs` table is usable. Starts optimistic in DB mode
  // and flips to false the first time a query errors (table not migrated yet).
  const [dbOk, setDbOk] = useState<boolean>(isSupabaseConfigured && !!supabase);

  const useDb = isSupabaseConfigured && !!supabase && dbOk;
  const db = supabase!;
  const jobsRef = useRef<FieldJob[]>([]);
  jobsRef.current = jobs;

  /* ── Hydration ── */
  useEffect(() => {
    let active = true;
    async function load() {
      if (isSupabaseConfigured && supabase && authReady) {
        const { data, error } = await supabase
          .from("field_jobs").select("*").is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (!active) return;
        if (error) {
          // Table missing / RLS — fall back to localStorage transparently.
          setDbOk(false);
          setJobs(readLS<FieldJob[]>(JOBS_KEY, []));
        } else {
          setJobs((data ?? []).map(rowToJob));
        }
        setHydrated(true);
        return;
      }
      // Local mode
      setJobs(readLS<FieldJob[]>(JOBS_KEY, []));
      setHydrated(true);
    }
    // Wait for auth in DB mode so RLS reads succeed.
    if (isSupabaseConfigured && supabase && !authReady) return;
    load();
    return () => { active = false; };
  }, [authReady]);

  /* ── Realtime (DB mode) ── */
  useEffect(() => {
    if (!useDb || !authReady) return;
    let active = true;
    const channel = db.channel("field-jobs-realtime");
    const reload = async () => {
      const { data, error } = await db.from("field_jobs").select("*").is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (!active || error) return;
      setJobs((data ?? []).map(rowToJob));
    };
    channel.on("postgres_changes", { event: "*", schema: "public", table: "field_jobs" }, reload);
    channel.subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [useDb, authReady, db]);

  const persistLocal = useCallback((next: FieldJob[]) => {
    if (!useDb) writeLS(JOBS_KEY, next);
  }, [useDb]);

  /* ── Filtering ── */
  const filteredJobs = useMemo(() => applyFieldFilters(jobs, filters), [jobs, filters]);
  const setFilters = useCallback((u: FieldJobFilters | ((p: FieldJobFilters) => FieldJobFilters)) => {
    setFiltersState((prev) => (typeof u === "function" ? (u as any)(prev) : u));
  }, []);
  const clearFilters = useCallback(() => setFiltersState(EMPTY_FIELD_FILTERS), []);

  const getJob = useCallback((id: string) => jobsRef.current.find((j) => j.id === id), []);
  const activeJobForLead = useCallback((leadId: string) =>
    jobsRef.current.find((j) => j.leadId === leadId && j.status !== "cancelled"), []);

  /* ── Create ── */
  const createJob = useCallback(async (draft: FieldJobDraft): Promise<FieldJob | null> => {
    // Duplicate protection: one active Field Job per lead.
    if (draft.leadId) {
      const existing = jobsRef.current.find((j) => j.leadId === draft.leadId && j.status !== "cancelled");
      if (existing) {
        toast.info("Field Job already exists", { description: `${existing.jobNo} is already handling this lead.` });
        return existing;
      }
    }
    const nowIso = new Date().toISOString();
    const job: FieldJob = {
      id: genFieldJobId(),
      jobNo: nextFieldJobNo(jobsRef.current),
      leadId: draft.leadId ?? "",
      leadNo: draft.leadNo ?? "",
      customerId: draft.customerId ?? "",
      linkedTicketId: "",
      linkedInvoiceId: "",
      customer: draft.customer ?? "",
      phone: draft.phone ?? "",
      email: draft.email ?? "",
      device: draft.device ?? "",
      modelId: draft.modelId ?? "",
      category: draft.category ?? "",
      issue: draft.issue ?? "",
      branch: draft.branch ?? "",
      salesPersonId: draft.salesPersonId ?? "",
      salesPersonName: draft.salesPersonName ?? "",
      fieldManagerId: draft.fieldManagerId ?? "",
      fieldManagerName: draft.fieldManagerName ?? "",
      ninjaId: "",
      ninjaName: "",
      dropNinjaId: "",
      dropNinjaName: "",
      pickupAddress: draft.pickupAddress ?? "",
      pickupDate: draft.pickupDate ?? "",
      pickupTime: draft.pickupTime ?? "",
      dropAddress: draft.dropAddress ?? "",
      dropDate: draft.dropDate ?? "",
      dropTime: draft.dropTime ?? "",
      status: draft.status ?? "pending_assignment",
      notes: draft.notes ?? "",
      deliveryConfirmed: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (useDb) {
      const { data, error } = await db.from("field_jobs").insert(jobToRow(job)).select("*").single();
      if (error || !data) {
        setDbOk(false); // fall back to local for the rest of the session
        setJobs((prev) => { const next = [job, ...prev]; writeLS(JOBS_KEY, next); return next; });
      } else {
        const created = rowToJob(data);
        setJobs((prev) => [created, ...prev]);
      }
    } else {
      setJobs((prev) => { const next = [job, ...prev]; persistLocal(next); return next; });
    }

    logActivity({
      module: "Field", action: "Field Job Created", severity: "info", entity: "Field Job",
      reference: job.jobNo,
      description: `Pickup & Drop job ${job.jobNo} created for ${job.customer || "customer"}${job.leadNo ? ` from ${job.leadNo}` : ""}.`,
    });
    // Notify Field Managers (role-targeted) of the new pickup lead.
    notify({
      kind: "field_new_job", recipientRole: "field_manager",
      title: "New Pickup & Drop lead",
      body: `${job.jobNo} · ${job.customer || "Customer"} — ${job.device || "device"}${job.branch ? ` · ${job.branch}` : ""}`,
      href: `/field?job=${job.id}`, reference: job.jobNo,
    });
    return job;
  }, [useDb, db, persistLocal]);

  /* ── Low-level update ── */
  const updateJob = useCallback(async (id: string, updates: Partial<FieldJob>) => {
    const nowIso = new Date().toISOString();
    if (useDb) {
      const { error } = await db.from("field_jobs").update(jobToRow(updates)).eq("id", id);
      if (error) { setDbOk(false); }
    }
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === id ? { ...j, ...updates, updatedAt: nowIso } : j));
      persistLocal(next);
      return next;
    });
  }, [useDb, db, persistLocal]);

  /* ── Assign Field Manager ── */
  const assignFieldManager = useCallback(async (id: string, managerId: string, managerName: string) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { fieldManagerId: managerId, fieldManagerName: managerName });
    logActivity({
      module: "Field", action: "Field Manager Assigned", severity: "info", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} assigned to Field Manager ${managerName}.`,
      changes: [{ field: "Field Manager", from: job.fieldManagerName || "Unassigned", to: managerName }],
    });
    if (managerId) {
      notify({
        kind: "field_new_job", recipientId: managerId,
        title: "New Field Job assigned to you",
        body: `${job.jobNo} · ${job.customer || "Customer"} — review and assign a Ninja.`,
        href: `/field?job=${job.id}`, reference: job.jobNo,
      });
    }
  }, [updateJob]);

  /* ── Assign pickup Ninja ── */
  const assignNinja = useCallback(async (id: string, ninjaId: string, ninjaName: string, date?: string, time?: string) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    const isReassign = !!job.ninjaId && job.ninjaId !== ninjaId;
    const updates: Partial<FieldJob> = {
      ninjaId, ninjaName,
      status: date ? "pickup_scheduled" : "assigned",
      ...(date ? { pickupDate: date } : {}),
      ...(time ? { pickupTime: time } : {}),
    };
    await updateJob(id, updates);
    logActivity({
      module: "Field", action: isReassign ? "Ninja Reassigned" : "Ninja Assigned", severity: "info",
      entity: "Field Job", reference: job.jobNo,
      description: `${job.jobNo} pickup ${isReassign ? "reassigned" : "assigned"} to ${ninjaName}.`,
      changes: [{ field: "Pickup Ninja", from: job.ninjaName || "Unassigned", to: ninjaName }],
    });
    if (ninjaId) {
      notify({
        kind: "field_assignment", recipientId: ninjaId,
        title: "New pickup assigned to you",
        body: `${job.jobNo} · ${job.customer || "Customer"} — ${job.device || "device"} · ${job.pickupAddress || "address on file"}${date ? ` · ${date}${time ? " " + time : ""}` : ""}`,
        href: `/field?job=${job.id}`, reference: job.jobNo,
      });
    }
  }, [updateJob]);

  /* ── Assign drop Ninja ── */
  const assignDropNinja = useCallback(async (id: string, ninjaId: string, ninjaName: string, date?: string, time?: string) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    const updates: Partial<FieldJob> = {
      dropNinjaId: ninjaId, dropNinjaName: ninjaName, status: "drop_scheduled",
      ...(date ? { dropDate: date } : {}),
      ...(time ? { dropTime: time } : {}),
    };
    await updateJob(id, updates);
    logActivity({
      module: "Field", action: "Drop Ninja Assigned", severity: "info", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} drop assigned to ${ninjaName}.`,
      changes: [{ field: "Drop Ninja", from: job.dropNinjaName || "Unassigned", to: ninjaName }],
    });
    if (ninjaId) {
      notify({
        kind: "drop_assignment", recipientId: ninjaId,
        title: "New drop assigned to you",
        body: `${job.jobNo} · ${job.customer || "Customer"} — deliver ${job.device || "device"} to ${job.dropAddress || "customer"}${date ? ` · ${date}${time ? " " + time : ""}` : ""}`,
        href: `/field?job=${job.id}`, reference: job.jobNo,
      });
    }
  }, [updateJob]);

  /* ── Generic transition ── */
  const transition = useCallback(async (id: string, status: FieldJobStatus, extra?: Partial<FieldJob>) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { status, ...(extra || {}) });
    logActivity({
      module: "Field", action: `Status → ${FIELD_STATUS_LABEL[status]}`, severity: "info", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} moved to ${FIELD_STATUS_LABEL[status]}.`,
      changes: [{ field: "Status", from: FIELD_STATUS_LABEL[job.status], to: FIELD_STATUS_LABEL[status] }],
    });
  }, [updateJob]);

  /* ── Confirm pickup ── */
  const confirmPickup = useCallback(async (id: string, proof: FieldProof) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { status: "picked_up", pickupProof: proof });
    logActivity({
      module: "Field", action: "Pickup Completed", severity: "success", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} device picked up from ${job.customer || "customer"}.`,
    });
    // Notify Sales + Store (branch handled by role/store views).
    if (job.salesPersonId) notify({ kind: "pickup_done", recipientId: job.salesPersonId, title: "Pickup completed", body: `${job.jobNo} · ${job.customer || "Customer"} device collected.`, href: `/field?job=${job.id}`, reference: job.jobNo });
    notify({ kind: "device_received", recipientRole: "reception", title: "Incoming field handover", body: `${job.jobNo} · ${job.device || "device"} en route to store.`, href: `/field?job=${job.id}`, reference: job.jobNo });
  }, [updateJob]);

  /* ── Receive at store ── */
  const receiveAtStore = useCallback(async (id: string) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { status: "at_store" });
    logActivity({
      module: "Field", action: "Device Received at Store", severity: "success", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} device received at ${job.branch || "store"}.`,
    });
    if (job.salesPersonId) notify({ kind: "device_received", recipientId: job.salesPersonId, title: "Device received at store", body: `${job.jobNo} · create the repair Ticket to proceed.`, href: `/field?job=${job.id}`, reference: job.jobNo });
  }, [updateJob]);

  /* ── Ready for drop ── */
  const markReadyForDrop = useCallback(async (id: string) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { status: "ready_for_drop" });
    logActivity({
      module: "Field", action: "Ready for Drop", severity: "info", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} repair complete — ready to return to customer.`,
    });
    notify({ kind: "ready_for_drop", recipientRole: "field_manager", title: "Ready for drop", body: `${job.jobNo} · assign a Ninja to deliver ${job.device || "device"}.`, href: `/field?job=${job.id}`, reference: job.jobNo });
    if (job.fieldManagerId) notify({ kind: "ready_for_drop", recipientId: job.fieldManagerId, title: "Ready for drop", body: `${job.jobNo} · assign a Ninja to deliver.`, href: `/field?job=${job.id}`, reference: job.jobNo });
    if (job.salesPersonId) notify({ kind: "ready_for_drop", recipientId: job.salesPersonId, title: "Repair complete", body: `${job.jobNo} · device ready for delivery.`, href: `/field?job=${job.id}`, reference: job.jobNo });
  }, [updateJob]);

  /* ── Confirm delivery ── */
  const confirmDelivery = useCallback(async (id: string, proof: FieldProof) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { status: "completed", dropProof: proof, deliveryConfirmed: true });
    logActivity({
      module: "Field", action: "Delivered & Completed", severity: "success", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} delivered to ${job.customer || "customer"} — job completed.`,
    });
    if (job.salesPersonId) notify({ kind: "drop_done", recipientId: job.salesPersonId, title: "Job completed", body: `${job.jobNo} · ${job.customer || "Customer"} device delivered.`, href: `/field?job=${job.id}`, reference: job.jobNo });
  }, [updateJob]);

  /* ── Cancel ── */
  const cancelJob = useCallback(async (id: string, reason?: string) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { status: "cancelled", notes: reason ? `${job.notes ? job.notes + "\n" : ""}Cancelled: ${reason}` : job.notes });
    logActivity({
      module: "Field", action: "Field Job Cancelled", severity: "warning", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} cancelled${reason ? ` — ${reason}` : ""}.`, reason,
    });
    if (job.ninjaId) notify({ kind: "field_cancel", recipientId: job.ninjaId, title: "Job cancelled", body: `${job.jobNo} has been cancelled.`, href: `/field?job=${job.id}`, reference: job.jobNo });
  }, [updateJob]);

  /* ── Link ticket ── */
  const linkTicket = useCallback(async (id: string, ticketId: string, opts?: { setInRepair?: boolean }) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return;
    await updateJob(id, { linkedTicketId: ticketId, ...(opts?.setInRepair ? { status: "in_repair" } : {}) });
    logActivity({
      module: "Field", action: "Ticket Linked", severity: "info", entity: "Field Job",
      reference: job.jobNo, description: `${job.jobNo} linked to Ticket ${ticketId}.`,
    });
  }, [updateJob]);

  const value: FieldContextValue = {
    jobs, filteredJobs, hydrated, mode: useDb ? "db" : "local",
    filters, setFilters, clearFilters,
    getJob, activeJobForLead,
    createJob, updateJob,
    assignFieldManager, assignNinja, assignDropNinja,
    transition, confirmPickup, receiveAtStore, markReadyForDrop, confirmDelivery, cancelJob, linkTicket,
  };

  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>;
}

export function useField(): FieldContextValue {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error("useField must be used within a FieldProvider");
  return ctx;
}
