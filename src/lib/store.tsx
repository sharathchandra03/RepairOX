"use client";

/**
 * RepairOX — Central Business Data Store (Supabase-first).
 *
 * When Supabase is configured, ALL business data (tickets, invoices, walk-ins,
 * inventory, customers, brands/models) is loaded from the database on mount,
 * kept in sync via Supabase Realtime subscriptions, and every mutation writes
 * to the DB first. The UI only updates after a successful DB write.
 *
 * When Supabase is NOT configured (local prototype mode), falls back to
 * localStorage so nothing breaks offline — same dual-mode as tasks.ts.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { logActivity, buildChanges, type ActivitySeverity } from "./activity-log";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { demoKey } from "@/lib/demo-mode";
import {
  tickets as SEED_TICKETS, ordersStatus as SEED_ORDERS, revenueMonthly as SEED_REVENUE,
  TEAM_SEED, invoices as SEED_INVOICES, walkIns as SEED_WALKINS,
  STATUS_LABEL, type Ticket, type TicketStatus, type TicketPart,
  type TeamMember, type Invoice, type WalkIn,
} from "@/lib/mock-data";
import {
  inventoryItems as SEED_INVENTORY, stockMovements as SEED_MOVEMENTS,
  type InventoryItem, type StockMovement,
} from "@/lib/inventory-data";
import { seedCustomers as SEED_CUSTOMERS, type Customer } from "@/lib/customer-data";
import { seedCompanies as SEED_COMPANIES, type Company } from "@/lib/company-data";
import {
  seedBrands as SEED_BRANDS, seedModels as SEED_MODELS,
  type Brand, type DeviceModel,
} from "@/lib/brand-model-data";
import {
  SEED_ASSIGNED_BY_OPTIONS, type AssignedByOption,
} from "@/lib/assigned-by-data";
import {
  SEED_ASSIGNED_TO_OPTIONS, type AssignedToOption,
} from "@/lib/assigned-to-data";
import { DEFAULT_ISSUES } from "@/lib/issue-library";

/* ─── Types ──────────────────────────────────────────────────────────── */

export type OrderStatus = { detail: string; assigned: number; received: number };
export type RevenueMonth = { m: string; v: number };

interface StoreState {
  tickets: Ticket[];
  invoices: Invoice[];
  walkIns: WalkIn[];
  orders: OrderStatus[];
  revenue: RevenueMonth[];
  team: TeamMember[];
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  customers: Customer[];
  companies: Company[];
  brands: Brand[];
  deviceModels: DeviceModel[];
  assignedByOptions: AssignedByOption[];
  assignedToOptions: AssignedToOption[];
  /** Global issue library — issues saved from ticket forms appear here */
  issueLibrary: string[];
  /** True once initial DB load completes (or localStorage is read). */
  hydrated: boolean;
  /** "db" when Supabase is active, "local" otherwise. */
  mode: "db" | "local";
}

interface StoreActions {
  addTicket: (ticket: Ticket) => Promise<string>;
  pinTicket: (id: string, pinned: boolean) => Promise<void>;
  pinInvoice: (id: string, pinned: boolean) => Promise<void>;
  updateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  bulkUpdateStatus: (ids: string[], status: TicketStatus) => Promise<void>;
  addInvoice: (invoice: Invoice) => Promise<string>;
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  addWalkIn: (walkIn: WalkIn) => Promise<void>;
  updateWalkIn: (id: string, updates: Partial<WalkIn>) => Promise<void>;
  deleteWalkIn: (id: string) => Promise<void>;
  updateTeamMember: (email: string, updates: Partial<TeamMember>) => void;
  deductPartsForTicket: (ticketId: string) => Promise<void>;
  addStockMovement: (movement: StockMovement) => Promise<void>;
  addInventoryItem: (item: InventoryItem) => Promise<void>;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addCompany: (company: Company) => Promise<void>;
  updateCompany: (id: string, updates: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  addBrand: (brand: Brand) => Promise<void>;
  addDeviceModel: (model: DeviceModel) => Promise<void>;
  deleteBrand: (id: string) => Promise<void>;
  deleteDeviceModel: (id: string) => Promise<void>;
  addAssignedByOption: (option: AssignedByOption) => Promise<void>;
  addAssignedToOption: (option: AssignedToOption) => Promise<void>;
  deleteAssignedByOption: (id: string) => Promise<void>;
  deleteAssignedToOption: (id: string) => Promise<void>;
  addIssueToStore: (issue: string) => void;
  deleteIssueFromStore: (issue: string) => void;
  resetBrandsAndModels: () => void;
}

type Store = StoreState & StoreActions;

/* ─── Row <-> App Model Mappers ──────────────────────────────────────── */

function rowToTicket(r: any): Ticket {
  // devices column stores both device records and metadata (customerType, GST fields)
  const rawDevices = r.devices ?? {};
  const isLegacyArray = Array.isArray(rawDevices);
  const deviceRecords = isLegacyArray ? rawDevices : (rawDevices.records ?? []);
  const meta = isLegacyArray ? {} : rawDevices;
  return {
    id: r.id,
    customer: r.customer ?? "",
    phone: r.phone ?? "",
    company: r.company ?? undefined,
    device: r.device ?? "",
    model: r.model ?? "",
    issue: r.issue ?? "",
    items: r.items ?? [],
    parts: r.parts ?? [],
    status: r.status ?? "in_progress",
    priority: r.priority ?? "normal",
    technician: r.technician ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    dueDate: r.due_date ?? undefined,
    resolutionMinutes: r.resolution_minutes ?? undefined,
    amount: Number(r.amount ?? 0),
    service: r.service ?? undefined,
    internalNotes: r.internal_notes ?? undefined,
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    source: r.source ?? undefined,
    discount: Number(r.discount ?? 0),
    imeiType: r.imei_type ?? undefined,
    qcStatus: r.qc_status ?? undefined,
    customerId: r.customer_id ?? undefined,
    customerType: meta.customerType ?? undefined,
    gstNumber: meta.gstNumber ?? undefined,
    gstRate: meta.gstRate != null ? Number(meta.gstRate) : undefined,
    sgstRate: meta.sgstRate != null ? Number(meta.sgstRate) : undefined,
    cgstRate: meta.cgstRate != null ? Number(meta.cgstRate) : undefined,
    sgst: meta.sgst != null ? Number(meta.sgst) : undefined,
    cgst: meta.cgst != null ? Number(meta.cgst) : undefined,
    devices: deviceRecords,
    pinnedAt: r.pinned_at ?? undefined,
    ticketNo: r.ticket_no ?? undefined,
  };
}

function ticketToRow(t: Ticket): Record<string, unknown> {
  return {
    id: t.id,
    ticket_no: t.ticketNo ?? null,
    customer: t.customer || null,
    phone: t.phone || null,
    company: t.company || null,
    device: t.device || null,
    model: t.model || null,
    issue: t.issue || null,
    items: t.items ?? [],
    parts: t.parts ?? [],
    status: t.status,
    priority: t.priority,
    technician: t.technician || null,
    due_date: t.dueDate || null,
    resolution_minutes: t.resolutionMinutes ?? null,
    amount: t.amount,
    service: t.service || null,
    internal_notes: t.internalNotes || null,
    email: t.email || null,
    address: t.address || null,
    source: t.source || null,
    discount: t.discount ?? 0,
    imei_type: t.imeiType || null,
    qc_status: t.qcStatus || null,
    customer_id: t.customerId || null,
    pinned_at: t.pinnedAt ?? null,
    devices: {
      records: t.devices ?? [],
      customerType: t.customerType || null,
      gstNumber: t.gstNumber || null,
      gstRate: t.gstRate ?? null,
      sgstRate: t.sgstRate ?? null,
      cgstRate: t.cgstRate ?? null,
      sgst: t.sgst ?? null,
      cgst: t.cgst ?? null,
    },
  };
}

function rowToInvoice(r: any): Invoice {
  // devices column stores both device records and metadata
  const rawDevices = r.devices ?? {};
  const isLegacyArray = Array.isArray(rawDevices);
  const deviceRecords = isLegacyArray ? rawDevices : (rawDevices.records ?? []);
  const meta = isLegacyArray ? {} : rawDevices;
  return {
    id: r.id,
    reference: r.reference ?? "",
    invoiceType: r.invoice_type ?? "retail",
    customer: r.customer ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    company: r.company ?? "",
    status: r.status ?? "draft",
    dueDate: r.due_date ?? "",
    paidAmount: Number(r.paid_amount ?? 0),
    subtotal: Number(r.subtotal ?? 0),
    discount: Number(r.discount ?? 0),
    tax: Number(r.tax ?? 0),
    total: Number(r.total ?? 0),
    notes: r.notes ?? "",
    terms: r.terms ?? "",
    slogan: r.slogan ?? "",
    footer: r.footer ?? "",
    employee: r.employee ?? "",
    ticketId: r.ticket_id ?? undefined,
    repairStatus: meta.repairStatus ?? undefined,
    paymentMode: meta.paymentMode ?? r.payment_mode ?? undefined,
    serviceCategory: meta.serviceCategory ?? r.service_category ?? "service",
    gstRate: meta.gstRate != null ? Number(meta.gstRate) : undefined,
    sgstRate: meta.sgstRate != null ? Number(meta.sgstRate) : undefined,
    cgstRate: meta.cgstRate != null ? Number(meta.cgstRate) : undefined,
    sgst: meta.sgst != null ? Number(meta.sgst) : undefined,
    cgst: meta.cgst != null ? Number(meta.cgst) : undefined,
    gstNumber: meta.gstNumber ?? undefined,
    items: r.items ?? [],
    devices: deviceRecords,
    createdAt: r.created_at ?? new Date().toISOString(),
    pinnedAt: r.pinned_at ?? undefined,
  };
}

function invoiceToRow(inv: Invoice): Record<string, unknown> {
  return {
    id: inv.id,
    reference: inv.reference || null,
    invoice_type: inv.invoiceType ?? "retail",
    customer: inv.customer || null,
    phone: inv.phone || null,
    email: inv.email || null,
    company: inv.company || null,
    status: inv.status,
    due_date: inv.dueDate || null,
    paid_amount: inv.paidAmount ?? 0,
    subtotal: inv.subtotal ?? 0,
    discount: inv.discount ?? 0,
    tax: inv.tax ?? 0,
    total: inv.total ?? 0,
    notes: inv.notes || null,
    terms: inv.terms || null,
    slogan: inv.slogan || null,
    footer: inv.footer || null,
    employee: inv.employee || null,
    ticket_id: inv.ticketId || null,
    pinned_at: inv.pinnedAt ?? null,
    items: inv.items ?? [],
    devices: {
      records: inv.devices ?? [],
      repairStatus: inv.repairStatus ?? null,
      paymentMode: inv.paymentMode || null,
      serviceCategory: inv.serviceCategory || "service",
      gstRate: inv.gstRate ?? null,
      sgstRate: inv.sgstRate ?? null,
      cgstRate: inv.cgstRate ?? null,
      sgst: inv.sgst ?? null,
      cgst: inv.cgst ?? null,
      gstNumber: inv.gstNumber || null,
    },
  };
}

/** True when a Supabase error is a primary-key / unique-constraint violation. */
function isDuplicateKeyError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "23505" || /duplicate key|already exists/i.test(err.message ?? "");
}

/** True when a Supabase error is about an unknown column (schema not yet migrated).
 *  Covers Postgres 42703 and PostgREST's PGRST204 ("Could not find the 'X'
 *  column ... in the schema cache"). */
function isUndefinedColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(err.message ?? "")
  );
}

/** Extract the offending column name from an undefined-column error message,
 *  e.g. "Could not find the 'pinned_at' column ..." → "pinned_at". Returns null
 *  when it can't be determined. */
function extractMissingColumn(err: { message?: string } | null): string | null {
  const m = err?.message ?? "";
  const q = m.match(/'([^']+)'\s+column/i) || m.match(/column\s+"?([a-z_]+)"?/i);
  return q ? q[1] : null;
}

/** Return a shallow copy of a row object with the given keys removed. */
function omitKeys(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out = { ...row };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * True when a Supabase error indicates the request was rejected by Row-Level
 * Security or an expired/absent auth session — i.e. the write ran without a
 * valid logged-in identity. Postgres raises 42501 (insufficient privilege) for
 * RLS `with check` failures; PostgREST surfaces JWT problems with a "JWT"
 * message or HTTP 401. These are RECOVERABLE by re-authenticating, so we tell
 * the user to sign in again rather than showing a generic "try again".
 */
function isAuthOrRlsError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42501" ||
    err.code === "PGRST301" ||
    /row-level security|violates row-level security|jwt (expired|invalid)|not authenticated|permission denied/i.test(err.message ?? "")
  );
}

/**
 * Compute the next sequential invoice id straight from the DB, counting ALL rows
 * of that type — including soft-deleted ones, which keep their primary key.
 * The in-memory list only holds live invoices, so relying on it can regenerate
 * an id that still belongs to a soft-deleted row and collide on insert.
 */
async function nextInvoiceIdFromDb(type: string): Promise<string> {
  const prefix = type === "business" ? "INVG" : "INV";
  let maxNum = 0;
  if (supabase) {
    const { data } = await supabase.from("invoices").select("id").eq("invoice_type", type);
    maxNum = (data ?? []).reduce((max: number, r: { id: string }) => {
      const match = String(r.id).match(/\d+$/);
      return match ? Math.max(max, parseInt(match[0], 10)) : max;
    }, 0);
  }
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

/** Format a ticket sequence number as `T-001` (zero-padded to at least 3 digits,
 *  growing automatically past T-999). */
function formatTicketNo(n: number): string {
  return `T-${String(n).padStart(3, "0")}`;
}

/**
 * Generate a unique primary-key `id` for a new ticket. This is deliberately NOT
 * in the `T-<seq>` display namespace so it can never collide with a sequential
 * `ticket_no` (live or soft-deleted). Uses a time component plus randomness to
 * make collisions effectively impossible. Format: `TK-<base36 time>-<rand>`.
 */
function genUniqueTicketId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `TK-${time}-${rand}`;
}

/** Extract the numeric part of a `T-<digits>` value, or 0 if it doesn't match. */
function ticketSeq(value: string | null | undefined): number {
  const match = String(value ?? "").match(/^T-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Compute the next sequential ticket NUMBER (display value) straight from the DB.
 * The next number is always `highest LIVE ticket_no + 1`.
 *
 * IMPORTANT: only the `ticket_no` column of non-deleted tickets is considered —
 * NOT the primary-key `id`. Historically `id` held a random 4-digit value
 * (e.g. T-9900), so folding `id` into this calculation poisoned the sequence and
 * produced numbers like T-9901. Deleted rows carry `ticket_no = null` and their
 * numbers are reclaimed by resequenceTicketNumbers(), so excluding them keeps the
 * next number aligned with the visible T-001…T-NNN run. Falls back to a
 * best-effort value only when Supabase is unavailable.
 */
export async function nextTicketIdFromDb(): Promise<string> {
  let maxNum = 0;
  if (supabase) {
    const { data } = await supabase
      .from("tickets")
      .select("ticket_no")
      .is("deleted_at", null);
    maxNum = (data ?? []).reduce((max: number, r: { ticket_no?: string }) => {
      return Math.max(max, ticketSeq(r.ticket_no));
    }, 0);
  }
  return formatTicketNo(maxNum + 1);
}

/**
 * One-time (idempotent) resequencing of every LIVE ticket's display number based
 * on original creation order: oldest → T-001, next → T-002, … Persists the new
 * `ticket_no` values to the DB WITHOUT touching the primary key `id` (so all
 * invoice / walk-in relationships stay intact). Only rows whose number actually
 * changes are written. Returns a map of id → ticketNo so callers can patch local
 * state. Safe to run on every load: once everything is sequenced it writes
 * nothing and returns the existing mapping.
 */
async function resequenceTicketNumbers(): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};
  if (!supabase) return mapping;
  const { data, error } = await supabase
    .from("tickets")
    .select("id, ticket_no, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error || !data) return mapping;

  const updates: { id: string; ticket_no: string }[] = [];
  data.forEach((row: { id: string; ticket_no?: string; created_at?: string }, idx) => {
    const desired = formatTicketNo(idx + 1);
    mapping[row.id] = desired;
    if (row.ticket_no !== desired) updates.push({ id: row.id, ticket_no: desired });
  });

  // Persist only the rows that changed. Done sequentially to avoid a transient
  // unique-index collision if two rows swap numbers.
  for (const u of updates) {
    const { error: upErr } = await supabase.from("tickets").update({ ticket_no: u.ticket_no }).eq("id", u.id);
    if (upErr) console.error("[store] resequenceTicketNumbers failed for", u.id, upErr.message);
  }
  return mapping;
}

function rowToWalkIn(r: any): WalkIn {
  return {
    id: r.id,
    date: r.walkin_date ?? "",
    time: r.time_label ?? "",
    customer: r.customer ?? "",
    phone: r.phone ?? "",
    source: r.source ?? "",
    category: r.category ?? "",
    model: r.model ?? "",
    reasons: r.reasons ?? [],
    status: r.status ?? "waiting",
    ticketId: r.ticket_id ?? undefined,
    invoiceValue: Number(r.invoice_value ?? 0),
    businessValue: Number(r.business_value ?? 0),
    notes: r.notes ?? "",
  };
}

function walkInToRow(w: WalkIn): Record<string, unknown> {
  return {
    id: w.id,
    walkin_date: w.date || null,
    time_label: w.time || null,
    customer: w.customer || null,
    phone: w.phone || null,
    source: w.source || null,
    category: w.category || null,
    model: w.model || null,
    reasons: w.reasons ?? [],
    status: w.status,
    ticket_id: w.ticketId || null,
    invoice_value: w.invoiceValue ?? 0,
    business_value: w.businessValue ?? 0,
    notes: w.notes || null,
  };
}

function rowToInventoryItem(r: any): InventoryItem {
  return {
    id: r.id,
    name: r.name ?? "",
    category: r.category ?? "",
    type: r.item_type ?? "Product",
    mode: r.mode ?? "Both",
    uom: r.uom ?? "Piece",
    store: r.store ?? "Main Store",
    active: r.active ?? true,
    currentStock: Number(r.current_stock ?? 0),
    defaultPrice: Number(r.default_price ?? 0),
    regularBuyingPrice: Number(r.regular_buying_price ?? 0),
    wholesaleBuyingPrice: Number(r.wholesale_buying_price ?? 0),
    regularSellingPrice: Number(r.regular_selling_price ?? 0),
    mrp: Number(r.mrp ?? 0),
    dealerPrice: Number(r.dealer_price ?? 0),
    distributorPrice: Number(r.distributor_price ?? 0),
    hsnCode: r.hsn_code ?? "",
    tax: Number(r.tax ?? 0),
    minStock: Number(r.min_stock ?? 0),
    maxStock: Number(r.max_stock ?? 0),
    reservedStock: Number(r.reserved_stock ?? 0),
    soldUnits: Number(r.sold_units ?? 0),
    purchasedUnits: Number(r.purchased_units ?? 0),
  };
}

function inventoryItemToRow(item: InventoryItem): Record<string, unknown> {
  return {
    id: item.id,
    name: item.name,
    category: item.category || null,
    item_type: item.type ?? "Product",
    mode: item.mode ?? "Both",
    uom: item.uom || null,
    store: item.store || null,
    active: item.active,
    current_stock: item.currentStock,
    default_price: item.defaultPrice,
    regular_buying_price: item.regularBuyingPrice,
    wholesale_buying_price: item.wholesaleBuyingPrice,
    regular_selling_price: item.regularSellingPrice,
    mrp: item.mrp,
    dealer_price: item.dealerPrice,
    distributor_price: item.distributorPrice,
    hsn_code: item.hsnCode || null,
    tax: item.tax,
    min_stock: item.minStock,
    max_stock: item.maxStock,
    reserved_stock: item.reservedStock,
    sold_units: item.soldUnits,
    purchased_units: item.purchasedUnits,
  };
}

function rowToStockMovement(r: any): StockMovement {
  return {
    docNumber: r.doc_number ?? r.id ?? "",
    fromStore: r.from_store ?? "",
    toStore: r.to_store ?? "",
    items: Number(r.items ?? 0),
    date: r.movement_date ?? "",
    user: r.movement_user ?? "",
    type: r.movement_type ?? "Transfer",
    status: r.status ?? "completed",
  };
}

function stockMovementToRow(m: StockMovement): Record<string, unknown> {
  return {
    doc_number: m.docNumber,
    from_store: m.fromStore || null,
    to_store: m.toStore || null,
    items: m.items,
    movement_date: m.date || null,
    movement_user: m.user || null,
    movement_type: m.type || null,
    status: m.status ?? "completed",
  };
}

function rowToCustomer(r: any): Customer {
  return {
    id: r.id,
    type: r.type ?? "personal",
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    fullName: r.full_name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    mobile: r.mobile ?? "",
    email: r.email ?? "",
    company: r.company ?? "",
    gstNumber: r.gst_number ?? "",
    address: r.address ?? "",
    city: r.city ?? "",
    state: r.state ?? "",
    postalCode: r.postal_code ?? "",
    notes: r.notes ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
    lastVisit: r.last_visit ?? "",
    totalTickets: Number(r.total_tickets ?? 0),
    totalInvoices: Number(r.total_invoices ?? 0),
    totalRepairs: Number(r.total_repairs ?? 0),
    lifetimeValue: Number(r.lifetime_value ?? 0),
    status: r.status ?? "active",
  };
}

function customerToRow(c: Customer): Record<string, unknown> {
  return {
    id: c.id,
    type: c.type || "personal",
    first_name: c.firstName || null,
    last_name: c.lastName || null,
    full_name: c.fullName || null,
    mobile: c.mobile || null,
    email: c.email || null,
    company: c.company || null,
    gst_number: c.gstNumber || null,
    address: c.address || null,
    city: c.city || null,
    state: c.state || null,
    postal_code: c.postalCode || null,
    notes: c.notes || null,
    last_visit: c.lastVisit || null,
    total_tickets: c.totalTickets,
    total_invoices: c.totalInvoices,
    total_repairs: c.totalRepairs,
    lifetime_value: c.lifetimeValue,
    status: c.status,
  };
}

function rowToCompany(r: any): Company {
  return {
    id: r.id,
    name: r.name ?? "",
    companyType: r.company_type ?? "pvt_ltd",
    industry: r.industry ?? "",
    businessCategory: r.business_category ?? "",
    businessSize: r.business_size ?? "small",
    numberOfEmployees: r.number_of_employees ?? "",
    annualRevenue: r.annual_revenue ?? "",
    gstNumber: r.gst_number ?? "",
    panNumber: r.pan_number ?? "",
    website: r.website ?? "",
    owner: r.owner ?? "",
    branch: r.branch ?? "",
    assignedEmployee: r.assigned_employee ?? "",
    status: r.status ?? "active",
    phones: r.phones ?? [],
    emails: r.emails ?? [],
    communicationPreferences: r.communication_preferences ?? { email: true, phone: true, whatsapp: false },
    address: r.address_data ?? { addressLine1: "", addressLine2: "", area: "", city: "", district: "", state: "", country: "India", pinCode: "", landmark: "", googleMapsUrl: "", gpsLocation: "" },
    businessDetails: r.business_details ?? { registrationNumber: "", gstin: "", pan: "", taxType: "", billingCycle: "", creditLimit: 0, paymentTerms: "", preferredPaymentMode: "", currency: "INR", businessSince: "", annualTurnover: "", description: "" },
    socialLinks: r.social_links ?? { facebook: "", instagram: "", linkedin: "", twitter: "", youtube: "", website: "" },
    notes: r.notes ?? "",
    totalContacts: Number(r.total_contacts ?? 0),
    totalDeals: Number(r.total_deals ?? 0),
    totalTickets: Number(r.total_tickets ?? 0),
    totalInvoices: Number(r.total_invoices ?? 0),
    lifetimeValue: Number(r.lifetime_value ?? 0),
    workspace: r.workspace ?? "leads",
    createdBy: r.created_by ?? "",
    updatedBy: r.updated_by ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

function companyToRow(c: Company): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name || null,
    company_type: c.companyType || null,
    industry: c.industry || null,
    business_category: c.businessCategory || null,
    business_size: c.businessSize || null,
    number_of_employees: c.numberOfEmployees || null,
    annual_revenue: c.annualRevenue || null,
    gst_number: c.gstNumber || null,
    pan_number: c.panNumber || null,
    website: c.website || null,
    owner: c.owner || null,
    branch: c.branch || null,
    assigned_employee: c.assignedEmployee || null,
    status: c.status,
    phones: c.phones,
    emails: c.emails,
    communication_preferences: c.communicationPreferences,
    address_data: c.address,
    business_details: c.businessDetails,
    social_links: c.socialLinks,
    notes: c.notes || null,
    total_contacts: c.totalContacts,
    total_deals: c.totalDeals,
    total_tickets: c.totalTickets,
    total_invoices: c.totalInvoices,
    lifetime_value: c.lifetimeValue,
    workspace: c.workspace || "leads",
    created_by: c.createdBy || null,
    updated_by: c.updatedBy || null,
  };
}

function rowToBrand(r: any): Brand {
  return { id: r.id, name: r.name ?? "", createdAt: r.created_at ?? new Date().toISOString() };
}

function rowToDeviceModel(r: any): DeviceModel {
  return { id: r.id, brandId: r.brand_id ?? "", name: r.name ?? "", createdAt: r.created_at ?? new Date().toISOString() };
}

function rowToAssignedByOption(r: any): AssignedByOption {
  return { id: r.id, name: r.name ?? "", createdAt: r.created_at ?? new Date().toISOString() };
}

function rowToAssignedToOption(r: any): AssignedToOption {
  return { id: r.id, name: r.name ?? "", createdAt: r.created_at ?? new Date().toISOString() };
}

/* ─── Context + localStorage fallback ────────────────────────────────── */

const StoreContext = createContext<Store | null>(null);
const STORAGE_KEY = "repairox-store-v2";

function loadFromStorage(storageKey?: string): StoreState | null {
  if (typeof window === "undefined") return null;
  const key = storageKey ?? STORAGE_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as any;
    return {
      ...saved,
      invoices: (saved.invoices ?? SEED_INVOICES).map((inv: any) => ({ ...inv, invoiceType: inv.invoiceType ?? "retail" })),
      walkIns: saved.walkIns ?? SEED_WALKINS,
      inventory: (saved.inventory ?? SEED_INVENTORY).map((i: any) => ({ ...i, reservedStock: i.reservedStock ?? 0 })),
      stockMovements: saved.stockMovements ?? SEED_MOVEMENTS,
      customers: saved.customers ?? SEED_CUSTOMERS,
      companies: saved.companies ?? SEED_COMPANIES,
      brands: saved.brands ?? SEED_BRANDS,
      deviceModels: saved.deviceModels ?? SEED_MODELS,
      assignedByOptions: saved.assignedByOptions ?? SEED_ASSIGNED_BY_OPTIONS,
      assignedToOptions: saved.assignedToOptions ?? SEED_ASSIGNED_TO_OPTIONS,
      issueLibrary: saved.issueLibrary ?? (() => {
        // Migrate from standalone localStorage key if it exists
        try {
          const legacy = localStorage.getItem("repairox-issue-library");
          if (legacy) return JSON.parse(legacy);
        } catch {}
        return DEFAULT_ISSUES;
      })(),
      hydrated: true,
      mode: "local" as const,
    };
  } catch { return null; }
}

function saveToStorage(state: StoreState, storageKey?: string) {
  if (typeof window === "undefined") return;
  const key = storageKey ?? STORAGE_KEY;
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* noop */ }
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  const { isDemoMode, authReady, demoResetCounter } = usePermissions();
  const resolvedKey = isDemoMode ? demoKey(STORAGE_KEY) : STORAGE_KEY;

  const [state, setState] = useState<StoreState>({
    tickets: [], invoices: [], walkIns: [], orders: [], revenue: [],
    team: [], inventory: [], stockMovements: [], customers: [],
    companies: [], brands: [], deviceModels: [], assignedByOptions: [], assignedToOptions: [],
    issueLibrary: [],
    hydrated: false, mode: "local",
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Guards the Ticket ↔ Invoice status sync from re-triggering itself. When a
  // sync writes the counterpart record's status, that record's id is parked here
  // so its own update handler skips propagating the change back.
  const syncingIdsRef = useRef<Set<string>>(new Set());

  // Ref for demo mode so callbacks can access the latest value
  const isDemoRef = useRef(isDemoMode);
  useEffect(() => { isDemoRef.current = isDemoMode; }, [isDemoMode]);

  /** True when we should write to the database (Supabase configured AND not in demo mode). */
  const shouldUseDb = useCallback(() => isSupabaseConfigured && !!supabase && !isDemoRef.current, []);
  /** Non-null supabase client — only call after shouldUseDb() returns true. */
  const db = supabase!;

  const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;

  /* ── DB Load + Realtime Subscriptions ── */
  useEffect(() => {
    // Wait until we know who the user is before deciding data source.
    if (!authReady) return;

    // Demo mode: always start fresh — wipe any stale demo data and seed clean.
    if (isDemoMode) {
      const fresh: StoreState = {
        tickets: SEED_TICKETS, invoices: SEED_INVOICES, walkIns: SEED_WALKINS,
        orders: SEED_ORDERS, revenue: SEED_REVENUE, team: TEAM_SEED,
        inventory: SEED_INVENTORY, stockMovements: SEED_MOVEMENTS,
        customers: SEED_CUSTOMERS, brands: SEED_BRANDS, deviceModels: SEED_MODELS,
        companies: SEED_COMPANIES, assignedByOptions: SEED_ASSIGNED_BY_OPTIONS,
        assignedToOptions: SEED_ASSIGNED_TO_OPTIONS,
        issueLibrary: DEFAULT_ISSUES,
        hydrated: true, mode: "local",
      };
      setState(fresh);
      saveToStorage(fresh, resolvedKey);
      return; // No DB connection for demo.
    }

    // Non-demo, no Supabase: load from production localStorage.
    if (!isSupabaseConfigured || !supabase) {
      const saved = loadFromStorage(STORAGE_KEY);
      if (saved) {
        setState(saved);
      } else {
        setState({
          tickets: SEED_TICKETS, invoices: SEED_INVOICES, walkIns: SEED_WALKINS,
          orders: SEED_ORDERS, revenue: SEED_REVENUE, team: TEAM_SEED,
          inventory: SEED_INVENTORY, stockMovements: SEED_MOVEMENTS,
          customers: SEED_CUSTOMERS, brands: SEED_BRANDS, deviceModels: SEED_MODELS,
          companies: SEED_COMPANIES, assignedByOptions: SEED_ASSIGNED_BY_OPTIONS,
          assignedToOptions: SEED_ASSIGNED_TO_OPTIONS,
          issueLibrary: DEFAULT_ISSUES,
          hydrated: true, mode: "local",
        });
      }
      return;
    }

    // Production mode with Supabase: load from DB + subscribe to realtime.
    let active = true;

    (async () => {
      // Parallel load all business data from Supabase.
      const [
        { data: tix },
        { data: invs },
        { data: wis },
        { data: invItems },
        { data: moves },
        { data: custs },
        { data: comps },
        { data: brds },
        { data: models },
        { data: abOpts },
        { data: atOpts },
      ] = await Promise.all([
        supabase.from("tickets").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("walk_ins").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("inventory_items").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("stock_movements").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("companies").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("brands").select("*").order("created_at", { ascending: false }),
        supabase.from("device_models").select("*").order("created_at", { ascending: false }),
        supabase.from("assigned_by_options").select("*").order("created_at", { ascending: false }),
        supabase.from("assigned_to_options").select("*").order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      setState((s) => ({
        ...s,
        tickets: (tix ?? []).map(rowToTicket),
        invoices: (invs ?? []).map(rowToInvoice),
        walkIns: (wis ?? []).map(rowToWalkIn),
        inventory: (invItems ?? []).map(rowToInventoryItem),
        stockMovements: (moves ?? []).map(rowToStockMovement),
        customers: (custs ?? []).map(rowToCustomer),
        companies: (comps ?? []).map(rowToCompany),
        brands: (brds ?? []).map(rowToBrand),
        deviceModels: (models ?? []).map(rowToDeviceModel),
        assignedByOptions: (abOpts ?? []).map(rowToAssignedByOption),
        assignedToOptions: (atOpts ?? []).map(rowToAssignedToOption),
        issueLibrary: DEFAULT_ISSUES,
        hydrated: true,
      }));

      // Resequence all existing tickets to T-001, T-002 … by original creation
      // order (idempotent) and patch the display numbers into local state.
      const ticketNoMap = await resequenceTicketNumbers();
      if (active && Object.keys(ticketNoMap).length > 0) {
        setState((s) => ({
          ...s,
          tickets: s.tickets.map((t) =>
            ticketNoMap[t.id] ? { ...t, ticketNo: ticketNoMap[t.id] } : t
          ),
        }));
      }
    })();

    // Realtime subscriptions for all business tables.
    const client = supabase;

    const handleChange = (table: string, payload: any) => {
      if (!active) return;
      const { eventType } = payload;
      const row = payload.new ?? payload.old;
      if (!row) return;

      // Soft-deleted rows should be removed from local state.
      const isSoftDeleted = row.deleted_at != null;
      const isDelete = eventType === "DELETE" || isSoftDeleted;

      setState((prev) => {
        switch (table) {
          case "tickets": {
            if (isDelete) return { ...prev, tickets: prev.tickets.filter((t) => t.id !== row.id) };
            const ticket = rowToTicket(row);
            const idx = prev.tickets.findIndex((t) => t.id === row.id);
            if (idx === -1) return { ...prev, tickets: [ticket, ...prev.tickets] };
            const next = [...prev.tickets]; next[idx] = ticket;
            return { ...prev, tickets: next };
          }
          case "invoices": {
            if (isDelete) return { ...prev, invoices: prev.invoices.filter((i) => i.id !== row.id) };
            const inv = rowToInvoice(row);
            const idx = prev.invoices.findIndex((i) => i.id === row.id);
            if (idx === -1) return { ...prev, invoices: [inv, ...prev.invoices] };
            const next = [...prev.invoices]; next[idx] = inv;
            return { ...prev, invoices: next };
          }
          case "walk_ins": {
            if (isDelete) return { ...prev, walkIns: prev.walkIns.filter((w) => w.id !== row.id) };
            const wi = rowToWalkIn(row);
            const idx = prev.walkIns.findIndex((w) => w.id === row.id);
            if (idx === -1) return { ...prev, walkIns: [wi, ...prev.walkIns] };
            const next = [...prev.walkIns]; next[idx] = wi;
            return { ...prev, walkIns: next };
          }
          case "inventory_items": {
            if (isDelete) return { ...prev, inventory: prev.inventory.filter((i) => i.id !== row.id) };
            const item = rowToInventoryItem(row);
            const idx = prev.inventory.findIndex((i) => i.id === row.id);
            if (idx === -1) return { ...prev, inventory: [item, ...prev.inventory] };
            const next = [...prev.inventory]; next[idx] = item;
            return { ...prev, inventory: next };
          }
          case "stock_movements": {
            const mv = rowToStockMovement(row);
            const idx = prev.stockMovements.findIndex((m) => m.docNumber === mv.docNumber);
            if (idx === -1) return { ...prev, stockMovements: [mv, ...prev.stockMovements] };
            const next = [...prev.stockMovements]; next[idx] = mv;
            return { ...prev, stockMovements: next };
          }
          case "customers": {
            if (isDelete) return { ...prev, customers: prev.customers.filter((c) => c.id !== row.id) };
            const cust = rowToCustomer(row);
            const idx = prev.customers.findIndex((c) => c.id === row.id);
            if (idx === -1) return { ...prev, customers: [cust, ...prev.customers] };
            const next = [...prev.customers]; next[idx] = cust;
            return { ...prev, customers: next };
          }
          case "companies": {
            if (isDelete) return { ...prev, companies: prev.companies.filter((c) => c.id !== row.id) };
            const comp = rowToCompany(row);
            const idx = prev.companies.findIndex((c) => c.id === row.id);
            if (idx === -1) return { ...prev, companies: [comp, ...prev.companies] };
            const next = [...prev.companies]; next[idx] = comp;
            return { ...prev, companies: next };
          }
          case "brands": {
            if (isDelete) return { ...prev, brands: prev.brands.filter((b) => b.id !== row.id) };
            const brand = rowToBrand(row);
            const idx = prev.brands.findIndex((b) => b.id === row.id);
            if (idx === -1) return { ...prev, brands: [brand, ...prev.brands] };
            const next = [...prev.brands]; next[idx] = brand;
            return { ...prev, brands: next };
          }
          case "device_models": {
            if (isDelete) return { ...prev, deviceModels: prev.deviceModels.filter((m) => m.id !== row.id) };
            const model = rowToDeviceModel(row);
            const idx = prev.deviceModels.findIndex((m) => m.id === row.id);
            if (idx === -1) return { ...prev, deviceModels: [model, ...prev.deviceModels] };
            const next = [...prev.deviceModels]; next[idx] = model;
            return { ...prev, deviceModels: next };
          }
          case "assigned_by_options": {
            if (isDelete) return { ...prev, assignedByOptions: prev.assignedByOptions.filter((o) => o.id !== row.id) };
            const opt = rowToAssignedByOption(row);
            const idx = prev.assignedByOptions.findIndex((o) => o.id === row.id);
            if (idx === -1) return { ...prev, assignedByOptions: [opt, ...prev.assignedByOptions] };
            const next = [...prev.assignedByOptions]; next[idx] = opt;
            return { ...prev, assignedByOptions: next };
          }
          case "assigned_to_options": {
            if (isDelete) return { ...prev, assignedToOptions: prev.assignedToOptions.filter((o) => o.id !== row.id) };
            const opt = rowToAssignedToOption(row);
            const idx = prev.assignedToOptions.findIndex((o) => o.id === row.id);
            if (idx === -1) return { ...prev, assignedToOptions: [opt, ...prev.assignedToOptions] };
            const next = [...prev.assignedToOptions]; next[idx] = opt;
            return { ...prev, assignedToOptions: next };
          }
          default: return prev;
        }
      });
    };

    const tables = ["tickets", "invoices", "walk_ins", "inventory_items", "stock_movements", "customers", "companies", "brands", "device_models", "assigned_by_options", "assigned_to_options"];

    const channel = client.channel("store-realtime");
    for (const table of tables) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        (payload: any) => handleChange(table, payload)
      );
    }
    channel.subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [authReady, isDemoMode, resolvedKey, demoResetCounter]);

  // Persist local-mode state to localStorage.
  useEffect(() => {
    if (!state.hydrated) return;
    // In demo mode: always persist to demo key.
    // In production without Supabase: persist to production key.
    // In production with Supabase: don't persist (DB is authoritative).
    if (isDemoMode) {
      saveToStorage(state, resolvedKey);
    } else if (!isSupabaseConfigured) {
      saveToStorage(state, STORAGE_KEY);
    }
  }, [state, resolvedKey, isDemoMode]);

  /* ── Ticket actions (DB-first) ── */
  const addTicket = useCallback(async (ticket: Ticket): Promise<string> => {
    if (shouldUseDb()) {
      // The DISPLAY number (`ticket_no`) is the highest LIVE ticket_no + 1
      // (e.g. T-001, T-002 …). The PRIMARY KEY `id` is ALWAYS a fresh unique
      // value, decoupled from the display number.
      //
      // Why they must NOT be the same: soft-deleted tickets keep their PK `id`
      // but their number is no longer counted by nextTicketIdFromDb(). If `id`
      // reused the sequential value, the generator would eventually hand back a
      // number whose `id` is still occupied by a hidden deleted row, causing a
      // primary-key duplicate (23505) on insert — the ticket would then fail to
      // persist and vanish on reload. A random/unique id sidesteps this while
      // ticket_no still shows the clean sequence, and resequencing only ever
      // rewrites ticket_no (never id) so FK relationships stay intact.
      const seq = await nextTicketIdFromDb();
      let current: Ticket = { ...ticket, id: genUniqueTicketId(), ticketNo: seq };
      const insertTicket = async (t: Ticket) => {
        let row = ticketToRow(t);
        let r = await db.from("tickets").insert(row).select("*").single();
        // Schema-drift self-heal: drop whichever optional column the DB reports
        // as missing (e.g. ticket_no or pinned_at before the migration is
        // applied) and retry, so ticket creation still works.
        let heal = 0;
        while (r.error && isUndefinedColumnError(r.error) && heal < 6) {
          heal += 1;
          const col = extractMissingColumn(r.error);
          const drop = col ? [col] : ["ticket_no", "pinned_at"];
          row = omitKeys(row, drop);
          r = await db.from("tickets").insert(row).select("*").single();
        }
        return r;
      };
      let res = await insertTicket(current);
      // Safety net: on the rare chance the generated id still collides, retry
      // with a fresh unique id (ticket_no stays the same so the display
      // sequence is never skipped).
      let guard = 0;
      while (res.error && isDuplicateKeyError(res.error) && guard < 5) {
        guard += 1;
        current = { ...current, id: genUniqueTicketId() };
        res = await insertTicket(current);
      }
      if (res.error || !res.data) {
        console.error("[store] addTicket failed:", res.error?.code, res.error?.message, res.error);
        toast.error("Ticket not saved", {
          description: `DB error [${res.error?.code ?? "?"}]: ${res.error?.message ?? "unknown"}`,
        });
        // Keep locally so the user doesn't lose their work mid-session.
        setState((s) => ({ ...s, tickets: [current, ...s.tickets] }));
        logActivity({ module: "Ticket", action: "Ticket Created", severity: "success", entity: "Ticket", reference: current.ticketNo || current.id, description: `Created a new repair ticket for ${current.model || current.device} (${current.customer}).`, meta: { Device: current.device, Technician: current.technician || "Unassigned", Amount: inr(current.amount) } });
        return current.id;
      }
      const saved = rowToTicket(res.data);
      setState((s) => ({ ...s, tickets: [saved, ...s.tickets] }));
      logActivity({ module: "Ticket", action: "Ticket Created", severity: "success", entity: "Ticket", reference: saved.ticketNo || saved.id, description: `Created a new repair ticket for ${saved.model || saved.device} (${saved.customer}).`, meta: { Device: saved.device, Technician: saved.technician || "Unassigned", Amount: inr(saved.amount) } });
      return saved.id;
    }
    // Local/demo mode: derive the next sequential number from in-memory tickets.
    const localMax = stateRef.current.tickets.reduce((max, t) => {
      return Math.max(max, ticketSeq(t.ticketNo), ticketSeq(t.id));
    }, 0);
    const localSeq = formatTicketNo(localMax + 1);
    const localTicket: Ticket = { ...ticket, id: genUniqueTicketId(), ticketNo: localSeq };
    setState((s) => ({ ...s, tickets: [localTicket, ...s.tickets] }));
    logActivity({ module: "Ticket", action: "Ticket Created", severity: "success", entity: "Ticket", reference: localTicket.ticketNo || localTicket.id, description: `Created a new repair ticket for ${localTicket.model || localTicket.device} (${localTicket.customer}).`, meta: { Device: localTicket.device, Technician: localTicket.technician || "Unassigned", Amount: inr(localTicket.amount) } });
    return localTicket.id;
  }, []);

  const pinTicket = useCallback(async (id: string, pinned: boolean) => {
    const pinnedAt = pinned ? new Date().toISOString() : undefined;
    // Optimistic local update first, so pinning reflects instantly and still
    // works even if the DB column/write is momentarily unavailable.
    setState((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, pinnedAt } : t)) }));
    if (shouldUseDb()) {
      const { error } = await db.from("tickets").update({ pinned_at: pinnedAt ?? null }).eq("id", id);
      if (error) console.error("[store] pinTicket failed:", error.message);
    }
  }, []);

  const pinInvoice = useCallback(async (id: string, pinned: boolean) => {
    const pinnedAt = pinned ? new Date().toISOString() : undefined;
    // Optimistic local update first (see pinTicket).
    setState((s) => ({ ...s, invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, pinnedAt } : inv)) }));
    if (shouldUseDb()) {
      const { error } = await db.from("invoices").update({ pinned_at: pinnedAt ?? null }).eq("id", id);
      if (error) console.error("[store] pinInvoice failed:", error.message);
    }
  }, []);

  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>) => {
    const prev = stateRef.current.tickets.find((t) => t.id === id);

    // ── Business rule: block "Repaired & Collected" without an invoice ──
    // A ticket may only move to repaired_collected once an invoice exists for
    // it. Enforced HERE (the single write path) so it can't be bypassed via any
    // UI. The only legitimate way to reach repaired_collected without a manual
    // action is the invoice→ticket sync, which parks the ticket id in
    // syncingIdsRef — so that path is explicitly allowed.
    if (
      updates.status === "repaired_collected" &&
      prev?.status !== "repaired_collected" &&
      !syncingIdsRef.current.has(id)
    ) {
      const hasInvoice = stateRef.current.invoices.some((inv) => inv.ticketId === id);
      if (!hasInvoice) {
        toast.error("Create an invoice first", {
          description: "A ticket can only be marked \u201cRepaired & Collected\u201d after an invoice has been generated for it.",
        });
        return;
      }
    }

    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("customer" in updates) row.customer = updates.customer ?? null;
      if ("phone" in updates) row.phone = updates.phone ?? null;
      if ("device" in updates) row.device = updates.device ?? null;
      if ("model" in updates) row.model = updates.model ?? null;
      if ("issue" in updates) row.issue = updates.issue ?? null;
      if ("status" in updates) row.status = updates.status;
      if ("priority" in updates) row.priority = updates.priority;
      if ("technician" in updates) row.technician = updates.technician ?? null;
      if ("amount" in updates) row.amount = updates.amount ?? 0;
      if ("discount" in updates) row.discount = updates.discount ?? 0;
      if ("dueDate" in updates) row.due_date = updates.dueDate ?? null;
      if ("resolutionMinutes" in updates) row.resolution_minutes = updates.resolutionMinutes ?? null;
      if ("service" in updates) row.service = updates.service ?? null;
      if ("internalNotes" in updates) row.internal_notes = updates.internalNotes ?? null;
      if ("source" in updates) row.source = updates.source ?? null;
      if ("imeiType" in updates) row.imei_type = updates.imeiType ?? null;
      if ("qcStatus" in updates) row.qc_status = updates.qcStatus ?? null;
      if ("parts" in updates) row.parts = updates.parts ?? [];
      if ("devices" in updates) row.devices = updates.devices ?? [];
      if ("items" in updates) row.items = updates.items ?? [];
      if ("email" in updates) row.email = updates.email ?? null;
      if ("address" in updates) row.address = updates.address ?? null;
      if ("company" in updates) row.company = updates.company ?? null;
      if ("customerId" in updates) row.customer_id = updates.customerId ?? null;

      let currentRow = row;
      let { error } = await db.from("tickets").update(currentRow).eq("id", id);

      // Schema-drift resilience: if the write fails because the DB is missing an
      // optional column (e.g. pinned_at / ticket_no before the migration is
      // applied), drop that specific column and retry rather than discarding the
      // user's change. Loops for a few distinct missing columns.
      let heal = 0;
      while (error && isUndefinedColumnError(error) && Object.keys(currentRow).length > 0 && heal < 6) {
        heal += 1;
        const col = extractMissingColumn(error);
        currentRow = omitKeys(currentRow, col ? [col] : ["pinned_at", "ticket_no", "qc_status"]);
        if (Object.keys(currentRow).length === 0) break;
        const retry = await db.from("tickets").update(currentRow).eq("id", id);
        error = retry.error;
        if (!error) console.warn("[store] updateTicket: retried without missing column(s) (schema drift).");
      }

      if (error) {
        console.error("[store] updateTicket failed:", error.code, error.message, error);
        toast.error("Changes not saved", { description: `DB error [${error.code ?? "?"}]: ${error.message ?? "unknown"}` });
        return;
      }
    }
    setState((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...updates } : t)) }));

    // ── Ticket → Invoice status sync ──
    // Tickets and Invoices share ONE status system (TicketStatus). When a ticket
    // status changes, mirror it onto every linked invoice's repairStatus so both
    // records always show the same saved status. Guarded against re-triggering
    // the reverse (invoice → ticket) sync.
    if ("status" in updates && updates.status !== prev?.status && !syncingIdsRef.current.has(id)) {
      const nextStatus = updates.status as TicketStatus;
      const linkedInvoices = stateRef.current.invoices.filter((inv) => inv.ticketId === id && inv.repairStatus !== nextStatus);
      for (const inv of linkedInvoices) {
        syncingIdsRef.current.add(inv.id);
        try {
          if (shouldUseDb()) {
            const devicesJson = invoiceToRow({ ...inv, repairStatus: nextStatus }).devices;
            const { error } = await db.from("invoices").update({ devices: devicesJson }).eq("id", inv.id);
            if (error) console.error("[store] ticket→invoice sync failed:", error.message);
          }
          setState((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === inv.id ? { ...i, repairStatus: nextStatus } : i)) }));
        } finally {
          syncingIdsRef.current.delete(inv.id);
        }
      }
    }

    const statusFmt = (v: unknown) => STATUS_LABEL[v as TicketStatus] ?? String(v ?? "—");
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "status", label: "Status", format: statusFmt }, { key: "technician", label: "Technician" },
      { key: "priority", label: "Priority" }, { key: "amount", label: "Amount", format: inr },
    ]);
    let action = "Ticket Updated"; let severity: ActivitySeverity = "info";
    if ("status" in updates && updates.status !== prev?.status) { action = "Status Changed"; if (updates.status === "repaired" || updates.status === "repaired_collected") severity = "success"; }
    else if ("technician" in updates && updates.technician !== prev?.technician) action = "Technician Changed";
    else if ("priority" in updates && updates.priority !== prev?.priority) { action = "Priority Changed"; severity = "warning"; }
    logActivity({ module: "Ticket", action, severity, entity: "Ticket", reference: id, description: `Updated ticket ${id}${prev ? ` (${prev.customer})` : ""}.`, changes });
  }, []);

  const deleteTicket = useCallback(async (id: string) => {
    const prev = stateRef.current.tickets.find((t) => t.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("tickets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteTicket failed:", error.message); toast.error("Ticket not deleted", { description: "We couldn't delete this ticket in the database. Please try again." }); return; }
    }
    setState((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== id) }));
    logActivity({ module: "Ticket", action: "Ticket Deleted", severity: "critical", entity: "Ticket", reference: id, description: prev ? `Deleted ticket for ${prev.model || prev.device} (${prev.customer}).` : `Deleted ticket ${id}.`, meta: prev ? { Status: STATUS_LABEL[prev.status] ?? prev.status, Amount: inr(prev.amount) } : undefined });
  }, []);

  const bulkUpdateStatus = useCallback(async (idsInput: string[], status: TicketStatus) => {
    let ids = idsInput;
    // ── Business rule: block bulk "Repaired & Collected" without an invoice ──
    // Only tickets that already have a generated invoice may move to
    // repaired_collected. Skip the rest and inform the user so the rule can't be
    // bypassed via the bulk-status UI.
    if (status === "repaired_collected") {
      const withInvoice = new Set(stateRef.current.invoices.map((inv) => inv.ticketId).filter(Boolean) as string[]);
      const allowed = ids.filter((id) => withInvoice.has(id));
      const blockedCount = ids.length - allowed.length;
      if (blockedCount > 0) {
        toast.error(
          blockedCount === ids.length ? "Create an invoice first" : `${blockedCount} ticket${blockedCount > 1 ? "s" : ""} skipped`,
          { description: "Only tickets with a generated invoice can be marked \u201cRepaired & Collected\u201d." }
        );
      }
      ids = allowed;
      if (ids.length === 0) return;
    }
    if (shouldUseDb()) {
      const { error } = await db.from("tickets").update({ status }).in("id", ids);
      if (error) { console.error("[store] bulkUpdateStatus failed:", error.message); toast.error("Status not updated", { description: "We couldn't update the selected tickets in the database. Please try again." }); return; }
    }
    setState((s) => ({ ...s, tickets: s.tickets.map((t) => (ids.includes(t.id) ? { ...t, status } : t)) }));

    // Mirror the bulk ticket status change onto each linked invoice's repairStatus
    // so both records stay synchronized (shared status system).
    const linkedInvoices = stateRef.current.invoices.filter((inv) => inv.ticketId && ids.includes(inv.ticketId) && inv.repairStatus !== status);
    for (const inv of linkedInvoices) {
      if (shouldUseDb()) {
        const devicesJson = invoiceToRow({ ...inv, repairStatus: status }).devices;
        const { error } = await db.from("invoices").update({ devices: devicesJson }).eq("id", inv.id);
        if (error) console.error("[store] bulk ticket→invoice sync failed:", error.message);
      }
    }
    if (linkedInvoices.length > 0) {
      const syncedIds = new Set(linkedInvoices.map((i) => i.id));
      setState((s) => ({ ...s, invoices: s.invoices.map((i) => (syncedIds.has(i.id) ? { ...i, repairStatus: status } : i)) }));
    }

    const label = STATUS_LABEL[status] ?? status;
    logActivity({ module: "Ticket", action: "Status Changed", severity: "info", entity: "Ticket", reference: ids.length === 1 ? ids[0] : `${ids.length} tickets`, description: `Bulk updated ${ids.length} ticket${ids.length !== 1 ? "s" : ""} to ${label}.`, changes: [{ field: "Status", to: label }] });
  }, []);

  /**
   * Push an invoice's repairStatus onto its linked ticket so BOTH records share
   * the same persisted status. Tickets and Invoices use ONE status system
   * (TicketStatus). Guarded by syncingIdsRef so it never triggers the reverse
   * (ticket → invoice) sync. Safe no-op when there's no linked ticket, no
   * repairStatus, or the ticket already matches. Used by both invoice creation
   * (so the DEFAULT "Repaired & Collected" propagates even when the user never
   * touches the status) and manual invoice status edits.
   */
  const syncTicketStatusFromInvoice = useCallback(async (ticketId: string | undefined, repairStatus: TicketStatus | undefined) => {
    if (!ticketId || !repairStatus) return;
    if (syncingIdsRef.current.has(ticketId)) return;
    const ticket = stateRef.current.tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === repairStatus) return;
    syncingIdsRef.current.add(ticket.id);
    try {
      if (shouldUseDb()) {
        const { error } = await db.from("tickets").update({ status: repairStatus }).eq("id", ticket.id);
        if (error) console.error("[store] invoice→ticket status sync failed:", error.message);
      }
      const syncedDevices = ticket.devices?.map((d) => ({ ...d, status: repairStatus }));
      setState((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === ticket.id ? { ...t, status: repairStatus, ...(syncedDevices ? { devices: syncedDevices } : {}) } : t)) }));
    } finally {
      syncingIdsRef.current.delete(ticket.id);
    }
  }, []);

  /**
   * Resolve an invoice's `ticketId` to a REAL tickets primary key before it is
   * written. The invoices.ticket_id column is a foreign key to tickets.id, so a
   * value that isn't an actual id makes the whole insert fail (FK violation
   * 23503) and the invoice is lost.
   *
   * After ticket-number resequencing, the display number (`ticket_no`, e.g.
   * T-040) diverged from the stable primary key (`id`, e.g. T-2556 / TK-…). If a
   * ticket NUMBER slips into ticketId (e.g. typed into the "Linked Ticket"
   * field), translate it to the owning ticket's real id. If it matches neither
   * a real id nor a known ticket number, drop the link (null) so the invoice
   * still saves rather than being rejected by the FK.
   */
  const resolveTicketId = useCallback((rawId: string | undefined): string | undefined => {
    if (!rawId) return undefined;
    const tickets = stateRef.current.tickets;
    // Already a real primary key → keep as-is.
    if (tickets.some((t) => t.id === rawId)) return rawId;
    // Looks like a display number (T-040) → map to the owning ticket's real id.
    const byNo = tickets.find((t) => t.ticketNo === rawId);
    if (byNo) return byNo.id;
    // Unknown reference — don't risk an FK violation; save the invoice unlinked.
    console.warn(`[store] invoice ticketId "${rawId}" is not a known ticket id/number — saving invoice without a ticket link.`);
    return undefined;
  }, []);

  /* ── Invoice actions (DB-first) ── */
  const addInvoice = useCallback(async (invoiceInput: Invoice): Promise<string> => {
    // Normalize the ticket link so a ticket NUMBER (or stale reference) can never
    // trigger a foreign-key violation that discards the invoice.
    const invoice: Invoice = { ...invoiceInput, ticketId: resolveTicketId(invoiceInput.ticketId) };
    if (shouldUseDb()) {
      // Single insert attempt. Retries once without the optional columns in case
      // an older DB is missing them.
      const attemptInsert = async (inv: Invoice) => {
        let row = invoiceToRow(inv);
        let res = await supabase!.from("invoices").insert(row).select("*").single();
        // Schema-drift self-heal: if the DB is missing an optional column (e.g.
        // `pinned_at` before the migration is applied), drop that column and
        // retry so the invoice still saves instead of being lost. Loops for up
        // to a few distinct missing columns.
        let heal = 0;
        while (res.error && isUndefinedColumnError(res.error) && heal < 6) {
          heal += 1;
          const col = extractMissingColumn(res.error);
          const drop = col ? [col] : ["pinned_at", "service_category", "payment_mode"];
          row = omitKeys(row, drop);
          res = await supabase!.from("invoices").insert(row).select("*").single();
        }
        // Legacy fallback for the older service_category/payment_mode columns.
        if (res.error && !isDuplicateKeyError(res.error) && !isUndefinedColumnError(res.error)) {
          const fallbackRow = omitKeys(row, ["service_category", "payment_mode"]);
          res = await supabase!.from("invoices").insert(fallbackRow).select("*").single();
        }
        return res;
      };

      let current = invoice;
      let res = await attemptInsert(current);

      // The generated id can collide with an existing row — most commonly a
      // soft-deleted invoice, which keeps its primary key but is hidden from the
      // in-memory list the id was derived from. Regenerate from the DB and retry.
      let guard = 0;
      while (res.error && isDuplicateKeyError(res.error) && guard < 5) {
        guard += 1;
        const nextId = await nextInvoiceIdFromDb(current.invoiceType);
        current = { ...current, id: nextId };
        res = await attemptInsert(current);
      }

      if (res.error || !res.data) {
        console.error("[store] addInvoice failed:", res.error?.code, res.error?.message, res.error);
        toast.error("Invoice not saved", {
          description: `DB error [${res.error?.code ?? "?"}]: ${res.error?.message ?? "unknown"}`,
        });
        // Last resort: keep locally so the user doesn't lose their work. (Won't
        // survive a reload, but avoids data loss mid-session.)
        setState((s) => ({ ...s, invoices: [current, ...s.invoices] }));
        logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: current.reference || current.id, description: `Generated invoice for ${current.customer}.`, meta: { Total: inr(current.total) } });
        // Sync the (possibly default) repairStatus onto the linked ticket.
        await syncTicketStatusFromInvoice(current.ticketId, current.repairStatus);
        return current.id;
      }

      const saved = rowToInvoice(res.data);
      // Preserve serviceCategory/paymentMode locally even if DB lacks the columns.
      saved.serviceCategory = current.serviceCategory;
      saved.paymentMode = current.paymentMode;
      setState((s) => ({ ...s, invoices: [saved, ...s.invoices] }));
      logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: saved.reference || saved.id, description: `Generated invoice for ${saved.customer}.`, meta: { Total: inr(saved.total) } });
      // CRITICAL: propagate the invoice's repairStatus (defaults to
      // "Repaired & Collected") back to the originating ticket immediately, even
      // when the user never manually changed the invoice status.
      await syncTicketStatusFromInvoice(saved.ticketId, saved.repairStatus);
      return saved.id;
    }
    setState((s) => ({ ...s, invoices: [invoice, ...s.invoices] }));
    logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: invoice.reference || invoice.id, description: `Generated invoice for ${invoice.customer}.`, meta: { Total: inr(invoice.total) } });
    await syncTicketStatusFromInvoice(invoice.ticketId, invoice.repairStatus);
    return invoice.id;
  }, [syncTicketStatusFromInvoice, resolveTicketId]);

  const updateInvoice = useCallback(async (id: string, updates: Partial<Invoice>) => {
    const prev = stateRef.current.invoices.find((inv) => inv.id === id);

    // Normalize any incoming ticket link to a real ticket id (or null) so an
    // edited "Linked Ticket" value can't cause an FK violation on save.
    if ("ticketId" in updates) {
      updates = { ...updates, ticketId: resolveTicketId(updates.ticketId) };
    }

    // ── Status ↔ Payment synchronization ──
    // Status is the single source of truth. When status changes, derive paidAmount.
    // When paidAmount changes without explicit status, derive status.
    if (prev) {
      const incomingStatus = updates.status;
      const incomingPaid = updates.paidAmount;
      const currentTotal = updates.total ?? prev.total;
      const currentPaid = prev.paidAmount;

      if (incomingStatus !== undefined && incomingStatus !== prev.status) {
        // Status changed explicitly — sync paidAmount to match
        if (incomingStatus === "paid" && !("paidAmount" in updates)) {
          updates.paidAmount = currentTotal;
        } else if (incomingStatus === "draft" && !("paidAmount" in updates)) {
          // Moving to draft: zero out paidAmount (unless caller explicitly set it)
          updates.paidAmount = 0;
        } else if (incomingStatus === "cancelled" && !("paidAmount" in updates)) {
          updates.paidAmount = 0;
        }
        // "sent", "partial", "overdue" keep existing paidAmount (preserves partial payment data)
      } else if (incomingPaid !== undefined && !("status" in updates)) {
        // paidAmount changed without explicit status — auto-derive status
        if (incomingPaid >= currentTotal) {
          updates.status = "paid";
        } else if (incomingPaid > 0 && incomingPaid < currentTotal) {
          updates.status = "partial";
        } else if (incomingPaid === 0 || (incomingPaid !== undefined && incomingPaid <= 0)) {
          // If was paid/partial and now zeroed, revert to sent/draft
          if (prev.status === "paid" || prev.status === "partial") {
            updates.status = "sent";
          }
        }
      }
    }

    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("customer" in updates) row.customer = updates.customer ?? null;
      if ("phone" in updates) row.phone = updates.phone ?? null;
      if ("email" in updates) row.email = updates.email ?? null;
      if ("company" in updates) row.company = updates.company ?? null;
      if ("status" in updates) row.status = updates.status;
      if ("paidAmount" in updates) row.paid_amount = updates.paidAmount ?? 0;
      if ("subtotal" in updates) row.subtotal = updates.subtotal ?? 0;
      if ("discount" in updates) row.discount = updates.discount ?? 0;
      if ("tax" in updates) row.tax = updates.tax ?? 0;
      if ("total" in updates) row.total = updates.total ?? 0;
      if ("notes" in updates) row.notes = updates.notes ?? null;
      if ("terms" in updates) row.terms = updates.terms ?? null;
      if ("items" in updates) row.items = updates.items ?? [];
      if ("devices" in updates) row.devices = updates.devices ?? [];
      if ("dueDate" in updates) row.due_date = updates.dueDate ?? null;
      if ("employee" in updates) row.employee = updates.employee ?? null;
      if ("invoiceType" in updates) row.invoice_type = updates.invoiceType ?? "retail";
      if ("serviceCategory" in updates) row.service_category = updates.serviceCategory ?? "service";
      if ("paymentMode" in updates) row.payment_mode = updates.paymentMode ?? null;
      // repairStatus / paymentMode / serviceCategory live in the `devices` meta
      // jsonb. When any of them change, re-serialize the whole devices column so
      // the value is actually persisted (survives reload / logout).
      if (prev && ("repairStatus" in updates || "paymentMode" in updates || "serviceCategory" in updates || "devices" in updates)) {
        row.devices = (invoiceToRow({ ...prev, ...updates } as Invoice).devices);
      }
      let currentRow = row;
      let { error } = await db.from("invoices").update(currentRow).eq("id", id);
      // Schema-drift self-heal: drop whichever optional column the DB reports as
      // missing (pinned_at / service_category / payment_mode …) and retry so the
      // invoice update still persists.
      let heal = 0;
      while (error && isUndefinedColumnError(error) && Object.keys(currentRow).length > 0 && heal < 6) {
        heal += 1;
        const col = extractMissingColumn(error);
        currentRow = omitKeys(currentRow, col ? [col] : ["pinned_at", "service_category", "payment_mode"]);
        if (Object.keys(currentRow).length === 0) break;
        const retry = await db.from("invoices").update(currentRow).eq("id", id);
        error = retry.error;
      }
      if (error) {
        console.error("[store] updateInvoice failed:", error.code, error.message);
        toast.error("Changes not saved", { description: `DB error [${error.code ?? "?"}]: ${error.message ?? "unknown"}` });
      }
    }
    setState((s) => ({ ...s, invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv)) }));

    // ── Invoice → Ticket status sync ──
    // The invoice's repairStatus shares the SAME status system as tickets. When
    // it changes, immediately update the linked ticket's status to match so both
    // stay synchronized (and persisted). Guarded against re-triggering the
    // reverse (ticket → invoice) sync.
    if ("repairStatus" in updates && updates.repairStatus !== prev?.repairStatus && !syncingIdsRef.current.has(id)) {
      const ticketId = updates.ticketId ?? prev?.ticketId;
      const nextStatus = updates.repairStatus as TicketStatus;
      const ticket = ticketId ? stateRef.current.tickets.find((t) => t.id === ticketId) : undefined;
      if (ticket && ticket.status !== nextStatus) {
        syncingIdsRef.current.add(ticket.id);
        try {
          if (shouldUseDb()) {
            const { error } = await db.from("tickets").update({ status: nextStatus }).eq("id", ticket.id);
            if (error) console.error("[store] invoice→ticket sync failed:", error.message);
          }
          const syncedDevices = ticket.devices?.map((d) => ({ ...d, status: nextStatus }));
          setState((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === ticket.id ? { ...t, status: nextStatus, ...(syncedDevices ? { devices: syncedDevices } : {}) } : t)) }));
        } finally {
          syncingIdsRef.current.delete(ticket.id);
        }
      }
    }

    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "status", label: "Status" }, { key: "paidAmount", label: "Paid", format: inr }, { key: "total", label: "Total", format: inr },
    ]);
    let action = "Invoice Updated"; let severity: ActivitySeverity = "info";
    if (("paidAmount" in updates && (updates.paidAmount ?? 0) > (prev?.paidAmount ?? 0)) || updates.status === "paid") { action = "Payment Added"; severity = "success"; }
    else if (updates.status === "cancelled") { action = "Cancelled"; severity = "critical"; }
    logActivity({ module: "Invoice", action, severity, entity: "Invoice", reference: prev?.reference || id, description: `Updated invoice ${prev?.reference || id} (${prev?.customer ?? ""}).`, changes });
  }, [resolveTicketId]);

  const deleteInvoice = useCallback(async (id: string) => {
    const prev = stateRef.current.invoices.find((inv) => inv.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("invoices").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteInvoice failed:", error.message); toast.error("Invoice not deleted", { description: "We couldn't delete this invoice in the database. Please try again." }); return; }
    }
    setState((s) => ({ ...s, invoices: s.invoices.filter((inv) => inv.id !== id) }));
    logActivity({ module: "Invoice", action: "Invoice Deleted", severity: "critical", entity: "Invoice", reference: prev?.reference || id, description: prev ? `Deleted invoice ${prev.reference} for ${prev.customer}.` : `Deleted invoice ${id}.`, meta: prev ? { Total: inr(prev.total) } : undefined });
  }, []);

  /* ── Walk-In actions (DB-first) ── */
  const addWalkIn = useCallback(async (walkIn: WalkIn) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("walk_ins").insert(walkInToRow(walkIn)).select("*").single();
      if (error || !data) { console.error("[store] addWalkIn failed:", error?.message); return; }
      const saved = rowToWalkIn(data);
      setState((s) => ({ ...s, walkIns: [saved, ...s.walkIns] }));
      logActivity({ module: "Walk-In", action: "Walk-In Created", severity: "success", entity: "Walk-In", reference: saved.id, description: `Logged a walk-in for ${saved.customer} (${saved.model}).`, meta: { Source: saved.source, Category: saved.category } });
      return;
    }
    setState((s) => ({ ...s, walkIns: [walkIn, ...s.walkIns] }));
    logActivity({ module: "Walk-In", action: "Walk-In Created", severity: "success", entity: "Walk-In", reference: walkIn.id, description: `Logged a walk-in for ${walkIn.customer} (${walkIn.model}).`, meta: { Source: walkIn.source, Category: walkIn.category } });
  }, []);

  const updateWalkIn = useCallback(async (id: string, updates: Partial<WalkIn>) => {
    const prev = stateRef.current.walkIns.find((w) => w.id === id);
    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("customer" in updates) row.customer = updates.customer ?? null;
      if ("phone" in updates) row.phone = updates.phone ?? null;
      if ("source" in updates) row.source = updates.source ?? null;
      if ("category" in updates) row.category = updates.category ?? null;
      if ("model" in updates) row.model = updates.model ?? null;
      if ("status" in updates) row.status = updates.status;
      if ("ticketId" in updates) row.ticket_id = updates.ticketId ?? null;
      if ("invoiceValue" in updates) row.invoice_value = updates.invoiceValue ?? 0;
      if ("businessValue" in updates) row.business_value = updates.businessValue ?? 0;
      if ("notes" in updates) row.notes = updates.notes ?? null;
      if ("reasons" in updates) row.reasons = updates.reasons ?? [];
      const { error } = await db.from("walk_ins").update(row).eq("id", id);
      if (error) { console.error("[store] updateWalkIn failed:", error.message); return; }
    }
    setState((s) => ({ ...s, walkIns: s.walkIns.map((w) => (w.id === id ? { ...w, ...updates } : w)) }));
    const converted = "status" in updates && (updates.status === "converted_ticket" || updates.status === "converted_invoice") && updates.status !== prev?.status;
    logActivity({ module: "Walk-In", action: converted ? "Walk-In Converted" : "Walk-In Updated", severity: "info", entity: "Walk-In", reference: id, description: converted ? `Converted walk-in ${id}${updates.ticketId ? ` to ticket ${updates.ticketId}` : ""}.` : `Updated walk-in ${id}${prev ? ` (${prev.customer})` : ""}.`, ...(updates.ticketId ? { meta: { "New Ticket": updates.ticketId } } : {}) });
  }, []);

  const deleteWalkIn = useCallback(async (id: string) => {
    const prev = stateRef.current.walkIns.find((w) => w.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("walk_ins").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteWalkIn failed:", error.message); return; }
    }
    setState((s) => ({ ...s, walkIns: s.walkIns.filter((w) => w.id !== id) }));
    logActivity({ module: "Walk-In", action: "Walk-In Deleted", severity: "critical", entity: "Walk-In", reference: id, description: prev ? `Deleted walk-in for ${prev.customer} (${prev.model}).` : `Deleted walk-in ${id}.` });
  }, []);

  /* ── Team actions ── */
  const updateTeamMember = useCallback((email: string, updates: Partial<TeamMember>) => {
    setState((s) => ({ ...s, team: s.team.map((m) => (m.email === email ? { ...m, ...updates } : m)) }));
  }, []);

  /* ── Inventory actions (DB-first) ── */
  const deductPartsForTicket = useCallback(async (ticketId: string) => {
    const preTicket = stateRef.current.tickets.find((t) => t.id === ticketId);
    if (!preTicket) return;

    let partsToDeduct: TicketPart[] = [];
    if (preTicket.devices && preTicket.devices.length > 0) {
      partsToDeduct = preTicket.devices.flatMap((d) => d.parts.filter((p) => p.status === "planned"));
    } else if (preTicket.parts && preTicket.parts.length > 0) {
      partsToDeduct = preTicket.parts.filter((p) => p.status === "planned");
    }
    if (partsToDeduct.length === 0) return;

    if (shouldUseDb()) {
      // Deduct from inventory in DB.
      for (const part of partsToDeduct) {
        if (!part.inventoryId) continue;
        const invItem = stateRef.current.inventory.find((i) => i.id === part.inventoryId);
        if (!invItem) continue;
        await db.from("inventory_items").update({ current_stock: invItem.currentStock - part.qty }).eq("id", part.inventoryId);
      }
      // Mark parts as used on the ticket.
      const updatedDevices = preTicket.devices?.map((d) => ({ ...d, parts: d.parts.map((p) => ({ ...p, status: "used" as const })) }));
      const updatedParts = preTicket.parts?.map((p) => ({ ...p, status: "used" as const }));
      await db.from("tickets").update({ parts: updatedParts ?? [], devices: updatedDevices ?? [] }).eq("id", ticketId);
      // Create stock movements.
      for (const [i, part] of partsToDeduct.entries()) {
        await db.from("stock_movements").insert(stockMovementToRow({
          docNumber: `MOV-TC-${Date.now()}-${i}`, fromStore: "Main Store", toStore: `Ticket ${ticketId}`,
          items: part.qty, date: new Date().toLocaleDateString("en-IN"), user: preTicket.technician, type: "Outward", status: "completed",
        }));
      }
    }

    setState((s) => {
      const updatedInventory = s.inventory.map((item) => {
        const matching = partsToDeduct.filter((p) => p.inventoryId === item.id);
        if (matching.length === 0) return item;
        const totalQty = matching.reduce((sum, p) => sum + p.qty, 0);
        return { ...item, currentStock: item.currentStock - totalQty };
      });
      const updatedTickets = s.tickets.map((t) => {
        if (t.id !== ticketId) return t;
        return { ...t, parts: t.parts?.map((p) => ({ ...p, status: "used" as const })), devices: t.devices?.map((d) => ({ ...d, parts: d.parts.map((p) => ({ ...p, status: "used" as const })) })) };
      });
      const newMovements: StockMovement[] = partsToDeduct.map((part, i) => ({
        docNumber: `MOV-TC-${Date.now()}-${i}`, fromStore: "Main Store", toStore: `Ticket ${ticketId}`,
        items: part.qty, date: new Date().toLocaleDateString("en-IN"), user: preTicket.technician, type: "Outward" as const, status: "completed" as const,
      }));
      return { ...s, tickets: updatedTickets, inventory: updatedInventory, stockMovements: [...newMovements, ...s.stockMovements] };
    });

    const totalQty = partsToDeduct.reduce((sum, p) => sum + p.qty, 0);
    logActivity({ module: "Inventory", action: "Stock Reduced", severity: "warning", entity: "Parts", reference: ticketId, description: `Deducted ${totalQty} part unit${totalQty !== 1 ? "s" : ""} for ticket ${ticketId}.`, meta: { "Parts consumed": String(partsToDeduct.length), Units: String(totalQty) } });
  }, []);

  const addStockMovement = useCallback(async (movement: StockMovement) => {
    if (shouldUseDb()) {
      const { error } = await db.from("stock_movements").insert(stockMovementToRow(movement));
      if (error) { console.error("[store] addStockMovement failed:", error.message); return; }
    }
    setState((s) => ({ ...s, stockMovements: [movement, ...s.stockMovements] }));
    const inward = movement.type === "Inward";
    logActivity({ module: "Inventory", action: inward ? "Stock Increased" : "Stock Reduced", severity: inward ? "success" : "warning", entity: "Stock Movement", reference: movement.docNumber, description: `${movement.type} movement of ${movement.items} item${movement.items !== 1 ? "s" : ""}: ${movement.fromStore} → ${movement.toStore}.` });
  }, []);

  const addInventoryItem = useCallback(async (item: InventoryItem) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("inventory_items").insert(inventoryItemToRow(item)).select("*").single();
      if (error || !data) { console.error("[store] addInventoryItem failed:", error?.message); return; }
      const saved = rowToInventoryItem(data);
      setState((s) => ({ ...s, inventory: [saved, ...s.inventory] }));
      logActivity({ module: "Inventory", action: "Item Added", severity: "success", entity: "Item", reference: saved.id, description: `Added new inventory item: ${saved.name}.`, meta: { Category: saved.category, Stock: String(saved.currentStock) } });
      return;
    }
    setState((s) => ({ ...s, inventory: [item, ...s.inventory] }));
    logActivity({ module: "Inventory", action: "Item Added", severity: "success", entity: "Item", reference: item.id, description: `Added new inventory item: ${item.name}.`, meta: { Category: item.category, Stock: String(item.currentStock) } });
  }, []);

  const updateInventoryItem = useCallback(async (id: string, updates: Partial<InventoryItem>) => {
    const prev = stateRef.current.inventory.find((i) => i.id === id);
    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("name" in updates) row.name = updates.name;
      if ("category" in updates) row.category = updates.category ?? null;
      if ("type" in updates) row.item_type = updates.type;
      if ("mode" in updates) row.mode = updates.mode;
      if ("uom" in updates) row.uom = updates.uom ?? null;
      if ("store" in updates) row.store = updates.store ?? null;
      if ("active" in updates) row.active = updates.active;
      if ("currentStock" in updates) row.current_stock = updates.currentStock;
      if ("defaultPrice" in updates) row.default_price = updates.defaultPrice;
      if ("regularBuyingPrice" in updates) row.regular_buying_price = updates.regularBuyingPrice;
      if ("wholesaleBuyingPrice" in updates) row.wholesale_buying_price = updates.wholesaleBuyingPrice;
      if ("regularSellingPrice" in updates) row.regular_selling_price = updates.regularSellingPrice;
      if ("mrp" in updates) row.mrp = updates.mrp;
      if ("dealerPrice" in updates) row.dealer_price = updates.dealerPrice;
      if ("distributorPrice" in updates) row.distributor_price = updates.distributorPrice;
      if ("hsnCode" in updates) row.hsn_code = updates.hsnCode ?? null;
      if ("tax" in updates) row.tax = updates.tax;
      if ("minStock" in updates) row.min_stock = updates.minStock;
      if ("maxStock" in updates) row.max_stock = updates.maxStock;
      if ("reservedStock" in updates) row.reserved_stock = updates.reservedStock;
      if ("soldUnits" in updates) row.sold_units = updates.soldUnits;
      if ("purchasedUnits" in updates) row.purchased_units = updates.purchasedUnits;
      const { error } = await db.from("inventory_items").update(row).eq("id", id);
      if (error) { console.error("[store] updateInventoryItem failed:", error.message); return; }
    }
    setState((s) => ({ ...s, inventory: s.inventory.map((i) => (i.id === id ? { ...i, ...updates } : i)) }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "currentStock", label: "Stock" }, { key: "name", label: "Name" }, { key: "defaultPrice", label: "Default Price", format: inr }, { key: "regularSellingPrice", label: "Selling Price", format: inr },
    ]);
    let action = "Item Edited"; let severity: ActivitySeverity = "info";
    if ("currentStock" in updates && prev && updates.currentStock !== prev.currentStock) { const inc = (updates.currentStock ?? 0) > prev.currentStock; action = inc ? "Stock Increased" : "Stock Reduced"; severity = inc ? "success" : "warning"; }
    logActivity({ module: "Inventory", action, severity, entity: "Item", reference: id, description: `Updated inventory item ${prev?.name || id}.`, changes });
  }, []);

  const deleteInventoryItem = useCallback(async (id: string) => {
    const prev = stateRef.current.inventory.find((i) => i.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("inventory_items").delete().eq("id", id);
      if (error) { console.error("[store] deleteInventoryItem failed:", error.message); return; }
    }
    setState((s) => ({ ...s, inventory: s.inventory.filter((i) => i.id !== id) }));
    logActivity({ module: "Inventory", action: "Item Deleted", severity: "critical", entity: "Item", reference: id, description: `Deleted inventory item ${prev?.name || id}.`, meta: prev ? { Category: prev.category, Stock: String(prev.currentStock) } : undefined });
  }, []);

  /* ── Customer actions (DB-first) ── */
  const addCustomer = useCallback(async (customer: Customer) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("customers").insert(customerToRow(customer)).select("*").single();
      if (error || !data) { console.error("[store] addCustomer failed:", error?.message); return; }
      const saved = rowToCustomer(data);
      setState((s) => ({ ...s, customers: [saved, ...s.customers] }));
      logActivity({ module: "Customer", action: "Customer Created", severity: "success", entity: "Customer", reference: saved.id, description: `Added new customer ${saved.fullName}.`, meta: { Mobile: saved.mobile, ...(saved.company ? { Company: saved.company } : {}) } });
      return;
    }
    setState((s) => ({ ...s, customers: [customer, ...s.customers] }));
    logActivity({ module: "Customer", action: "Customer Created", severity: "success", entity: "Customer", reference: customer.id, description: `Added new customer ${customer.fullName}.`, meta: { Mobile: customer.mobile, ...(customer.company ? { Company: customer.company } : {}) } });
  }, []);

  const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>) => {
    const prev = stateRef.current.customers.find((c) => c.id === id);
    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("firstName" in updates) row.first_name = updates.firstName ?? null;
      if ("lastName" in updates) row.last_name = updates.lastName ?? null;
      if ("fullName" in updates) row.full_name = updates.fullName ?? null;
      if ("mobile" in updates) row.mobile = updates.mobile ?? null;
      if ("email" in updates) row.email = updates.email ?? null;
      if ("company" in updates) row.company = updates.company ?? null;
      if ("gstNumber" in updates) row.gst_number = updates.gstNumber ?? null;
      if ("address" in updates) row.address = updates.address ?? null;
      if ("city" in updates) row.city = updates.city ?? null;
      if ("state" in updates) row.state = updates.state ?? null;
      if ("postalCode" in updates) row.postal_code = updates.postalCode ?? null;
      if ("notes" in updates) row.notes = updates.notes ?? null;
      if ("type" in updates) row.type = updates.type;
      if ("status" in updates) row.status = updates.status;
      if ("totalTickets" in updates) row.total_tickets = updates.totalTickets;
      if ("totalInvoices" in updates) row.total_invoices = updates.totalInvoices;
      if ("totalRepairs" in updates) row.total_repairs = updates.totalRepairs;
      if ("lifetimeValue" in updates) row.lifetime_value = updates.lifetimeValue;
      if ("lastVisit" in updates) row.last_visit = updates.lastVisit ?? null;
      const { error } = await db.from("customers").update(row).eq("id", id);
      if (error) { console.error("[store] updateCustomer failed:", error.message); return; }
    }
    setState((s) => ({ ...s, customers: s.customers.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)) }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "fullName", label: "Name" }, { key: "mobile", label: "Mobile" }, { key: "email", label: "Email" }, { key: "status", label: "Status" },
    ]);
    logActivity({ module: "Customer", action: "Customer Updated", severity: "info", entity: "Customer", reference: id, description: `Updated customer ${prev?.fullName || id}.`, changes });
  }, []);

  const deleteCustomer = useCallback(async (id: string) => {
    const prev = stateRef.current.customers.find((c) => c.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteCustomer failed:", error.message); return; }
    }
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
    logActivity({ module: "Customer", action: "Customer Deleted", severity: "critical", entity: "Customer", reference: id, description: prev ? `Deleted customer ${prev.fullName}.` : `Deleted customer ${id}.`, meta: prev ? { Mobile: prev.mobile } : undefined });
  }, []);

  /* ── Company actions (DB-first) ── */
  const addCompany = useCallback(async (company: Company) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("companies").insert(companyToRow(company)).select("*").single();
      if (error || !data) { console.error("[store] addCompany failed:", error?.message); return; }
      const saved = rowToCompany(data);
      setState((s) => ({ ...s, companies: [saved, ...s.companies] }));
      logActivity({ module: "Company", action: "Company Created", severity: "success", entity: "Company", reference: saved.id, description: `Added new company ${saved.name}.`, meta: { Industry: saved.industry || "—", Owner: saved.owner || "—" } });
      return;
    }
    setState((s) => ({ ...s, companies: [company, ...s.companies] }));
    logActivity({ module: "Company", action: "Company Created", severity: "success", entity: "Company", reference: company.id, description: `Added new company ${company.name}.`, meta: { Industry: company.industry || "—", Owner: company.owner || "—" } });
  }, []);

  const updateCompany = useCallback(async (id: string, updates: Partial<Company>) => {
    const prev = stateRef.current.companies.find((c) => c.id === id);
    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("name" in updates) row.name = updates.name ?? null;
      if ("companyType" in updates) row.company_type = updates.companyType ?? null;
      if ("industry" in updates) row.industry = updates.industry ?? null;
      if ("businessCategory" in updates) row.business_category = updates.businessCategory ?? null;
      if ("businessSize" in updates) row.business_size = updates.businessSize ?? null;
      if ("numberOfEmployees" in updates) row.number_of_employees = updates.numberOfEmployees ?? null;
      if ("annualRevenue" in updates) row.annual_revenue = updates.annualRevenue ?? null;
      if ("gstNumber" in updates) row.gst_number = updates.gstNumber ?? null;
      if ("panNumber" in updates) row.pan_number = updates.panNumber ?? null;
      if ("website" in updates) row.website = updates.website ?? null;
      if ("owner" in updates) row.owner = updates.owner ?? null;
      if ("branch" in updates) row.branch = updates.branch ?? null;
      if ("assignedEmployee" in updates) row.assigned_employee = updates.assignedEmployee ?? null;
      if ("status" in updates) row.status = updates.status;
      if ("phones" in updates) row.phones = updates.phones;
      if ("emails" in updates) row.emails = updates.emails;
      if ("communicationPreferences" in updates) row.communication_preferences = updates.communicationPreferences;
      if ("address" in updates) row.address_data = updates.address;
      if ("businessDetails" in updates) row.business_details = updates.businessDetails;
      if ("socialLinks" in updates) row.social_links = updates.socialLinks;
      if ("notes" in updates) row.notes = updates.notes ?? null;
      const { error } = await db.from("companies").update(row).eq("id", id);
      if (error) { console.error("[store] updateCompany failed:", error.message); return; }
    }
    setState((s) => ({ ...s, companies: s.companies.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)) }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "name", label: "Name" }, { key: "industry", label: "Industry" }, { key: "status", label: "Status" }, { key: "owner", label: "Owner" },
    ]);
    logActivity({ module: "Company", action: "Company Updated", severity: "info", entity: "Company", reference: id, description: `Updated company ${prev?.name || id}.`, changes });
  }, []);

  const deleteCompany = useCallback(async (id: string) => {
    const prev = stateRef.current.companies.find((c) => c.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("companies").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteCompany failed:", error.message); return; }
    }
    setState((s) => ({ ...s, companies: s.companies.filter((c) => c.id !== id) }));
    logActivity({ module: "Company", action: "Company Deleted", severity: "critical", entity: "Company", reference: id, description: prev ? `Deleted company ${prev.name}.` : `Deleted company ${id}.` });
  }, []);

  /* ── Brand & Model actions (DB-first) ── */
  const addBrand = useCallback(async (brand: Brand) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("brands").insert({ id: brand.id, name: brand.name }).select("*").single();
      if (error || !data) { console.error("[store] addBrand failed:", error?.message); return; }
      const saved = rowToBrand(data);
      setState((s) => ({ ...s, brands: [...s.brands, saved] }));
      logActivity({ module: "Price List", action: "Brand Added", severity: "success", entity: "Brand", reference: saved.name, description: `Added device brand ${saved.name}.` });
      return;
    }
    setState((s) => ({ ...s, brands: [...s.brands, brand] }));
    logActivity({ module: "Price List", action: "Brand Added", severity: "success", entity: "Brand", reference: brand.name, description: `Added device brand ${brand.name}.` });
  }, []);

  const addDeviceModel = useCallback(async (model: DeviceModel) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("device_models").insert({ id: model.id, brand_id: model.brandId, name: model.name }).select("*").single();
      if (error || !data) { console.error("[store] addDeviceModel failed:", error?.message); return; }
      const saved = rowToDeviceModel(data);
      setState((s) => ({ ...s, deviceModels: [...s.deviceModels, saved] }));
      const brand = stateRef.current.brands.find((b) => b.id === model.brandId);
      logActivity({ module: "Price List", action: "Model Added", severity: "success", entity: "Device Model", reference: saved.name, description: `Added model ${saved.name}${brand ? ` under ${brand.name}` : ""}.` });
      return;
    }
    const brand = stateRef.current.brands.find((b) => b.id === model.brandId);
    setState((s) => ({ ...s, deviceModels: [...s.deviceModels, model] }));
    logActivity({ module: "Price List", action: "Model Added", severity: "success", entity: "Device Model", reference: model.name, description: `Added model ${model.name}${brand ? ` under ${brand.name}` : ""}.` });
  }, []);

  const deleteBrand = useCallback(async (id: string) => {
    const prev = stateRef.current.brands.find((b) => b.id === id);
    const modelCount = stateRef.current.deviceModels.filter((m) => m.brandId === id).length;
    if (shouldUseDb()) {
      // Cascade: delete models first, then brand.
      await db.from("device_models").delete().eq("brand_id", id);
      const { error } = await db.from("brands").delete().eq("id", id);
      if (error) { console.error("[store] deleteBrand failed:", error.message); return; }
    }
    setState((s) => ({ ...s, brands: s.brands.filter((b) => b.id !== id), deviceModels: s.deviceModels.filter((m) => m.brandId !== id) }));
    logActivity({ module: "Price List", action: "Brand Deleted", severity: "critical", entity: "Brand", reference: prev?.name || id, description: prev ? `Deleted brand ${prev.name} and ${modelCount} associated model${modelCount !== 1 ? "s" : ""}.` : `Deleted brand ${id}.` });
  }, []);

  const deleteDeviceModel = useCallback(async (id: string) => {
    const prev = stateRef.current.deviceModels.find((m) => m.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("device_models").delete().eq("id", id);
      if (error) { console.error("[store] deleteDeviceModel failed:", error.message); return; }
    }
    setState((s) => ({ ...s, deviceModels: s.deviceModels.filter((m) => m.id !== id) }));
    logActivity({ module: "Price List", action: "Model Deleted", severity: "critical", entity: "Device Model", reference: prev?.name || id, description: prev ? `Deleted device model ${prev.name}.` : `Deleted model ${id}.` });
  }, []);

  const resetBrandsAndModels = useCallback(() => {
    setState((s) => ({ ...s, brands: SEED_BRANDS, deviceModels: SEED_MODELS }));
  }, []);

  /* ── Assigned By master list actions (DB-first) ── */
  const addAssignedByOption = useCallback(async (option: AssignedByOption) => {
    // Prevent duplicates (case-insensitive)
    const exists = stateRef.current.assignedByOptions.some((o) => o.name.toLowerCase() === option.name.toLowerCase());
    if (exists) return;
    // Optimistically add to state immediately so the UI reflects the change
    setState((s) => ({ ...s, assignedByOptions: [...s.assignedByOptions, option] }));
    logActivity({ module: "Ticket", action: "Assigned By Added", severity: "success", entity: "Assigned By", reference: option.name, description: `Added "${option.name}" to Assigned By master list.` });
    if (shouldUseDb()) {
      const { error } = await db.from("assigned_by_options").insert({ id: option.id, name: option.name });
      if (error) {
        console.error("[store] addAssignedByOption sync failed:", error.code, error.message);
        toast.error("Not saved to database", { description: `Assigned By couldn't be saved (DB [${error.code ?? "?"}]). It will disappear on reload until the DB is migrated.` });
      }
    }
  }, []);

  /* ── Assigned To master list actions (DB-first) ── */
  const addAssignedToOption = useCallback(async (option: AssignedToOption) => {
    const exists = stateRef.current.assignedToOptions.some((o) => o.name.toLowerCase() === option.name.toLowerCase());
    if (exists) return;
    setState((s) => ({ ...s, assignedToOptions: [...s.assignedToOptions, option] }));
    logActivity({ module: "Ticket", action: "Assigned To Added", severity: "success", entity: "Assigned To", reference: option.name, description: `Added "${option.name}" to Assigned To master list.` });
    if (shouldUseDb()) {
      const { error } = await db.from("assigned_to_options").insert({ id: option.id, name: option.name });
      if (error) {
        console.error("[store] addAssignedToOption sync failed:", error.code, error.message);
        toast.error("Not saved to database", { description: `Assigned To couldn't be saved (DB [${error.code ?? "?"}]). It will disappear on reload until the DB is migrated.` });
      }
    }
  }, []);

  /* ── Delete Assigned By option (DB-first) ── */
  const deleteAssignedByOption = useCallback(async (id: string) => {
    setState((s) => ({ ...s, assignedByOptions: s.assignedByOptions.filter((o) => o.id !== id) }));
    logActivity({ module: "Ticket", action: "Assigned By Removed", severity: "warning", entity: "Assigned By", reference: id, description: `Removed entry from Assigned By master list.` });
    if (shouldUseDb()) {
      const { error } = await db.from("assigned_by_options").delete().eq("id", id);
      if (error) { console.error("[store] deleteAssignedByOption sync failed:", error.message); }
    }
  }, []);

  /* ── Delete Assigned To option (DB-first) ── */
  const deleteAssignedToOption = useCallback(async (id: string) => {
    setState((s) => ({ ...s, assignedToOptions: s.assignedToOptions.filter((o) => o.id !== id) }));
    logActivity({ module: "Ticket", action: "Assigned To Removed", severity: "warning", entity: "Assigned To", reference: id, description: `Removed entry from Assigned To master list.` });
    if (shouldUseDb()) {
      const { error } = await db.from("assigned_to_options").delete().eq("id", id);
      if (error) { console.error("[store] deleteAssignedToOption sync failed:", error.message); }
    }
  }, []);

  /* ── Issue Library actions ── */
  const addIssueToStore = useCallback((issue: string) => {
    const trimmed = issue.trim();
    if (!trimmed) return;
    setState((s) => {
      const exists = s.issueLibrary.some((i) => i.toLowerCase() === trimmed.toLowerCase());
      if (exists) return s;
      return { ...s, issueLibrary: [...s.issueLibrary, trimmed] };
    });
  }, []);

  const deleteIssueFromStore = useCallback((issue: string) => {
    setState((s) => ({
      ...s,
      issueLibrary: s.issueLibrary.filter((i) => i.toLowerCase() !== issue.trim().toLowerCase()),
    }));
  }, []);

  const store: Store = {
    ...state,
    addTicket,
    updateTicket,
    deleteTicket,
    bulkUpdateStatus,
    pinTicket,
    pinInvoice,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    addWalkIn,
    updateWalkIn,
    deleteWalkIn,
    updateTeamMember,
    deductPartsForTicket,
    addStockMovement,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addCompany,
    updateCompany,
    deleteCompany,
    addBrand,
    addDeviceModel,
    deleteBrand,
    deleteDeviceModel,
    addAssignedByOption,
    addAssignedToOption,
    deleteAssignedByOption,
    deleteAssignedToOption,
    addIssueToStore,
    deleteIssueFromStore,
    resetBrandsAndModels,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
