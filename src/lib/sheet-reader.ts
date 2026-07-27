/**
 * Sheet reader — turns an uploaded file (.csv, .xlsx, .xls) into a raw string
 * matrix (rows of string cells). This is the single entry point the smart
 * importer uses, so the parser never needs to know the file format.
 */

import { parseCSV } from "./csv-utils";

// SheetJS is heavy, so it's loaded on demand (only when an Excel file is read)
// to keep the Price List page's initial bundle small.
async function loadXLSX() {
  return import("xlsx");
}

export type SheetMatrix = string[][];

export interface ReadSheetResult {
  /** Rows of string cells (numbers/dates stringified). */
  matrix: SheetMatrix;
  /** Sheet name (Excel) or file name stem (CSV). */
  sheetName: string;
  /** All sheet names in the workbook (Excel); single entry for CSV. */
  sheetNames: string[];
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim();
}

function isExcel(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm") ||
    file.type.includes("spreadsheetml") || file.type.includes("ms-excel");
}

/** Normalize a SheetJS array-of-arrays into a clean string matrix. */
function normalizeMatrix(aoa: unknown[][]): SheetMatrix {
  const matrix = aoa.map((row) =>
    (row ?? []).map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell).trim();
    })
  );
  // Drop fully-empty rows
  return matrix.filter((r) => r.some((c) => c !== ""));
}

/** Read a specific sheet (by name) from an Excel file into a matrix. */
export async function readSheetByName(file: File, sheetName: string): Promise<SheetMatrix> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  return normalizeMatrix(aoa);
}

/**
 * Read an uploaded file into a matrix. For Excel, the first non-empty sheet is
 * used by default; all sheet names are returned so the UI can offer a picker.
 */
export async function readSheet(file: File): Promise<ReadSheetResult> {
  if (isExcel(file)) {
    const XLSX = await loadXLSX();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetNames = wb.SheetNames.slice();
    // Pick the first sheet that has any data
    let chosen = sheetNames[0];
    for (const name of sheetNames) {
      const test = normalizeMatrix(
        XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: "" })
      );
      if (test.length > 0) { chosen = name; break; }
    }
    const ws = wb.Sheets[chosen];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
    return { matrix: normalizeMatrix(aoa), sheetName: chosen, sheetNames };
  }

  // CSV / plain text
  const text = await file.text();
  const matrix = parseCSV(text);
  return { matrix, sheetName: fileStem(file.name), sheetNames: [fileStem(file.name)] };
}
