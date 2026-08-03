/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Shared mock scaffolding for preview modules
   ──────────────────────────────────────────────────────────────────────────
   Sales Management and Field Management don't have a real reporting engine
   yet, so their Comparison / Builder / Saved screens can't call
   applyFilters/runCustomReport/saveReport like Shop does. To let the backend
   team review (and later wire) the complete UI/UX flow, this file provides:

     • A tiny deterministic "mock RNG" so switching between periods/entities
       in the preview visibly changes the numbers (instead of everything
       looking frozen), while staying stable across re-renders.
     • Generic types describing a "mock data source" (fields, groupings,
       metrics, and small sample series) that the Builder preview reads from.
     • A generic mock-row generator for the Builder's "detail table" mode.

   NONE of this is real business logic — it exists purely so the UI has
   something plausible to render. Replace it by following the wiring notes in
   `sales/mock-data.ts` and `field/mock-data.ts`.
   ────────────────────────────────────────────────────────────────────────── */

import type { KpiFormat, SeriesPoint } from "@/lib/reports/types";

/* ─── Deterministic pseudo-random scaling (stable per seed string) ──────── */

function seedNumber(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Returns a stable multiplier in [0.55, 1.45] for a given seed, so the same
 *  seed always renders the same mock numbers (no flicker on re-render) but
 *  different seeds (different period/entity) look visibly different. */
export function mockFactor(seed: string): number {
  const h = seedNumber(seed);
  return 0.55 + (h % 900) / 1000;
}

/** Scale a base metric map by a seed-derived factor — the mock equivalent of
 *  "recompute this metric for a different period/entity". */
export function mockMetrics<K extends string>(base: Record<K, number>, seed: string): Record<K, number> {
  const factor = mockFactor(seed);
  const out = {} as Record<K, number>;
  for (const key of Object.keys(base) as K[]) {
    out[key] = Math.round(base[key] * factor);
  }
  return out;
}

/* ─── Mock data-source definitions (for the Builder preview) ────────────── */

export interface MockFieldDef {
  key: string;
  label: string;
  kind: "text" | "number" | "currency" | "date" | "status";
}

export interface MockGroupDef {
  key: string;
  label: string;
}

export interface MockMetricDef {
  key: string;
  label: string;
}

export interface MockDataSourceDef {
  id: string;
  label: string;
  fields: MockFieldDef[];
  groupBy: MockGroupDef[];
  metrics: MockMetricDef[];
  /** Precomputed sample series per group-by key, e.g. { stage: [...] }. */
  groupSamples: Record<string, SeriesPoint[]>;
}

const STATUS_SAMPLES = ["Active", "Pending", "Completed", "In Progress", "On Hold"];

/** Generic filler for the Builder's detail-table mode when no precomputed
 *  sample rows exist for a source — deterministic, so it doesn't jump around
 *  on every render, and varied enough by field kind to look believable. */
export function generateMockRows(fields: MockFieldDef[], count = 6): (string | number)[][] {
  return Array.from({ length: count }, (_, row) =>
    fields.map((f, col) => {
      const seed = seedNumber(`${f.key}-${row}-${col}`);
      switch (f.kind) {
        case "currency":
          return 5000 + (seed % 40) * 1500;
        case "number":
          return 1 + (seed % 25);
        case "date": {
          const d = new Date();
          d.setDate(d.getDate() - (seed % 28));
          return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        }
        case "status":
          return STATUS_SAMPLES[seed % STATUS_SAMPLES.length];
        case "text":
        default:
          return `${f.label} ${row + 1}`;
      }
    })
  );
}

export type { KpiFormat, SeriesPoint };
