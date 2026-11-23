import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLeadJourneyReport, isJourneyConverted, journeyConvertedAt, type LeadStatusEvent } from "./lead-journey-report";
import type { Lead, LeadConversionEvent, LeadFollowUp } from "./leads-data";

const rev = { tickets: [], invoices: [] };
function lead(id: string, patch: Partial<Lead> = {}): Lead {
  const createdAt = "2026-09-01T09:00:00.000Z";
  return {
    id, branchId: "s", leadNo: id, date: "2026-09-01", time: "09:00", month: "2026-09", region: "", source: "Google",
    modeOfContact: "", captureChannel: "", agent: "A", qualification: "Qualified Lead", name: `C ${id}`, number: "", alternateNumber: "",
    email: "", location: "", locationUnit: "", locationLat: null, locationLng: null, locationMapsUrl: "", device: "", deviceCategoryId: "",
    deviceBrandId: "", deviceModelId: "", issue: "", category: "", subCategory: "", estimate: 1000, discount: null, discountType: "amount",
    devices: [], leadCategory: "", leadNature: "", priority: "", comments: "", contactStatus: "Contacted", status: "Follow-Up", result: "",
    finalRemarks: "", followUpDate: "", followUpAgent: "", followUpAgentId: "", finalResult: "", followUpComments: "", notContactedSince: "",
    assignedTo: "a", assignedToName: "A", assignedBy: "", assignedByName: "", assignedAt: createdAt, pinnedAt: "", fulfilmentRoute: "STORE_VISIT",
    assignedStore: "", routedAt: "", linkedWalkInId: "", linkedFieldJobId: "", linkedTicketId: "", linkedInvoiceId: "", contactId: "",
    customerId: "", createdBy: "", createdAt, updatedAt: createdAt, ...patch,
  } as Lead;
}
const fu = (id: string, leadId: string, seq: number, completedAt: string, outcome = "Interested", status: LeadFollowUp["status"] = "completed"): LeadFollowUp => ({
  id, leadId, seq, dueAt: completedAt, followUpUserId: "a", followUpUserName: "A", createdBy: "a", createdByName: "A", status, completedAt, outcome, createdAt: "2026-09-01T09:00:00.000Z",
});
const conv = (leadId: string, at: string, eventType: LeadConversionEvent["eventType"] = "field_job_created"): LeadConversionEvent => ({ id: `${leadId}-${eventType}`, leadId, eventType, occurredAt: at });
const st = (leadId: string, from: string, to: string, at: string, actorName = "Vishwa"): LeadStatusEvent => ({ leadId, fromStatus: from, toStatus: to, at, actorName });

test("converted = real operational outcome, never a route choice", () => {
  assert.equal(isJourneyConverted(lead("a")), false);
  assert.equal(isJourneyConverted(lead("a"), [conv("a", "2026-09-05T00:00:00Z", "routed")]), false);
  assert.equal(isJourneyConverted(lead("a", { linkedFieldJobId: "FJ-1" })), true);
  assert.equal(isJourneyConverted(lead("a", { status: "Won" })), true);
  assert.equal(journeyConvertedAt(lead("a"), [conv("a", "2026-09-07T10:00:00Z"), conv("a", "2026-09-06T10:00:00Z", "ticket_created")]), new Date("2026-09-06T10:00:00Z").getTime());
});

test("follow-ups needed before converting are counted only up to the conversion time", () => {
  const leads = [lead("L1", { linkedFieldJobId: "FJ" }), lead("L2", { linkedFieldJobId: "FJ" }), lead("L3", { linkedFieldJobId: "FJ" }), lead("L4")];
  const r = buildLeadJourneyReport({
    cohort: leads, revenue: rev, statusEvents: [],
    followUps: [
      fu("f1", "L1", 1, "2026-09-02T10:00:00Z"), fu("f2", "L1", 2, "2026-09-03T10:00:00Z"),
      fu("f3", "L1", 3, "2026-09-20T10:00:00Z"),            // AFTER conversion — must not count
      fu("f4", "L2", 1, "2026-09-02T10:00:00Z"),
      fu("f5", "L4", 1, "2026-09-02T10:00:00Z"),            // not converted
    ],
    conversionEvents: [conv("L1", "2026-09-05T10:00:00Z"), conv("L2", "2026-09-05T10:00:00Z"), conv("L3", "2026-09-05T10:00:00Z")],
  });
  assert.equal(r.converted, 3);
  assert.equal(r.convertedAfterFollowUp, 2);
  assert.equal(r.convertedWithoutFollowUp, 1);
  const by = Object.fromEntries(r.depth.map((d) => [d.key, d.leads]));
  assert.deepEqual(by, { "0": 1, "1": 1, "2": 1, "3": 0, "4+": 0 });
  assert.equal(r.medianFollowUpsToConvert, 1);
});

test("a converted lead with no reliable time is reported, not guessed", () => {
  const r = buildLeadJourneyReport({ cohort: [lead("L1", { linkedTicketId: "T-1" })], revenue: rev, statusEvents: [], followUps: [fu("f", "L1", 1, "2026-09-02T10:00:00Z")], conversionEvents: [] });
  assert.equal(r.converted, 1);
  assert.equal(r.convertedUnknownTime, 1);
  assert.equal(r.convertedAfterFollowUp, 0);
  assert.ok(r.notes.some((n) => /no reliable conversion time/.test(n)));
});

test("outcome rates need the minimum sample", () => {
  const leads = [lead("L1", { linkedFieldJobId: "FJ" }), lead("L2")];
  const r = buildLeadJourneyReport({
    cohort: leads, revenue: rev, statusEvents: [],
    followUps: [fu("f1", "L1", 1, "2026-09-02T10:00:00Z", "Quotation Requested"), fu("f2", "L2", 1, "2026-09-02T10:00:00Z", "Quotation Requested")],
    conversionEvents: [conv("L1", "2026-09-05T10:00:00Z")],
  });
  const row = r.outcomes.find((o) => o.outcome === "Quotation Requested")!;
  assert.equal(row.closed, 2); assert.equal(row.thenConverted, 1); assert.equal(row.sufficient, false);
});

test("Lost → revived → converted, with days lost and revenue only after revival", () => {
  const leads = [
    lead("R1", { status: "Pickup Assigned", linkedFieldJobId: "FJ", lostReason: "Price" }),   // lost then revived then converted
    lead("R2", { status: "Follow-Up" }),                                                      // lost then revived, not converted
    lead("L3", { status: "Lost", lostAt: "2026-09-10T00:00:00Z" }),                            // still lost
    lead("N4", { status: "Follow-Up" }),                                                      // never lost
  ];
  const r = buildLeadJourneyReport({
    cohort: leads, revenue: rev, followUps: [],
    statusEvents: [
      st("R1", "Follow-Up", "Lost", "2026-09-10T00:00:00Z"), st("R1", "Lost", "Follow-Up", "2026-09-14T00:00:00Z", "Priya"), st("R1", "Follow-Up", "Pickup Assigned", "2026-09-15T00:00:00Z"),
      st("R2", "Follow-Up", "Lost", "2026-09-10T00:00:00Z"), st("R2", "Lost", "Follow-Up", "2026-09-20T00:00:00Z"),
      st("L3", "Follow-Up", "Lost", "2026-09-10T00:00:00Z"),
    ],
    conversionEvents: [conv("R1", "2026-09-15T00:00:00Z")],
  });
  assert.equal(r.everLost, 3);
  assert.equal(r.revived, 2);
  assert.equal(r.stillLost, 1);
  assert.equal(r.revivedConverted, 1);
  assert.equal(Math.round(r.revivalRate * 100), 67);
  const r1 = r.revivedRows.find((x) => x.leadId === "R1")!;
  assert.equal(r1.daysLost, 4); assert.equal(r1.revivedBy, "Priya"); assert.equal(r1.lostReason, "Price"); assert.equal(r1.convertedAfterRevival, true);
  assert.equal(r.revivedRows.find((x) => x.leadId === "R2")!.convertedAfterRevival, false);
});

test("a conversion that happened BEFORE the lead was lost does not count as revived-and-converted", () => {
  const r = buildLeadJourneyReport({
    cohort: [lead("X", { linkedTicketId: "T" })], revenue: rev, followUps: [],
    statusEvents: [st("X", "Follow-Up", "Lost", "2026-09-10T00:00:00Z"), st("X", "Lost", "Follow-Up", "2026-09-12T00:00:00Z")],
    conversionEvents: [conv("X", "2026-09-05T00:00:00Z", "ticket_created")],
  });
  assert.equal(r.revived, 1); assert.equal(r.revivedConverted, 0);
});

test("no status history → revival is not measurable (flagged, not zero-as-fact)", () => {
  const r = buildLeadJourneyReport({ cohort: [lead("A")], revenue: rev, followUps: [], statusEvents: [], conversionEvents: [] });
  assert.equal(r.hasStatusHistory, false);
  assert.ok(r.notes.some((n) => /Lost → Revived cannot be measured/.test(n)));
});

const base = { revenue: rev, followUps: [] as LeadFollowUp[], conversionEvents: [] as LeadConversionEvent[], statusEvents: [] as LeadStatusEvent[] };

test("where leads get lost = the stage they left, and stage movement counts every transition", () => {
  const r = buildLeadJourneyReport({
    ...base, cohort: [lead("A"), lead("B"), lead("C")],
    statusEvents: [
      st("A", "New Lead", "Follow-Up", "2026-09-02T00:00:00Z"), st("A", "Follow-Up", "Lost", "2026-09-03T00:00:00Z"),
      st("B", "New Lead", "Follow-Up", "2026-09-02T00:00:00Z"), st("B", "Follow-Up", "Lost", "2026-09-04T00:00:00Z"),
      st("C", "New Lead", "Lost", "2026-09-05T00:00:00Z"),
    ],
  });
  assert.deepEqual(r.lostWhere.map((x) => [x.stage, x.count]), [["Follow-Up", 2], ["New Lead", 1]]);
  assert.equal(r.totalMoves, 5);
  const top = r.transitions.filter((t) => t.moves === 2).map((t) => `${t.from}→${t.to}`).sort();
  assert.deepEqual(top, ["Follow-Up→Lost", "New Lead→Follow-Up"]);
});

test("speed: median days from creation, shown only with 3+ leads, never negative", () => {
  const mk = (id: string, days: number) => lead(id, { firstContactedAt: new Date(new Date("2026-09-01T09:00:00Z").getTime() + days * 86_400_000).toISOString() });
  const r = buildLeadJourneyReport({ ...base, cohort: [mk("a", 1), mk("b", 3), mk("c", 5), lead("d", { firstContactedAt: "2026-08-01T00:00:00Z" })], statusEvents: [], });
  const contact = r.speed.find((s) => s.key === "contact")!;
  assert.equal(contact.n, 3); assert.equal(contact.medianDays, 3);
  assert.equal(r.speed.find((s) => s.key === "qualified")!.medianDays, null);
});

test("routes: conversion per route, 'Not routed yet' for the rest", () => {
  const r = buildLeadJourneyReport({
    ...base, cohort: [lead("a", { fulfilmentRoute: "ON_SITE", linkedFieldJobId: "FJ" }), lead("b", { fulfilmentRoute: "ON_SITE" }), lead("c", { fulfilmentRoute: "" as any })],
    conversionEvents: [conv("a", "2026-09-03T00:00:00Z")],
  });
  const on = r.routes.find((x) => x.route === "ON_SITE")!;
  assert.equal(on.leads, 2); assert.equal(on.converted, 1);
  assert.ok(r.routes.some((x) => x.label === "Not routed yet"));
});

test("deals, quotations and reassignment compare converted vs not", () => {
  const leads = [lead("a", { linkedFieldJobId: "FJ" }), lead("b"), lead("c", { linkedTicketId: "T" })];
  const r = buildLeadJourneyReport({
    ...base, cohort: leads, conversionEvents: [conv("a", "2026-09-03T00:00:00Z"), conv("c", "2026-09-03T00:00:00Z", "ticket_created")],
    deals: [{ id: "d1", leadId: "a", status: "approved", createdAt: "2026-09-02T00:00:00Z" } as any, { id: "d2", leadId: "b", status: "rejected", createdAt: "2026-09-02T00:00:00Z" } as any],
    quotations: [{ id: "q1", leadId: "c", status: "sent", sentAt: "2026-09-02T00:00:00Z" } as any, { id: "q2", leadId: "b", status: "draft", sentAt: "" } as any],
    assignmentEvents: [{ id: "x", leadId: "b", fromUserId: "u1", toUserId: "u2", createdAt: "2026-09-02T00:00:00Z" }, { id: "y", leadId: "a", fromUserId: "", toUserId: "u1", createdAt: "2026-09-01T00:00:00Z" }],
  });
  assert.equal(r.deals.leadsWithDeal, 2);
  assert.equal(r.deals.compare.find((c) => c.key === "approved")!.converted, 1);
  assert.equal(r.deals.compare.find((c) => c.key === "rejected")!.converted, 0);
  assert.equal(r.quotations.sent, 1);                                      // the draft is not "sent"
  assert.equal(r.quotations.compare.find((c) => c.key === "quoted")!.converted, 1);
  assert.equal(r.ownership.reassigned, 1);                                 // first-time assignment is not a reassignment
  assert.equal(r.ownership.compare.find((c) => c.key === "reassigned")!.converted, 0);
});
