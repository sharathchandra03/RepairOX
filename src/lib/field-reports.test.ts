import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, byNinja, funnel, series, exceptions, jobsInWindow } from "./field-reports";
import type { FieldJob } from "./field-data";
let n = 0;
const job = (o: Partial<FieldJob>): FieldJob => ({
  id: `j${++n}`, jobNo: `FJ-${n}`, leadId: "", leadNo: "", customerId: "", linkedTicketId: "", linkedTicketDeviceId: "", linkedInvoiceId: "",
  leadType: "pickup", source: "", customer: "", phone: "", email: "", device: "", modelId: "", category: "", issue: "", branch: "KOR",
  salesPersonId: "", salesPersonName: "", fieldManagerId: "", fieldManagerName: "", ninjaId: "", ninjaName: "", dropNinjaId: "", dropNinjaName: "",
  pickupAddress: "", pickupDate: "2026-03-10", pickupTime: "", dropAddress: "", dropDate: "", dropTime: "", status: "pending_assignment",
  notes: "", deliveryConfirmed: false, createdAt: "2026-03-08T00:00:00Z", updatedAt: "2026-03-08T00:00:00Z", ...o,
});
const inv: Record<string, { id: string; total: number }> = {};
const ctx = { finalizedInvoiceOf: (j: FieldJob) => inv[j.id] ?? null };
const proof = (at: string) => ({ at } as unknown as FieldJob["pickupProof"]);

test("summary: rates, cancelled excluded, business counted once", () => {
  const a = job({ status: "completed", ninjaId: "a", ninjaName: "Biju", pickupProof: proof("2026-03-10T10:00:00Z") });
  const b = job({ status: "completed", ninjaId: "a", ninjaName: "Biju", pickupProof: proof("2026-03-12T10:00:00Z") });
  const c = job({ status: "failed_pickup", ninjaId: "a" });
  const d = job({ status: "cancelled" });
  inv[a.id] = { id: "I1", total: 1000 }; inv[b.id] = { id: "I1", total: 1000 };
  const s = summarize([a, b, c, d], ctx, new Date("2026-03-20"));
  assert.equal(s.total, 3); assert.equal(s.cancelled, 1); assert.equal(s.completed, 2);
  assert.equal(s.completionRate, 67); assert.equal(s.onTimeRate, 50);
  assert.equal(s.business, 1000); assert.equal(s.invoices, 1); assert.equal(s.failedPickup, 1);
  assert.equal(s.avgPickupHours, 82);
});
test("no invoices => business null", () => {
  assert.equal(summarize([job({ status: "completed" })], { finalizedInvoiceOf: () => null }).business, null);
});
test("by ninja groups and totals reconcile", () => {
  const rows = byNinja([job({ ninjaId: "a", ninjaName: "A" }), job({ ninjaId: "a", ninjaName: "A" }), job({})], ctx);
  assert.equal(rows.find((r) => r.key === "a")!.total, 2);
  assert.equal(rows.reduce((x, r) => x + r.total, 0), 3);
});
test("funnel is monotonic", () => {
  const f = funnel([job({}), job({ status: "assigned" }), job({ status: "picked_up" }), job({ status: "completed" }), job({ status: "cancelled" })]);
  assert.deepEqual(f.map((s) => s.count), [4, 3, 2, 1, 1]);
});
test("series switches to monthly past 62 days", () => {
  const d = series([job({ pickupDate: "2026-01-01" }), job({ pickupDate: "2026-05-01" })], ctx);
  assert.equal(d.granularity, "month"); assert.equal(d.points.length, 2);
  assert.equal(series([job({ pickupDate: "2026-01-01" }), job({ pickupDate: "2026-01-05" })], ctx).granularity, "day");
});
test("exceptions + window", () => {
  const rows = exceptions([job({ status: "failed_drop" }), job({ status: "cancelled" }), job({ status: "assigned", pickupDate: "2026-01-01" })], new Date("2026-03-01"));
  assert.deepEqual(rows.map((r) => r.kind), ["delayed", "failed", "cancelled"]);
  assert.equal(jobsInWindow([job({ pickupDate: "2026-03-10" }), job({ pickupDate: "2026-04-10" })], { from: "2026-03-01", to: "2026-03-31" }).length, 1);
});
