import { test } from "node:test";
import assert from "node:assert/strict";
import { jobMatchesWorkView } from "./field-work-views";
import type { JobLive } from "./field-live";
const job = (status: string) => ({ status, createdAt: "2020-01-01T00:00:00Z" }) as never;
const live = (o: Partial<JobLive>) => ({ trip_type: "pickup", status: "assigned", rejected: null, ...o }) as JobLive;

test("work views route trips to the right queue", () => {
  assert.equal(jobMatchesWorkView(job("pending_assignment"), "to_assign"), true);
  assert.equal(jobMatchesWorkView(job("assigned"), "to_assign", live({ rejected: { at: "x", reason: null, ninjaId: null } })), true);
  assert.equal(jobMatchesWorkView(job("assigned"), "awaiting", live({ status: "assigned" })), true);
  assert.equal(jobMatchesWorkView(job("assigned"), "moving", live({ status: "en_route_customer" })), true);
  assert.equal(jobMatchesWorkView(job("picked_up"), "store", live({ status: "handover_pending" })), true);
  assert.equal(jobMatchesWorkView(job("drop_scheduled"), "store", live({ trip_type: "drop", status: "arrived_store" })), true);
  assert.equal(jobMatchesWorkView(job("assigned"), "replan", live({ status: "failed_attempt" })), true);
  assert.equal(jobMatchesWorkView(job("completed"), "done"), true);
  assert.equal(jobMatchesWorkView(job("completed"), "to_assign"), false);
});
