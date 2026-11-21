"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Inventory operations context (dual-mode: Supabase / localStorage).
   Holds vendors, workflow documents and serial units. Stock side effects are NOT
   here — see use-inventory-actions.ts. Supabase mode is the source of truth
   (realtime refresh); demo / local mode persists to localStorage.
   ────────────────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { toast } from "@/components/ui/toaster";
import {
  docToRow, nextDocId as computeNextDocId, nextVendorId, rowToDoc, rowToSerial, rowToVendor, serialToRow, vendorToRow,
  type DocType, type InvDoc, type Serial, type Vendor,
} from "@/lib/inventory-ops";

type Ctx = {
  ready: boolean;
  vendors: Vendor[];
  docs: InvDoc[];
  serials: Serial[];
  docsOfType: (t: DocType) => InvDoc[];
  getDoc: (id: string) => InvDoc | undefined;
  nextDocId: (t: DocType) => string;
  newVendorId: () => string;
  saveVendor: (v: Vendor) => Promise<boolean>;
  saveDoc: (d: InvDoc) => Promise<boolean>;
  removeDoc: (id: string) => Promise<void>;
  saveSerials: (list: Serial[]) => Promise<boolean>;
  removeSerial: (id: string) => Promise<void>;
};

const InvOpsCtx = createContext<Ctx | null>(null);
const LS_KEY = "repairox-inventory-ops";

function loadLocal(): { vendors: Vendor[]; docs: InvDoc[]; serials: Serial[] } {
  if (typeof window === "undefined") return { vendors: [], docs: [], serials: [] };
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) ?? "null");
    if (p && typeof p === "object") return { vendors: p.vendors ?? [], docs: p.docs ?? [], serials: p.serials ?? [] };
  } catch { /* ignore */ }
  return { vendors: [], docs: [], serials: [] };
}

export function InventoryOpsProvider({ children }: { children: ReactNode }) {
  const { currentUser, isDemoMode } = usePermissions();
  const useDb = isSupabaseConfigured && !!supabase && !isDemoMode && !!currentUser;
  const [ready, setReady] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [docs, setDocs] = useState<InvDoc[]>([]);
  const [serials, setSerials] = useState<Serial[]>([]);
  const docsRef = useRef(docs); docsRef.current = docs;
  const vendorsRef = useRef(vendors); vendorsRef.current = vendors;

  /* ── load ── */
  const refetch = useCallback(async () => {
    if (!useDb || !supabase) return;
    // Each read is independent: a role without purchasing keys simply gets [] for vendors/PO docs.
    const [v, d, s] = await Promise.all([
      supabase.from("inventory_vendors").select("*").order("name"),
      supabase.from("inventory_docs").select("*").order("created_at", { ascending: false }),
      supabase.from("inventory_serials").select("*").order("created_at", { ascending: false }),
    ]);
    if (!v.error) setVendors((v.data ?? []).map(rowToVendor));
    if (!d.error) setDocs((d.data ?? []).map(rowToDoc));
    if (!s.error) setSerials((s.data ?? []).map(rowToSerial));
  }, [useDb]);

  useEffect(() => {
    if (!currentUser) return;
    if (!useDb) {
      const l = loadLocal();
      setVendors(l.vendors); setDocs(l.docs); setSerials(l.serials); setReady(true);
      return;
    }
    let cancelled = false;
    refetch().finally(() => !cancelled && setReady(true));
    const ch = supabase!.channel("inventory-ops")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "inventory_docs" } as never, () => refetch())
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "inventory_vendors" } as never, () => refetch())
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "inventory_serials" } as never, () => refetch())
      .subscribe();
    return () => { cancelled = true; supabase!.removeChannel(ch); };
  }, [currentUser, useDb, refetch]);

  // local persistence
  useEffect(() => {
    if (!ready || useDb) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ vendors, docs, serials })); } catch { /* ignore */ }
  }, [ready, useDb, vendors, docs, serials]);

  const fail = (what: string, msg: string) => { toast.error(`${what} failed: ${msg}`); return false; };

  const saveVendor = useCallback(async (v: Vendor) => {
    if (useDb && supabase) {
      const { error } = await supabase.from("inventory_vendors").upsert(vendorToRow(v));
      if (error) return fail("Saving vendor", error.message);
    }
    setVendors((p) => (p.some((x) => x.id === v.id) ? p.map((x) => (x.id === v.id ? v : x)) : [...p, v].sort((a, b) => a.name.localeCompare(b.name))));
    return true;
  }, [useDb]);

  const saveDoc = useCallback(async (d: InvDoc) => {
    const now = new Date().toISOString();
    const doc = { ...d, updatedAt: now, createdAt: d.createdAt || now };
    if (useDb && supabase) {
      const { error } = await supabase.from("inventory_docs").upsert(docToRow(doc));
      if (error) return fail("Saving document", error.message);
    }
    setDocs((p) => (p.some((x) => x.id === doc.id) ? p.map((x) => (x.id === doc.id ? doc : x)) : [doc, ...p]));
    return true;
  }, [useDb]);

  const removeDoc = useCallback(async (id: string) => {
    if (useDb && supabase) {
      const { error } = await supabase.from("inventory_docs").delete().eq("id", id);
      if (error) { fail("Deleting document", error.message); return; }
    }
    setDocs((p) => p.filter((x) => x.id !== id));
  }, [useDb]);

  const saveSerials = useCallback(async (list: Serial[]) => {
    if (list.length === 0) return true;
    if (useDb && supabase) {
      const { error } = await supabase.from("inventory_serials").upsert(list.map(serialToRow));
      if (error) return fail("Saving serials", error.code === "23505" ? "a serial number already exists" : error.message);
    }
    setSerials((p) => {
      const map = new Map(p.map((s) => [s.id, s]));
      list.forEach((s) => map.set(s.id, s));
      return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    return true;
  }, [useDb]);

  const removeSerial = useCallback(async (id: string) => {
    if (useDb && supabase) {
      const { error } = await supabase.from("inventory_serials").delete().eq("id", id);
      if (error) { fail("Deleting serial", error.message); return; }
    }
    setSerials((p) => p.filter((x) => x.id !== id));
  }, [useDb]);

  const value = useMemo<Ctx>(() => ({
    ready, vendors, docs, serials,
    docsOfType: (t) => docs.filter((d) => d.type === t),
    getDoc: (id) => docs.find((d) => d.id === id),
    nextDocId: (t) => computeNextDocId(t, docsRef.current),
    newVendorId: () => nextVendorId(vendorsRef.current),
    saveVendor, saveDoc, removeDoc, saveSerials, removeSerial,
  }), [ready, vendors, docs, serials, saveVendor, saveDoc, removeDoc, saveSerials, removeSerial]);

  return <InvOpsCtx.Provider value={value}>{children}</InvOpsCtx.Provider>;
}

export function useInventoryOps(): Ctx {
  const c = useContext(InvOpsCtx);
  if (!c) throw new Error("useInventoryOps must be used inside InventoryOpsProvider");
  return c;
}
