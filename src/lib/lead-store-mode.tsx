"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Management Store Mode (Single-Store vs Multi-Store).

   A SINGLE source of truth that combines the org-level configuration
   (organization_settings.lead_store_mode + default_lead_store_id, surfaced via
   useStoreSettings) with the user's authorized store scope (useStoreContext).
   Every Lead surface — the Settings UI, the Lead Management store context chip,
   the Lead Form, Lead Table, Dashboard, Agent Performance, Contacts, Deals and
   Quotations — reads from here so the mode behaves identically everywhere.

   This is a LEAD-MANAGEMENT configuration. It never changes the GLOBAL
   multi-store architecture (the header Store Selector, Shop/Ticket/Invoice/
   Field operations) — a business can run Shop Management across All Shops while
   Lead Management is Single-Store, and vice-versa.

   The two modes:
     • SINGLE  — all NEW leads are managed from one designated store
                 (`defaultStoreId`). The agent never picks a store; the Lead
                 Management store control is a FIXED context chip (no dropdown).
     • MULTI   — authorized users may create/operate leads across their
                 permitted stores. The store control becomes a real selector.

   Historical safety: changing the mode / default store NEVER rewrites existing
   leads. This hook only governs FUTURE behaviour + available filtering.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { useStoreSettings } from "@/lib/store-settings";
import { useStoreContext, type StoreBranch } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";

export type LeadStoreMode = "single" | "multi";

export interface LeadStoreModeValue {
  /** True once the org settings + store list have resolved. */
  ready: boolean;
  /** The org's configured Lead Store Mode (defaults to 'single'). */
  mode: LeadStoreMode;
  isSingle: boolean;
  isMulti: boolean;

  /** Configured Default Lead Store id (Single mode). "" when none configured. */
  defaultStoreId: string;
  /** The resolved Default Lead Store row, or null. */
  defaultStore: StoreBranch | null;

  /** SINGLE mode only: true when no (valid, active) default store is configured
   *  — a configuration error that must BLOCK lead creation (spec §59). */
  singleStoreMisconfigured: boolean;
  /** SINGLE mode only: true when the configured default store exists but is
   *  INACTIVE (spec §60) — creation blocked, existing leads intact. */
  singleStoreInactive: boolean;

  /** The store a NEW lead should be assigned to RIGHT NOW given the mode +
   *  active context. In Single mode this is always the default store; in Multi
   *  it is the active store (or the user's home store in All-Shops). "" when
   *  unresolved (e.g. single mode misconfigured). */
  leadStoreForNewLead: string;

  /** Stores the user may pick from when creating/filtering leads in MULTI mode
   *  (their authorized stores, active first). Empty in Single mode. */
  selectableStores: StoreBranch[];

  /** Whether the current user may change the org-level Lead Store Mode /
   *  Default Lead Store (Lead Settings). */
  canManageMode: boolean;

  /** Resolve a store row by id (passthrough to the store context). */
  getStore: (id: string | null | undefined) => StoreBranch | null;
}

/**
 * The one hook every Lead surface uses to understand the Lead Store Mode.
 */
export function useLeadStoreMode(): LeadStoreModeValue {
  const { settings, hydrated } = useStoreSettings();
  const { stores, activeStoreId, getStore, ready: storeReady } = useStoreContext();
  const { currentUser, can } = usePermissions();

  return useMemo(() => {
    const ready = hydrated && storeReady;
    const mode: LeadStoreMode = settings.leadStoreMode === "multi" ? "multi" : "single";
    const isSingle = mode === "single";
    const isMulti = mode === "multi";

    const defaultStoreId = settings.defaultLeadStoreId || "";
    const defaultStore = defaultStoreId ? getStore(defaultStoreId) : null;

    // In single mode: a missing default, or a default pointing at a store that
    // no longer exists in the user's resolvable store set, is a misconfig.
    const singleStoreMisconfigured = isSingle && (!defaultStoreId || (ready && !defaultStore));
    const singleStoreInactive = isSingle && !!defaultStore && !defaultStore.isActive;

    // The owning store for a brand-new lead.
    let leadStoreForNewLead = "";
    if (isSingle) {
      // Always the configured default (never the active store) — the whole
      // point of single mode. "" when misconfigured so the form can block.
      leadStoreForNewLead = singleStoreMisconfigured ? "" : defaultStoreId;
    } else {
      // Multi mode: the active store, else the user's home store, else "".
      leadStoreForNewLead = activeStoreId || currentUser?.branchId || "";
    }

    // Multi-mode selectable stores = the user's authorized stores (store
    // context already resolves branch + user_stores grants, or every store for
    // multi-store users). Active stores first; keep inactive visible but last.
    const selectableStores = isMulti
      ? [...stores].sort((a, b) => Number(b.isActive) - Number(a.isActive))
      : [];

    const canManageMode = allow(can, CAP.lead.settings);

    return {
      ready,
      mode,
      isSingle,
      isMulti,
      defaultStoreId,
      defaultStore,
      singleStoreMisconfigured,
      singleStoreInactive,
      leadStoreForNewLead,
      selectableStores,
      canManageMode,
      getStore,
    };
  }, [
    hydrated,
    storeReady,
    settings.leadStoreMode,
    settings.defaultLeadStoreId,
    stores,
    activeStoreId,
    currentUser?.branchId,
    getStore,
    can,
  ]);
}
