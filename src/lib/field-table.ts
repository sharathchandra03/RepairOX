/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field (Pickup & Drop) table logic. Pure, no React, no I/O.

   • ACTION OF TRIP  — SYSTEM-DERIVED, read-only. The latest meaningful
     operational event of a trip, computed from the EXISTING FieldJobStatus (+
     trip type + ticket link). It is never stored and never a second status
     engine: Status stays the existing FieldJobStatus.
   • Search           — Trip ID, Lead ID, customer, mobile (normalised), email,
     device, IMEI/serial, issue, ticket, invoice, Field Engineer, store.
   • Business value   — ONLY a finalized (paid, non-proforma) invoice counts as
     realised value. Draft / unpaid / proforma / cancelled are shown separately
     and never summed.
   ────────────────────────────────────────────────────────────────────────── */
import type { FieldJob, FieldJobEvent, FieldJobStatus } from "@/lib/field-data";
import { normaliseLeadType } from "@/lib/field-data";
import type { ResolvedFieldRow } from "@/lib/field-resolve";
import { isFinalizedInvoice } from "@/lib/leads-data";
import { tripDevicesOf, tripDevicesSearchText } from "@/lib/field-devices";

/* ─── Action of Trip (derived) ─────────────────────────────────────────── */

export type TripActionTone = "neutral" | "info" | "progress" | "warn" | "success" | "danger";

export interface TripAction { label: string; tone: TripActionTone; reason: string }

const isOnSite = (j: Pick<FieldJob, "leadType">) => {
  const t = normaliseLeadType(j.leadType);
  return t === "onsite" || t === "warranty_onsite";
};

export function fieldTripAction(job: Pick<FieldJob, "status" | "leadType" | "linkedTicketId">): TripAction {
  const onsite = isOnSite(job);
  const s: FieldJobStatus = job.status;
  switch (s) {
    case "pending_assignment":
      return { label: "Awaiting Assignment", tone: "neutral", reason: "No Field Engineer assigned yet." };
    case "assigned":
    case "pickup_scheduled":
      return { label: onsite ? "On-Site Scheduled" : "Pickup Scheduled", tone: "info", reason: "A Field Engineer is assigned; the visit is not started." };
    case "out_for_pickup":
      return { label: onsite ? "On-Site Visit In Progress" : "Out for Pickup", tone: "progress", reason: "The Field Engineer is on the way / with the customer." };
    case "failed_pickup":
      return { label: onsite ? "On-Site Visit Failed" : "Pickup Failed", tone: "danger", reason: "The visit could not be completed; needs rescheduling." };
    case "picked_up":
      return { label: "Pickup Completed", tone: "success", reason: "Device collected from the customer." };
    case "at_store":
      return { label: "Device at Store", tone: "info", reason: "Device received at the operational store." };
    case "in_repair":
      return { label: "Repair In Progress", tone: "progress", reason: "Repair is under way." };
    case "ready_for_drop":
      return { label: "Repaired · Ready to Drop", tone: "info", reason: "Repair finished; waiting to be returned." };
    case "drop_scheduled":
      return { label: "Drop Scheduled", tone: "info", reason: "A Field Engineer is assigned to return the device." };
    case "out_for_drop":
      return { label: "In Transit", tone: "progress", reason: "Device is on its way back to the customer." };
    case "failed_drop":
      return { label: "Drop Failed", tone: "danger", reason: "Delivery could not be completed; needs rescheduling." };
    case "delivered":
      return { label: "Repaired & Delivered", tone: "success", reason: "Device delivered to the customer." };
    case "completed":
      if (onsite) return { label: "On-Site Completed", tone: "success", reason: "On-site service completed." };
      return job.linkedTicketId
        ? { label: "Repaired & Delivered", tone: "success", reason: "Repair ticket linked and device delivered." }
        : { label: "Pickup & Dropped", tone: "success", reason: "Pickup and drop completed." };
    case "cancelled":
      return { label: "Cancelled", tone: "danger", reason: "Trip was cancelled; history is preserved." };
    default:
      return { label: "—", tone: "neutral", reason: "" };
  }
}

export const TRIP_ACTION_TONE_CLASS: Record<TripActionTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  progress: "bg-amber-50 text-amber-800 ring-amber-200",
  warn: "bg-orange-50 text-orange-800 ring-orange-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
};

/** Complete allowed vocabulary of Action of Trip (for the filter + column sizing). */
export const TRIP_ACTION_LABELS: string[] = [
  "Awaiting Assignment", "Pickup Scheduled", "On-Site Scheduled", "Out for Pickup",
  "On-Site Visit In Progress", "Pickup Failed", "On-Site Visit Failed", "Pickup Completed",
  "Device at Store", "Repair In Progress", "Repaired · Ready to Drop", "Drop Scheduled",
  "In Transit", "Drop Failed", "Repaired & Delivered", "Pickup & Dropped",
  "On-Site Completed", "Cancelled",
];

/* ─── Search ───────────────────────────────────────────────────────────── */

/** Digits only, last 10 — same normalisation rule as the Customer Master /
 *  Lead search (country code, spaces, hyphens, +91 all collapse). */
export function normalizePhoneDigits(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export interface FieldSearchExtras {
  /** Store NAME resolved for the job (branch name). */
  storeName?: string;
}

/** True when `query` matches the trip. Every whitespace-separated term must
 *  match (AND). A term of 4+ digits is also compared against the normalised
 *  phone numbers so "+91 98765-43210" finds "9876543210". */
export function matchesFieldSearch(
  query: string,
  job: FieldJob,
  r: Pick<ResolvedFieldRow, "customerName" | "contact" | "email" | "model" | "ticketNo" | "invoiceId">,
  extras: FieldSearchExtras = {},
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    job.jobNo, job.leadNo, r.customerName, job.customer, r.contact, job.phone, job.altPhone,
    r.email, job.email, r.model, job.device, job.imei, job.issue, r.ticketNo, r.invoiceId,
    job.linkedTicketId, job.linkedInvoiceId, job.ninjaName, job.dropNinjaName, job.fieldManagerName,
    extras.storeName, job.branch, job.source, job.pincode, job.pickupAddress,
    // every device on a multi-device trip (label / issue / IMEI)
    tripDevicesSearchText(tripDevicesOf(job)),
  ].filter(Boolean).join(" ").toLowerCase();
  const phones = [r.contact, job.phone, job.altPhone].map(normalizePhoneDigits).filter(Boolean);
  const terms = q.split(/\s+/).filter(Boolean);
  return terms.every((t) => {
    if (hay.includes(t)) return true;
    const digits = t.replace(/\D/g, "");
    // "+91 98765 43210" splits into terms; also try the whole phone-like query.
    if (digits.length >= 4) {
      const nd = digits.length > 10 ? digits.slice(-10) : digits;
      return phones.some((p) => p.includes(nd));
    }
    return false;
  }) || (() => {
    const whole = normalizePhoneDigits(q);
    return whole.length >= 7 && phones.some((p) => p.includes(whole));
  })();
}

/* ─── Business value (finalized invoices only) ─────────────────────────── */

export interface TripValue {
  /** Realised value: a FINALIZED invoice total, else null. */
  finalized: number | null;
  /** A linked invoice exists but is not finalized (draft / unpaid / proforma). */
  pendingAmount: number | null;
  pendingLabel: string;
}

export function tripValue(r: Pick<ResolvedFieldRow, "invoice" | "invoiceAmount">): TripValue {
  const inv = r.invoice;
  if (!inv) return { finalized: null, pendingAmount: null, pendingLabel: "" };
  const total = Number(r.invoiceAmount ?? (inv as any).total ?? 0);
  if (isFinalizedInvoice(inv as any)) return { finalized: total, pendingAmount: null, pendingLabel: "" };
  const doc = (inv as any).documentType;
  const status = String((inv as any).status ?? "");
  const label = doc === "proforma" ? "Proforma" : status === "cancelled" ? "Cancelled" : status === "draft" ? "Draft" : "Not paid";
  return { finalized: null, pendingAmount: total, pendingLabel: label };
}

/* ─── Latest comment ───────────────────────────────────────────────────── */

/** Most recent human note for the table: latest customer-communication /
 *  comment event, else the job's own notes. */
export function latestTripComment(job: Pick<FieldJob, "id" | "notes">, events: FieldJobEvent[]): string {
  let best: FieldJobEvent | null = null;
  for (const e of events) {
    if (e.jobId !== job.id) continue;
    if (e.kind !== "communication" && e.kind !== "comment") continue;
    if (!best || e.occurredAt > best.occurredAt) best = e;
  }
  return best?.note?.trim() || job.notes?.trim() || "";
}
