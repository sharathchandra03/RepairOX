import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResolvedUrl, EMPTY_LOCATION, applyMapsUrl, validateLocation, locationFromLead, locationToJobFields } from "./field-location";

test("coordinate link fills lat/lng and keeps the original url", () => {
  const url = "https://www.google.com/maps/@12.9784,77.6408,17z";
  const { next, parsed } = applyMapsUrl({ ...EMPTY_LOCATION, address: "12 MG Road" }, url);
  assert.equal(next.lat, 12.9784);
  assert.equal(next.mapsUrl, url);
  assert.equal(next.address, "12 MG Road");
  assert.equal(parsed.kind, "coordinates");
});

test("short link: url preserved, coordinates stay null (never fabricated)", () => {
  const { next, parsed } = applyMapsUrl(EMPTY_LOCATION, "https://maps.app.goo.gl/abc");
  assert.equal(next.mapsUrl, "https://maps.app.goo.gl/abc");
  assert.equal(next.lat, null);
  assert.equal(parsed.needsConfirmation, true);
});

test("replacing a coordinate link with a short link clears stale coords", () => {
  const a = applyMapsUrl(EMPTY_LOCATION, "https://maps.google.com/?q=12.9,77.6").next;
  const b = applyMapsUrl(a, "https://maps.app.goo.gl/x").next;
  assert.equal(b.lat, null);
});

test("clearing the url clears maps-derived coords", () => {
  const a = applyMapsUrl(EMPTY_LOCATION, "https://maps.google.com/?q=12.9,77.6").next;
  const b = applyMapsUrl(a, "").next;
  assert.equal(b.lat, null);
  assert.equal(b.mapsUrl, "");
});

test("validation: address + PIN required, maps url optional but must be valid", () => {
  assert.ok(validateLocation(EMPTY_LOCATION).address);
  assert.ok(validateLocation({ ...EMPTY_LOCATION, address: "12 MG Road, Bengaluru" }).pincode);
  assert.equal(validateLocation({ ...EMPTY_LOCATION, address: "12 MG Road, Bengaluru", pincode: "560001" }).mapsUrl, undefined);
  assert.ok(validateLocation({ ...EMPTY_LOCATION, address: "12 MG Road, Bengaluru", pincode: "560001", mapsUrl: "https://example.com" }).mapsUrl);
  assert.equal(Object.keys(validateLocation({ ...EMPTY_LOCATION, address: "12 MG Road, Bengaluru" }, { pinOptional: true })).length, 0);
  assert.ok(validateLocation({ ...EMPTY_LOCATION, address: "12 MG Road", pincode: "12" }, { pinOptional: true }).pincode);
});

test("lead seed copies pin + maps link and extracts the PIN", () => {
  const l = locationFromLead({ location: "Koramangala, Bengaluru 560034", locationUnit: "Flat 3", locationLat: 12.93, locationLng: 77.62, locationMapsUrl: "https://maps.app.goo.gl/q" });
  assert.equal(l.pincode, "560034");
  assert.equal(l.lat, 12.93);
  assert.equal(l.mapsUrl, "https://maps.app.goo.gl/q");
  assert.match(l.address, /^Flat 3, Koramangala/);
  assert.equal(locationToJobFields(l).locationLat, 12.93);
});

test("resolved short link: coordinates from the final url, original link kept, typed address untouched", () => {
  const orig = applyMapsUrl({ ...EMPTY_LOCATION, address: "My typed address" }, "https://maps.app.goo.gl/abc").next;
  const { next } = applyResolvedUrl(orig, "https://www.google.com/maps/place/Koramangala+560034/@12.9352,77.6245,17z");
  assert.equal(next.mapsUrl, "https://maps.app.goo.gl/abc");
  assert.equal(next.lat, 12.9352);
  assert.equal(next.address, "My typed address");
  assert.equal(next.pincode, "560034");
});
