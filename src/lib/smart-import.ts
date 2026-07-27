/**
 * Generic repair-pricing sheet parser.
 *
 * Given a raw string matrix (from any CSV/Excel sheet) it intelligently splits
 * columns into DEVICE METADATA (→ Hero Card) and REPAIR PARTS (→ Parts table),
 * without hardcoding any device, brand or part name. Each data row becomes a
 * device model; every non-metadata column becomes a priced repair part on that
 * model. Parts are further classified into a repair category by vocabulary.
 *
 * The heuristics are intentionally domain-general:
 *   1. Find the header row.
 *   2. Pick the "model name" column (unique descriptive text, usually first).
 *   3. Classify remaining columns: metadata (by header vocabulary or by being
 *      descriptive text) vs repair part (priced / everything else).
 *   4. Build models + parts, classifying each part's repair category.
 */

import type { SheetMatrix } from "./sheet-reader";

/* ─── Output shapes ──────────────────────────────────────────────── */

export interface SmartPart {
  name: string;
  repairCategory: string;
  price: number;
  /** False when the sheet had the part column but no price for this model. */
  priceKnown: boolean;
  /** Original column header, kept for traceability. */
  sourceColumn: string;
}

export interface SmartModel {
  name: string;
  category?: string;
  brand?: string;
  year?: number;
  chip?: string;
  storage?: string;
  ram?: string;
  displaySize?: string;
  variant?: string;
  status?: string;
  /** Any additional descriptive metadata (Series, Generation, Colour, …). */
  meta: Record<string, string>;
  parts: SmartPart[];
}

export interface ColumnPlan {
  header: string;
  role: "model" | "metadata" | "part" | "ignore";
  /** Canonical metadata field when role === "metadata" (else undefined). */
  field?: CanonicalField;
}

export interface SmartImportResult {
  models: SmartModel[];
  columns: ColumnPlan[];
  modelNameColumn: string | null;
  metadataColumns: string[];
  partColumns: string[];
  headerRowIndex: number;
  warnings: string[];
}

type CanonicalField =
  | "brand" | "category" | "year" | "chip" | "storage" | "ram"
  | "displaySize" | "variant" | "status";

/* ─── Header vocabulary (whole-header matches only) ──────────────── */
// Whole-header matching prevents part columns that merely CONTAIN a metadata
// word (e.g. "RF DISPLAY", "INTERNAL DISPLAY") from being mistaken for the
// "Display Size" metadata field.

const CANONICAL_MATCHERS: { field: CanonicalField; test: RegExp }[] = [
  { field: "brand", test: /^(brand|make|manufacturer)$/ },
  { field: "category", test: /^(category|device category|type|device type|product type)$/ },
  { field: "year", test: /^(year|model year|release year|release|launch year)$/ },
  { field: "chip", test: /^(chip|chipset|processor|cpu|soc|apu)$/ },
  { field: "storage", test: /^(storage|capacity|rom|ssd|hdd|disk|drive)$/ },
  { field: "ram", test: /^(ram|memory)$/ },
  { field: "displaySize", test: /^(display size|screen size|screen|size|diagonal|panel size)$/ },
  { field: "variant", test: /^(variant|grade|edition|trim|tier)$/ },
  { field: "status", test: /^(status|state|availability status)$/ },
];

// Generic descriptive metadata headers (kept in `meta`, not a canonical field).
const GENERIC_META_TEST = /^(series|generation|gen|colou?r|sku|code|region|market|created|created date|created on|updated|updated date|updated on|updated by|modified|date|notes|note|remarks|description|os|operating system|network|connectivity)$/;

// Headers that identify the device (model-name column) by vocabulary.
const MODEL_NAME_TEST = /^(model|model name|model no\.?|model number|device|device name|name|product|product name)$/;

/* ─── Repair-category vocabulary ─────────────────────────────────── */
// Ordered: more specific rules first. Uses general repair vocabulary — this is
// classification knowledge, not per-sheet hardcoding.

const REPAIR_CATEGORY_RULES: { category: string; test: RegExp }[] = [
  { category: "Biometrics", test: /face\s*id|touch\s*id|fingerprint|biometric/i },
  { category: "Sensor", test: /sensor|proximity|gyroscope|accelerometer|ambient/i },
  { category: "Camera", test: /camera|cam\b|lens|flash\b/i },
  { category: "Glass", test: /glass/i },
  { category: "Display", test: /display|oled|lcd|screen|panel|retina|flexgate|digitizer|touch\b|assembly|oem|premium|incell|in-cell/i },
  { category: "Battery", test: /batter/i },
  { category: "Keyboard", test: /keyboard|keypad|track\s*pad|trackpad|touchpad/i },
  { category: "Audio", test: /speaker|receiver|microphone|\bmic\b|earpiece|loudspeaker|buzzer|ringer|audio/i },
  { category: "Charging", test: /charg|dock|\bport\b|connector|\busb\b|type-?c|magsafe|jack/i },
  { category: "Buttons", test: /button|\bkey\b|on\/?off|power|volume|\bvol\b|home\b|switch|mute/i },
  { category: "Cooling", test: /\bfan\b|heat|thermal|cooling|heatsink/i },
  { category: "Motherboard", test: /motherboard|logic\s*board|main\s*board|\bboard\b|\bic\b|nand|cpu|gpu/i },
  { category: "Housing", test: /housing|frame|top\s*case|topcase|bottom|rubber|screw|bezel|hinge|chassis|cover|case|back\s*door|mid\s*frame/i },
  { category: "Accessories", test: /cable|adapter|adaptor|sim|tray|\bpen\b|stylus|pencil|charger|antenna|flex\b/i },
];

export function classifyRepairCategory(partName: string): string {
  const n = partName.trim();
  for (const rule of REPAIR_CATEGORY_RULES) {
    if (rule.test.test(n)) return rule.category;
  }
  return "General";
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ").replace(/[._]+/g, " ").trim();
}

/** Parse a price-ish cell → number, or NaN if there's no numeric content. */
export function parsePrice(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!/\d/.test(cleaned)) return NaN;
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\w\S*/g, (w) =>
    w.length <= 3 && w === w.toUpperCase() ? w /* keep acronyms like OEM, RAM, RF */
      : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}

interface ColStats {
  nonEmpty: number;
  numeric: number;
  distinct: number;
  numericFraction: number;
  uniqueness: number;
}

function columnStats(values: string[]): ColStats {
  const nonEmptyVals = values.filter((v) => v.trim() !== "");
  const numeric = nonEmptyVals.filter((v) => !isNaN(parsePrice(v))).length;
  const distinct = new Set(nonEmptyVals.map((v) => v.toLowerCase())).size;
  const nonEmpty = nonEmptyVals.length;
  return {
    nonEmpty,
    numeric,
    distinct,
    numericFraction: nonEmpty ? numeric / nonEmpty : 0,
    uniqueness: nonEmpty ? distinct / nonEmpty : 0,
  };
}

/* ─── Header-row detection ───────────────────────────────────────── */
// The header row is the first row whose cells are mostly non-numeric text and
// that has the most filled cells among the first few rows.

function detectHeaderRow(matrix: SheetMatrix): number {
  const limit = Math.min(matrix.length, 8);
  let best = 0;
  let bestScore = -Infinity;
  for (let r = 0; r < limit; r++) {
    const row = matrix[r];
    const filled = row.filter((c) => c.trim() !== "").length;
    if (filled < 2) continue;
    const numeric = row.filter((c) => c.trim() !== "" && !isNaN(parsePrice(c))).length;
    const textRatio = 1 - numeric / filled;
    // Prefer rows with many filled, mostly-text cells, appearing early.
    const score = filled * 2 + textRatio * 6 - r * 1.5;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

/* ─── Model-name column detection ────────────────────────────────── */

function pickModelNameColumn(headers: string[], colValues: string[][]): number {
  let best = -1;
  let bestScore = -Infinity;
  headers.forEach((header, i) => {
    const stats = columnStats(colValues[i]);
    // A price/numeric column can't be the model name.
    if (stats.nonEmpty === 0) return;
    let score = 0;
    if (MODEL_NAME_TEST.test(normHeader(header))) score += 100;
    if (i === 0) score += 45;
    score += stats.numericFraction > 0.3 ? -120 : 25;
    score += stats.uniqueness * 35;
    score += (stats.nonEmpty / Math.max(1, colValues[i].length)) * 10;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/* ─── Main parser ────────────────────────────────────────────────── */

export function parseSmartSheet(matrix: SheetMatrix): SmartImportResult {
  const warnings: string[] = [];
  if (!matrix || matrix.length === 0) {
    return { models: [], columns: [], modelNameColumn: null, metadataColumns: [], partColumns: [], headerRowIndex: 0, warnings: ["The file is empty."] };
  }

  const headerRowIndex = detectHeaderRow(matrix);
  const rawHeaders = matrix[headerRowIndex].map((h) => h.trim());
  // Name any blank headers so every column is addressable.
  const headers = rawHeaders.map((h, i) => (h === "" ? `Column ${i + 1}` : h));
  const dataRows = matrix.slice(headerRowIndex + 1);

  // Column-major values for analysis.
  const colValues: string[][] = headers.map((_, i) => dataRows.map((r) => r[i] ?? ""));

  const modelIdx = pickModelNameColumn(headers, colValues);
  if (modelIdx < 0) warnings.push("Could not detect a model-name column; using the first column.");
  const modelColumn = modelIdx >= 0 ? modelIdx : 0;

  // Classify every column. In a repair pricing sheet, any column that isn't the
  // model name and isn't recognised metadata is a REPAIR PART — even if it has
  // no prices (those become "N/A" rows rather than being dropped). Only stray
  // blank columns (no header AND no values) are ignored.
  const blankHeader = rawHeaders.map((h) => h.trim() === "");
  const columns: ColumnPlan[] = headers.map((header, i) => {
    if (i === modelColumn) return { header, role: "model" as const };
    const allEmpty = colValues[i].every((v) => v.trim() === "");
    if (blankHeader[i] && allEmpty) return { header, role: "ignore" as const };

    const nh = normHeader(header);
    const canonical = CANONICAL_MATCHERS.find((m) => m.test.test(nh));
    if (canonical) return { header, role: "metadata" as const, field: canonical.field };
    if (GENERIC_META_TEST.test(nh)) return { header, role: "metadata" as const };

    return { header, role: "part" as const };
  });

  const metaPlans = columns.filter((c) => c.role === "metadata");
  const partPlans = columns.filter((c) => c.role === "part");
  if (partPlans.length === 0) warnings.push("No repair-part columns were detected.");

  const headerIndex = new Map(headers.map((h, i) => [h, i]));

  const models: SmartModel[] = [];
  for (const row of dataRows) {
    const name = (row[modelColumn] ?? "").trim();
    if (!name) continue;

    const model: SmartModel = { name: titleCase(name), meta: {}, parts: [] };

    for (const plan of metaPlans) {
      const idx = headerIndex.get(plan.header)!;
      const value = (row[idx] ?? "").trim();
      if (!value) continue;
      switch (plan.field) {
        case "brand": model.brand = value; break;
        case "category": model.category = value; break;
        case "year": { const y = parseInt(value.replace(/[^0-9]/g, ""), 10); if (!isNaN(y)) model.year = y; else model.meta[plan.header] = value; break; }
        case "chip": model.chip = value; break;
        case "storage": model.storage = value; break;
        case "ram": model.ram = value; break;
        case "displaySize": model.displaySize = value; break;
        case "variant": model.variant = value; break;
        case "status": model.status = value; break;
        default: model.meta[titleCase(plan.header)] = value;
      }
    }

    for (const plan of partPlans) {
      const idx = headerIndex.get(plan.header)!;
      const price = parsePrice((row[idx] ?? "").trim());
      const priceKnown = !isNaN(price) && price > 0;
      // Keep the part row even when there's no price — it becomes an "N/A" row.
      model.parts.push({
        name: titleCase(plan.header),
        repairCategory: classifyRepairCategory(plan.header),
        price: priceKnown ? price : 0,
        priceKnown,
        sourceColumn: plan.header,
      });
    }

    models.push(model);
  }

  if (models.length === 0) warnings.push("No device rows were found under the header.");

  return {
    models,
    columns,
    modelNameColumn: headers[modelColumn] ?? null,
    metadataColumns: metaPlans.map((c) => c.header),
    partColumns: partPlans.map((c) => c.header),
    headerRowIndex,
    warnings,
  };
}
