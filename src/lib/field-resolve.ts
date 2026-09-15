/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Job display RESOLVER.

   A Field Job is an operational LAYER over the existing RepairOX records. It
   stores only Field-specific facts (leadType, source, schedule, assignees,
   status, addresses, proof) plus REFERENCES (customerId, leadId,
   linkedTicketId, linkedTicketDeviceId, linkedInvoiceId).

   Every OTHER column shown in the Field table — Customer, Contact, Model,
   Ticket ID, Service Status, Invoice ID, Invoice Amount — is DERIVED here at
   read time from the live source-of-truth records so nothing goes stale:

       Customer / Contact  → Customer Master (by customerId), else the job's
                             cached snapshot from creation.
       Model               → the specific Ticket DeviceRecord
                             (linkedTicketDeviceId) on a multi-device Ticket,
                             else the ticket's first device, else the cached
                             device string.
       Ticket ID           → the linked Ticket's ticketNo.
       Invoice ID + Amount → the Invoice linked to that Ticket (or the job's
                             linkedInvoiceId), read LIVE — no duplicated total.

   Pure functions, no React — reused by the table, the drawer, search, export
   and reporting so every surface shows the same resolved values.
   ────────────────────────────────────────────────────────────────────────── */

import type { FieldJob } from "@/lib/field-data";
import type { Ticket, Invoice, DeviceRecord } from "@/lib/mock-data";
import { getTicketDevices } from "@/lib/mock-data";
import type { Customer } from "@/lib/customer-data";

/** The live business data the resolver reads from (a slice of the store). */
export interface FieldResolveSources {
  tickets: Ticket[];
  invoices: Invoice[];
  customers: Customer[];
}

/** Everything the Field table/drawer needs to render one job, fully resolved. */
export interface ResolvedFieldRow {
  /** Live Customer Master name (falls back to the job snapshot). */
  customerName: string;
  /** Live Customer Master contact (falls back to the job snapshot). */
  contact: string;
  /** Live customer email (falls back to snapshot). */
  email: string;
  /** Live customer address (for pickup/drop reference). */
  customerAddress: string;
  /** The specific device model for this job (resolved from the ticket device). */
  model: string;
  /** Secondary device detail (issue/description) for the model cell. */
  modelDetail: string;

  /** Linked Ticket (live) + its display number, or null. */
  ticket: Ticket | null;
  ticketNo: string;              // "T-056" or ""
  /** The specific DeviceRecord this job is for (multi-device aware), or null. */
  ticketDevice: DeviceRecord | null;

  /** Linked Invoice (live) + its display id/amount, or null. */
  invoice: Invoice | null;
  invoiceId: string;             // "INV039" / "I-039" or ""
  invoiceAmount: number | null;  // live total, or null when not billed
}

/** Resolve the live Customer Master record for a job (by id). */
export function resolveFieldCustomer(job: FieldJob, customers: Customer[]): Customer | null {
  if (!job.customerId) return null;
  return customers.find((c) => c.id === job.customerId) ?? null;
}

/** Resolve the linked Ticket for a job (by id). */
export function resolveFieldTicket(job: FieldJob, tickets: Ticket[]): Ticket | null {
  if (!job.linkedTicketId) return null;
  return tickets.find((t) => t.id === job.linkedTicketId) ?? null;
}

/**
 * Resolve the specific DeviceRecord this job concerns on a multi-device ticket.
 * Prefers the explicit linkedTicketDeviceId; else the ticket's first device.
 * Returns null when there is no linked ticket.
 */
export function resolveFieldTicketDevice(job: FieldJob, ticket: Ticket | null): DeviceRecord | null {
  if (!ticket) return null;
  const devices = getTicketDevices(ticket);
  if (job.linkedTicketDeviceId) {
    const match = devices.find((d) => d.id === job.linkedTicketDeviceId);
    if (match) return match;
  }
  return devices[0] ?? null;
}

/**
 * Resolve the linked Invoice for a job, LIVE. Order:
 *   1) explicit linkedInvoiceId on the job (if the invoice still exists),
 *   2) the invoice whose ticketId matches the linked Ticket.
 * The amount is read from the invoice's total — never duplicated onto the job.
 */
export function resolveFieldInvoice(job: FieldJob, ticket: Ticket | null, invoices: Invoice[]): Invoice | null {
  if (job.linkedInvoiceId) {
    const direct = invoices.find((inv) => inv.id === job.linkedInvoiceId);
    if (direct) return direct;
  }
  if (ticket) {
    const viaTicket = invoices.find((inv) => inv.ticketId === ticket.id);
    if (viaTicket) return viaTicket;
  }
  return null;
}

/** Human display name for a device record (brand + model, else category). */
function deviceLabel(d: DeviceRecord | null): string {
  if (!d) return "";
  const name = [d.brand, d.model].filter(Boolean).join(" ").trim();
  return name || d.category || "";
}

/**
 * The single resolver used by every Field surface. Reads live master/related
 * records; falls back to the job's own cached snapshot fields ONLY when a live
 * record can't be found (e.g. an ad-hoc job with no customerId yet), so the
 * table is never blank while still preferring the source of truth.
 */
export function resolveFieldRow(job: FieldJob, src: FieldResolveSources): ResolvedFieldRow {
  const customer = resolveFieldCustomer(job, src.customers);
  const ticket = resolveFieldTicket(job, src.tickets);
  const ticketDevice = resolveFieldTicketDevice(job, ticket);
  const invoice = resolveFieldInvoice(job, ticket, src.invoices);

  const customerName = (customer?.fullName || job.customer || "").trim();
  const contact = (customer?.mobile || job.phone || "").trim();
  const email = (customer?.email || job.email || "").trim();
  const customerAddress = (customer?.address || job.pickupAddress || "").trim();

  // Model: the specific ticket device wins (multi-device correctness); then the
  // job's own cached device string (set from the lead at creation).
  const deviceFromTicket = deviceLabel(ticketDevice);
  const model = deviceFromTicket || job.device || "";
  const modelDetail = ticketDevice?.issue || ticketDevice?.description || job.issue || "";

  return {
    customerName,
    contact,
    email,
    customerAddress,
    model,
    modelDetail,
    ticket,
    ticketNo: ticket?.ticketNo || (ticket?.id ?? "") || "",
    ticketDevice,
    invoice,
    invoiceId: invoice?.id || "",
    invoiceAmount: invoice ? Number(invoice.total ?? 0) : null,
  };
}

/** Format an amount as Indian Rupees for the Invoice Amount column. */
export function formatInvoiceAmount(amount: number | null): string {
  if (amount == null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}
