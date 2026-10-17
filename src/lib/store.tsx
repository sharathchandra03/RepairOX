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
import { useStoreContext } from "@/lib/store-context";
import { demoKey } from "@/lib/demo-mode";
import {
  tickets as SEED_TICKETS, ordersStatus as SEED_ORDERS, revenueMonthly as SEED_REVENUE,
  TEAM_SEED, invoices as SEED_INVOICES, walkIns as SEED_WALKINS,
  STATUS_LABEL, type Ticket, type TicketStatus, type TicketPart,
  type TeamMember, type Invoice, type WalkIn, type InvoiceLineItem,
  deriveTicketStatus, getTicketDevices, getInvoicedTicketDeviceIds,
  isProforma, getInvoiceDevices,
  type InvoiceRefund, type InvoiceRefundAllocation, type InvoiceItemReturn,
} from "@/lib/mock-data";
import {
  eligibility as refundEligibility,
  remainingRefundable,
  refundsForInvoice,
  INVOICE_REFUNDS_PAISA,
  type Allocation,
} from "@/lib/invoice-refunds";
import { recordTransaction as recordLedgerTransaction } from "@/lib/daily-ledger-service";
import {
  inventoryItems as SEED_INVENTORY, stockMovements as SEED_MOVEMENTS,
  type InventoryItem, type StockMovement, type ItemKind,
} from "@/lib/inventory-data";
import { seedCustomers as SEED_CUSTOMERS, type Customer, type CustomerGroup } from "@/lib/customer-data";
import { pointsFromInvoiceAmount, tierForLifetimeValue, thresholdsFromTiers, evaluateAutomaticGroups, type LoyaltyTier } from "@/lib/customer-service";
import { seedCompanies as SEED_COMPANIES, type Company } from "@/lib/company-data";
import {
  seedBrands as SEED_BRANDS, seedModels as SEED_MODELS,
  migrateLegacyBrands,
  type Brand, type DeviceModel,
} from "@/lib/brand-model-data";
import { loadDeviceCategories, DEFAULT_CATEGORIES } from "@/lib/device-categories";
import { type StockLayerLike } from "@/lib/inventory-costing";

/** Default device-category ids — used as a fallback bucket set for the
 *  synchronous localStorage legacy-brand migration. */
const DEFAULT_CATEGORY_IDS = DEFAULT_CATEGORIES.map((c) => c.id);
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
  /** DB-backed refund ledger (the financial-reversal authority). The invoice is
   *  never mutated; refund status is DERIVED from these rows (invoice-refunds.ts). */
  invoiceRefunds: InvoiceRefund[];
  /** Per-device / per-line refund breakdown (authoritative per-line refunded). */
  invoiceRefundAllocations: InvoiceRefundAllocation[];
  /** Physical item returns — independent of the money refund, linkable. */
  invoiceItemReturns: InvoiceItemReturn[];
  walkIns: WalkIn[];
  orders: OrderStatus[];
  revenue: RevenueMonth[];
  team: TeamMember[];
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  /** Cost-carrying stock ledger layers (inventory_stock_layers), used by the
   *  weighted-average valuation (LEDGER-DISCONNECT). Cost-scoped: RLS yields
   *  rows ONLY to a cost-capable user, so this is EMPTY for a non-cost user
   *  (valuation then falls back to the org-level CP). Branch-scoped by RLS. */
  inventoryStockLayers: StockLayerLike[];
  customers: Customer[];
  customerGroups: CustomerGroup[];
  /** Denormalized loyalty snapshot per customer (points balance + tier), keyed
   *  by customer id. Loaded from loyalty_accounts and kept live via realtime +
   *  the award/adjust flow, so the Customer Master can show points/tier and
   *  manual changes reflect immediately. */
  loyaltyByCustomer: Record<string, { points: number; tier: LoyaltyTier }>;
  companies: Company[];
  brands: Brand[];
  deviceModels: DeviceModel[];
  assignedByOptions: AssignedByOption[];
  assignedToOptions: AssignedToOption[];
  /** Global issue library — issues saved from ticket forms appear here */
  issueLibrary: string[];
  /** True once initial DB load completes (or localStorage is read). */
  hydrated: boolean;
  /** Critical sources that failed initial loading. Analytics must not convert
   * these failures into legitimate zero revenue or zero-ticket results. */
  loadErrors?: string[];
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
  updateDeviceStatus: (ticketId: string, deviceId: string, status: TicketStatus) => Promise<void>;
  addInvoice: (invoice: Invoice) => Promise<string>;
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  /** Convert a Proforma into a NEW normal Invoice. Atomic + idempotent: never
   *  mutates/deletes the proforma; if already converted, returns the existing
   *  invoice id. Returns the (new or existing) final Invoice id, or "" on
   *  failure/permission denial. */
  convertProformaToInvoice: (proformaId: string) => Promise<string>;
  /* ── Refunds & Returns (DB-backed; the finalized invoice is NEVER mutated) ── */
  /** Create a refund against a finalized invoice (money event + allocations).
   *  Returns the refund_no (or "" on failure/denial). Manual method → succeeded
   *  immediately; gateway method → pending until settleRefund. The DB guard is
   *  the authoritative over-refund + eligibility + SoD check. */
  processRefund: (input: ProcessRefundInput) => Promise<string>;
  /** Settle a gateway refund: pending/processing → succeeded|failed. Only
   *  succeeded affects balances/loyalty/reports. */
  settleRefund: (refundId: string, update: { status: "succeeded" | "failed"; reference?: string }) => Promise<void>;
  /** Compensating reversal (never a delete): status → reversed, re-reverses
   *  loyalty once, retains the physical-return link, never auto-touches stock. */
  reverseRefund: (refundId: string, reason: string) => Promise<void>;
  /** Record a physical item return (return-first allowed). Does NOT touch stock. */
  recordItemReturn: (input: RecordItemReturnInput) => Promise<string>;
  /** Execute the disposition-gated restock via the atomic DB function (the
   *  net-new current_stock increment, valued at cost — never selling price). */
  restockItemReturn: (returnId: string) => Promise<void>;
  addWalkIn: (walkIn: WalkIn) => Promise<void>;
  updateWalkIn: (id: string, updates: Partial<WalkIn>) => Promise<void>;
  deleteWalkIn: (id: string) => Promise<void>;
  pinWalkIn: (id: string, pinned: boolean) => Promise<void>;
  updateTeamMember: (email: string, updates: Partial<TeamMember>) => void;
  deductPartsForTicket: (ticketId: string) => Promise<void>;
  addStockMovement: (movement: StockMovement, opts?: { itemId?: string; unitCost?: number }) => Promise<void>;
  addInventoryItem: (
    item: InventoryItem,
    opts?: {
      cost?: { costPrice: number; standardLabourCost: number; configured: boolean };
      opening?: { qty: number; unitCost: number };
    },
  ) => Promise<void>;
  updateInventoryItem: (
    id: string,
    updates: Partial<InventoryItem>,
    opts?: { cost?: { costPrice: number; standardLabourCost: number; configured: boolean } },
  ) => Promise<void>;
  /** SYS-6 — dedicated, audited reconciliation that resolves a legacy
   *  migration_flag contradiction and clears the flag. Not a side effect of a
   *  normal edit. */
  reconcileMigrationFlag: (id: string) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  /** Merge a duplicate customer into a primary record (tickets, invoices,
   *  walk-ins, loyalty, groups). See mergeCustomersAction for scope notes. */
  mergeCustomersAction: (primaryId: string, secondaryId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  /** Manually adjust a customer's loyalty points (delta may be negative) with a
   *  reason. Writes an immutable `adjustment` ledger row, upserts the account
   *  balance + recomputes tier, and updates local state so the Customer Master
   *  reflects it immediately. Returns the new balance/tier. */
  adjustLoyalty: (customerId: string, pointsDelta: number, reason: string) => Promise<{ ok: boolean; points: number; tier: LoyaltyTier; error?: string }>;
  addCustomerGroup: (group: CustomerGroup) => Promise<void>;
  updateCustomerGroup: (id: string, updates: Partial<CustomerGroup>) => Promise<void>;
  deleteCustomerGroup: (id: string) => Promise<void>;
  addCompany: (company: Company) => Promise<void>;
  updateCompany: (id: string, updates: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  addBrand: (brand: Brand) => Promise<void>;
  updateBrand: (id: string, updates: Partial<Brand>) => Promise<void>;
  addDeviceModel: (model: DeviceModel) => Promise<void>;
  updateDeviceModel: (id: string, updates: Partial<DeviceModel>) => Promise<void>;
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

/** Input for processRefund — the UI computes scope + allocation via the pure
 *  invoice-refunds.ts engine and passes the result; the store writes it + the
 *  DB guard revalidates. */
export interface ProcessRefundInput {
  invoiceId: string;
  scope: "invoice" | "devices" | "lines";
  refundKind: "full_scope" | "partial";
  /** gross cash = refundNet + refundTax (authoritative) */
  refundAmount: number;
  refundNet: number;
  refundTax: number;
  refundDiscount?: number;
  reasonCode: string;
  reasonComment?: string;
  method: string;
  reference?: string;
  customerNote?: string;
  internalRemark?: string;
  /** manual → immediate succeeded; gateway → pending (default manual). */
  gateway?: boolean;
  /** the per-line/device allocation lines (from allocateScope / distributePartial). */
  allocation: Allocation;
}

export interface RecordItemReturnInput {
  invoiceId: string;
  deviceId?: string;
  lineId?: string;
  sku?: string;
  itemName?: string;
  refundId?: string;
  returnQty: number;
  condition: InvoiceItemReturn["condition"];
  disposition: InvoiceItemReturn["disposition"];
  unitCost?: number;
  receivingStore?: string;
  inspectionNotes?: string;
  branchId?: string | null;
}

/* ─── Row <-> App Model Mappers ──────────────────────────────────────── */

function rowToTicket(r: any): Ticket {
  // devices column stores both device records and metadata (customerType, GST fields)
  const rawDevices = r.devices ?? {};
  const isLegacyArray = Array.isArray(rawDevices);
  const deviceRecords = isLegacyArray ? rawDevices : (rawDevices.records ?? []);
  const meta = isLegacyArray ? {} : rawDevices;
  return {
    id: r.id,
    branchId: r.branch_id ?? null,
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
    contactId: r.contact_id ?? meta.contactId ?? undefined,
    customerId: r.customer_id ?? undefined,
    customerType: meta.customerType ?? undefined,
    gstNumber: meta.gstNumber ?? undefined,
    gstRate: meta.gstRate != null ? Number(meta.gstRate) : undefined,
    sgstRate: meta.sgstRate != null ? Number(meta.sgstRate) : undefined,
    cgstRate: meta.cgstRate != null ? Number(meta.cgstRate) : undefined,
    sgst: meta.sgst != null ? Number(meta.sgst) : undefined,
    cgst: meta.cgst != null ? Number(meta.cgst) : undefined,
    devices: deviceRecords,
    linkedWalkInId: meta.linkedWalkInId ?? undefined,
    linkedFieldJobId: meta.linkedFieldJobId ?? undefined,
    linkedLeadId: meta.linkedLeadId ?? undefined,
    // Record-type + Estimate metadata — packed in the same JSONB envelope so no
    // DB migration is needed. Absent → legacy row → getRecordType treats it as
    // a normal "ticket".
    recordType: meta.recordType ?? undefined,
    estimateStatus: meta.estimateStatus ?? undefined,
    convertedTicketId: meta.convertedTicketId ?? undefined,
    convertedFromEstimateId: meta.convertedFromEstimateId ?? undefined,
    // Billing lineage — packed in the same JSONB envelope (no migration).
    proformaId: meta.proformaId ?? undefined,
    invoiceId: meta.invoiceId ?? undefined,
    // Warranty case metadata — packed in the same JSONB envelope (no migration).
    parentTicketId: meta.parentTicketId ?? undefined,
    parentTicketNo: meta.parentTicketNo ?? undefined,
    warrantyDeviceIds: meta.warrantyDeviceIds ?? undefined,
    warrantyIssue: meta.warrantyIssue ?? undefined,
    warrantyStatus: meta.warrantyStatus ?? undefined,
    sourceInvoiceId: meta.sourceInvoiceId ?? undefined,
    createdFromTicketId: meta.createdFromTicketId ?? undefined,
    createdFromReason: meta.createdFromReason ?? undefined,
    pinnedAt: r.pinned_at ?? undefined,
    ticketNo: r.ticket_no ?? undefined,
  };
}

/** Build the `devices` JSONB envelope (multi-device records + ticket-level
 *  metadata) from a Ticket. Single source of truth used by BOTH ticketToRow
 *  (insert) and updateTicket (update) so a partial update can never drop the
 *  packed metadata (recordType / estimateStatus / GST / origin links …). */
function ticketDevicesEnvelope(t: Partial<Ticket>): Record<string, unknown> {
  return {
    records: t.devices ?? [],
    customerType: t.customerType || null,
    gstNumber: t.gstNumber || null,
    gstRate: t.gstRate ?? null,
    sgstRate: t.sgstRate ?? null,
    cgstRate: t.cgstRate ?? null,
    sgst: t.sgst ?? null,
    cgst: t.cgst ?? null,
    linkedWalkInId: t.linkedWalkInId || null,
    linkedFieldJobId: t.linkedFieldJobId || null,
    linkedLeadId: t.linkedLeadId || null,
    contactId: t.contactId || null,
    recordType: t.recordType || null,
    estimateStatus: t.estimateStatus || null,
    convertedTicketId: t.convertedTicketId || null,
    convertedFromEstimateId: t.convertedFromEstimateId || null,
    // Billing lineage (see rowToTicket) — the Proforma / final Invoice tied to
    // this record's commercial history.
    proformaId: t.proformaId || null,
    invoiceId: t.invoiceId || null,
    // Warranty case metadata (see rowToTicket).
    parentTicketId: t.parentTicketId || null,
    parentTicketNo: t.parentTicketNo || null,
    warrantyDeviceIds: t.warrantyDeviceIds ?? null,
    warrantyIssue: t.warrantyIssue || null,
    warrantyStatus: t.warrantyStatus || null,
    sourceInvoiceId: t.sourceInvoiceId || null,
    createdFromTicketId: t.createdFromTicketId || null,
    createdFromReason: t.createdFromReason || null,
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
    contact_id: t.contactId || null,
    customer_id: t.customerId || null,
    pinned_at: t.pinnedAt ?? null,
    devices: ticketDevicesEnvelope(t),
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
    branchId: r.branch_id ?? null,
    reference: r.reference ?? "",
    invoiceType: r.invoice_type ?? "retail",
    customer: r.customer ?? "",
    contactId: r.contact_id ?? meta.contactId ?? undefined,
    customerId: r.customer_id ?? undefined,
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
    // Document-type + lineage — packed in the same JSONB `devices` envelope so
    // no DB migration is needed. Absent → legacy row → normal "invoice".
    documentType: meta.documentType ?? undefined,
    proformaStatus: meta.proformaStatus ?? undefined,
    sourceProformaId: meta.sourceProformaId ?? undefined,
    sourceEstimateId: meta.sourceEstimateId ?? undefined,
    sourceTicketId: meta.sourceTicketId ?? undefined,
    convertedInvoiceId: meta.convertedInvoiceId ?? undefined,
    // Reverse warranty lineage (see Invoice.warrantyClaimIds).
    warrantyClaimIds: meta.warrantyClaimIds ?? undefined,
  };
}

/**
 * SYS-1 — the broadly-readable invoices JSON (items / devices.records) must NOT
 * carry the internal `cost` / `costState` snapshot, because the invoices SELECT
 * policy admits roles without any cost key. These strippers remove the two
 * sensitive props from every line before persistence; `kind` (part/service,
 * non-sensitive) is retained so the costing engine can still bucket. The
 * resolved cost snapshot is persisted separately to the cost-scoped
 * `invoice_line_costs` table (see persistInvoiceLineCosts). Historical
 * immutability is unchanged — only WHERE the snapshot lives moved.
 */
function stripLineCost<T extends { cost?: number; costState?: unknown }>(line: T): Omit<T, "cost" | "costState"> {
  const { cost: _cost, costState: _costState, ...rest } = line;
  void _cost; void _costState;
  return rest;
}

function stripDeviceCosts(devices: any[]): any[] {
  return (devices ?? []).map((d) => ({
    ...d,
    parts: Array.isArray(d?.parts) ? d.parts.map((p: any) => stripLineCost(p)) : d?.parts,
  }));
}

/**
 * SYS-1 — carry the in-memory cost snapshot from an existing invoice onto a
 * freshly-mapped one (whose JSON no longer carries cost), matching lines by id.
 * Used on a realtime echo so a cost-capable viewer keeps the cost figures that
 * were merged at load/save without a DB round-trip.
 */
function carryInvoiceLineCosts(fromInv: Invoice, toInv: Invoice): Invoice {
  const costById = new Map<string, { cost?: number; costState?: InvoiceLineItem["costState"] }>();
  const collect = (lines?: InvoiceLineItem[]) => {
    for (const l of lines ?? []) {
      if (l.cost !== undefined || l.costState !== undefined) costById.set(l.id, { cost: l.cost, costState: l.costState });
    }
  };
  collect(fromInv.items);
  for (const d of fromInv.devices ?? []) collect(d.parts);
  if (costById.size === 0) return toInv;
  const apply = (l: InvoiceLineItem): InvoiceLineItem => {
    const hit = costById.get(l.id);
    return hit ? { ...l, cost: hit.cost, costState: hit.costState } : l;
  };
  return {
    ...toInv,
    items: (toInv.items ?? []).map(apply),
    devices: (toInv.devices ?? []).map((d) => ({ ...d, parts: (d.parts ?? []).map(apply) })),
  };
}

function invoiceToRow(inv: Invoice): Record<string, unknown> {
  return {
    id: inv.id,
    reference: inv.reference || null,
    invoice_type: inv.invoiceType ?? "retail",
    customer: inv.customer || null,
    contact_id: inv.contactId || null,
    customer_id: inv.customerId || null,
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
    // Cost snapshot stripped from the broadly-readable JSON (SYS-1).
    items: (inv.items ?? []).map((it) => stripLineCost(it)),
    devices: {
      records: stripDeviceCosts(inv.devices ?? []),
      repairStatus: inv.repairStatus ?? null,
      paymentMode: inv.paymentMode || null,
      serviceCategory: inv.serviceCategory || "service",
      gstRate: inv.gstRate ?? null,
      sgstRate: inv.sgstRate ?? null,
      cgstRate: inv.cgstRate ?? null,
      sgst: inv.sgst ?? null,
      cgst: inv.cgst ?? null,
      gstNumber: inv.gstNumber || null,
      // Document-type + lineage envelope (see rowToInvoice). Null defaults keep
      // legacy/normal invoices unchanged.
      documentType: inv.documentType ?? null,
      proformaStatus: inv.proformaStatus ?? null,
      sourceProformaId: inv.sourceProformaId ?? null,
      sourceEstimateId: inv.sourceEstimateId ?? null,
      sourceTicketId: inv.sourceTicketId ?? null,
      convertedInvoiceId: inv.convertedInvoiceId ?? null,
      contactId: inv.contactId ?? null,
      // Reverse warranty lineage (see rowToInvoice).
      warrantyClaimIds: inv.warrantyClaimIds ?? null,
    },
  };
}

/* ─── Refund / Return mappers (DB row ↔ camelCase app model) ─────────── */

function rowToInvoiceRefund(r: any): InvoiceRefund {
  return {
    id: r.id,
    branchId: r.branch_id ?? null,
    refundNo: r.refund_no ?? undefined,
    invoiceId: r.invoice_id,
    invoiceReference: r.invoice_reference ?? undefined,
    customerId: r.customer_id ?? undefined,
    customerName: r.customer_name ?? undefined,
    ticketId: r.ticket_id ?? undefined,
    scope: (r.scope ?? "invoice") as InvoiceRefund["scope"],
    refundKind: (r.refund_kind ?? "partial") as InvoiceRefund["refundKind"],
    refundNet: Number(r.refund_net ?? 0),
    refundTax: Number(r.refund_tax ?? 0),
    refundDiscount: Number(r.refund_discount ?? 0),
    refundAmount: Number(r.refund_amount ?? 0),
    reasonCode: r.reason_code ?? "",
    reasonComment: r.reason_comment ?? undefined,
    method: r.method ?? "cash",
    reference: r.reference ?? undefined,
    customerNote: r.customer_note ?? undefined,
    internalRemark: r.internal_remark ?? undefined,
    status: (r.status ?? "succeeded") as InvoiceRefund["status"],
    initiatedBy: r.initiated_by ?? undefined,
    initiatedByName: r.initiated_by_name ?? undefined,
    initiatedAt: r.initiated_at ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    approvedByName: r.approved_by_name ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    processedBy: r.processed_by ?? undefined,
    processedByName: r.processed_by_name ?? undefined,
    processedAt: r.processed_at ?? undefined,
    reversedBy: r.reversed_by ?? undefined,
    reversedAt: r.reversed_at ?? undefined,
    reversalReason: r.reversal_reason ?? undefined,
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  };
}

function invoiceRefundToRow(x: InvoiceRefund): Record<string, unknown> {
  return {
    id: x.id,
    branch_id: x.branchId ?? null,
    invoice_id: x.invoiceId,
    invoice_reference: x.invoiceReference ?? null,
    customer_id: x.customerId ?? null,
    customer_name: x.customerName ?? null,
    ticket_id: x.ticketId ?? null,
    scope: x.scope,
    refund_kind: x.refundKind,
    refund_net: x.refundNet ?? 0,
    refund_tax: x.refundTax ?? 0,
    refund_discount: x.refundDiscount ?? 0,
    refund_amount: x.refundAmount ?? 0,
    reason_code: x.reasonCode,
    reason_comment: x.reasonComment ?? null,
    method: x.method,
    reference: x.reference ?? null,
    customer_note: x.customerNote ?? null,
    internal_remark: x.internalRemark ?? null,
    status: x.status,
  };
}

function rowToRefundAllocation(r: any): InvoiceRefundAllocation {
  return {
    id: r.id,
    refundId: r.refund_id,
    invoiceId: r.invoice_id,
    deviceId: r.device_id ?? undefined,
    ticketDeviceId: r.ticket_device_id ?? undefined,
    lineId: r.line_id ?? undefined,
    lineComponent: (r.line_component ?? "line") as InvoiceRefundAllocation["lineComponent"],
    sku: r.sku ?? undefined,
    qty: Number(r.qty ?? 0),
    allocNet: Number(r.alloc_net ?? 0),
    allocTax: Number(r.alloc_tax ?? 0),
    allocAmount: Number(r.alloc_amount ?? 0),
    createdAt: r.created_at ?? undefined,
  };
}

function refundAllocationToRow(a: InvoiceRefundAllocation): Record<string, unknown> {
  return {
    refund_id: a.refundId,
    invoice_id: a.invoiceId,
    device_id: a.deviceId ?? null,
    ticket_device_id: a.ticketDeviceId ?? null,
    line_id: a.lineId ?? null,
    line_component: a.lineComponent,
    sku: a.sku ?? null,
    qty: a.qty ?? 0,
    alloc_net: a.allocNet ?? 0,
    alloc_tax: a.allocTax ?? 0,
    alloc_amount: a.allocAmount ?? 0,
  };
}

function rowToItemReturn(r: any): InvoiceItemReturn {
  return {
    id: r.id,
    branchId: r.branch_id ?? null,
    returnNo: r.return_no ?? undefined,
    invoiceId: r.invoice_id,
    deviceId: r.device_id ?? undefined,
    lineId: r.line_id ?? undefined,
    sku: r.sku ?? undefined,
    itemName: r.item_name ?? undefined,
    refundId: r.refund_id ?? undefined,
    returned: r.returned ?? true,
    returnQty: Number(r.return_qty ?? 0),
    condition: (r.condition ?? "uninspected") as InvoiceItemReturn["condition"],
    disposition: (r.disposition ?? "inspection_required") as InvoiceItemReturn["disposition"],
    dispositionStatus: (r.disposition_status ?? "pending") as InvoiceItemReturn["dispositionStatus"],
    stockMovementRef: r.stock_movement_ref ?? undefined,
    unitCost: r.unit_cost != null ? Number(r.unit_cost) : undefined,
    receivingStore: r.receiving_store ?? undefined,
    inspectionNotes: r.inspection_notes ?? undefined,
    receivedBy: r.received_by ?? undefined,
    receivedByName: r.received_by_name ?? undefined,
    receivedAt: r.received_at ?? undefined,
    restockedBy: r.restocked_by ?? undefined,
    restockedAt: r.restocked_at ?? undefined,
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  };
}

function itemReturnToRow(x: InvoiceItemReturn): Record<string, unknown> {
  return {
    id: x.id,
    branch_id: x.branchId ?? null,
    invoice_id: x.invoiceId,
    device_id: x.deviceId ?? null,
    line_id: x.lineId ?? null,
    sku: x.sku ?? null,
    item_name: x.itemName ?? null,
    refund_id: x.refundId ?? null,
    returned: x.returned,
    return_qty: x.returnQty ?? 0,
    condition: x.condition,
    disposition: x.disposition,
    disposition_status: x.dispositionStatus,
    unit_cost: x.unitCost ?? null,
    receiving_store: x.receivingStore ?? null,
    inspection_notes: x.inspectionNotes ?? null,
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
async function nextInvoiceIdFromDb(type: string, storeId?: string | null, storePrefix?: string | null, documentType?: string | null): Promise<string> {
  // Series numbering config lives in Settings → Invoice (organization_settings).
  // Fall back to the legacy INV/INVG · 3-digit defaults when unavailable so the
  // collision-recovery path always produces a valid id.
  const isProformaDoc = documentType === "proforma";
  let prefix = type === "business" ? "INVG" : "INV";
  let digits = 3;
  let startNumber = 1;
  let maxNum = 0;
  // Optional per-store alphabetic prefix (branch_settings.invoice_prefix), e.g.
  // "KOR" → KOR-INV001. Keeps each store's series visually distinct while the
  // numeric sequence stays per-store (query is scoped by branch_id below).
  const sp = ticketPrefixSep(storePrefix); // "KOR-" or null
  if (supabase) {
    try {
      const { data: settingsRows } = await supabase
        .from("organization_settings")
        .select("invoice_numbering")
        .limit(1);
      const raw = settingsRows?.[0]?.invoice_numbering as unknown;
      const numbering = raw
        ? (typeof raw === "string" ? JSON.parse(raw) : raw)
        : null;
      const series = numbering?.[type === "business" ? "business" : "retail"];
      if (series) {
        if (series.prefix?.trim()) prefix = series.prefix.trim();
        if (series.digits > 0) digits = series.digits;
        if (series.startNumber > 0) startNumber = series.startNumber;
      }
    } catch {
      /* keep legacy defaults */
    }
    // PROFORMA series: a Proforma gets its OWN independent numbering sequence so
    // it never consumes a normal Invoice number. We mark the series prefix with
    // a leading "P-" (→ "P-INV" / "KR-P-INV002"). seriesNumberOf/takenIds below
    // then naturally isolate it from the normal invoice series (a normal "INV002"
    // never matches the "P-INV" head and vice-versa).
    if (isProformaDoc) {
      prefix = `P-${prefix}`;
      startNumber = 1; // proforma series always starts fresh at its own P-INV001
    }

    // STORE-AWARE: scope the running max to the active store so each store's
    // invoice series is independent and never collides across stores.
    // We read TWO things:
    //   1. VISIBLE (non-deleted) ids → to compute the running sequence max.
    //   2. ALL ids (incl. soft-deleted) → the set of primary keys already
    //      physically taken. A soft-deleted row still occupies its pkey, so the
    //      next id must SKIP over any taken key or the insert dies with a
    //      duplicate-key (23505) error in an infinite retry loop.
    const scoped = (q: any) => (storeId ? q.eq("branch_id", storeId) : q);
    const [{ data: visibleData }, { data: allData }] = await Promise.all([
      scoped(supabase.from("invoices").select("id").eq("invoice_type", type).is("deleted_at", null)),
      scoped(supabase.from("invoices").select("id").eq("invoice_type", type)),
    ]);
    // Only count ids that match THIS series' canonical shape:
    //   [storePrefix]<prefix><digits>   e.g. "INV054", "KOR-INV054".
    // Off-series / malformed ids (e.g. a duplicated invoice with a random suffix
    // "INV-5483") never contribute to the running max.
    maxNum = (visibleData ?? []).reduce((max: number, r: { id: string }) => {
      const num = seriesNumberOf(String(r.id), sp, prefix);
      return num != null ? Math.max(max, num) : max;
    }, 0);
    // Every primary key already in the table (deleted or not) — the id we hand
    // back must not be one of these.
    const takenIds = new Set((allData ?? []).map((r: { id: string }) => String(r.id)));
    let next = maxNum === 0 ? startNumber : maxNum + 1;
    // Advance to the first number whose id is genuinely free (guard bounded).
    for (let guard = 0; guard < 100000; guard += 1) {
      const candidate = `${sp ?? ""}${prefix}${String(next).padStart(digits, "0")}`;
      if (!takenIds.has(candidate)) return candidate;
      next += 1;
    }
    return `${sp ?? ""}${prefix}${String(next).padStart(digits, "0")}`;
  }
  // No backend: honour the configured start number for a fresh series.
  return `${sp ?? ""}${prefix}${String(maxNum === 0 ? startNumber : maxNum + 1).padStart(digits, "0")}`;
}

/**
 * Parse the sequence number out of an invoice id IF it matches this series'
 * canonical shape `[storePrefix]<prefix><digits>` (e.g. "INV054" or
 * "KOR-INV054"). Returns null for ids that don't match — so off-series or
 * malformed ids (e.g. a duplicated invoice with a random suffix "INV-5483")
 * are ignored when computing the next number and can't corrupt the sequence.
 */
function seriesNumberOf(id: string, storeSep: string | null, prefix: string): number | null {
  const head = `${storeSep ?? ""}${prefix}`;
  if (!id.startsWith(head)) return null;
  const rest = id.slice(head.length);
  // The remainder must be ONLY digits (no separators, no extra text).
  if (!/^\d+$/.test(rest)) return null;
  return parseInt(rest, 10);
}

/** Format a sequence number as `T-001` (zero-padded to at least 3 digits,
 *  growing automatically past T-999). The `letter` selects the series:
 *  "T" for Tickets, "E" for Repair Estimates — so `KOR-E-0045` and `KOR-T-0045`
 *  are independent runs that never consume each other's numbers. */
function formatTicketNo(n: number, prefix?: string | null, letter: string = "T"): string {
  const p = prefix ? `${prefix}` : "";
  return `${p}${letter}-${String(n).padStart(3, "0")}`;
}

/** Normalize a store prefix ("KOR", "KOR-", " kor ") into the canonical
 *  uppercase, dash-terminated form used inside ticket/invoice numbers
 *  ("KOR-"), or null when there is no prefix. e.g. KOR → "KOR-" → KOR-T-0001. */
function ticketPrefixSep(prefix?: string | null): string | null {
  const raw = (prefix ?? "").trim().toUpperCase().replace(/-+$/, "");
  return raw ? `${raw}-` : null;
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

/** Extract the numeric part of a `<letter>-<digits>` value, or 0 if it doesn't
 *  match. The `letter` ("T"/"E") keeps the Ticket and Estimate series
 *  independent: an `E-0045` value scores 0 against the "T" series and vice
 *  versa, so counting max+1 per series never collides across record types. */
function ticketSeq(value: string | null | undefined, prefix?: string | null, letter: string = "T"): number {
  const v = String(value ?? "");
  // Support an optional store prefix (e.g. "BLR-T-0007"). When a prefix is
  // supplied, only count numbers that carry it so per-store sequences don't
  // interfere with each other.
  const p = prefix ? prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const re = new RegExp(`^${p}${letter}-(\\d+)$`);
  const match = v.match(re);
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
export async function nextTicketIdFromDb(storeId?: string | null, prefix?: string | null, letter: string = "T"): Promise<string> {
  let maxNum = 0;
  if (supabase) {
    // STORE-AWARE numbering: when a concrete store is active, the sequence is
    // scoped to that store's branch so each store keeps its own independent
    // T-001, T-002 … run and numbers never collide across stores. In All-Shops
    // mode (no storeId) it falls back to the full visible set for continuity.
    //
    // SERIES-AWARE numbering: Tickets ("T") and Estimates ("E") share the same
    // table + ticket_no column, but ticketSeq(letter) only scores values in the
    // requested series (a "KOR-E-0045" scores 0 for "T" and vice-versa). So the
    // max+1 is computed PER SERIES — creating an Estimate never consumes a
    // Ticket number and creating a Ticket never consumes an Estimate number.
    let q = supabase.from("tickets").select("ticket_no").is("deleted_at", null);
    if (storeId) q = q.eq("branch_id", storeId);
    const { data } = await q;
    maxNum = (data ?? []).reduce((max: number, r: { ticket_no?: string }) => {
      return Math.max(max, ticketSeq(r.ticket_no, prefix, letter));
    }, 0);
  }
  return formatTicketNo(maxNum + 1, prefix, letter);
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
async function resequenceTicketNumbers(storeId?: string | null, prefix?: string | null, letter: string = "T"): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};
  if (!supabase) return mapping;
  // STORE-AWARE: only resequence WITHIN the active store so each store keeps an
  // independent, gap-free T-001…T-N run ordered by creation. In All-Shops mode
  // (no storeId) we skip resequencing entirely — renumbering across stores
  // would scramble every store's per-store sequence. The per-store run happens
  // whenever the owner (or a store user) enters that specific store.
  if (!storeId) return mapping;
  // SERIES-AWARE: read `devices` so we can resolve each row's recordType and
  // renumber ONLY the rows in the requested series ("T" → Tickets, "E" →
  // Estimates). Renumbering all rows into one series would clobber the other
  // series' numbers and merge two independent sequences.
  const wantRecordType = letter === "E" ? "estimate" : letter === "W" ? "warranty" : "ticket";
  const { data, error } = await supabase
    .from("tickets")
    .select("id, ticket_no, created_at, devices")
    .is("deleted_at", null)
    .eq("branch_id", storeId)
    .order("created_at", { ascending: true });
  if (error || !data) return mapping;

  const rowRecordType = (r: { devices?: any }): "ticket" | "estimate" | "warranty" => {
    const d = r.devices;
    if (d && !Array.isArray(d) && typeof d === "object" && d.recordType) return d.recordType;
    return "ticket";
  };
  const seriesRows = (data as { id: string; ticket_no?: string; created_at?: string; devices?: any }[])
    .filter((r) => rowRecordType(r) === wantRecordType);

  const updates: { id: string; ticket_no: string }[] = [];
  seriesRows.forEach((row, idx) => {
    const desired = formatTicketNo(idx + 1, prefix, letter);
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

/* ── Walk-In metadata envelope ──────────────────────────────────────────────
   The production `walk_ins` table stores the core spreadsheet fields in real
   columns (walkin_date, customer, phone, source, category, model, status,
   ticket_id, notes …). Newer business fields — walkInNumber, type, issue,
   salesPerson, customerId, modelId, pinnedAt — are round-tripped inside a
   compact JSON envelope embedded in the `notes` column. This means the module
   works against the CURRENT database with no migration required, while keeping
   historical rows and human-readable notes intact. The optional migration
   `supabase/migration-walk-in-fields.sql` promotes these to first-class
   columns; rowToWalkIn transparently prefers real columns when present.       */
const WALKIN_META_MARKER = "\n\u241F::walkin-meta::";

type WalkInMeta = Partial<
  Pick<WalkIn, "walkInNumber" | "type" | "issue" | "email" | "altPhone" | "salesPersonId" | "salesPersonName" | "contactId" | "customerId" | "modelId" | "pinnedAt"
    | "convertedAt" | "followUpDate" | "followUpTime" | "followUpStatus" | "followUpReadAt" | "linkedLeadId"
    | "customerComments" | "followUpAttempt" | "followUpComments" | "followUpHistory" | "devices">
>;

function encodeWalkInNotes(w: WalkIn): string | null {
  const meta: WalkInMeta = {};
  if (w.walkInNumber) meta.walkInNumber = w.walkInNumber;
  if (w.type) meta.type = w.type;
  if (w.issue) meta.issue = w.issue;
  if (w.email) meta.email = w.email;
  if (w.altPhone) meta.altPhone = w.altPhone;
  if (w.salesPersonId) meta.salesPersonId = w.salesPersonId;
  if (w.salesPersonName) meta.salesPersonName = w.salesPersonName;
  if (w.contactId) meta.contactId = w.contactId;
  if (w.customerId) meta.customerId = w.customerId;
  if (w.linkedLeadId) meta.linkedLeadId = w.linkedLeadId;
  if (w.modelId) meta.modelId = w.modelId;
  if (w.pinnedAt) meta.pinnedAt = w.pinnedAt;
  if (w.convertedAt) meta.convertedAt = w.convertedAt;
  if (w.followUpDate) meta.followUpDate = w.followUpDate;
  if (w.followUpTime) meta.followUpTime = w.followUpTime;
  if (w.followUpStatus) meta.followUpStatus = w.followUpStatus;
  if (w.followUpReadAt) meta.followUpReadAt = w.followUpReadAt;
  if (w.customerComments) meta.customerComments = w.customerComments;
  if (w.followUpAttempt) meta.followUpAttempt = w.followUpAttempt;
  if (w.followUpComments) meta.followUpComments = w.followUpComments;
  if (w.followUpHistory && w.followUpHistory.length) meta.followUpHistory = w.followUpHistory;
  // Multi-device: persist the full device array in the meta envelope so no DB
  // migration is required (mirrors how Tickets store devices as JSON). The flat
  // `model`/`issue` columns keep the primary device for search/backward-compat.
  if (w.devices && w.devices.length) meta.devices = w.devices;
  const human = (w.notes || "").split(WALKIN_META_MARKER)[0].trimEnd();
  if (Object.keys(meta).length === 0) return human || null;
  return `${human}${WALKIN_META_MARKER}${JSON.stringify(meta)}`;
}

function decodeWalkInNotes(raw: string | null | undefined): { notes: string; meta: WalkInMeta } {
  if (!raw) return { notes: "", meta: {} };
  const idx = raw.indexOf(WALKIN_META_MARKER);
  if (idx === -1) return { notes: raw, meta: {} };
  const notes = raw.slice(0, idx).trimEnd();
  try {
    const meta = JSON.parse(raw.slice(idx + WALKIN_META_MARKER.length)) as WalkInMeta;
    return { notes, meta: meta || {} };
  } catch {
    return { notes, meta: {} };
  }
}

function rowToWalkIn(r: any): WalkIn {
  const { notes, meta } = decodeWalkInNotes(r.notes);
  const linkedTicketId = r.ticket_id ?? undefined;
  return {
    id: r.id,
    branchId: r.branch_id ?? null,
    // Prefer a real column when the migration has been applied, else the envelope.
    walkInNumber: r.walkin_number ?? meta.walkInNumber ?? undefined,
    date: r.walkin_date ?? "",
    time: r.time_label ?? "",
    type: (r.walkin_type ?? meta.type) as WalkIn["type"],
    customer: r.customer ?? "",
    phone: r.phone ?? "",
    altPhone: meta.altPhone ?? undefined,
    email: r.email_addr ?? meta.email ?? undefined,
    source: r.source ?? "",
    category: r.category ?? "",
    model: r.model ?? "",
    modelId: r.model_id ?? meta.modelId ?? undefined,
    issue: r.issue ?? meta.issue ?? "",
    // Multi-device array (from the meta envelope). Undefined for legacy rows —
    // getWalkInDevices() then synthesizes Device 1 from the flat fields.
    devices: meta.devices ?? undefined,
    reasons: r.reasons ?? [],
    status: r.status ?? "visitor",
    salesPersonId: r.sales_person_id ?? meta.salesPersonId ?? undefined,
    salesPersonName: r.sales_person_name ?? meta.salesPersonName ?? undefined,
    contactId: r.contact_id ?? meta.contactId ?? undefined,
    customerId: r.customer_id ?? meta.customerId ?? undefined,
    linkedLeadId: r.linked_lead_id ?? meta.linkedLeadId ?? undefined,
    linkedTicketId,
    ticketId: linkedTicketId,
    convertedAt: r.converted_at ?? meta.convertedAt ?? undefined,
    followUpDate: r.follow_up_date ?? meta.followUpDate ?? undefined,
    followUpTime: r.follow_up_time ?? meta.followUpTime ?? undefined,
    followUpStatus: (r.follow_up_status ?? meta.followUpStatus) as WalkIn["followUpStatus"],
    followUpReadAt: r.follow_up_read_at ?? meta.followUpReadAt ?? undefined,
    customerComments: r.customer_comments ?? meta.customerComments ?? undefined,
    followUpAttempt: r.follow_up_attempt ?? meta.followUpAttempt ?? undefined,
    followUpComments: meta.followUpComments ?? undefined,
    followUpHistory: meta.followUpHistory ?? undefined,
    invoiceValue: Number(r.invoice_value ?? 0),
    businessValue: Number(r.business_value ?? 0),
    notes,
    pinnedAt: r.pinned_at ?? meta.pinnedAt ?? undefined,
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
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
    contact_id: w.contactId || null,
    customer_id: w.customerId || null,
    ticket_id: w.linkedTicketId || w.ticketId || null,
    invoice_value: w.invoiceValue ?? 0,
    business_value: w.businessValue ?? 0,
    notes: encodeWalkInNotes(w),
  };
}

function rowToInventoryItem(r: any): InventoryItem {
  // Item Type source of truth = item_kind, with a legacy fallback so pre-0075
  // rows (and any read before the backfill runs) still classify (inv-design §1.1).
  const kind: ItemKind = (r.item_kind as ItemKind) ?? (String(r.item_type) === "Service" ? "service" : "part");
  return {
    id: r.id,
    kind,
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
    // ── Redesign additions (inv-design §2.1). Cost fields are populated by a
    //    SEPARATE inventory_item_costs read (mergeInventoryCosts) that only
    //    succeeds for a cost-capable user; here they default to not-configured.
    itemCode: r.item_code ?? "",
    serviceCode: r.service_code ?? "",
    barcode: r.barcode ?? "",
    brandModel: r.brand_model ?? "",
    vendor: r.vendor ?? "",
    description: r.description ?? "",
    sellingPrice: Number(r.selling_price ?? r.regular_selling_price ?? 0),
    serviceCharge: Number(r.service_charge ?? 0),
    trackStock: r.track_stock ?? (kind === "part"),
    migrationFlag: r.migration_flag ?? undefined,
    costState: "not_configured",
  };
}

function inventoryItemToRow(item: InventoryItem): Record<string, unknown> {
  // Resolve the canonical kind (with legacy fallback) and keep the legacy
  // item_type/mode columns in sync so existing readers keep working (§1.1).
  const kind: ItemKind = item.kind ?? (item.type === "Service" ? "service" : "part");
  const row: Record<string, unknown> = {
    id: item.id,
    item_kind: kind,
    name: item.name,
    category: item.category || null,
    item_type: kind === "service" ? "Service" : "Product",
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
    // New public columns (NEVER cost_price / standard_labour_cost — those live
    // on the cost-scoped inventory_item_costs table, §2.1a/§1.1).
    selling_price: item.sellingPrice ?? item.regularSellingPrice,
    service_charge: item.serviceCharge ?? 0,
    track_stock: item.trackStock ?? (kind === "part"),
    barcode: item.barcode || null,
    brand_model: item.brandModel || null,
    vendor: item.vendor || null,
    description: item.description || null,
  };
  // item_code / service_code are server-stamped and immutable — written only
  // when the caller already carries one (never fabricated here).
  if (item.itemCode) row.item_code = item.itemCode;
  if (item.serviceCode) row.service_code = item.serviceCode;
  if (item.migrationFlag !== undefined) row.migration_flag = item.migrationFlag;
  return row;
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
    source: r.source ?? undefined,
    captureSource: r.capture_source ?? undefined,
    groupIds: Array.isArray(r.group_ids) ? r.group_ids : [],
    companyId: r.company_id ?? undefined,
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    fullName: r.full_name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    mobile: r.mobile ?? "",
    altMobile: r.alt_mobile ?? "",
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
    source: c.source || null,
    capture_source: c.captureSource || null,
    group_ids: c.groupIds ?? [],
    company_id: c.companyId || null,
    first_name: c.firstName || null,
    last_name: c.lastName || null,
    full_name: c.fullName || null,
    mobile: c.mobile || null,
    alt_mobile: c.altMobile || null,
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

function rowToCustomerGroup(r: any): CustomerGroup {
  return {
    id: r.id,
    name: r.name ?? "",
    description: r.description ?? "",
    color: r.color ?? "slate",
    displayOrder: Number(r.display_order ?? 0),
    active: r.active ?? true,
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

function customerGroupToRow(g: CustomerGroup): Record<string, unknown> {
  return {
    id: g.id,
    name: g.name || null,
    description: g.description || null,
    color: g.color || null,
    display_order: g.displayOrder ?? 0,
    active: g.active,
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
  return {
    id: r.id,
    name: r.name ?? "",
    categoryId: r.category_id ?? undefined,
    archived: r.archived ?? false,
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

function rowToDeviceModel(r: any): DeviceModel {
  return {
    id: r.id,
    brandId: r.brand_id ?? "",
    categoryId: r.category_id ?? undefined,
    name: r.name ?? "",
    archived: r.archived ?? false,
    createdAt: r.created_at ?? new Date().toISOString(),
  };
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
      invoiceRefunds: saved.invoiceRefunds ?? [],
      invoiceRefundAllocations: saved.invoiceRefundAllocations ?? [],
      invoiceItemReturns: saved.invoiceItemReturns ?? [],
      walkIns: saved.walkIns ?? SEED_WALKINS,
      inventory: (saved.inventory ?? SEED_INVENTORY).map((i: any) => ({ ...i, reservedStock: i.reservedStock ?? 0 })),
      stockMovements: saved.stockMovements ?? SEED_MOVEMENTS,
      inventoryStockLayers: saved.inventoryStockLayers ?? [],
      customers: saved.customers ?? SEED_CUSTOMERS,
      customerGroups: saved.customerGroups ?? [],
      companies: saved.companies ?? SEED_COMPANIES,
      ...(() => {
        // Migrate any legacy category-less brands stored locally into strict
        // per-category records (idempotent). Falls back to seeds when absent.
        const b0: Brand[] = saved.brands ?? SEED_BRANDS;
        const m0: DeviceModel[] = saved.deviceModels ?? SEED_MODELS;
        const res = migrateLegacyBrands(b0, m0, DEFAULT_CATEGORY_IDS);
        return { brands: res.brands, deviceModels: res.models };
      })(),
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

/* ─── Shared Issue Master persistence ──────────────────────────────────────
   The Issue Master (issueLibrary) is a single client-side list shared by the
   Ticket AND Walk-In forms. There is no dedicated DB table for it, so — in EVERY
   mode, including the Supabase-backed one — it is durably persisted to this one
   standalone localStorage key. This guarantees an issue added from the Walk-In
   form (or the Ticket form) survives reloads and is immediately available in the
   other module, using the same master. */
const ISSUE_LIBRARY_KEY = "repairox-issue-library";

/** Read the persisted shared Issue Master, or null when absent/unreadable. */
function loadIssueLibrary(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ISSUE_LIBRARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : null;
  } catch { return null; }
}

/** Persist the shared Issue Master so it survives reloads in all modes. */
function saveIssueLibrary(list: string[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(ISSUE_LIBRARY_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  const { isDemoMode, authReady, demoResetCounter } = usePermissions();
  // Active-store (multi-store) context. When a concrete store is selected, DB
  // reads are filtered to that store's branch_id and new records are stamped
  // with it. When `activeStoreId` is null (All Shops), reads fall back to the
  // full RLS-scoped set (every store the user may access) for consolidated
  // reporting. `storeReady` gates the initial load until the selection is known
  // so we never briefly show another store's data.
  const { activeStoreId, ready: storeReady, activePrefixes } = useStoreContext();
  const resolvedKey = isDemoMode ? demoKey(STORAGE_KEY) : STORAGE_KEY;

  // Latest active store id for use inside callbacks (insert stamping) without
  // adding it to every callback's dependency list.
  const activeStoreIdRef = useRef<string | null>(activeStoreId);
  useEffect(() => { activeStoreIdRef.current = activeStoreId; }, [activeStoreId]);

  // Latest active-store document prefixes (KOR-T-0001 etc.) for numbering.
  const activePrefixesRef = useRef(activePrefixes);
  useEffect(() => { activePrefixesRef.current = activePrefixes; }, [activePrefixes]);

  const [state, setState] = useState<StoreState>({
    tickets: [], invoices: [], invoiceRefunds: [], invoiceRefundAllocations: [], invoiceItemReturns: [],
    walkIns: [], orders: [], revenue: [],
    team: [], inventory: [], stockMovements: [], inventoryStockLayers: [], customers: [], customerGroups: [],
    loyaltyByCustomer: {},
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
  // In-flight loyalty-award operations, keyed by invoice id. Guards against a
  // rapid double-save around the same "→ paid" transition trying to award
  // points twice before the first award's DB round-trip finishes (the DB
  // unique index is the hard backstop; this ref avoids the extra network
  // round-trip in the common case).
  const awardingLoyaltyRef = useRef<Set<string>>(new Set());

  // In-flight Proforma → Invoice conversions. Guards against double-click /
  // rapid re-entry within THIS session while the async create is running (the
  // durable duplicate protection is the proforma's convertedInvoiceId, checked
  // against the latest state below).
  const convertingProformaRef = useRef<Set<string>>(new Set());

  // Ref for demo mode so callbacks can access the latest value
  const isDemoRef = useRef(isDemoMode);
  useEffect(() => { isDemoRef.current = isDemoMode; }, [isDemoMode]);

  /** True when we should write to the database (Supabase configured AND not in demo mode). */
  const shouldUseDb = useCallback(() => isSupabaseConfigured && !!supabase && !isDemoRef.current, []);
  /** Non-null supabase client — only call after shouldUseDb() returns true. */
  const db = supabase!;

  /** Read the admin-configured loyalty tier point structure
   *  (organization_settings.loyalty_config.tiers) live from the DB, falling
   *  back to the built-in default thresholds. Keeps tier assignment in
   *  awardLoyalty / adjustLoyalty / merge consistent with Settings → Loyalty. */
  const readLoyaltyThresholds = useCallback(async () => {
    if (!shouldUseDb()) return thresholdsFromTiers(null);
    try {
      const { data: rows } = await db.from("organization_settings").select("loyalty_config").limit(1);
      const raw = rows?.[0]?.loyalty_config as unknown;
      const cfg = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
      if (cfg && typeof cfg === "object" && Array.isArray((cfg as any).tiers)) {
        return thresholdsFromTiers((cfg as any).tiers);
      }
    } catch {
      /* fall back to defaults */
    }
    return thresholdsFromTiers(null);
  }, [shouldUseDb, db]);

  /**
   * Stamp the CURRENT active store onto an outgoing insert row for a
   * store-scoped entity (ticket, invoice, walk-in, inventory item, stock
   * movement). This is what makes "the current store context is the source of
   * truth" real: an employee never picks a store — the record inherits the
   * store they are operating in.
   *
   *   • A concrete store is active  → stamp that store's branch_id.
   *   • All-Shops mode (owner)      → leave branch_id unset so the DB default
   *     (auth_branch_id() = the user's home branch) applies. Transactional
   *     creation should happen inside a specific store; the header nudges the
   *     owner to pick one, and this fallback keeps a valid, non-null branch.
   *
   * Never overrides an explicit branch_id already present on the row.
   */
  const withStore = useCallback((row: Record<string, unknown>): Record<string, unknown> => {
    if ("branch_id" in row && row.branch_id != null) return row;
    const sid = activeStoreIdRef.current;
    if (sid) return { ...row, branch_id: sid };
    return row;
  }, []);

  const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;

  /* ── DB Load + Realtime Subscriptions ── */
  useEffect(() => {
    // Wait until we know who the user is before deciding data source.
    if (!authReady) return;
    // In DB mode, also wait until the active-store selection is resolved so the
    // very first load is already scoped to the right store (no flash of another
    // store's data, no double fetch).
    if (isSupabaseConfigured && supabase && !isDemoMode && !storeReady) return;

    // The store to scope this load to. null = All Shops (RLS-scoped superset).
    const scopeStoreId = activeStoreId;
    // Apply a store filter to a Supabase query builder when a concrete store is
    // selected. Store-specific transactional rows always carry a branch_id;
    // org-wide shared master data (branch_id NULL) is intentionally left out of
    // the per-store filter for tables where it would exclude shared catalog.
    const scopeToStore = (q: any) =>
      scopeStoreId ? q.eq("branch_id", scopeStoreId) : q;
    // For catalog/master tables that are org-wide shared (branch_id NULL) we
    // must NOT filter by store, or the shared catalog would vanish inside a
    // store context. These stay unfiltered (RLS still guards the org).
    const noScope = (q: any) => q;

    // Demo mode: always start fresh — wipe any stale demo data and seed clean.
    if (isDemoMode) {
      const fresh: StoreState = {
        tickets: SEED_TICKETS, invoices: SEED_INVOICES,
        invoiceRefunds: [], invoiceRefundAllocations: [], invoiceItemReturns: [],
        walkIns: SEED_WALKINS,
        orders: SEED_ORDERS, revenue: SEED_REVENUE, team: TEAM_SEED,
        inventory: SEED_INVENTORY, stockMovements: SEED_MOVEMENTS, inventoryStockLayers: [],
        customers: SEED_CUSTOMERS, customerGroups: [], loyaltyByCustomer: {}, brands: SEED_BRANDS, deviceModels: SEED_MODELS,
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
          tickets: SEED_TICKETS, invoices: SEED_INVOICES,
          invoiceRefunds: [], invoiceRefundAllocations: [], invoiceItemReturns: [],
          walkIns: SEED_WALKINS,
          orders: SEED_ORDERS, revenue: SEED_REVENUE, team: TEAM_SEED,
          inventory: SEED_INVENTORY, stockMovements: SEED_MOVEMENTS, inventoryStockLayers: [],
          customers: SEED_CUSTOMERS, customerGroups: [], loyaltyByCustomer: {}, brands: SEED_BRANDS, deviceModels: SEED_MODELS,
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
        { data: tix, error: tixErr },
        { data: invs, error: invErr },
        { data: refunds },
        { data: refundAllocs },
        { data: itemReturns },
        { data: wis },
        { data: invItems },
        { data: moves },
        { data: custs },
        { data: comps },
        { data: brds },
        { data: models },
        { data: abOpts },
        { data: atOpts },
        { data: custGroups },
        { data: loyaltyAccts },
        { data: itemCosts },
        { data: lineCosts },
        { data: stockLayers },
      ] = await Promise.all([
        // Transactional data → scoped to the active store (branch_id) when one
        // is selected; the full RLS-scoped set in All-Shops mode.
        scopeToStore(supabase.from("tickets").select("*").is("deleted_at", null).order("created_at", { ascending: false })),
        scopeToStore(supabase.from("invoices").select("*").is("deleted_at", null).order("created_at", { ascending: false })),
        // Refunds / allocations / item returns — the DB refund ledger. Scoped to
        // the active store by branch_id (allocations follow via the refund_id);
        // tolerate the error so the app still loads before the migration is run.
        scopeToStore(supabase.from("invoice_refunds").select("*").order("created_at", { ascending: false })),
        noScope(supabase.from("invoice_refund_allocations").select("*").order("created_at", { ascending: false })),
        scopeToStore(supabase.from("invoice_item_returns").select("*").order("created_at", { ascending: false })),
        scopeToStore(supabase.from("walk_ins").select("*").is("deleted_at", null).order("created_at", { ascending: false })),
        scopeToStore(supabase.from("inventory_items").select("*").is("deleted_at", null).order("created_at", { ascending: false })),
        scopeToStore(supabase.from("stock_movements").select("*").order("created_at", { ascending: false })),
        // Customers are an organization-wide master (a customer can visit any
        // store), so they are NOT filtered by store — the Owner and store users
        // both resolve customer history through RLS + permissions.
        noScope(supabase.from("customers").select("*").is("deleted_at", null).order("created_at", { ascending: false })),
        noScope(supabase.from("companies").select("*").is("deleted_at", null).order("created_at", { ascending: false })),
        // Catalog/master data is org-wide shared (branch_id NULL) → never store-filtered.
        noScope(supabase.from("brands").select("*").order("created_at", { ascending: false })),
        noScope(supabase.from("device_models").select("*").order("created_at", { ascending: false })),
        noScope(supabase.from("assigned_by_options").select("*").order("created_at", { ascending: false })),
        noScope(supabase.from("assigned_to_options").select("*").order("created_at", { ascending: false })),
        // customer_groups may not exist until the migration is applied — tolerate
        // the error so the rest of the app still loads.
        noScope(supabase.from("customer_groups").select("*").is("deleted_at", null).order("display_order", { ascending: true })),
        // loyalty_accounts is org-wide (one row per customer, no branch_id).
        noScope(supabase.from("loyalty_accounts").select("customer_id, points_balance, tier")),
        // Item costs (CP / Standard Labour Cost) live on a cost-scoped table —
        // RLS yields rows ONLY to a cost-capable user; a non-cost user gets an
        // empty set and the merged cost fields stay undefined / not_configured.
        // The org-level default row carries branch_id NULL, so it is NOT store-
        // filtered (would hide the default inside a store context).
        noScope(supabase.from("inventory_item_costs").select("item_id, cost_price, standard_labour_cost, cost_configured")),
        // Invoice line-cost snapshot (SYS-1) — cost-scoped, RLS yields rows ONLY
        // to a cost-capable user. One bulk read (no N+1); merged back onto each
        // invoice's lines below. A non-cost user gets an empty set, so invoice
        // lines stay cost-free (the Profitability panel masks cost + uses the
        // cost-free server aggregate for GP/margin). Not store-filtered (the
        // snapshot's own org/branch RLS already scopes it).
        noScope(supabase.from("invoice_line_costs").select("invoice_id, line_id, cost, cost_state")),
        // Cost-carrying stock ledger layers (LEDGER-DISCONNECT) — cost-scoped,
        // RLS yields rows ONLY to a cost-capable user AND only for visible
        // branches. The weighted-average valuation reads these FIRST (falling
        // back to org CP). Empty for a non-cost user. Store-scoped so an
        // All-Shops valuation sees every visible branch's layers.
        scopeToStore(supabase.from("inventory_stock_layers").select("item_id, qty_in, unit_cost")),
      ]);

      if (!active) return;

      // Index the cost-scoped rows by item id. Empty for a non-cost user (RLS),
      // so cost fields stay undefined + costState "not_configured" for them.
      const costByItem = new Map<string, { cost_price: number; standard_labour_cost: number; cost_configured: boolean }>(
        (itemCosts ?? []).map((c: any) => [c.item_id, c]),
      );
      const mergeInventoryCosts = (item: InventoryItem): InventoryItem => {
        const c = costByItem.get(item.id);
        if (!c) return item;
        return {
          ...item,
          costPrice: Number(c.cost_price ?? 0),
          standardLabourCost: Number(c.standard_labour_cost ?? 0),
          costState: c.cost_configured ? "configured" : "not_configured",
        };
      };

      // Index the invoice line-cost snapshot by invoice → line (SYS-1). Empty
      // for a non-cost user (RLS). Merged back onto each invoice's lines so a
      // cost-capable viewer's Profitability panel runs in-memory as before.
      const lineCostByInvoice = new Map<string, Map<string, { cost: number | null; cost_state: string | null }>>();
      for (const r of (lineCosts ?? []) as any[]) {
        let m = lineCostByInvoice.get(r.invoice_id);
        if (!m) { m = new Map(); lineCostByInvoice.set(r.invoice_id, m); }
        m.set(r.line_id, { cost: r.cost, cost_state: r.cost_state });
      }
      const mergeInvoiceCosts = (inv: Invoice): Invoice => {
        const m = lineCostByInvoice.get(inv.id);
        if (!m) return inv;
        const applyLine = <T extends { id: string }>(line: T): T => {
          const hit = m.get(line.id);
          if (!hit) return line;
          return { ...line, cost: hit.cost ?? undefined, costState: (hit.cost_state ?? undefined) as any };
        };
        return {
          ...inv,
          items: (inv.items ?? []).map(applyLine),
          devices: (inv.devices ?? []).map((d) => ({ ...d, parts: (d.parts ?? []).map(applyLine) })),
        };
      };

      setState((s) => ({
        ...s,
        tickets: (tix ?? []).map(rowToTicket),
        invoices: (invs ?? []).map(rowToInvoice).map(mergeInvoiceCosts),
        invoiceRefunds: (refunds ?? []).map(rowToInvoiceRefund),
        invoiceRefundAllocations: (refundAllocs ?? []).map(rowToRefundAllocation),
        invoiceItemReturns: (itemReturns ?? []).map(rowToItemReturn),
        walkIns: (wis ?? []).map(rowToWalkIn),
        inventory: (invItems ?? []).map(rowToInventoryItem).map(mergeInventoryCosts),
        stockMovements: (moves ?? []).map(rowToStockMovement),
        inventoryStockLayers: ((stockLayers ?? []) as any[]).map((l) => ({
          item_id: l.item_id, qty_in: Number(l.qty_in ?? 0), unit_cost: Number(l.unit_cost ?? 0),
        })),
        customers: (custs ?? []).map(rowToCustomer),
        customerGroups: (custGroups ?? []).map(rowToCustomerGroup),
        loyaltyByCustomer: Object.fromEntries(
          (loyaltyAccts ?? []).map((a: any) => [
            a.customer_id,
            { points: a.points_balance ?? 0, tier: (a.tier ?? "bronze") as LoyaltyTier },
          ])
        ),
        companies: (comps ?? []).map(rowToCompany),
        brands: (brds ?? []).map(rowToBrand),
        deviceModels: (models ?? []).map(rowToDeviceModel),
        assignedByOptions: (abOpts ?? []).map(rowToAssignedByOption),
        assignedToOptions: (atOpts ?? []).map(rowToAssignedToOption),
        // The Issue Master has no DB table — load the durably-persisted shared
        // list (localStorage) so issues added from Walk-In / Ticket survive
        // reloads, falling back to the seed defaults on a fresh install.
        issueLibrary: loadIssueLibrary() ?? DEFAULT_ISSUES,
        loadErrors: [
          ...(tixErr ? ["tickets"] : []),
          ...(invErr ? ["invoices"] : []),
        ],
        hydrated: true,
      }));

      // Resequence the ACTIVE store's tickets to <PREFIX>T-001, …-002 … by
      // original creation order (idempotent, per-store) and patch the display
      // numbers into local state. Skipped in All-Shops mode (scopeStoreId null).
      // Estimates ("E" series) are resequenced independently so each store keeps
      // parallel, gap-free T-… and E-… runs that never consume each other.
      const storePrefix = ticketPrefixSep(activePrefixes.ticket);
      const ticketNoMap = await resequenceTicketNumbers(scopeStoreId, storePrefix, "T");
      const estimateNoMap = await resequenceTicketNumbers(scopeStoreId, storePrefix, "E");
      // Warranty ("W" series) is resequenced independently too, so each store
      // keeps a parallel, gap-free W-0001… run (spec §3/§59).
      const warrantyNoMap = await resequenceTicketNumbers(scopeStoreId, storePrefix, "W");
      const combinedNoMap = { ...ticketNoMap, ...estimateNoMap, ...warrantyNoMap };
      if (active && Object.keys(combinedNoMap).length > 0) {
        setState((s) => ({
          ...s,
          tickets: s.tickets.map((t) =>
            combinedNoMap[t.id] ? { ...t, ticketNo: combinedNoMap[t.id] } : t
          ),
        }));
      }

      // One-time migration of legacy "global" (category-less) brands into strict
      // per-category records. Idempotent + non-destructive: originals are
      // archived (never deleted) so historical tickets/invoices keep resolving.
      try {
        const loadedBrands = (brds ?? []).map(rowToBrand);
        const loadedModels = (models ?? []).map(rowToDeviceModel);
        const cats = await loadDeviceCategories().catch(() => []);
        const catIds = cats.map((c) => c.id);
        const result = migrateLegacyBrands(loadedBrands, loadedModels, catIds);
        if (active && result.changed) {
          setState((s) => ({ ...s, brands: result.brands, deviceModels: result.models }));
          // Persist to DB (best-effort; local state already reflects the change).
          for (const nb of result.newBrands) {
            await db.from("brands").insert({ id: nb.id, name: nb.name, category_id: nb.categoryId ?? null }).then((r) => {
              if (r.error) console.warn("[store] legacy migration: insert brand failed", r.error.message);
            });
          }
          for (const um of result.updatedModels) {
            await db.from("device_models").update({ brand_id: um.brandId, category_id: um.categoryId ?? null }).eq("id", um.id).then((r) => {
              if (r.error) console.warn("[store] legacy migration: repoint model failed", r.error.message);
            });
          }
          for (const aid of result.archivedBrandIds) {
            await db.from("brands").update({ archived: true }).eq("id", aid).then((r) => {
              if (r.error) console.warn("[store] legacy migration: archive brand failed", r.error.message);
            });
          }
        }
      } catch (e) {
        console.warn("[store] legacy brand migration skipped:", e);
      }
    })();

    // Realtime subscriptions for all business tables.
    const client = supabase;

    // Transactional tables that are scoped to a single store. Master/catalog
    // tables (brands, device_models, assigned_*_options, customers, companies,
    // customer_groups) are org-wide shared and must NOT be store-filtered here.
    const STORE_SCOPED_TABLES = new Set([
      "tickets", "invoices", "walk_ins", "inventory_items", "stock_movements",
    ]);

    const handleChange = (table: string, payload: any) => {
      if (!active) return;
      const { eventType } = payload;
      const row = payload.new ?? payload.old;
      if (!row) return;

      // Multi-store isolation on the realtime path: when a concrete store is
      // active, ignore live changes for store-scoped tables that belong to a
      // different store, so another store's inserts/updates never bleed into
      // the current workspace. (Initial loads are already store-filtered above;
      // RLS guarantees we only ever receive rows we're allowed to see.)
      if (
        scopeStoreId &&
        STORE_SCOPED_TABLES.has(table) &&
        row.branch_id != null &&
        row.branch_id !== scopeStoreId
      ) {
        return;
      }

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
            let inv = rowToInvoice(row);
            const idx = prev.invoices.findIndex((i) => i.id === row.id);
            // SYS-1 — the invoices JSON no longer carries line cost. Carry the
            // cost snapshot already merged in memory (from load / save) across a
            // realtime echo so a cost-capable viewer's Profitability panel keeps
            // its figures without a round-trip. (A full reload re-reads the
            // cost-scoped table authoritatively.)
            if (idx !== -1) inv = carryInvoiceLineCosts(prev.invoices[idx], inv);
            if (idx === -1) return { ...prev, invoices: [inv, ...prev.invoices] };
            const next = [...prev.invoices]; next[idx] = inv;
            return { ...prev, invoices: next };
          }
          case "invoice_refunds": {
            if (isDelete) return { ...prev, invoiceRefunds: prev.invoiceRefunds.filter((r) => r.id !== row.id) };
            const rf = rowToInvoiceRefund(row);
            const idx = prev.invoiceRefunds.findIndex((r) => r.id === row.id);
            if (idx === -1) return { ...prev, invoiceRefunds: [rf, ...prev.invoiceRefunds] };
            const next = [...prev.invoiceRefunds]; next[idx] = rf;
            return { ...prev, invoiceRefunds: next };
          }
          case "invoice_refund_allocations": {
            if (isDelete) return { ...prev, invoiceRefundAllocations: prev.invoiceRefundAllocations.filter((a) => a.id !== row.id) };
            const al = rowToRefundAllocation(row);
            const idx = prev.invoiceRefundAllocations.findIndex((a) => a.id === row.id);
            if (idx === -1) return { ...prev, invoiceRefundAllocations: [al, ...prev.invoiceRefundAllocations] };
            const next = [...prev.invoiceRefundAllocations]; next[idx] = al;
            return { ...prev, invoiceRefundAllocations: next };
          }
          case "invoice_item_returns": {
            if (isDelete) return { ...prev, invoiceItemReturns: prev.invoiceItemReturns.filter((r) => r.id !== row.id) };
            const ir = rowToItemReturn(row);
            const idx = prev.invoiceItemReturns.findIndex((r) => r.id === row.id);
            if (idx === -1) return { ...prev, invoiceItemReturns: [ir, ...prev.invoiceItemReturns] };
            const next = [...prev.invoiceItemReturns]; next[idx] = ir;
            return { ...prev, invoiceItemReturns: next };
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
          case "customer_groups": {
            if (isDelete) return { ...prev, customerGroups: prev.customerGroups.filter((g) => g.id !== row.id) };
            const grp = rowToCustomerGroup(row);
            const idx = prev.customerGroups.findIndex((g) => g.id === row.id);
            if (idx === -1) return { ...prev, customerGroups: [...prev.customerGroups, grp] };
            const next = [...prev.customerGroups]; next[idx] = grp;
            return { ...prev, customerGroups: next };
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
          case "loyalty_accounts": {
            // An upsert or delete on a loyalty account — keep loyaltyByCustomer
            // in sync so the Customer Master reflects the latest balance/tier
            // without a full page reload.
            if (isDelete) {
              const { [row.customer_id]: _removed, ...rest } = prev.loyaltyByCustomer;
              return { ...prev, loyaltyByCustomer: rest };
            }
            return {
              ...prev,
              loyaltyByCustomer: {
                ...prev.loyaltyByCustomer,
                [row.customer_id]: {
                  points: row.points_balance ?? 0,
                  tier: (row.tier ?? "bronze") as LoyaltyTier,
                },
              },
            };
          }
          default: return prev;
        }
      });
    };

    const tables = ["tickets", "invoices", "invoice_refunds", "invoice_refund_allocations", "invoice_item_returns", "walk_ins", "inventory_items", "stock_movements", "customers", "customer_groups", "companies", "brands", "device_models", "assigned_by_options", "assigned_to_options", "loyalty_accounts"];

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
    // Re-run when the active store changes so switching stores immediately
    // refreshes every store-dependent dataset (tickets, invoices, walk-ins,
    // inventory, movements) with no stale rows from the previous store.
  }, [authReady, isDemoMode, resolvedKey, demoResetCounter, activeStoreId, storeReady, activePrefixes.ticket]);

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
      // Series letter: Estimates use the independent "E" run (KOR-E-0045),
      // Warranty claims the independent "W" run (KOR-W-0001), everything else
      // the normal "T" run (KOR-T-0045). Each series is numbered independently.
      const seriesLetter = ticket.recordType === "estimate" ? "E" : ticket.recordType === "warranty" ? "W" : "T";
      const seq = await nextTicketIdFromDb(activeStoreIdRef.current, ticketPrefixSep(activePrefixesRef.current.ticket), seriesLetter);
      let current: Ticket = { ...ticket, id: genUniqueTicketId(), ticketNo: seq };
      const insertTicket = async (t: Ticket) => {
        let row = withStore(ticketToRow(t));
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
    // Local/demo mode: derive the next sequential number from in-memory tickets,
    // scoped to the correct series ("E" for estimates, "T" otherwise) so the
    // two runs stay independent exactly as in DB mode.
    const localLetter = ticket.recordType === "estimate" ? "E" : ticket.recordType === "warranty" ? "W" : "T";
    const localMax = stateRef.current.tickets.reduce((max, t) => {
      return Math.max(max, ticketSeq(t.ticketNo, null, localLetter));
    }, 0);
    const localSeq = formatTicketNo(localMax + 1, null, localLetter);
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
      // The `devices` column is a JSONB ENVELOPE (records + ticket-level meta:
      // GST, origin links, recordType, estimateStatus, converted links). Any
      // update that touches an envelope field must REWRITE THE WHOLE ENVELOPE
      // from the merged ticket — writing a bare `updates.devices` array here
      // would silently drop recordType/estimateStatus/GST and turn an Estimate
      // back into a plain ticket. Merge prev + updates so untouched meta is
      // preserved and touched meta is applied.
      const envelopeKeys = [
        "devices", "customerType", "gstNumber", "gstRate", "sgstRate", "cgstRate",
        "sgst", "cgst", "linkedWalkInId", "linkedFieldJobId", "linkedLeadId", "contactId",
        "recordType", "estimateStatus", "convertedTicketId", "convertedFromEstimateId",
        "proformaId", "invoiceId",
        "parentTicketId", "parentTicketNo", "warrantyDeviceIds", "warrantyIssue",
        "warrantyStatus", "sourceInvoiceId", "createdFromTicketId", "createdFromReason",
      ] as const;
      if (envelopeKeys.some((k) => k in updates)) {
        row.devices = ticketDevicesEnvelope({ ...(prev ?? {}), ...updates });
      }
      if ("items" in updates) row.items = updates.items ?? [];
      if ("email" in updates) row.email = updates.email ?? null;
      if ("address" in updates) row.address = updates.address ?? null;
      if ("company" in updates) row.company = updates.company ?? null;
      if ("contactId" in updates) row.contact_id = updates.contactId ?? null;
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
   * Update the operational status of a SINGLE device inside a multi-device
   * ticket, independently of the ticket's other devices.
   *
   * This is the device-level counterpart to updateTicket({ status }). It:
   *   1. Writes the new status onto that one device record only (other devices
   *      are untouched — statuses stay fully independent).
   *   2. Recomputes the PARENT ticket's aggregate status from all device
   *      statuses via deriveTicketStatus(), so the ticket list / dashboard /
   *      reports keep a single consistent high-level status.
   *   3. Persists both the devices array and the recomputed ticket status.
   *   4. Mirrors the aggregate onto any linked invoice's repairStatus (shared
   *      status system) — reusing the exact same sync the ticket path uses.
   *   5. Records a DEVICE-IDENTIFIED activity entry (which device changed,
   *      old → new status).
   *
   * Business rule reuse: a device may only reach "Repaired & Collected" once an
   * invoice exists for the ticket (same rule updateTicket enforces). This keeps
   * the collected/billing state honest at the device level too.
   */
  const updateDeviceStatus = useCallback(async (ticketId: string, deviceId: string, status: TicketStatus) => {
    const ticket = stateRef.current.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    // Resolve the current device list (synthesizes one for legacy single-device
    // tickets so this path works uniformly).
    const currentDevices = getTicketDevices(ticket);
    const target = currentDevices.find((d) => d.id === deviceId);
    if (!target) return;
    if (target.status === status) return; // no-op

    // ── Business rule: block a device moving to "Repaired & Collected" without
    // an invoice — mirrors the ticket-level rule so it can't be bypassed here.
    if (status === "repaired_collected" && !syncingIdsRef.current.has(ticketId)) {
      const hasInvoice = stateRef.current.invoices.some((inv) => inv.ticketId === ticketId);
      if (!hasInvoice) {
        toast.error("Create an invoice first", {
          description: "A device can only be marked \u201cRepaired & Collected\u201d after an invoice has been generated for the ticket.",
        });
        return;
      }
    }

    const prevDeviceStatus = target.status;
    const nextDevices = currentDevices.map((d) => (d.id === deviceId ? { ...d, status } : d));
    const nextTicketStatus = deriveTicketStatus(nextDevices);

    if (shouldUseDb()) {
      // Persist the devices array (device-level status) AND the recomputed
      // aggregate ticket status in a single update. Reuse ticketToRow's device
      // serialization so the {records, ...meta} shape is preserved.
      const devicesJson = ticketToRow({ ...ticket, devices: nextDevices }).devices;
      let currentRow: Record<string, unknown> = { devices: devicesJson, status: nextTicketStatus };
      let { error } = await db.from("tickets").update(currentRow).eq("id", ticketId);
      // Schema-drift resilience (mirrors updateTicket).
      let heal = 0;
      while (error && isUndefinedColumnError(error) && Object.keys(currentRow).length > 0 && heal < 4) {
        heal += 1;
        const col = extractMissingColumn(error);
        currentRow = omitKeys(currentRow, col ? [col] : ["status"]);
        if (Object.keys(currentRow).length === 0) break;
        const retry = await db.from("tickets").update(currentRow).eq("id", ticketId);
        error = retry.error;
      }
      if (error) {
        console.error("[store] updateDeviceStatus failed:", error.code, error.message, error);
        toast.error("Device status not saved", { description: `DB error [${error.code ?? "?"}]: ${error.message ?? "unknown"}` });
        return;
      }
    }

    setState((s) => ({
      ...s,
      tickets: s.tickets.map((t) => (t.id === ticketId ? { ...t, devices: nextDevices, status: nextTicketStatus } : t)),
    }));

    // Mirror the recomputed aggregate onto linked invoices' repairStatus so both
    // records stay in sync (same behaviour as the ticket status path).
    if (!syncingIdsRef.current.has(ticketId)) {
      const linkedInvoices = stateRef.current.invoices.filter((inv) => inv.ticketId === ticketId && inv.repairStatus !== nextTicketStatus);
      for (const inv of linkedInvoices) {
        syncingIdsRef.current.add(inv.id);
        try {
          if (shouldUseDb()) {
            const invDevicesJson = invoiceToRow({ ...inv, repairStatus: nextTicketStatus }).devices;
            const { error } = await db.from("invoices").update({ devices: invDevicesJson }).eq("id", inv.id);
            if (error) console.error("[store] device→invoice sync failed:", error.message);
          }
          setState((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === inv.id ? { ...i, repairStatus: nextTicketStatus } : i)) }));
        } finally {
          syncingIdsRef.current.delete(inv.id);
        }
      }
    }

    // Device-identified activity entry — names the affected device, not just the ticket.
    const deviceName = [target.brand, target.model].filter(Boolean).join(" ") || target.model || target.brand || "Device";
    const severity: ActivitySeverity = status === "repaired" || status === "repaired_collected" ? "success" : "info";
    logActivity({
      module: "Ticket",
      action: "Device Status Changed",
      severity,
      entity: "Ticket",
      reference: ticket.ticketNo || ticket.id,
      description: `${deviceName} status changed to ${STATUS_LABEL[status]} on ticket ${ticket.ticketNo ?? ticket.id}.`,
      changes: [{ field: `${deviceName} Status`, from: STATUS_LABEL[prevDeviceStatus] ?? prevDeviceStatus, to: STATUS_LABEL[status] ?? status }],
      meta: { Device: deviceName, "Overall Status": STATUS_LABEL[nextTicketStatus] ?? nextTicketStatus },
    });
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
  const syncTicketStatusFromInvoice = useCallback(async (ticketId: string | undefined, repairStatus: TicketStatus | undefined, billedDeviceIds?: string[]) => {
    if (!ticketId || !repairStatus) return;
    if (syncingIdsRef.current.has(ticketId)) return;
    const ticket = stateRef.current.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    // ── Multi-device tickets: only the BILLED devices move ──
    // An invoice bills SOME devices (selective invoicing), so pushing the
    // invoice's repair status onto EVERY device would destroy per-device
    // independence. Instead we apply the invoice's repairStatus to exactly the
    // devices this invoice billed (billedDeviceIds — their Ticket DeviceRecord
    // ids), leave the other devices untouched, and recompute the ticket's
    // aggregate from the result. When no billed ids are known (e.g. a legacy
    // invoice) we fall back to recomputing the aggregate from the current
    // device statuses without changing any device.
    const isMultiDevice = (ticket.devices?.length ?? 0) > 1;
    if (isMultiDevice) {
      const billed = new Set(billedDeviceIds ?? []);
      // Promote a billed device to the invoice's repair status ONLY if it is
      // still at the initial "in_progress" state. If the user already set a
      // specific per-device status in the Pricing step (persisted via
      // updateDeviceStatus), that explicit choice is preserved — we never walk
      // it back to the invoice's default.
      const nextDevices = (ticket.devices ?? []).map((d) =>
        billed.has(d.id) && d.status === "in_progress" && repairStatus !== "in_progress"
          ? { ...d, status: repairStatus }
          : d,
      );
      const aggregate = deriveTicketStatus(nextDevices);
      const devicesChanged = billed.size > 0 && nextDevices.some((d, i) => d.status !== (ticket.devices ?? [])[i].status);
      if (!devicesChanged && ticket.status === aggregate) return; // nothing to reconcile
      syncingIdsRef.current.add(ticket.id);
      try {
        if (shouldUseDb()) {
          const devicesJson = ticketToRow({ ...ticket, devices: nextDevices }).devices;
          const { error } = await db.from("tickets").update({ devices: devicesJson, status: aggregate }).eq("id", ticket.id);
          if (error) console.error("[store] invoice→ticket device sync failed:", error.message);
        }
        setState((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === ticket.id ? { ...t, devices: nextDevices, status: aggregate } : t)) }));
      } finally {
        syncingIdsRef.current.delete(ticket.id);
      }
      return;
    }

    // ── Single-device / legacy tickets: preserve the original behaviour ──
    if (ticket.status === repairStatus) return;
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

  /** Extract the billed Ticket DeviceRecord ids from an invoice's devices. */
  const billedTicketDeviceIds = (inv: Invoice): string[] =>
    (inv.devices ?? []).map((d) => d.ticketDeviceId).filter((id): id is string => !!id);

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

  /**
   * Award loyalty points + bump customer stats for a newly-paid invoice.
   * Called from BOTH addInvoice (invoice created directly with status "paid",
   * e.g. instant walk-in cash sale) and updateInvoice (an existing invoice
   * transitioning TO "paid"). Callers are responsible for only invoking this
   * once per genuine "→ paid" transition (see call sites for the exact guard);
   * this function itself only guards against a concurrent duplicate call for
   * the SAME invoice id via `awardingLoyaltyRef`, plus a DB unique index
   * (loyalty_transactions_one_earn_per_source) as the hard backstop against
   * double-awarding the same invoice.
   *
   * No-ops silently if the invoice has no linked customerId — legacy/guest
   * invoices (denormalized name/phone only) never earn points until they're
   * linked to a real Customer Master record.
   */
  const awardLoyaltyForPaidInvoice = useCallback(async (invoiceId: string, customerId: string | undefined, invoiceReference: string, invoiceTotal: number) => {
    if (!customerId || awardingLoyaltyRef.current.has(invoiceId)) return;
    awardingLoyaltyRef.current.add(invoiceId);
    try {
      // Loyalty config (enabled + earning rate) lives in Settings → Customers
      // → Loyalty (organization_settings.loyalty_config), same table/pattern
      // as invoice numbering above. Read directly here rather than through
      // useStoreSettings() — StoreSettingsProvider is mounted INSIDE
      // StoreProvider in the tree, so this component can't consume that hook.
      let loyaltyEnabled = true;
      let pointsPerRupee = 100;
      // Admin-configurable tier point structure (from loyalty_config.tiers).
      // Falls back to the built-in default thresholds when not customized.
      let loyaltyThresholds = thresholdsFromTiers(null);
      if (shouldUseDb()) {
        try {
          const { data: settingsRows } = await db.from("organization_settings").select("loyalty_config").limit(1);
          const raw = settingsRows?.[0]?.loyalty_config as unknown;
          const cfg = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
          if (cfg && typeof cfg === "object") {
            if (typeof cfg.enabled === "boolean") loyaltyEnabled = cfg.enabled;
            if (typeof cfg.pointsPerRupee === "number" && cfg.pointsPerRupee > 0) pointsPerRupee = cfg.pointsPerRupee;
            if (Array.isArray(cfg.tiers)) loyaltyThresholds = thresholdsFromTiers(cfg.tiers);
          }
        } catch {
          /* keep defaults (program enabled, ₹100 = 1 point, default tiers) */
        }
      }

      const pointsEarned = loyaltyEnabled ? pointsFromInvoiceAmount(invoiceTotal, pointsPerRupee) : 0;
      const customer = stateRef.current.customers.find((c) => c.id === customerId);

      if (pointsEarned > 0 && shouldUseDb()) {
        const { data: account } = await db
          .from("loyalty_accounts")
          .select("points_balance")
          .eq("customer_id", customerId)
          .maybeSingle();
        const currentBalance = account?.points_balance ?? 0;
        const newBalance = currentBalance + pointsEarned;
        const newTier = tierForLifetimeValue(newBalance, loyaltyThresholds);

        const { error: txError } = await db.from("loyalty_transactions").insert({
          id: `LTX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 9)}`,
          customer_id: customerId,
          type: "earn",
          points_change: pointsEarned,
          points_balance: newBalance,
          source_type: "invoice",
          source_id: invoiceId,
          description: `Earned ${pointsEarned} pts from invoice ${invoiceReference || invoiceId}`,
        });
        // Unique-violation (23505) means an earn transaction for this invoice
        // already exists — another call already awarded it, so skip silently.
        if (txError && txError.code !== "23505") {
          console.error("[store] loyalty award failed:", txError.message);
        } else if (!txError) {
          const { error: acctError } = await db.from("loyalty_accounts").upsert({
            customer_id: customerId,
            points_balance: newBalance,
            tier: newTier,
            last_transaction_at: new Date().toISOString(),
          });
          if (acctError) console.error("[store] loyalty account upsert failed:", acctError.message);
        }
      }

      // Patch loyaltyByCustomer in local state immediately so the Customer
      // Master table reflects the new balance/tier without waiting for the
      // realtime event (or in local/demo mode where there is no realtime).
      if (pointsEarned > 0) {
        const prevLoy = stateRef.current.loyaltyByCustomer[customerId] ?? { points: 0, tier: "bronze" as LoyaltyTier };
        const newLoyPoints = prevLoy.points + pointsEarned;
        const newLoyTier = tierForLifetimeValue(newLoyPoints, loyaltyThresholds);
        setState((s) => ({
          ...s,
          loyaltyByCustomer: {
            ...s.loyaltyByCustomer,
            [customerId]: { points: newLoyPoints, tier: newLoyTier },
          },
        }));
      }

      // Customer stats: bump totalInvoices / lifetimeValue / lastVisit
      // regardless of whether points were earned (amount could be ₹0).
      if (customer) {
        const nextTotalInvoices = (customer.totalInvoices ?? 0) + 1;
        const nextLifetimeValue = (customer.lifetimeValue ?? 0) + invoiceTotal;
        // "Completed" for a ticket = repaired/returned AND handed back to the
        // customer — repaired_collected / return_collected are the real
        // terminal TicketStatus values (there is no "completed"/"closed").
        const nextTotalTickets = stateRef.current.tickets.filter(
          (t) => t.customerId === customerId && (t.status === "repaired_collected" || t.status === "return_collected")
        ).length;
        const nowIso = new Date().toISOString();

        // Re-evaluate automatic group membership now that lifetime value /
        // ticket count / tier just changed — this is the ONE moment those
        // numbers actually move, so it's the natural trigger point. Matches
        // by group NAME (see evaluateAutomaticGroups) — if the org hasn't
        // created a group literally named "High Value" / "Frequent Customer"
        // / "Inactive" / "VIP", the corresponding rule silently assigns
        // nothing (no error, just no match).
        const daysSinceLastActivity = customer.lastVisit
          ? Math.floor((Date.now() - new Date(customer.lastVisit).getTime()) / 86_400_000)
          : 0;
        const autoGroupIds = evaluateAutomaticGroups(
          {
            customer,
            lifetimeValue: nextLifetimeValue,
            totalTickets: nextTotalTickets,
            totalVisits: nextTotalInvoices,
            daysSinceLastActivity,
          },
          stateRef.current.customerGroups
        );
        const nextGroupIds = Array.from(new Set([...(customer.groupIds ?? []), ...autoGroupIds]));

        if (shouldUseDb()) {
          const { error: custError } = await db
            .from("customers")
            .update({ total_invoices: nextTotalInvoices, lifetime_value: nextLifetimeValue, last_visit: nowIso, group_ids: nextGroupIds })
            .eq("id", customerId);
          if (custError) console.error("[store] loyalty customer-stats update failed:", custError.message);
        }
        setState((s) => ({
          ...s,
          customers: s.customers.map((c) =>
            c.id === customerId
              ? { ...c, totalInvoices: nextTotalInvoices, lifetimeValue: nextLifetimeValue, lastVisit: nowIso, groupIds: nextGroupIds, updatedAt: nowIso }
              : c
          ),
        }));
      }
    } finally {
      awardingLoyaltyRef.current.delete(invoiceId);
    }
  }, []);

  /**
   * SYS-1 — persist the per-line resolved cost snapshot to the cost-scoped
   * `invoice_line_costs` table (RLS = cost keys only). This REPLACES storing
   * `cost`/`costState` inline in the broadly-readable invoices JSON. A non-cost
   * caller's upserts are simply rejected by RLS (no-op), so only a cost-authorized
   * save records the snapshot; the snapshot is historical/immutable (we upsert on
   * create and leave it untouched on ordinary edits that don't re-stamp cost).
   */
  const persistInvoiceLineCosts = useCallback(async (invoice: Invoice) => {
    if (!shouldUseDb()) return;
    // SERVER-OWNED finalization (review findings #5, #6, #8). The per-line cost
    // snapshot and any direct-sale stock consumption are NO LONGER written from
    // the browser — the client cannot (and must not) write invoice_line_costs
    // (it has no end-user RLS write policy) nor derive cost it may not read.
    // Instead we POST to /api/invoice/[id]/finalize-costing, which under the
    // service role resolves each line's cost from the authoritative records
    // REGARDLESS of this user's cost-read grants (so a non-cost creator still
    // gets a correct snapshot), upserts the immutable snapshot, and idempotently
    // consumes direct-invoice part stock (single Outward per fulfilment line).
    try {
      const { data: sess } = await db.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/invoice/${encodeURIComponent(invoice.id)}/finalize-costing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Non-fatal: the invoice itself is already saved. A failure here means
        // the cost snapshot / consumption did not record; log for diagnosis but
        // never block the user's save.
        let msg = `${res.status}`;
        try { msg = (await res.json())?.error ?? msg; } catch { /* ignore */ }
        console.error("[store] finalize-costing failed:", msg);
      }
    } catch (e: any) {
      console.error("[store] finalize-costing request error:", e?.message ?? e);
    }
  }, [shouldUseDb, db]);

  /* ── Invoice actions (DB-first) ── */
  const addInvoice = useCallback(async (invoiceInput: Invoice): Promise<string> => {
    // Normalize the ticket link so a ticket NUMBER (or stale reference) can never
    // trigger a foreign-key violation that discards the invoice.
    const invoice: Invoice = { ...invoiceInput, ticketId: resolveTicketId(invoiceInput.ticketId) };

    // ── Duplicate-billing guard (concurrency-safe revalidation) ──
    // Before creating the invoice, re-check that none of its ticket devices are
    // ALREADY billed on another invoice for the same ticket. This protects
    // against a double-click, two open tabs, a stale device-selection popup, or
    // another user having invoiced a device after the popup opened. The
    // in-memory `invoices` reflect the latest DB/realtime state, so this is the
    // authoritative check at write time. Cancelled invoices don't reserve
    // devices. Skipped for edits/updates (handled by updateInvoice).
    if (invoice.ticketId) {
      const linkedDeviceIds = (invoice.devices ?? [])
        .map((d) => d.ticketDeviceId)
        .filter((id): id is string => !!id);
      if (linkedDeviceIds.length > 0) {
        const ticket = stateRef.current.tickets.find(
          (t) => t.id === invoice.ticketId || t.ticketNo === invoice.ticketId,
        );
        if (ticket) {
          // Only OTHER, non-cancelled invoices reserve devices.
          const others = stateRef.current.invoices.filter(
            (inv) => inv.id !== invoice.id && inv.status !== "cancelled",
          );
          const alreadyInvoiced = getInvoicedTicketDeviceIds(ticket, others);
          const clash = linkedDeviceIds.filter((id) => alreadyInvoiced.has(id));
          if (clash.length > 0) {
            toast.error("Some devices are already invoiced", {
              description: "One or more selected devices have already been billed on another invoice for this ticket. Refresh and invoice only the remaining devices.",
            });
            return "";
          }
        }
      }
    }

    if (shouldUseDb()) {
      // Single insert attempt. Retries once without the optional columns in case
      // an older DB is missing them.
      const attemptInsert = async (inv: Invoice) => {
        let row = withStore(invoiceToRow(inv));
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
        const nextId = await nextInvoiceIdFromDb(current.invoiceType, activeStoreIdRef.current, activePrefixesRef.current.invoice, current.documentType);
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
        // Make the new invoice visible to stateRef SYNCHRONOUSLY. stateRef is
        // otherwise refreshed only by a useEffect (a tick later), so the very
        // next line's syncTicketStatusFromInvoice — and the "Create an invoice
        // first" hasInvoice guards it can trigger (updateTicket/
        // updateDeviceStatus) — would read a stale invoice list and silently
        // reject the default "Repaired & Collected" write. (Root cause of the
        // ticket staying "In Progress" until the status was re-clicked.)
        stateRef.current = { ...stateRef.current, invoices: [current, ...stateRef.current.invoices] };
        logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: current.reference || current.id, description: `Generated invoice for ${current.customer}.`, meta: { Total: inr(current.total) } });
        // Sync the (possibly default) repairStatus onto the linked ticket's
        // BILLED devices (selective invoicing).
        await syncTicketStatusFromInvoice(current.ticketId, current.repairStatus, billedTicketDeviceIds(current));
        return current.id;
      }

      const saved = rowToInvoice(res.data);
      // Preserve serviceCategory/paymentMode locally even if DB lacks the columns.
      saved.serviceCategory = current.serviceCategory;
      saved.paymentMode = current.paymentMode;
      // SYS-1 — the invoices JSON no longer carries line cost, so (a) persist the
      // resolved cost snapshot to the cost-scoped table and (b) re-merge it onto
      // the in-memory record (from the ORIGINAL input `current`, which still
      // carries cost) so this session's cost-capable user keeps the figures.
      await persistInvoiceLineCosts(current);
      saved.items = current.items;
      saved.devices = current.devices;
      setState((s) => ({ ...s, invoices: [saved, ...s.invoices] }));
      // See note above: refresh stateRef synchronously so the immediately
      // following syncTicketStatusFromInvoice + hasInvoice guards see this
      // invoice this tick (not one useEffect later).
      stateRef.current = { ...stateRef.current, invoices: [saved, ...stateRef.current.invoices] };
      logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: saved.reference || saved.id, description: `Generated invoice for ${saved.customer}.`, meta: { Total: inr(saved.total) } });
      // CRITICAL: propagate the invoice's repairStatus (defaults to
      // "Repaired & Collected") back to the originating ticket's BILLED devices
      // immediately, even when the user never manually changed the invoice status.
      await syncTicketStatusFromInvoice(saved.ticketId, saved.repairStatus, billedTicketDeviceIds(saved));
      // Billing lineage — stamp this invoice's id back onto the originating
      // Ticket/Estimate so View Ticket/Estimate can answer "was it finally
      // invoiced, and which invoice?" without a reverse scan (mirrors the
      // sourceEstimateId/sourceTicketId lineage already carried on the invoice).
      const linkedTicketId = saved.ticketId ?? saved.sourceTicketId;
      if (linkedTicketId) {
        const linkedTicket = stateRef.current.tickets.find((t) => t.id === linkedTicketId);
        if (linkedTicket && linkedTicket.invoiceId !== saved.id) {
          try { await updateTicket(linkedTicket.id, { invoiceId: saved.id }); } catch { /* non-fatal */ }
        }
      }
      if (saved.sourceEstimateId) {
        const est = stateRef.current.tickets.find((t) => t.id === saved.sourceEstimateId);
        if (est && est.invoiceId !== saved.id) {
          try { await updateTicket(est.id, { invoiceId: saved.id }); } catch { /* non-fatal */ }
        }
      }
      // A brand-new invoice created directly with status "paid" (e.g. instant
      // walk-in cash sale) never passes through updateInvoice's "→ paid"
      // transition check, so award loyalty points here on creation instead.
      if (saved.status === "paid") {
        await awardLoyaltyForPaidInvoice(saved.id, saved.customerId, saved.reference || saved.id, saved.total);
      }
      return saved.id;
    }
    setState((s) => ({ ...s, invoices: [invoice, ...s.invoices] }));
    // See note above: refresh stateRef synchronously so the immediately
    // following syncTicketStatusFromInvoice + hasInvoice guards see this invoice
    // this tick (not one useEffect later). Matters in local/demo mode too.
    stateRef.current = { ...stateRef.current, invoices: [invoice, ...stateRef.current.invoices] };
    logActivity({ module: "Invoice", action: "Invoice Created", severity: "success", entity: "Invoice", reference: invoice.reference || invoice.id, description: `Generated invoice for ${invoice.customer}.`, meta: { Total: inr(invoice.total) } });
    await syncTicketStatusFromInvoice(invoice.ticketId, invoice.repairStatus, billedTicketDeviceIds(invoice));
    if (invoice.status === "paid") {
      await awardLoyaltyForPaidInvoice(invoice.id, invoice.customerId, invoice.reference || invoice.id, invoice.total);
    }
    return invoice.id;
  }, [syncTicketStatusFromInvoice, resolveTicketId, awardLoyaltyForPaidInvoice, updateTicket, persistInvoiceLineCosts]);

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
      if ("contactId" in updates) row.contact_id = updates.contactId ?? null;
      if ("customerId" in updates) row.customer_id = updates.customerId ?? null;
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
      // Cost snapshot stripped from the broadly-readable JSON (SYS-1). The
      // devices branch below re-serializes via invoiceToRow (also stripped) when
      // lineage/meta changes; this handles the plain items/devices update.
      if ("items" in updates) row.items = (updates.items ?? []).map((it) => stripLineCost(it));
      if ("devices" in updates) row.devices = stripDeviceCosts(updates.devices ?? []);
      if ("dueDate" in updates) row.due_date = updates.dueDate ?? null;
      if ("employee" in updates) row.employee = updates.employee ?? null;
      if ("invoiceType" in updates) row.invoice_type = updates.invoiceType ?? "retail";
      if ("serviceCategory" in updates) row.service_category = updates.serviceCategory ?? "service";
      if ("paymentMode" in updates) row.payment_mode = updates.paymentMode ?? null;
      // repairStatus / paymentMode / serviceCategory live in the `devices` meta
      // jsonb. When any of them change, re-serialize the whole devices column so
      // the value is actually persisted (survives reload / logout).
      // documentType + lineage (documentType / proformaStatus / sourceProformaId
      // / sourceEstimateId / sourceTicketId / convertedInvoiceId) also live in
      // the `devices` meta jsonb — re-serialize when any of them change so the
      // proforma→invoice conversion links actually persist.
      const LINEAGE_KEYS = ["documentType", "proformaStatus", "sourceProformaId", "sourceEstimateId", "sourceTicketId", "convertedInvoiceId", "warrantyClaimIds"] as const;
      const lineageTouched = LINEAGE_KEYS.some((k) => k in updates);
      if (prev && ("repairStatus" in updates || "paymentMode" in updates || "serviceCategory" in updates || "devices" in updates || lineageTouched)) {
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
      } else if (("items" in updates || "devices" in updates) && prev) {
        // SYS-1 — when the line set changed, re-snapshot the cost to the
        // cost-scoped table from the (un-stripped) incoming lines. RLS no-ops
        // this for a non-cost caller, so only a cost-authorized edit records it.
        await persistInvoiceLineCosts({ ...prev, ...updates } as Invoice);
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

    // ── Loyalty: award points once, only when the invoice becomes fully paid ──
    // "Finalized" = status transitions TO "paid" (it wasn't already paid).
    // Never awards from draft/sent/partial/overdue/cancelled, and never
    // re-awards on a subsequent save that keeps status === "paid" — the
    // transition check (prev?.status !== "paid") only fires on the edge.
    if (updates.status === "paid" && prev?.status !== "paid") {
      const customerId = updates.customerId ?? prev?.customerId;
      const invoiceTotal = updates.total ?? prev?.total ?? 0;
      await awardLoyaltyForPaidInvoice(id, customerId, prev?.reference || id, invoiceTotal);
    }

    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "status", label: "Status" }, { key: "paidAmount", label: "Paid", format: inr }, { key: "total", label: "Total", format: inr },
    ]);
    let action = "Invoice Updated"; let severity: ActivitySeverity = "info";
    if (("paidAmount" in updates && (updates.paidAmount ?? 0) > (prev?.paidAmount ?? 0)) || updates.status === "paid") { action = "Payment Added"; severity = "success"; }
    else if (updates.status === "cancelled") { action = "Cancelled"; severity = "critical"; }
    logActivity({ module: "Invoice", action, severity, entity: "Invoice", reference: prev?.reference || id, description: `Updated invoice ${prev?.reference || id} (${prev?.customer ?? ""}).`, changes });
  }, [resolveTicketId, awardLoyaltyForPaidInvoice, persistInvoiceLineCosts]);

  const deleteInvoice = useCallback(async (id: string) => {
    const prev = stateRef.current.invoices.find((inv) => inv.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("invoices").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteInvoice failed:", error.message); toast.error("Invoice not deleted", { description: "We couldn't delete this invoice in the database. Please try again." }); return; }
    }
    setState((s) => ({ ...s, invoices: s.invoices.filter((inv) => inv.id !== id) }));
    logActivity({ module: "Invoice", action: "Invoice Deleted", severity: "critical", entity: "Invoice", reference: prev?.reference || id, description: prev ? `Deleted invoice ${prev.reference} for ${prev.customer}.` : `Deleted invoice ${id}.`, meta: prev ? { Total: inr(prev.total) } : undefined });
  }, []);

  /* ── Proforma → Final Invoice conversion (atomic + idempotent) ──
     Creates a NEW normal Invoice from a Proforma, copying all commercial data
     and device relationships. Never mutates/deletes the proforma — it only
     stamps the bidirectional lineage link once the new invoice actually exists.
     Guards:
       • Idempotent — if the proforma is ALREADY converted, returns the existing
         invoice id (no second invoice). This is the durable, multi-user-safe
         check (backed by the persisted convertedInvoiceId).
       • Double-click — an in-session in-flight set rejects re-entry.
       • Same org/store — the new invoice inherits the proforma's branchId, never
         the currently-selected store.
       • Only proformas — a normal invoice is never "converted". */
  const convertProformaToInvoice = useCallback(async (proformaId: string): Promise<string> => {
    const proforma = stateRef.current.invoices.find((inv) => inv.id === proformaId);
    if (!proforma) {
      toast.error("Proforma not found", { description: "This proforma no longer exists." });
      return "";
    }
    if (!isProforma(proforma)) {
      toast.error("Not a proforma", { description: "Only proforma documents can be pushed to a normal invoice." });
      return "";
    }
    // ── Idempotency: already converted → return the existing invoice. ──
    if (proforma.convertedInvoiceId) {
      const existing = stateRef.current.invoices.find((inv) => inv.id === proforma.convertedInvoiceId);
      if (existing) return existing.id;
      // Link exists but the invoice was deleted — fall through to recreate.
    }
    // ── Double-click / concurrent re-entry guard (this session). ──
    if (convertingProformaRef.current.has(proformaId)) return "";
    convertingProformaRef.current.add(proformaId);

    try {
      // Build the NEW normal Invoice from the proforma's captured commercial
      // data. A fresh identity: its own id (assigned by addInvoice against the
      // normal invoice series), createdAt, status lifecycle and payment state.
      // Devices (and their durable ticketDeviceId links) are copied verbatim.
      const devices = getInvoiceDevices(proforma);
      const newInvoice: Invoice = {
        ...proforma,
        // Fresh identity — addInvoice assigns the real normal-invoice id.
        id: "",
        documentType: "invoice",       // a NORMAL, revenue-bearing invoice
        proformaStatus: undefined,     // financial invoice has no proforma status
        status: "draft",               // normal invoice lifecycle starts at draft
        paidAmount: 0,
        createdAt: new Date().toISOString(),
        pinnedAt: undefined,
        // Lineage — where this invoice came from (queryable both directions).
        sourceProformaId: proforma.id,
        sourceEstimateId: proforma.sourceEstimateId,
        sourceTicketId: proforma.sourceTicketId ?? proforma.ticketId,
        convertedInvoiceId: undefined,
        // Keep the same store/customer/devices; branchId flows via ...proforma.
        branchId: proforma.branchId,
        devices: devices.map((d) => ({ ...d })),
      };

      const newId = await addInvoice(newInvoice);
      if (!newId) {
        // addInvoice already surfaced the reason (e.g. duplicate-billing guard).
        return "";
      }

      // Stamp the proforma as converted (historical source doc, never deleted).
      await updateInvoice(proformaId, { convertedInvoiceId: newId, proformaStatus: "converted" });

      // Downstream lineage on the originating Ticket / Estimate, when known, so
      // View Ticket / View Estimate can show the final invoice.
      const linkTicketId = proforma.sourceTicketId ?? proforma.ticketId;
      if (linkTicketId) {
        const t = stateRef.current.tickets.find((tk) => tk.id === linkTicketId);
        if (t) { try { await updateTicket(t.id, { invoiceId: newId }); } catch { /* non-fatal */ } }
      }
      if (proforma.sourceEstimateId) {
        const e = stateRef.current.tickets.find((tk) => tk.id === proforma.sourceEstimateId);
        if (e) { try { await updateTicket(e.id, { invoiceId: newId }); } catch { /* non-fatal */ } }
      }

      logActivity({
        module: "Invoice",
        action: "Invoice Created from Proforma",
        severity: "success",
        entity: "Invoice",
        reference: newId,
        description: `Created invoice ${newId} from proforma ${proforma.id} (${proforma.customer}).`,
        meta: { Proforma: proforma.id, Total: inr(proforma.total) },
      });
      logActivity({
        module: "Invoice",
        action: "Proforma Converted to Invoice",
        severity: "info",
        entity: "Invoice",
        reference: proforma.id,
        description: `Proforma ${proforma.id} converted to invoice ${newId}.`,
        meta: { Invoice: newId },
      });
      toast.success("Invoice created", { description: `${newId} created from proforma ${proforma.id}.` });
      return newId;
    } finally {
      convertingProformaRef.current.delete(proformaId);
    }
  }, [addInvoice, updateInvoice, updateTicket]);

  /* ── Refunds & Returns (DB-first; the finalized invoice is NEVER mutated) ──
     The DB `invoice_refunds` ledger is the financial-reversal authority; the
     two demo ledgers (daily-ledger + accounting journal) are PROJECTIONS only.
     The DB guard (`invoice_refunds_guard`) is the authoritative over-refund +
     eligibility + segregation-of-duties check — the client re-reads live
     invoices for the common-case concurrency check only. */

  // Loyalty-reversal single-flight (keyed by refund uuid), avoiding a redundant
  // DB round-trip before the refund-scoped unique index settles.
  const reversingLoyaltyRef = useRef<Set<string>>(new Set());

  /** Reverse earned loyalty for a succeeded refund, ONCE. Mirrors
   *  awardLoyaltyForPaidInvoice's inverse: one `adjustment` row keyed on the
   *  refund uuid (`source_type='refund'`), negative points, decrement balance.
   *  `direction` = -1 for a refund (points removed), +1 to restore on reversal. */
  const reverseLoyaltyForRefund = useCallback(
    async (refundId: string, customerId: string | undefined, refundAmount: number, direction: 1 | -1) => {
      if (!customerId || refundAmount <= 0) return;
      const key = `${refundId}:${direction}`;
      if (reversingLoyaltyRef.current.has(key)) return;
      reversingLoyaltyRef.current.add(key);
      try {
        let pointsPerRupee = 100;
        if (shouldUseDb()) {
          try {
            const { data: rows } = await db.from("organization_settings").select("loyalty_config").limit(1);
            const raw = rows?.[0]?.loyalty_config as unknown;
            const cfg = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
            if (cfg && typeof cfg === "object" && typeof (cfg as any).pointsPerRupee === "number" && (cfg as any).pointsPerRupee > 0) {
              pointsPerRupee = (cfg as any).pointsPerRupee;
            }
          } catch { /* keep default ₹100 = 1 point */ }
        }
        const magnitude = pointsFromInvoiceAmount(refundAmount, pointsPerRupee);
        if (magnitude <= 0) return;
        // direction -1 → remove points (refund); +1 → restore (reversal).
        const delta = direction * magnitude;
        const thresholds = await readLoyaltyThresholds();

        if (shouldUseDb()) {
          const { data: account } = await db
            .from("loyalty_accounts")
            .select("points_balance")
            .eq("customer_id", customerId)
            .maybeSingle();
          const currentBalance = account?.points_balance ?? 0;
          const newBalance = Math.max(0, currentBalance + delta);
          const newTier = tierForLifetimeValue(newBalance, thresholds);
          // One reversal per refund uuid: the refund-scoped partial unique index
          // (loyalty_transactions_one_refund_reversal) makes a double-submit a
          // no-op (23505 ignored). The reversal row uses source_type='refund',
          // source_id = refund uuid.
          const { error: txError } = await db.from("loyalty_transactions").insert({
            id: `LTX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 9)}`,
            customer_id: customerId,
            type: "adjustment",
            points_change: delta,
            points_balance: newBalance,
            source_type: "refund",
            source_id: direction === -1 ? refundId : `${refundId}:restore`,
            description:
              direction === -1
                ? `Reversed ${magnitude} pts for refund ${refundId}`
                : `Restored ${magnitude} pts (refund ${refundId} reversed)`,
          });
          if (txError && txError.code !== "23505") {
            console.error("[store] loyalty refund-reversal failed:", txError.message);
            return;
          }
          if (!txError) {
            await db.from("loyalty_accounts").upsert({
              customer_id: customerId,
              points_balance: newBalance,
              tier: newTier,
              last_transaction_at: new Date().toISOString(),
            });
          }
        }
        // Patch loyaltyByCustomer immediately (also covers local/demo mode).
        setState((s) => {
          const prevLoy = s.loyaltyByCustomer[customerId] ?? { points: 0, tier: "bronze" as LoyaltyTier };
          const newLoyPoints = Math.max(0, prevLoy.points + delta);
          return {
            ...s,
            loyaltyByCustomer: {
              ...s.loyaltyByCustomer,
              [customerId]: { points: newLoyPoints, tier: tierForLifetimeValue(newLoyPoints, thresholds) },
            },
          };
        });
      } finally {
        reversingLoyaltyRef.current.delete(key);
      }
    },
    [shouldUseDb, db, readLoyaltyThresholds],
  );

  /** Project a succeeded/reversed refund into the demo daily-ledger (a Refund
   *  outflow / inflow correction). Idempotent per refund_no via the seen-set —
   *  the DB `invoice_refunds` row is the authority, never this projection. */
  const ledgerRefundRef = useRef<Set<string>>(new Set());
  const projectRefundToDailyLedger = useCallback(
    (refundNo: string, amount: number, method: string, direction: "outflow" | "inflow", createdBy: string) => {
      const key = `${refundNo}:${direction}`;
      if (ledgerRefundRef.current.has(key)) return;
      ledgerRefundRef.current.add(key);
      try {
        const cashOrBank: "Cash" | "Bank" = method.toLowerCase() === "cash" ? "Cash" : "Bank";
        recordLedgerTransaction({
          date: new Date().toISOString().slice(0, 10),
          module: "Refund",
          referenceId: refundNo,
          description: `Refund ${refundNo} (${direction === "outflow" ? "paid" : "reversed"})`,
          category: "Refund",
          paymentMode: (cashOrBank === "Cash" ? "Cash" : "Bank"),
          cashOrBank,
          direction,
          amount,
          employee: createdBy,
          createdBy,
        });
      } catch (e) {
        // The ledger is a demo projection; never let it break the refund.
        console.warn("[store] daily-ledger refund projection skipped:", e);
      }
    },
    [],
  );

  const processRefund = useCallback(
    async (input: ProcessRefundInput): Promise<string> => {
      const invoice = stateRef.current.invoices.find((i) => i.id === input.invoiceId);
      if (!invoice) {
        toast.error("Invoice not found");
        return "";
      }
      // Common-case concurrency guard (the DB guard is authoritative).
      const existing = refundsForInvoice(stateRef.current.invoiceRefunds, invoice.id);
      const elig = refundEligibility(invoice, existing);
      if (!elig.eligible) {
        toast.error("Refund not allowed", {
          description: "This invoice is not eligible for a monetary refund.",
        });
        return "";
      }
      const remaining = remainingRefundable(invoice, existing);
      if (input.refundAmount <= 0 || input.refundAmount > remaining + INVOICE_REFUNDS_PAISA) {
        toast.error("Refund exceeds balance", {
          description: `The maximum refundable amount is ₹${remaining.toLocaleString("en-IN")}.`,
        });
        return "";
      }

      const status: InvoiceRefund["status"] = input.gateway ? "pending" : "succeeded";
      const localId = `rf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const refund: InvoiceRefund = {
        id: localId,
        branchId: invoice.branchId ?? null,
        invoiceId: invoice.id,
        invoiceReference: invoice.reference || invoice.id,
        customerId: invoice.customerId,
        customerName: invoice.customer,
        ticketId: invoice.ticketId ?? invoice.sourceTicketId,
        scope: input.scope,
        refundKind: input.refundKind,
        refundNet: input.refundNet,
        refundTax: input.refundTax,
        refundDiscount: input.refundDiscount ?? 0,
        refundAmount: input.refundAmount,
        reasonCode: input.reasonCode,
        reasonComment: input.reasonComment,
        method: input.method,
        reference: input.reference,
        customerNote: input.customerNote,
        internalRemark: input.internalRemark,
        status,
      };

      if (shouldUseDb()) {
        // The DB `invoice_refunds.id` is a uuid with a gen_random_uuid()
        // default. Our client-side `rf_…` id is NOT a valid uuid, so we MUST
        // omit it and let Postgres mint the real id (sending it fails with
        // "invalid input syntax for type uuid" and the refund never saves).
        const { id: _omitClientId, ...refundRow } = invoiceRefundToRow(refund);
        // organization_id is NOT NULL on invoice_refunds. The before-insert
        // guard feeds it straight into next_refund_id(new.organization_id), so a
        // NULL org fails with "refund_sequences organization_id null". Resolve it
        // from the invoice's own org (mirrors lead-deals / quotations) so the
        // insert works even on a DB where the column default isn't applied yet.
        const { data: invOrgRow } = await db
          .from("invoices")
          .select("organization_id")
          .eq("id", invoice.id)
          .maybeSingle();
        const refundOrgId = (invOrgRow as { organization_id?: string } | null)?.organization_id ?? null;
        if (refundOrgId) refundRow.organization_id = refundOrgId;
        const res = await db
          .from("invoice_refunds")
          .insert(withStore(refundRow))
          .select("*")
          .single();
        if (res.error || !res.data) {
          const msg = res.error?.message ?? "unknown";
          toast.error("Refund not saved", {
            description: /refund_exceeds_balance/.test(msg)
              ? "The refund exceeds the invoice's remaining refundable balance."
              : /refund_not_eligible/.test(msg)
                ? "This invoice is not eligible for a monetary refund."
                : /refund_.*forbidden/.test(msg)
                  ? "You are not allowed to perform this refund action."
                  : `DB error: ${msg}`,
          });
          return "";
        }
        const saved = rowToInvoiceRefund(res.data);
        // Allocations (authoritative per-line refunded breakdown).
        const allocRows = input.allocation.lines.map((l) =>
          refundAllocationToRow({
            id: "",
            refundId: saved.id,
            invoiceId: invoice.id,
            deviceId: l.deviceId,
            ticketDeviceId: l.ticketDeviceId,
            lineId: l.lineId,
            lineComponent: l.lineComponent,
            sku: l.sku,
            qty: l.qty,
            allocNet: l.allocNet,
            allocTax: l.allocTax,
            allocAmount: l.allocAmount,
          }),
        );
        if (allocRows.length > 0) {
          const alloc = await db
            .from("invoice_refund_allocations")
            .insert(allocRows.map((r) => ({ ...r, organization_id: (res.data as any).organization_id })))
            .select("*");
          if (!alloc.error && alloc.data) {
            const mapped = alloc.data.map(rowToRefundAllocation);
            setState((s) => ({ ...s, invoiceRefundAllocations: [...mapped, ...s.invoiceRefundAllocations] }));
          }
        }
        setState((s) => ({ ...s, invoiceRefunds: [saved, ...s.invoiceRefunds] }));
        stateRef.current = { ...stateRef.current, invoiceRefunds: [saved, ...stateRef.current.invoiceRefunds] };
        logActivity({ module: "Invoice", action: "Refund Processed", severity: "warning", entity: "Refund", reference: saved.refundNo || saved.id, description: `Refund of ${inr(saved.refundAmount)} on invoice ${invoice.reference || invoice.id} (${saved.reasonCode}).`, meta: { Status: saved.status, Method: saved.method } });
        // Succeeded (manual) → reverse loyalty + project the daily-ledger outflow.
        if (saved.status === "succeeded") {
          await reverseLoyaltyForRefund(saved.id, saved.customerId, saved.refundAmount, -1);
          projectRefundToDailyLedger(saved.refundNo || saved.id, saved.refundAmount, saved.method, "outflow", saved.processedByName || saved.initiatedByName || "system");
        }
        return saved.refundNo || saved.id;
      }

      // local/demo mode
      const refundNo = `CN-${String(stateRef.current.invoiceRefunds.length + 1).padStart(4, "0")}`;
      const localRefund: InvoiceRefund = { ...refund, refundNo, initiatedAt: new Date().toISOString() };
      const localAllocs: InvoiceRefundAllocation[] = input.allocation.lines.map((l, i) => ({
        id: `${localId}_a${i}`,
        refundId: localId,
        invoiceId: invoice.id,
        deviceId: l.deviceId,
        ticketDeviceId: l.ticketDeviceId,
        lineId: l.lineId,
        lineComponent: l.lineComponent,
        sku: l.sku,
        qty: l.qty,
        allocNet: l.allocNet,
        allocTax: l.allocTax,
        allocAmount: l.allocAmount,
      }));
      setState((s) => ({
        ...s,
        invoiceRefunds: [localRefund, ...s.invoiceRefunds],
        invoiceRefundAllocations: [...localAllocs, ...s.invoiceRefundAllocations],
      }));
      stateRef.current = { ...stateRef.current, invoiceRefunds: [localRefund, ...stateRef.current.invoiceRefunds] };
      logActivity({ module: "Invoice", action: "Refund Processed", severity: "warning", entity: "Refund", reference: refundNo, description: `Refund of ${inr(localRefund.refundAmount)} on invoice ${invoice.reference || invoice.id} (${localRefund.reasonCode}).`, meta: { Status: localRefund.status, Method: localRefund.method } });
      if (localRefund.status === "succeeded") {
        await reverseLoyaltyForRefund(localId, localRefund.customerId, localRefund.refundAmount, -1);
        projectRefundToDailyLedger(refundNo, localRefund.refundAmount, localRefund.method, "outflow", "system");
      }
      return refundNo;
    },
    [shouldUseDb, db, withStore, reverseLoyaltyForRefund, projectRefundToDailyLedger],
  );

  const settleRefund = useCallback(
    async (refundId: string, update: { status: "succeeded" | "failed"; reference?: string }) => {
      const refund = stateRef.current.invoiceRefunds.find((r) => r.id === refundId);
      if (!refund) return;
      if (shouldUseDb()) {
        const { data, error } = await db
          .from("invoice_refunds")
          .update({ status: update.status, reference: update.reference ?? refund.reference ?? null })
          .eq("id", refundId)
          .select("*")
          .single();
        if (error || !data) {
          toast.error("Refund not settled", { description: error?.message ?? "unknown" });
          return;
        }
        const saved = rowToInvoiceRefund(data);
        setState((s) => ({ ...s, invoiceRefunds: s.invoiceRefunds.map((r) => (r.id === refundId ? saved : r)) }));
        stateRef.current = { ...stateRef.current, invoiceRefunds: stateRef.current.invoiceRefunds.map((r) => (r.id === refundId ? saved : r)) };
        if (saved.status === "succeeded") {
          await reverseLoyaltyForRefund(saved.id, saved.customerId, saved.refundAmount, -1);
          projectRefundToDailyLedger(saved.refundNo || saved.id, saved.refundAmount, saved.method, "outflow", saved.processedByName || saved.initiatedByName || "system");
        }
        logActivity({ module: "Invoice", action: "Refund Settled", severity: saved.status === "succeeded" ? "warning" : "info", entity: "Refund", reference: saved.refundNo || saved.id, description: `Refund ${saved.refundNo || saved.id} settled: ${saved.status}.`, meta: { Status: saved.status } });
        return;
      }
      const next: InvoiceRefund = { ...refund, status: update.status, reference: update.reference ?? refund.reference };
      setState((s) => ({ ...s, invoiceRefunds: s.invoiceRefunds.map((r) => (r.id === refundId ? next : r)) }));
      stateRef.current = { ...stateRef.current, invoiceRefunds: stateRef.current.invoiceRefunds.map((r) => (r.id === refundId ? next : r)) };
      if (next.status === "succeeded") {
        await reverseLoyaltyForRefund(next.id, next.customerId, next.refundAmount, -1);
        projectRefundToDailyLedger(next.refundNo || next.id, next.refundAmount, next.method, "outflow", "system");
      }
    },
    [shouldUseDb, db, reverseLoyaltyForRefund, projectRefundToDailyLedger],
  );

  const reverseRefund = useCallback(
    async (refundId: string, reason: string) => {
      const refund = stateRef.current.invoiceRefunds.find((r) => r.id === refundId);
      if (!refund) return;
      const wasSucceeded = refund.status === "succeeded";
      if (shouldUseDb()) {
        const { data, error } = await db
          .from("invoice_refunds")
          .update({ status: "reversed", reversal_reason: reason })
          .eq("id", refundId)
          .select("*")
          .single();
        if (error || !data) {
          toast.error("Refund not reversed", {
            description: /forbidden/.test(error?.message ?? "") ? "You are not allowed to reverse refunds." : (error?.message ?? "unknown"),
          });
          return;
        }
        const saved = rowToInvoiceRefund(data);
        setState((s) => ({ ...s, invoiceRefunds: s.invoiceRefunds.map((r) => (r.id === refundId ? saved : r)) }));
        stateRef.current = { ...stateRef.current, invoiceRefunds: stateRef.current.invoiceRefunds.map((r) => (r.id === refundId ? saved : r)) };
        // Re-reverse loyalty once (restore points) + inverse ledger correction.
        // The physical return link is RETAINED; stock is NOT auto-touched.
        if (wasSucceeded) {
          await reverseLoyaltyForRefund(saved.id, saved.customerId, saved.refundAmount, 1);
          projectRefundToDailyLedger(saved.refundNo || saved.id, saved.refundAmount, saved.method, "inflow", saved.reversedBy || saved.initiatedByName || "system");
        }
        logActivity({ module: "Invoice", action: "Refund Reversed", severity: "critical", entity: "Refund", reference: saved.refundNo || saved.id, description: `Refund ${saved.refundNo || saved.id} reversed: ${reason}.`, meta: { Amount: inr(saved.refundAmount) } });
        return;
      }
      const next: InvoiceRefund = { ...refund, status: "reversed", reversalReason: reason, reversedAt: new Date().toISOString() };
      setState((s) => ({ ...s, invoiceRefunds: s.invoiceRefunds.map((r) => (r.id === refundId ? next : r)) }));
      stateRef.current = { ...stateRef.current, invoiceRefunds: stateRef.current.invoiceRefunds.map((r) => (r.id === refundId ? next : r)) };
      if (wasSucceeded) {
        await reverseLoyaltyForRefund(next.id, next.customerId, next.refundAmount, 1);
        projectRefundToDailyLedger(next.refundNo || next.id, next.refundAmount, next.method, "inflow", "system");
      }
    },
    [shouldUseDb, db, reverseLoyaltyForRefund, projectRefundToDailyLedger],
  );

  const recordItemReturn = useCallback(
    async (input: RecordItemReturnInput): Promise<string> => {
      const localId = `ret_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const ret: InvoiceItemReturn = {
        id: localId,
        branchId: input.branchId ?? activeStoreIdRef.current ?? null,
        invoiceId: input.invoiceId,
        deviceId: input.deviceId,
        lineId: input.lineId,
        sku: input.sku,
        itemName: input.itemName,
        refundId: input.refundId,
        returned: true,
        returnQty: input.returnQty,
        condition: input.condition,
        disposition: input.disposition,
        dispositionStatus: "pending",
        unitCost: input.unitCost,
        receivingStore: input.receivingStore,
        inspectionNotes: input.inspectionNotes,
      };
      if (shouldUseDb()) {
        // `invoice_item_returns.id` is a uuid (gen_random_uuid default); our
        // client `ret_…` id is not a valid uuid, so omit it and let the DB mint
        // the real id (otherwise the insert fails on an invalid-uuid error).
        const { id: _omitClientId, ...returnRow } = itemReturnToRow(ret);
        // organization_id is NOT NULL and is fed into next_item_return_id by the
        // guard — resolve it from the invoice's org so the insert works even on a
        // DB where the column default isn't applied yet (see next_refund_id).
        const { data: retOrgRow } = await db
          .from("invoices")
          .select("organization_id")
          .eq("id", input.invoiceId)
          .maybeSingle();
        const returnOrgId = (retOrgRow as { organization_id?: string } | null)?.organization_id ?? null;
        if (returnOrgId) returnRow.organization_id = returnOrgId;
        const res = await db
          .from("invoice_item_returns")
          .insert(withStore(returnRow))
          .select("*")
          .single();
        if (res.error || !res.data) {
          toast.error("Return not recorded", {
            description: /return_exceeds_qty/.test(res.error?.message ?? "")
              ? "The returned quantity exceeds the invoiced quantity minus prior returns."
              : /forbidden/.test(res.error?.message ?? "")
                ? "You are not allowed to record customer returns."
                : (res.error?.message ?? "unknown"),
          });
          return "";
        }
        const saved = rowToItemReturn(res.data);
        setState((s) => ({ ...s, invoiceItemReturns: [saved, ...s.invoiceItemReturns] }));
        stateRef.current = { ...stateRef.current, invoiceItemReturns: [saved, ...stateRef.current.invoiceItemReturns] };
        logActivity({ module: "Inventory", action: "Customer Return Received", severity: "info", entity: "Item Return", reference: saved.returnNo || saved.id, description: `Received return of ${saved.returnQty} × ${saved.itemName || saved.sku || "item"} (${saved.disposition}).` });
        return saved.returnNo || saved.id;
      }
      const returnNo = `RET-${String(stateRef.current.invoiceItemReturns.length + 1).padStart(4, "0")}`;
      const local: InvoiceItemReturn = { ...ret, returnNo, receivedAt: new Date().toISOString() };
      setState((s) => ({ ...s, invoiceItemReturns: [local, ...s.invoiceItemReturns] }));
      stateRef.current = { ...stateRef.current, invoiceItemReturns: [local, ...stateRef.current.invoiceItemReturns] };
      logActivity({ module: "Inventory", action: "Customer Return Received", severity: "info", entity: "Item Return", reference: returnNo, description: `Received return of ${local.returnQty} × ${local.itemName || local.sku || "item"} (${local.disposition}).` });
      return returnNo;
    },
    [shouldUseDb, db, withStore],
  );

  const restockItemReturn = useCallback(
    async (returnId: string) => {
      const ret = stateRef.current.invoiceItemReturns.find((r) => r.id === returnId);
      if (!ret) return;
      if (ret.disposition !== "restock") {
        toast.error("Not restockable", { description: "Only a restock-disposition return can increase saleable stock." });
        return;
      }
      if (ret.dispositionStatus === "completed") {
        toast.error("Already restocked", { description: "This return has already been restocked." });
        return;
      }
      if (shouldUseDb()) {
        // Atomic DB function: Return movement + current_stock bump + completion.
        const { error } = await db.rpc("restock_item_return", { p_return_id: returnId });
        if (error) {
          toast.error("Restock failed", {
            description: /forbidden/.test(error.message)
              ? "You are not allowed to restock returned items."
              : error.message,
          });
          return;
        }
        // Refresh the return + inventory item from the DB (realtime also echoes).
        const { data: refreshed } = await db.from("invoice_item_returns").select("*").eq("id", returnId).single();
        if (refreshed) {
          const saved = rowToItemReturn(refreshed);
          setState((s) => ({ ...s, invoiceItemReturns: s.invoiceItemReturns.map((r) => (r.id === returnId ? saved : r)) }));
          if (saved.sku) {
            const { data: item } = await db.from("inventory_items").select("*").eq("id", saved.sku).single();
            if (item) {
              const mapped = rowToInventoryItem(item);
              setState((s) => ({ ...s, inventory: s.inventory.map((i) => (i.id === mapped.id ? mapped : i)) }));
            }
          }
        }
        logActivity({ module: "Inventory", action: "Stock Increased", severity: "success", entity: "Item Return", reference: ret.returnNo || ret.id, description: `Restocked ${ret.returnQty} × ${ret.itemName || ret.sku || "item"} (Customer Return, at cost).` });
        return;
      }
      // local/demo: emulate the atomic restock.
      const docNo = `RET-${String(stateRef.current.invoiceItemReturns.length + 1).padStart(4, "0")}`;
      setState((s) => ({
        ...s,
        invoiceItemReturns: s.invoiceItemReturns.map((r) =>
          r.id === returnId ? { ...r, dispositionStatus: "completed" as const, stockMovementRef: docNo, restockedAt: new Date().toISOString() } : r,
        ),
        inventory: ret.sku
          ? s.inventory.map((i) => (i.id === ret.sku ? { ...i, currentStock: (i.currentStock ?? 0) + ret.returnQty } : i))
          : s.inventory,
      }));
      logActivity({ module: "Inventory", action: "Stock Increased", severity: "success", entity: "Item Return", reference: ret.returnNo || ret.id, description: `Restocked ${ret.returnQty} × ${ret.itemName || ret.sku || "item"} (Customer Return, at cost).` });
    },
    [shouldUseDb, db],
  );

  /* ── Walk-In actions (DB-first) ── */
  const addWalkIn = useCallback(async (walkIn: WalkIn) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("walk_ins").insert(withStore(walkInToRow(walkIn))).select("*").single();
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
    // Merge first so the notes envelope is re-encoded from the full record.
    const merged: WalkIn | undefined = prev ? { ...prev, ...updates } : undefined;
    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("customer" in updates) row.customer = updates.customer ?? null;
      if ("phone" in updates) row.phone = updates.phone ?? null;
      if ("source" in updates) row.source = updates.source ?? null;
      if ("category" in updates) row.category = updates.category ?? null;
      if ("model" in updates) row.model = updates.model ?? null;
      if ("status" in updates) row.status = updates.status;
      if ("contactId" in updates) row.contact_id = updates.contactId ?? null;
      if ("customerId" in updates) row.customer_id = updates.customerId ?? null;
      if ("ticketId" in updates || "linkedTicketId" in updates) {
        row.ticket_id = updates.linkedTicketId ?? updates.ticketId ?? null;
      }
      if ("invoiceValue" in updates) row.invoice_value = updates.invoiceValue ?? 0;
      if ("businessValue" in updates) row.business_value = updates.businessValue ?? 0;
      if ("reasons" in updates) row.reasons = updates.reasons ?? [];
      // Any change to a notes-envelope field (or notes itself) re-encodes notes.
      const envelopeKeys = ["notes", "walkInNumber", "type", "issue", "email", "salesPersonId", "salesPersonName", "contactId", "customerId", "modelId", "pinnedAt", "convertedAt", "followUpDate", "followUpTime", "followUpStatus", "followUpReadAt", "customerComments", "followUpAttempt", "followUpComments", "followUpHistory", "devices"];
      if (merged && envelopeKeys.some((k) => k in updates)) {
        row.notes = encodeWalkInNotes(merged);
      }
      const { error } = await db.from("walk_ins").update(row).eq("id", id);
      if (error) { console.error("[store] updateWalkIn failed:", error.message); return; }
    }
    setState((s) => ({ ...s, walkIns: s.walkIns.map((w) => (w.id === id ? { ...w, ...updates } : w)) }));
    const newTicket = updates.linkedTicketId ?? updates.ticketId;
    const converted = "status" in updates && updates.status === "converted_ticket" && updates.status !== prev?.status;
    logActivity({ module: "Walk-In", action: converted ? "Walk-In Converted" : "Walk-In Updated", severity: "info", entity: "Walk-In", reference: id, description: converted ? `Converted walk-in ${id}${newTicket ? ` to ticket ${newTicket}` : ""}.` : `Updated walk-in ${id}${prev ? ` (${prev.customer})` : ""}.`, ...(newTicket ? { meta: { "New Ticket": newTicket } } : {}) });
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

  const pinWalkIn = useCallback(async (id: string, pinned: boolean) => {
    const pinnedAt = pinned ? new Date().toISOString() : undefined;
    // Optimistic local update first (mirrors pinTicket/pinInvoice).
    const prev = stateRef.current.walkIns.find((w) => w.id === id);
    setState((s) => ({ ...s, walkIns: s.walkIns.map((w) => (w.id === id ? { ...w, pinnedAt } : w)) }));
    // Persist through the notes envelope (pinned_at has no dedicated column
    // until the optional migration is applied — encodeWalkInNotes handles it).
    if (shouldUseDb() && prev) {
      const row: Record<string, unknown> = { notes: encodeWalkInNotes({ ...prev, pinnedAt }) };
      const { error } = await db.from("walk_ins").update(row).eq("id", id);
      if (error) console.error("[store] pinWalkIn failed:", error.message);
    }
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
        await db.from("stock_movements").insert(withStore(stockMovementToRow({
          docNumber: `MOV-TC-${Date.now()}-${i}`, fromStore: "Main Store", toStore: `Ticket ${ticketId}`,
          items: part.qty, date: new Date().toLocaleDateString("en-IN"), user: preTicket.technician, type: "Outward", status: "completed",
        })));
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

  const addStockMovement = useCallback(async (movement: StockMovement, opts?: { itemId?: string; unitCost?: number }) => {
    if (shouldUseDb()) {
      // Purchase / Stock-In (FR-13 / review finding #9): an INWARD movement that
      // carries an item + a receipt unit cost is a COST-CARRYING receipt. It is
      // posted through the atomic post_stock_receipt RPC, which writes the
      // cost-gated inventory_stock_layers layer (source='purchase', qty_remaining
      // = qty), the Inward quantity movement, and raises the master balance in
      // ONE transaction — so Purchase/Stock-In is valued like opening stock, not
      // just opening. The cost dimension never touches the broadly-readable
      // movement row (SYS-1). Non-Inward movements (Transfer/Outward/Adjustment)
      // and Inward movements without a cost keep the plain movement insert.
      if (movement.type === "Inward" && opts?.itemId && opts.unitCost !== undefined) {
        const { error: rErr } = await db.rpc("post_stock_receipt", {
          p_item_id: opts.itemId,
          p_qty: movement.items,
          p_unit_cost: opts.unitCost,
          p_source: "purchase",
        });
        if (rErr) { console.error("[store] addStockMovement receipt failed:", rErr.message); return; }
        setState((s) => ({ ...s, stockMovements: [movement, ...s.stockMovements] }));
        logActivity({ module: "Inventory", action: "Stock Increased", severity: "success", entity: "Stock Movement", reference: movement.docNumber, description: `Inward (purchase) movement of ${movement.items} item${movement.items !== 1 ? "s" : ""}: ${movement.fromStore} → ${movement.toStore}.` });
        return;
      }
      const row = stockMovementToRow(movement);
      // Tie the movement to its item for traceability. The COST dimension is
      // NEVER written on the broadly-readable movement row (SYS-1 / finding #2):
      // the stock_movements SELECT policy admits non-cost roles, so cost lives
      // ONLY on the cost-gated inventory_stock_layers ledger.
      if (opts?.itemId !== undefined) row.item_id = opts.itemId;
      const { error } = await db.from("stock_movements").insert(withStore(row));
      if (error) { console.error("[store] addStockMovement failed:", error.message); return; }
    }
    setState((s) => ({ ...s, stockMovements: [movement, ...s.stockMovements] }));
    const inward = movement.type === "Inward";
    logActivity({ module: "Inventory", action: inward ? "Stock Increased" : "Stock Reduced", severity: inward ? "success" : "warning", entity: "Stock Movement", reference: movement.docNumber, description: `${movement.type} movement of ${movement.items} item${movement.items !== 1 ? "s" : ""}: ${movement.fromStore} → ${movement.toStore}.` });
  }, []);

  const addInventoryItem = useCallback(async (
    item: InventoryItem,
    opts?: {
      cost?: { costPrice: number; standardLabourCost: number; configured: boolean };
      opening?: { qty: number; unitCost: number };
    },
  ) => {
    const kind: ItemKind = item.kind ?? (item.type === "Service" ? "service" : "part");
    const opening = kind === "part" && opts?.opening && opts.opening.qty > 0 ? opts.opening : undefined;
    if (shouldUseDb()) {
      // Stock never flows through the master row on create — opening (if any)
      // is posted as an explicit movement + ledger layer below (§4).
      const insertRow = withStore(inventoryItemToRow({ ...item, kind, currentStock: 0 }));
      const { data, error } = await db.from("inventory_items").insert(insertRow).select("*").single();
      if (error || !data) { console.error("[store] addInventoryItem failed:", error?.message); return; }
      let saved = rowToInventoryItem(data);

      // Cost side-channel → cost-scoped table. Written org-level (branch_id null)
      // so every cost-capable org member resolves the default (MEDIUM-2). RLS
      // rejects the write for a non-cost caller, so this is a no-op for them.
      if (opts?.cost) {
        const { error: costErr } = await db.from("inventory_item_costs").upsert({
          item_id: saved.id,
          branch_id: null,
          cost_price: opts.cost.costPrice,
          standard_labour_cost: opts.cost.standardLabourCost,
          cost_configured: opts.cost.configured,
          updated_at: new Date().toISOString(),
        });
        if (costErr) { console.error("[store] addInventoryItem cost upsert failed:", costErr.message); }
        else if (opts.cost.configured) {
          saved = { ...saved, costPrice: opts.cost.costPrice, standardLabourCost: opts.cost.standardLabourCost, costState: "configured" };
        }
      }

      // Opening stock → ONE atomic, fail-closed RPC (SYS-9) that creates the
      // cost-carrying ledger layer, the Inward movement AND sets current_stock
      // as a single transaction, so master quantity / layer / movement can never
      // diverge. Services never reach here (opening guarded above). On failure
      // we leave current_stock at 0 (the item exists but carries no opening) and
      // surface the error rather than half-committing.
      if (opening) {
        const { error: openErr } = await db.rpc("post_opening_stock", {
          p_item_id: saved.id,
          p_qty: opening.qty,
          p_unit_cost: opening.unitCost,
        });
        if (openErr) {
          console.error("[store] addInventoryItem opening stock (atomic) failed:", openErr.message);
        } else {
          saved = { ...saved, currentStock: opening.qty };
        }
      }

      setState((s) => ({ ...s, inventory: [saved, ...s.inventory] }));
      logActivity({ module: "Inventory", action: "Item Added", severity: "success", entity: "Item", reference: saved.id, description: `Added new inventory item: ${saved.name}.`, meta: { Category: saved.category, Stock: String(saved.currentStock) } });
      return;
    }
    // Local/demo mode: no DB. Mirror the cost + opening onto the in-memory item.
    const localItem: InventoryItem = {
      ...item,
      kind,
      currentStock: opening ? opening.qty : 0,
      ...(opts?.cost?.configured
        ? { costPrice: opts.cost.costPrice, standardLabourCost: opts.cost.standardLabourCost, costState: "configured" as const }
        : {}),
    };
    setState((s) => ({ ...s, inventory: [localItem, ...s.inventory] }));
    logActivity({ module: "Inventory", action: "Item Added", severity: "success", entity: "Item", reference: localItem.id, description: `Added new inventory item: ${localItem.name}.`, meta: { Category: localItem.category, Stock: String(localItem.currentStock) } });
  }, [addStockMovement]);

  const updateInventoryItem = useCallback(async (
    id: string,
    updates: Partial<InventoryItem>,
    opts?: { cost?: { costPrice: number; standardLabourCost: number; configured: boolean } },
  ) => {
    const prev = stateRef.current.inventory.find((i) => i.id === id);
    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("name" in updates) row.name = updates.name;
      if ("category" in updates) row.category = updates.category ?? null;
      if ("kind" in updates && updates.kind) { row.item_kind = updates.kind; row.item_type = updates.kind === "service" ? "Service" : "Product"; }
      else if ("type" in updates) row.item_type = updates.type;
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
      // New public columns (never cost_price / standard_labour_cost here).
      if ("sellingPrice" in updates) row.selling_price = updates.sellingPrice;
      if ("serviceCharge" in updates) row.service_charge = updates.serviceCharge;
      if ("trackStock" in updates) row.track_stock = updates.trackStock;
      if ("barcode" in updates) row.barcode = updates.barcode || null;
      if ("brandModel" in updates) row.brand_model = updates.brandModel || null;
      if ("vendor" in updates) row.vendor = updates.vendor || null;
      if ("description" in updates) row.description = updates.description || null;
      if ("migrationFlag" in updates) row.migration_flag = updates.migrationFlag ?? null;
      if (Object.keys(row).length > 0) {
        const { error } = await db.from("inventory_items").update(row).eq("id", id);
        if (error) { console.error("[store] updateInventoryItem failed:", error.message); return; }
      }
      // Cost side-channel → cost-scoped table (org-level default, branch_id null).
      // RLS rejects the write for a non-cost caller, so this is a no-op for them.
      if (opts?.cost) {
        const { error: costErr } = await db.from("inventory_item_costs").upsert({
          item_id: id,
          branch_id: null,
          cost_price: opts.cost.costPrice,
          standard_labour_cost: opts.cost.standardLabourCost,
          cost_configured: opts.cost.configured,
          updated_at: new Date().toISOString(),
        });
        if (costErr) { console.error("[store] updateInventoryItem cost upsert failed:", costErr.message); }
      }
    }
    const localCost = opts?.cost?.configured
      ? { costPrice: opts.cost.costPrice, standardLabourCost: opts.cost.standardLabourCost, costState: "configured" as const }
      : {};
    setState((s) => ({ ...s, inventory: s.inventory.map((i) => (i.id === id ? { ...i, ...updates, ...localCost } : i)) }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "currentStock", label: "Stock" }, { key: "name", label: "Name" }, { key: "defaultPrice", label: "Default Price", format: inr }, { key: "regularSellingPrice", label: "Selling Price", format: inr },
    ]);
    let action = "Item Edited"; let severity: ActivitySeverity = "info";
    if ("currentStock" in updates && prev && updates.currentStock !== prev.currentStock) { const inc = (updates.currentStock ?? 0) > prev.currentStock; action = inc ? "Stock Increased" : "Stock Reduced"; severity = inc ? "success" : "warning"; }
    logActivity({ module: "Inventory", action, severity, entity: "Item", reference: id, description: `Updated inventory item ${prev?.name || id}.`, changes });
  }, []);

  /**
   * SYS-6 — the DEDICATED, verified, audited path that clears a legacy
   * `migration_flag`. An ordinary edit never clears the flag; this action does,
   * and ONLY after actually resolving the contradiction:
   *   • service_with_stock → zero the stray current_stock / min / max that
   *     contradicted "a service has no stock", THEN clear the flag.
   *   • unrecognised_item_type → the row now carries a valid item_kind, so
   *     clearing the flag is the reconciliation.
   * The resolution + flag clear are written together and audited, so the review
   * marker is never cleared while its contradiction still stands.
   */
  const reconcileMigrationFlag = useCallback(async (id: string) => {
    const prev = stateRef.current.inventory.find((i) => i.id === id);
    if (!prev || !prev.migrationFlag) return;
    const wasServiceWithStock = prev.migrationFlag === "service_with_stock";
    const patch: Record<string, unknown> = { migration_flag: null };
    if (wasServiceWithStock) {
      patch.current_stock = 0;
      patch.min_stock = 0;
      patch.max_stock = 0;
    }
    if (shouldUseDb()) {
      const { error } = await db.from("inventory_items").update(patch).eq("id", id);
      if (error) { console.error("[store] reconcileMigrationFlag failed:", error.message); toast.error("Could not mark reviewed", { description: error.message }); return; }
    }
    setState((s) => ({
      ...s,
      inventory: s.inventory.map((i) =>
        i.id === id
          ? { ...i, migrationFlag: undefined, ...(wasServiceWithStock ? { currentStock: 0, minStock: 0, maxStock: 0 } : {}) }
          : i,
      ),
    }));
    logActivity({
      module: "Inventory", action: "Migration Reviewed", severity: "info", entity: "Item", reference: id,
      description: `Resolved legacy review flag "${prev.migrationFlag}" on ${prev.name || id}.`,
      meta: wasServiceWithStock ? { "Stray stock cleared": String(prev.currentStock) } : undefined,
    });
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
      let row = customerToRow(customer);
      let res = await db.from("customers").insert(row).select("*").single();
      // Self-heal: strip unknown columns for un-migrated schemas.
      let heal = 0;
      while (res.error && isUndefinedColumnError(res.error) && heal < 4) {
        heal += 1;
        const col = extractMissingColumn(res.error);
        row = omitKeys(row, col ? [col] : ["source", "group_ids"]);
        res = await db.from("customers").insert(row).select("*").single();
      }
      if (res.error || !res.data) { console.error("[store] addCustomer failed:", res.error?.message); return; }
      const saved = rowToCustomer(res.data);
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
      if ("altMobile" in updates) row.alt_mobile = updates.altMobile ?? null;
      if ("email" in updates) row.email = updates.email ?? null;
      if ("company" in updates) row.company = updates.company ?? null;
      if ("gstNumber" in updates) row.gst_number = updates.gstNumber ?? null;
      if ("address" in updates) row.address = updates.address ?? null;
      if ("city" in updates) row.city = updates.city ?? null;
      if ("state" in updates) row.state = updates.state ?? null;
      if ("postalCode" in updates) row.postal_code = updates.postalCode ?? null;
      if ("notes" in updates) row.notes = updates.notes ?? null;
      if ("type" in updates) row.type = updates.type;
      if ("source" in updates) row.source = updates.source ?? null;
      if ("groupIds" in updates) row.group_ids = updates.groupIds ?? [];
      if ("companyId" in updates) row.company_id = updates.companyId ?? null;
      if ("status" in updates) row.status = updates.status;
      if ("totalTickets" in updates) row.total_tickets = updates.totalTickets;
      if ("totalInvoices" in updates) row.total_invoices = updates.totalInvoices;
      if ("totalRepairs" in updates) row.total_repairs = updates.totalRepairs;
      if ("lifetimeValue" in updates) row.lifetime_value = updates.lifetimeValue;
      if ("lastVisit" in updates) row.last_visit = updates.lastVisit ?? null;
      let currentRow = row;
      let { error } = await db.from("customers").update(currentRow).eq("id", id);
      // Self-heal: drop unknown columns (e.g. source/group_ids on un-migrated
      // schemas) and retry so the rest of the update still persists.
      let heal = 0;
      while (error && isUndefinedColumnError(error) && Object.keys(currentRow).length > 0 && heal < 4) {
        heal += 1;
        const col = extractMissingColumn(error);
        currentRow = omitKeys(currentRow, col ? [col] : ["source", "group_ids"]);
        if (Object.keys(currentRow).length === 0) break;
        const retry = await db.from("customers").update(currentRow).eq("id", id);
        error = retry.error;
      }
      if (error && !isUndefinedColumnError(error)) { console.error("[store] updateCustomer failed:", error.message); return; }
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

  /**
   * Merge a duplicate customer into a primary/canonical record.
   *
   * Reassigns every reference this store owns from `secondaryId` →
   * `primaryId`, unions loyalty points + group memberships, then archives
   * (soft-deletes) the secondary record. Does NOT delete or lose data —
   * everything is reassigned, nothing is dropped.
   *
   * SCOPE: covers the tables this store owns directly — tickets, invoices,
   * walk_ins, loyalty_accounts/loyalty_transactions. Field Jobs (field-context.tsx)
   * and Leads (leads-context.tsx) live in separate React contexts and are
   * NOT reassigned by this function — merging those requires calling their
   * own update functions with the same primaryId/secondaryId pair from a
   * component that has access to both contexts (see the merge UI in
   * Settings → Customers → Manage, which calls this plus the Leads-side
   * reassignment in the same action).
   *
   * Not atomic across tables (no cross-table DB transaction from the
   * client) — if a step fails partway, already-reassigned records stay
   * reassigned and the function returns an error listing what succeeded.
   * This mirrors every other multi-step write in this file (e.g.
   * addInvoice's ticket-sync step) rather than attempting a client-side
   * two-phase commit.
   */
  const mergeCustomersAction = useCallback(async (
    primaryId: string,
    secondaryId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!primaryId || !secondaryId) return { success: false, error: "Both customer IDs are required." };
    if (primaryId === secondaryId) return { success: false, error: "Cannot merge a customer with itself." };

    const primary = stateRef.current.customers.find((c) => c.id === primaryId);
    const secondary = stateRef.current.customers.find((c) => c.id === secondaryId);
    if (!primary) return { success: false, error: "Primary customer not found." };
    if (!secondary) return { success: false, error: "Secondary customer not found." };

    const failures: string[] = [];

    if (shouldUseDb()) {
      // Tickets, invoices: real customer_id column — bulk reassign in one
      // statement each.
      const { error: tErr } = await db.from("tickets").update({ customer_id: primaryId }).eq("customer_id", secondaryId);
      if (tErr) failures.push(`tickets: ${tErr.message}`);
      const { error: iErr } = await db.from("invoices").update({ customer_id: primaryId }).eq("customer_id", secondaryId);
      if (iErr) failures.push(`invoices: ${iErr.message}`);
      // loyalty_transactions: real customer_id column too — reassign the
      // ledger rows themselves so history is preserved under the primary.
      const { error: lErr } = await db.from("loyalty_transactions").update({ customer_id: primaryId }).eq("customer_id", secondaryId);
      if (lErr) failures.push(`loyalty_transactions: ${lErr.message}`);
    }
    // Local state mirror for tickets/invoices (kept in sync regardless of
    // shouldUseDb(), matching every other action's local+DB dual write).
    setState((s) => ({
      ...s,
      tickets: s.tickets.map((t) => (t.customerId === secondaryId ? { ...t, customerId: primaryId } : t)),
      invoices: s.invoices.map((i) => (i.customerId === secondaryId ? { ...i, customerId: primaryId } : i)),
    }));

    // walk_ins: customerId lives inside the notes JSONB envelope, not a real
    // column — must go through updateWalkIn() per-record so it's correctly
    // re-encoded, rather than a raw SQL UPDATE.
    const affectedWalkIns = stateRef.current.walkIns.filter((w) => w.customerId === secondaryId);
    for (const w of affectedWalkIns) {
      try {
        await updateWalkIn(w.id, { customerId: primaryId });
      } catch (e) {
        failures.push(`walk_in ${w.id}: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    // Loyalty: sum the two accounts' point balances onto the primary, then
    // remove the secondary's account (its transactions were already
    // reassigned above, so history isn't lost — only the now-redundant
    // balance row goes away).
    if (shouldUseDb()) {
      const { data: accounts } = await db.from("loyalty_accounts").select("customer_id, points_balance").in("customer_id", [primaryId, secondaryId]);
      const primaryBalance = accounts?.find((a: any) => a.customer_id === primaryId)?.points_balance ?? 0;
      const secondaryBalance = accounts?.find((a: any) => a.customer_id === secondaryId)?.points_balance ?? 0;
      if (secondaryBalance > 0 || primaryBalance > 0) {
        const mergedBalance = primaryBalance + secondaryBalance;
        const mergedTier = tierForLifetimeValue(mergedBalance, await readLoyaltyThresholds());
        const { error: upErr } = await db.from("loyalty_accounts").upsert({
          customer_id: primaryId, points_balance: mergedBalance, tier: mergedTier, last_transaction_at: new Date().toISOString(),
        });
        if (upErr) failures.push(`loyalty_accounts: ${upErr.message}`);
      }
      const { error: delAcctErr } = await db.from("loyalty_accounts").delete().eq("customer_id", secondaryId);
      if (delAcctErr && !isUndefinedColumnError(delAcctErr)) failures.push(`loyalty_accounts cleanup: ${delAcctErr.message}`);
    }

    // Groups: union of both customers' group memberships onto the primary.
    const mergedGroupIds = Array.from(new Set([...(primary.groupIds ?? []), ...(secondary.groupIds ?? [])]));
    await updateCustomer(primaryId, {
      groupIds: mergedGroupIds,
      totalTickets: (primary.totalTickets ?? 0) + (secondary.totalTickets ?? 0),
      totalInvoices: (primary.totalInvoices ?? 0) + (secondary.totalInvoices ?? 0),
      totalRepairs: (primary.totalRepairs ?? 0) + (secondary.totalRepairs ?? 0),
      lifetimeValue: (primary.lifetimeValue ?? 0) + (secondary.lifetimeValue ?? 0),
    });

    // Archive (soft-delete) the secondary — never hard-delete, so the audit
    // trail and any records this function's scope didn't reach (Field Jobs,
    // Leads) can still resolve the id if looked up directly.
    if (shouldUseDb()) {
      const { error: archErr } = await db.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", secondaryId);
      if (archErr) failures.push(`archive secondary: ${archErr.message}`);
    }
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== secondaryId) }));

    logActivity({
      module: "Customer", action: "Customers Merged", severity: failures.length > 0 ? "warning" : "success",
      entity: "Customer", reference: primaryId,
      description: `Merged ${secondary.fullName} (${secondaryId}) into ${primary.fullName} (${primaryId})${reason ? ` — ${reason}` : ""}.${failures.length > 0 ? ` Partial failures: ${failures.join("; ")}` : ""}`,
    });

    if (failures.length > 0) {
      toast.error("Merge completed with some errors", { description: failures.join("; ") });
      return { success: false, error: failures.join("; ") };
    }
    toast.success("Customers merged", { description: `${secondary.fullName} merged into ${primary.fullName}.` });
    return { success: true };
  }, [updateWalkIn, updateCustomer]);

  /* ── Loyalty: manual adjust (DB-first) ── */
  /**
   * Manually adjust a customer's loyalty points by `pointsDelta` (positive =
   * award, negative = deduct). Writes an immutable `adjustment` ledger row,
   * upserts the account balance + recomputes tier via `tierForLifetimeValue`,
   * and patches `loyaltyByCustomer` in local state so the Customer Master
   * reflects the change immediately without waiting for the realtime event.
   */
  const adjustLoyalty = useCallback(async (
    customerId: string,
    pointsDelta: number,
    reason: string,
  ): Promise<{ ok: boolean; points: number; tier: LoyaltyTier; error?: string }> => {
    if (!shouldUseDb()) {
      // Local / demo mode: apply optimistically against in-memory state only.
      const prev = stateRef.current.loyaltyByCustomer[customerId] ?? { points: 0, tier: "bronze" as LoyaltyTier };
      const newPoints = Math.max(0, prev.points + pointsDelta);
      const newTier = tierForLifetimeValue(newPoints);
      setState((s) => ({
        ...s,
        loyaltyByCustomer: {
          ...s.loyaltyByCustomer,
          [customerId]: { points: newPoints, tier: newTier },
        },
      }));
      return { ok: true, points: newPoints, tier: newTier };
    }

    try {
      // Resolve the admin-configured tier point structure (falls back to
      // built-in defaults) so manual adjustments land in the right tier.
      const loyaltyThresholds = await readLoyaltyThresholds();

      // 1. Read current balance.
      const { data: acct } = await db
        .from("loyalty_accounts")
        .select("points_balance")
        .eq("customer_id", customerId)
        .maybeSingle();
      const currentBalance: number = (acct as any)?.points_balance ?? 0;
      const newBalance = Math.max(0, currentBalance + pointsDelta);
      const newTier = tierForLifetimeValue(newBalance, loyaltyThresholds);

      // 2. Write the immutable ledger row.
      const txId = `LTX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 9)}`;
      const { error: txErr } = await db.from("loyalty_transactions").insert({
        id: txId,
        customer_id: customerId,
        type: "adjustment",
        points_delta: pointsDelta,
        balance_after: newBalance,
        reason: reason || "Manual adjustment",
        created_at: new Date().toISOString(),
      });
      if (txErr) {
        console.error("[store] adjustLoyalty tx insert failed:", txErr.message);
        return { ok: false, points: currentBalance, tier: tierForLifetimeValue(currentBalance, loyaltyThresholds), error: txErr.message };
      }

      // 3. Upsert the account summary.
      const { error: acctErr } = await db.from("loyalty_accounts").upsert({
        customer_id: customerId,
        points_balance: newBalance,
        tier: newTier,
        last_transaction_at: new Date().toISOString(),
      });
      if (acctErr) {
        console.error("[store] adjustLoyalty account upsert failed:", acctErr.message);
        return { ok: false, points: currentBalance, tier: tierForLifetimeValue(currentBalance, loyaltyThresholds), error: acctErr.message };
      }

      // 4. Patch local state immediately (realtime will also arrive shortly,
      //    but this makes the UI feel instant).
      setState((s) => ({
        ...s,
        loyaltyByCustomer: {
          ...s.loyaltyByCustomer,
          [customerId]: { points: newBalance, tier: newTier },
        },
      }));

      logActivity({
        module: "Customer", action: "Loyalty Adjusted", severity: "info",
        entity: "Customer", reference: customerId,
        description: `Loyalty adjusted by ${pointsDelta > 0 ? "+" : ""}${pointsDelta} pts → ${newBalance} pts (${newTier}). Reason: ${reason}`,
      });

      return { ok: true, points: newBalance, tier: newTier };
    } catch (err: any) {
      console.error("[store] adjustLoyalty unexpected error:", err);
      return { ok: false, points: 0, tier: "bronze", error: String(err?.message ?? err) };
    }
  }, []);

  /* ── Customer Group actions (DB-first) ── */
  const addCustomerGroup = useCallback(async (group: CustomerGroup) => {
    if (shouldUseDb()) {
      const { data, error } = await db.from("customer_groups").insert(customerGroupToRow(group)).select("*").single();
      if (error || !data) { console.error("[store] addCustomerGroup failed:", error?.message); return; }
      const saved = rowToCustomerGroup(data);
      setState((s) => ({ ...s, customerGroups: [...s.customerGroups, saved] }));
      logActivity({ module: "Customer", action: "Customer Group Created", severity: "success", entity: "Customer Group", reference: saved.id, description: `Created customer group ${saved.name}.` });
      return;
    }
    setState((s) => ({ ...s, customerGroups: [...s.customerGroups, group] }));
    logActivity({ module: "Customer", action: "Customer Group Created", severity: "success", entity: "Customer Group", reference: group.id, description: `Created customer group ${group.name}.` });
  }, []);

  const updateCustomerGroup = useCallback(async (id: string, updates: Partial<CustomerGroup>) => {
    const prev = stateRef.current.customerGroups.find((g) => g.id === id);
    if (shouldUseDb()) {
      const row: Record<string, unknown> = {};
      if ("name" in updates) row.name = updates.name ?? null;
      if ("description" in updates) row.description = updates.description ?? null;
      if ("color" in updates) row.color = updates.color ?? null;
      if ("displayOrder" in updates) row.display_order = updates.displayOrder ?? 0;
      if ("active" in updates) row.active = updates.active;
      const { error } = await db.from("customer_groups").update(row).eq("id", id);
      if (error) { console.error("[store] updateCustomerGroup failed:", error.message); return; }
    }
    setState((s) => ({ ...s, customerGroups: s.customerGroups.map((g) => (g.id === id ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g)) }));
    logActivity({ module: "Customer", action: "Customer Group Updated", severity: "info", entity: "Customer Group", reference: id, description: `Updated customer group ${prev?.name || id}.` });
  }, []);

  const deleteCustomerGroup = useCallback(async (id: string) => {
    const prev = stateRef.current.customerGroups.find((g) => g.id === id);
    if (shouldUseDb()) {
      const { error } = await db.from("customer_groups").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) { console.error("[store] deleteCustomerGroup failed:", error.message); return; }
    }
    // Remove the group and scrub its id from any customer's memberships (local
    // state; DB memberships are cleaned lazily since group_ids is a plain array).
    setState((s) => ({
      ...s,
      customerGroups: s.customerGroups.filter((g) => g.id !== id),
      customers: s.customers.map((c) => (c.groupIds?.includes(id) ? { ...c, groupIds: c.groupIds.filter((gid) => gid !== id) } : c)),
    }));
    logActivity({ module: "Customer", action: "Customer Group Deleted", severity: "critical", entity: "Customer Group", reference: id, description: prev ? `Deleted customer group ${prev.name}.` : `Deleted customer group ${id}.` });
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
      // Try with the category_id column (Category → Brand → Model hierarchy).
      // If the migration hasn't been applied yet, retry without it so brand
      // creation never hard-fails on an older schema.
      let saved: Brand | null = null;
      const full = await db
        .from("brands")
        .insert({ id: brand.id, name: brand.name, category_id: brand.categoryId ?? null })
        .select("*")
        .single();
      if (!full.error && full.data) {
        saved = rowToBrand(full.data);
      } else {
        const fallback = await db.from("brands").insert({ id: brand.id, name: brand.name }).select("*").single();
        if (fallback.error || !fallback.data) { console.error("[store] addBrand failed:", fallback.error?.message ?? full.error?.message); return; }
        // Preserve the intended categoryId locally even if the column is missing.
        saved = { ...rowToBrand(fallback.data), categoryId: brand.categoryId };
      }
      setState((s) => ({ ...s, brands: [...s.brands, saved!] }));
      logActivity({ module: "Price List", action: "Brand Added", severity: "success", entity: "Brand", reference: saved.name, description: `Added device brand ${saved.name}.` });
      return;
    }
    setState((s) => ({ ...s, brands: [...s.brands, brand] }));
    logActivity({ module: "Price List", action: "Brand Added", severity: "success", entity: "Brand", reference: brand.name, description: `Added device brand ${brand.name}.` });
  }, []);

  const updateBrand = useCallback(async (id: string, updates: Partial<Brand>) => {
    // Optimistic local update first so UI stays responsive.
    setState((s) => ({ ...s, brands: s.brands.map((b) => (b.id === id ? { ...b, ...updates } : b)) }));
    if (shouldUseDb()) {
      const patch: Record<string, any> = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.categoryId !== undefined) patch.category_id = updates.categoryId ?? null;
      if (updates.archived !== undefined) patch.archived = updates.archived;
      if (Object.keys(patch).length === 0) return;
      const { error } = await db.from("brands").update(patch).eq("id", id);
      if (error) {
        // Column may not exist on older schema — retry with just the name.
        if (patch.name !== undefined) {
          await db.from("brands").update({ name: patch.name }).eq("id", id).then((r) => {
            if (r.error) console.error("[store] updateBrand failed:", r.error.message);
          });
        } else {
          console.error("[store] updateBrand failed:", error.message);
        }
      }
    }
  }, []);

  const addDeviceModel = useCallback(async (model: DeviceModel) => {
    // Ensure the model carries its brand's category so it is a self-describing
    // category-scoped record even when the caller didn't pass one.
    const brandForCat = stateRef.current.brands.find((b) => b.id === model.brandId);
    const categoryId = model.categoryId ?? brandForCat?.categoryId ?? undefined;
    const model2: DeviceModel = { ...model, categoryId };
    if (shouldUseDb()) {
      // Try with category_id; retry without it on an older schema.
      let saved: DeviceModel | null = null;
      const full = await db.from("device_models").insert({ id: model2.id, brand_id: model2.brandId, name: model2.name, category_id: categoryId ?? null }).select("*").single();
      if (!full.error && full.data) {
        saved = rowToDeviceModel(full.data);
      } else {
        const fallback = await db.from("device_models").insert({ id: model2.id, brand_id: model2.brandId, name: model2.name }).select("*").single();
        if (fallback.error || !fallback.data) { console.error("[store] addDeviceModel failed:", fallback.error?.message ?? full.error?.message); return; }
        saved = { ...rowToDeviceModel(fallback.data), categoryId };
      }
      setState((s) => ({ ...s, deviceModels: [...s.deviceModels, saved!] }));
      logActivity({ module: "Price List", action: "Model Added", severity: "success", entity: "Device Model", reference: saved.name, description: `Added model ${saved.name}${brandForCat ? ` under ${brandForCat.name}` : ""}.` });
      return;
    }
    setState((s) => ({ ...s, deviceModels: [...s.deviceModels, model2] }));
    logActivity({ module: "Price List", action: "Model Added", severity: "success", entity: "Device Model", reference: model2.name, description: `Added model ${model2.name}${brandForCat ? ` under ${brandForCat.name}` : ""}.` });
  }, []);

  const updateDeviceModel = useCallback(async (id: string, updates: Partial<DeviceModel>) => {
    setState((s) => ({ ...s, deviceModels: s.deviceModels.map((m) => (m.id === id ? { ...m, ...updates } : m)) }));
    if (shouldUseDb()) {
      const patch: Record<string, any> = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.brandId !== undefined) patch.brand_id = updates.brandId;
      if (updates.categoryId !== undefined) patch.category_id = updates.categoryId ?? null;
      if (updates.archived !== undefined) patch.archived = updates.archived;
      if (Object.keys(patch).length === 0) return;
      const { error } = await db.from("device_models").update(patch).eq("id", id);
      if (error) {
        // `archived`/`category_id` columns may be missing on older schema — retry with the rest.
        const { archived, category_id, ...rest } = patch;
        if (Object.keys(rest).length > 0) {
          await db.from("device_models").update(rest).eq("id", id).then((r) => {
            if (r.error) console.error("[store] updateDeviceModel failed:", r.error.message);
          });
        } else {
          console.error("[store] updateDeviceModel failed:", error.message);
        }
      }
    }
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
      const next = [...s.issueLibrary, trimmed];
      // Durably persist the shared master so the new issue survives reloads and
      // is immediately available in BOTH the Walk-In and Ticket forms.
      saveIssueLibrary(next);
      return { ...s, issueLibrary: next };
    });
  }, []);

  const deleteIssueFromStore = useCallback((issue: string) => {
    setState((s) => {
      const next = s.issueLibrary.filter((i) => i.toLowerCase() !== issue.trim().toLowerCase());
      saveIssueLibrary(next);
      return { ...s, issueLibrary: next };
    });
  }, []);

  const store: Store = {
    ...state,
    addTicket,
    updateTicket,
    deleteTicket,
    bulkUpdateStatus,
    updateDeviceStatus,
    pinTicket,
    pinInvoice,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    convertProformaToInvoice,
    processRefund,
    settleRefund,
    reverseRefund,
    recordItemReturn,
    restockItemReturn,
    addWalkIn,
    updateWalkIn,
    deleteWalkIn,
    pinWalkIn,
    updateTeamMember,
    deductPartsForTicket,
    addStockMovement,
    addInventoryItem,
    updateInventoryItem,
    reconcileMigrationFlag,
    deleteInventoryItem,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    mergeCustomersAction,
    adjustLoyalty,
    addCustomerGroup,
    updateCustomerGroup,
    deleteCustomerGroup,
    addCompany,
    updateCompany,
    deleteCompany,
    addBrand,
    updateBrand,
    addDeviceModel,
    updateDeviceModel,
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
