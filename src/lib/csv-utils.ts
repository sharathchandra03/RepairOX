/**
 * Lightweight CSV utilities for the Device Catalog importer.
 *
 * No third-party dependency — a compact RFC-4180-ish parser that handles
 * quoted fields, escaped quotes ("") and embedded commas/newlines. Good
 * enough for catalog imports and keeps the bundle lean.
 */

import type { CatalogImportRow } from "./catalog-context";
import type {
  DeviceCategory, PriceListBrand, PriceListModel, DevicePart,
} from "./price-list-data";

/* ─── Expected columns ───────────────────────────────────────────── */

/** Canonical header keys the catalog understands, in template order. */
export const CATALOG_COLUMNS = [
  "Category", "Brand", "Model", "Year", "Variant", "Chip", "Storage",
  "Display Size", "Part Name", "SKU", "Price", "Warranty", "Availability", "Device Image",
] as const;

export const REQUIRED_COLUMNS = ["Category", "Brand", "Model"] as const;

/** Map a normalized header string to a CatalogImportRow key. */
const HEADER_MAP: Record<string, keyof CatalogImportRow> = {
  category: "category",
  brand: "brand",
  model: "model",
  "model name": "model",
  year: "year",
  "model year": "year",
  variant: "variant",
  chip: "chip",
  processor: "chip",
  storage: "storage",
  "display size": "displaySize",
  display: "displaySize",
  "part name": "partName",
  part: "partName",
  sku: "sku",
  "part number": "sku",
  "part number / sku": "sku",
  price: "price",
  "price (inr)": "price",
  warranty: "warranty",
  availability: "availability",
  stock: "availability",
  "device image": "deviceImage",
  image: "deviceImage",
  "image url": "deviceImage",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

/* ─── Parser ─────────────────────────────────────────────────────── */

/** Parse raw CSV text into an array of string-cell rows. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip BOM
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field); field = "";
      } else if (ch === "\n") {
        row.push(field); field = "";
        rows.push(row); row = [];
      } else if (ch === "\r") {
        // handled by \n; ignore lone CR
      } else {
        field += ch;
      }
    }
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty rows
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ParsedCatalogCSV {
  headers: string[];
  /** Headers present in the file that we don't recognize. */
  unknownHeaders: string[];
  /** Required headers that are missing from the file. */
  missingRequired: string[];
  rows: CatalogImportRow[];
  /** Original row index (1-based, excluding header) for each parsed row. */
  rowNumbers: number[];
}

/** Parse CSV text into typed catalog rows with header validation. */
export function parseCatalogCSV(text: string): ParsedCatalogCSV {
  const matrix = parseCSV(text);
  if (matrix.length === 0) {
    return { headers: [], unknownHeaders: [], missingRequired: [...REQUIRED_COLUMNS], rows: [], rowNumbers: [] };
  }

  const rawHeaders = matrix[0].map((h) => h.trim());
  const mappedKeys = rawHeaders.map((h) => HEADER_MAP[normalizeHeader(h)]);
  const unknownHeaders = rawHeaders.filter((h) => !HEADER_MAP[normalizeHeader(h)]);

  const presentKeys = new Set(mappedKeys.filter(Boolean));
  const missingRequired = REQUIRED_COLUMNS.filter((col) => {
    const key = HEADER_MAP[normalizeHeader(col)];
    return !presentKeys.has(key);
  });

  const rows: CatalogImportRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    const obj: CatalogImportRow = {};
    mappedKeys.forEach((key, idx) => {
      if (key) obj[key] = (cells[idx] ?? "").trim();
    });
    rows.push(obj);
    rowNumbers.push(r);
  }

  return { headers: rawHeaders, unknownHeaders, missingRequired, rows, rowNumbers };
}

/* ─── Row validation ─────────────────────────────────────────────── */

export type RowIssue = { level: "error" | "warning"; message: string };

export interface ValidatedRow {
  row: CatalogImportRow;
  rowNumber: number;
  issues: RowIssue[];
  duplicate: boolean;
}

const AVAILABILITY_VALUES = ["In Stock", "Limited", "Out of Stock"];

/** Validate parsed rows: required fields, numeric price, enum availability,
 *  and duplicate detection (same Category+Brand+Model+SKU within the file). */
export function validateRows(parsed: ParsedCatalogCSV): ValidatedRow[] {
  const seen = new Set<string>();

  return parsed.rows.map((row, i) => {
    const issues: RowIssue[] = [];

    if (!row.category?.trim()) issues.push({ level: "error", message: "Missing Category" });
    if (!row.brand?.trim()) issues.push({ level: "error", message: "Missing Brand" });
    if (!row.model?.trim()) issues.push({ level: "error", message: "Missing Model" });

    if (row.price && isNaN(parseFloat(row.price.replace(/[^0-9.]/g, "")))) {
      issues.push({ level: "error", message: `Invalid price "${row.price}"` });
    }
    if (row.availability?.trim() && !AVAILABILITY_VALUES.includes(row.availability.trim())) {
      issues.push({ level: "warning", message: `Unknown availability "${row.availability}" — defaults to In Stock` });
    }
    if (row.partName?.trim() && !row.price?.trim()) {
      issues.push({ level: "warning", message: "Part has no price — defaults to 0" });
    }

    const key = [row.category, row.brand, row.model, row.sku || row.partName || ""]
      .map((v) => (v ?? "").trim().toLowerCase()).join("|");
    const duplicate = seen.has(key);
    if (duplicate) issues.push({ level: "warning", message: "Duplicate row in file" });
    else seen.add(key);

    return { row, rowNumber: parsed.rowNumbers[i], issues, duplicate };
  });
}

/* ─── Serialization / export ─────────────────────────────────────── */

function escapeCell(v: string | number | undefined): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(headers: string[], rows: (string | number | undefined)[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  return lines.join("\n");
}

/** Trigger a client-side download of CSV text. */
export function downloadCSV(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  // Prepend a UTF-8 BOM so Excel detects the encoding and opens the sheet
  // left-to-right with correct characters (without it Excel may guess the
  // locale/direction and render columns reversed / RTL).
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Downloadable blank template with the canonical headers + one example row. */
export function catalogTemplateCSV(): string {
  const example = [
    "Laptop", "Apple", "MacBook Air M3", "2024", "Base", "Apple M3", "256GB",
    "13.6 inch", "Display Assembly", "661-28751", "18500", "3 Months", "In Stock", "",
  ];
  return toCSV([...CATALOG_COLUMNS], [example]);
}

/** Flatten the whole catalog into CSV rows (one row per part; models with no
 *  parts still get a row so the catalog round-trips). Shared by the Shop and
 *  Settings export actions. */
export function buildCatalogRows(
  categories: DeviceCategory[],
  brands: PriceListBrand[],
  models: PriceListModel[],
  parts: DevicePart[],
): (string | number | undefined)[][] {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const modelById = new Map(models.map((m) => [m.id, m]));

  const rows: (string | number | undefined)[][] = [];
  const rowFor = (model: PriceListModel, part?: DevicePart) => {
    const brand = brandById.get(model.brandId);
    const cat = catById.get(model.categoryId);
    return [
      cat?.name ?? "", brand?.name ?? "", model.name, model.year, model.variant ?? "",
      model.chip ?? "", model.storage ?? "", model.displaySize ?? "",
      part?.partName ?? "", part?.partNumber ?? "", part?.price ?? "",
      part?.warranty ?? "", part?.availability ?? "", model.imageUrl ? "(image set)" : "",
    ];
  };

  for (const part of parts) {
    const model = modelById.get(part.modelId);
    if (model) rows.push(rowFor(model, part));
  }
  for (const model of models) {
    if (!parts.some((p) => p.modelId === model.id)) rows.push(rowFor(model));
  }
  return rows;
}

/** Full catalog serialized to a CSV string with the canonical header row. */
export function catalogToCSV(
  categories: DeviceCategory[],
  brands: PriceListBrand[],
  models: PriceListModel[],
  parts: DevicePart[],
): string {
  return toCSV([...CATALOG_COLUMNS], buildCatalogRows(categories, brands, models, parts));
}
