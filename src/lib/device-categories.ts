"use client";

/**
 * Device Categories — shared data layer.
 *
 * These are the top-level device categories shown in ticket creation (the
 * category wheel) and managed in Settings → Device Categories.
 *
 * Storage strategy:
 *   • When Supabase is configured → reads/writes `device_categories` table.
 *   • Fallback → localStorage key `repairox-device-categories`.
 *
 * Both the settings page and the category-wheel import from here so they
 * always stay in sync.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

/* ─── Types ──────────────────────────────────────────────────────── */

export type DeviceCategoryItem = {
  id: string;
  label: string;
  image?: string; // base64 data URL or Supabase Storage public URL
  sort_order?: number;
};

/* ─── Defaults ───────────────────────────────────────────────────── */

export const DEFAULT_CATEGORIES: DeviceCategoryItem[] = [
  { id: "iphone", label: "iPhone" },
  { id: "macbook", label: "MacBook" },
  { id: "ipad", label: "iPad" },
  { id: "iwatch", label: "iWatch" },
  { id: "imac", label: "iMac" },
  { id: "android", label: "Android" },
  { id: "windows", label: "Windows" },
  { id: "others", label: "Others" },
];

const STORAGE_KEY = "repairox-device-categories";

/* ─── localStorage helpers (fallback) ────────────────────────────── */

function loadFromLocalStorage(): DeviceCategoryItem[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

function saveToLocalStorage(cats: DeviceCategoryItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
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

let _cache: DeviceCategoryItem[] | null = null;
let _cachePromise: Promise<DeviceCategoryItem[]> | null = null;

/**
 * Preload category images into the browser cache so they render instantly.
 * Works for both base64 data-URLs and remote URLs.
 */
export function preloadCategoryImages(cats: DeviceCategoryItem[]): void {
  if (typeof window === "undefined") return;
  for (const c of cats) {
    if (c.image) {
      const img = new window.Image();
      img.decoding = "async";
      img.src = c.image;
    }
  }
}

/**
 * Returns cached categories synchronously (or null if not yet loaded).
 * Useful for rendering immediately without an async delay.
 */
export function getCachedCategories(): DeviceCategoryItem[] | null {
  return _cache;
}

/**
 * Invalidate the in-memory cache (call after saving changes).
 */
export function invalidateCategoryCache(): void {
  _cache = null;
  _cachePromise = null;
}

/* ─── Public API ─────────────────────────────────────────────────── */

/**
 * Load device categories from Supabase (or localStorage fallback).
 * Results are cached in-memory — subsequent calls resolve instantly.
 */
export async function loadDeviceCategories(): Promise<DeviceCategoryItem[]> {
  // Return from cache instantly if available.
  if (_cache) return _cache;

  // Deduplicate in-flight requests.
  if (_cachePromise) return _cachePromise;

  _cachePromise = _loadDeviceCategoriesImpl();
  const result = await _cachePromise;
  _cache = result;
  // Preload images into browser cache as soon as data arrives.
  preloadCategoryImages(result);
  return result;
}

async function _loadDeviceCategoriesImpl(): Promise<DeviceCategoryItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    return loadFromLocalStorage();
  }

  try {
    const orgId = await getOrgId();
    if (!orgId) return loadFromLocalStorage();

    const { data, error } = await supabase
      .from("device_categories")
      .select("*")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      // Table might not exist yet or no data — fall back to localStorage,
      // but also try to seed the DB with defaults.
      const local = loadFromLocalStorage();
      // Attempt to seed (best-effort, ignore errors if table doesn't exist).
      await seedCategories(orgId, local).catch(() => {});
      return local;
    }

    return data.map((r: any) => ({
      id: r.id,
      label: r.label ?? r.id,
      image: r.image_url ?? undefined,
      sort_order: r.sort_order ?? 0,
    }));
  } catch {
    return loadFromLocalStorage();
  }
}

/**
 * Save the full category list to Supabase (or localStorage fallback).
 * This does a full replace (delete all + insert) to handle reordering/removal.
 */
export async function saveDeviceCategories(cats: DeviceCategoryItem[]): Promise<boolean> {
  // Invalidate in-memory cache so next load fetches fresh data.
  invalidateCategoryCache();
  // Always update localStorage as a cache.
  saveToLocalStorage(cats);

  if (!isSupabaseConfigured || !supabase) return true;

  try {
    const orgId = await getOrgId();
    if (!orgId) return true; // no auth — localStorage only

    // Delete existing rows for this org.
    await supabase
      .from("device_categories")
      .delete()
      .eq("organization_id", orgId);

    // Insert fresh set.
    const rows = cats.map((c, i) => ({
      id: c.id,
      organization_id: orgId,
      label: c.label,
      image_url: c.image ?? null,
      sort_order: i,
    }));

    const { error } = await supabase
      .from("device_categories")
      .insert(rows);

    if (error) {
      console.error("[DeviceCategories] Save failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[DeviceCategories] Save error:", e);
    return false;
  }
}

/**
 * Seed the DB with initial categories (called once when table is empty).
 */
async function seedCategories(orgId: string, cats: DeviceCategoryItem[]) {
  if (!supabase) return;
  const rows = cats.map((c, i) => ({
    id: c.id,
    organization_id: orgId,
    label: c.label,
    image_url: c.image ?? null,
    sort_order: i,
  }));
  await supabase.from("device_categories").insert(rows);
}
