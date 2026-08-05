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

let _atCounter = 100;

export function generateAssignedToId(): string {
  _atCounter += 1;
  return `AT-${String(_atCounter).padStart(4, "0")}`;
}

/* ─── Factory ────────────────────────────────────────────────────── */

export function createAssignedToOption(name: string): AssignedToOption {
  return {
    id: generateAssignedToId(),
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
