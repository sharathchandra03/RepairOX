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
  /** True once initial DB load completes (or localStorage is read). */
  hydrated: boolean;
  /** "db" when Supabase is active, "local" otherwise. */
  mode: "db" | "local";
}

interface StoreActions {
  addTicket: (ticket: Ticket) => Promise<void>;
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
  resetBrandsAndModels: () => void;
}

type Store = StoreState & StoreActions;

/* ─── Row <-> App Model Mappers ──────────────────────────────────────── */

function rowToTicket(r: any): Ticket {
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
    status: r.status ?? "received",
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
    devices: r.devices ?? undefined,
  };
}

function ticketToRow(t: Ticket): Record<string, unknown> {
  return {
    id: t.id,
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
    devices: t.devices ?? [],
  };
}

function rowToInvoice(r: any): Invoice {
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
    paymentMode: r.payment_mode ?? undefined,
    serviceCategory: r.service_category ?? "service",
    items: r.items ?? [],
    devices: r.devices ?? [],
    createdAt: r.created_at ?? new Date().toISOString(),
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
    payment_mode: inv.paymentMode || null,
    service_category: inv.serviceCategory || "service",
    items: inv.items ?? [],
    devices: inv.devices ?? [],
  };
}

/** True when a Supabase error is a primary-key / unique-constraint violation. */
function isDuplicateKeyError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "23505" || /duplicate key|already exists/i.test(err.message ?? "");
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

/* ─── Context + localStorage fallback ────────────────────────────────── */

const StoreContext = createContext<Store | null>(null);
const STORAGE_KEY = "repairox-store-v2";

function loadFromStorage(): StoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
      hydrated: true,
      mode: "local" as const,
    };
  } catch { return null; }
}

function saveToStorage(state: StoreState) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => {
    if (isSupabaseConfigured) {
      // Start empty — data will be loaded from DB in useEffect.
      return {
        tickets: [], invoices: [], walkIns: [], orders: [], revenue: [],
        team: [], inventory: [], stockMovements: [], customers: [],
        companies: [], brands: [], deviceModels: [], hydrated: false, mode: "db",
      };
    }
    const saved = loadFromStorage();
    if (saved) return saved;
    return {
      tickets: SEED_TICKETS, invoices: SEED_INVOICES, walkIns: SEED_WALKINS,
      orders: SEED_ORDERS, revenue: SEED_REVENUE, team: TEAM_SEED,
      inventory: SEED_INVENTORY, stockMovements: SEED_MOVEMENTS,
      customers: SEED_CUSTOMERS, brands: SEED_BRANDS, deviceModels: SEED_MODELS,
      companies: SEED_COMPANIES,
      hydrated: true, mode: "local",
    };
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;

  /* ── DB Load + Realtime Subscriptions ── */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
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
        hydrated: true,
      }));
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
          default: return prev;
        }
      });
    };

    const tables = ["tickets", "invoices", "walk_ins", "inventory_items", "stock_movements", "customers", "companies", "brands", "device_models"];

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
  }, []);

  // Persist local-mode state to localStorage (only when NOT using Supabase).
  useEffect(() => {
    if (isSupabaseConfigured || !state.hydrated) return;
    saveToStorage(state);
  }, [state]);

  /* ── Ticket actions (DB-first) ── */
  const addTicket = useCallback(async (ticket: Ticket) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("tickets").insert(ticketToRow(ticket)).select("*").single();
      if (error || !data) { console.error("[store] addTicket failed:", error?.message); return; }
      const saved = rowToTicket(data);
      setState((s) => ({ ...s, tickets: [saved, ...s.tickets] }));
      logActivity({ module: "Ticket", action: "Ticket Created", severity: "success", entity: "Ticket", reference: saved.id, description: `Created a new repair ticket for ${saved.model || saved.device} (${saved.customer}).`, meta: { Device: saved.device, Technician: saved.technician || "Unassigned", Amount: inr(saved.amount) } });
      return;
    }
    setState((s) => ({ ...s, tickets: [ticket, ...s.tickets] }));
    logActivity({ module: "Ticket", action: "Ticket Created", severity: "success", entity: "Ticket", reference: ticket.id, description: `Created a new repair ticket for ${ticket.model || ticket.device} (${ticket.customer}).`, meta: { Device: ticket.device, Technician: ticket.technician || "Unassigned", Amount: inr(ticket.amount) } });
  }, []);

  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>) => {
    const prev = stateRef.current.tickets.find((t) => t.id === id);
    if (isSupabaseConfigured && supabase) {
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

      const { error } = await supabase.from("tickets").update(row).eq("id", id);
      if (error) { console.error("[store] updateTicket failed:", error.message); return; }
    }
    setState((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...updates } : t)) }));
    const statusFmt = (v: unknown) => STATUS_LABEL[v as TicketStatus] ?? String(v ?? "—");
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "status", label: "Status", format: statusFmt }, { key: "technician", label: "Technician" },
      { key: "priority", label: "Priority" }, { key: "amount", label: "Amount", format: inr },
    ]);
    let action = "Ticket Updated"; let severity: ActivitySeverity = "info";
    if ("status" in updates && updates.status !== prev?.status) { action = "Status Changed"; if (updates.status === "completed" || updates.status === "delivered") severity = "success"; }
    else if ("technician" in updates && updates.technician !== prev?.technician) action = "Technician Changed";
    else if ("priority" in updates && updates.priority !== prev?.priority) { action = "Priority Changed"; severity = "warning"; }
    logActivity({ module: "Ticket", action, severity, entity: "Ticket", reference: id, description: `Updated ticket ${id}${prev ? ` (${prev.customer})` : ""}.`, changes });
  }, []);

  const deleteTicket = useCallback(async (id: string) => {
    const prev = stateRef.current.tickets.find((t) => t.id === id);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("tickets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteTicket failed:", error.message); return; }
    }
    setState((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== id) }));
    logActivity({ module: "Ticket", action: "Ticket Deleted", severity: "critical", entity: "Ticket", reference: id, description: prev ? `Deleted ticket for ${prev.model || prev.device} (${prev.customer}).` : `Deleted ticket ${id}.`, meta: prev ? { Status: STATUS_LABEL[prev.status] ?? prev.status, Amount: inr(prev.amount) } : undefined });
  }, []);

  const bulkUpdateStatus = useCallback(async (ids: string[], status: TicketStatus) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("tickets").update({ status }).in("id", ids);
      if (error) { console.error("[store] bulkUpdateStatus failed:", error.message); return; }
    }
    setState((s) => ({ ...s, tickets: s.tickets.map((t) => (ids.includes(t.id) ? { ...t, status } : t)) }));
    const label = STATUS_LABEL[status] ?? status;
    logActivity({ module: "Ticket", action: "Status Changed", severity: "info", entity: "Ticket", reference: ids.length === 1 ? ids[0] : `${ids.length} tickets`, description: `Bulk updated ${ids.length} ticket${ids.length !== 1 ? "s" : ""} to ${label}.`, changes: [{ field: "Status", to: label }] });
  }, []);

  /* ── Invoice actions (DB-first) ── */
  const addInvoice = useCallback(async (invoice: Invoice): Promise<string> => {
    if (isSupabaseConfigured && supabase) {
      // Single insert attempt. Retries once without the optional columns in case
      // an older DB is missing them.
      const attemptInsert = async (inv: Invoice) => {
        const row = invoiceToRow(inv);
        let res = await supabase!.from("invoices").insert(row).select("*").single();
        if (res.error && !isDuplicateKeyError(res.error)) {
          const fallbackRow = { ...row };
          delete fallbackRow.service_category;
          delete fallbackRow.payment_mode;
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
        console.error("[store] addInvoice failed:", res.error?.message);
        // Last resort: keep locally so the user doesn't lose their work. (Won't
        // survive a reload, but avoids data loss mid-session.)
        setState((s) => ({ ...s, invoices: [current, ...s.invoices] }));
        logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: current.reference || current.id, description: `Generated invoice for ${current.customer}.`, meta: { Total: inr(current.total) } });
        return current.id;
      }

      const saved = rowToInvoice(res.data);
      // Preserve serviceCategory/paymentMode locally even if DB lacks the columns.
      saved.serviceCategory = current.serviceCategory;
      saved.paymentMode = current.paymentMode;
      setState((s) => ({ ...s, invoices: [saved, ...s.invoices] }));
      logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: saved.reference || saved.id, description: `Generated invoice for ${saved.customer}.`, meta: { Total: inr(saved.total) } });
      return saved.id;
    }
    setState((s) => ({ ...s, invoices: [invoice, ...s.invoices] }));
    logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: invoice.reference || invoice.id, description: `Generated invoice for ${invoice.customer}.`, meta: { Total: inr(invoice.total) } });
    return invoice.id;
  }, []);

  const updateInvoice = useCallback(async (id: string, updates: Partial<Invoice>) => {
    const prev = stateRef.current.invoices.find((inv) => inv.id === id);
    if (isSupabaseConfigured && supabase) {
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
      const { error } = await supabase.from("invoices").update(row).eq("id", id);
      if (error) {
        // Retry without optional new columns that may not exist in DB yet
        delete row.service_category;
        delete row.payment_mode;
        if (Object.keys(row).length > 0) {
          const { error: error2 } = await supabase.from("invoices").update(row).eq("id", id);
          if (error2) { console.error("[store] updateInvoice failed:", error2.message); }
        }
      }
    }
    setState((s) => ({ ...s, invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv)) }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "status", label: "Status" }, { key: "paidAmount", label: "Paid", format: inr }, { key: "total", label: "Total", format: inr },
    ]);
    let action = "Invoice Updated"; let severity: ActivitySeverity = "info";
    if (("paidAmount" in updates && (updates.paidAmount ?? 0) > (prev?.paidAmount ?? 0)) || updates.status === "paid") { action = "Payment Added"; severity = "success"; }
    else if (updates.status === "cancelled") { action = "Cancelled"; severity = "critical"; }
    logActivity({ module: "Invoice", action, severity, entity: "Invoice", reference: prev?.reference || id, description: `Updated invoice ${prev?.reference || id} (${prev?.customer ?? ""}).`, changes });
  }, []);

  const deleteInvoice = useCallback(async (id: string) => {
    const prev = stateRef.current.invoices.find((inv) => inv.id === id);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("invoices").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteInvoice failed:", error.message); return; }
    }
    setState((s) => ({ ...s, invoices: s.invoices.filter((inv) => inv.id !== id) }));
    logActivity({ module: "Invoice", action: "Invoice Deleted", severity: "critical", entity: "Invoice", reference: prev?.reference || id, description: prev ? `Deleted invoice ${prev.reference} for ${prev.customer}.` : `Deleted invoice ${id}.`, meta: prev ? { Total: inr(prev.total) } : undefined });
  }, []);

  /* ── Walk-In actions (DB-first) ── */
  const addWalkIn = useCallback(async (walkIn: WalkIn) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("walk_ins").insert(walkInToRow(walkIn)).select("*").single();
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
    if (isSupabaseConfigured && supabase) {
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
      const { error } = await supabase.from("walk_ins").update(row).eq("id", id);
      if (error) { console.error("[store] updateWalkIn failed:", error.message); return; }
    }
    setState((s) => ({ ...s, walkIns: s.walkIns.map((w) => (w.id === id ? { ...w, ...updates } : w)) }));
    const converted = "status" in updates && (updates.status === "converted_ticket" || updates.status === "converted_invoice") && updates.status !== prev?.status;
    logActivity({ module: "Walk-In", action: converted ? "Walk-In Converted" : "Walk-In Updated", severity: "info", entity: "Walk-In", reference: id, description: converted ? `Converted walk-in ${id}${updates.ticketId ? ` to ticket ${updates.ticketId}` : ""}.` : `Updated walk-in ${id}${prev ? ` (${prev.customer})` : ""}.`, ...(updates.ticketId ? { meta: { "New Ticket": updates.ticketId } } : {}) });
  }, []);

  const deleteWalkIn = useCallback(async (id: string) => {
    const prev = stateRef.current.walkIns.find((w) => w.id === id);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("walk_ins").update({ deleted_at: new Date().toISOString() }).eq("id", id);
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

    if (isSupabaseConfigured && supabase) {
      // Deduct from inventory in DB.
      for (const part of partsToDeduct) {
        if (!part.inventoryId) continue;
        const invItem = stateRef.current.inventory.find((i) => i.id === part.inventoryId);
        if (!invItem) continue;
        await supabase.from("inventory_items").update({ current_stock: invItem.currentStock - part.qty }).eq("id", part.inventoryId);
      }
      // Mark parts as used on the ticket.
      const updatedDevices = preTicket.devices?.map((d) => ({ ...d, parts: d.parts.map((p) => ({ ...p, status: "used" as const })) }));
      const updatedParts = preTicket.parts?.map((p) => ({ ...p, status: "used" as const }));
      await supabase.from("tickets").update({ parts: updatedParts ?? [], devices: updatedDevices ?? [] }).eq("id", ticketId);
      // Create stock movements.
      for (const [i, part] of partsToDeduct.entries()) {
        await supabase.from("stock_movements").insert(stockMovementToRow({
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
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("stock_movements").insert(stockMovementToRow(movement));
      if (error) { console.error("[store] addStockMovement failed:", error.message); return; }
    }
    setState((s) => ({ ...s, stockMovements: [movement, ...s.stockMovements] }));
    const inward = movement.type === "Inward";
    logActivity({ module: "Inventory", action: inward ? "Stock Increased" : "Stock Reduced", severity: inward ? "success" : "warning", entity: "Stock Movement", reference: movement.docNumber, description: `${movement.type} movement of ${movement.items} item${movement.items !== 1 ? "s" : ""}: ${movement.fromStore} → ${movement.toStore}.` });
  }, []);

  const addInventoryItem = useCallback(async (item: InventoryItem) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("inventory_items").insert(inventoryItemToRow(item)).select("*").single();
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
    if (isSupabaseConfigured && supabase) {
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
      const { error } = await supabase.from("inventory_items").update(row).eq("id", id);
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
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id);
      if (error) { console.error("[store] deleteInventoryItem failed:", error.message); return; }
    }
    setState((s) => ({ ...s, inventory: s.inventory.filter((i) => i.id !== id) }));
    logActivity({ module: "Inventory", action: "Item Deleted", severity: "critical", entity: "Item", reference: id, description: `Deleted inventory item ${prev?.name || id}.`, meta: prev ? { Category: prev.category, Stock: String(prev.currentStock) } : undefined });
  }, []);

  /* ── Customer actions (DB-first) ── */
  const addCustomer = useCallback(async (customer: Customer) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("customers").insert(customerToRow(customer)).select("*").single();
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
    if (isSupabaseConfigured && supabase) {
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
      const { error } = await supabase.from("customers").update(row).eq("id", id);
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
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteCustomer failed:", error.message); return; }
    }
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
    logActivity({ module: "Customer", action: "Customer Deleted", severity: "critical", entity: "Customer", reference: id, description: prev ? `Deleted customer ${prev.fullName}.` : `Deleted customer ${id}.`, meta: prev ? { Mobile: prev.mobile } : undefined });
  }, []);

  /* ── Company actions (DB-first) ── */
  const addCompany = useCallback(async (company: Company) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("companies").insert(companyToRow(company)).select("*").single();
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
    if (isSupabaseConfigured && supabase) {
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
      const { error } = await supabase.from("companies").update(row).eq("id", id);
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
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("companies").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteCompany failed:", error.message); return; }
    }
    setState((s) => ({ ...s, companies: s.companies.filter((c) => c.id !== id) }));
    logActivity({ module: "Company", action: "Company Deleted", severity: "critical", entity: "Company", reference: id, description: prev ? `Deleted company ${prev.name}.` : `Deleted company ${id}.` });
  }, []);

  /* ── Brand & Model actions (DB-first) ── */
  const addBrand = useCallback(async (brand: Brand) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("brands").insert({ id: brand.id, name: brand.name }).select("*").single();
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
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("device_models").insert({ id: model.id, brand_id: model.brandId, name: model.name }).select("*").single();
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
    if (isSupabaseConfigured && supabase) {
      // Cascade: delete models first, then brand.
      await supabase.from("device_models").delete().eq("brand_id", id);
      const { error } = await supabase.from("brands").delete().eq("id", id);
      if (error) { console.error("[store] deleteBrand failed:", error.message); return; }
    }
    setState((s) => ({ ...s, brands: s.brands.filter((b) => b.id !== id), deviceModels: s.deviceModels.filter((m) => m.brandId !== id) }));
    logActivity({ module: "Price List", action: "Brand Deleted", severity: "critical", entity: "Brand", reference: prev?.name || id, description: prev ? `Deleted brand ${prev.name} and ${modelCount} associated model${modelCount !== 1 ? "s" : ""}.` : `Deleted brand ${id}.` });
  }, []);

  const deleteDeviceModel = useCallback(async (id: string) => {
    const prev = stateRef.current.deviceModels.find((m) => m.id === id);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("device_models").delete().eq("id", id);
      if (error) { console.error("[store] deleteDeviceModel failed:", error.message); return; }
    }
    setState((s) => ({ ...s, deviceModels: s.deviceModels.filter((m) => m.id !== id) }));
    logActivity({ module: "Price List", action: "Model Deleted", severity: "critical", entity: "Device Model", reference: prev?.name || id, description: prev ? `Deleted device model ${prev.name}.` : `Deleted model ${id}.` });
  }, []);

  const resetBrandsAndModels = useCallback(() => {
    setState((s) => ({ ...s, brands: SEED_BRANDS, deviceModels: SEED_MODELS }));
  }, []);

  const store: Store = {
    ...state,
    addTicket,
    updateTicket,
    deleteTicket,
    bulkUpdateStatus,
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
