/* RepairOX — live Ninja execution state per Field job (pure, no React / I/O).
   Built from the SAME field_trips / field_assignments rows the Ninja app writes,
   so the Pickup & Drop table and View Assignment reflect the Ninja's reality
   (waiting to accept / rejected / each journey stage) without a second status engine. */
import type { FieldJob } from "@/lib/field-data";
import { fieldTripAction, type TripAction } from "@/lib/field-table";
import { stepperFor, statusRank, type NinjaTrip, type TripStatus, type TripType } from "@/lib/ninja/model";

export const REJECT_BLINK_MS = 60_000;
const CLOSED: TripStatus[] = ["completed", "cancelled", "rescheduled", "failed_attempt", "customer_unavailable", "return_to_store"];

export interface LiveTripRow {
  id: string; job_id: string; trip_no: string | null; trip_type: TripType; status: TripStatus; ninja_id: string | null;
  assigned_at: string | null; accepted_at: string | null; accept_deadline_at: string | null; journey_started_at: string | null;
  arrived_at: string | null; completed_at: string | null; failure_reason: string | null; created_at: string; updated_at: string;
}
export interface LiveAssignmentRow { trip_id: string; ninja_id: string | null; outcome: string; reject_reason: string | null; responded_at: string | null; assigned_at: string }
export const LIVE_TRIP_COLUMNS = "id,job_id,trip_no,trip_type,status,ninja_id,assigned_at,accepted_at,accept_deadline_at,journey_started_at,arrived_at,completed_at,failure_reason,created_at,updated_at";

export interface JobLive extends LiveTripRow {
  /** Set while the trip waits for a new Ninja after the previous one rejected it. */
  rejected: { at: string; reason: string | null; ninjaId: string | null } | null;
}

/** One entry per job: its open trip (latest), else its latest trip. */
export function buildJobLive(trips: LiveTripRow[], rejections: LiveAssignmentRow[]): Map<string, JobLive> {
  const rej = new Map<string, LiveAssignmentRow>();
  for (const a of rejections) { const p = rej.get(a.trip_id); if (!p || a.assigned_at > p.assigned_at) rej.set(a.trip_id, a); }
  const byJob = new Map<string, LiveTripRow>();
  for (const t of trips) {
    const cur = byJob.get(t.job_id);
    const open = !CLOSED.includes(t.status), curOpen = cur ? !CLOSED.includes(cur.status) : false;
    if (!cur || (open && !curOpen) || (open === curOpen && t.created_at > cur.created_at)) byJob.set(t.job_id, t);
  }
  const out = new Map<string, JobLive>();
  for (const [jobId, t] of byJob) {
    const a = t.status === "awaiting_assignment" ? rej.get(t.id) : undefined;
    out.set(jobId, { ...t, rejected: a ? { at: a.responded_at ?? a.assigned_at, reason: a.reject_reason, ninjaId: a.ninja_id } : null });
  }
  return out;
}

export const needsReassign = (l?: JobLive | null) => !!l?.rejected;
export const isRejectBlinking = (l: JobLive | null | undefined, nowMs: number) => !!l?.rejected && nowMs - new Date(l.rejected.at).getTime() < REJECT_BLINK_MS;

/** Action of Trip with the Ninja's live state layered over the legacy status. */
export function effectiveAction(job: Pick<FieldJob, "status" | "leadType" | "linkedTicketId">, live?: JobLive | null): TripAction {
  if (live?.rejected) return { label: "Rejected · Reassign", tone: "danger", reason: "The Ninja rejected this assignment. Assign another Ninja." };
  if (live?.status === "assigned") return { label: "Awaiting Ninja Accept", tone: "warn", reason: "Assigned; the Ninja has not accepted yet." };
  return fieldTripAction(job);
}
export const EXTRA_ACTION_LABELS = ["Rejected · Reassign", "Awaiting Ninja Accept"];

/** Journey stages for the horizontal tracker: Assigned → Accepted → … → Done. */
export function stagesFor(type: TripType): { key: TripStatus; label: string }[] {
  const mid = stepperFor({ trip_type: type } as NinjaTrip).filter((s) => s.key !== "accepted");
  return [{ key: "assigned", label: "Assigned" }, { key: "accepted", label: "Accepted" }, ...mid];
}
export { statusRank };
