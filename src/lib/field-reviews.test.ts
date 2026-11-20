import { test } from "node:test";
import assert from "node:assert/strict";
import { isVerifiedFive, rankNinjas, trendByMonth, type ReviewRow } from "./field-reviews";
const R = (o: Partial<ReviewRow>): ReviewRow => ({ ninjaId: "a", rating: 5, channel: "customer_link", ym: "2026-01", hasTicket: true, comment: null, at: "2026-01-05", ...o });
test("ranking by average then volume, only the chosen month", () => {
  const rows = [R({ ninjaId: "a", rating: 5 }), R({ ninjaId: "a", rating: 4 }), R({ ninjaId: "b", rating: 5 }), R({ ninjaId: "b", rating: 5, channel: "ninja_app" }), R({ ninjaId: "c", rating: 1, ym: "2025-12" })];
  const r = rankNinjas(rows, "2026-01");
  assert.deepEqual(r.map((x) => x.ninjaId), ["b", "a"]);
  assert.equal(r[0].avg, 5); assert.equal(r[0].verifiedFive, 1); // the ninja_app one is not verified
  assert.deepEqual(r[1].dist, [0, 0, 0, 1, 1]); assert.equal(r[1].avg, 4.5);
});
test("verified = 5 stars, not self-entered, trip has a ticket", () => {
  assert.equal(isVerifiedFive(R({})), true);
  assert.equal(isVerifiedFive(R({ hasTicket: false })), false);
  assert.equal(isVerifiedFive(R({ rating: 4 })), false);
});
test("trend per month keeps empty months visible", () => {
  const t = trendByMonth([R({ rating: 4 }), R({ rating: 5 }), R({ ym: "2026-03", rating: 3 })], ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(t.map((x) => [x.count, x.avg]), [[2, 4.5], [0, null], [1, 3]]);
});
