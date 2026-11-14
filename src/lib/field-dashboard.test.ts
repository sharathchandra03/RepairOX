import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummaryRows, buildMasterRows, sumRows, boundsForPreset, tripGroupOf, availableYears, type AggregateCtx } from "./field-dashboard";
import type { FieldJob } from "./field-data";

let n = 0;
const job = (o: Partial<FieldJob>): FieldJob => ({
  id: `j${++n}`, jobNo: `FJ-${n}`, leadId: "", leadNo: "", customerId: "", linkedTicketId: "", linkedTicketDeviceId: "", linkedInvoiceId: "",
  leadType: "pickup", source: "", customer: "", phone: "", email: "", device: "", modelId: "", category: "", issue: "", branch: "KOR",
  salesPersonId: "", salesPersonName: "", fieldManagerId: "", fieldManagerName: "", ninjaId: "", ninjaName: "", dropNinjaId: "", dropNinjaName: "",
  pickupAddress: "", pickupDate: "2026-03-10", pickupTime: "", dropAddress: "", dropDate: "", dropTime: "", status: "pending_assignment",
  notes: "", deliveryConfirmed: false, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z", ...o,
});
const inv: Record<string, { id: string; total: number }> = {};
const ctx: AggregateCtx = {
  finalizedInvoiceOf: (j) => inv[j.id] ?? null,
  storeKeyOf: (j) => ({ key: j.branch, label: j.branch }),
};

test("trip groups", () => {
  assert.equal(tripGroupOf({ leadType: "warranty_onsite" }), "onsite");
  assert.equal(tripGroupOf({ leadType: "warranty_pickup" }), "pickup");
  assert.equal(tripGroupOf({ leadType: "drop" }), "drop");
});

test("assigned vs completed; cancelled excluded; counts reconcile with jobIds", () => {
  const jobs = [
    job({ branch: "KOR", ninjaId: "a", ninjaName: "Biju", status: "completed" }),
    job({ branch: "KOR", ninjaId: "a", ninjaName: "Biju", status: "assigned" }),
    job({ branch: "KOR", status: "pending_assignment" }),
    job({ branch: "KOR", ninjaId: "a", ninjaName: "Biju", status: "cancelled" }),
    job({ branch: "IND", leadType: "onsite", ninjaId: "b", ninjaName: "Irfan", status: "completed" }),
  ];
  const rows = buildSummaryRows(jobs, "store", { from: null, to: null }, ctx);
  const kor = rows.find((r) => r.key === "KOR")!;
  assert.equal(kor.totalTrips, 3);
  assert.equal(kor.pickup.total, 3);
  assert.equal(kor.pickup.assigned, 2);
  assert.equal(kor.pickup.completed, 1);
  assert.equal(kor.jobIds.length, kor.totalTrips);
  const ind = rows.find((r) => r.key === "IND")!;
  assert.equal(ind.onsite.completed, 1);
  assert.equal(sumRows(rows).totalTrips, 4);
});

test("business: finalized invoices only, each invoice once, null when none", () => {
  const a = job({ branch: "KOR", ninjaId: "a", status: "completed" });
  const b = job({ branch: "KOR", ninjaId: "a", status: "completed" });
  const c = job({ branch: "IND", ninjaId: "a", status: "completed" });
  inv[a.id] = { id: "INV1", total: 5000 };
  inv[b.id] = { id: "INV1", total: 5000 }; // same invoice via 2nd trip => counted once
  const rows = buildSummaryRows([a, b, c], "store", { from: null, to: null }, ctx);
  assert.equal(rows.find((r) => r.key === "KOR")!.business, 5000);
  assert.equal(rows.find((r) => r.key === "IND")!.business, null);
  assert.equal(sumRows(rows).business, 5000);
});

test("date presets and inclusive bounds", () => {
  const today = new Date(2026, 4, 15); // 15 May 2026
  assert.deepEqual(boundsForPreset("month", "", "", today), { from: "2026-05-01", to: "2026-05-31" });
  assert.deepEqual(boundsForPreset("lastmonth", "", "", today), { from: "2026-04-01", to: "2026-04-30" });
  assert.deepEqual(boundsForPreset("today", "", "", today), { from: "2026-05-15", to: "2026-05-15" });
  assert.deepEqual(boundsForPreset("all", "", "", today), { from: null, to: null });
  const rows = buildSummaryRows([job({ pickupDate: "2026-04-30" }), job({ pickupDate: "2026-05-01" })], "store", boundsForPreset("lastmonth", "", "", today), ctx);
  assert.equal(rows[0].totalTrips, 1);
});

test("FE grouping includes an Unassigned bucket", () => {
  const rows = buildSummaryRows([job({ ninjaId: "a", ninjaName: "Biju" }), job({})], "engineer", { from: null, to: null }, ctx);
  assert.deepEqual(rows.map((r) => r.label).sort(), ["Biju", "Unassigned"]);
});

test("master: dynamic year, month cells reconcile with year totals", () => {
  const jobs = [
    job({ branch: "KOR", pickupDate: "2025-01-05" }),
    job({ branch: "KOR", pickupDate: "2025-01-20", leadType: "drop" }),
    job({ branch: "KOR", pickupDate: "2025-03-02", leadType: "onsite" }),
    job({ branch: "KOR", pickupDate: "2026-01-02" }),
  ];
  const m25 = buildMasterRows(jobs, "store", 2025, ctx);
  assert.equal(m25.length, 1);
  assert.equal(m25[0].months[0].totalTrips, 2);
  assert.equal(m25[0].months[0].drop.total, 1);
  assert.equal(m25[0].months[2].onsite.total, 1);
  assert.equal(m25[0].months.reduce((s, c) => s + c.totalTrips, 0), m25[0].yearTrips);
  assert.equal(buildMasterRows(jobs, "store", 2026, ctx)[0].yearTrips, 1);
  assert.deepEqual(availableYears(jobs, new Date(2026, 0, 1)), [2026, 2025]);
});

test("warranty split (NEW = total - warranty) and business broken up by trip group", () => {
  const a = job({ branch: "KOR", leadType: "pickup", ninjaId: "a" });
  const b = job({ branch: "KOR", leadType: "warranty_pickup", ninjaId: "a" });
  const c = job({ branch: "KOR", leadType: "onsite", ninjaId: "a", status: "completed" });
  const d = job({ branch: "KOR", leadType: "drop", ninjaId: "a", status: "completed" });
  inv[c.id] = { id: "INV-C", total: 20000 };
  inv[d.id] = { id: "INV-D", total: 15000 };
  const r = buildSummaryRows([a, b, c, d], "store", { from: null, to: null }, ctx)[0];
  assert.equal(r.pickup.total, 2);
  assert.equal(r.pickup.warranty, 1);
  assert.equal(r.pickup.total - r.pickup.warranty, 1);
  assert.equal(r.business, 35000);
  assert.deepEqual(r.groupBusiness, { onsite: 20000, pickup: null, drop: 15000 });
  const t = sumRows([r]);
  assert.equal(t.groupBusiness.drop, 15000);
  const m = buildMasterRows([a, b, c, d], "store", 2026, ctx)[0].months[2];
  assert.equal(m.groupBusiness.onsite, 20000);
  assert.equal(m.pickup.warranty, 1);
});
test("sales agent and source are separate dimensions from the engineer; lead sync counts", () => {
  const jobs = [
    job({ leadId: "L1", salesPersonId: "s1", salesPersonName: "Asha", ninjaId: "e1", ninjaName: "Biju", source: "Google", linkedTicketId: "T1" }),
    job({ leadId: "L2", salesPersonId: "s1", salesPersonName: "Asha", ninjaId: "e2", ninjaName: "Irfan", source: "google" }),
    job({ salesPersonId: "", source: "" }),
  ];
  const byAgent = buildSummaryRows(jobs, "agent", { from: null, to: null }, ctx);
  const asha = byAgent.find((r) => r.key === "s1")!;
  assert.equal(asha.totalTrips, 2); assert.equal(asha.leadTrips, 2); assert.equal(asha.ticketed, 1);
  assert.equal(byAgent.find((r) => r.key === "none")!.label, "Direct (no lead)");
  assert.equal(buildSummaryRows(jobs, "engineer", { from: null, to: null }, ctx).length, 3);
  assert.equal(buildSummaryRows(jobs, "source", { from: null, to: null }, ctx).find((r) => r.key === "google")!.totalTrips, 2);
  assert.deepEqual(boundsForPreset("7days", "", "", new Date(2026, 4, 15)), { from: "2026-05-09", to: "2026-05-15" });
});
