"use client";

/**
 * Origin-aware Settings navigation.
 *
 * When a module (Price List, Tickets, Invoice, …) opens a Settings page, it
 * records where the user came from so the Settings screen can offer an accurate
 * "← Back to <Module>" action instead of always dumping the user on the Shop
 * dashboard.
 *
 * Two layers work together:
 *  1. A `from` query param on the Settings URL — survives full reloads and
 *     direct linking, and is the canonical source of truth for the origin.
 *  2. A sessionStorage record keyed by origin — carries richer return context
 *     (the exact URL, including selection/search state) that can't live in a
 *     short query param cleanly.
 *
 * If the user navigates between several Settings sections after arriving, the
 * `from` param is preserved (see readOrigin/withOrigin) so Back still returns
 * to the originating module rather than an unrelated Settings page.
 */

export type SettingsOriginKey =
  | "price-list"
  | "tickets"
  | "invoice"
  | string;

export type SettingsOrigin = {
  /** Stable module key, e.g. "price-list". */
  key: SettingsOriginKey;
  /** Human label shown in the Back button, e.g. "Price List". */
  label: string;
  /** Full return URL including any preserved context (selection/search). */
  returnTo: string;
};

const STORAGE_PREFIX = "repairox:settings-origin:";

/** Persist the rich return context for an origin key. */
export function rememberOrigin(origin: SettingsOrigin) {
  try {
    sessionStorage.setItem(
      STORAGE_PREFIX + origin.key,
      JSON.stringify({ label: origin.label, returnTo: origin.returnTo }),
    );
  } catch {
    /* sessionStorage unavailable — the `from` param still carries the key. */
  }
}

/** Read the stored return context for an origin key, if any. */
export function recallOrigin(key: string): { label: string; returnTo: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { label?: string; returnTo?: string };
    if (!parsed?.returnTo) return null;
    return { label: parsed.label ?? defaultLabel(key), returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}

/** Fallback labels/routes for known modules when no session record exists. */
const KNOWN: Record<string, { label: string; returnTo: string }> = {
  "price-list": { label: "Price List", returnTo: "/price-list" },
  tickets: { label: "Tickets", returnTo: "/tickets" },
  invoice: { label: "Invoice", returnTo: "/invoice" },
};

function defaultLabel(key: string): string {
  return KNOWN[key]?.label ?? "back";
}

/**
 * Resolve the origin from a `from` key: prefer the rich session record, then
 * fall back to a sensible known default. Returns null when there's no origin.
 */
export function resolveOrigin(fromKey: string | null | undefined): SettingsOrigin | null {
  if (!fromKey) return null;
  const stored = recallOrigin(fromKey);
  if (stored) return { key: fromKey, label: stored.label, returnTo: stored.returnTo };
  const known = KNOWN[fromKey];
  if (known) return { key: fromKey, label: known.label, returnTo: known.returnTo };
  return null;
}

/**
 * Append (or preserve) the `from` origin key on a Settings-internal href so
 * navigating between Settings tabs/sections keeps the originating module.
 */
export function withOrigin(href: string, fromKey: string | null | undefined): string {
  if (!fromKey) return href;
  const [path, hash] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  const withParam = `${path}${sep}from=${encodeURIComponent(fromKey)}`;
  return hash ? `${withParam}#${hash}` : withParam;
}
