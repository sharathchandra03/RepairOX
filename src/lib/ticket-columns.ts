/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Ticket table column catalog (single source of truth).

   This module defines the canonical list of ticket-table columns and their
   default order/visibility. Both the Tickets table (which renders columns) and
   the Column Settings UI in Settings → Tickets → Ticket Settings import from
   here so there is exactly ONE definition of columns, defaults, and rules.
   ────────────────────────────────────────────────────────────────────────── */

export type ColumnId =
  | "checkbox"
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
  { id: "ticket", label: "Ticket", width: "w-[112px]" },
  { id: "customer", label: "Customer", width: "w-[33%]" },
  { id: "device", label: "Device / Service", width: "w-[33%]" },
  { id: "status", label: "Status", width: "w-[184px]", align: "left" },
  { id: "dueDate", label: "Due Date", width: "w-[100px]" },
  { id: "created", label: "Created", width: "w-[100px]" },
  { id: "amount", label: "Amount", width: "w-[92px]", align: "right" },
  { id: "actions", label: "Actions", width: "w-[108px]", align: "center", locked: true },
];

/** Default column order — every column, in catalog order. */
export const DEFAULT_ORDER: ColumnId[] = ALL_COLUMNS.map((c) => c.id);

/** Default visible columns — everything visible by default. */
export const DEFAULT_VISIBLE: ColumnId[] = ALL_COLUMNS.map((c) => c.id);

/** Columns the user cannot hide (always visible when present). */
export const REQUIRED_COLUMNS: ColumnId[] = ["ticket", "status"];

/** Fast lookup helpers. */
export function getColumn(id: ColumnId): ColumnDef | undefined {
  return ALL_COLUMNS.find((c) => c.id === id);
}
