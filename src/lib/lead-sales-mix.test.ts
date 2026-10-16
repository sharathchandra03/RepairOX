import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLeadSalesMix } from "./lead-sales-mix";
import type { Lead } from "./leads-data";
import type { Invoice, InvoiceLineItem, InvoiceRefund, InvoiceRefundAllocation } from "./mock-data";
import type { InventoryItem } from "./inventory-data";

function lead(id: string, patch: Partial<Lead> = {}): Lead {
  return {
    id, branchId: "store-a", leadNo: id, date: "2026-09-05", time: "09:00", month: "2026-09",
    region: "Bengaluru", source: "Google", modeOfContact: "Inbound", captureChannel: "Form", agent: "A",
    qualification: "Qualified Lead", name: id, number: "9000000000", alternateNumber: "", email: "",
    location: "", locationUnit: "", locationLat: null, locationLng: null, locationMapsUrl: "",
    device: "iPhone", deviceCategoryId: "cat", deviceBrandId: "plb", deviceModelId: "plm",
    issue: "Screen", category: "Repair", subCategory: "Display", estimate: 5000, discount: null, discountType: "amount", devices: [],
    leadCategory: "Repair", leadNature: "Hot", priority: "Hot", comments: "", contactStatus: "Contacted",
    status: "Won", result: "", finalRemarks: "", followUpDate: "", followUpAgent: "", followUpAgentId: "",
    finalResult: "Won", followUpComments: "", notContactedSince: "",
    assignedTo: "agent-a", assignedToName: "A", assignedBy: "", assignedByName: "", assignedAt: "",
    pinnedAt: "", fulfilmentRoute: "", assignedStore: "", routedAt: "",
    linkedWalkInId: "", linkedFieldJobId: "", linkedTicketId: "", linkedInvoiceId: "", contactId: "", customerId: "",
    createdBy: "owner", createdAt: "2026-09-05T09:00:00.000Z", updatedAt: "2026-09-05T09:00:00.000Z",
    ...patch,
  };
}

function line(id: string, patch: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return { id, name: id, qty: 1, price: 1000, discount: 0, total: 1000, ...patch };
}

function invoice(id: string, patch: Partial<Invoice> = {}): Invoice {
  return {
    id, invoiceType: "retail", customer: "C", phone: "9", status: "paid", createdAt: "2026-09-10T09:00:00.000Z",
    dueDate: "", paidAmount: 0, items: [], subtotal: 0, discount: 0, tax: 0, total: 0,
    ...patch,
  };
}

function inv(id: string, kind: "part" | "service", category: string): InventoryItem {
  return {
    id, kind, name: id, category, type: kind === "service" ? "Service" : "Product", mode: "Both", uom: "Piece",
    store: "store-a", active: true, currentStock: 0, defaultPrice: 0, regularBuyingPrice: 0, wholesaleBuyingPrice: 0,
    regularSellingPrice: 0, mrp: 0, dealerPrice: 0, distributorPrice: 0, hsnCode: "", tax: 0, minStock: 0, maxStock: 0,
    reservedStock: 0, soldUnits: 0, purchasedUnits: 0,
  };
}

test("sales mix sums finalized invoice line items with units and net revenue", () => {
  const leads = [lead("l1", { linkedTicketId: "t1" })];
  const tickets = [{ id: "t1", ticketNo: "T1" }];
  const invoices = [invoice("i1", {
    ticketId: "t1", total: 15000, paidAmount: 15000,
    items: [line("SCR", { sku: "SCR", qty: 1, price: 10000, total: 10000 }), line("LAB", { sku: "LAB", qty: 2, price: 2500, total: 5000 })],
  })];
  const inventory = [inv("SCR", "part", "Display Modules"), inv("LAB", "service", "Services")];

  const result = calculateLeadSalesMix({ cohort: leads, tickets, invoices, inventory });
  assert.equal(result.finalizedInvoices, 1);
  assert.equal(result.grossRevenue, 15000);
  assert.equal(result.netRevenue, 15000);
  assert.equal(result.totalUnits, 3);
  assert.equal(result.productNetRevenue, 10000);
  assert.equal(result.serviceNetRevenue, 5000);
  assert.equal(result.productUnits, 1);
  assert.equal(result.serviceUnits, 2);
  assert.equal(result.topProducts[0]?.label, "SCR");
  assert.equal(result.topServices[0]?.label, "LAB");
});

test("proforma, unpaid and cancelled invoices never count as sales", () => {
  const leads = [lead("l1", { linkedTicketId: "t1" })];
  const tickets = [{ id: "t1", ticketNo: "T1" }];
  const invoices = [
    invoice("proforma", { ticketId: "t1", total: 99999, documentType: "proforma", items: [line("x", { sku: "SCR", total: 99999 })] }),
    invoice("unpaid", { ticketId: "t1", status: "sent", total: 5000, items: [line("y", { sku: "SCR", total: 5000 })] }),
    invoice("cancelled", { ticketId: "t1", status: "cancelled", total: 5000, items: [line("z", { sku: "SCR", total: 5000 })] }),
  ];
  const result = calculateLeadSalesMix({ cohort: leads, tickets, invoices, inventory: [inv("SCR", "part", "Display Modules")] });
  assert.equal(result.finalizedInvoices, 0);
  assert.equal(result.netRevenue, 0);
});

test("a single invoice reachable by two leads is counted once", () => {
  const leads = [lead("l1", { linkedTicketId: "t1" }), lead("l2", { linkedInvoiceId: "i1" })];
  const tickets = [{ id: "t1", ticketNo: "T1" }];
  const invoices = [invoice("i1", { ticketId: "t1", total: 10000, items: [line("SCR", { sku: "SCR", total: 10000 })] })];
  const result = calculateLeadSalesMix({ cohort: leads, tickets, invoices, inventory: [inv("SCR", "part", "Display")] });
  assert.equal(result.finalizedInvoices, 1);
  assert.equal(result.netRevenue, 10000);
});

test("succeeded refund allocations net the specific line; failed refunds do not", () => {
  const leads = [lead("l1", { linkedTicketId: "t1" })];
  const tickets = [{ id: "t1", ticketNo: "T1" }];
  const invoices = [invoice("i1", { ticketId: "t1", total: 10000, items: [line("SCR", { sku: "SCR", total: 10000 })] })];
  const refunds: InvoiceRefund[] = [
    { id: "r1", invoiceId: "i1", scope: "lines", refundKind: "partial", refundNet: 4000, refundTax: 0, refundDiscount: 0, refundAmount: 4000, reasonCode: "x", method: "cash", status: "succeeded" },
    { id: "r2", invoiceId: "i1", scope: "lines", refundKind: "partial", refundNet: 3000, refundTax: 0, refundDiscount: 0, refundAmount: 3000, reasonCode: "x", method: "cash", status: "failed" },
  ];
  const allocations: InvoiceRefundAllocation[] = [
    { id: "a1", refundId: "r1", invoiceId: "i1", lineId: "SCR", lineComponent: "line", qty: 1, allocNet: 4000, allocTax: 0, allocAmount: 4000 },
    { id: "a2", refundId: "r2", invoiceId: "i1", lineId: "SCR", lineComponent: "line", qty: 1, allocNet: 3000, allocTax: 0, allocAmount: 3000 },
  ];
  const result = calculateLeadSalesMix({ cohort: leads, tickets, invoices, inventory: [inv("SCR", "part", "Display")], refunds, refundAllocations: allocations });
  assert.equal(result.grossRevenue, 10000);
  assert.equal(result.refunded, 4000);
  assert.equal(result.netRevenue, 6000);
});

test("line kind classifies product vs service without an inventory master", () => {
  const leads = [lead("l1", { linkedTicketId: "t1" })];
  const tickets = [{ id: "t1", ticketNo: "T1" }];
  const invoices = [invoice("i1", { ticketId: "t1", total: 3000, items: [
    line("Data Recovery", { kind: "service", total: 2000, qty: 1 }),
    line("Case", { kind: "part", total: 1000, qty: 1 }),
  ] })];
  const result = calculateLeadSalesMix({ cohort: leads, tickets, invoices, inventory: [] });
  assert.equal(result.serviceNetRevenue, 2000);
  assert.equal(result.productNetRevenue, 1000);
  assert.equal(result.unclassifiedLines, 0);
});

test("empty cohort yields a clean zero result", () => {
  const result = calculateLeadSalesMix({ cohort: [], tickets: [], invoices: [], inventory: [] });
  assert.equal(result.finalizedInvoices, 0);
  assert.equal(result.netRevenue, 0);
  assert.equal(result.totalUnits, 0);
  assert.equal(result.topItems.length, 0);
});
