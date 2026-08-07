/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Demo Workspace Mode

   Provides a fully isolated sandbox for demo/trial accounts. Demo users get:
     • Full access to every feature (nothing hidden/locked)
     • Realistic pre-seeded data (tickets, customers, invoices, etc.)
     • Complete interactivity (create, edit, delete)
     • Isolation from production data (separate localStorage namespace)
     • Sync among all demo users (they share the same demo namespace)

   How it works:
     1. A role is marked as "demo" by the Platform Owner
     2. When a demo user logs in, we detect their role and activate demo mode
     3. All localStorage reads/writes are transparently routed through a
        "repairox-demo-" prefix instead of "repairox-"
     4. On first activation, demo data is seeded from demo-seed-data.ts
     5. Platform Owner can reset demo data at any time

   This module provides:
     • Demo role detection
     • localStorage namespace proxy
     • Seed/reset orchestration
     • State flag for UI (banners, indicators)
   ────────────────────────────────────────────────────────────────────────── */

/* ── Demo role tracking ──────────────────────────────────────────────────
   Stored under the PRODUCTION namespace so it persists across demo resets. */
const DEMO_ROLES_KEY = "repairox-demo-roles";
const DEMO_SEEDED_KEY = "repairox-demo-seeded";

/** Get the list of role IDs that are marked as demo. */
export function getDemoRoleIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_ROLES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Set the list of demo role IDs. */
export function setDemoRoleIds(roleIds: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEMO_ROLES_KEY, JSON.stringify(roleIds));
  } catch { /* ignore */ }
}

/** Add a role to the demo list. */
export function addDemoRole(roleId: string): void {
  const current = getDemoRoleIds();
  if (!current.includes(roleId)) {
    setDemoRoleIds([...current, roleId]);
  }
}

/** Remove a role from the demo list. */
export function removeDemoRole(roleId: string): void {
  setDemoRoleIds(getDemoRoleIds().filter((id) => id !== roleId));
}

/** Check if a role is marked as demo. */
export function isDemoRole(roleId: string): boolean {
  return getDemoRoleIds().includes(roleId);
}

/* ── Namespace isolation ─────────────────────────────────────────────────
   Demo mode works by intercepting all localStorage operations for keys
   that start with "repairox-". When demo mode is active, these keys are
   transparently prefixed to "repairox-demo-*" so demo data lives in a
   completely separate namespace.

   The approach: we provide wrapped getItem/setItem/removeItem functions
   that the app uses. The permissions-context detects demo mode and passes
   the flag to all data modules. */

const PRODUCTION_PREFIX = "repairox-";
const DEMO_PREFIX = "repairox-demo-data-";

/** Transform a storage key for demo mode. Only transforms repairox-* keys. */
export function demoKey(key: string): string {
  if (key.startsWith(PRODUCTION_PREFIX) && !key.startsWith("repairox-demo-")) {
    // repairox-access → repairox-demo-data-access
    return DEMO_PREFIX + key.slice(PRODUCTION_PREFIX.length);
  }
  return key;
}

/** Get item from localStorage, respecting demo namespace. */
export function demoGetItem(key: string, isDemo: boolean): string | null {
  if (typeof window === "undefined") return null;
  const resolvedKey = isDemo ? demoKey(key) : key;
  try {
    return localStorage.getItem(resolvedKey);
  } catch {
    return null;
  }
}

/** Set item in localStorage, respecting demo namespace. */
export function demoSetItem(key: string, value: string, isDemo: boolean): void {
  if (typeof window === "undefined") return;
  const resolvedKey = isDemo ? demoKey(key) : key;
  try {
    localStorage.setItem(resolvedKey, value);
  } catch { /* storage full */ }
}

/** Remove item from localStorage, respecting demo namespace. */
export function demoRemoveItem(key: string, isDemo: boolean): void {
  if (typeof window === "undefined") return;
  const resolvedKey = isDemo ? demoKey(key) : key;
  try {
    localStorage.removeItem(resolvedKey);
  } catch { /* ignore */ }
}

/* ── Seed status ─────────────────────────────────────────────────────── */

/** Check if demo data has been seeded. */
export function isDemoSeeded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DEMO_SEEDED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Mark demo data as seeded. */
export function markDemoSeeded(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEMO_SEEDED_KEY, "true");
  } catch { /* ignore */ }
}

/** Clear the seeded flag (forces re-seed on next demo login). */
export function clearDemoSeededFlag(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DEMO_SEEDED_KEY);
  } catch { /* ignore */ }
}

/* ── Reset demo data ─────────────────────────────────────────────────── */

/** Completely wipe all demo namespace data and re-seed. */
export function resetDemoData(): void {
  if (typeof window === "undefined") return;
  // Remove all keys that start with the demo prefix
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(DEMO_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  // Clear the seeded flag so it re-seeds on next load
  clearDemoSeededFlag();
}

/* ── All demo storage keys (for inspecting/debugging) ─────────────────── */

/** List all keys currently in the demo namespace. */
export function listDemoKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(DEMO_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}
