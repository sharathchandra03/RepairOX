import type { StoreSettings, CustomPrintTemplate } from "@/lib/store-settings";
import type { Ticket, Invoice, InvoiceLineItem, DeviceRecord, InvoiceDeviceRecord } from "@/lib/mock-data";
import { getTicketDevices, getInvoiceDevices } from "@/lib/mock-data";
import { identifierDisplayLabel } from "@/lib/identifier-detection";

/* ─── Print Format Types ─────────────────────────────────────────────── */

export type PrintFormat = "a4" | "thermal" | "label";
export type PrintDocumentType = "ticket" | "invoice";

/* ─── Print Data Shapes ──────────────────────────────────────────────── */

export type PrintStoreInfo = {
  logo: string;
  storeName: string;
  alternateName: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  postCode: string;
  country: string;
  registrationNumber: string;
  hsnCode: string;
  fullAddress: string;
};

export type PrintCustomerInfo = {
  name: string;
  phone: string;
  email: string;
  address: string;
  company: string;
};

export type PrintTicketInfo = {
  ticketId: string;
  device: string;
  model: string;
  serial: string;
  /** Type-aware label for the identifier ("IMEI" or "Serial") — travels with
   *  the value so print never mislabels a serial as IMEI or vice-versa. */
  serialLabel: string;
  issue: string;
  service: string;
  source: string;
  priority: string;
  status: string;
  technician: string;
  warranty: string;
  createdAt: string;
  dueDate: string;
  amount: number;
  customerType?: "personal" | "business";
  gstNumber?: string;
  gstRate?: number;
  sgstRate?: number;
  cgstRate?: number;
  sgst?: number;
  cgst?: number;
  parts: PrintLineItem[];
  /** Multi-device: individual device sections for print */
  devices?: PrintDeviceInfo[];
};

export type PrintDeviceInfo = {
  id: string;
  brand: string;
  model: string;
  serial: string;
  /** Type-aware identifier label ("IMEI" | "Serial"). */
  serialLabel: string;
  issue: string;
  service: string;
  technician: string;
  priority: string;
  status: string;
  warranty: string;
  parts: PrintLineItem[];
  estimate: number;
  /** User accessories handed in with the device (optional). */
  accessories?: string;
  /** Free-text notes for the device (optional). */
  notes?: string;
};

export type PrintLineItem = {
  name: string;
  description?: string;
  qty: number;
  price: number;
  discount: number;
  total: number;
};

export type PrintInvoiceInfo = {
  invoiceId: string;
  invoiceType: string;
  status: string;
  createdAt: string;
  dueDate: string;
  items: PrintLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  gstRate?: number;
  sgst?: number;
  cgst?: number;
  sgstRate?: number;
  cgstRate?: number;
  gstNumber?: string;
  total: number;
  paidAmount: number;
  balance: number;
  notes: string;
  terms: string;
  footer: string;
  employee: string;
  /** Stable primary key of the linked ticket (empty when none). */
  ticketId: string;
  /** Human-readable linked ticket number for display (T-045). */
  linkedTicketNo?: string;
  paymentMode?: string;
  /** Service category — "service" or "accessories" */
  serviceCategory?: string;
  /** Multi-device: individual device sections for print */
  devices?: PrintInvoiceDeviceInfo[];
};

export type PrintInvoiceDeviceInfo = {
  id: string;
  brand: string;
  model: string;
  serial: string;
  /** Type-aware identifier label ("IMEI" | "Serial"). */
  serialLabel: string;
  issue: string;
  jobType: string;
  priority: string;
  warranty: string;
  warrantyValue?: number;
  warrantyUnit?: "days" | "months" | "years";
  technician: string;
  notes: string;
  parts: PrintLineItem[];
  subtotal: number;
};

export type PrintDocumentData = {
  store: PrintStoreInfo;
  customer: PrintCustomerInfo;
  ticket?: PrintTicketInfo;
  invoice?: PrintInvoiceInfo;
  printTitle: string;
  printDate: string;
  printTime: string;
  termsAndConditions: string;
  warrantyText: string;
  printFooter: string;
};

/* ─── Data Assembly Functions ────────────────────────────────────────── */

export function buildStoreInfo(settings: StoreSettings): PrintStoreInfo {
  const parts = [settings.address, settings.city, settings.state, settings.postCode, settings.country].filter(Boolean);
  return {
    logo: settings.logo,
    storeName: settings.storeName,
    alternateName: settings.alternateName,
    phone: settings.phone,
    mobile: settings.mobile,
    email: settings.email,
    website: settings.website,
    address: settings.address,
    city: settings.city,
    state: settings.state,
    postCode: settings.postCode,
    country: settings.country,
    registrationNumber: settings.registrationNumber,
    hsnCode: settings.hsnCode || "",
    fullAddress: parts.join(", "),
  };
}

export function buildCustomerFromTicket(ticket: Ticket): PrintCustomerInfo {
  return {
    name: ticket.customer,
    phone: ticket.phone,
    email: ticket.email || "",
    address: ticket.address || "",
    company: ticket.company || "",
  };
}

export function buildCustomerFromInvoice(invoice: Invoice): PrintCustomerInfo {
  return {
    name: invoice.customer,
    phone: invoice.phone,
    email: invoice.email || "",
    address: "",
    company: invoice.company || "",
  };
}

export function buildTicketInfo(ticket: Ticket): PrintTicketInfo {
  const allParts: PrintLineItem[] = (ticket.parts || []).map((p) => ({
    name: p.name,
    qty: p.qty,
    price: p.unitPrice,
    discount: 0,
    total: p.total,
  }));

  // Build per-device print info
  const ticketDevices = getTicketDevices(ticket);
  const printDevices: PrintDeviceInfo[] = ticketDevices.map((dr) => ({
    id: dr.id,
    brand: dr.brand,
    model: dr.model,
    serial: dr.imei,
    serialLabel: identifierDisplayLabel(dr.imeiType, dr.imei),
    issue: dr.issue || dr.description,
    service: dr.issue,
    technician: dr.assignedTo,
    priority: dr.priority,
    status: dr.status,
    warranty: dr.warranty || "",
    parts: dr.parts.map((p) => ({ name: p.name, qty: p.qty, price: p.unitPrice, discount: 0, total: p.total })),
    estimate: dr.estimate,
    accessories: dr.accessories || "",
    notes: dr.notes || "",
  }));

  return {
    ticketId: ticket.ticketNo ?? ticket.id,
    device: ticket.device,
    model: ticket.model,
    serial: ticket.items?.[0]?.serial || "",
    serialLabel: identifierDisplayLabel(ticket.imeiType, ticket.items?.[0]?.serial),
    issue: ticket.issue,
    service: ticket.service || "",
    source: ticket.source || "Walk-In",
    priority: ticket.priority,
    status: ticket.status,
    technician: ticket.technician,
    warranty: ticketDevices[0]?.warranty || "",
    createdAt: ticket.createdAt,
    dueDate: ticket.dueDate || "",
    amount: ticket.amount,
    customerType: ticket.customerType,
    gstNumber: ticket.gstNumber,
    gstRate: ticket.gstRate,
    sgstRate: ticket.sgstRate,
    cgstRate: ticket.cgstRate,
    sgst: ticket.sgst,
    cgst: ticket.cgst,
    parts: allParts,
    devices: printDevices.length > 0 ? printDevices : undefined,
  };
}

export function buildInvoiceInfo(invoice: Invoice, linkedTicketNo?: string): PrintInvoiceInfo {
  const items: PrintLineItem[] = invoice.items.map((item) => ({
    name: item.name,
    description: item.description,
    qty: item.qty,
    price: item.price,
    discount: item.discount,
    total: item.total,
  }));

  // Build per-device print info
  const invoiceDevices = getInvoiceDevices(invoice);
  const hasMultiDevice = invoice.devices && invoice.devices.length > 0;
  const printDevices: PrintInvoiceDeviceInfo[] | undefined = hasMultiDevice
    ? invoiceDevices.map((d) => ({
        id: d.id,
        brand: d.brand,
        model: d.model,
        serial: d.imei,
        serialLabel: identifierDisplayLabel(d.imeiType, d.imei),
        issue: d.issue,
        jobType: d.jobType,
        priority: d.priority,
        warranty: d.warranty,
        warrantyValue: d.warrantyValue,
        warrantyUnit: d.warrantyUnit,
        technician: d.technician,
        notes: d.notes,
        parts: d.parts.map((p) => ({ name: p.name, description: p.description, qty: p.qty, price: p.price, discount: p.discount, total: p.total })),
        subtotal: d.subtotal,
      }))
    : undefined;

  return {
    invoiceId: invoice.id,
    invoiceType: invoice.invoiceType,
    status: invoice.status,
    createdAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    items,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    gstRate: invoice.gstRate,
    sgst: invoice.sgst,
    cgst: invoice.cgst,
    sgstRate: invoice.sgstRate,
    cgstRate: invoice.cgstRate,
    gstNumber: invoice.gstNumber,
    total: invoice.total,
    paidAmount: invoice.paidAmount,
    balance: invoice.total - invoice.paidAmount,
    notes: invoice.notes || "",
    terms: invoice.terms || "",
    footer: invoice.footer || "",
    employee: invoice.employee || "",
    ticketId: invoice.ticketId || "",
    linkedTicketNo: linkedTicketNo || undefined,
    paymentMode: invoice.paymentMode || undefined,
    serviceCategory: invoice.serviceCategory || "service",
    devices: printDevices,
  };
}

/* ─── Full Document Assembly ─────────────────────────────────────────── */

export function buildTicketPrintData(
  settings: StoreSettings,
  ticket: Ticket,
): PrintDocumentData {
  const now = new Date();
  return {
    store: buildStoreInfo(settings),
    customer: buildCustomerFromTicket(ticket),
    ticket: buildTicketInfo(ticket),
    printTitle: "Service Report",
    printDate: now.toLocaleDateString("en-IN", { dateStyle: "medium" }),
    printTime: now.toLocaleTimeString("en-IN", { timeStyle: "short" }),
    // Ticket documents use Settings → Tickets → Terms & Notes as their source
    // of truth. They no longer inherit from Store Information.
    termsAndConditions: settings.ticketTerms,
    warrantyText: settings.ticketWarrantyText,
    printFooter: settings.ticketFooter,
  };
}

export function buildInvoicePrintData(
  settings: StoreSettings,
  invoice: Invoice,
  linkedTicketNo?: string,
): PrintDocumentData {
  const now = new Date();
  // Determine print title based on invoice type + service category
  let title: string;
  if (invoice.invoiceType === "business") {
    title = "Tax Invoice";
  } else if (invoice.serviceCategory === "accessories") {
    title = "Accessories Invoice";
  } else {
    title = "Retail Invoice";
  }
  return {
    store: buildStoreInfo(settings),
    customer: buildCustomerFromInvoice(invoice),
    invoice: buildInvoiceInfo(invoice, linkedTicketNo),
    printTitle: title,
    printDate: now.toLocaleDateString("en-IN", { dateStyle: "medium" }),
    printTime: now.toLocaleTimeString("en-IN", { timeStyle: "short" }),
    // Invoice documents use Settings → Invoice → Terms & Notes as their source
    // of truth. Per-invoice terms/footer are seeded from those defaults at
    // creation and persisted on the invoice (see invoice/create). We therefore
    // fill these generic slots from the invoice's own persisted values, falling
    // back to the current invoice-settings defaults — never Store Information.
    termsAndConditions: invoice.terms || settings.invoiceTerms,
    warrantyText: settings.invoiceWarrantyText,
    printFooter: invoice.footer || settings.invoiceFooter,
  };
}

/* ─── Master Default + Custom Templates ──────────────────────────────────
 *
 * The store-level print fields (termsAndConditions / warrantyText / printFooter
 * / printSlogan) act as the MASTER DEFAULT. Tickets and invoices do NOT use it —
 * they are independent. It exists so that NEW document types (quotation,
 * estimate, delivery note, …) can inherit a single house style, optionally
 * overriding per template.
 *
 * To wire a future document type: register a CustomPrintTemplate in
 * Settings → Store → Printing, then at print time call
 * `resolveCustomTemplate(settings, templateId)` to get the effective text and
 * feed it into buildCustomTemplatePrintData().
 * ──────────────────────────────────────────────────────────────────────── */

/** The store master-default print text (single house style). */
export type ResolvedPrintText = {
  termsAndConditions: string;
  warrantyText: string;
  printFooter: string;
  printSlogan: string;
};

/** Returns the store master-default text as-is. */
export function resolveStoreMaster(settings: StoreSettings): ResolvedPrintText {
  return {
    termsAndConditions: settings.termsAndConditions,
    warrantyText: settings.warrantyText,
    printFooter: settings.printFooter,
    printSlogan: settings.printSlogan,
  };
}

/**
 * Resolve the effective print text for a custom template.
 * A blank field on the template inherits the store master default when
 * `inheritFromStore` is true; otherwise the (possibly blank) template value is
 * used verbatim. Returns null when the template id doesn't exist.
 */
export function resolveCustomTemplate(
  settings: StoreSettings,
  templateId: string,
): ResolvedPrintText | null {
  const tpl = settings.customPrintTemplates.find((t) => t.id === templateId);
  if (!tpl) return null;
  const master = resolveStoreMaster(settings);
  const pick = (value: string, fallback: string) =>
    value?.trim() ? value : tpl.inheritFromStore ? fallback : value ?? "";
  return {
    termsAndConditions: pick(tpl.terms, master.termsAndConditions),
    warrantyText: pick(tpl.warrantyText, master.warrantyText),
    printFooter: pick(tpl.footer, master.printFooter),
    printSlogan: pick(tpl.slogan, master.printSlogan),
  };
}

/**
 * Assemble a PrintDocumentData for a custom document type using a resolved
 * template. `base` supplies the document-specific bits (title, customer, and
 * any ticket/invoice payload the future type reuses). This reuses the existing
 * A4/thermal templates unchanged — only the source of Terms/Notes differs.
 */
export function buildCustomTemplatePrintData(
  settings: StoreSettings,
  templateId: string,
  base: {
    printTitle: string;
    customer: PrintCustomerInfo;
    ticket?: PrintTicketInfo;
    invoice?: PrintInvoiceInfo;
  },
): PrintDocumentData | null {
  const resolved = resolveCustomTemplate(settings, templateId);
  if (!resolved) return null;
  const now = new Date();
  return {
    store: buildStoreInfo(settings),
    customer: base.customer,
    ticket: base.ticket,
    invoice: base.invoice,
    printTitle: base.printTitle,
    printDate: now.toLocaleDateString("en-IN", { dateStyle: "medium" }),
    printTime: now.toLocaleTimeString("en-IN", { timeStyle: "short" }),
    termsAndConditions: resolved.termsAndConditions,
    warrantyText: resolved.warrantyText,
    printFooter: resolved.printFooter,
  };
}

/* ─── Formatting Helpers ─────────────────────────────────────────────── */

export function formatPrintDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export function formatPrintTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { timeStyle: "short" });
}

export function formatPrintDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatPrintCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ─── Print URL Builders ─────────────────────────────────────────────── */

export function getTicketPrintUrl(ticketId: string, format: PrintFormat): string {
  return `/print/ticket/${encodeURIComponent(ticketId)}?format=${format}`;
}

export function getInvoicePrintUrl(invoiceId: string, format: PrintFormat): string {
  return `/print/invoice/${encodeURIComponent(invoiceId)}?format=${format}`;
}
