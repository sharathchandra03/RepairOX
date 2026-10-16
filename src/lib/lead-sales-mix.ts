/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Product & Service Sales Intelligence (pure, deterministic).

   This derives WHAT a Sales Agent (or team) actually SOLD — not which lead
   statuses they changed — from REAL finalized invoice line items reachable
   from their leads (Lead → linked Ticket → Invoice, plus the direct
   linked-invoice fallback). It is the sales-mix counterpart to the lead-cohort
   engine in `lead-intelligence.ts`.

   Guarantees (match the lead-intelligence + inventory-vs-invoice-line + customer
   standards):
     • Revenue only from FINALIZED invoices (isFinalizedInvoice: non-proforma +
       paid). Proforma / draft / cancelled / unpaid never count.
     • Each finalized invoice is counted ONCE even if several leads could reach
       it (de-duped by invoice id across the whole cohort).
     • Net sales subtract only SUCCEEDED refunds on those finalized invoices,
       allocated down to the line via invoice_refund_allocations when present,
       else proportionally across the invoice's lines. Never below 0.
     • Product vs Service is the line's own `kind` ("part" | "service"), refined
       by the Inventory Master (SKU → item.kind/type). A line with no master and
       no kind is treated as a part (product) unless flagged a service.
     • Category comes from the Inventory Master (SKU → item.category); unknown →
       "Uncategorised" (never fabricated).
     • Units = Σ line.qty; revenue = Σ line.total; nothing is inferred from a
       ticket estimate or a lead status.
   No value is stored; everything is computed live from already-authorized data.
   ────────────────────────────────────────────────────────────────────────── */

import { isFinalizedInvoice, type Lead } from "@/lib/leads-data";
import {
  getInvoiceDevices,
  type Invoice,
  type InvoiceLineItem,
  type InvoiceRefund,
  type InvoiceRefundAllocation,
} from "@/lib/mock-data";
import type { InventoryItem } from "@/lib/inventory-data";

export type SalesItemKind = "product" | "service";

export interface LeadSalesMixInput {
  /** Already-scoped lead cohort (the SAME cohort the lead engine used). */
  cohort: Lead[];
  tickets: { id: string; ticketNo?: string }[];
  invoices: Invoice[];
  /** Inventory Master for SKU → category / product-vs-service classification. */
  inventory: InventoryItem[];
  /** Succeeded refunds net the revenue; allocations attribute them per line. */
  refunds?: InvoiceRefund[];
  refundAllocations?: InvoiceRefundAllocation[];
}

export interface SalesMixRow {
  key: string;
  label: string;
  kind: SalesItemKind;
  category: string;
  /** Units sold = Σ line.qty across finalized invoices. */
  units: number;
  /** Gross line revenue (Σ line.total). */
  grossRevenue: number;
  /** Net of succeeded refunds attributed to these lines. */
  netRevenue: number;
  /** Succeeded-refund value attributed to these lines (grossRevenue − net). */
  refunded: number;
  /** Distinct finalized invoices this item appears on. */
  invoices: number;
  /** Distinct won leads that produced these sales. */
  leads: number;
}

export interface SalesMixCategoryRow {
  key: string;
  label: string;
  kind: SalesItemKind;
  units: number;
  grossRevenue: number;
  netRevenue: number;
  refunded: number;
  invoices: number;
}

export interface LeadSalesMixResult {
  /** True finalized invoices behind the mix (de-duped). */
  finalizedInvoices: number;
  /** Distinct won leads linked to a finalized invoice. */
  revenueLeads: number;
  grossRevenue: number;
  netRevenue: number;
  refunded: number;
  totalUnits: number;
  averageInvoiceValue: number;
  productNetRevenue: number;
  serviceNetRevenue: number;
  productUnits: number;
  serviceUnits: number;
  topItems: SalesMixRow[];
  topProducts: SalesMixRow[];
  topServices: SalesMixRow[];
  categories: SalesMixCategoryRow[];
  /** True when any line could not be classified against the Inventory Master. */
  unclassifiedLines: number;
  /** True when the invoice carried a repair/labour charge not itemised as a line. */
  repairChargeRevenue: number;
}

interface ResolvedLine {
  line: InvoiceLineItem;
  kind: SalesItemKind;
  category: string;
  invoiceId: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Classify an invoice line into product/service + a category using its own
 *  `kind` first, refined by the Inventory Master (SKU join). Free-text service
 *  lines (no SKU) with kind "service" stay services; everything else defaults
 *  to a product. Category is the master's category, else "Uncategorised". */
function classifyLine(
  line: InvoiceLineItem,
  bySku: Map<string, InventoryItem>,
): { kind: SalesItemKind; category: string; classified: boolean } {
  const master = line.sku ? bySku.get(line.sku.trim()) : undefined;
  let kind: SalesItemKind;
  let classified = false;
  if (master) {
    const mk = master.kind ?? (master.type === "Service" ? "service" : "part");
    kind = mk === "service" ? "service" : "product";
    classified = true;
  } else if (line.kind) {
    kind = line.kind === "service" ? "service" : "product";
    classified = true;
  } else {
    kind = "product";
  }
  const category = (master?.category || "").trim() || (kind === "service" ? "Services" : "Uncategorised");
  return { kind, category, classified };
}

/** The finalized invoices reachable from a lead (via ticket id/no or direct). */
function finalizedInvoicesForLead(
  lead: Lead,
  tickets: { id: string; ticketNo?: string }[],
  finalized: Invoice[],
): Invoice[] {
  const ticket = lead.linkedTicketId
    ? tickets.find((t) => t.id === lead.linkedTicketId || t.ticketNo === lead.linkedTicketId)
    : undefined;
  return finalized.filter((inv) => {
    const viaTicket = !!ticket && !!inv.ticketId && (inv.ticketId === ticket.id || inv.ticketId === ticket.ticketNo);
    const direct = !!lead.linkedInvoiceId && inv.id === lead.linkedInvoiceId;
    return viaTicket || direct;
  });
}

/** Succeeded-refund amount attributed to a specific invoice line, using the
 *  per-line allocations when present; otherwise distributes the invoice's
 *  succeeded refund across its lines proportionally to line.total. */
function refundForLine(
  invoice: Invoice,
  line: InvoiceLineItem,
  lineGross: number,
  invoiceGross: number,
  succeededRefundTotal: number,
  allocByLine: Map<string, number>,
): number {
  if (allocByLine.size > 0) {
    return round2(allocByLine.get(line.id) ?? 0);
  }
  if (succeededRefundTotal <= 0 || invoiceGross <= 0) return 0;
  return round2(succeededRefundTotal * (lineGross / invoiceGross));
}

export function calculateLeadSalesMix(input: LeadSalesMixInput): LeadSalesMixResult {
  const finalized = input.invoices.filter(isFinalizedInvoice);
  const bySku = new Map<string, InventoryItem>();
  for (const item of input.inventory) if (item.id) bySku.set(item.id.trim(), item);

  const refunds = input.refunds ?? [];
  const allocations = input.refundAllocations ?? [];
  const succeeded = new Set(refunds.filter((r) => r.status === "succeeded").map((r) => r.id));
  // Succeeded-refund total per invoice.
  const succeededByInvoice = new Map<string, number>();
  for (const r of refunds) {
    if (r.status !== "succeeded") continue;
    succeededByInvoice.set(r.invoiceId, (succeededByInvoice.get(r.invoiceId) ?? 0) + Number(r.refundAmount || 0));
  }
  // Succeeded-refund allocation per line id.
  const allocByLineForInvoice = new Map<string, Map<string, number>>();
  for (const a of allocations) {
    if (!a.lineId || !succeeded.has(a.refundId)) continue;
    const m = allocByLineForInvoice.get(a.invoiceId) ?? new Map<string, number>();
    m.set(a.lineId, (m.get(a.lineId) ?? 0) + Number(a.allocAmount || 0));
    allocByLineForInvoice.set(a.invoiceId, m);
  }

  // De-dupe invoices across the whole cohort; remember which leads reach each.
  const invoiceToLeads = new Map<string, Set<string>>();
  for (const lead of input.cohort) {
    for (const inv of finalizedInvoicesForLead(lead, input.tickets, finalized)) {
      const set = invoiceToLeads.get(inv.id) ?? new Set<string>();
      set.add(lead.id);
      invoiceToLeads.set(inv.id, set);
    }
  }
  const countedInvoices = finalized.filter((inv) => invoiceToLeads.has(inv.id));

  // Aggregate lines.
  const itemRows = new Map<string, SalesMixRow & { invoiceIds: Set<string>; leadIds: Set<string> }>();
  const categoryRows = new Map<string, SalesMixCategoryRow & { invoiceIds: Set<string> }>();
  let grossRevenue = 0;
  let netRevenue = 0;
  let refunded = 0;
  let totalUnits = 0;
  let productNetRevenue = 0;
  let serviceNetRevenue = 0;
  let productUnits = 0;
  let serviceUnits = 0;
  let unclassifiedLines = 0;
  let repairChargeRevenue = 0;

  for (const invoice of countedInvoices) {
    const leadIds = invoiceToLeads.get(invoice.id) ?? new Set<string>();
    const devices = getInvoiceDevices(invoice);
    const resolved: ResolvedLine[] = [];
    for (const device of devices) {
      for (const line of device.parts || []) {
        const c = classifyLine(line, bySku);
        if (!c.classified) unclassifiedLines += 1;
        resolved.push({ line, kind: c.kind, category: c.category, invoiceId: invoice.id });
      }
      // A repair/labour charge billed on the device but not itemised as a line
      // is a service the agent sold — recorded as net revenue context, never a
      // fabricated product line.
      const repair = Number((device as { repairCost?: number }).repairCost || 0);
      if (repair > 0) repairChargeRevenue += repair;
    }
    const invoiceGross = resolved.reduce((s, r) => s + Number(r.line.total || 0), 0);
    const succeededTotal = succeededByInvoice.get(invoice.id) ?? 0;
    const allocByLine = allocByLineForInvoice.get(invoice.id) ?? new Map<string, number>();

    for (const r of resolved) {
      const lineGross = Number(r.line.total || 0);
      const lineRefund = Math.min(lineGross, refundForLine(invoice, r.line, lineGross, invoiceGross, succeededTotal, allocByLine));
      const lineNet = Math.max(0, round2(lineGross - lineRefund));
      const units = Number(r.line.qty || 0);

      grossRevenue += lineGross;
      netRevenue += lineNet;
      refunded += lineRefund;
      totalUnits += units;
      if (r.kind === "service") { serviceNetRevenue += lineNet; serviceUnits += units; }
      else { productNetRevenue += lineNet; productUnits += units; }

      const nameKey = (r.line.sku?.trim() || r.line.name.trim() || "Item").toLowerCase();
      const itemKey = `${r.kind}:${nameKey}`;
      const row = itemRows.get(itemKey) ?? {
        key: itemKey, label: r.line.name.trim() || r.line.sku?.trim() || "Item", kind: r.kind, category: r.category,
        units: 0, grossRevenue: 0, netRevenue: 0, refunded: 0, invoices: 0, leads: 0,
        invoiceIds: new Set<string>(), leadIds: new Set<string>(),
      };
      row.units += units;
      row.grossRevenue = round2(row.grossRevenue + lineGross);
      row.netRevenue = round2(row.netRevenue + lineNet);
      row.refunded = round2(row.refunded + lineRefund);
      row.invoiceIds.add(invoice.id);
      for (const id of leadIds) row.leadIds.add(id);
      itemRows.set(itemKey, row);

      const catKey = `${r.kind}:${r.category.toLowerCase()}`;
      const cat = categoryRows.get(catKey) ?? {
        key: catKey, label: r.category, kind: r.kind, units: 0, grossRevenue: 0, netRevenue: 0, refunded: 0, invoices: 0,
        invoiceIds: new Set<string>(),
      };
      cat.units += units;
      cat.grossRevenue = round2(cat.grossRevenue + lineGross);
      cat.netRevenue = round2(cat.netRevenue + lineNet);
      cat.refunded = round2(cat.refunded + lineRefund);
      cat.invoiceIds.add(invoice.id);
      categoryRows.set(catKey, cat);
    }
  }

  const items: SalesMixRow[] = [...itemRows.values()].map((r) => ({
    key: r.key, label: r.label, kind: r.kind, category: r.category, units: r.units,
    grossRevenue: round2(r.grossRevenue), netRevenue: round2(r.netRevenue), refunded: round2(r.refunded),
    invoices: r.invoiceIds.size, leads: r.leadIds.size,
  }));
  const byNet = (a: SalesMixRow, b: SalesMixRow) => b.netRevenue - a.netRevenue || b.units - a.units || a.label.localeCompare(b.label);
  const categories: SalesMixCategoryRow[] = [...categoryRows.values()]
    .map((c) => ({ key: c.key, label: c.label, kind: c.kind, units: c.units, grossRevenue: round2(c.grossRevenue), netRevenue: round2(c.netRevenue), refunded: round2(c.refunded), invoices: c.invoiceIds.size }))
    .sort((a, b) => b.netRevenue - a.netRevenue || b.units - a.units);

  const revenueLeads = new Set<string>();
  for (const set of invoiceToLeads.values()) for (const id of set) revenueLeads.add(id);

  return {
    finalizedInvoices: countedInvoices.length,
    revenueLeads: revenueLeads.size,
    grossRevenue: round2(grossRevenue),
    netRevenue: round2(netRevenue),
    refunded: round2(refunded),
    totalUnits,
    averageInvoiceValue: countedInvoices.length ? round2(netRevenue / countedInvoices.length) : 0,
    productNetRevenue: round2(productNetRevenue),
    serviceNetRevenue: round2(serviceNetRevenue),
    productUnits, serviceUnits,
    topItems: [...items].sort(byNet).slice(0, 8),
    topProducts: items.filter((i) => i.kind === "product").sort(byNet).slice(0, 6),
    topServices: items.filter((i) => i.kind === "service").sort(byNet).slice(0, 6),
    categories,
    unclassifiedLines,
    repairChargeRevenue: round2(repairChargeRevenue),
  };
}
