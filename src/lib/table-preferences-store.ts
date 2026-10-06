"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — PERSONAL TABLE LAYOUT persistence (dual-mode: DB + localStorage)
   ────────────────────────────────────────────────────────────────────────
   One tiny shared layer behind the per-user table-layout hooks (useColumnOrder,
   useFrozenColumns). A table's column ORDER and FROZEN selection are PERSONAL,
   per-user preferences.

     • Supabase mode  → the `user_table_preferences` row (per user, per table) is
       the SOURCE OF TRUTH, so the layout follows the user across browsers and
       devices and survives a browser-data wipe. localStorage is kept as a fast
       cache (instant paint on reload, offline fallback).
     • Local mode     → localStorage is the home (unchanged legacy behaviour).

   Reads are server-first (fall back to cache); writes update the cache
   immediately and debounce the server write. One row per (user, table) stores
   BOTH column_order and frozen_columns, so each hook writes only its own field
   via a partial POST (never clobbering the other).
   ────────────────────────────────────────────────────────────────────────── */

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/** The two layout fields persisted per (user, table). */
export type TablePrefField = "columnOrder" | "frozenColumns";

/* ── localStorage cache (also the authoritative home in local mode) ───────── */

function cacheKey(storagePrefix: string, tableKey: string, userId: string | null | undefined): string {
  return `${storagePrefix}${tableKey}::${userId ?? "anon"}`;
}

export function readLocal(
  storagePrefix: string,
  tableKey: string,
  userId: string | null | undefined,
): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(storagePrefix, tableKey, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : null;
  } catch {
    return null;
  }
}

export function writeLocal(
  storagePrefix: string,
  tableKey: string,
  userId: string | null | undefined,
  keys: string[] | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const k = cacheKey(storagePrefix, tableKey, userId);
    if (keys === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, JSON.stringify(keys));
  } catch {
    /* quota / unavailable */
  }
}

/* ── Server persistence (Supabase mode only) ──────────────────────────────── */

async function authToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Load ONE field for a table from the server. Returns:
 *   • string[]   → the saved value
 *   • null       → authenticated but no saved value (use canonical default)
 *   • undefined  → could not load (no session / network / local mode) so the
 *                  caller should fall back to the localStorage cache. */
export async function loadServerPref(
  tableKey: string,
  field: TablePrefField,
): Promise<string[] | null | undefined> {
  const token = await authToken();
  if (!token) return undefined;
  try {
    const res = await fetch(`/api/table-preferences?table=${encodeURIComponent(tableKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    const value = field === "columnOrder" ? json?.columnOrder : json?.frozenColumns;
    if (value === null || value === undefined) return null;
    return Array.isArray(value) ? value.filter((v: unknown) => typeof v === "string") : null;
  } catch {
    return undefined;
  }
}

/** Save ONE field for a table to the server (partial — never touches the other
 *  field). Best-effort: on failure the localStorage cache still holds the
 *  latest copy and the UI keeps the current layout. Returns success. */
export async function saveServerPref(
  tableKey: string,
  field: TablePrefField,
  keys: string[] | null,
): Promise<boolean> {
  const token = await authToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/table-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tableKey, [field]: keys }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { isSupabaseConfigured };
