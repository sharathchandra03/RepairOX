/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Quotation domain model (lead-centric, customer-facing offer).

   A QUOTATION is a professional, customer-facing OFFER — NOT an invoice, NOT
   revenue, NOT a duplicate of the Lead/Customer. It is generated with minimal
   data entry by REUSING information that already exists on the Lead (customer,
   device, issue, estimate, sales agent, store) or captured quickly as a
   standalone "Quick Quotation" that still references the canonical Customer
   Master.

       LEAD ──┐
              ├─▶ QUOTATION (offer) ─▶ preview ─▶ send ─▶ stored, linked
   QUICK ─────┘        │
   (no lead)           └─ references Customer Master (customerId), never dupes

   This file owns the PURE data + math + the fixed/dynamic/conditional TOKEN
   TEMPLATE ENGINE so the UI stays thin and every surface (preview / print /
   PDF / send) renders from the SAME source. No React here.

   Separation of concerns (never merged):
     • Lead Estimate   = internal pipeline value (lead.estimate).
     • Quotation amount = the customer-facing offer total (this record).
     • Invoice total   = the final financial document (revenue).
   ────────────────────────────────────────────────────────────────────────── */

import type { Lead } from "@/lib/leads-data";
import type { Customer } from "@/lib/customer-data";
import type { InventoryItem } from "@/lib/inventory-data";
import type { PrintStoreInfo } from "@/lib/print-utils";

/* ─── Status / lifecycle ─────────────────────────────────────────────────
   Canonical quotation lifecycle. A quotation is created as a Draft, becomes
   Sent only when an actual send/generate succeeds, and can later be marked
   Accepted / Rejected / Expired. These are the ONLY controlled states. */

export type QuotationStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export const QUOTATION_STATUSES: QuotationStatus[] = [
  "draft", "sent", "accepted", "rejected", "expired",
];

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

/** Restrained semantic tones (ring + bg + text) for a quotation status chip. */
export function quotationStatusTone(status: QuotationStatus): string {
  switch (status) {
    case "sent":     return "bg-sky-50 text-sky-700 ring-sky-200";
    case "accepted": return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "rejected": return "bg-rose-50 text-rose-600 ring-rose-200";
    case "expired":  return "bg-zinc-100 text-zinc-500 ring-zinc-200";
    case "draft":
    default:         return "bg-zinc-100 text-zinc-600 ring-zinc-200";
  }
}

/* ─── Source (lead-based vs standalone) ──────────────────────────────────
   How the quotation came to exist. A lead-based quotation retains its Lead
   lineage; a standalone (Quick) quotation has no Lead relationship but still
   references a real Customer Master record. Never fabricate a Lead for a
   standalone quotation. */
export type QuotationSource = "lead" | "standalone";

export const QUOTATION_SOURCE_LABEL: Record<QuotationSource, string> = {
  lead: "Lead-based",
  standalone: "Standalone",
};

export function quotationSourceTone(source: QuotationSource): string {
  return source === "lead"
    ? "bg-violet-50 text-violet-700 ring-violet-200"
    : "bg-slate-50 text-slate-600 ring-slate-200";
}

/* ─── Line items ─────────────────────────────────────────────────────────
   A quotation line is an item/service PROPOSED to the customer. When sourced
   from Inventory it references the canonical Inventory Master item by its id
   (sku) — selecting inventory NEVER creates/mutates a master record and NEVER
   consumes stock. A "custom" / "service" line is a free-text proposed charge
   with no master record (e.g. a labour / pickup charge). */

export type QuotationLineKind = "inventory" | "service" | "custom";

export interface QuotationLineItem {
  id: string;
  kind: QuotationLineKind;
  /** Inventory Master id (sku) when kind === "inventory"; "" otherwise. */
  itemId: string;
  name: string;
  /** Short free-text detail (part quality, note). Optional. */
  description: string;
  qty: number;
  unitPrice: number;
  /** Net line total = qty × unitPrice (quotations are tax-exclusive offers). */
  total: number;
}

export function genQuotationLineId(): string {
  return `qli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createQuotationLine(overrides?: Partial<QuotationLineItem>): QuotationLineItem {
  const base: QuotationLineItem = {
    id: genQuotationLineId(),
    kind: "custom",
    itemId: "",
    name: "",
    description: "",
    qty: 1,
    unitPrice: 0,
    total: 0,
    ...overrides,
  };
  base.total = round2(base.qty * base.unitPrice);
  return base;
}

/** Build a quotation line that REFERENCES an existing Inventory Master item.
 *  Uses the canonical selling price; never mutates the master, never reserves
 *  stock. */
export function inventoryToQuotationLine(item: InventoryItem, qty = 1): QuotationLineItem {
  const q = Math.max(1, qty);
  const price = Number(item.regularSellingPrice || item.defaultPrice || 0);
  return {
    id: genQuotationLineId(),
    kind: "inventory",
    itemId: item.id,
    name: item.name,
    description: item.category || "",
    qty: q,
    unitPrice: price,
    total: round2(q * price),
  };
}

/* ─── Warranty (structured, never fabricated) ────────────────────────────
   Warranty on a quotation is OFFER information, not an inventory item. It is
   expressed as a number of months (0 / null = no recorded warranty). The
   template only renders a warranty sentence when a real warranty exists;
   otherwise it is omitted (never silently promise an unrecorded warranty). */

export interface QuotationWarranty {
  /** Months of warranty (null / 0 = none recorded). */
  months: number | null;
  /** Free-text label override (e.g. "6 Months", "As applicable"). When blank
   *  the engine derives a label from `months`. */
  label: string;
}

/** Format a comma-separated issue pill string into a readable phrase:
 *  "" → ""; "Battery replacement" → "Battery replacement";
 *  "Screen, Battery" → "Screen and Battery". */
export function formatIssueList(issue: string): string {
  const parts = (issue || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function warrantyLabel(w: QuotationWarranty | null | undefined): string {
  if (!w) return "";
  if (w.label && w.label.trim()) return w.label.trim();
  if (w.months && w.months > 0) {
    return w.months === 1 ? "1 Month" : `${w.months} Months`;
  }
  return "";
}

/* ─── The Quotation record ───────────────────────────────────────────────
   References the Lead (optional) + Customer Master + Sales Agent; it never
   embeds or duplicates them. */

export interface Quotation {
  id: string;                 // stable primary key
  quotationNo: string;        // human reference QT-0001 … (server/seq, immutable)

  /* Scope + lineage */
  branchId: string;           // store scope ("" = org-wide)
  source: QuotationSource;    // "lead" | "standalone"
  leadId: string;             // originating Lead ("" for standalone)
  leadNo: string;             // cached Lead reference for display

  /* Customer (Customer Master reference — never a second customer db) */
  customerId: string;         // Customer Master id ("" only if not yet linked)
  customerName: string;       // cached display name
  phone: string;              // cached customer phone
  email: string;              // cached customer email
  location: string;           // service / customer location (optional)

  /* Sales Agent attribution — from the Lead's owner (lead) or current agent
     (standalone). NEVER the customer creator / ticket creator / approver. */
  salesAgentId: string;       // staff id
  salesAgentName: string;     // cached display name

  /* What is being quoted */
  device: string;             // device label (brand + model, or free text)
  /* Device Catalog references (canonical; reuse the catalog, never duplicate).
     "" when the device was typed free-text or not resolved. */
  deviceCategoryId: string;
  deviceBrandId: string;
  deviceModelId: string;
  issue: string;              // repair / service description (comma-separated issue pills)

  /* The offer */
  items: QuotationLineItem[];
  warranty: QuotationWarranty;
  /** The quotation subtotal = sum of line totals. */
  subtotal: number;
  /** Discount applied on the offer (authorized value only). */
  discount: number;
  discountType: "amount" | "percent";
  /** The customer-facing quotation TOTAL (subtotal − discount). This is the
   *  authoritative offer amount — separate from the Lead estimate. */
  amount: number;

  /* Optional agent note shown to the customer (quotation-specific). */
  note: string;

  /* Lifecycle */
  status: QuotationStatus;
  validUntil: string;         // ISO date ("" = none)
  sentAt: string;             // ISO instant the quotation was actually sent ("")

  /* Audit */
  createdBy: string;          // staff id (DB-stamped)
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

/** Draft used by the create/review flows — everything the UI fills in. */
export type QuotationDraft = Omit<Quotation,
  "id" | "quotationNo" | "createdBy" | "createdByName" | "createdAt" | "updatedAt"
>;

/* ─── Totals ─────────────────────────────────────────────────────────────── */

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface QuotationTotals {
  subtotal: number;
  discountAmount: number;
  amount: number;
}

/** Compute quotation totals from the line items + discount. A quotation is a
 *  simple offer: subtotal − discount = amount. No tax (a quotation is NOT a
 *  tax document — tax belongs to the Invoice). */
export function computeQuotationTotals(
  input: Pick<QuotationDraft, "items" | "discount" | "discountType">,
): QuotationTotals {
  const subtotal = round2((input.items || []).reduce((s, it) => s + (Number(it.total) || 0), 0));
  const rawDisc = Math.max(0, Number(input.discount) || 0);
  const discountAmount = input.discountType === "percent"
    ? round2(subtotal * (Math.min(rawDisc, 100) / 100))
    : round2(Math.min(rawDisc, subtotal));
  const amount = round2(Math.max(0, subtotal - discountAmount));
  return { subtotal, discountAmount, amount };
}

/* ─── Lead → Quotation mapping (the heavy lifting) ───────────────────────
   Maps the structured Lead data into a quotation draft so the Sales Agent does
   NOT re-enter customer / device / issue / estimate / sales agent. Only maps
   values relevant to a customer-facing offer — never blindly copies every lead
   field. The Sales Agent is ALWAYS the Lead's owner (never inherited from the
   customer's history). Discount is mapped only as the APPROVED value when a
   deal exists (see opts.approvedDiscount), otherwise the lead's own discount is
   used ONLY as a starting point and the pending-deal gate is enforced by the
   caller. */

export interface LeadToQuotationOptions {
  /** The lead owner's resolved display name (from salesAgents / staff map). */
  salesAgentName?: string;
  /** An authorized/approved discount (amount) to apply instead of the lead's
   *  raw discount — supplied when a Deal was approved. */
  approvedDiscount?: number | null;
  approvedDiscountType?: "amount" | "percent";
  /** A primary quoted line prefilled from the lead's device/issue + estimate.
   *  When false, items start empty (the agent adds inventory lines). Default
   *  true — the whole point is minimal entry. */
  seedPrimaryLine?: boolean;
}

export function leadToQuotationDraft(lead: Lead, opts: LeadToQuotationOptions = {}): QuotationDraft {
  const device = (lead.device || "").trim();
  const issue = (lead.issue || "").trim();
  const estimate = lead.estimate != null ? Number(lead.estimate) : 0;

  const seed = opts.seedPrimaryLine !== false;
  const items: QuotationLineItem[] = [];
  if (seed && (device || issue || estimate > 0)) {
    const name = [device, issue].filter(Boolean).join(" — ") || issue || device || "Repair / Service";
    items.push({
      id: genQuotationLineId(),
      kind: "service",
      itemId: "",
      name,
      description: lead.category || "",
      qty: 1,
      unitPrice: round2(estimate),
      total: round2(estimate),
    });
  }

  // Discount: prefer an explicitly supplied APPROVED discount; otherwise fall
  // back to the lead's own discount as a starting value (caller still enforces
  // the Deal gate before allowing an unapproved discounted send).
  const discount = opts.approvedDiscount != null
    ? Number(opts.approvedDiscount)
    : (lead.discount != null ? Number(lead.discount) : 0);
  const discountType = opts.approvedDiscount != null
    ? (opts.approvedDiscountType ?? "amount")
    : (lead.discountType ?? "amount");

  const draft: QuotationDraft = {
    branchId: lead.branchId || "",
    source: "lead",
    leadId: lead.id,
    leadNo: lead.leadNo || "",
    customerId: lead.customerId || "",
    customerName: lead.name || "",
    phone: lead.number || "",
    email: lead.email || "",
    location: leadFullLocation(lead),
    salesAgentId: lead.assignedTo || "",
    salesAgentName: opts.salesAgentName || lead.assignedToName || lead.agent || "",
    device,
    deviceCategoryId: lead.deviceCategoryId || "",
    deviceBrandId: lead.deviceBrandId || "",
    deviceModelId: lead.deviceModelId || "",
    issue,
    items,
    warranty: { months: null, label: "" },
    subtotal: 0,
    discount: Math.max(0, discount || 0),
    discountType,
    amount: 0,
    note: "",
    status: "draft",
    validUntil: defaultValidUntil(),
    sentAt: "",
  };
  const totals = computeQuotationTotals(draft);
  draft.subtotal = totals.subtotal;
  draft.amount = totals.amount;
  return draft;
}

/** A blank standalone (Quick) quotation draft owned by the current agent. */
export function emptyQuotationDraft(agent: { id: string; name: string }, branchId = ""): QuotationDraft {
  return {
    branchId,
    source: "standalone",
    leadId: "",
    leadNo: "",
    customerId: "",
    customerName: "",
    phone: "",
    email: "",
    location: "",
    salesAgentId: agent.id || "",
    salesAgentName: agent.name || "",
    device: "",
    deviceCategoryId: "",
    deviceBrandId: "",
    deviceModelId: "",
    issue: "",
    items: [],
    warranty: { months: null, label: "" },
    subtotal: 0,
    discount: 0,
    discountType: "amount",
    amount: 0,
    note: "",
    status: "draft",
    validUntil: defaultValidUntil(),
    sentAt: "",
  };
}

/** Apply a selected Customer Master record onto a draft (identity only — never
 *  changes the sales agent). */
export function applyCustomerToDraft(draft: QuotationDraft, c: Customer): QuotationDraft {
  return {
    ...draft,
    customerId: c.id,
    customerName: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
    phone: c.mobile || draft.phone,
    email: c.email || draft.email,
    location: draft.location || [c.address, c.city].filter(Boolean).join(", "),
  };
}

function leadFullLocation(lead: Lead): string {
  return [lead.locationUnit, lead.location].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

function defaultValidUntil(): string {
  const d = new Date(Date.now() + 15 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/* ─── Validation ─────────────────────────────────────────────────────────── */

export interface QuotationValidation {
  ok: boolean;
  errors: string[];
}

/** Minimum data required to GENERATE a quotation document. These must exist so
 *  the template never produces "Quotation for your [blank]". */
export function validateQuotationForGenerate(draft: QuotationDraft): QuotationValidation {
  const errors: string[] = [];
  if (!draft.customerName?.trim()) errors.push("Customer name is required.");
  if (!draft.phone?.trim()) errors.push("Customer phone is required.");
  if (!draft.device?.trim() && !draft.issue?.trim() && (draft.items?.length ?? 0) === 0) {
    errors.push("Add a device, service or quoted item.");
  }
  if ((draft.items?.length ?? 0) === 0 && !(draft.amount > 0)) {
    errors.push("A quoted item or amount is required.");
  }
  if (!draft.salesAgentId?.trim() && !draft.salesAgentName?.trim()) {
    errors.push("A sales agent is required.");
  }
  return { ok: errors.length === 0, errors };
}

/* ─── TEMPLATE TOKEN ENGINE (fixed + dynamic + conditional) ──────────────
   The quotation customer-facing message is built from FIXED sentences with
   DYNAMIC tokens replaced automatically from structured data, and CONDITIONAL
   sentences shown only when the underlying data/policy actually supports them.
   Sales Agents never type tokens or re-type data that already exists. */

export type QuotationTokenMap = Record<string, string>;

/** The company/store policy flags that gate CONDITIONAL template sentences.
 *  These come from Store Configuration — never hard-coded per quotation. */
export interface QuotationPolicy {
  /** The business emails the invoice ("Go Paperless"). */
  goPaperless: boolean;
  /** The business offers free pickup & drop. */
  pickupDrop: boolean;
  /** The after-sales / warranty responsibility sentence is enabled. */
  afterSales: boolean;
}

export const DEFAULT_QUOTATION_POLICY: QuotationPolicy = {
  goPaperless: true,
  pickupDrop: false,
  afterSales: true,
};

/** The resolved content used to render the customer-facing message. */
export interface QuotationMessage {
  /** The ordered paragraphs that make up the message body. */
  paragraphs: string[];
  /** The sign-off agent line (e.g. "Shashank"). */
  agentLine: string;
  /** The company line (e.g. "iFix India"). */
  companyLine: string;
  /** The office / store line (e.g. "Corporate Office, Bangalore"). */
  officeLine: string;
  /** The business contact line (phone). */
  contactLine: string;
}

/** The primary quoted part name + its unit price, used in the lead sentence.
 *  Prefers the first inventory/service line; falls back to the device/issue. */
export function primaryQuotedLine(q: Pick<Quotation, "items" | "device" | "issue" | "amount">): { name: string; price: number } {
  const first = (q.items || [])[0];
  if (first) return { name: first.name, price: first.unitPrice };
  return { name: [q.device, q.issue].filter(Boolean).join(" ") || "service", price: q.amount };
}

/** Format a rupee value for the customer-facing message. */
export function formatQuotationMoney(n: number): string {
  return `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

/**
 * Build the customer-facing message from the quotation + store + policy.
 *
 * FIXED skeleton (sentence structure stays consistent):
 *   • "Quotation for your {device} {issue}:"
 *   • "The cost of the {part_name} is {amount}/-."
 *   • [CONDITIONAL warranty] "This part comes with a {warranty} warranty{,
 *      and an invoice will be sent to your email … Go Paperless}."
 *   • [CONDITIONAL after-sales] "We will be responsible for after-sales service
 *      during the Warranty period, (excluding physical and/or liquid damage)."
 *   • [CONDITIONAL pickup/drop] "For your convenience, we offer a free pick-up
 *      and drop service."
 *   • "Please feel free to reach out here if you need any further assistance."
 *   • "Best regards," + agent / company / office / contact.
 *
 * CONDITIONAL rules:
 *   • Warranty sentence only when a real warranty exists.
 *   • "Go Paperless / invoice emailed" only when policy.goPaperless AND the
 *     customer has an email.
 *   • Pickup/drop only when policy.pickupDrop.
 *   • After-sales only when policy.afterSales AND a warranty exists.
 */
export function buildQuotationMessage(
  q: Quotation,
  store: PrintStoreInfo,
  policy: QuotationPolicy = DEFAULT_QUOTATION_POLICY,
): QuotationMessage {
  const device = (q.device || "").trim();
  const line = primaryQuotedLine(q);
  const partName = (line.name || "").trim() || "service";
  const warranty = warrantyLabel(q.warranty);
  const hasWarranty = !!warranty;
  const hasEmail = !!(q.email || "").trim();
  // The issue is a comma-separated pill string → read it naturally
  // ("Battery replacement" / "Screen and Battery replacement").
  const issueText = formatIssueList(q.issue);

  const paragraphs: string[] = [];

  // 1) FIXED lead sentence (DYNAMIC device + issue).
  const headTail = [device, issueText].filter(Boolean).join(" ").trim();
  paragraphs.push(`Quotation for your ${headTail || "device"}:`);

  // 2) FIXED cost sentence (DYNAMIC part + amount).
  paragraphs.push(`The cost of the ${partName} is ${formatQuotationMoney(q.amount)}/-.`);

  // 3) CONDITIONAL warranty + Go-Paperless.
  if (hasWarranty) {
    let s = `This part comes with a ${warranty} warranty`;
    if (policy.goPaperless && hasEmail) {
      s += `, and an invoice will be sent to your email address as part of ${store.storeName || "our"} “Go Paperless” initiative.`;
    } else {
      s += ".";
    }
    paragraphs.push(s);
  } else if (policy.goPaperless && hasEmail) {
    paragraphs.push(`An invoice will be sent to your email address as part of ${store.storeName || "our"} “Go Paperless” initiative.`);
  }

  // 4) CONDITIONAL after-sales (only when a warranty exists).
  if (policy.afterSales && hasWarranty) {
    paragraphs.push("We will be responsible for after-sales service during the Warranty period, (excluding physical and/or liquid damage).");
  }

  // 5) CONDITIONAL pickup & drop.
  if (policy.pickupDrop) {
    paragraphs.push("For your convenience, we offer a free pick-up and drop service.");
  }

  // 6) FIXED closing.
  paragraphs.push("Please feel free to reach out here if you need any further assistance.");

  const officeLine = [store.address, store.city].filter(Boolean).join(", ")
    || store.fullAddress || "";
  const contactLine = store.phone || store.mobile || "";

  return {
    paragraphs,
    agentLine: q.salesAgentName || "",
    companyLine: store.storeName || "",
    officeLine,
    contactLine,
  };
}

/* ─── WhatsApp send ──────────────────────────────────────────────────────
   Opens WhatsApp (wa.me) addressed to the customer's number with the quotation
   message pre-filled. Uses the SAME token-engine message as the document so
   the customer gets the exact wording. Never invents a number — returns null
   when the customer has no usable phone. */

/** Normalize a phone to the digits WhatsApp expects (country code + number, no
 *  "+"/spaces). Falls back to prefixing India's 91 for a bare 10-digit number
 *  (the business is India-based; see Store Configuration). */
export function normalizeWhatsAppNumber(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  // 10-digit local number → prefix 91. 11 digits starting with 0 → drop 0 +
  // prefix 91. Otherwise assume it already carries a country code.
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

/** Build a SHORT WhatsApp message (a crisp covering note, NOT the full letter)
 *  — the detailed quotation travels as the attached PDF. Keeps the chat tidy:
 *  greeting + one-line summary + "PDF attached" + sign-off. */
export function buildQuotationWhatsAppText(
  q: Quotation,
  store: PrintStoreInfo,
  _policy: QuotationPolicy = DEFAULT_QUOTATION_POLICY,
  opts?: { documentUrl?: string },
): string {
  const firstName = (q.customerName || "").trim().split(" ")[0];
  const device = (q.device || "").trim();
  const issue = formatIssueList(q.issue);
  const subject = [device, issue].filter(Boolean).join(" ").trim();
  const company = store.storeName || "our team";

  const lines: string[] = [];
  lines.push(firstName ? `Hi ${firstName},` : "Hi,");
  lines.push(
    subject
      ? `Here's your quotation ${q.quotationNo} for ${subject} — ${formatQuotationMoney(q.amount)}.`
      : `Here's your quotation ${q.quotationNo} — ${formatQuotationMoney(q.amount)}.`,
  );
  const warranty = warrantyLabel(q.warranty);
  if (warranty) lines.push(`Warranty: ${warranty}.`);
  lines.push("The full quotation is attached as a PDF.");
  if (opts?.documentUrl) lines.push(`You can also view it here: ${opts.documentUrl}`);
  lines.push("");
  lines.push(`— ${q.salesAgentName || company}${q.salesAgentName && company ? `, ${company}` : ""}`);
  return lines.join("\n");
}

/** Filename for the downloaded quotation PDF (e.g. "Quotation_QT-0001.pdf"). */
export function getQuotationPdfFilename(q: Pick<Quotation, "quotationNo" | "customerName">): string {
  const no = (q.quotationNo || "quotation").replace(/[^A-Za-z0-9_-]/g, "");
  const cust = (q.customerName || "").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cust ? `Quotation_${no}_${cust}.pdf` : `Quotation_${no}.pdf`;
}

/** Build the wa.me URL (number + prefilled message). Returns null when the
 *  customer has no usable phone number. */
export function buildQuotationWhatsAppUrl(
  q: Quotation,
  store: PrintStoreInfo,
  policy: QuotationPolicy = DEFAULT_QUOTATION_POLICY,
  opts?: { documentUrl?: string },
): string | null {
  const num = normalizeWhatsAppNumber(q.phone);
  if (!num) return null;
  const text = buildQuotationWhatsAppText(q, store, policy, opts);
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** The DYNAMIC token map (for debugging / future template customization). Never
 *  exposed raw to normal Sales Agents — the engine replaces them automatically. */
export function quotationTokenMap(
  q: Quotation,
  store: PrintStoreInfo,
): QuotationTokenMap {
  const line = primaryQuotedLine(q);
  return {
    "{{customer_name}}": q.customerName || "",
    "{{device_name}}": q.device || "",
    "{{issue}}": q.issue || "",
    "{{part_name}}": line.name || "",
    "{{quotation_amount}}": formatQuotationMoney(q.amount),
    "{{warranty_period}}": warrantyLabel(q.warranty),
    "{{sales_agent_name}}": q.salesAgentName || "",
    "{{company_name}}": store.storeName || "",
    "{{store_name}}": store.alternateName || store.storeName || "",
    "{{store_location}}": [store.address, store.city].filter(Boolean).join(", "),
    "{{business_phone}}": store.phone || store.mobile || "",
    "{{customer_email}}": q.email || "",
    "{{customer_phone}}": q.phone || "",
  };
}

/* ─── Supabase row mappers (snake_case ↔ camelCase) ──────────────────────── */

export function quotationToRow(q: Partial<Quotation>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) row[k] = v === "" ? null : v; };
  if (q.id !== undefined) row.id = q.id;
  set("quotation_no", q.quotationNo);
  set("branch_id", q.branchId);
  set("source", q.source);
  set("lead_id", q.leadId);
  set("lead_no", q.leadNo);
  set("customer_id", q.customerId);
  set("customer_name", q.customerName);
  set("phone", q.phone);
  set("email", q.email);
  set("location", q.location);
  set("sales_agent_id", q.salesAgentId);
  set("sales_agent_name", q.salesAgentName);
  set("device", q.device);
  set("device_category_id", q.deviceCategoryId);
  set("device_brand_id", q.deviceBrandId);
  set("device_model_id", q.deviceModelId);
  set("issue", q.issue);
  if (q.items !== undefined) row.items = q.items;
  if (q.warranty !== undefined) row.warranty = q.warranty;
  if (q.subtotal !== undefined) row.subtotal = q.subtotal;
  if (q.discount !== undefined) row.discount = q.discount;
  set("discount_type", q.discountType);
  if (q.amount !== undefined) row.amount = q.amount;
  set("note", q.note);
  set("status", q.status);
  set("valid_until", q.validUntil);
  set("sent_at", q.sentAt);
  return row;
}

export function rowToQuotation(r: Record<string, any>): Quotation {
  const warranty: QuotationWarranty = r.warranty && typeof r.warranty === "object"
    ? { months: r.warranty.months ?? null, label: r.warranty.label ?? "" }
    : { months: null, label: "" };
  return {
    id: String(r.id),
    quotationNo: r.quotation_no || r.id || "",
    branchId: r.branch_id || "",
    source: (r.source as QuotationSource) || "standalone",
    leadId: r.lead_id || "",
    leadNo: r.lead_no || "",
    customerId: r.customer_id || "",
    customerName: r.customer_name || "",
    phone: r.phone || "",
    email: r.email || "",
    location: r.location || "",
    salesAgentId: r.sales_agent_id || "",
    salesAgentName: r.sales_agent_name || "",
    device: r.device || "",
    deviceCategoryId: r.device_category_id || "",
    deviceBrandId: r.device_brand_id || "",
    deviceModelId: r.device_model_id || "",
    issue: r.issue || "",
    items: Array.isArray(r.items) ? (r.items as QuotationLineItem[]) : [],
    warranty,
    subtotal: Number(r.subtotal || 0),
    discount: Number(r.discount || 0),
    discountType: (r.discount_type as "amount" | "percent") || "amount",
    amount: Number(r.amount || 0),
    note: r.note || "",
    status: (r.status as QuotationStatus) || "draft",
    validUntil: r.valid_until || "",
    sentAt: r.sent_at || "",
    createdBy: r.created_by || "",
    createdByName: r.created_by_name || "",
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || r.created_at || new Date().toISOString(),
  };
}
