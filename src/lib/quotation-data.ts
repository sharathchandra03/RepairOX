/* ────────────────────────────────────────────────────────────────────────
   RepairOX — Quotation domain model.

   The quotation module is the official proposal system inside RepairOX. A
   quotation links to a Lead / Deal / Company / Contact, carries products &
   services (sourced from Inventory), computes taxes and totals live, and can
   be converted into an Invoice with a single click (no re-typing).

   This file owns the pure data + math so the UI stays thin and every
   calculation is testable and reused by the "Convert to Invoice" flow.
   ──────────────────────────────────────────────────────────────────────── */

import type { Invoice, InvoiceLineItem } from "@/lib/mock-data";

/* ─── Status ─────────────────────────────────────────────────────────── */

export type QuotationStatus =
  | "draft"
  | "pending"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export const QUOTATION_STATUS_OPTIONS: { label: string; value: QuotationStatus }[] = [
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
  { label: "Expired", value: "expired" },
];

export const QUOTATION_STATUS_META: Record<QuotationStatus, { label: string; color: string }> = {
  draft:    { label: "Draft",    color: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  pending:  { label: "Pending",  color: "bg-amber-50 text-amber-700 ring-amber-200" },
  sent:     { label: "Sent",     color: "bg-sky-50 text-sky-700 ring-sky-200" },
  accepted: { label: "Accepted", color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "Rejected", color: "bg-rose-50 text-rose-700 ring-rose-200" },
  expired:  { label: "Expired",  color: "bg-zinc-100 text-zinc-500 ring-zinc-200" },
};

/* ─── Line items ─────────────────────────────────────────────────────── */

export type QuotationLineKind = "product" | "service" | "accessory" | "custom";

export interface QuotationLineItem {
  id: string;
  kind: QuotationLineKind;
  /** Inventory item id (SKU) when sourced from inventory; blank for custom lines. */
  itemId: string;
  name: string;
  sku: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  /** Line discount as a percentage. */
  discount: number;
  /** GST rate as a percentage. */
  tax: number;
  /** Net line total (after discount + tax) — recomputed on every change. */
  total: number;
}

export const QUOTATION_UNITS = ["Piece", "Set", "Box", "Pack", "Unit", "Hour", "Service", "Metre"];

/** GST application mode — intra-state splits into CGST + SGST, inter-state uses IGST. */
export type GstMode = "intra" | "inter";

export const PAYMENT_TERMS_OPTIONS = [
  { label: "Immediate", value: "immediate" },
  { label: "Net 7", value: "net_7" },
  { label: "Net 15", value: "net_15" },
  { label: "Net 30", value: "net_30" },
  { label: "Custom", value: "custom" },
];

export const PAYMENT_METHOD_OPTIONS = [
  { label: "Cash", value: "cash" },
  { label: "UPI", value: "upi" },
  { label: "Bank Transfer", value: "bank_transfer" },
  { label: "Card", value: "card" },
  { label: "Cheque", value: "cheque" },
  { label: "Other", value: "other" },
];

export const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

export const SOURCE_OPTIONS = [
  { label: "Website", value: "website" },
  { label: "Referral", value: "referral" },
  { label: "Walk-In", value: "walkin" },
  { label: "Google Ads", value: "google" },
  { label: "Social Media", value: "social" },
  { label: "Cold Call", value: "cold_call" },
  { label: "Partner", value: "partner" },
];

/* ─── Address ────────────────────────────────────────────────────────── */

export interface QuotationAddress {
  line1: string;
  city: string;
  state: string;
  country: string;
  zipcode: string;
}

export function emptyAddress(): QuotationAddress {
  return { line1: "", city: "", state: "", country: "India", zipcode: "" };
}

/* ─── Form data ──────────────────────────────────────────────────────── */

export interface QuotationFormData {
  // General Information
  number: string;
  title: string;
  status: QuotationStatus;
  quotationDate: string;
  validUntil: string;
  leadId: string;
  dealId: string;
  companyId: string;
  contactId: string;
  owner: string;
  salesExecutive: string;
  priority: string;
  tags: string[];
  referenceNumber: string;
  source: string;
  branch: string;
  createdBy: string;

  // Products & Services
  items: QuotationLineItem[];

  // Pricing
  gstMode: GstMode;
  overallDiscount: number;
  shipping: number;
  additionalCharges: number;
  currency: string;

  // Billing
  billing: QuotationAddress;
  shippingAddr: QuotationAddress;
  sameAsBilling: boolean;
  paymentTerms: string;
  paymentMethod: string;

  // Terms & Conditions
  terms: string;
  warrantyTerms: string;
  returnPolicy: string;
  deliveryTerms: string;
  installationNotes: string;

  // Internal Notes
  internalNotes: string;
}

export const DEFAULT_TERMS =
  "1. This quotation is valid until the date mentioned above.\n" +
  "2. Prices are inclusive of applicable taxes unless stated otherwise.\n" +
  "3. Delivery timelines commence after confirmation and advance payment.\n" +
  "4. Goods once sold are subject to the return policy noted below.";

export const DEFAULT_WARRANTY =
  "All repairs and replacement parts carry a limited service warranty. " +
  "Warranty covers manufacturing defects only and excludes physical or liquid damage.";

export const DEFAULT_RETURN_POLICY =
  "Returns are accepted within 7 days of delivery for unused items in original packaging.";

export const DEFAULT_DELIVERY_TERMS =
  "Standard delivery within 3–5 business days after payment confirmation.";

export function createQuotationForm(overrides?: Partial<QuotationFormData>): QuotationFormData {
  const today = new Date();
  const validTill = new Date(today.getTime() + 15 * 86_400_000);
  return {
    number: generateQuotationNumber(),
    title: "",
    status: "draft",
    quotationDate: today.toISOString().slice(0, 10),
    validUntil: validTill.toISOString().slice(0, 10),
    leadId: "",
    dealId: "",
    companyId: "",
    contactId: "",
    owner: "",
    salesExecutive: "",
    priority: "medium",
    tags: [],
    referenceNumber: "",
    source: "",
    branch: "",
    createdBy: "",
    items: [],
    gstMode: "intra",
    overallDiscount: 0,
    shipping: 0,
    additionalCharges: 0,
    currency: "INR",
    billing: emptyAddress(),
    shippingAddr: emptyAddress(),
    sameAsBilling: true,
    paymentTerms: "net_15",
    paymentMethod: "",
    terms: DEFAULT_TERMS,
    warrantyTerms: DEFAULT_WARRANTY,
    returnPolicy: DEFAULT_RETURN_POLICY,
    deliveryTerms: DEFAULT_DELIVERY_TERMS,
    installationNotes: "",
    internalNotes: "",
    ...overrides,
  };
}

/* ─── ID / number generation ─────────────────────────────────────────── */

export function generateQuotationNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `QT-${y}-${seq}`;
}

export function genLineId(): string {
  return `qli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createLineItem(overrides?: Partial<QuotationLineItem>): QuotationLineItem {
  const base: QuotationLineItem = {
    id: genLineId(),
    kind: "custom",
    itemId: "",
    name: "",
    sku: "",
    description: "",
    qty: 1,
    unit: "Piece",
    unitPrice: 0,
    discount: 0,
    tax: 18,
    total: 0,
    ...overrides,
  };
  base.total = computeLineTotal(base);
  return base;
}

/* ─── Calculations ───────────────────────────────────────────────────── */

/** Net total for a single line: (qty × price − discount%) + tax%. */
export function computeLineTotal(item: Pick<QuotationLineItem, "qty" | "unitPrice" | "discount" | "tax">): number {
  const gross = item.qty * item.unitPrice;
  const afterDiscount = gross - gross * (item.discount / 100);
  const withTax = afterDiscount + afterDiscount * (item.tax / 100);
  return Math.round(withTax * 100) / 100;
}

export interface QuotationTotals {
  subtotal: number;        // sum of gross (qty × price) before any discount
  itemDiscounts: number;   // sum of line-level discount amounts
  overallDiscount: number; // flat overall discount amount
  taxableBase: number;     // base on which tax is applied (after all discounts)
  tax: number;             // total GST
  cgst: number;
  sgst: number;
  igst: number;
  shipping: number;
  additionalCharges: number;
  roundOff: number;        // rounding adjustment
  grandTotal: number;      // final payable
}

export function computeTotals(form: Pick<QuotationFormData, "items" | "overallDiscount" | "shipping" | "additionalCharges" | "gstMode">): QuotationTotals {
  let subtotal = 0;
  let itemDiscounts = 0;
  let tax = 0;

  for (const it of form.items) {
    const gross = it.qty * it.unitPrice;
    const discAmt = gross * (it.discount / 100);
    const taxable = gross - discAmt;
    subtotal += gross;
    itemDiscounts += discAmt;
    tax += taxable * (it.tax / 100);
  }

  const overallDiscount = Math.max(0, form.overallDiscount || 0);
  const taxableBase = Math.max(0, subtotal - itemDiscounts - overallDiscount);
  const shipping = Math.max(0, form.shipping || 0);
  const additionalCharges = Math.max(0, form.additionalCharges || 0);

  // Split GST — intra-state → CGST + SGST (half each); inter-state → IGST.
  const cgst = form.gstMode === "intra" ? tax / 2 : 0;
  const sgst = form.gstMode === "intra" ? tax / 2 : 0;
  const igst = form.gstMode === "inter" ? tax : 0;

  const preRound = taxableBase + tax + shipping + additionalCharges;
  const grandTotal = Math.round(preRound);
  const roundOff = Math.round((grandTotal - preRound) * 100) / 100;

  return {
    subtotal: round2(subtotal),
    itemDiscounts: round2(itemDiscounts),
    overallDiscount: round2(overallDiscount),
    taxableBase: round2(taxableBase),
    tax: round2(tax),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    shipping: round2(shipping),
    additionalCharges: round2(additionalCharges),
    roundOff,
    grandTotal,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ─── Convert Quotation → Invoice (one-click, no re-typing) ──────────── */

export function quotationToInvoice(
  form: QuotationFormData,
  totals: QuotationTotals,
  resolved: { customerName: string; phone: string; email: string; company: string },
  invoiceId: string,
): Invoice {
  const items: InvoiceLineItem[] = form.items.map((it) => ({
    id: it.id,
    sku: it.sku || undefined,
    name: it.name,
    description: it.description || undefined,
    qty: it.qty,
    price: it.unitPrice,
    discount: round2(it.qty * it.unitPrice * (it.discount / 100)),
    total: it.total,
  }));

  const combinedTerms = [
    form.terms,
    form.warrantyTerms && `Warranty: ${form.warrantyTerms}`,
    form.returnPolicy && `Returns: ${form.returnPolicy}`,
    form.deliveryTerms && `Delivery: ${form.deliveryTerms}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: invoiceId,
    reference: form.number,
    invoiceType: resolved.company ? "business" : "retail",
    customer: resolved.customerName || form.title || "Customer",
    phone: resolved.phone || "",
    email: resolved.email || undefined,
    company: resolved.company || undefined,
    status: "draft",
    createdAt: new Date().toISOString(),
    dueDate: form.validUntil || new Date(Date.now() + 7 * 86_400_000).toISOString(),
    paidAmount: 0,
    items,
    subtotal: totals.subtotal,
    discount: round2(totals.itemDiscounts + totals.overallDiscount),
    tax: totals.tax,
    total: totals.grandTotal,
    notes: form.internalNotes || undefined,
    terms: combinedTerms || undefined,
    paymentMode: form.paymentMethod || undefined,
    serviceCategory: "service",
  };
}

/* ─── Supabase row mappers ───────────────────────────────────────────── */

export function quotationToRow(
  form: QuotationFormData,
  totals: QuotationTotals,
): Record<string, unknown> {
  return {
    id: form.number,
    title: form.title || null,
    status: form.status,
    quotation_date: form.quotationDate || null,
    valid_until: form.validUntil || null,
    lead_id: form.leadId || null,
    deal_id: form.dealId || null,
    company_id: form.companyId || null,
    contact_id: form.contactId || null,
    owner: form.owner || null,
    sales_executive: form.salesExecutive || null,
    priority: form.priority || null,
    tags: form.tags,
    reference_number: form.referenceNumber || null,
    source: form.source || null,
    branch: form.branch || null,
    created_by_name: form.createdBy || null,
    items: form.items,
    gst_mode: form.gstMode,
    overall_discount: form.overallDiscount,
    shipping: form.shipping,
    additional_charges: form.additionalCharges,
    currency: form.currency,
    subtotal: totals.subtotal,
    item_discounts: totals.itemDiscounts,
    tax_total: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    round_off: totals.roundOff,
    grand_total: totals.grandTotal,
    billing_address: form.billing,
    shipping_address: form.sameAsBilling ? form.billing : form.shippingAddr,
    payment_terms: form.paymentTerms || null,
    payment_method: form.paymentMethod || null,
    terms: form.terms || null,
    warranty_terms: form.warrantyTerms || null,
    return_policy: form.returnPolicy || null,
    delivery_terms: form.deliveryTerms || null,
    installation_notes: form.installationNotes || null,
    internal_notes: form.internalNotes || null,
  };
}

/* ─── Sample linking data ────────────────────────────────────────────────
   The Leads domain (leads / deals) does not yet have a Supabase-backed data
   layer, so these curated samples make smart-linking demonstrable out of the
   box. When real Lead/Deal records exist in Supabase they are merged in and
   take precedence. Companies & Contacts come from the live store first. ── */

export interface SampleLead {
  id: string;
  name: string;
  companyId?: string;
  contactId?: string;
  dealId?: string;
  source?: string;
}

export interface SampleDeal {
  id: string;
  title: string;
  companyId?: string;
  contactId?: string;
  items?: Partial<QuotationLineItem>[];
}

export interface SampleParty {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: Partial<QuotationAddress>;
  gst?: string;
}

export const SAMPLE_COMPANIES: SampleParty[] = [
  { id: "CMP-TECHNOVA", name: "TechNova Pvt Ltd", phone: "+91 98765 43210", email: "accounts@technova.in", gst: "29AABCT1234A1Z5", address: { line1: "12 MG Road, Indiranagar", city: "Bengaluru", state: "Karnataka", country: "India", zipcode: "560038" } },
  { id: "CMP-NEXACORE", name: "NexaCore Labs", phone: "+91 43210 98765", email: "billing@nexacore.in", gst: "24AABCN5678B1Z3", address: { line1: "88 SG Highway", city: "Ahmedabad", state: "Gujarat", country: "India", zipcode: "380015" } },
  { id: "CMP-GREENLEAF", name: "GreenLeaf Org", phone: "+91 65432 10987", email: "ops@greenleaf.org", gst: "07AABCG9012C1Z1", address: { line1: "45 Connaught Place", city: "New Delhi", state: "Delhi", country: "India", zipcode: "110001" } },
];

export const SAMPLE_CONTACTS: SampleParty[] = [
  { id: "CON-AARAV", name: "Aarav Mehta", phone: "+91 98765 43210", email: "aarav@technova.in", address: { line1: "12 MG Road, Indiranagar", city: "Bengaluru", state: "Karnataka", country: "India", zipcode: "560038" } },
  { id: "CON-FALGUNI", name: "Falguni Patel", phone: "+91 43210 98765", email: "falguni@nexacore.in", address: { line1: "88 SG Highway", city: "Ahmedabad", state: "Gujarat", country: "India", zipcode: "380015" } },
  { id: "CON-DIYA", name: "Diya Sen", phone: "+91 65432 10987", email: "diya@greenleaf.org", address: { line1: "45 Connaught Place", city: "New Delhi", state: "Delhi", country: "India", zipcode: "110001" } },
];

export const SAMPLE_DEALS: SampleDeal[] = [
  {
    id: "D-001",
    title: "iPhone Fleet Repair Contract",
    companyId: "CMP-TECHNOVA",
    contactId: "CON-AARAV",
    items: [
      { kind: "service", name: "iPhone Screen Replacement", sku: "SVC-SCR", qty: 10, unit: "Service", unitPrice: 4500, tax: 18 },
      { kind: "service", name: "Battery Replacement", sku: "SVC-BAT", qty: 10, unit: "Service", unitPrice: 1800, tax: 18 },
    ],
  },
  {
    id: "D-002",
    title: "MacBook Bulk Service Agreement",
    companyId: "CMP-NEXACORE",
    contactId: "CON-FALGUNI",
    items: [
      { kind: "service", name: "Logic Board Repair", sku: "SVC-LB", qty: 8, unit: "Service", unitPrice: 8500, tax: 18 },
    ],
  },
  {
    id: "D-003",
    title: "iPad Classroom Setup",
    companyId: "CMP-GREENLEAF",
    contactId: "CON-DIYA",
    items: [
      { kind: "product", name: "Tempered Glass — Universal", sku: "ACC-TG", qty: 30, unit: "Piece", unitPrice: 450, tax: 18 },
    ],
  },
];

export const SAMPLE_LEADS: SampleLead[] = [
  { id: "L-001", name: "Aarav Mehta — TechNova", companyId: "CMP-TECHNOVA", contactId: "CON-AARAV", dealId: "D-001", source: "google" },
  { id: "L-002", name: "Falguni Patel — NexaCore", companyId: "CMP-NEXACORE", contactId: "CON-FALGUNI", dealId: "D-002", source: "referral" },
  { id: "L-003", name: "Diya Sen — GreenLeaf", companyId: "CMP-GREENLEAF", contactId: "CON-DIYA", dealId: "D-003", source: "social" },
];

export const OWNER_OPTIONS = [
  { label: "Prerit Admin", value: "prerit" },
  { label: "Kalai S.", value: "kalai" },
  { label: "Manoj S.", value: "manoj" },
  { label: "Ritesh Kumar", value: "ritesh" },
];

export const BRANCH_OPTIONS = [
  { label: "Main Store", value: "main" },
  { label: "Service Counter", value: "service_counter" },
  { label: "Warehouse A", value: "warehouse_a" },
  { label: "Branch — Andheri", value: "andheri" },
];
