/* Stock Transfer — bulk template, upload parsing, destination matching and FIFO price.
   Pure helpers (no React) so the dialog stays thin. Template downloads are Excel-only
   and uploads accept Excel + CSV via readSpreadsheetFileToCSV (spreadsheet standard). */
import { parseCSV, downloadXLSX } from "@/lib/csv-utils";
import type { StockLayerLike } from "@/lib/inventory-costing";

export const TRANSFER_TEMPLATE_HEADERS = ["Item ID", "Item Name", "Current Quantity", "Transfer Quantity", "Comment"];

type ItemLike = { id: string; name: string; store: string; currentStock: number; uom?: string; itemCode?: string; barcode?: string; active?: boolean };

/** Download the Excel template. When a source store is known its items are pre-filled
 *  (Transfer Quantity left blank) so the user only types quantities. */
export async function downloadTransferTemplate(fromStore: string, items: ItemLike[]): Promise<void> {
  const rows: (string | number)[][] = items.length > 0
    ? items.map((i) => [i.id, i.name, i.currentStock, "", ""])
    : [["PRT-000001", "Example: iPhone 13 Display", 25, 5, "Optional note for this line"]];
  await downloadXLSX(
    `stock-transfer-template${fromStore ? `-${fromStore.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : ""}`,
    TRANSFER_TEMPLATE_HEADERS, rows, "Stock Transfer",
  );
}

export type SheetRow = { itemId: string; name: string; qty: number; comment: string; row: number };

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, " ");

/** Read the template back. Rows with a blank / 0 quantity are skipped (a pre-filled template has many). */
export function parseTransferSheet(csv: string): { rows: SheetRow[]; issues: string[] } {
  const matrix = parseCSV(csv);
  const issues: string[] = [];
  const hi = matrix.findIndex((r) => r.some((c) => ["item id", "sku", "item code"].includes(norm(c))) || r.some((c) => norm(c) === "item name"));
  if (hi < 0) return { rows: [], issues: ["Couldn't find the header row. Use the downloaded template (Item ID, Item Name, Transfer Quantity, Comment)."] };
  const head = matrix[hi].map(norm);
  const find = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const cId = find("item id", "sku", "item code");
  const cName = find("item name", "name");
  const cQty = find("transfer quantity", "transfer qty", "qty", "quantity");
  const cNote = find("comment", "comments", "note", "notes");
  if (cQty < 0) return { rows: [], issues: ["The sheet has no “Transfer Quantity” column."] };
  if (cId < 0 && cName < 0) return { rows: [], issues: ["The sheet needs an “Item ID” or “Item Name” column."] };
  const rows: SheetRow[] = [];
  for (let r = hi + 1; r < matrix.length; r++) {
    const line = matrix[r];
    const rawQty = (line[cQty] ?? "").toString().replace(/,/g, "").trim();
    if (rawQty === "" || Number(rawQty) === 0) continue;
    const itemId = cId >= 0 ? (line[cId] ?? "").trim() : "";
    const name = cName >= 0 ? (line[cName] ?? "").trim() : "";
    const qty = Number(rawQty);
    if (!itemId && !name) { issues.push(`Row ${r + 1}: no Item ID or Item Name.`); continue; }
    if (!Number.isInteger(qty) || qty < 0) { issues.push(`Row ${r + 1} (${itemId || name}): quantity “${rawQty}” must be a whole number above 0.`); continue; }
    rows.push({ itemId, name, qty, comment: cNote >= 0 ? (line[cNote] ?? "").trim() : "", row: r + 1 });
  }
  if (rows.length === 0 && issues.length === 0) issues.push("No rows with a Transfer Quantity were found.");
  return { rows, issues };
}

/** Find a sheet row's item among the source store's items (Item ID first, then name). */
export function findSourceItem<T extends ItemLike>(items: T[], r: { itemId: string; name: string }): T | undefined {
  const id = r.itemId.trim().toLowerCase();
  const nm = r.name.trim().toLowerCase();
  const byCode = id ? items.find((i) => i.id.toLowerCase() === id || (i.itemCode ?? "").toLowerCase() === id || (i.barcode ?? "").toLowerCase() === id) : undefined;
  return byCode ?? (nm ? items.find((i) => i.name.trim().toLowerCase() === nm) : undefined);
}

/** The same product in the destination store: item code / barcode, then name. */
export function matchDestinationItem<T extends ItemLike>(src: ItemLike, destItems: T[]): T | undefined {
  const keys = [src.itemCode, src.barcode].filter((k): k is string => !!k).map((k) => k.toLowerCase());
  return (keys.length ? destItems.find((d) => keys.includes((d.itemCode ?? "").toLowerCase()) || keys.includes((d.barcode ?? "").toLowerCase())) : undefined)
    ?? destItems.find((d) => d.name.trim().toLowerCase() === src.name.trim().toLowerCase());
}

/** Estimated FIFO unit cost of the next `qty` units: the units on hand are the newest receipts,
 *  and FIFO issues the oldest of those first. Falls back to `fallback` with no ledger. */
export function fifoUnitCost(itemId: string, qty: number, onHand: number, layers: readonly StockLayerLike[], fallback: number): number {
  const mine = layers.filter((l) => l.item_id === itemId && l.qty_in > 0).sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? ""));
  if (mine.length === 0 || qty <= 0) return fallback;
  const stack: { qty: number; cost: number }[] = [];
  let left = Math.max(onHand, 0);
  for (const l of mine) {
    if (left <= 0) break;
    const take = Math.min(l.qty_in, left);
    stack.push({ qty: take, cost: l.unit_cost });
    left -= take;
  }
  if (stack.length === 0) return fallback;
  stack.reverse(); // oldest first
  let need = qty, total = 0, got = 0;
  for (const s of stack) {
    if (need <= 0) break;
    const take = Math.min(s.qty, need);
    total += take * s.cost; got += take; need -= take;
  }
  return got > 0 ? total / got : fallback;
}
