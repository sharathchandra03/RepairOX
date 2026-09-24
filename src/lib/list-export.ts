/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Ticket & Invoice list export (Excel + CSV).

   Per the Spreadsheet Import/Export standard, every export builds its
   columns/rows ONCE and exposes BOTH Excel (.xlsx, primary) and CSV via the
   shared csv-utils helpers. The Tickets and Invoice list pages call these so
   the two formats always contain identical data and the export UI is a simple
   Excel/CSV dropdown.
   ────────────────────────────────────────────────────────────────────────── */

import { downloadXLSX, downloadCSV, toCSV } from "@/lib/csv-utils";
import {
  STATUS_LABEL, PRIORITY_LABEL, TICKET_TYPE_LABEL,
  ESTIMATE_STATUS_LABEL, WARRANTY_STATUS_LABEL,
  INVOICE_STATUS_LABEL, INVOICE_TYPE_LABEL, PROFORMA_STATUS_LABEL,
  getRecordType, getTicketType, getTicketDevices,
  getDocumentType, getInvoiceDevices,
  type Ticket, type Invoice,
} from "@/lib/mock-data";

/** Resolve a store name from a branch id (via the page's getStore), gracefully
 *  degrading to an empty string when unknown / single-store. */
type StoreNameFn = (branchId?: string | null) => string;

const fmtDate = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/* ─── Tickets ─────────────────────────────────────────────────────────── */

/** Human status for a ticket, record-type aware (repair / estimate / warranty). */
function ticketStatusLabel(t: Ticket): string {
  const rt = getRecordType(t);
  if (rt === "estimate") return ESTIMATE_STATUS_LABEL[t.estimateStatus ?? "waiting_approval"] ?? "";
  if (rt === "warranty") return WARRANTY_STATUS_LABEL[t.warrantyStatus ?? "open"] ?? "";
  return STATUS_LABEL[t.status] ?? t.status ?? "";
}

/** One-line device/service summary for a ticket (mirrors the table cell). */
function ticketDeviceSummary(t: Ticket): string {
  const devices = getTicketDevices(t);
  if (devices.length > 1) return devices.map((d) => d.model || d.category || "").filter(Boolean).join(" · ");
  return t.model || devices[0]?.model || t.service || "";
}

export const TICKET_EXPORT_COLUMNS = [
  "Store", "Ticket #", "Record Type", "Type", "Customer", "Phone",
  "Device / Service", "Issue", "Status", "Priority", "Technician",
  "Due Date", "Created", "Amount",
];

/** Build the export rows for a set of tickets. `storeName` resolves the Store
 *  column; when multi-store is off the caller can pass a resolver that returns
 *  "" and simply not surface the column difference (kept for parity/backup). */
export function buildTicketExportRows(tickets: Ticket[], storeName: StoreNameFn): (string | number)[][] {
  return tickets.map((t) => [
    storeName(t.branchId),
    t.ticketNo ?? t.id,
    getRecordType(t) === "estimate" ? "Estimate" : getRecordType(t) === "warranty" ? "Warranty" : "Ticket",
    (() => { const type = getTicketType(t); return type ? TICKET_TYPE_LABEL[type] : ""; })(),
    t.customer,
    t.phone,
    ticketDeviceSummary(t),
    t.issue || "",
    ticketStatusLabel(t),
    PRIORITY_LABEL[t.priority] ?? t.priority ?? "",
    t.technician || "",
    fmtDate(t.dueDate),
    fmtDate(t.createdAt),
    t.amount ?? 0,
  ]);
}

const ticketFileName = () => `tickets-${new Date().toISOString().slice(0, 10)}`;

/** Export tickets as Excel (.xlsx) — the primary format. */
export function exportTicketsExcel(tickets: Ticket[], storeName: StoreNameFn): Promise<void> {
  return downloadXLSX(ticketFileName(), TICKET_EXPORT_COLUMNS, buildTicketExportRows(tickets, storeName), "Tickets");
}

/** Export tickets as CSV (alternative format). */
export function exportTicketsCSV(tickets: Ticket[], storeName: StoreNameFn): void {
  downloadCSV(ticketFileName(), toCSV(TICKET_EXPORT_COLUMNS, buildTicketExportRows(tickets, storeName)));
}

/* ─── Invoices ────────────────────────────────────────────────────────── */

/** One-line device/service summary for an invoice. */
function invoiceDeviceSummary(inv: Invoice): string {
  const devices = getInvoiceDevices(inv);
  if (devices.length) return devices.map((d) => d.model || "").filter(Boolean).join(" · ");
  return inv.items?.map((i) => i.name).filter(Boolean).join(" · ") || "";
}

function invoiceStatusLabel(inv: Invoice): string {
  if (getDocumentType(inv) === "proforma") return PROFORMA_STATUS_LABEL[inv.proformaStatus ?? "open"] ?? "";
  return INVOICE_STATUS_LABEL[inv.status] ?? inv.status ?? "";
}

export const INVOICE_EXPORT_COLUMNS = [
  "Store", "Invoice #", "Document Type", "Type", "Customer", "Phone",
  "Device / Service", "Status", "Payment Mode", "Linked Ticket",
  "Created", "Due Date", "Subtotal", "Discount", "Tax", "Total", "Paid", "Balance",
];

export function buildInvoiceExportRows(invoices: Invoice[], storeName: StoreNameFn): (string | number)[][] {
  return invoices.map((inv) => [
    storeName(inv.branchId),
    inv.id,
    getDocumentType(inv) === "proforma" ? "Proforma" : "Invoice",
    INVOICE_TYPE_LABEL[inv.invoiceType] ?? inv.invoiceType ?? "",
    inv.customer,
    inv.phone,
    invoiceDeviceSummary(inv),
    invoiceStatusLabel(inv),
    inv.paymentMode || "",
    inv.ticketId || "",
    fmtDate(inv.createdAt),
    fmtDate(inv.dueDate),
    inv.subtotal ?? 0,
    inv.discount ?? 0,
    inv.tax ?? 0,
    inv.total ?? 0,
    inv.paidAmount ?? 0,
    Math.max(0, (inv.total ?? 0) - (inv.paidAmount ?? 0)),
  ]);
}

const invoiceFileName = () => `invoices-${new Date().toISOString().slice(0, 10)}`;

/** Export invoices as Excel (.xlsx) — the primary format. */
export function exportInvoicesExcel(invoices: Invoice[], storeName: StoreNameFn): Promise<void> {
  return downloadXLSX(invoiceFileName(), INVOICE_EXPORT_COLUMNS, buildInvoiceExportRows(invoices, storeName), "Invoices");
}

/** Export invoices as CSV (alternative format). */
export function exportInvoicesCSV(invoices: Invoice[], storeName: StoreNameFn): void {
  downloadCSV(invoiceFileName(), toCSV(INVOICE_EXPORT_COLUMNS, buildInvoiceExportRows(invoices, storeName)));
}
