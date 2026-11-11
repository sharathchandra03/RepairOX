import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTripDevice, tripDevicesOf, devicesToJobFields, tripDevicesFromLead, validateTripDevices, tripDevicesTitle, tripDevicesSearchText, tripDeviceHasData } from "./field-devices";

const flat = { id: "j1", devices: undefined, device: "iPhone 14", modelId: "m1", category: "phones", deviceCategoryId: "phones", deviceBrandId: "apple", imei: "3569", issue: "Screen", deviceCondition: "Scratched", accessories: "Charger" };

test("legacy single-device rows synthesise one device from the flat fields", () => {
  const l = tripDevicesOf(flat);
  assert.equal(l.length, 1); assert.equal(l[0].label, "iPhone 14"); assert.equal(l[0].imei, "3569"); assert.equal(l[0].condition, "Scratched");
  assert.deepEqual(tripDevicesOf({ ...flat, device: "", modelId: "", category: "", deviceCategoryId: "", deviceBrandId: "", imei: "", issue: "", deviceCondition: "", accessories: "" }), []);
});
test("a stored devices list wins over the flat fields", () => {
  const d = [{ ...emptyTripDevice("a"), label: "Dell XPS 15", issue: "Battery" }];
  assert.equal(tripDevicesOf({ ...flat, devices: d })[0].label, "Dell XPS 15");
});
test("device #1 is mirrored into the flat fields; the list is kept whole", () => {
  const list = [
    { ...emptyTripDevice("a"), label: "iPhone 15", modelId: "m15", categoryId: "phones", brandId: "apple", issue: " Display ", imei: " 123 " },
    { ...emptyTripDevice("b"), label: "MacBook Air", issue: "Battery" },
  ];
  const f = devicesToJobFields(list);
  assert.equal(f.devices!.length, 2);
  assert.equal(f.device, "iPhone 15"); assert.equal(f.issue, "Display"); assert.equal(f.imei, "123"); assert.equal(f.deviceCategoryId, "phones");
  assert.equal(devicesToJobFields([]).device, "");
});
test("lead devices copy over (all of them)", () => {
  const l = tripDevicesFromLead([{ label: "A", issue: "x", modelId: "1" }, { label: "B", issue: "y" }]);
  assert.equal(l.length, 2); assert.notEqual(l[0].id, l[1].id); assert.equal(l[1].issue, "y");
});
test("every device needs a catalog selection and an issue, keyed by id", () => {
  const ok = { ...emptyTripDevice("ok"), label: "X", issue: "i" };
  const bad = emptyTripDevice("bad");
  const half = { ...emptyTripDevice("half"), label: "Y" };
  const e = validateTripDevices([ok, bad, half]);
  assert.equal(e.ok, undefined);
  assert.ok(e.bad.device && e.bad.issue);
  assert.equal(e.half.device, undefined); assert.ok(e.half.issue);
});
test("title, search text and has-data", () => {
  assert.equal(tripDevicesTitle([]), "");
  assert.equal(tripDevicesTitle([{ ...emptyTripDevice("a"), label: "A" }, { ...emptyTripDevice("b"), label: "B" }, { ...emptyTripDevice("c"), label: "C" }]), "A +2 more");
  assert.match(tripDevicesSearchText([{ ...emptyTripDevice("a"), label: "A", imei: "999", issue: "crack" }]), /A crack 999|A.*999/);
  assert.equal(tripDeviceHasData(emptyTripDevice("z")), false);
});
