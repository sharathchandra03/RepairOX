"use client";

/**
 * Shared, persisted selection state for the Device Catalog admin.
 *
 * The catalog tabs (Categories / Brands / Models / Parts) previously each kept
 * their own local category/brand/model state. Because tabs unmount when
 * switching, that state was lost and reset to the first category/brand
 * (Mobile → Samsung). Lifting it into this provider — which stays mounted for
 * the whole page and persists to localStorage — keeps the active tab and the
 * selected category/brand/model stable across tab switches and reloads.
 */

import {
  createContext, useContext, useState, useCallback, type ReactNode,
} from "react";

export type CatalogTabId = "categories" | "brands" | "models" | "parts" | "import";

interface SelectionState {
  tab: CatalogTabId;
  categoryId: string | null;
  brandId: string | null;
  modelId: string | null;
}

interface CatalogSelection extends SelectionState {
  setTab: (t: CatalogTabId) => void;
  /** Changing the category clears the dependent brand + model. */
  setCategory: (id: string | null) => void;
  /** Changing the brand clears the dependent model. */
  setBrand: (id: string | null) => void;
  setModel: (id: string | null) => void;
  /** Wipe the working selection (category/brand/model) but keep the tab. */
  clearSelection: () => void;
  /** Drill-down helpers: jump to a child tab with the right context set. */
  openBrands: (categoryId: string) => void;
  openModels: (categoryId: string, brandId: string) => void;
  openParts: (categoryId: string, brandId: string, modelId: string) => void;
}

const Ctx = createContext<CatalogSelection | null>(null);

/**
 * Selection is intentionally SESSION-ONLY (in-memory). It persists across tab
 * switches because this provider stays mounted for the whole Device Catalog
 * page, but it is NOT written to storage — so leaving the page or refreshing
 * starts clean with no category/brand/model preselected. This avoids the page
 * always reopening the last (or a forced default) selection.
 */
const VALID_TABS: CatalogTabId[] = ["categories", "brands", "models", "parts", "import"];

export function CatalogSelectionProvider({
  children,
  initialTab,
}: {
  children: ReactNode;
  /** Optional starting tab (e.g. from a `?tab=` deep link). */
  initialTab?: string | null;
}) {
  const startTab: CatalogTabId =
    initialTab && VALID_TABS.includes(initialTab as CatalogTabId)
      ? (initialTab as CatalogTabId)
      : "categories";

  const [state, setState] = useState<SelectionState>({
    tab: startTab, categoryId: null, brandId: null, modelId: null,
  });

  const setTab = useCallback((tab: CatalogTabId) => setState((s) => ({ ...s, tab })), []);
  const setCategory = useCallback((categoryId: string | null) =>
    setState((s) => ({ ...s, categoryId, brandId: null, modelId: null })), []);
  const setBrand = useCallback((brandId: string | null) =>
    setState((s) => ({ ...s, brandId, modelId: null })), []);
  const setModel = useCallback((modelId: string | null) =>
    setState((s) => ({ ...s, modelId })), []);
  const clearSelection = useCallback(() =>
    setState((s) => ({ ...s, categoryId: null, brandId: null, modelId: null })), []);

  const openBrands = useCallback((categoryId: string) =>
    setState((s) => ({ ...s, tab: "brands", categoryId, brandId: null, modelId: null })), []);
  const openModels = useCallback((categoryId: string, brandId: string) =>
    setState((s) => ({ ...s, tab: "models", categoryId, brandId, modelId: null })), []);
  const openParts = useCallback((categoryId: string, brandId: string, modelId: string) =>
    setState((s) => ({ ...s, tab: "parts", categoryId, brandId, modelId })), []);

  return (
    <Ctx.Provider value={{ ...state, setTab, setCategory, setBrand, setModel, clearSelection, openBrands, openModels, openParts }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCatalogSelection(): CatalogSelection {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCatalogSelection must be used within CatalogSelectionProvider");
  return ctx;
}
