import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMapsUrl, mapsOpenUrl, isValidPincode, extractPincode } from "./maps-url";

test("empty input", () => {
  const r = parseMapsUrl("   ");
  assert.equal(r.kind, "empty");
  assert.equal(r.valid, false);
});

test("@lat,lng in path", () => {
  const r = parseMapsUrl("https://www.google.com/maps/place/Indiranagar/@12.9784,77.6408,17z/data=!4m5");
  assert.equal(r.kind, "coordinates");
  assert.equal(r.lat, 12.9784);
  assert.equal(r.lng, 77.6408);
  assert.equal(r.addressHint, "Indiranagar");
});

test("!3d!4d exact pin wins over viewport", () => {
  const r = parseMapsUrl("https://www.google.com/maps/place/X/@12.0,77.0,17z/data=!3d12.9716!4d77.5946");
  assert.equal(r.lat, 12.9716);
  assert.equal(r.lng, 77.5946);
});

test("?q=lat,lng", () => {
  const r = parseMapsUrl("https://maps.google.com/?q=12.9352,77.6245");
  assert.equal(r.kind, "coordinates");
  assert.equal(r.lat, 12.9352);
  assert.equal(r.lng, 77.6245);
});

test("api=1 query=lat,lng", () => {
  const r = parseMapsUrl("https://www.google.com/maps/search/?api=1&query=12.91%2C77.60");
  assert.equal(r.kind, "coordinates");
  assert.equal(r.lng, 77.6);
});

test("?q=address text is a hint, not coordinates", () => {
  const r = parseMapsUrl("https://www.google.com/maps?q=12+MG+Road+Bengaluru");
  assert.equal(r.kind, "address");
  assert.equal(r.lat, null);
  assert.equal(r.needsConfirmation, true);
  assert.match(r.addressHint, /MG Road/);
});

test("short link is preserved and never fabricated", () => {
  const r = parseMapsUrl("https://maps.app.goo.gl/AbC123");
  assert.equal(r.kind, "short");
  assert.equal(r.valid, true);
  assert.equal(r.lat, null);
  assert.equal(r.lng, null);
  assert.equal(r.needsConfirmation, true);
  assert.equal(r.original, "https://maps.app.goo.gl/AbC123");
});

test("missing scheme is tolerated", () => {
  const r = parseMapsUrl("maps.app.goo.gl/xyz");
  assert.equal(r.kind, "short");
});

test("non-maps link is invalid", () => {
  assert.equal(parseMapsUrl("https://example.com/maps").kind, "invalid");
  assert.equal(parseMapsUrl("not a url at all").valid, false);
});

test("null island and out-of-range coords rejected", () => {
  assert.notEqual(parseMapsUrl("https://maps.google.com/?q=0,0").kind, "coordinates");
  assert.notEqual(parseMapsUrl("https://maps.google.com/?q=95.1,77.1").kind, "coordinates");
});

test("openstreetmap mlat/mlon (in-app picker)", () => {
  const r = parseMapsUrl("https://www.openstreetmap.org/?mlat=12.97&mlon=77.59#map=17/12.97/77.59");
  assert.equal(r.kind, "coordinates");
  assert.equal(r.lat, 12.97);
});

test("mapsOpenUrl prefers stored url, then coords, then address, else empty", () => {
  assert.equal(mapsOpenUrl({ mapsUrl: "https://maps.app.goo.gl/a", lat: 1, lng: 2 }), "https://maps.app.goo.gl/a");
  assert.match(mapsOpenUrl({ lat: 12.9, lng: 77.6 }), /query=12\.9,77\.6$/);
  assert.match(mapsOpenUrl({ address: "MG Road", pincode: "560001" }), /MG%20Road%2C%20560001/);
  assert.equal(mapsOpenUrl({}), "");
});

test("pincode helpers", () => {
  assert.equal(isValidPincode("560034"), true);
  assert.equal(isValidPincode("060034"), false);
  assert.equal(isValidPincode("5600"), false);
  assert.equal(extractPincode("Koramangala, Bengaluru 560034"), "560034");
  assert.equal(extractPincode("no pin"), "");
});
