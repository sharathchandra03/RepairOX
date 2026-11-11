import { test } from "node:test";
import assert from "node:assert/strict";
import { pickReverseResult } from "./reverse-geocode";

const sample = { display_name: "Toit, 298, 100 Feet Road, Indiranagar, Bengaluru, Karnataka, 560038, India", address: { postcode: "560038" } };

test("address + PIN from postcode; country suffix dropped", () => {
  const r = pickReverseResult(sample);
  assert.equal(r.pincode, "560038");
  assert.ok(!/India$/.test(r.address));
  assert.match(r.address, /Indiranagar/);
});
test("PIN falls back to the display text; invalid postcodes ignored", () => {
  assert.equal(pickReverseResult({ display_name: "MG Road, Bengaluru 560001, India", address: { postcode: "ABC" } }).pincode, "560001");
});
test("place hint is prefixed only when the geocoder didn't name it", () => {
  assert.match(pickReverseResult({ display_name: "100 Feet Road, Bengaluru, India" }, "Toit").address, /^Toit, 100 Feet Road/);
  assert.ok(!/^Toit, Toit/.test(pickReverseResult(sample, "Toit").address));
});
test("bad payloads never throw", () => {
  assert.deepEqual(pickReverseResult(null), { address: "", pincode: "" });
  assert.deepEqual(pickReverseResult({}), { address: "", pincode: "" });
});
