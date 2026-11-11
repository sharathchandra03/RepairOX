import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedMapsHost, isShortMapsLink, nextHop } from "./maps-resolve";

test("only Google map hosts are allowed", () => {
  for (const h of ["maps.app.goo.gl", "www.google.com", "maps.google.com", "www.google.co.in", "consent.google.com"]) assert.equal(isAllowedMapsHost(h), true, h);
  for (const h of ["evil.com", "google.com.evil.com", "localhost", "169.254.169.254", "notgoogle.com", "google.evil.io"]) assert.equal(isAllowedMapsHost(h), false, h);
});
test("resolution starts only from short links", () => {
  assert.equal(isShortMapsLink("https://maps.app.goo.gl/abc"), true);
  assert.equal(isShortMapsLink("maps.app.goo.gl/abc"), true);
  assert.equal(isShortMapsLink("https://www.google.com/maps/@1,2"), false);
  assert.equal(isShortMapsLink("http://maps.app.goo.gl/abc"), false);
  assert.equal(isShortMapsLink("https://evil.com/maps.app.goo.gl"), false);
});
test("redirect hops must stay on https google hosts; consent wrapper is unwrapped", () => {
  const base = new URL("https://maps.app.goo.gl/abc");
  assert.equal(nextHop("https://www.google.com/maps/place/X/@1,2,3z", base)?.hostname, "www.google.com");
  assert.equal(nextHop("http://www.google.com/x", base), null);
  assert.equal(nextHop("https://evil.com/x", base), null);
  assert.equal(nextHop("https://169.254.169.254/latest", base), null);
  const wrapped = nextHop("https://consent.google.com/ml?continue=" + encodeURIComponent("https://www.google.com/maps/@12.9,77.6,17z"), base);
  assert.equal(wrapped?.pathname, "/maps/@12.9,77.6,17z");
  const evilWrap = nextHop("https://consent.google.com/ml?continue=" + encodeURIComponent("https://evil.com/"), base);
  assert.equal(evilWrap, null);
});
