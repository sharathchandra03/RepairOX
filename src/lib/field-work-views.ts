/* RepairOX — Pickup & Drop "work views": the one-click queues a Field Manager or
   store user works through (what used to be the Dispatch Board tabs). Pure; derived
   from the job + the Ninja's live trip state, never stored. */
import { isDelayed, type FieldJob } from "./field-data";
import { REPLAN_STATUSES, type JobLive } from "./field-live";

export type WorkView = "all" | "to_assign" | "awaiting" | "moving" | "store" | "replan" | "delayed" | "done";

export const WORK_VIEWS: { value: WorkView; label: string; hint: string }[] = [
  { value: "all",       label: "All",              hint: "Every trip in the current date and filter scope" },
  { value: "to_assign", label: "To assign",        hint: "No Ninja yet, or the Ninja rejected it" },
  { value: "awaiting",  label: "Awaiting accept",  hint: "Assigned, waiting for the Ninja to accept" },
  { value: "moving",    label: "On the move",      hint: "Accepted and in progress with the Ninja" },
  { value: "store",     label: "Store handover",   hint: "Store must confirm receipt or release a device" },
  { value: "replan",    label: "Re-plan",          hint: "Failed, customer unavailable or rescheduled" },
  { value: "delayed",   label: "Delayed",          hint: "Past the scheduled date and not finished" },
  { value: "done",      label: "Completed",        hint: "Finished trips" },
];

const finished = (j: Pick<FieldJob, "status">) => j.status === "completed" || j.status === "cancelled";

export function jobMatchesWorkView(job: FieldJob, view: WorkView, live?: JobLive | null, now: Date = new Date()): boolean {
  switch (view) {
    case "all": return true;
    case "to_assign": return !finished(job) && (job.status === "pending_assignment" || job.status === "ready_for_drop" || !!live?.rejected || live?.status === "awaiting_assignment");
    case "awaiting": return !finished(job) && live?.status === "assigned";
    case "moving": return !finished(job) && !!live && ["accepted", "en_route_customer", "arrived_customer", "pickup_in_progress", "device_collected", "en_route_store", "device_received_by_ninja", "store_dispatch_confirmed", "delivery_in_progress", "service_in_progress", "service_completed", "delivered"].includes(live.status)
      || (!live && !finished(job) && (job.status === "out_for_pickup" || job.status === "out_for_drop"));
    case "store": return !finished(job) && !!live && (live.status === "handover_pending" || (live.trip_type === "drop" && live.status === "arrived_store"));
    case "replan": return !finished(job) && !!live && REPLAN_STATUSES.includes(live.status);
    case "delayed": return !finished(job) && isDelayed(job, now);
    case "done": return job.status === "completed";
  }
}
