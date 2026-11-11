import { test } from "node:test";
import assert from "node:assert/strict";
import { leadToTripPrefill, tripTypeForLead, prefillSummary, leadGapPatch } from "./lead-to-trip";
import { EMPTY_LOCATION } from "./field-location";
import type { Lead } from "./leads-data";

const L = (o: Partial<Lead>): Lead => ({
  id: "l1", leadNo: "L-030", name: "Imran Sir", number: "9900322007", alternateNumber: "", email: "", source: "Google", customerId: "c1",
  device: "", issue: "", location: "", locationUnit: "", locationLat: null, locationLng: null, locationMapsUrl: "",
  comments: "", status: "", fulfilmentRoute: "", branchId: "b1", assignedTo: "u1", assignedToName: "Ram Avtar", ...o,
} as unknown as Lead);

test("multi-device lead: ALL devices carry over with ids + issues", () => {
  const lead = L({ devices: [
    { id: "d1", label: "Dell Dell XPS 15", categoryId: "laptop", brandId: "dell", modelId: "xps15", issue: "Battery Drain", category: "", subCategory: "", estimate: null, discount: null, discountType: "amount" },
    { id: "d2", label: "iPhone 15", categoryId: "phone", brandId: "apple", modelId: "i15", issue: "Display", category: "", subCategory: "", estimate: null, discount: null, discountType: "amount" },
  ] } as any);
  const p = leadToTripPrefill(lead);
  assert.equal(p.devices.length, 2);
  assert.deepEqual(p.devices.map((d) => d.label), ["Dell Dell XPS 15", "iPhone 15"]);
  assert.equal(p.devices[0].modelId, "xps15"); assert.equal(p.devices[1].issue, "Display");
  assert.ok(p.filled.includes("devices")); assert.match(prefillSummary(p), /2 devices/);
});
test("legacy single-device lead still produces one device", () => {
  const p = leadToTripPrefill(L({ device: "Pixel 8", issue: "Battery", deviceModelId: "px8", deviceBrandId: "google", deviceCategoryId: "phone" } as any));
  assert.equal(p.devices.length, 1); assert.equal(p.devices[0].label, "Pixel 8");
});
test("contact, customer, source, store, comment and sales fields come across", () => {
  const p = leadToTripPrefill(L({ alternateNumber: "8660771346", email: "i@x.in", comments: "Customer prefers evening", branchId: "b9" }));
  assert.equal(p.customerId, "c1"); assert.equal(p.phone, "9900322007"); assert.equal(p.altPhone, "8660771346"); assert.equal(p.email, "i@x.in");
  assert.equal(p.source, "Google"); assert.equal(p.storeId, "b9"); assert.equal(p.comment, "Customer prefers evening");
});
test("location: address + unit, pin, maps link, PIN extracted from text", () => {
  const p = leadToTripPrefill(L({ location: "Indiranagar, Bengaluru 560038", locationUnit: "Flat 4", locationLat: 12.97, locationLng: 77.64, locationMapsUrl: "https://maps.app.goo.gl/x" }));
  assert.equal(p.location.address, "Flat 4, Indiranagar, Bengaluru 560038");
  assert.equal(p.location.pincode, "560038"); assert.equal(p.location.lat, 12.97); assert.equal(p.location.mapsUrl, "https://maps.app.goo.gl/x");
});
test("trip type follows the Sales route, then the status wording", () => {
  assert.equal(tripTypeForLead({ fulfilmentRoute: "ON_SITE", status: "" } as any), "onsite");
  assert.equal(tripTypeForLead({ fulfilmentRoute: "PICKUP_DROP", status: "On site Assigned" } as any), "pickup");
  assert.equal(tripTypeForLead({ fulfilmentRoute: "", status: "On site Assigned" } as any), "onsite");
  assert.equal(tripTypeForLead({ fulfilmentRoute: "", status: "New" } as any), "pickup");
});
test("reverse sync only FILLS EMPTY lead fields, never overwrites", () => {
  const loc = { ...EMPTY_LOCATION, address: "12 MG Road", lat: 12.9, lng: 77.6, mapsUrl: "https://maps.app.goo.gl/q" };
  assert.deepEqual(leadGapPatch({ location: "", locationLat: null, locationLng: null, locationMapsUrl: "", alternateNumber: "", email: "" } as any, { loc, altPhone: "8660771346", email: "a@b.c" }),
    { location: "12 MG Road", locationLat: 12.9, locationLng: 77.6, locationMapsUrl: "https://maps.app.goo.gl/q", alternateNumber: "8660771346", email: "a@b.c" });
  assert.deepEqual(leadGapPatch({ location: "Existing", locationLat: 1, locationLng: 2, locationMapsUrl: "u", alternateNumber: "9", email: "e@e.e" } as any, { loc, altPhone: "8", email: "z@z.z" }), {});
});
