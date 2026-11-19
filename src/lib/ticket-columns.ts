/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Ticket table column catalog (single source of truth).

   This module defines the canonical list of ticket-table columns and their
   default order/visibility. Both the Tickets table (which renders columns) and
   the Column Settings UI in Settings → Tickets → Ticket Settings import from
   here so there is exactly ONE definition of columns, defaults, and rules.
   ────────────────────────────────────────────────────────────────────────── */

export type ColumnId =
  | "checkbox"
  | "store"
  | "ticket"
  | "customer"
  | "device"
  | "status"
  | "dueDate"
  | "created"
  | "amount"
  | "actions";

export type ColumnDef = {
  id: ColumnId;
  label: string;
  width: string; // tailwind width class
  align?: "left" | "right" | "center";
  locked?: boolean; // structural columns that cannot be hidden, moved, or configured
};

export const ALL_COLUMNS: ColumnDef[] = [
  { id: "checkbox", label: "", width: "w-9", locked: true },
  // STORE — a CONTEXT-AWARE column. It is intentionally NOT part of
  // DEFAULT_ORDER / DEFAULT_VISIBLE below, so a normal single-store table is
  // completely unchanged. The Tickets page injects it (right after the
  // checkbox, before Ticket) ONLY when the table is operating in multi-store /
  // All-Shops mode. Compact: enough for the code avatar + store name.
  // SIDEBAR COLLAPSED (wide table): every column gets a PROPORTIONAL share
  // (percentages, sum 100) so the extra width is spread evenly across the
  // whole table — no single column stretches and no gap opens anywhere.
  // SIDEBAR EXPANDED ([body:has(.rox-sidebar-expanded)_&] variant): the original widths, unchanged.
  // When Store is hidden (single store) table-fixed scales the rest evenly.
  { id: "store", label: "Store", width: "w-[10%] [body:has(.rox-sidebar-expanded)_&]:w-[132px]", locked: true },
  { id: "ticket", label: "Ticket", width: "w-[8.5%] [body:has(.rox-sidebar-expanded)_&]:w-[112px]" },
  { id: "customer", label: "Customer", width: "w-[15.5%] [body:has(.rox-sidebar-expanded)_&]:w-[33%]" },
  { id: "device", label: "Device / Service", width: "w-[21%] [body:has(.rox-sidebar-expanded)_&]:w-[33%]" },
  { id: "status", label: "Ticket Status", width: "w-[14%] [body:has(.rox-sidebar-expanded)_&]:w-[184px]", align: "left" },
  { id: "dueDate", label: "Due Date", width: "w-[9%] [body:has(.rox-sidebar-expanded)_&]:w-[100px]" },
  { id: "created", label: "Created", width: "w-[8%] [body:has(.rox-sidebar-expanded)_&]:w-[100px]" },
  { id: "amount", label: "Amount", width: "w-[6.5%] [body:has(.rox-sidebar-expanded)_&]:w-[92px]", align: "right" },
  { id: "actions", label: "Actions", width: "w-[7.5%] [body:has(.rox-sidebar-expanded)_&]:w-[108px]", align: "center", locked: true },
];

/** Columns that are NOT part of the normal (single-store) table. `store` is a
 *  context-aware column injected only in multi-store / All-Shops mode, so it is
 *  excluded from the default order, default visibility, and the user-facing
 *  Column Settings UI (its position is fixed: right after the checkbox). */
export const CONTEXT_COLUMNS: ColumnId[] = ["store"];

/** Catalog columns that participate in the configurable (single-store) table. */
export const CONFIGURABLE_COLUMNS: ColumnDef[] = ALL_COLUMNS.filter(
  (c) => !CONTEXT_COLUMNS.includes(c.id)
);

/** Default column order — every configurable column, in catalog order. */
export const DEFAULT_ORDER: ColumnId[] = CONFIGURABLE_COLUMNS.map((c) => c.id);

/** Default visible columns — everything visible by default. */
export const DEFAULT_VISIBLE: ColumnId[] = CONFIGURABLE_COLUMNS.map((c) => c.id);

/** Columns the user cannot hide (always visible when present). */
export const REQUIRED_COLUMNS: ColumnId[] = ["ticket", "status"];

/** Fast lookup helpers. */
export function getColumn(id: ColumnId): ColumnDef | undefined {
  return ALL_COLUMNS.find((c) => c.id === id);
}
