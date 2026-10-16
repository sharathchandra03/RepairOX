import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLeadLedger, buildStatusRail, buildNextMoves, buildOutcomeMap,
  buildFulfilmentMotions, buildAgentRosterRow, sortRoster,
  buildSalesBookExportRows, resolveExportRows, LEDGER_VIEWS, ledgerViewCount,
  type SalesBookSources,
} from "./lead-sales-book";
import type { Lead, LeadFollowUp, RevenueRefundLike } from "./leads-data";

const AS_OF = new Date("2026-09-30T12:00:00.000Z").getTime();

function lead(id: string, patch: Partial<Lead> = {}): Lead {
  const createdAt = patch.createdAt ?? "2026-09-05T09:00:00.000Z";
  return {
    id, branchId: "store-a", leadNo: id, date: createdAt.slice(0, 10), time: "09:00", month: "2026-09",
    region: "Bengaluru", source: "Google", modeOfContact: "Inbound", captureChannel: "Form", agent: "Agent A",
    qualification: "Qualified Lead", name: `Customer ${id}`, number: "9000000000", alternateNumber: "", email: "",
    location: "", locationUnit: "", locationLat: null, locationLng: null, locationMapsUrl: "",
    device: "Apple iPhone", deviceCategoryId: "cat-mobile", deviceBrandId: "plb-apple", deviceModelId: "plm-iphone",
    issue: "Screen", category: "Repair", subCategory: "Display", estimate: 5_000, discount: null, discountType: "amount", devices: [],
    leadCategory: "Repair", leadNature: "Hot", priority: "Hot", comments: "", contactStatus: "Contacted",
    status: "Qualified", result: "Interested", finalRemarks: "", followUpDate: "", followUpAgent: "Agent A",
    followUpAgentId: "agent-a", finalResult: "", followUpComments: "", notContactedSince: "",
    assignedTo: "agent-a", assignedToName: "Agent A", assignedBy: "owner", assignedByName: "Owner", assignedAt: createdAt,
    pinnedAt: "", fulfilmentRoute: "STORE_VISIT", assignedStore: "", routedAt: createdAt,
    linkedWalkInId: "", linkedFieldJobId: "", linkedTicketId: "", linkedInvoiceId: "", contactId: "", customerId: "",
    createdBy: "owner", createdAt, updatedAt: createdAt,
    ...patch,
  };
}

function followUp(id: string, leadId: string, patch: Partial<LeadFollowUp> = {}): LeadFollowUp {
  return {
    id, leadId, seq: 1, dueAt: "2026-09-20T09:00:00.000Z", followUpUserId: "agent-a", followUpUserName: "Agent A",
    createdBy: "agent-a", createdByName: "Agent A", status: "scheduled",
    createdAt: "2026-09-10T09:00:00.000Z", ...patch,
  };
}

type T = { id: string; ticketNo: string };
type I = { id: string; ticketId?: string; total: number; status: string; documentType: "invoice" | "proforma" };

function srcOf(tickets: T[], invoices: I[], refunds?: RevenueRefundLike[]): SalesBookSources {
  // The test uses minimal ticket/invoice shapes (only the fields the revenue +
  // workflow helpers read). Cast to the full source type for the engine.
  return { tickets: tickets as unknown as SalesBookSources["tickets"], invoices: invoices as unknown as SalesBookSources["invoices"], refunds };
}

test("ledger: one row per lead and revenue uses only finalized invoices", () => {
  const leads = [
    lead("won-inv", { status: "Won", linkedTicketId: "t1" }),
    lead("open", { status: "Qualified" }),
    lead("proforma", { status: "Won", linkedTicketId: "t2" }),
  ];
  const tickets: T[] = [{ id: "t1", ticketNo: "TK-1" }, { id: "t2", ticketNo: "TK-2" }];
  // Two invoices on the SAME ticket must NOT create two ledger rows for the lead.
  const invoices: I[] = [
    { id: "i1", ticketId: "t1", total: 6000, status: "paid", documentType: "invoice" },
    { id: "i2", ticketId: "t1", total: 4000, status: "paid", documentType: "invoice" },
    { id: "i3", ticketId: "t2", total: 9000, status: "paid", documentType: "proforma" }, // proforma = not revenue
  ];
  const rows = buildLeadLedger(leads, [], srcOf(tickets, invoices), AS_OF);
  assert.equal(rows.length, 3, "three leads → three rows (never multiplied by invoices)");
  const wonRow = rows.find((r) => r.leadId === "won-inv")!;
  assert.equal(wonRow.revenueGross, 10000, "both finalized invoices on the ticket sum");
  assert.equal(wonRow.hasInvoice, true);
  const proformaRow = rows.find((r) => r.leadId === "proforma")!;
  assert.equal(proformaRow.revenueGross, 0, "a proforma is never revenue");
  assert.equal(proformaRow.hasInvoice, false);
});

test("revenue is net of succeeded refunds only", () => {
  const leads = [lead("l", { status: "Won", linkedTicketId: "t1" })];
  const tickets: T[] = [{ id: "t1", ticketNo: "TK-1" }];
  const invoices: I[] = [{ id: "i1", ticketId: "t1", total: 10000, status: "paid", documentType: "invoice" }];
  const refunds: RevenueRefundLike[] = [
    { invoiceId: "i1", refundAmount: 2000, status: "succeeded" },
    { invoiceId: "i1", refundAmount: 1000, status: "pending" }, // not realized → ignored
  ];
  const rows = buildLeadLedger(leads, [], srcOf(tickets, invoices, refunds), AS_OF);
  assert.equal(rows[0].revenueGross, 10000);
  assert.equal(rows[0].revenueNet, 8000, "only the succeeded refund is subtracted");
  assert.equal(rows[0].refundAmount, 2000);
});

test("status rail: exclusive stages never double-count; All + Attention overlap", () => {
  const leads = [
    lead("new1", { status: "New", contactStatus: "Not Contacted", qualification: "", firstContactedAt: "" }),
    lead("prog1", { status: "In Progress", qualification: "", contactStatus: "Contacted", firstContactedAt: "2026-09-06T09:00:00.000Z" }),
    lead("qual1", { status: "Qualified" }),
    lead("won1", { status: "Won" }),
    lead("lost1", { status: "Lost" }),
  ];
  const rows = buildLeadLedger(leads, [], srcOf([], []), AS_OF);
  const rail = buildStatusRail(rows);
  const stageCounts = rail.filter((s) => s.exclusive).reduce((sum, s) => sum + s.count, 0);
  assert.equal(stageCounts, rows.length, "exclusive stage segments sum to the total");
  assert.equal(rail.find((s) => s.key === "all")!.count, rows.length);
  assert.ok(rail.find((s) => s.key === "attention"), "attention segment exists");
});

test("next moves: overdue beats due; one move per lead; won-without-invoice surfaces", () => {
  const leads = [
    lead("overdue", { status: "Qualified" }),
    lead("wonNoInv", { status: "Won", linkedTicketId: "t9" }),
    lead("terminal", { status: "Lost" }),
  ];
  const tickets: T[] = [{ id: "t9", ticketNo: "TK-9" }];
  const followUps = [
    followUp("f1", "overdue", { dueAt: "2026-09-10T09:00:00.000Z", status: "scheduled" }), // overdue
  ];
  const rows = buildLeadLedger(leads, followUps, srcOf(tickets, []), AS_OF);
  const moves = buildNextMoves(rows, AS_OF);
  // Lost lead produces no move; overdue + won-without-invoice do.
  const kinds = moves.map((m) => m.kind);
  assert.ok(kinds.includes("follow_up_overdue"));
  assert.ok(kinds.includes("won_without_invoice"));
  assert.ok(!moves.some((m) => m.leadId === "terminal"), "terminal lost lead has no move");
  // At most one move per lead.
  const perLead = new Map<string, number>();
  for (const m of moves) perLead.set(m.leadId, (perLead.get(m.leadId) ?? 0) + 1);
  for (const [, n] of perLead) assert.equal(n, 1, "one move per lead");
  // Overdue is the highest-weighted.
  assert.equal(moves[0].kind, "follow_up_overdue");
});

test("no recorded outreach is detected honestly (not inferred as contacted)", () => {
  const leads = [lead("fresh", { status: "New", contactStatus: "", firstContactedAt: "", qualification: "", routedAt: "", assignedAt: "" })];
  const rows = buildLeadLedger(leads, [], srcOf([], []), AS_OF);
  assert.equal(rows[0].hasRecordedActivity, false);
  const moves = buildNextMoves(rows, AS_OF);
  assert.equal(moves[0].kind, "no_recorded_outreach");
});

test("outcome map + overlapping ledger views (won/invoice/ticket overlap)", () => {
  const leads = [
    lead("a", { status: "Won", linkedTicketId: "t1" }),
    lead("b", { status: "Qualified" }),
  ];
  const tickets: T[] = [{ id: "t1", ticketNo: "TK-1" }];
  const invoices: I[] = [{ id: "i1", ticketId: "t1", total: 5000, status: "paid", documentType: "invoice" }];
  const rows = buildLeadLedger(leads, [], srcOf(tickets, invoices), AS_OF);
  const map = buildOutcomeMap(rows);
  assert.equal(map.find((m) => m.key === "created")!.count, 2);
  assert.equal(map.find((m) => m.key === "won")!.count, 1);
  assert.equal(map.find((m) => m.key === "ticket")!.count, 1);
  assert.equal(map.find((m) => m.key === "invoice")!.count, 1);
  // The same lead counts in Won AND Invoice AND Ticket views (overlap allowed).
  assert.equal(ledgerViewCount(rows, "won"), 1);
  assert.equal(ledgerViewCount(rows, "invoice"), 1);
  assert.equal(ledgerViewCount(rows, "ticket"), 1);
});

test("fulfilment motions include a 'Not routed' bucket and never guess", () => {
  const leads = [
    lead("w", { fulfilmentRoute: "STORE_VISIT" }),
    lead("p", { fulfilmentRoute: "PICKUP_DROP" }),
    lead("o", { fulfilmentRoute: "ON_SITE" }),
    lead("none", { fulfilmentRoute: "" }),
  ];
  const rows = buildLeadLedger(leads, [], srcOf([], []), AS_OF);
  const motions = buildFulfilmentMotions(rows);
  assert.equal(motions.length, 4);
  assert.ok(motions.find((m) => m.mode === "" && m.label === "Not routed"));
  assert.equal(motions.reduce((s, m) => s + m.leads, 0), 4);
});

test("agent roster aggregates reconcile to the ledger; sort is explicit", () => {
  const aLeads = [
    lead("a1", { assignedTo: "agent-a", status: "Won", linkedTicketId: "t1" }),
    lead("a2", { assignedTo: "agent-a", status: "Qualified" }),
  ];
  const bLeads = [lead("b1", { assignedTo: "agent-b", status: "Qualified" })];
  const tickets: T[] = [{ id: "t1", ticketNo: "TK-1" }];
  const invoices: I[] = [{ id: "i1", ticketId: "t1", total: 7000, status: "paid", documentType: "invoice" }];
  const rowsA = buildLeadLedger(aLeads, [], srcOf(tickets, invoices), AS_OF);
  const rowsB = buildLeadLedger(bLeads, [], srcOf(tickets, invoices), AS_OF);
  const rosterA = buildAgentRosterRow("agent-a", rowsA);
  const rosterB = buildAgentRosterRow("agent-b", rowsB);
  assert.equal(rosterA.won, 1);
  assert.equal(rosterA.revenueNet, 7000);
  assert.equal(rosterA.totalLeads, 2);
  assert.equal(rosterB.revenueNet, 0);
  const sorted = sortRoster([rosterB, rosterA], "revenueNet", "desc");
  assert.equal(sorted[0].agentId, "agent-a", "sort by revenue puts A first");
});

test("export: one row per lead, refund-aware, presets filter the full set", () => {
  const leads = [
    lead("won", { status: "Won", linkedTicketId: "t1" }),
    lead("open", { status: "Qualified", fulfilmentRoute: "ON_SITE" }),
  ];
  const tickets: T[] = [{ id: "t1", ticketNo: "TK-1" }];
  const invoices: I[] = [
    { id: "i1", ticketId: "t1", total: 5000, status: "paid", documentType: "invoice" },
    { id: "i2", ticketId: "t1", total: 5000, status: "paid", documentType: "invoice" },
  ];
  const refunds: RevenueRefundLike[] = [{ invoiceId: "i1", refundAmount: 1000, status: "succeeded" }];
  const rows = buildLeadLedger(leads, [], srcOf(tickets, invoices, refunds), AS_OF);
  const exported = buildSalesBookExportRows(rows, { "store-a": "Indiranagar" });
  assert.equal(exported.length, 2, "two leads → two rows even with two invoices on one");
  const wonExport = exported.find((r) => r[0] === "won")!;
  // columns: ... Expected(17) Net(18) Gross(19) Refund(20)
  assert.equal(wonExport[18], 9000, "net = 10000 - 1000 succeeded refund");
  assert.equal(wonExport[19], 10000, "gross = both invoices");
  assert.equal(wonExport[20], 1000, "refund attributed");
  // Preset filtering on the full set.
  const onsite = resolveExportRows("onsite", rows, rows);
  assert.equal(onsite.length, 1);
  assert.equal(onsite[0].leadId, "open");
  const won = resolveExportRows("won", rows, rows);
  assert.equal(won.length, 1);
  assert.equal(won[0].leadId, "won");
});

test("LEDGER_VIEWS are overlapping filters, each a real predicate", () => {
  for (const v of LEDGER_VIEWS) assert.equal(typeof v.predicate, "function");
  assert.ok(LEDGER_VIEWS.some((v) => v.key === "all" && v.predicate({} as never)));
});
