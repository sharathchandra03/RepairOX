import type { StoreSettings } from "@/lib/store-settings";
import type { Ticket, Invoice, InvoiceLineItem } from "@/lib/mock-data";

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
  issue: string;
  service: string;
  source: string;
  priority: string;
  status: string;
  technician: string;
  createdAt: string;
  dueDate: string;
  amount: number;
  parts: PrintLineItem[];
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
  reference: string;
  invoiceType: string;
  status: string;
  createdAt: string;
  dueDate: string;
  items: PrintLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  balance: number;
  notes: string;
  terms: string;
  footer: string;
  employee: string;
  ticketId: string;
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
  const parts: PrintLineItem[] = (ticket.parts || []).map((p) => ({
    name: p.name,
    qty: p.qty,
    price: p.unitPrice,
    discount: 0,
    total: p.total,
  }));

  return {
    ticketId: ticket.id,
    device: ticket.device,
    model: ticket.model,
    serial: ticket.items?.[0]?.serial || "",
    issue: ticket.issue,
    service: ticket.service || "",
    source: ticket.source || "Walk-In",
    priority: ticket.priority,
    status: ticket.status,
    technician: ticket.technician,
    createdAt: ticket.createdAt,
    dueDate: ticket.dueDate || "",
    amount: ticket.amount,
    parts,
  };
}

export function buildInvoiceInfo(invoice: Invoice): PrintInvoiceInfo {
  const items: PrintLineItem[] = invoice.items.map((item) => ({
    name: item.name,
    description: item.description,
    qty: item.qty,
    price: item.price,
    discount: item.discount,
    total: item.total,
  }));

  return {
    invoiceId: invoice.id,
    reference: invoice.reference,
    invoiceType: invoice.invoiceType,
    status: invoice.status,
    createdAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    items,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    total: invoice.total,
    paidAmount: invoice.paidAmount,
    balance: invoice.total - invoice.paidAmount,
    notes: invoice.notes || "",
    terms: invoice.terms || "",
    footer: invoice.footer || "",
    employee: invoice.employee || "",
    ticketId: invoice.ticketId || "",
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
    termsAndConditions: settings.termsAndConditions,
    warrantyText: settings.warrantyText,
    printFooter: settings.printFooter,
  };
}

export function buildInvoicePrintData(
  settings: StoreSettings,
  invoice: Invoice,
): PrintDocumentData {
  const now = new Date();
  const title = invoice.invoiceType === "business" ? "Tax Invoice" : "Invoice";
  return {
    store: buildStoreInfo(settings),
    customer: buildCustomerFromInvoice(invoice),
    invoice: buildInvoiceInfo(invoice),
    printTitle: title,
    printDate: now.toLocaleDateString("en-IN", { dateStyle: "medium" }),
    printTime: now.toLocaleTimeString("en-IN", { timeStyle: "short" }),
    termsAndConditions: settings.termsAndConditions,
    warrantyText: settings.warrantyText,
    printFooter: settings.printFooter,
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
