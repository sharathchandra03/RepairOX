import { test } from "node:test";
import assert from "node:assert/strict";
import { searchLeads, pickBestLead, leadNumber } from "./lead-picker-search";
import type { Lead } from "./leads-data";

const L = (o: Partial<Lead>): Lead => ({
  id: o.leadNo ?? "x", leadNo: "L-001", name: "", number: "", alternateNumber: "", email: "", device: "", issue: "", source: "", region: "",
  location: "", locationUnit: "", status: "", contactStatus: "", category: "", leadCategory: "", subCategory: "", assignedToName: "",
  comments: "", finalRemarks: "", customerId: "", captureChannel: "", ...o,
} as unknown as Lead);

const leads = [
  L({ leadNo: "L-009", name: "Arjun Mehta", number: "9876543210", email: "arjun@gmail.com", device: "iPhone 14", issue: "Cracked screen", source: "Google" }),
  L({ leadNo: "L-019", name: "Priya Nair", number: "9123456789", alternateNumber: "8660771346", email: "priya@x.in", device: "Dell XPS 15", issue: "No power" }),
  L({ leadNo: "L-031", name: "Shashank Rao", number: "+91 86607-71346", email: "shashank@x.in", device: "Dell XPS 15", issue: "Battery", region: "Bangalore" }),
  L({ leadNo: "L-0090", name: "Zed", number: "7000000000" }),
];

test("lead number parsing", () => {
  assert.equal(leadNumber("L-009"), 9);
  assert.equal(leadNumber("KOR-L-0045"), 45);
  assert.equal(leadNumber(""), null);
});
test("bare numbers find the lead: 009, 9, 31, 031, l9, L-009", () => {
  for (const q of ["009", "9", "L-009", "l9", "L009"]) assert.equal(searchLeads(leads, q)[0].leadNo, "L-009", q);
  for (const q of ["31", "031", "L-031"]) assert.equal(searchLeads(leads, q)[0].leadNo, "L-031", q);
});
test("exact number outranks partial: '9' → L-009 first (not L-019 / L-0090)", () => {
  const r = searchLeads(leads, "9");
  assert.equal(r[0].leadNo, "L-009");
});
test("mobile (any format, primary or alternate)", () => {
  assert.equal(searchLeads(leads, "8660771346")[0].leadNo !== undefined, true);
  const r = searchLeads(leads, "+91 86607 71346").map((l) => l.leadNo);
  assert.ok(r.includes("L-031") && r.includes("L-019"));
  assert.equal(searchLeads(leads, "98765")[0].leadNo, "L-009");
});
test("email, name, device, issue, region, source", () => {
  assert.equal(searchLeads(leads, "arjun@gmail.com")[0].leadNo, "L-009");
  assert.equal(searchLeads(leads, "shash")[0].leadNo, "L-031");
  assert.equal(searchLeads(leads, "xps").length, 2);
  assert.equal(searchLeads(leads, "cracked")[0].leadNo, "L-009");
  assert.equal(searchLeads(leads, "bangalore")[0].leadNo, "L-031");
  assert.equal(searchLeads(leads, "google")[0].leadNo, "L-009");
});
test("multi-word is AND across fields", () => {
  assert.deepEqual(searchLeads(leads, "dell battery").map((l) => l.leadNo), ["L-031"]);
  assert.equal(searchLeads(leads, "dell nonsense").length, 0);
});
test("pickBestLead: exact id/phone resolves, ambiguous does not", () => {
  assert.equal(pickBestLead(leads, "009")?.leadNo, "L-009");
  assert.equal(pickBestLead(leads, "9876543210")?.leadNo, "L-009");
  assert.equal(pickBestLead(leads, "xps"), null);
  assert.equal(pickBestLead(leads, "zzz"), null);
});
