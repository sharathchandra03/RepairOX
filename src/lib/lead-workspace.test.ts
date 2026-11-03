import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLeadFilters, contactStatusClass, EMPTY_LEAD_FILTERS, isFreshAssignment, isNotContactedActive,
  isNotContactedHistory, notContactedFocusOf, type Lead, type LeadFilters, type LeadFollowUp,
} from "./leads-data";
import { isInListDateRangeTz } from "./date-filter";

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1", branchId: "s1", leadNo: "L-001", date: "2026-11-03", time: "09:00", month: "2026-11",
    region: "", source: "Google", modeOfContact: "", captureChannel: "Phone", agent: "Ahmed", qualification: "",
    name: "Cust", number: "9000000000", alternateNumber: "", email: "", location: "", locationUnit: "",
    locationLat: null, locationLng: null, locationMapsUrl: "", device: "", deviceCategoryId: "", deviceBrandId: "",
    deviceModelId: "", issue: "", category: "", subCategory: "", estimate: null, discount: null, discountType: "amount",
    devices: [], leadCategory: "", leadNature: "", priority: "", comments: "", contactStatus: "Not Contacted",
    status: "New Lead", result: "", finalRemarks: "", followUpDate: "", followUpAgent: "", followUpAgentId: "",
    finalResult: "", followUpComments: "", notContactedSince: "2026-11-03T09:00:00Z",
    assignedTo: "ahmed", assignedToName: "Ahmed", assignedBy: "coord", assignedByName: "Coord",
    assignedAt: "2026-11-03T09:00:00Z", createdAt: "2026-11-03T08:59:00Z",
    ...over,
  } as Lead;
}
const f = (over: Partial<LeadFilters>): LeadFilters => ({ ...EMPTY_LEAD_FILTERS, ...over });
const ids = (ls: Lead[]) => ls.map((l) => l.id).sort();

test("contact class: not contacted / attempted / contacted", () => {
  assert.equal(contactStatusClass(""), "unset");
  assert.equal(contactStatusClass("Not Contacted"), "not_contacted");
  for (const s of ["RNR", "Busy", "Switched Off", "No Answer", "Not Reachable", "Not Connected"]) {
    assert.equal(contactStatusClass(s), "attempted", s);
  }
  assert.equal(contactStatusClass("Contacted"), "contacted");
  assert.equal(contactStatusClass("Connected"), "contacted");
});

test("scenario 1: fresh manual assignment is in Assigned + All, not in Follow-ups", () => {
  const l = lead();
  assert.equal(isFreshAssignment(l, false), true);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "assigned" }), undefined, new Set())), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "all" }), undefined, new Set())), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "followUps" }), undefined, new Set())), []);
});

test("scenario 2: unsuccessful attempt leaves the inbox, stays in All, lands in Not Contacted (attempted)", () => {
  const l = lead({ contactStatus: "RNR", firstActionAt: "2026-11-03T09:10:00Z" });
  assert.equal(isFreshAssignment(l, false), false);
  assert.equal(isNotContactedActive(l), true);
  assert.equal(notContactedFocusOf(l), "attempted");
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "assigned" }), undefined, new Set())), []);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "all" }), undefined, new Set())), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "notContacted", ncFocus: "attempted" }), undefined, new Set())), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "notContacted", ncFocus: "awaiting" }), undefined, new Set())), []);
});

test("scenario 3: successful contact moves Active → History and out of the inbox", () => {
  const l = lead({ contactStatus: "Contacted", firstActionAt: "2026-11-03T09:20:00Z", firstContactedAt: "2026-11-03T09:20:00Z" });
  assert.equal(isNotContactedActive(l), false);
  assert.equal(isNotContactedHistory(l), true);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "notContacted", ncSub: "active" }), undefined, new Set())), []);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "notContacted", ncSub: "history" }), undefined, new Set())), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "assigned" }), undefined, new Set())), []);
});

test("unset contact status: in the Assigned inbox, NOT in Not Contacted; explicit Not Contacted is in both", () => {
  const fresh = lead({ contactStatus: "" });
  assert.equal(isFreshAssignment(fresh, false), true);
  assert.equal(isNotContactedActive(fresh), false);
  assert.deepEqual(ids(applyLeadFilters([fresh], f({ view: "assigned" }), undefined, new Set())), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([fresh], f({ view: "notContacted" }), undefined, new Set())), []);
  const explicit = lead({ contactStatus: "Not Contacted" });
  assert.deepEqual(ids(applyLeadFilters([explicit], f({ view: "notContacted" }), undefined, new Set())), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([explicit], f({ view: "assigned" }), undefined, new Set())), ["l1"]);
});

test("born-contacted lead never appears in Not Contacted history", () => {
  const l = lead({ contactStatus: "Contacted" });
  assert.equal(isNotContactedHistory(l), false);
});

test("scenario 5: not contacted + open follow-up overlap (inbox excludes, NC + Follow-ups include)", () => {
  const l = lead({ contactStatus: "RNR", firstActionAt: "2026-11-03T09:10:00Z" });
  const fu = new Set(["l1"]);
  const open = new Map<string, LeadFollowUp>();
  assert.equal(isFreshAssignment(l, true), false);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "notContacted" }), open, fu)), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "followUps" }), open, fu)), ["l1"]);
  assert.deepEqual(ids(applyLeadFilters([l], f({ view: "all" }), open, fu)), ["l1"]);
});

test("scheduling a follow-up on an untouched lead removes it from the inbox", () => {
  assert.equal(isFreshAssignment(lead(), true), false);
});

test("terminal leads leave the inbox and Not Contacted Active", () => {
  const lost = lead({ lostAt: "2026-11-03T10:00:00Z" });
  assert.equal(isFreshAssignment(lost, false), false);
  assert.equal(isNotContactedActive(lost), false);
});

test("unassigned lead is never a fresh assignment", () => {
  assert.equal(isFreshAssignment(lead({ assignedTo: "", assignedAt: "" }), false), false);
});

test("inbox owner scope: a non-see-all user only sees their own fresh assignments", () => {
  const mine = lead({ id: "a", assignedTo: "ahmed" });
  const theirs = lead({ id: "b", assignedTo: "ullas" });
  const out = applyLeadFilters([mine, theirs], f({ view: "assigned", ownerScope: "ahmed" }), undefined, new Set());
  assert.deepEqual(ids(out), ["a"]);
  const team = applyLeadFilters([mine, theirs], f({ view: "assigned", ownerScope: "" }), undefined, new Set());
  assert.deepEqual(ids(team), ["a", "b"]);
});

test("All Leads keeps a LOCKED (48h) not-contacted lead; it appears exactly once", () => {
  const stale = lead({ id: "old", notContactedSince: "2020-01-01T00:00:00Z", createdAt: "2020-01-01T00:00:00Z" });
  const out = applyLeadFilters([stale], f({ view: "all" }), undefined, new Set(["old", "old"]));
  assert.deepEqual(ids(out), ["old"]);
});

test("assigned view date filter uses assigned_at (not created_at)", () => {
  const l = lead({ createdAt: "2026-01-01T00:00:00Z", assignedAt: new Date().toISOString() });
  const out = applyLeadFilters([l], f({ view: "assigned", dateRange: "today", timeZone: "Asia/Kolkata" }), undefined, new Set());
  assert.deepEqual(ids(out), ["l1"]);
  const all = applyLeadFilters([l], f({ view: "all", dateRange: "today" }), undefined, new Set());
  assert.deepEqual(ids(all), []);
});

test("org-timezone today/yesterday boundaries", () => {
  // 2026-11-03 20:00 UTC = 2026-11-04 01:30 IST; "now" is 2026-11-04 02:00 IST.
  const now = Date.parse("2026-11-03T20:30:00Z");
  const row = "2026-11-03T20:00:00Z";
  assert.equal(isInListDateRangeTz(row, "today", undefined, undefined, "Asia/Kolkata", now), true);
  assert.equal(isInListDateRangeTz(row, "yesterday", undefined, undefined, "Asia/Kolkata", now), false);
  // In UTC the same instant is still "today" for both now and row — and the IST "yesterday" row is today.
  const earlier = "2026-11-03T10:00:00Z"; // 15:30 IST on 3 Nov
  assert.equal(isInListDateRangeTz(earlier, "yesterday", undefined, undefined, "Asia/Kolkata", now), true);
  assert.equal(isInListDateRangeTz(earlier, "today", undefined, undefined, "Asia/Kolkata", now), false);
  assert.equal(isInListDateRangeTz(earlier, "custom", "2026-11-03", "2026-11-03", "Asia/Kolkata", now), true);
  assert.equal(isInListDateRangeTz(earlier, "custom", "2026-11-04", "2026-11-04", "Asia/Kolkata", now), false);
  assert.equal(isInListDateRangeTz(earlier, "all", undefined, undefined, "Asia/Kolkata", now), true);
  // Invalid timezone falls back instead of throwing.
  assert.doesNotThrow(() => isInListDateRangeTz(row, "today", undefined, undefined, "Not/AZone", now));
});
