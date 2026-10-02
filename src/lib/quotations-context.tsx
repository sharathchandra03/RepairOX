"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Quotation data context (Supabase-first, dual-mode).

   Mirrors lead-deals-context.tsx: Supabase-first with a transparent
   localStorage fallback, Realtime full-refetch, schema-drift / missing-table
   resilience, optimistic writes, logActivity + toast side effects.

   A QUOTATION is a customer-facing OFFER — it never duplicates the Lead, the
   Customer, or the Sales Agent attribution, and it never creates an
   invoice/payment/revenue or consumes stock.

   Exposes: quotations, hydrated, mode, read helpers, and the operations
     • createQuotation(draft)            — persist a Draft (idempotent per lead+source)
     • updateQuotation(id, updates)      — quotation-specific edits only
     • sendQuotation(id)                 — mark Sent (records sentAt) once a send succeeds
     • setQuotationStatus(id, status)    — accepted / rejected / expired
     • deleteQuotation(id)
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
  type Quotation, type QuotationDraft, type QuotationStatus,
  rowToQuotation, quotationToRow, computeQuotationTotals,
} from "@/lib/quotation-data";

/* ─── Local-storage keys (prototype / demo mode) ─────────────────────────── */
const QUOTES_KEY = "repairox-quotations";
const QUOTE_SEQ_KEY = "repairox-quotation-seq";

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(demoKey(key)); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function writeLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(demoKey(key), JSON.stringify(value)); } catch { /* ignore quota */ }
}

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /relation .* does not exist/i.test(err.message ?? "");
}
function isUndefinedColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(err.message ?? "");
}

/** Pull the offending column name out of a Postgres (`column "x" does not
 *  exist`) OR PostgREST (`Could not find the 'x' column … in the schema
 *  cache`) error message. Handles both " and ' quoting. */
function extractUnknownColumn(message?: string): string | null {
  if (!message) return null;
  // PostgREST schema-cache phrasing first.
  const prest = message.match(/find the ['"]?([a-z0-9_]+)['"]? column/i);
  if (prest?.[1]) return prest[1];
  // Postgres "column \"x\" does not exist" / column x of relation …
  const pg = message.match(/column ['"]?([a-z0-9_]+)['"]?/i);
  return pg?.[1] ?? null;
}

/** The highest QT-#### sequence number across the known quotations (0 when
 *  none). Lets the client derive a clean next number when the DB trigger isn't
 *  available, so IDs stay sequential (QT-0001, QT-0002, …) instead of random. */
function highestSequentialNo(quotes: { quotationNo: string }[]): number {
  let max = 0;
  for (const q of quotes) {
    const m = /^QT-(\d+)$/.exec((q.quotationNo || "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/** Additive quotation columns that only exist once migration 0064 is applied.
 *  When the DB is older, we strip these so the core quotation still persists. */
const OPTIONAL_QUOTATION_COLUMNS = [
  "device_category_id", "device_brand_id", "device_model_id",
  "device", "issue", "warranty", "note", "source", "lead_no",
  "customer_id", "customer_name", "phone", "email", "location",
  "sales_agent_id", "sales_agent_name", "discount", "discount_type",
  "amount", "sent_at", "subtotal", "items",
];

/* ─── Context shape ───────────────────────────────────────────────────────── */

interface QuotationsContextValue {
  quotations: Quotation[];
  hydrated: boolean;
  mode: "db" | "local";

  quotationById: (id: string) => Quotation | undefined;
  /** All quotations linked to a lead (most recent first). */
  quotationsForLead: (leadId: string) => Quotation[];
  /** The most recent quotation for a lead, or undefined. */
  currentQuotationForLead: (leadId: string) => Quotation | undefined;

  /** Persist a quotation draft. Returns the created record or null. */
  createQuotation: (draft: QuotationDraft) => Promise<Quotation | null>;
  /** Quotation-specific updates (price / warranty / email / note / items). */
  updateQuotation: (id: string, updates: Partial<Quotation>) => Promise<boolean>;
  /** Mark a quotation Sent (records sentAt). Call only AFTER a send succeeds. */
  sendQuotation: (id: string) => Promise<boolean>;
  /** Set a lifecycle status (accepted / rejected / expired / draft). */
  setQuotationStatus: (id: string, status: QuotationStatus) => Promise<boolean>;
  deleteQuotation: (id: string) => Promise<boolean>;
}

const QuotationsContext = createContext<QuotationsContextValue | null>(null);

/* ─── Provider ────────────────────────────────────────────────────────────── */

export function QuotationsProvider({ children }: { children: ReactNode }) {
  const { authReady } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const useDb = isSupabaseConfigured && !!supabase;
  const db = supabase!;

  const quotesRef = useRef<Quotation[]>([]);
  quotesRef.current = quotations;
  const seqRef = useRef<number>(0);
  const meIdRef = useRef<string | undefined>(currentUserId);
  meIdRef.current = currentUserId;
  const meNameRef = useRef<string>(currentUserName);
  meNameRef.current = currentUserName;

  /* ── Hydration ── */
  useEffect(() => {
    let active = true;
    async function loadFromDb() {
      const { data: rows, error } = await db
        .from("quotations")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (!error && rows) setQuotations(rows.map(rowToQuotation));
      else if (error && !isMissingTableError(error)) console.error("[quotations] load failed:", error.message);
      setHydrated(true);
    }
    if (useDb) {
      if (!authReady) return;
      loadFromDb();
    } else {
      setQuotations(readLS<Quotation[]>(QUOTES_KEY, []));
      seqRef.current = readLS<number>(QUOTE_SEQ_KEY, 0);
      setHydrated(true);
    }
    return () => { active = false; };
  }, [useDb, authReady, db]);

  /* ── Realtime (DB mode) ── */
  useEffect(() => {
    if (!useDb || !authReady) return;
    let active = true;
    const channel = db.channel("quotations-realtime");
    const reload = async () => {
      const { data: rows } = await db
        .from("quotations").select("*").is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (rows) setQuotations(rows.map(rowToQuotation));
    };
    channel.on("postgres_changes", { event: "*", schema: "public", table: "quotations" }, reload);
    channel.subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [useDb, authReady, db]);

  /* ── Local-mode sequence (QT-0001 …) ── */
  const nextQuotationNoLocal = useCallback((): string => {
    // Keep the local counter at least ahead of the highest existing QT-#### so
    // numbers never collide or regress after a reload / cross-device sync.
    const highest = highestSequentialNo(quotesRef.current);
    const n = Math.max((seqRef.current || 0), highest) + 1;
    seqRef.current = n;
    writeLS(QUOTE_SEQ_KEY, n);
    return `QT-${String(n).padStart(4, "0")}`;
  }, []);

  /* ── Read helpers ── */
  const quotationById = useCallback((id: string) => quotations.find((q) => q.id === id), [quotations]);
  const quotationsForLead = useCallback((leadId: string) =>
    quotations.filter((q) => q.leadId && q.leadId === leadId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [quotations]);
  const currentQuotationForLead = useCallback((leadId: string) =>
    quotationsForLead(leadId)[0], [quotationsForLead]);

  /* ── Create ── */
  const createQuotation = useCallback(async (draft: QuotationDraft): Promise<Quotation | null> => {
    // Recompute totals defensively so the stored amount is always consistent.
    const totals = computeQuotationTotals(draft);
    const nowIso = new Date().toISOString();
    // The quotations.id is a TEXT primary key with NO database default, so the
    // client MUST supply it (the DB trigger only stamps quotation_no). Generate
    // a stable id up front and use it in BOTH modes.
    const newId = uid();
    const base: Partial<Quotation> = {
      ...draft,
      id: newId,
      subtotal: totals.subtotal,
      amount: totals.amount,
    };

    if (useDb) {
      const row = quotationToRow(base);
      if (!row.id) row.id = newId;
      // Supply a clean SEQUENTIAL quotation_no as a fallback (QT-0001, QT-0002,
      // …). The DB stamp trigger from 0064 (next_quotation_no()) overrides this
      // when present; on an older DB without the trigger this keeps the number
      // sequential and human-readable instead of a random id. The id stays the
      // stable PK.
      if (!row.quotation_no) {
        const next = Math.max((seqRef.current || 0), highestSequentialNo(quotesRef.current)) + 1;
        seqRef.current = next;
        row.quotation_no = `QT-${String(next).padStart(4, "0")}`;
      }
      // organization_id is NOT NULL — resolve from the lead's org when lead-based,
      // else let the DB default (auth_org_id()) apply.
      if (draft.leadId) {
        const { data: leadRow } = await db.from("leads").select("organization_id").eq("id", draft.leadId).maybeSingle();
        const orgId = (leadRow as any)?.organization_id ?? null;
        if (orgId) row.organization_id = orgId;
      }
      // Insert with self-healing for columns that a not-yet-applied migration
      // (0064) doesn't have — drop the unknown column(s) and retry so the core
      // quotation still persists instead of failing outright. Postgres and
      // PostgREST phrase the missing column differently and quote it with "
      // or ' — extractUnknownColumn() handles both.
      let insertRow = { ...row };
      let { data, error } = await db.from("quotations").insert(insertRow).select("*").single();
      let heal = 0;
      while (error && isUndefinedColumnError(error) && heal < 12) {
        heal += 1;
        const col = extractUnknownColumn(error.message);
        if (col && col in insertRow) { delete (insertRow as any)[col]; }
        else {
          // Could not pinpoint the column — strip every additive/optional
          // column at once so the insert can still succeed on an older schema.
          for (const k of OPTIONAL_QUOTATION_COLUMNS) delete (insertRow as any)[k];
        }
        ({ data, error } = await db.from("quotations").insert(insertRow).select("*").single());
      }
      if (!error && data) {
        const created = rowToQuotation(data);
        setQuotations((prev) => [created, ...prev]);
        afterCreated(created);
        return created;
      }
      if (error && !isMissingTableError(error)) {
        console.error("[quotations] create failed:", error.message);
        toast.error("Quotation not created", { description: error.message });
        return null;
      }
      console.warn("[quotations] quotations table not found — keeping the quotation locally.");
    }

    const q: Quotation = {
      id: newId,
      quotationNo: nextQuotationNoLocal(),
      branchId: base.branchId || "",
      source: base.source || "standalone",
      leadId: base.leadId || "",
      leadNo: base.leadNo || "",
      customerId: base.customerId || "",
      customerName: base.customerName || "",
      phone: base.phone || "",
      email: base.email || "",
      location: base.location || "",
      salesAgentId: base.salesAgentId || "",
      salesAgentName: base.salesAgentName || "",
      device: base.device || "",
      deviceCategoryId: base.deviceCategoryId || "",
      deviceBrandId: base.deviceBrandId || "",
      deviceModelId: base.deviceModelId || "",
      issue: base.issue || "",
      items: base.items || [],
      warranty: base.warranty || { months: null, label: "" },
      subtotal: totals.subtotal,
      discount: base.discount || 0,
      discountType: base.discountType || "amount",
      amount: totals.amount,
      note: base.note || "",
      status: base.status || "draft",
      validUntil: base.validUntil || "",
      sentAt: base.sentAt || "",
      createdBy: meIdRef.current || "",
      createdByName: meNameRef.current || "",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setQuotations((prev) => { const next = [q, ...prev]; writeLS(QUOTES_KEY, next); return next; });
    afterCreated(q);
    return q;
  }, [useDb, db, nextQuotationNoLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  function afterCreated(q: Quotation) {
    logActivity({
      module: "Lead", action: "Quotation Created", severity: "info", entity: "Quotation",
      reference: q.quotationNo,
      description: `${q.salesAgentName || "Agent"} created ${q.quotationNo} for ${q.customerName || "customer"}${q.leadNo ? ` (lead ${q.leadNo})` : ""}.`,
    });
  }

  /* ── Shared patch (optimistic + heal) ── */
  const patchQuotation = useCallback(async (id: string, updates: Partial<Quotation>): Promise<boolean> => {
    const current = quotesRef.current.find((q) => q.id === id);
    setQuotations((prev) => {
      const next = prev.map((q) => (q.id === id ? { ...q, ...updates, updatedAt: new Date().toISOString() } : q));
      if (!useDb) writeLS(QUOTES_KEY, next);
      return next;
    });
    if (useDb) {
      let row = quotationToRow(updates);
      let { error } = await db.from("quotations").update(row).eq("id", id);
      let heal = 0;
      while (error && isUndefinedColumnError(error) && heal < 12) {
        heal += 1;
        const col = extractUnknownColumn(error.message);
        if (col && col in row) { delete (row as any)[col]; }
        else { for (const k of OPTIONAL_QUOTATION_COLUMNS) delete (row as any)[k]; }
        ({ error } = await db.from("quotations").update(row).eq("id", id));
      }
      if (error) {
        console.error("[quotations] patch failed:", error.message);
        const { data: fresh } = await db.from("quotations").select("*").eq("id", id).maybeSingle();
        if (fresh) setQuotations((prev) => prev.map((q) => (q.id === id ? rowToQuotation(fresh) : q)));
        else if (current) setQuotations((prev) => prev.map((q) => (q.id === id ? current : q)));
        return false;
      }
    }
    return true;
  }, [useDb, db]);

  const updateQuotation = useCallback(async (id: string, updates: Partial<Quotation>): Promise<boolean> => {
    // Keep totals consistent when items / discount change.
    const current = quotesRef.current.find((q) => q.id === id);
    let merged: Partial<Quotation> = { ...updates };
    if (current && (updates.items || updates.discount != null || updates.discountType)) {
      const totals = computeQuotationTotals({ ...current, ...updates });
      merged = { ...updates, subtotal: totals.subtotal, amount: totals.amount };
    }
    return patchQuotation(id, merged);
  }, [patchQuotation]);

  /* ── Send (records sentAt; never claim Sent unless this succeeds) ── */
  const sendQuotation = useCallback(async (id: string): Promise<boolean> => {
    const q = quotesRef.current.find((x) => x.id === id);
    if (!q) return false;
    const ok = await patchQuotation(id, { status: "sent", sentAt: new Date().toISOString() });
    if (!ok) return false;
    logActivity({
      module: "Lead", action: "Quotation Sent", severity: "success", entity: "Quotation",
      reference: q.quotationNo,
      description: `${q.quotationNo} sent to ${q.customerName || "customer"}.`,
    });
    return true;
  }, [patchQuotation]);

  const setQuotationStatus = useCallback(async (id: string, status: QuotationStatus): Promise<boolean> => {
    return patchQuotation(id, { status });
  }, [patchQuotation]);

  const deleteQuotation = useCallback(async (id: string): Promise<boolean> => {
    const current = quotesRef.current.find((q) => q.id === id);
    setQuotations((prev) => { const next = prev.filter((q) => q.id !== id); if (!useDb) writeLS(QUOTES_KEY, next); return next; });
    if (useDb) {
      const { error } = await db.from("quotations").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error && !isMissingTableError(error)) {
        console.error("[quotations] delete failed:", error.message);
        if (current) setQuotations((prev) => [current, ...prev]);
        return false;
      }
    }
    if (current) logActivity({ module: "Lead", action: "Quotation Deleted", severity: "info", entity: "Quotation", reference: current.quotationNo, description: `${current.quotationNo} deleted.` });
    return true;
  }, [useDb, db]);

  const value = useMemo<QuotationsContextValue>(() => ({
    quotations, hydrated, mode: useDb ? "db" : "local",
    quotationById, quotationsForLead, currentQuotationForLead,
    createQuotation, updateQuotation, sendQuotation, setQuotationStatus, deleteQuotation,
  }), [quotations, hydrated, useDb, quotationById, quotationsForLead, currentQuotationForLead,
      createQuotation, updateQuotation, sendQuotation, setQuotationStatus, deleteQuotation]);

  return <QuotationsContext.Provider value={value}>{children}</QuotationsContext.Provider>;
}

export function useQuotations(): QuotationsContextValue {
  const ctx = useContext(QuotationsContext);
  if (!ctx) throw new Error("useQuotations must be used within a QuotationsProvider");
  return ctx;
}
