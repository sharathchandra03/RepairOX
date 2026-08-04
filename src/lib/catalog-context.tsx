"use client";

/**
 * Device Catalog — the master source of truth for the device pricing catalog.
 *
 * Hierarchy: Category → Brand → Model → (Image) → Parts → Prices
 *
 * This is a localStorage-backed React Context following the same pattern as
 * `lib/store.tsx`. Every module (Shop → Price List, Settings → Price List,
 * and future ticket/invoice/inventory flows) should consume this context so
 * there is a single, non-duplicated catalog.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode,
} from "react";
import {
  deviceCategories as SEED_CATEGORIES,
  priceListBrands as SEED_BRANDS,
  priceListModels as SEED_MODELS,
  deviceParts as SEED_PARTS,
  generateCategoryId,
  generatePriceListBrandId,
  generatePriceListModelId,
  generatePartId,
  nowStamp,
  type DeviceCategory,
  type PriceListBrand,
  type PriceListModel,
  type DevicePart,
} from "./price-list-data";
import type { SmartModel } from "./smart-import";
import { logActivity, buildChanges } from "./activity-log";
import { supabase, isSupabaseConfigured } from "./supabase";

/* ─── State & Actions ────────────────────────────────────────────── */

interface CatalogState {
  categories: DeviceCategory[];
  brands: PriceListBrand[];
  models: PriceListModel[];
  parts: DevicePart[];
}

/** A flat catalog row as parsed from CSV/Excel. */
export interface CatalogImportRow {
  category?: string;
  brand?: string;
  model?: string;
  year?: string;
  variant?: string;
  chip?: string;
  storage?: string;
  displaySize?: string;
  partName?: string;
  sku?: string;
  price?: string;
  warranty?: string;
  availability?: string;
  deviceImage?: string;
}

export interface ImportResult {
  categoriesAdded: number;
  brandsAdded: number;
  modelsAdded: number;
  modelsUpdated: number;
  partsAdded: number;
  partsUpdated: number;
}

/** Options for the generic (wide-sheet) smart import. */
export interface SmartImportOptions {
  /** Category name used when a row/sheet doesn't specify one. */
  defaultCategory: string;
  /** Brand name used when a row/sheet doesn't specify one. */
  defaultBrand: string;
  /** Default availability applied to imported parts. */
  defaultAvailability?: DevicePart["availability"];
  /** Default warranty applied to imported parts. */
  defaultWarranty?: string;
}

interface CatalogActions {
  // Categories
  addCategory: (data: Omit<DeviceCategory, "id" | "count">) => DeviceCategory;
  updateCategory: (id: string, updates: Partial<DeviceCategory>) => void;
  deleteCategory: (id: string) => void;
  toggleCategory: (id: string) => void;
  // Brands
  addBrand: (data: Omit<PriceListBrand, "id" | "count">) => PriceListBrand;
  updateBrand: (id: string, updates: Partial<PriceListBrand>) => void;
  deleteBrand: (id: string) => void;
  // Models
  addModel: (data: Partial<PriceListModel> & { name: string; brandId: string; categoryId: string }) => PriceListModel;
  updateModel: (id: string, updates: Partial<PriceListModel>) => void;
  deleteModel: (id: string) => void;
  bulkDeleteModels: (ids: string[]) => void;
  setModelImage: (id: string, imageUrl: string) => void;
  // Parts
  addPart: (data: Partial<DevicePart> & { partName: string; modelId: string }) => DevicePart;
  updatePart: (id: number, updates: Partial<DevicePart>) => void;
  deletePart: (id: number) => void;
  bulkDeleteParts: (ids: number[]) => void;
  // Bulk / import
  importRows: (rows: CatalogImportRow[]) => ImportResult;
  importSmartModels: (models: SmartModel[], opts: SmartImportOptions) => ImportResult;
  clearSeedData: () => void;
  resetCatalog: () => void;
}

type Catalog = CatalogState & CatalogActions & { hydrated: boolean };

/* ─── Persistence ────────────────────────────────────────────────── */

const STORAGE_KEY = "repairox-catalog";

function seedState(): CatalogState {
  return {
    categories: SEED_CATEGORIES.map((c) => ({ ...c, enabled: c.enabled ?? true, seed: true })),
    brands: SEED_BRANDS.map((b) => ({ ...b, enabled: b.enabled ?? true, seed: true })),
    models: SEED_MODELS.map((m) => ({ ...m, seed: true })),
    parts: SEED_PARTS.map((p) => ({ ...p, seed: true })),
  };
}

/** Remove all built-in sample data (everything flagged `seed`). */
function stripSeed(s: CatalogState): CatalogState {
  return {
    categories: s.categories.filter((c) => !c.seed),
    brands: s.brands.filter((b) => !b.seed),
    models: s.models.filter((m) => !m.seed),
    parts: s.parts.filter((p) => !p.seed),
  };
}

function loadFromStorage(): CatalogState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogState>;
    // Guard against malformed / partial data
    if (!parsed.categories || !parsed.brands || !parsed.models || !parsed.parts) return null;
    return parsed as CatalogState;
  } catch {
    return null;
  }
}

function saveToStorage(state: CatalogState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable (base64 images can be large) — fail silently
  }
}

const CatalogContext = createContext<Catalog | null>(null);

/* ─── Provider ───────────────────────────────────────────────────── */

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CatalogState>(seedState);
  const [hydrated, setHydrated] = useState(false);
  /** Organization ID resolved from the authenticated user's staff row. */
  const orgIdRef = useRef<string | null>(null);

  // Hydrate from DB (Supabase) or localStorage after mount.
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      // Load catalog from Supabase.
      (async () => {
        // Resolve the user's organization_id first.
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          const { data: staffRow } = await supabase
            .from("staff")
            .select("organization_id")
            .eq("auth_user_id", sessionData.session.user.id)
            .maybeSingle();
          orgIdRef.current = (staffRow?.organization_id as string) ?? null;
        }

        const orgId = orgIdRef.current;
        // Build queries — filter by org when available.
        let catsQ = supabase.from("price_list_categories").select("*").order("created_at", { ascending: true });
        let brdsQ = supabase.from("price_list_brands").select("*").order("created_at", { ascending: true });
        let modsQ = supabase.from("price_list_models").select("*").order("created_at", { ascending: true });
        let prtsQ = supabase.from("price_list_parts").select("*").order("created_at", { ascending: true });
        if (orgId) {
          catsQ = catsQ.eq("organization_id", orgId);
          brdsQ = brdsQ.eq("organization_id", orgId);
          modsQ = modsQ.eq("organization_id", orgId);
          prtsQ = prtsQ.eq("organization_id", orgId);
        }

        const [{ data: cats }, { data: brds }, { data: mods }, { data: prts }] = await Promise.all([catsQ, brdsQ, modsQ, prtsQ]);
        const dbState: CatalogState = {
          categories: (cats ?? []).map((r: any) => ({ id: r.id, name: r.name ?? "", icon: r.icon ?? "Box", count: r.item_count ?? 0, imageUrl: r.image_url ?? undefined, enabled: r.enabled ?? true })),
          brands: (brds ?? []).map((r: any) => ({ id: r.id, name: r.name ?? "", categoryId: r.category_id ?? "", count: r.item_count ?? 0, logoUrl: r.logo_url ?? undefined, enabled: r.enabled ?? true })),
          models: (mods ?? []).map((r: any) => ({ id: r.id, name: r.name ?? "", brandId: r.brand_id ?? "", categoryId: r.category_id ?? "", year: r.model_year ?? new Date().getFullYear(), chip: r.chip ?? undefined, storage: r.storage ?? undefined, displaySize: r.display_size ?? undefined, variant: r.variant ?? undefined, imageUrl: r.image_url ?? undefined, status: r.status ?? "active", meta: r.meta ?? undefined, lastUpdated: r.updated_at ?? r.created_at ?? "", updatedBy: "", createdOn: r.created_at ?? "" })),
          parts: (prts ?? []).map((r: any) => ({ id: Number(r.id) || 0, modelId: r.model_id ?? "", partName: r.part_name ?? "", partNumber: r.part_number ?? "", price: Number(r.price ?? 0), priceKnown: r.price_known ?? true, warranty: r.warranty ?? "N/A", availability: r.availability ?? "In Stock", repairCategory: r.repair_category ?? undefined, imageUrl: r.image_url ?? undefined, lastUpdated: r.updated_at ?? r.created_at ?? "" })),
        };
        // Only use DB data if there's actual content; otherwise fall through to seed.
        if (dbState.categories.length > 0 || dbState.brands.length > 0) {
          setState(dbState);
        } else if (orgId) {
          // DB is empty for this org — push seed data so subsequent operations persist.
          const seed = seedState();
          const seedCatRows = seed.categories.map((c) => ({ id: c.id, organization_id: orgId, name: c.name, icon: c.icon, item_count: c.count, enabled: c.enabled ?? true, image_url: null }));
          const seedBrandRows = seed.brands.map((b) => ({ id: b.id, organization_id: orgId, name: b.name, category_id: b.categoryId, item_count: b.count, logo_url: b.logoUrl ?? null, enabled: b.enabled ?? true }));
          const seedModelRows = seed.models.map((m) => ({ id: m.id, organization_id: orgId, brand_id: m.brandId, category_id: m.categoryId, name: m.name, model_year: m.year, chip: m.chip ?? null, storage: m.storage ?? null, display_size: m.displaySize ?? null, variant: m.variant ?? null, image_url: m.imageUrl ?? null, status: m.status ?? "active" }));
          const seedPartRows = seed.parts.map((p) => ({ id: String(p.id), organization_id: orgId, model_id: p.modelId, part_name: p.partName, part_number: p.partNumber ?? null, price: p.price, price_known: p.priceKnown ?? true, warranty: p.warranty ?? null, availability: p.availability ?? "In Stock", repair_category: p.repairCategory ?? null, image_url: p.imageUrl ?? null }));
          // Insert in sequence to satisfy foreign keys (categories → brands → models → parts).
          await supabase.from("price_list_categories").insert(seedCatRows);
          await supabase.from("price_list_brands").insert(seedBrandRows);
          await supabase.from("price_list_models").insert(seedModelRows);
          await supabase.from("price_list_parts").insert(seedPartRows);
          // Mark seed items so the UI can strip them on first real import.
          setState(seed);
        }
        setHydrated(true);
      })();

      // Realtime subscription for catalog tables.
      const channel = supabase.channel("catalog-realtime")
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "price_list_categories" }, () => {
          let q = supabase!.from("price_list_categories").select("*").order("created_at", { ascending: true });
          if (orgIdRef.current) q = q.eq("organization_id", orgIdRef.current);
          q.then(({ data }) => {
            if (data) setState((s) => ({ ...s, categories: data.map((r: any) => ({ id: r.id, name: r.name ?? "", icon: r.icon ?? "Box", count: r.item_count ?? 0, imageUrl: r.image_url ?? undefined, enabled: r.enabled ?? true })) }));
          });
        })
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "price_list_brands" }, () => {
          let q = supabase!.from("price_list_brands").select("*").order("created_at", { ascending: true });
          if (orgIdRef.current) q = q.eq("organization_id", orgIdRef.current);
          q.then(({ data }) => {
            if (data) setState((s) => ({ ...s, brands: data.map((r: any) => ({ id: r.id, name: r.name ?? "", categoryId: r.category_id ?? "", count: r.item_count ?? 0, logoUrl: r.logo_url ?? undefined, enabled: r.enabled ?? true })) }));
          });
        })
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "price_list_models" }, () => {
          let q = supabase!.from("price_list_models").select("*").order("created_at", { ascending: true });
          if (orgIdRef.current) q = q.eq("organization_id", orgIdRef.current);
          q.then(({ data }) => {
            if (data) setState((s) => ({ ...s, models: data.map((r: any) => ({ id: r.id, name: r.name ?? "", brandId: r.brand_id ?? "", categoryId: r.category_id ?? "", year: r.model_year ?? new Date().getFullYear(), chip: r.chip ?? undefined, storage: r.storage ?? undefined, displaySize: r.display_size ?? undefined, variant: r.variant ?? undefined, imageUrl: r.image_url ?? undefined, status: r.status ?? "active", meta: r.meta ?? undefined, lastUpdated: r.updated_at ?? r.created_at ?? "", updatedBy: "", createdOn: r.created_at ?? "" })) }));
          });
        })
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "price_list_parts" }, () => {
          let q = supabase!.from("price_list_parts").select("*").order("created_at", { ascending: true });
          if (orgIdRef.current) q = q.eq("organization_id", orgIdRef.current);
          q.then(({ data }) => {
            if (data) setState((s) => ({ ...s, parts: data.map((r: any) => ({ id: Number(r.id) || 0, modelId: r.model_id ?? "", partName: r.part_name ?? "", partNumber: r.part_number ?? "", price: Number(r.price ?? 0), priceKnown: r.price_known ?? true, warranty: r.warranty ?? "N/A", availability: r.availability ?? "In Stock", repairCategory: r.repair_category ?? undefined, imageUrl: r.image_url ?? undefined, lastUpdated: r.updated_at ?? r.created_at ?? "" })) }));
          });
        })
        .subscribe();
      return () => { supabase!.removeChannel(channel); };
    } else {
      const saved = loadFromStorage();
      if (saved) setState(saved);
      setHydrated(true);
    }
  }, []);

  // Mirror latest state in a ref so imperative actions (import) can read the
  // current catalog synchronously without stale-closure issues.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Persist on every change (only after hydration so we don't clobber saved data)
  // Only persist to localStorage in local mode; in DB mode, writes go to Supabase.
  useEffect(() => {
    if (hydrated && !isSupabaseConfigured) saveToStorage(state);
  }, [state, hydrated]);

  /* ── Categories ── */
  const addCategory = useCallback((data: Omit<DeviceCategory, "id" | "count">) => {
    const cat: DeviceCategory = {
      id: generateCategoryId(),
      name: data.name.trim(),
      icon: data.icon || "Box",
      count: 0,
      imageUrl: data.imageUrl,
      enabled: data.enabled ?? true,
    };
    setState((s) => ({ ...s, categories: [...s.categories, cat] }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_categories").insert({ id: cat.id, organization_id: orgIdRef.current, name: cat.name, icon: cat.icon, item_count: 0, image_url: cat.imageUrl ?? null, enabled: cat.enabled }).then();
    }
    logActivity({
      module: "Price List", action: "Category Created", severity: "success",
      entity: "Category", reference: cat.name, description: `Created device category ${cat.name}.`,
    });
    return cat;
  }, []);

  const updateCategory = useCallback((id: string, updates: Partial<DeviceCategory>) => {
    const prev = stateRef.current.categories.find((c) => c.id === id);
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
    if (isSupabaseConfigured && supabase) {
      const row: Record<string, unknown> = {};
      if ("name" in updates) row.name = updates.name;
      if ("icon" in updates) row.icon = updates.icon;
      if ("enabled" in updates) row.enabled = updates.enabled;
      if ("imageUrl" in updates) row.image_url = updates.imageUrl ?? null;
      supabase.from("price_list_categories").update(row).eq("id", id).then();
    }
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "name", label: "Name" },
      { key: "enabled", label: "Enabled" },
    ]);
    logActivity({
      module: "Price List", action: "Category Updated", severity: "info",
      entity: "Category", reference: prev?.name || id, description: `Updated category ${prev?.name || id}.`,
      changes,
    });
  }, []);

  const deleteCategory = useCallback((id: string) => {
    const prev = stateRef.current.categories.find((c) => c.id === id);
    const brandCount = stateRef.current.brands.filter((b) => b.categoryId === id).length;
    const modelCount = stateRef.current.models.filter((m) => m.categoryId === id).length;
    setState((s) => {
      const modelIds = s.models.filter((m) => m.categoryId === id).map((m) => m.id);
      return {
        categories: s.categories.filter((c) => c.id !== id),
        brands: s.brands.filter((b) => b.categoryId !== id),
        models: s.models.filter((m) => m.categoryId !== id),
        parts: s.parts.filter((p) => !modelIds.includes(p.modelId)),
      };
    });
    if (isSupabaseConfigured && supabase) {
      // Cascade handled by DB foreign keys, but explicitly delete to trigger audit.
      supabase.from("price_list_categories").delete().eq("id", id).then();
    }
    logActivity({
      module: "Price List", action: "Category Deleted", severity: "critical",
      entity: "Category", reference: prev?.name || id,
      description: prev ? `Deleted category ${prev.name} (${brandCount} brand${brandCount !== 1 ? "s" : ""}, ${modelCount} model${modelCount !== 1 ? "s" : ""}).` : `Deleted category ${id}.`,
    });
  }, []);

  const toggleCategory = useCallback((id: string) => {
    const prev = stateRef.current.categories.find((c) => c.id === id);
    const next = !(prev?.enabled ?? true);
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) => (c.id === id ? { ...c, enabled: !(c.enabled ?? true) } : c)),
    }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_categories").update({ enabled: next }).eq("id", id).then();
    }
    logActivity({
      module: "Price List", action: "Category Updated", severity: "info",
      entity: "Category", reference: prev?.name || id,
      description: `${next ? "Enabled" : "Disabled"} category ${prev?.name || id}.`,
      changes: [{ field: "Enabled", from: String(!next), to: String(next) }],
    });
  }, []);

  /* ── Brands ── */
  const addBrand = useCallback((data: Omit<PriceListBrand, "id" | "count">) => {
    const brand: PriceListBrand = {
      id: generatePriceListBrandId(),
      name: data.name.trim(),
      categoryId: data.categoryId,
      count: 0,
      logoUrl: data.logoUrl,
      enabled: data.enabled ?? true,
    };
    setState((s) => ({ ...s, brands: [...s.brands, brand] }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_brands").insert({ id: brand.id, organization_id: orgIdRef.current, name: brand.name, category_id: brand.categoryId, item_count: 0, logo_url: brand.logoUrl ?? null, enabled: brand.enabled }).then();
    }
    logActivity({
      module: "Price List", action: "Brand Added", severity: "success",
      entity: "Brand", reference: brand.name, description: `Added brand ${brand.name}.`,
    });
    return brand;
  }, []);

  const updateBrand = useCallback((id: string, updates: Partial<PriceListBrand>) => {
    const prev = stateRef.current.brands.find((b) => b.id === id);
    setState((s) => ({
      ...s,
      brands: s.brands.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    }));
    if (isSupabaseConfigured && supabase) {
      const row: Record<string, unknown> = {};
      if ("name" in updates) row.name = updates.name;
      if ("enabled" in updates) row.enabled = updates.enabled;
      if ("logoUrl" in updates) row.logo_url = updates.logoUrl ?? null;
      supabase.from("price_list_brands").update(row).eq("id", id).then();
    }
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "name", label: "Name" },
      { key: "enabled", label: "Enabled" },
    ]);
    logActivity({
      module: "Price List", action: "Brand Updated", severity: "info",
      entity: "Brand", reference: prev?.name || id, description: `Updated brand ${prev?.name || id}.`,
      changes,
    });
  }, []);

  const deleteBrand = useCallback((id: string) => {
    const prev = stateRef.current.brands.find((b) => b.id === id);
    const modelCount = stateRef.current.models.filter((m) => m.brandId === id).length;
    setState((s) => {
      const modelIds = s.models.filter((m) => m.brandId === id).map((m) => m.id);
      return {
        ...s,
        brands: s.brands.filter((b) => b.id !== id),
        models: s.models.filter((m) => m.brandId !== id),
        parts: s.parts.filter((p) => !modelIds.includes(p.modelId)),
      };
    });
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_brands").delete().eq("id", id).then();
    }
    logActivity({
      module: "Price List", action: "Brand Deleted", severity: "critical",
      entity: "Brand", reference: prev?.name || id,
      description: prev ? `Deleted brand ${prev.name} and ${modelCount} model${modelCount !== 1 ? "s" : ""}.` : `Deleted brand ${id}.`,
    });
  }, []);

  /* ── Models ── */
  const addModel = useCallback((data: Partial<PriceListModel> & { name: string; brandId: string; categoryId: string }) => {
    const model: PriceListModel = {
      id: generatePriceListModelId(),
      brandId: data.brandId,
      categoryId: data.categoryId,
      name: data.name.trim(),
      year: data.year ?? new Date().getFullYear(),
      chip: data.chip,
      storage: data.storage,
      displaySize: data.displaySize,
      variant: data.variant,
      modelYear: data.modelYear ?? data.year,
      imageUrl: data.imageUrl,
      status: data.status ?? "active",
      lastUpdated: nowStamp(),
      updatedBy: data.updatedBy ?? "Admin",
      createdOn: data.createdOn ?? nowStamp(),
    };
    setState((s) => ({ ...s, models: [...s.models, model] }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_models").insert({ id: model.id, organization_id: orgIdRef.current, brand_id: model.brandId, category_id: model.categoryId, name: model.name, model_year: model.year, chip: model.chip ?? null, storage: model.storage ?? null, display_size: model.displaySize ?? null, variant: model.variant ?? null, image_url: model.imageUrl ?? null, status: model.status ?? "active" }).then();
    }
    logActivity({
      module: "Price List", action: "Model Added", severity: "success",
      entity: "Device Model", reference: model.name, description: `Added model ${model.name}.`,
    });
    return model;
  }, []);

  const updateModel = useCallback((id: string, updates: Partial<PriceListModel>) => {
    const prev = stateRef.current.models.find((m) => m.id === id);
    setState((s) => ({
      ...s,
      models: s.models.map((m) => (m.id === id ? { ...m, ...updates, lastUpdated: nowStamp() } : m)),
    }));
    if (isSupabaseConfigured && supabase) {
      const row: Record<string, unknown> = {};
      if ("name" in updates) row.name = updates.name;
      if ("year" in updates) row.model_year = updates.year;
      if ("chip" in updates) row.chip = updates.chip ?? null;
      if ("storage" in updates) row.storage = updates.storage ?? null;
      if ("displaySize" in updates) row.display_size = updates.displaySize ?? null;
      if ("variant" in updates) row.variant = updates.variant ?? null;
      if ("imageUrl" in updates) row.image_url = updates.imageUrl ?? null;
      if ("status" in updates) row.status = updates.status;
      supabase.from("price_list_models").update(row).eq("id", id).then();
    }
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "name", label: "Name" }, { key: "year", label: "Year" },
      { key: "storage", label: "Storage" }, { key: "variant", label: "Variant" }, { key: "status", label: "Status" },
    ]);
    logActivity({
      module: "Price List", action: "Model Updated", severity: "info",
      entity: "Device Model", reference: prev?.name || id, description: `Updated model ${prev?.name || id}.`, changes,
    });
  }, []);

  const deleteModel = useCallback((id: string) => {
    const prev = stateRef.current.models.find((m) => m.id === id);
    setState((s) => ({
      ...s,
      models: s.models.filter((m) => m.id !== id),
      parts: s.parts.filter((p) => p.modelId !== id),
    }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_models").delete().eq("id", id).then();
    }
    logActivity({
      module: "Price List", action: "Model Deleted", severity: "critical",
      entity: "Device Model", reference: prev?.name || id,
      description: prev ? `Deleted device model ${prev.name}.` : `Deleted model ${id}.`,
    });
  }, []);

  const bulkDeleteModels = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setState((s) => ({
      ...s,
      models: s.models.filter((m) => !idSet.has(m.id)),
      parts: s.parts.filter((p) => !idSet.has(p.modelId)),
    }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_models").delete().in("id", ids).then();
    }
    logActivity({
      module: "Price List", action: "Model Deleted", severity: "critical",
      entity: "Device Model", reference: `${ids.length} models`,
      description: `Deleted ${ids.length} device model${ids.length !== 1 ? "s" : ""}.`,
    });
  }, []);

  const setModelImage = useCallback((id: string, imageUrl: string) => {
    setState((s) => ({
      ...s,
      models: s.models.map((m) => (m.id === id ? { ...m, imageUrl, lastUpdated: nowStamp() } : m)),
    }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_models").update({ image_url: imageUrl }).eq("id", id).then();
    }
  }, []);

  /* ── Parts ── */
  const addPart = useCallback((data: Partial<DevicePart> & { partName: string; modelId: string }) => {
    const part: DevicePart = {
      id: generatePartId(),
      partName: data.partName.trim(),
      partNumber: data.partNumber ?? "",
      price: data.price ?? 0,
      warranty: data.warranty ?? "1 Month",
      availability: data.availability ?? "In Stock",
      lastUpdated: nowStamp(),
      modelId: data.modelId,
      imageUrl: data.imageUrl,
    };
    setState((s) => ({ ...s, parts: [...s.parts, part] }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_parts").insert({ id: String(part.id), organization_id: orgIdRef.current, model_id: part.modelId, part_name: part.partName, part_number: part.partNumber ?? null, price: part.price, warranty: part.warranty ?? null, availability: part.availability ?? "In Stock", image_url: part.imageUrl ?? null }).then();
    }
    logActivity({
      module: "Price List", action: "Part Added", severity: "success",
      entity: "Part", reference: part.partName,
      description: `Added part ${part.partName} (₹${Number(part.price ?? 0).toLocaleString("en-IN")}).`,
    });
    return part;
  }, []);

  const updatePart = useCallback((id: number, updates: Partial<DevicePart>) => {
    const prev = stateRef.current.parts.find((p) => p.id === id);
    setState((s) => ({
      ...s,
      parts: s.parts.map((p) => (p.id === id ? { ...p, ...updates, lastUpdated: nowStamp() } : p)),
    }));
    if (isSupabaseConfigured && supabase) {
      const row: Record<string, unknown> = {};
      if ("partName" in updates) row.part_name = updates.partName;
      if ("partNumber" in updates) row.part_number = updates.partNumber ?? null;
      if ("price" in updates) row.price = updates.price;
      if ("warranty" in updates) row.warranty = updates.warranty ?? null;
      if ("availability" in updates) row.availability = updates.availability ?? null;
      if ("imageUrl" in updates) row.image_url = updates.imageUrl ?? null;
      supabase.from("price_list_parts").update(row).eq("id", String(id)).then();
    }
    const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
    const priceChanged = "price" in updates && prev && updates.price !== prev.price;
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "partName", label: "Part Name" }, { key: "price", label: "Price", format: inr },
      { key: "warranty", label: "Warranty" }, { key: "availability", label: "Availability" },
    ]);
    logActivity({
      module: "Price List", action: priceChanged ? "Price Updated" : "Part Updated", severity: "info",
      entity: "Part", reference: prev?.partName || String(id),
      description: priceChanged ? `Updated price for ${prev?.partName || "part"}.` : `Updated part ${prev?.partName || id}.`, changes,
    });
  }, []);

  const deletePart = useCallback((id: number) => {
    const prev = stateRef.current.parts.find((p) => p.id === id);
    setState((s) => ({ ...s, parts: s.parts.filter((p) => p.id !== id) }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_parts").delete().eq("id", String(id)).then();
    }
    logActivity({
      module: "Price List", action: "Part Deleted", severity: "critical",
      entity: "Part", reference: prev?.partName || String(id),
      description: prev ? `Deleted part ${prev.partName}.` : `Deleted part ${id}.`,
    });
  }, []);

  const bulkDeleteParts = useCallback((ids: number[]) => {
    const idSet = new Set(ids);
    setState((s) => ({ ...s, parts: s.parts.filter((p) => !idSet.has(p.id)) }));
    if (isSupabaseConfigured && supabase) {
      supabase.from("price_list_parts").delete().in("id", ids.map(String)).then();
    }
    logActivity({
      module: "Price List", action: "Part Deleted", severity: "critical",
      entity: "Part", reference: `${ids.length} parts`,
      description: `Deleted ${ids.length} part${ids.length !== 1 ? "s" : ""}.`,
    });
  }, []);

  const clearSeedData = useCallback(() => {
    setState((s) => stripSeed(s));
  }, []);

  const resetCatalog = useCallback(() => {
    setState(seedState());
  }, []);

  /* ── CSV/Excel import merge ──
     For each row: find-or-create Category → Brand → Model, then upsert the
     Part (matched by SKU, else by name within the model). Icons default to
     "Box"; new brands inherit the row's category. Runs as one atomic update. */
  const importRows = useCallback((rows: CatalogImportRow[]): ImportResult => {
    const result: ImportResult = {
      categoriesAdded: 0, brandsAdded: 0, modelsAdded: 0, modelsUpdated: 0, partsAdded: 0, partsUpdated: 0,
    };

    // Compute the next catalog synchronously from the live ref so we can both
    // apply it and return an accurate summary in the same tick. Any import
    // clears the built-in sample data first.
    const nextState = ((s0: CatalogState): CatalogState => {
      const s = stripSeed(s0);
      const categories = [...s.categories];
      const brands = [...s.brands];
      const models = [...s.models];
      const parts = [...s.parts];

      const findCategory = (name: string) =>
        categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      const findBrand = (name: string, categoryId: string) =>
        brands.find((b) => b.name.toLowerCase() === name.toLowerCase() && b.categoryId === categoryId);
      const findModel = (name: string, brandId: string) =>
        models.find((m) => m.name.toLowerCase() === name.toLowerCase() && m.brandId === brandId);

      for (const row of rows) {
        const catName = row.category?.trim();
        const brandName = row.brand?.trim();
        const modelName = row.model?.trim();
        if (!catName || !brandName || !modelName) continue;

        // Category
        let category = findCategory(catName);
        if (!category) {
          category = { id: generateCategoryId(), name: catName, icon: "Box", count: 0, enabled: true };
          categories.push(category);
          result.categoriesAdded++;
        }

        // Brand
        let brand = findBrand(brandName, category.id);
        if (!brand) {
          brand = { id: generatePriceListBrandId(), name: brandName, categoryId: category.id, count: 0, enabled: true };
          brands.push(brand);
          result.brandsAdded++;
        }

        // Model
        let model = findModel(modelName, brand.id);
        if (!model) {
          model = {
            id: generatePriceListModelId(),
            brandId: brand.id,
            categoryId: category.id,
            name: modelName,
            year: row.year ? parseInt(row.year, 10) || new Date().getFullYear() : new Date().getFullYear(),
            chip: row.chip || undefined,
            storage: row.storage || undefined,
            displaySize: row.displaySize || undefined,
            variant: row.variant || undefined,
            modelYear: row.year ? parseInt(row.year, 10) || undefined : undefined,
            imageUrl: row.deviceImage || undefined,
            status: "active",
            lastUpdated: nowStamp(),
            updatedBy: "CSV Import",
            createdOn: nowStamp(),
          };
          models.push(model);
          result.modelsAdded++;
        } else if (row.deviceImage && !model.imageUrl) {
          // Backfill image if the row provides one and the model lacks it
          const idx = models.findIndex((m) => m.id === model!.id);
          models[idx] = { ...model, imageUrl: row.deviceImage };
        }

        // Part (only if a part name is provided)
        const partName = row.partName?.trim();
        if (!partName) continue;
        const price = row.price ? Math.round(parseFloat(row.price.replace(/[^0-9.]/g, "")) || 0) : 0;
        const sku = row.sku?.trim() ?? "";
        const availability = (["In Stock", "Limited", "Out of Stock"].includes(row.availability?.trim() ?? "")
          ? row.availability!.trim()
          : "In Stock") as DevicePart["availability"];
        const warranty = row.warranty?.trim() || "1 Month";

        const existingIdx = parts.findIndex(
          (p) => p.modelId === model!.id &&
            ((sku && p.partNumber === sku) || p.partName.toLowerCase() === partName.toLowerCase())
        );
        if (existingIdx >= 0) {
          parts[existingIdx] = {
            ...parts[existingIdx],
            partName, partNumber: sku || parts[existingIdx].partNumber,
            price, warranty, availability, lastUpdated: nowStamp(),
          };
          result.partsUpdated++;
        } else {
          parts.push({
            id: generatePartId(),
            partName, partNumber: sku, price, warranty, availability,
            lastUpdated: nowStamp(), modelId: model.id,
          });
          result.partsAdded++;
        }
      }

      return { categories, brands, models, parts };
    })(stateRef.current);

    setState(nextState);
    logActivity({
      module: "Price List", action: "Data Imported", severity: "info", entity: "Catalog",
      description: `Imported catalog data — ${result.modelsAdded} model(s) added, ${result.partsAdded} part(s) added, ${result.partsUpdated} updated.`,
      meta: {
        "Categories added": String(result.categoriesAdded),
        "Brands added": String(result.brandsAdded),
        "Models added": String(result.modelsAdded),
        "Models updated": String(result.modelsUpdated),
        "Parts added": String(result.partsAdded),
        "Parts updated": String(result.partsUpdated),
      },
    });
    return result;
  }, []);

  /* ── Generic (wide-sheet) smart import ──
     Each SmartModel is one device row; its parts were derived from the sheet's
     repair columns. Find-or-create Category → Brand → Model, then upsert each
     part (matched by name within the model). Runs as one atomic update. */
  const importSmartModels = useCallback((incoming: SmartModel[], opts: SmartImportOptions): ImportResult => {
    const result: ImportResult = {
      categoriesAdded: 0, brandsAdded: 0, modelsAdded: 0, modelsUpdated: 0, partsAdded: 0, partsUpdated: 0,
    };
    const availability = opts.defaultAvailability ?? "In Stock";
    const warranty = opts.defaultWarranty ?? "3 Months";

    const nextState = ((s0: CatalogState): CatalogState => {
      const s = stripSeed(s0); // importing real data clears the built-in samples
      const categories = [...s.categories];
      const brands = [...s.brands];
      const models = [...s.models];
      const parts = [...s.parts];

      const findCategory = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      const findBrand = (name: string, categoryId: string) =>
        brands.find((b) => b.name.toLowerCase() === name.toLowerCase() && b.categoryId === categoryId);
      const findModel = (name: string, brandId: string) =>
        models.find((m) => m.name.toLowerCase() === name.toLowerCase() && m.brandId === brandId);

      for (const sm of incoming) {
        if (!sm.name?.trim()) continue;
        const catName = (sm.category || opts.defaultCategory || "Imported").trim();
        const brandName = (sm.brand || opts.defaultBrand || "Imported").trim();

        // Category
        let category = findCategory(catName);
        if (!category) {
          category = { id: generateCategoryId(), name: catName, icon: "Box", count: 0, enabled: true };
          categories.push(category);
          result.categoriesAdded++;
        }
        // Brand
        let brand = findBrand(brandName, category.id);
        if (!brand) {
          brand = { id: generatePriceListBrandId(), name: brandName, categoryId: category.id, count: 0, enabled: true };
          brands.push(brand);
          result.brandsAdded++;
        }
        // Model
        const extraMeta = { ...sm.meta };
        if (sm.ram) extraMeta["RAM"] = sm.ram;
        if (sm.status) extraMeta["Status"] = sm.status;

        let model = findModel(sm.name, brand.id);
        if (!model) {
          model = {
            id: generatePriceListModelId(),
            brandId: brand.id,
            categoryId: category.id,
            name: sm.name.trim(),
            year: sm.year ?? new Date().getFullYear(),
            chip: sm.chip,
            storage: sm.storage,
            displaySize: sm.displaySize,
            variant: sm.variant,
            modelYear: sm.year,
            status: "active",
            lastUpdated: nowStamp(),
            updatedBy: "Smart Import",
            createdOn: nowStamp(),
            meta: Object.keys(extraMeta).length ? extraMeta : undefined,
          };
          models.push(model);
          result.modelsAdded++;
        } else {
          const idx = models.findIndex((m) => m.id === model!.id);
          models[idx] = {
            ...model,
            year: sm.year ?? model.year,
            chip: sm.chip ?? model.chip,
            storage: sm.storage ?? model.storage,
            displaySize: sm.displaySize ?? model.displaySize,
            variant: sm.variant ?? model.variant,
            modelYear: sm.year ?? model.modelYear,
            meta: Object.keys(extraMeta).length ? { ...model.meta, ...extraMeta } : model.meta,
            lastUpdated: nowStamp(),
          };
          model = models[idx];
          result.modelsUpdated++;
        }

        // Parts — upsert by name within the model
        for (const p of sm.parts) {
          const existingIdx = parts.findIndex(
            (x) => x.modelId === model!.id && x.partName.toLowerCase() === p.name.toLowerCase()
          );
          if (existingIdx >= 0) {
            parts[existingIdx] = {
              ...parts[existingIdx],
              price: p.price,
              priceKnown: p.priceKnown,
              repairCategory: p.repairCategory,
              availability: p.priceKnown ? parts[existingIdx].availability : availability,
              lastUpdated: nowStamp(),
            };
            result.partsUpdated++;
          } else {
            parts.push({
              id: generatePartId(),
              partName: p.name,
              partNumber: "",
              price: p.price,
              priceKnown: p.priceKnown,
              warranty,
              availability,
              repairCategory: p.repairCategory,
              lastUpdated: nowStamp(),
              modelId: model.id,
            });
            result.partsAdded++;
          }
        }
      }

      return { categories, brands, models, parts };
    })(stateRef.current);

    setState(nextState);
    logActivity({
      module: "Price List", action: "Data Imported", severity: "info", entity: "Catalog",
      description: `Imported catalog data — ${result.modelsAdded} model(s) added, ${result.partsAdded} part(s) added, ${result.partsUpdated} updated.`,
      meta: {
        "Categories added": String(result.categoriesAdded),
        "Brands added": String(result.brandsAdded),
        "Models added": String(result.modelsAdded),
        "Models updated": String(result.modelsUpdated),
        "Parts added": String(result.partsAdded),
        "Parts updated": String(result.partsUpdated),
      },
    });
    return result;
  }, []);

  const catalog: Catalog = {
    ...state,
    hydrated,
    addCategory, updateCategory, deleteCategory, toggleCategory,
    addBrand, updateBrand, deleteBrand,
    addModel, updateModel, deleteModel, bulkDeleteModels, setModelImage,
    addPart, updatePart, deletePart, bulkDeleteParts,
    importRows, importSmartModels, clearSeedData, resetCatalog,
  };

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

/* ─── Hook ───────────────────────────────────────────────────────── */

export function useCatalog(): Catalog {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}

/* ─── Selector helpers (pure) ────────────────────────────────────── */

export function brandsForCategory(brands: PriceListBrand[], categoryId: string) {
  return brands.filter((b) => b.categoryId === categoryId);
}

export function modelsForBrand(models: PriceListModel[], brandId: string) {
  return models.filter((m) => m.brandId === brandId);
}

export function partsForModel(parts: DevicePart[], modelId: string) {
  return parts.filter((p) => p.modelId === modelId);
}
