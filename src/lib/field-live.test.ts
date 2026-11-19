import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveAction, type JobLive } from "./field-live";
import { tripActionsFor } from "../components/field/trip-action-bar.logic";

const job = { status: "at_store", leadType: "pickup", linkedTicketId: "" } as never;
const live = (o: Partial<JobLive>) => ({ id: "t", job_id: "j", trip_type: "pickup", status: "assigned", rejected: null, ...o }) as JobLive;

test("store handover and exceptions surface as the Action of Trip", () => {
  assert.equal(effectiveAction(job, live({ status: "handover_pending" })).label, "Store to Confirm Receipt");
  assert.equal(effectiveAction(job, live({ trip_type: "drop", status: "arrived_store" })).label, "Release Device to Ninja");
  assert.equal(effectiveAction(job, live({ status: "failed_attempt" })).label, "Needs Re-plan");
  assert.equal(effectiveAction({ ...(job as object), status: "completed" } as never, live({ status: "failed_attempt" })).label !== "Needs Re-plan", true);
});

test("trip actions follow permission and status", () => {
  const store = tripActionsFor({ status: "handover_pending", trip_type: "pickup" }, { assign: false, store: true });
  assert.equal(store.confirm, true); assert.equal(store.cancel, false);
  const none = tripActionsFor({ status: "handover_pending", trip_type: "pickup" }, { assign: false, store: false });
  assert.equal(Object.values(none).some(Boolean), false);
  assert.equal(tripActionsFor({ status: "failed_attempt", trip_type: "pickup" }, { assign: true, store: false }).replan, true);
});
