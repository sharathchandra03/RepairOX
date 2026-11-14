/* Ninja app — trip model, status vocabulary and the next-step engine.
   The DB (field_trip_transition_ok / field_trips_guard, migration 0092) is the
   authority; this file only decides what to OFFER the Ninja at each state. */

export type TripType = "pickup" | "drop" | "onsite" | "warranty_pickup";

export type TripStatus =
  | "awaiting_assignment" | "assigned" | "accepted" | "en_route_customer" | "arrived_customer"
  | "pickup_in_progress" | "device_collected" | "en_route_store" | "arrived_store"
  | "handover_pending" | "store_received" | "store_dispatch_confirmed" | "device_received_by_ninja"
  | "delivery_in_progress" | "delivered" | "service_in_progress" | "service_completed"
  | "service_not_completed" | "completed" | "failed_attempt" | "customer_unavailable"
  | "rescheduled" | "return_to_store" | "cancelled";

export interface TripJob {
  job_no: string | null;
  customer: string | null;
  phone: string | null;
  alt_phone: string | null;
  device: string | null;
  issue: string | null;
  pincode: string | null;
  landmark: string | null;
  imei: string | null;
  accessories: string | null;
  device_condition: string | null;
  branch: string | null;
  drop_address: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  drop_maps_url: string | null;
  pickup_address: string | null;
  location_instructions: string | null;
  linked_invoice_id: string | null;
  linked_ticket_id: string | null;
}

export interface NinjaTrip {
  id: string;
  organization_id: string;
  branch_id: string | null;
  job_id: string;
  trip_no: string | null;
  trip_type: TripType;
  status: TripStatus;
  lead_id: string | null;
  ninja_id: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  journey_started_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
  scheduled_window: string | null;
  dest_address: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  dest_maps_url: string | null;
  instructions: string | null;
  failure_reason: string | null;
  ticket_id: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  job: TripJob | null;
}

export const TRIP_SELECT =
  "*, job:field_jobs(job_no,customer,phone,alt_phone,device,issue,pincode,landmark,imei,accessories,device_condition,branch,drop_address,drop_lat,drop_lng,drop_maps_url,pickup_address,location_instructions,linked_invoice_id,linked_ticket_id)";

export const TYPE_LABEL: Record<TripType, string> = {
  pickup: "Pickup", drop: "Drop", onsite: "On-Site", warranty_pickup: "Warranty Pickup",
};

export type Tone = "blue" | "amber" | "green" | "rose" | "slate" | "violet" | "sky";

export const STATUS_META: Record<TripStatus, { label: string; tone: Tone }> = {
  awaiting_assignment: { label: "Awaiting assignment", tone: "slate" },
  assigned: { label: "New assignment", tone: "amber" },
  accepted: { label: "Accepted", tone: "blue" },
  en_route_customer: { label: "On the way to customer", tone: "violet" },
  arrived_customer: { label: "Arrived at customer", tone: "violet" },
  pickup_in_progress: { label: "Pickup in progress", tone: "violet" },
  device_collected: { label: "Device collected", tone: "green" },
  en_route_store: { label: "On the way to store", tone: "violet" },
  arrived_store: { label: "Arrived at store", tone: "sky" },
  handover_pending: { label: "Waiting for store", tone: "amber" },
  store_received: { label: "Store received device", tone: "green" },
  store_dispatch_confirmed: { label: "Store released device", tone: "green" },
  device_received_by_ninja: { label: "Device with you", tone: "blue" },
  delivery_in_progress: { label: "Delivery in progress", tone: "violet" },
  delivered: { label: "Delivered", tone: "green" },
  service_in_progress: { label: "Service in progress", tone: "violet" },
  service_completed: { label: "Service completed", tone: "green" },
  service_not_completed: { label: "Service not completed", tone: "rose" },
  completed: { label: "Completed", tone: "green" },
  failed_attempt: { label: "Failed attempt", tone: "rose" },
  customer_unavailable: { label: "Customer unavailable", tone: "rose" },
  rescheduled: { label: "Rescheduled", tone: "amber" },
  return_to_store: { label: "Returning to store", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

/** Statuses during which GPS sharing is allowed (mirrors DB insert policy). */
export const TRACKING_STATUSES: TripStatus[] = ["en_route_customer", "en_route_store", "device_received_by_ninja"];

export const TERMINAL: TripStatus[] = ["completed", "cancelled", "rescheduled", "failed_attempt", "customer_unavailable", "return_to_store"];

export function isActiveTrip(t: NinjaTrip): boolean { return inProgress(t); }
export function isDone(t: NinjaTrip): boolean { return t.status === "completed"; }
export function isClosed(t: NinjaTrip): boolean { return TERMINAL.includes(t.status); }
export function isNew(t: NinjaTrip): boolean { return t.status === "assigned"; }
/** A trip the Ninja is currently executing (accepted and not yet closed). */
export function inProgress(t: NinjaTrip): boolean {
  return !["assigned", "awaiting_assignment", "accepted"].includes(t.status) && !isClosed(t);
}

export type StepKind = "transition" | "collect" | "deliver" | "submit_store" | "receive_store" | "wait" | "service_outcome";

export interface NextStep {
  kind: StepKind;
  label: string;
  /** target status for plain transitions */
  to?: TripStatus;
  hint?: string;
  /** step is not Ninja-actionable (waiting on someone else) */
  waitingOn?: string;
}

/** What the Ninja should do next. Returns null when nothing is actionable. */
export function nextStep(t: NinjaTrip): NextStep | null {
  const ty = t.trip_type;
  const pickup = ty === "pickup" || ty === "warranty_pickup";
  switch (t.status) {
    case "accepted":
      if (pickup || ty === "onsite") return { kind: "transition", to: "en_route_customer", label: "Start journey", hint: "Location sharing starts while you travel." };
      if (ty === "drop") return { kind: "transition", to: "arrived_store", label: "I'm at the store", hint: "Collect the repaired device from the store." };
      return null;
    case "en_route_customer":
      return { kind: "transition", to: "arrived_customer", label: "Arrived at customer" };
    case "arrived_customer":
      if (pickup) return { kind: "transition", to: "pickup_in_progress", label: "Start pickup" };
      if (ty === "drop") return { kind: "transition", to: "delivery_in_progress", label: "Start delivery" };
      return { kind: "transition", to: "service_in_progress", label: "Start service" };
    case "pickup_in_progress":
      return { kind: "collect", label: "Inspect & collect device", hint: "Record condition, photos and customer signature." };
    case "device_collected":
      return { kind: "transition", to: "en_route_store", label: "Start journey to store" };
    case "en_route_store":
      return { kind: "transition", to: "arrived_store", label: "Arrived at store" };
    case "arrived_store":
      if (pickup) return { kind: "submit_store", label: "Submit device to store", hint: "Hand the device to Reception with the pickup receipt." };
      return { kind: "wait", label: "Waiting for store", waitingOn: "Store Reception must release the repaired device." };
    case "handover_pending":
      return { kind: "wait", label: "Waiting for store", waitingOn: "Reception is verifying the device. This updates automatically." };
    case "store_received":
      return { kind: "transition", to: "completed", label: "Close pickup trip" };
    case "store_dispatch_confirmed":
      return { kind: "receive_store", label: "Confirm I received the device", hint: "Check model, IMEI and accessories before leaving." };
    case "device_received_by_ninja":
      return { kind: "transition", to: "en_route_customer", label: "Start journey to customer" };
    case "delivery_in_progress":
      return { kind: "deliver", label: "Hand over & get signature", hint: "Share the invoice copy and collect acknowledgement." };
    case "delivered":
      return { kind: "transition", to: "completed", label: "Complete trip" };
    case "service_in_progress":
      return { kind: "service_outcome", label: "Finish service" };
    case "service_completed":
    case "service_not_completed":
      return { kind: "transition", to: "completed", label: "Close visit" };
    default:
      return null;
  }
}

/** Ordered milestones for the progress stepper (customer-journey view). */
export function stepperFor(t: NinjaTrip): { key: TripStatus; label: string }[] {
  const ty = t.trip_type;
  if (ty === "drop")
    return [
      { key: "accepted", label: "Accepted" }, { key: "arrived_store", label: "At store" },
      { key: "device_received_by_ninja", label: "Device received" }, { key: "en_route_customer", label: "On the way" },
      { key: "arrived_customer", label: "Arrived" }, { key: "delivered", label: "Delivered" }, { key: "completed", label: "Done" },
    ];
  if (ty === "onsite")
    return [
      { key: "accepted", label: "Accepted" }, { key: "en_route_customer", label: "On the way" },
      { key: "arrived_customer", label: "Arrived" }, { key: "service_in_progress", label: "Service" }, { key: "completed", label: "Done" },
    ];
  return [
    { key: "accepted", label: "Accepted" }, { key: "en_route_customer", label: "On the way" },
    { key: "arrived_customer", label: "Arrived" }, { key: "device_collected", label: "Collected" },
    { key: "en_route_store", label: "To store" }, { key: "handover_pending", label: "Handover" },
    { key: "store_received", label: "Received" }, { key: "completed", label: "Done" },
  ];
}

const ORDER: TripStatus[] = [
  "assigned", "accepted", "en_route_customer", "arrived_customer", "pickup_in_progress", "device_collected",
  "en_route_store", "arrived_store", "handover_pending", "store_received", "store_dispatch_confirmed",
  "device_received_by_ninja", "delivery_in_progress", "delivered", "service_in_progress", "service_completed", "completed",
];
export function statusRank(s: TripStatus): number { return ORDER.indexOf(s); }

export const PROBLEMS: { id: string; label: string; status?: "customer_unavailable" | "failed_attempt" | "rescheduled" }[] = [
  { id: "customer_not_answering", label: "Customer not answering", status: "customer_unavailable" },
  { id: "customer_unavailable", label: "Customer unavailable", status: "customer_unavailable" },
  { id: "wrong_address", label: "Wrong address", status: "failed_attempt" },
  { id: "reschedule_requested", label: "Customer wants to reschedule", status: "rescheduled" },
  { id: "device_not_ready", label: "Device not ready", status: "failed_attempt" },
  { id: "pickup_declined", label: "Pickup declined", status: "failed_attempt" },
  { id: "delivery_declined", label: "Delivery declined", status: "failed_attempt" },
  { id: "cannot_reach", label: "Unable to reach location", status: "failed_attempt" },
  { id: "store_handover_issue", label: "Store handover issue" },
  { id: "device_mismatch", label: "Device mismatch" },
  { id: "gps_problem", label: "GPS problem" },
  { id: "network_problem", label: "Network problem" },
  { id: "other", label: "Other" },
];

export function mapsLink(t: NinjaTrip): string {
  if (t.dest_maps_url) return t.dest_maps_url;
  if (t.dest_lat != null && t.dest_lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${t.dest_lat},${t.dest_lng}`;
  const q = encodeURIComponent([t.dest_address, t.job?.pincode].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Google Maps turn-by-turn deep link (opens installed app on phones). */
export function navLink(t: NinjaTrip): string {
  if (t.dest_lat != null && t.dest_lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${t.dest_lat},${t.dest_lng}&travelmode=driving`;
  return mapsLink(t);
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function whenLabel(iso: string | null, window?: string | null): string {
  if (!iso) return window || "Not scheduled";
  const d = new Date(iso), now = new Date();
  const same = d.toDateString() === now.toDateString();
  const tmr = new Date(now.getTime() + 864e5).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${same ? "Today" : tmr ? "Tomorrow" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** Location freshness vocabulary from real timestamps. */
export function freshness(iso: string | null | undefined): { label: string; tone: Tone } {
  if (!iso) return { label: "Location unavailable", tone: "slate" };
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s <= 45) return { label: "Live", tone: "green" };
  if (s <= 180) return { label: "Recently updated", tone: "sky" };
  if (s <= 600) return { label: "Delayed", tone: "amber" };
  return { label: "Stale", tone: "rose" };
}
