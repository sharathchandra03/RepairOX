/* ─── Assigned To Master List ─────────────────────────────────────────
   Central master list for the "Assigned To" field in ticket creation.
   Stores technician names. Same pattern as brand-model-data.ts.
   Users add entries fresh — no seed data.
   ─────────────────────────────────────────────────────────────────────── */

export type AssignedToOption = {
  id: string;
  name: string;
  createdAt: string;
};

/* ─── ID Generation ──────────────────────────────────────────────── */

/**
 * Generate the next sequential id for an Assigned To entry, e.g. "AT-0101".
 *
 * The id is derived from the ids already in use so it stays short and readable
 * while remaining unique. We scan the existing options for the highest
 * "AT-<number>" value and return the next one. (The previous counter reset to
 * 100 on every page load, which produced repeat ids that collided in the DB
 * with a unique-constraint error — Postgres 23505. Basing the next number on
 * the live list avoids that.) Non-numeric legacy ids are ignored when finding
 * the max, and we start at 101 so the first entry is "AT-0101".
 *
 * @param existing The current Assigned To options (from the store).
 */
export function generateAssignedToId(existing: AssignedToOption[] = []): string {
  let max = 100;
  for (const o of existing) {
    const m = /^AT-(\d+)$/.exec(o.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `AT-${String(max + 1).padStart(4, "0")}`;
}

/* ─── Factory ────────────────────────────────────────────────────── */

/**
 * Create an Assigned To option. Pass the current options so the new id is the
 * next sequential "AT-####" and never collides with an existing row.
 */
export function createAssignedToOption(name: string, existing: AssignedToOption[] = []): AssignedToOption {
  return {
    id: generateAssignedToId(existing),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
}

/* ─── Search ─────────────────────────────────────────────────────── */

export function searchAssignedToOptions(options: AssignedToOption[], query: string): AssignedToOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.name.toLowerCase().includes(q));
}

/* ─── Seed Data (empty — user adds fresh) ────────────────────────── */

export const SEED_ASSIGNED_TO_OPTIONS: AssignedToOption[] = [];
