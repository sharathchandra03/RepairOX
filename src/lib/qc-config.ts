"use client";

/**
 * Quality Check (QC) configuration — shared data layer.
 *
 * This is the SINGLE SOURCE OF TRUTH for the QC checklist used during ticket
 * creation (Settings → Tickets → Quality Check drives the QC form in
 * `/tickets/new`).
 *
 * Storage strategy (mirrors device-categories.ts):
 *   • When Supabase is configured → reads/writes the `qc_config` table
 *     (one JSON document row per organization).
 *   • Fallback → localStorage key `repairox-qc-config`.
 *
 * Historical safety:
 *   • Items/categories are NEVER hard-deleted from the config — they are
 *     marked `archived`. Active QC forms only show non-archived items, but any
 *     item key already recorded on a historical ticket's per-device `qc` map
 *     still resolves to a label via `qcItemLabel()`, so old tickets keep
 *     rendering their recorded results even after an item is archived.
 *
 * Data model:
 *   • A QC category groups checklist items.
 *   • Each checklist item has a STABLE `id` (used as the key in the per-device
 *     `qc` map) and a display `label`. Legacy tickets stored the LABEL as the
 *     key (e.g. "Display"), so item ids default to the label for the seeded
 *     defaults to keep backward compatibility.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

/* ─── Types ──────────────────────────────────────────────────────── */

export type QCItem = {
  /** Stable key stored in the per-device `qc` map. */
  id: string;
  /** Human-readable label shown in the QC form. */
  label: string;
  /** Hidden from NEW QC forms when true (kept for historical records). */
  archived?: boolean;
  /** When true, the item must be inspected before QC is considered complete.
   *  Advisory only — the existing QC form does not block on it today. */
  required?: boolean;
};

export type QCCategory = {
  /** Stable category id (matches the wizard's QC_GROUPS ids for defaults). */
  id: string;
  /** Category display label. */
  label: string;
  /** Hidden from NEW QC forms when true (kept for historical records). */
  archived?: boolean;
  /** Ordered checklist items in this category. */
  items: QCItem[];
};

/**
 * A single named QC template (e.g. "Mobile", "Laptop"). Multiple templates let
 * a shop keep a different checklist per device type and pick the right one in
 * the ticket QC step. Each template owns its own ordered categories/items.
 */
export type QCTemplate = {
  /** Stable template id (the key persisted on a device's `qcTemplateId`). */
  id: string;
  /** Template display name shown on the selector pill + settings. */
  name: string;
  /** Hidden from NEW QC forms when true (kept for historical records). */
  archived?: boolean;
  /** Ordered QC categories (each with its checklist items) for this template. */
  categories: QCCategory[];
};

export type QCConfig = {
  /** Schema/content version of the SEEDED default. Bump CURRENT_QC_VERSION
   *  whenever the canonical DEFAULT_QC_CONFIG changes in a way that should
   *  overwrite older saved configs (e.g. the authoritative 20-item list).
   *  A stored config with a lower version is force-migrated to the default. */
  version?: number;
  /** All QC templates for the org. At least one always exists. */
  templates: QCTemplate[];
  /** The template selected by default in a NEW ticket QC step. */
  defaultTemplateId?: string;
  /** @deprecated Legacy single-checklist shape (pre-templates). Kept ONLY so
   *  old stored configs / callers reading `config.categories` still resolve;
   *  it mirrors the DEFAULT template's categories. New code reads templates. */
  categories: QCCategory[];
};

/** Current canonical QC config version. Any saved config with a lower (or
 *  missing) version is replaced by DEFAULT_QC_CONFIG on load and re-saved.
 *  v2 = the authoritative 20-item list (Device Powering On … WiFi / Bluetooth).
 *  v3 = multi-template model (legacy single checklist migrated to one template,
 *       but the v2 20-item content is preserved so it is NOT force-reset). */
export const CURRENT_QC_VERSION = 3;

/** Default (seed) template id for a fresh org. */
export const DEFAULT_QC_TEMPLATE_ID = "standard";

/* ─── Defaults ───────────────────────────────────────────────────── */

/**
 * Seeded from the QC categories/items that were previously HARDCODED in
 * `src/app/tickets/new/page.tsx` (QC_GROUPS / QC_FIELDS). Item ids are the
 * labels themselves so historical per-device `qc` maps (keyed by label)
 * continue to line up exactly.
 */
const DEFAULT_QC_CATEGORIES: QCCategory[] = [
    // NOTE: The item SEQUENCE below is authoritative — flattening every
    // category top-to-bottom yields the required order 1→20. Category labels
    // are cosmetic grouping only and must never disturb the item order.
    {
      id: "exterior",
      label: "Exterior",
      items: [
        { id: "Device Powering On", label: "Device Powering On" }, // 1
        { id: "Dent", label: "Dent" }, // 2
        { id: "Scratches", label: "Scratches" }, // 3
      ],
    },
    {
      id: "display",
      label: "Display & Touch",
      items: [
        { id: "Display", label: "Display" }, // 4
        { id: "Touch", label: "Touch" }, // 5
        { id: "Proximity Sensor", label: "Proximity Sensor" }, // 6
        { id: "Back Glass", label: "Back Glass" }, // 7
      ],
    },
    {
      id: "audio",
      label: "Audio",
      items: [
        { id: "Receiver", label: "Receiver" }, // 8
        { id: "Mic", label: "Mic" }, // 9
        { id: "Speaker", label: "Speaker" }, // 10
        { id: "Taptic", label: "Taptic" }, // 11
      ],
    },
    {
      id: "camera",
      label: "Camera",
      items: [
        { id: "Main Camera", label: "Main Camera" }, // 12
        { id: "Front Camera", label: "Front Camera" }, // 13
      ],
    },
    {
      id: "biometrics",
      label: "Biometrics",
      items: [
        { id: "Face ID", label: "Face ID" }, // 14
        { id: "Touch ID", label: "Touch ID" }, // 15
      ],
    },
    {
      id: "buttons",
      label: "Buttons",
      items: [
        { id: "Power Key", label: "Power Key" }, // 16
        { id: "Volume Key", label: "Volume Key" }, // 17
        { id: "Charging Port", label: "Charging Port" }, // 18
      ],
    },
    {
      id: "connectivity",
      label: "Connectivity",
      items: [
        { id: "Network", label: "Network" }, // 19
        { id: "WiFi / Bluetooth", label: "WiFi / Bluetooth" }, // 20
      ],
    },
];

export const DEFAULT_QC_CONFIG: QCConfig = {
  version: CURRENT_QC_VERSION,
  defaultTemplateId: DEFAULT_QC_TEMPLATE_ID,
  templates: [
    {
      id: DEFAULT_QC_TEMPLATE_ID,
      name: "Standard",
      categories: structuredCloneSafe(DEFAULT_QC_CATEGORIES),
    },
  ],
  // Legacy mirror (the default template's categories) for any code still
  // reading `config.categories`.
  categories: structuredCloneSafe(DEFAULT_QC_CATEGORIES),
};

const STORAGE_KEY = "repairox-qc-config";

/* ─── Normalization ──────────────────────────────────────────────── */

/** Coerce a raw array into a clean QCCategory[]. */
function normalizeCategories(raw: unknown): QCCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c.id === "string")
    .map((c) => ({
      id: c.id,
      label: c.label ?? c.id,
      archived: !!c.archived,
      items: Array.isArray(c.items)
        ? c.items
            .filter((i: any) => i && typeof i.id === "string")
            .map((i: any) => ({
              id: i.id,
              label: i.label ?? i.id,
              archived: !!i.archived,
              required: !!i.required,
            }))
        : [],
    }));
}

/** Defensive: coerce any loaded value into a valid multi-template QCConfig.
 *  Supports both the current `{ templates }` shape AND the legacy
 *  `{ categories }` shape (auto-wrapped into a single "Standard" template), so
 *  a pre-templates stored config is migrated WITHOUT losing its checklist. */
function normalizeConfig(raw: unknown): QCConfig {
  if (!raw || typeof raw !== "object") return structuredCloneSafe(DEFAULT_QC_CONFIG);
  const obj = raw as Partial<QCConfig>;
  const rawVersion = obj.version;
  const version = typeof rawVersion === "number" ? rawVersion : 1;

  let templates: QCTemplate[] = [];

  if (Array.isArray(obj.templates) && obj.templates.length > 0) {
    templates = obj.templates
      .filter((t) => t && typeof t.id === "string")
      .map((t) => ({
        id: t.id,
        name: (t as QCTemplate).name ?? t.id,
        archived: !!(t as QCTemplate).archived,
        categories: normalizeCategories((t as QCTemplate).categories),
      }));
  } else if (Array.isArray(obj.categories)) {
    // Legacy single-checklist config → wrap into one default template so no
    // existing QC data is lost when migrating to the multi-template model.
    templates = [
      {
        id: DEFAULT_QC_TEMPLATE_ID,
        name: "Standard",
        categories: normalizeCategories(obj.categories),
      },
    ];
  }

  if (templates.length === 0) return structuredCloneSafe(DEFAULT_QC_CONFIG);

  // Resolve the default template: honour a valid stored id, else first.
  const defaultTemplateId =
    obj.defaultTemplateId && templates.some((t) => t.id === obj.defaultTemplateId)
      ? obj.defaultTemplateId
      : templates[0].id;

  // Keep the legacy `categories` mirror pointing at the default template so any
  // code still reading `config.categories` resolves to a sensible checklist.
  const defaultTemplate = templates.find((t) => t.id === defaultTemplateId) ?? templates[0];

  return {
    version,
    templates,
    defaultTemplateId,
    categories: structuredCloneSafe(defaultTemplate.categories),
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Minimum version whose CONTENT is still the authoritative checklist. A config
 *  at or above this is migrated in place (its checklist preserved) rather than
 *  being replaced. Only configs BELOW this (the pre-20-item v1 era) are
 *  force-reset to DEFAULT_QC_CONFIG. The v2→v3 jump is the templates wrapper,
 *  which `normalizeConfig` performs without losing data. */
const MIN_PRESERVE_VERSION = 2;

/** True when a stored config predates the authoritative 20-item checklist and
 *  must be force-replaced with DEFAULT_QC_CONFIG. */
function isOutdated(config: QCConfig): boolean {
  return (config.version ?? 1) < MIN_PRESERVE_VERSION;
}

/** True when a (non-outdated) config needs its version re-stamped to the
 *  current version after an in-place migration (e.g. v2 → v3 templates wrap). */
function needsVersionBump(config: QCConfig): boolean {
  return !isOutdated(config) && (config.version ?? 1) < CURRENT_QC_VERSION;
}

/* ─── localStorage helpers (fallback) ────────────────────────────── */

function loadFromLocalStorage(): QCConfig {
  if (typeof window === "undefined") return structuredCloneSafe(DEFAULT_QC_CONFIG);
  try {
    const rawStr = localStorage.getItem(STORAGE_KEY);
    if (!rawStr) return structuredCloneSafe(DEFAULT_QC_CONFIG);
    const parsed = normalizeConfig(JSON.parse(rawStr));
    // Pre-20-item list → replace with the canonical default and persist.
    if (isOutdated(parsed)) {
      const fresh = structuredCloneSafe(DEFAULT_QC_CONFIG);
      saveToLocalStorage(fresh);
      return fresh;
    }
    // In-place migration (e.g. legacy single checklist → templates): keep the
    // content, re-stamp the version and persist so it isn't re-migrated.
    if (needsVersionBump(parsed)) {
      const migrated = { ...parsed, version: CURRENT_QC_VERSION };
      saveToLocalStorage(migrated);
      return migrated;
    }
    return parsed;
  } catch {
    return structuredCloneSafe(DEFAULT_QC_CONFIG);
  }
}

function saveToLocalStorage(config: QCConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage full or unavailable */
  }
}

/* ─── Supabase helpers ───────────────────────────────────────────── */

async function getOrgId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) return null;
  const { data: staffRow } = await supabase
    .from("staff")
    .select("organization_id")
    .eq("auth_user_id", sessionData.session.user.id)
    .maybeSingle();
  return (staffRow?.organization_id as string) ?? null;
}

/* ─── In-memory cache ────────────────────────────────────────────── */

let _cache: QCConfig | null = null;
let _cachePromise: Promise<QCConfig> | null = null;

/** Returns cached config synchronously (or null if not yet loaded). */
export function getCachedQCConfig(): QCConfig | null {
  return _cache;
}

/** Invalidate the in-memory cache (call after saving changes). */
export function invalidateQCConfigCache(): void {
  _cache = null;
  _cachePromise = null;
}

/* ─── Public API ─────────────────────────────────────────────────── */

/**
 * Load QC config from Supabase (or localStorage fallback). Cached in-memory —
 * subsequent calls resolve instantly.
 */
export async function loadQCConfig(): Promise<QCConfig> {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;
  _cachePromise = _loadQCConfigImpl();
  const result = await _cachePromise;
  _cache = result;
  return result;
}

async function _loadQCConfigImpl(): Promise<QCConfig> {
  if (!isSupabaseConfigured || !supabase) {
    return loadFromLocalStorage();
  }
  try {
    const orgId = await getOrgId();
    if (!orgId) return loadFromLocalStorage();

    const { data, error } = await supabase
      .from("qc_config")
      .select("config")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error || !data || !data.config) {
      // Table might not exist yet or no row — fall back to localStorage and
      // best-effort seed the DB with defaults.
      const local = loadFromLocalStorage();
      await seedConfig(orgId, local).catch(() => {});
      return local;
    }

    const stored = normalizeConfig(data.config);
    // Pre-20-item list (different names / grouping) → force-migrate to the
    // canonical default and persist so every user matches the authoritative list.
    if (isOutdated(stored)) {
      const fresh = structuredCloneSafe(DEFAULT_QC_CONFIG);
      saveToLocalStorage(fresh);
      await seedConfig(orgId, fresh).catch(() => {});
      return fresh;
    }
    // In-place migration (legacy single checklist → templates wrapper): keep
    // the content, re-stamp the version and persist so it isn't re-migrated.
    if (needsVersionBump(stored)) {
      const migrated = { ...stored, version: CURRENT_QC_VERSION };
      saveToLocalStorage(migrated);
      await seedConfig(orgId, migrated).catch(() => {});
      return migrated;
    }
    return stored;
  } catch {
    return loadFromLocalStorage();
  }
}

/**
 * Persist the full QC config (upsert one row per org). Always writes the
 * localStorage cache too so the fallback stays warm.
 */
export async function saveQCConfig(config: QCConfig): Promise<boolean> {
  // Any explicit save stamps the current version — an admin editing the list
  // is producing a current-version config, so it must not be force-migrated
  // away on the next load. normalizeConfig also re-syncs the legacy
  // `categories` mirror to the default template.
  const normalized = { ...normalizeConfig(config), version: CURRENT_QC_VERSION };
  invalidateQCConfigCache();
  saveToLocalStorage(normalized);

  if (!isSupabaseConfigured || !supabase) return true;

  try {
    const orgId = await getOrgId();
    if (!orgId) return true; // no auth — localStorage only

    const { error } = await supabase
      .from("qc_config")
      .upsert(
        { organization_id: orgId, config: normalized, updated_at: new Date().toISOString() },
        { onConflict: "organization_id" }
      );

    if (error) {
      console.error("[QCConfig] Save failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[QCConfig] Save error:", e);
    return false;
  }
}

async function seedConfig(orgId: string, config: QCConfig) {
  if (!supabase) return;
  await supabase
    .from("qc_config")
    .upsert(
      { organization_id: orgId, config: normalizeConfig(config), updated_at: new Date().toISOString() },
      { onConflict: "organization_id" }
    );
}

/* ─── Derived helpers ────────────────────────────────────────────── */

/** Non-archived templates. At least one always resolves — if everything is
 *  archived, the first template is still returned so the QC form never breaks. */
export function activeTemplates(config: QCConfig): QCTemplate[] {
  const live = config.templates.filter((t) => !t.archived);
  if (live.length > 0) return live;
  return config.templates.slice(0, 1);
}

/** Resolve a template by id, falling back to the config's default template,
 *  then the first template. Never returns undefined for a valid config. */
export function resolveTemplate(config: QCConfig, templateId?: string | null): QCTemplate {
  if (templateId) {
    const hit = config.templates.find((t) => t.id === templateId);
    if (hit) return hit;
  }
  if (config.defaultTemplateId) {
    const def = config.templates.find((t) => t.id === config.defaultTemplateId);
    if (def) return def;
  }
  return config.templates[0] ?? DEFAULT_QC_CONFIG.templates[0];
}

/** Active (non-archived) categories (with only active items) for ONE template.
 *  This is what the NEW ticket QC form renders for the selected template. */
export function activeCategoriesForTemplate(template: QCTemplate | undefined): QCCategory[] {
  if (!template) return [];
  return template.categories
    .filter((c) => !c.archived)
    .map((c) => ({ ...c, items: c.items.filter((i) => !i.archived) }))
    .filter((c) => c.items.length > 0);
}

/** @deprecated Active categories of the DEFAULT template (legacy single-list
 *  callers). New code should resolve a template then call
 *  `activeCategoriesForTemplate`. */
export function activeCategories(config: QCConfig): QCCategory[] {
  return activeCategoriesForTemplate(resolveTemplate(config));
}

/** Flat list of active item ids across the default template's active categories. */
export function activeItemIds(config: QCConfig): string[] {
  return activeCategories(config).flatMap((c) => c.items.map((i) => i.id));
}

/**
 * Resolve a QC item id/key to its display label using the loaded config, then
 * defaults. Falls back to the raw key so historical/archived item results
 * still render a readable label on old tickets.
 */
export function qcItemLabel(idOrLabel: string): string {
  if (!idOrLabel) return "";
  const search = (cfg: QCConfig | null): string | undefined => {
    if (!cfg) return undefined;
    // Search every template's categories so an item recorded under any
    // template still resolves to a readable label on historical tickets.
    const cats = cfg.templates.flatMap((t) => t.categories);
    for (const cat of cats) {
      const hit = cat.items.find((i) => i.id === idOrLabel || i.label === idOrLabel);
      if (hit) return hit.label;
    }
    return undefined;
  };
  return search(_cache) ?? search(DEFAULT_QC_CONFIG) ?? idOrLabel;
}
