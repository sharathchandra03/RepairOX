/* ─── Assigned By Master List ─────────────────────────────────────────
   Central master list for the "Assigned By" field in ticket creation.
   Follows the same pattern as brand-model-data.ts.
   ─────────────────────────────────────────────────────────────────────── */

export type AssignedByOption = {
  id: string;
  name: string;
  createdAt: string;
};

/* ─── ID Generation ──────────────────────────────────────────────── */

/**
 * Generate the next sequential id for an Assigned By entry, e.g. "AB-0101".
 *
 * The id is derived from the ids already in use so it stays short and readable
 * while remaining unique. We scan the existing options for the highest
 * "AB-<number>" value and return the next one. (The previous counter reset to
 * 100 on every page load, which produced repeat ids that collided in the DB
 * with a unique-constraint error — Postgres 23505. Basing the next number on
 * the live list avoids that.) Non-numeric legacy ids are ignored when finding
 * the max, and we start at 101 so the first entry is "AB-0101".
 *
 * @param existing The current Assigned By options (from the store).
 */
export function generateAssignedById(existing: AssignedByOption[] = []): string {
  let max = 100;
  for (const o of existing) {
    const m = /^AB-(\d+)$/.exec(o.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `AB-${String(max + 1).padStart(4, "0")}`;
}

/* ─── Factory ────────────────────────────────────────────────────── */

/**
 * Create an Assigned By option. Pass the current options so the new id is the
 * next sequential "AB-####" and never collides with an existing row.
 */
export function createAssignedByOption(name: string, existing: AssignedByOption[] = []): AssignedByOption {
  return {
    id: generateAssignedById(existing),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
}

/* ─── Search ─────────────────────────────────────────────────────── */

export function searchAssignedByOptions(options: AssignedByOption[], query: string): AssignedByOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.name.toLowerCase().includes(q));
}

/* ─── Seed Data (empty — user adds fresh) ────────────────────────── */

export const SEED_ASSIGNED_BY_OPTIONS: AssignedByOption[] = [];
