"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Active Store (multi-store) context.

   This is the single source of truth for "which store am I operating in right
   now". It powers the header store selector, the Owner/Master dashboard, and
   makes the central data store (store.tsx) filter reads + stamp writes to the
   currently-selected store.

   Model
   ─────
   ORGANIZATION → STORES (branches) → USERS (staff + user_stores) → ROLES → DATA

     • A store IS a `branches` row (the DB already scopes every business record
       to organization_id + branch_id and enforces isolation via RLS).
     • The user's ACCESSIBLE stores are resolved as:
         - cross-branch role (manage_branches) or admin → every store in the org
         - everyone else → their own staff branch + any active `user_stores`
           grants (the grants table is optional; absence degrades gracefully).
     • `activeStoreId`:
         - a concrete branch id → the app operates INSIDE that store; reads are
           filtered to it and new records are stamped with it.
         - `null` → "All Shops": a consolidated, reporting-only context. Only
           users who can access more than one store may select it.

   Persistence + refresh
   ─────────────────────
   The selection survives navigation and browser refresh (localStorage, keyed
   per signed-in user) and can be overridden via the `?store=<id>` query param
   for shareable deep links (see useStoreUrlSync).

   Graceful modes
   ──────────────
     • Supabase configured → real branches from the DB.
     • Local/demo mode      → a single synthetic "Main Store" so the existing
                              prototype keeps working unchanged.
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { setCurrentStore } from "@/lib/activity-log";

/** A store the current user can operate in. Mirrors a `branches` row. */
export interface StoreBranch {
  id: string;
  organizationId: string | null;
  name: string;
  code: string | null;
  address: string | null;
  isActive: boolean;
}

/** Sentinel used in the selector for the consolidated "All Shops" context. */
export const ALL_SHOPS = "__all__" as const;

const STORAGE_PREFIX = "repairox-active-store::";

/** Per-store document ID prefixes (the alphabetic part in front of numbering).
 *  e.g. { ticket: "KOR", invoice: "KOR", walkin: "KOR" } → KOR-T-0001. */
export interface StorePrefixes {
  ticket: string | null;
  invoice: string | null;
  walkin: string | null;
  field: string | null;
}

interface StoreContextValue {
  /** Stores the signed-in user is authorized to access (active ones first). */
  stores: StoreBranch[];
  /** The currently active store id, or null when in "All Shops" mode. */
  activeStoreId: string | null;
  /** The active store row (null in All Shops mode). */
  activeStore: StoreBranch | null;
  /** True while the user is viewing the consolidated All-Shops context. */
  isAllShops: boolean;
  /** True when the user may see more than one store (owner / multi-store mgr). */
  canSwitchStores: boolean;
  /** True when the user is allowed to enter the consolidated All-Shops view. */
  canViewAllShops: boolean;
  /** True once stores + selection have been resolved. */
  ready: boolean;
  /** Switch the active context. Pass `null` (or ALL_SHOPS) for consolidated. */
  setActiveStore: (idOrAll: string | null | typeof ALL_SHOPS) => void;
  /** Look up a store row by id. */
  getStore: (id: string | null | undefined) => StoreBranch | null;
  /** Re-read the store list from the DB (e.g. after creating a store). */
  refreshStores: () => Promise<void>;

  /** Document ID prefixes for the ACTIVE store (null values in All-Shops mode
   *  or when no prefix is configured — numbering then uses the plain format). */
  activePrefixes: StorePrefixes;
  /** Prefixes for a specific store id (for rendering owner/all-shops lists). */
  prefixesFor: (branchId: string | null | undefined) => StorePrefixes;
  /** Persist the ACTIVE store's prefixes (store users editing their own IDs).
   *  Writes to branch_settings; tolerates the table being absent. */
  saveActivePrefixes: (next: Partial<StorePrefixes>) => Promise<{ ok: boolean; error?: string }>;
}

const EMPTY_PREFIXES: StorePrefixes = { ticket: null, invoice: null, walkin: null, field: null };

const StoreCtx = createContext<StoreContextValue | null>(null);

function rowToStore(r: any): StoreBranch {
  return {
    id: r.id,
    organizationId: r.organization_id ?? null,
    name: r.name ?? "",
    code: r.code ?? null,
    address: r.address ?? null,
    isActive: r.is_active ?? true,
  };
}

/** Synthetic store used in local/demo mode so the UI has a valid context. */
const LOCAL_STORE: StoreBranch = {
  id: "local-main",
  organizationId: null,
  name: "Main Store",
  code: "MAIN",
  address: null,
  isActive: true,
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { currentUser, authReady, can } = usePermissions();
  const pathname = usePathname();

  const [stores, setStores] = useState<StoreBranch[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const initialisedFor = useRef<string | null>(null);

  // Per-store document ID prefixes, keyed by branch id. Loaded from
  // branch_settings (optional table — absence just means no prefixes).
  const [prefixMap, setPrefixMap] = useState<Record<string, StorePrefixes>>({});

  // A user who can manage branches (owner / master shop owner / admin) can see
  // every store and the consolidated All-Shops view. Everyone else is limited
  // to the store(s) they are assigned to.
  const canCrossBranch = can("manage_branches") || can("full_access");

  const storageKey = currentUser?.id
    ? `${STORAGE_PREFIX}${currentUser.id}`
    : `${STORAGE_PREFIX}anon`;

  /* ── Resolve the user's accessible stores ── */
  const loadStores = useCallback(async (): Promise<StoreBranch[]> => {
    // Local / demo mode → single synthetic store.
    if (!isSupabaseConfigured || !supabase) return [LOCAL_STORE];

    // Every branch in the org (RLS lets any member read branches).
    const { data: branchRows, error } = await supabase
      .from("branches")
      .select("id, organization_id, name, code, address, is_active")
      .order("created_at", { ascending: true });
    if (error || !branchRows) return [];

    const all = branchRows.map(rowToStore);

    // Owner / cross-branch → all stores.
    if (canCrossBranch) {
      return sortStores(all);
    }

    // Otherwise: the user's own branch + any explicit user_stores grants.
    const allowedIds = new Set<string>();

    // 1) The staff row's assigned branch (resolve by name → id).
    const myBranchName = currentUser?.branch ?? null;
    if (myBranchName) {
      const mine = all.find((s) => s.name === myBranchName);
      if (mine) allowedIds.add(mine.id);
    }

    // 2) Explicit multi-store grants (optional table; tolerate absence).
    if (currentUser?.id) {
      try {
        const { data: grants, error: gErr } = await supabase
          .from("user_stores")
          .select("branch_id, status")
          .eq("staff_id", currentUser.id)
          .eq("status", "active");
        if (!gErr && grants) for (const g of grants) allowedIds.add(g.branch_id);
      } catch {
        /* user_stores not migrated yet — fall back to the single branch. */
      }
    }

    const scoped = all.filter((s) => allowedIds.has(s.id));
    // Safety: never leave a user with zero stores if their branch is unknown —
    // fall back to the first store so the app stays usable (RLS still guards
    // the data itself server-side).
    return sortStores(scoped.length > 0 ? scoped : all.slice(0, 1));
  }, [canCrossBranch, currentUser?.branch, currentUser?.id]);

  const loadPrefixes = useCallback(async (): Promise<Record<string, StorePrefixes>> => {
    if (!isSupabaseConfigured || !supabase) return {};
    // branch_settings is optional; tolerate its absence entirely.
    const { data, error } = await supabase
      .from("branch_settings")
      .select("branch_id, ticket_prefix, invoice_prefix, walkin_prefix, field_prefix");
    if (error || !data) return {};
    const map: Record<string, StorePrefixes> = {};
    for (const r of data) {
      map[r.branch_id] = {
        ticket: r.ticket_prefix ?? null,
        invoice: r.invoice_prefix ?? null,
        walkin: r.walkin_prefix ?? null,
        field: r.field_prefix ?? null,
      };
    }
    return map;
  }, []);

  const refreshStores = useCallback(async () => {
    const [next, prefixes] = await Promise.all([loadStores(), loadPrefixes()]);
    setStores(next);
    setPrefixMap(prefixes);
  }, [loadStores, loadPrefixes]);

  /* ── Initialise once we know who the user is ── */
  useEffect(() => {
    if (!authReady) return;
    // Re-run when the signed-in identity changes (login / logout / switch user).
    const identity = currentUser?.id ?? "anon";
    if (initialisedFor.current === identity) return;
    initialisedFor.current = identity;

    let active = true;
    (async () => {
      const [next, prefixes] = await Promise.all([loadStores(), loadPrefixes()]);
      if (!active) return;
      setStores(next);
      setPrefixMap(prefixes);

      // Resolve the initial active selection. PRIORITY:
      //   1. `?store=` in the URL (per-tab, shareable) — the source of truth.
      //   2. the last selection saved for this user (localStorage).
      //   3. sensible defaults (single store → that store; owner → All Shops).
      const fromUrl = resolveParamToStoreId(readStoreParam(), next);
      const saved = readSaved(storageKey);
      let initial: string | null;
      if (fromUrl !== undefined) {
        // A valid URL param wins — but still guard All-Shops to cross-branch users.
        initial = fromUrl === null ? (canCrossBranch ? null : (next[0]?.id ?? null)) : fromUrl;
      } else if (saved === ALL_SHOPS) {
        initial = canCrossBranch ? null : (next[0]?.id ?? null);
      } else if (saved && next.some((s) => s.id === saved)) {
        initial = saved;
      } else if (next.length === 1) {
        // Single-store users always land directly inside their store.
        initial = next[0].id;
      } else if (canCrossBranch) {
        // Owners default to All Shops for the consolidated overview.
        initial = null;
      } else {
        initial = next[0]?.id ?? null;
      }
      setActiveStoreId(initial);
      // Reflect the resolved selection in the URL so the address bar always
      // shows the current store (and the link is shareable/bookmarkable).
      writeStoreParam(paramForStoreId(initial, next));
      setReady(true);
    })();
    return () => { active = false; };
  }, [authReady, currentUser?.id, loadStores, loadPrefixes, storageKey, canCrossBranch]);

  /* ── Persist the selection so it survives refresh + navigation ──
     localStorage is a per-user fallback for tabs opened WITHOUT a ?store=
     param; the URL param (per-tab) takes precedence on load. */
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, activeStoreId ?? ALL_SHOPS);
    } catch { /* ignore */ }
  }, [activeStoreId, ready, storageKey]);

  /* ── Keep the activity log scoped to the active store ──
     A concrete store → the feed shows only that store's activity (individual).
     All Shops (null) → consolidated org-wide feed. The store NAME is passed so
     client-logged entries carry it for the All-Shops differentiation view. */
  useEffect(() => {
    if (!ready) return;
    const current = stores.find((s) => s.id === activeStoreId) ?? null;
    // TEMP DEBUG — remove after diagnosis. Tells us the real active store.
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log("[RepairOX debug] activeStoreId =", activeStoreId, "| store =", current?.name ?? "(All Shops / none)", "| totalStores =", stores.length);
    }
    setCurrentStore(activeStoreId, current?.name ?? null);
  }, [ready, activeStoreId, stores]);

  /* ── Sync when the user navigates browser history (back/forward) and the
     ?store= value changes, so the context follows the address bar. ── */
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const onPop = () => {
      const resolved = resolveParamToStoreId(readStoreParam(), stores);
      if (resolved === undefined) return; // no/unknown param → leave as-is
      const nextId = resolved === null ? (canCrossBranch ? null : (stores[0]?.id ?? null)) : resolved;
      setActiveStoreId((cur) => (cur === nextId ? cur : nextId));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ready, stores, canCrossBranch]);

  /* ── Keep the ?store= param present across in-app navigation. Next.js
     router.push("/tickets") drops query params, so after every route change we
     re-apply the current store slug to the URL. This makes the store visible
     in the address bar on every page and preserved on refresh. ── */
  useEffect(() => {
    if (!ready) return;
    writeStoreParam(paramForStoreId(activeStoreId, stores));
  }, [pathname, ready, activeStoreId, stores]);

  const setActiveStore = useCallback(
    (idOrAll: string | null | typeof ALL_SHOPS) => {
      let nextId: string | null;
      if (idOrAll === ALL_SHOPS || idOrAll === null) {
        // Guard: only allow All Shops for users who can cross branches.
        nextId = canCrossBranch ? null : (stores[0]?.id ?? null);
      } else if (stores.some((s) => s.id === idOrAll)) {
        nextId = idOrAll;
      } else {
        return; // never let a user select a store they cannot access
      }
      setActiveStoreId(nextId);
      // Keep the URL (this tab) in sync so the address bar reflects the store
      // and the link stays shareable.
      writeStoreParam(paramForStoreId(nextId, stores));
    },
    [canCrossBranch, stores]
  );

  const activeStore = useMemo(
    () => stores.find((s) => s.id === activeStoreId) ?? null,
    [stores, activeStoreId]
  );

  const getStore = useCallback(
    (id: string | null | undefined) => (id ? stores.find((s) => s.id === id) ?? null : null),
    [stores]
  );

  const prefixesFor = useCallback(
    (branchId: string | null | undefined): StorePrefixes =>
      (branchId && prefixMap[branchId]) || EMPTY_PREFIXES,
    [prefixMap]
  );

  const activePrefixes = useMemo(
    () => prefixesFor(activeStoreId),
    [prefixesFor, activeStoreId]
  );

  const saveActivePrefixes = useCallback(
    async (next: Partial<StorePrefixes>): Promise<{ ok: boolean; error?: string }> => {
      if (!activeStoreId) return { ok: false, error: "Select a specific store first." };
      if (!isSupabaseConfigured || !supabase) {
        // Local mode: just update in-memory so the UI reflects the change.
        setPrefixMap((m) => ({ ...m, [activeStoreId]: { ...prefixesFor(activeStoreId), ...next } }));
        return { ok: true };
      }
      const store = stores.find((s) => s.id === activeStoreId);
      // organization_id is NOT NULL on branch_settings with no DB default, so
      // it MUST be present or the upsert fails. Resolve it defensively:
      //   1. from the in-memory store row, else
      //   2. fetch it straight from the branches table for this store.
      let organizationId: string | null = store?.organizationId ?? null;
      if (!organizationId) {
        const { data: br } = await supabase
          .from("branches")
          .select("organization_id")
          .eq("id", activeStoreId)
          .maybeSingle();
        organizationId = (br?.organization_id as string) ?? null;
      }
      if (!organizationId) {
        return { ok: false, error: "Could not resolve the store's organization. Please reload and try again." };
      }

      const payload: Record<string, unknown> = {
        branch_id: activeStoreId,
        organization_id: organizationId,
      };
      if (next.ticket !== undefined) payload.ticket_prefix = next.ticket || null;
      if (next.invoice !== undefined) payload.invoice_prefix = next.invoice || null;
      if (next.walkin !== undefined) payload.walkin_prefix = next.walkin || null;
      if (next.field !== undefined) payload.field_prefix = next.field || null;
      // Upsert so the row is created on first save (PK = branch_id).
      const { error } = await supabase
        .from("branch_settings")
        .upsert(payload, { onConflict: "branch_id" });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[branch_settings] save failed:", error.code, error.message);
        return { ok: false, error: error.message };
      }
      setPrefixMap((m) => ({ ...m, [activeStoreId]: { ...prefixesFor(activeStoreId), ...next } }));
      return { ok: true };
    },
    [activeStoreId, stores, prefixesFor]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      stores,
      activeStoreId,
      activeStore,
      isAllShops: activeStoreId === null,
      canSwitchStores: stores.length > 1,
      canViewAllShops: canCrossBranch && stores.length > 1,
      ready,
      setActiveStore,
      getStore,
      refreshStores,
      activePrefixes,
      prefixesFor,
      saveActivePrefixes,
    }),
    [stores, activeStoreId, activeStore, canCrossBranch, ready, setActiveStore, getStore, refreshStores, activePrefixes, prefixesFor, saveActivePrefixes]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/** Access the active-store context. Returns a safe default when used outside a
 *  provider (e.g. during SSR) so callers never need null checks. */
export function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreCtx);
  if (ctx) return ctx;
  return {
    stores: [],
    activeStoreId: null,
    activeStore: null,
    isAllShops: true,
    canSwitchStores: false,
    canViewAllShops: false,
    ready: false,
    setActiveStore: () => {},
    getStore: () => null,
    refreshStores: async () => {},
    activePrefixes: EMPTY_PREFIXES,
    prefixesFor: () => EMPTY_PREFIXES,
    saveActivePrefixes: async () => ({ ok: false, error: "No store context." }),
  };
}

/* ── helpers ── */

function sortStores(list: StoreBranch[]): StoreBranch[] {
  return [...list].sort((a, b) => {
    // Active stores first, then alphabetical by name.
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function readSaved(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

/* ── URL store param (per-tab source of truth) ──────────────────────────────
   The active store is reflected in the URL as `?store=<code>` (or `?store=all`
   for the consolidated view). Because the query string is per-tab, two tabs can
   view two different stores at once. We read/write it directly on
   window.location so it works uniformly across every route without needing a
   Suspense boundary. */
export const STORE_QUERY_PARAM = "store";
const ALL_SHOPS_SLUG = "all";

/** Read the raw `?store=` value from the current URL (or null). */
function readStoreParam(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = new URLSearchParams(window.location.search).get(STORE_QUERY_PARAM);
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
}

/** A URL-safe slug for a store (its code, else a slugified name). */
function storeSlug(s: StoreBranch): string {
  return (s.code || s.name || s.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Resolve a URL `?store=` value to an active store id (or null for All Shops).
 *  Returns `undefined` when the value doesn't match any accessible store. */
function resolveParamToStoreId(param: string | null, list: StoreBranch[]): string | null | undefined {
  if (!param) return undefined;
  if (param.toLowerCase() === ALL_SHOPS_SLUG) return null;
  const lower = param.toLowerCase();
  const match = list.find(
    (s) => storeSlug(s) === lower || (s.code ?? "").toLowerCase() === lower || s.id === param
  );
  return match ? match.id : undefined;
}

/** Map an active store id (or null=All Shops) to its URL slug. */
function paramForStoreId(id: string | null, list: StoreBranch[]): string {
  if (id === null) return ALL_SHOPS_SLUG;
  const s = list.find((x) => x.id === id);
  return s ? storeSlug(s) : ALL_SHOPS_SLUG;
}

/** Write the active selection into the URL without a navigation/history push,
 *  so it's shareable + per-tab but doesn't spam the back button. */
function writeStoreParam(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(STORE_QUERY_PARAM) === slug) return;
    url.searchParams.set(STORE_QUERY_PARAM, slug);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch { /* ignore */ }
}
