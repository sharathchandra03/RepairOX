import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldTripAction, matchesFieldSearch, normalizePhoneDigits, tripValue, latestTripComment, TRIP_ACTION_LABELS } from "./field-table";
import { jobMatchesQueue, type FieldJob, type FieldJobEvent } from "./field-data";

const job = (o: Partial<FieldJob> = {}): FieldJob => ({
  id: "j1", jobNo: "KOR-FJ-001", leadId: "l1", leadNo: "L-031", customerId: "c1",
  linkedTicketId: "", linkedTicketDeviceId: "", linkedInvoiceId: "", leadType: "pickup", source: "Google",
  customer: "Shashank Rao", phone: "+91 98765-43210", email: "s@x.com", device: "iPhone 15 Pro", modelId: "", category: "",
  issue: "Display issue", branch: "Koramangala", salesPersonId: "", salesPersonName: "", fieldManagerId: "", fieldManagerName: "",
  ninjaId: "n1", ninjaName: "Biju", dropNinjaId: "", dropNinjaName: "", pickupAddress: "12 MG Road", pickupDate: "", pickupTime: "",
  dropAddress: "", dropDate: "", dropTime: "", status: "pending_assignment", notes: "", deliveryConfirmed: false,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...o,
});
const r = { customerName: "Shashank Rao", contact: "98765 43210", email: "s@x.com", model: "iPhone 15 Pro", ticketNo: "T-079", invoiceId: "INV-9" };

test("action of trip: derived from the EXISTING status; every label is in the vocabulary", () => {
  const statuses = ["pending_assignment","assigned","pickup_scheduled","out_for_pickup","picked_up","at_store","in_repair","ready_for_drop","drop_scheduled","out_for_drop","delivered","completed","cancelled","failed_pickup","failed_drop"] as const;
  for (const status of statuses) for (const leadType of ["pickup","onsite"] as const) {
    const a = fieldTripAction({ status, leadType, linkedTicketId: "" });
    assert.ok(TRIP_ACTION_LABELS.includes(a.label), `${status}/${leadType} -> ${a.label}`);
  }
});

test("action of trip: pickup/drop, on-site, repaired", () => {
  assert.equal(fieldTripAction({ status: "picked_up", leadType: "pickup", linkedTicketId: "" }).label, "Pickup Completed");
  assert.equal(fieldTripAction({ status: "completed", leadType: "onsite", linkedTicketId: "" }).label, "On-Site Completed");
  assert.equal(fieldTripAction({ status: "completed", leadType: "pickup", linkedTicketId: "" }).label, "Pickup & Dropped");
  assert.equal(fieldTripAction({ status: "completed", leadType: "pickup", linkedTicketId: "t1" }).label, "Repaired & Delivered");
  assert.equal(fieldTripAction({ status: "out_for_drop", leadType: "pickup", linkedTicketId: "t1" }).label, "In Transit");
  assert.equal(fieldTripAction({ status: "in_repair", leadType: "pickup", linkedTicketId: "t1" }).label, "Repair In Progress");
});

test("search: trip id, lead id, name, device, imei, ticket, invoice, FE, store", () => {
  const j = job({ imei: "356938035643809" });
  for (const q of ["kor-fj-001", "l-031", "shashank", "iphone", "356938", "t-079", "inv-9", "biju", "koramangala", "display"]) {
    assert.equal(matchesFieldSearch(q, j, r), true, q);
  }
  assert.equal(matchesFieldSearch("nonexistent", j, r), false);
  assert.equal(matchesFieldSearch("", j, r), true);
});

test("search: Indian phone normalisation (+91, spaces, hyphens)", () => {
  assert.equal(normalizePhoneDigits("+91 98765-43210"), "9876543210");
  const j = job();
  assert.equal(matchesFieldSearch("+91 98765 43210", j, r), true);
  assert.equal(matchesFieldSearch("9876543210", j, r), true);
  assert.equal(matchesFieldSearch("98765", j, r), true);
  assert.equal(matchesFieldSearch("11111", j, r), false);
});

test("value: only a FINALIZED invoice is realised; draft/proforma/unpaid are separate", () => {
  assert.deepEqual(tripValue({ invoice: null, invoiceAmount: null }), { finalized: null, pendingAmount: null, pendingLabel: "" });
  const paid = tripValue({ invoice: { status: "paid", documentType: "invoice", total: 5000 } as any, invoiceAmount: 5000 });
  assert.equal(paid.finalized, 5000);
  const draft = tripValue({ invoice: { status: "draft", documentType: "invoice", total: 5000 } as any, invoiceAmount: 5000 });
  assert.equal(draft.finalized, null);
  assert.equal(draft.pendingAmount, 5000);
  assert.equal(draft.pendingLabel, "Draft");
  assert.equal(tripValue({ invoice: { status: "paid", documentType: "proforma", total: 10 } as any, invoiceAmount: 10 }).finalized, null);
  assert.equal(tripValue({ invoice: { status: "cancelled", documentType: "invoice", total: 10 } as any, invoiceAmount: 10 }).pendingLabel, "Cancelled");
});

test("latest comment prefers the newest communication note over job notes", () => {
  const ev = (id: string, at: string, note: string, kind: any = "communication"): FieldJobEvent => ({
    id, jobId: "j1", jobNo: "", leadId: "", kind, previous: null, next: null, note, source: "", actorId: "", actorName: "", occurredAt: at,
  });
  assert.equal(latestTripComment({ id: "j1", notes: "old" }, [ev("a", "2026-01-01", "first"), ev("b", "2026-01-02", "second")]), "second");
  assert.equal(latestTripComment({ id: "j1", notes: "old" }, [ev("a", "2026-01-01", "sys", "status_changed")]), "old");
  assert.equal(latestTripComment({ id: "j1", notes: "" }, []), "");
});

test("combined KPI queues are unions of the atomic queues and count each trip once", () => {
  const now = new Date("2026-05-15T10:00:00");
  const today = "2026-05-15";
  const pending = job({ id: "a", status: "pending_assignment", pickupDate: "2026-05-01" }); // pending AND delayed
  const delayed = job({ id: "b", status: "assigned", pickupDate: "2026-05-02", ninjaId: "n" });
  const store = job({ id: "c", status: "at_store" });
  const ready = job({ id: "d", status: "ready_for_drop" });
  const visitP = job({ id: "e", status: "pickup_scheduled", pickupDate: today, ninjaId: "n" });
  const visitD = job({ id: "f", status: "out_for_drop", dropDate: today, dropNinjaId: "n" });
  const all = [pending, delayed, store, ready, visitP, visitD];
  const n = (q: any) => all.filter((j) => jobMatchesQueue(j, q, now)).length;
  assert.equal(n("needs_action"), 2);                 // a (both rules) counted ONCE + b
  assert.ok(n("needs_action") <= n("pending_assignment") + n("delayed"));
  assert.equal(n("in_store"), n("at_store") + n("ready_for_drop"));
  assert.equal(n("in_store"), 2);
  assert.equal(n("today_visits"), n("today_pickup") + n("today_drop"));
  assert.equal(n("today_visits"), 2);
});

test("search finds a SECOND device on a multi-device trip (label, issue, IMEI)", () => {
  const j = job({ devices: [
    { id: "a", label: "iPhone 14", categoryId: "", brandId: "", modelId: "", imei: "", issue: "Screen", condition: "", accessories: "" },
    { id: "b", label: "MacBook Air M3", categoryId: "", brandId: "", modelId: "", imei: "C02XYZ123", issue: "Keyboard dead", condition: "", accessories: "" },
  ] });
  for (const q of ["macbook", "keyboard", "c02xyz", "iphone"]) assert.equal(matchesFieldSearch(q, j, r), true, q);
  assert.equal(matchesFieldSearch("thinkpad", j, r), false);
});
