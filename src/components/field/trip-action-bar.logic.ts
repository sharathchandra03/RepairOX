/* Pure rules for which manager / store actions apply to a Ninja trip. */
import { REPLAN_STATUSES } from "../../lib/field-live";
import type { TripStatus, TripType } from "../../lib/ninja/model";

export interface TripRef { id: string; trip_no: string | null; trip_type: TripType; status: TripStatus; job_id: string; scheduled_at?: string | null }

const CANCELLABLE: TripStatus[] = ["awaiting_assignment", "assigned", "accepted", "en_route_customer", "arrived_customer", "pickup_in_progress", "failed_attempt", "customer_unavailable", "rescheduled", "return_to_store", "service_in_progress"];
const RESCHEDULABLE: TripStatus[] = ["awaiting_assignment", "assigned", "accepted"];

/** Which actions apply to a trip for a viewer. Pure, so the table can ask "is there anything to do?". */
export function tripActionsFor(t: Pick<TripRef, "status" | "trip_type">, caps: { assign: boolean; store: boolean }) {
  return {
    confirm: caps.store && t.status === "handover_pending",
    release: caps.store && t.trip_type === "drop" && t.status === "arrived_store",
    ticket: caps.store && t.status === "store_received",
    replan: caps.assign && REPLAN_STATUSES.includes(t.status),
    reschedule: caps.assign && RESCHEDULABLE.includes(t.status),
    cancel: caps.assign && (CANCELLABLE.includes(t.status) || (t.trip_type === "drop" && t.status === "arrived_store")),
  };
}

