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

export type QCConfig = {
  categories: QCCategory[];
};

/* ─── Defaults ───────────────────────────────────────────────────── */

/**
 * Seeded from the QC categories/items that were previously HARDCODED in
 * `src/app/tickets/new/page.tsx` (QC_GROUPS / QC_FIELDS). Item ids are the
 * labels themselves so historical per-device `qc` maps (keyed by label)
 * continue to line up exactly.
 */
export const DEFAULT_QC_CONFIG: QCConfig = {
  categories: [
    {
      id: "exterior",
      label: "Exterior Condition",
      items: [
        { id: "Physical Condition", label: "Physical Condition" },
        { id: "Back Glass", label: "Back Glass" },
      ],
    },
    {
      id: "display",
      label: "Display & Touch",
      items: [
        { id: "Display", label: "Display" },
        { id: "Touch Panel", label: "Touch Panel" },
        { id: "Display Sensor", label: "Display Sensor" },
      ],
    },
    {
      id: "audio",
      label: "Audio",
      items: [
        { id: "Receiver", label: "Receiver" },
        { id: "Speaker", label: "Speaker" },
        { id: "Microphone", label: "Microphone" },
      ],
    },
    {
      id: "camera",
      label: "Camera",
      items: [
        { id: "Front Camera", label: "Front Camera" },
        { id: "Back Camera", label: "Back Camera" },
      ],
    },
    {
      id: "battery",
      label: "Battery",
      items: [{ id: "Battery Health", label: "Battery Health" }],
    },
    {
      id: "connectivity",
      label: "Connectivity",
      items: [
        { id: "Bluetooth / WiFi", label: "Bluetooth / WiFi" },
        { id: "Network", label: "Network" },
        { id: "Charging Port", label: "Charging Port" },
      ],
    },
    {
      id: "buttons",
      label: "Buttons & Biometrics",
      items: [
        { id: "Touch ID / Face ID", label: "Touch ID / Face ID" },
        { id: "Volume Keys", label: "Volume Keys" },
        { id: "Power Key", label: "Power Key" },
        { id: "Vibration", label: "Vibration" },
      ],
    },
  ],
};

const STORAGE_KEY = "repairox-qc-config";

/* ─── Normalization ──────────────────────────────────────────────── */

/** Defensive: coerce any loaded value into a valid QCConfig. */
function normalizeConfig(raw: unknown): QCConfig {
  if (!raw || typeof raw !== "object") return structuredCloneSafe(DEFAULT_QC_CONFIG);
  const cats = (raw as QCConfig).categories;
  if (!Array.isArray(cats)) return structuredCloneSafe(DEFAULT_QC_CONFIG);
  return {
    categories: cats
      .filter((c) => c && typeof c.id === "string")
      .map((c) => ({
        id: c.id,
        label: c.label ?? c.id,
        archived: !!c.archived,
        items: Array.isArray(c.items)
          ? c.items
              .filter((i) => i && typeof i.id === "string")
              .map((i) => ({
                id: i.id,
                label: i.label ?? i.id,
                archived: !!i.archived,
                required: !!i.required,
              }))
          : [],
      })),
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/* ─── localStorage helpers (fallback) ────────────────────────────── */

function loadFromLocalStorage(): QCConfig {
  if (typeof window === "undefined") return structuredCloneSafe(DEFAULT_QC_CONFIG);
  try {
    const rawStr = localStorage.getItem(STORAGE_KEY);
    if (!rawStr) return structuredCloneSafe(DEFAULT_QC_CONFIG);
    return normalizeConfig(JSON.parse(rawStr));
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

    return normalizeConfig(data.config);
  } catch {
    return loadFromLocalStorage();
  }
}

/**
 * Persist the full QC config (upsert one row per org). Always writes the
 * localStorage cache too so the fallback stays warm.
 */
export async function saveQCConfig(config: QCConfig): Promise<boolean> {
  const normalized = normalizeConfig(config);
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

/** Active (non-archived) categories, each with only its active items.
 *  This is what the NEW ticket QC form should render. */
export function activeCategories(config: QCConfig): QCCategory[] {
  return config.categories
    .filter((c) => !c.archived)
    .map((c) => ({ ...c, items: c.items.filter((i) => !i.archived) }))
    .filter((c) => c.items.length > 0);
}

/** Flat list of active item ids across all active categories. */
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
    for (const cat of cfg.categories) {
      const hit = cat.items.find((i) => i.id === idOrLabel || i.label === idOrLabel);
      if (hit) return hit.label;
    }
    return undefined;
  };
  return search(_cache) ?? search(DEFAULT_QC_CONFIG) ?? idOrLabel;
}
