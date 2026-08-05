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

let _abCounter = 100;

export function generateAssignedById(): string {
  _abCounter += 1;
  return `AB-${String(_abCounter).padStart(4, "0")}`;
}

/* ─── Factory ────────────────────────────────────────────────────── */

export function createAssignedByOption(name: string): AssignedByOption {
  return {
    id: generateAssignedById(),
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
