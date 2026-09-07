"use client";

/**
 * Device Colours — shared data layer.
 *
 * These are the colours offered in ticket creation (Job Details → Device
 * Colour) and managed in Settings → Device Colours. Each colour pairs a stored
 * `value` (persisted on the device) with a `label` and a `swatch` hex used to
 * render the coloured dot beside the name.
 *
 * Storage strategy:
 *   • When Supabase is configured → reads/writes `device_colours` table.
 *   • Fallback → localStorage key `repairox-device-colours`.
 *
 * Both the settings page and the ticket form import from here so they always
 * stay in sync.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

/* ─── Types ──────────────────────────────────────────────────────── */

export type DeviceColourItem = {
  /** Stable id / stored value (e.g. "black"). */
  value: string;
  label: string;
  /** Hex colour for the dot shown left of the name (e.g. "#2B2B2E"). */
  swatch: string;
  sort_order?: number;
};

/* ─── Defaults ───────────────────────────────────────────────────── */

export const DEFAULT_COLOURS: DeviceColourItem[] = [
  { value: "black", label: "Black", swatch: "#2B2B2E" },
  { value: "white", label: "White", swatch: "#E7E7EA" },
  { value: "red", label: "Red", swatch: "#B23B3B" },
  { value: "blue", label: "Blue", swatch: "#3E5C99" },
];

const STORAGE_KEY = "repairox-device-colours";

/* ─── localStorage helpers (fallback) ────────────────────────────── */

function loadFromLocalStorage(): DeviceColourItem[] {
  if (typeof window === "undefined") return DEFAULT_COLOURS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLOURS;
    const parsed: DeviceColourItem[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COLOURS;
    return parsed;
  } catch {
    return DEFAULT_COLOURS;
  }
}

function saveToLocalStorage(colours: DeviceColourItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colours));
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

let _cache: DeviceColourItem[] | null = null;
let _cachePromise: Promise<DeviceColourItem[]> | null = null;

/**
 * Returns cached colours synchronously (or null if not yet loaded).
 * Useful for rendering immediately without an async delay.
 */
export function getCachedColours(): DeviceColourItem[] | null {
  return _cache;
}

/**
 * Invalidate the in-memory cache (call after saving changes).
 */
export function invalidateColourCache(): void {
  _cache = null;
  _cachePromise = null;
}

/* ─── Change subscription (keeps every consumer in sync) ─────────── */

type ColourListener = (colours: DeviceColourItem[]) => void;
const _listeners = new Set<ColourListener>();

/** Notify all subscribers with the latest colour list. */
function notifyColourChange(colours: DeviceColourItem[]): void {
  for (const fn of _listeners) {
    try { fn(colours); } catch { /* ignore listener errors */ }
  }
}

/**
 * Subscribe to device-colour changes. The callback fires whenever the list is
 * saved anywhere (Settings, ticket creation) — in this tab or another tab.
 * Returns an unsubscribe function. This is what keeps Settings ↔ ticket
 * creation in sync without a full reload.
 */
export function subscribeDeviceColours(listener: ColourListener): () => void {
  _listeners.add(listener);
  // Cross-tab sync: another tab wrote to localStorage.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    invalidateColourCache();
    const fresh = loadFromLocalStorage();
    _cache = fresh;
    listener(fresh);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    _listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/* ─── Public API ─────────────────────────────────────────────────── */

/**
 * Load device colours from Supabase (or localStorage fallback).
 * Results are cached in-memory — subsequent calls resolve instantly.
 */
export async function loadDeviceColours(): Promise<DeviceColourItem[]> {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;

  _cachePromise = _loadDeviceColoursImpl();
  const result = await _cachePromise;
  _cache = result;
  return result;
}

async function _loadDeviceColoursImpl(): Promise<DeviceColourItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    return loadFromLocalStorage();
  }

  try {
    const orgId = await getOrgId();
    if (!orgId) return loadFromLocalStorage();

    const { data, error } = await supabase
      .from("device_colours")
      .select("*")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      // Table might not exist yet or no data — fall back to localStorage,
      // but also try to seed the DB with defaults.
      const local = loadFromLocalStorage();
      await seedColours(orgId, local).catch(() => {});
      return local;
    }

    return data.map((r: any) => ({
      value: r.id,
      label: r.label ?? r.id,
      swatch: r.swatch ?? "#2B2B2E",
      sort_order: r.sort_order ?? 0,
    }));
  } catch {
    return loadFromLocalStorage();
  }
}

/**
 * Save the full colour list to Supabase (or localStorage fallback).
 * This does a full replace (delete all + insert) to handle reordering/removal.
 */
export async function saveDeviceColours(colours: DeviceColourItem[]): Promise<boolean> {
  // Prime the in-memory cache with the saved list so synchronous readers
  // (colourLabel / getCachedColours) and any newly-mounting consumer see the
  // fresh data immediately — then clear the in-flight promise.
  _cache = colours;
  _cachePromise = null;
  // Always update localStorage as a cache (also triggers cross-tab `storage`).
  saveToLocalStorage(colours);
  // Notify every mounted consumer (Settings ↔ ticket creation) in this tab.
  notifyColourChange(colours);

  if (!isSupabaseConfigured || !supabase) return true;

  try {
    const orgId = await getOrgId();
    if (!orgId) return true; // no auth — localStorage only

    // Delete existing rows for this org.
    await supabase
      .from("device_colours")
      .delete()
      .eq("organization_id", orgId);

    // Insert fresh set.
    const rows = colours.map((c, i) => ({
      id: c.value,
      organization_id: orgId,
      label: c.label,
      swatch: c.swatch,
      sort_order: i,
    }));

    const { error } = await supabase
      .from("device_colours")
      .insert(rows);

    if (error) {
      console.error("[DeviceColours] Save failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[DeviceColours] Save error:", e);
    return false;
  }
}

/**
 * Seed the DB with initial colours (called once when the table is empty).
 */
async function seedColours(orgId: string, colours: DeviceColourItem[]) {
  if (!supabase) return;
  const rows = colours.map((c, i) => ({
    id: c.value,
    organization_id: orgId,
    label: c.label,
    swatch: c.swatch,
    sort_order: i,
  }));
  await supabase.from("device_colours").insert(rows);
}

/* ─── Label Resolution ───────────────────────────────────────────── */

/**
 * Resolve a stored device colour value (e.g. "black") to its human-readable
 * label (e.g. "Black"). Uses the in-memory cache of the Settings-backed list
 * when available, then the built-in defaults. Returns "" for empty/unknown so
 * historical devices show blank rather than a guessed colour.
 *
 * Synchronous by design so it can be used in render paths. Callers that need
 * fresh data should call `loadDeviceColours()` first to warm the cache.
 */
export function colourLabel(value?: string): string {
  if (!value) return "";
  const lookup = (list: DeviceColourItem[] | null): string | undefined =>
    list?.find((c) => c.value === value)?.label;
  return lookup(_cache) ?? lookup(DEFAULT_COLOURS) ?? value;
}
