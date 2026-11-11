/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead ⇄ Field trip FIELD MAP (pure).

   ONE place that defines which Lead field feeds which trip field, so linking a
   Lead from the "New Field Assignment" search fills EVERYTHING the trip needs and
   the two forms never drift apart.

   LEAD (Add Lead form)                    → TRIP (New Field Assignment)
   ───────────────────────────────────────   ─────────────────────────────────────
   customerId                              → customerId  (Customer Master — no dupes)
   name                                    → customer name
   number / alternateNumber / email        → mobile / alternate / email
   source                                  → source
   devices[] (catalog ids + label + issue) → devices[]   (ALL devices, multi-device)
   comments                                → comment (internal note for the Ninja/store)
   fulfilmentRoute / status intent         → type of trip (On-Site vs Pickup)
   location + unit, lat/lng, maps link     → service location (PIN from text/geocode)
   branchId (Lead Store)                   → leadBranchId; also the default operational store
   assignedTo / assignedToName             → salesPersonId / Name (Sales owner — never the Ninja)

   NOT copied on purpose (Sales-only, the Lead stays the owner): region, mode of
   contact, contact status, lead category, nature, priority, estimate, discount,
   follow-up. They are Lead pipeline data, not field-execution data.

   Reverse direction: linking a trip to a Lead may only FILL EMPTY Lead fields
   (service location / pin / alt number / email) — it never overwrites.
   ────────────────────────────────────────────────────────────────────────── */
import type { Lead } from "@/lib/leads-data";
import { getLeadDevices } from "@/lib/leads-data";
import type { FieldLeadType, FieldTripDevice } from "@/lib/field-data";
import { normaliseRoute } from "@/lib/field-data";
import { leadStatusIntent } from "@/lib/lead-workflow";
import { locationFromLead, type ServiceLocation } from "@/lib/field-location";
import { tripDevicesFromLead, tripDeviceHasData } from "@/lib/field-devices";

/** On-Site vs Pickup, from the route the Sales agent chose, else from the lead's status wording. */
export function tripTypeForLead(lead: Pick<Lead, "fulfilmentRoute" | "status">): FieldLeadType {
  const route = normaliseRoute(lead.fulfilmentRoute);
  if (route === "ON_SITE") return "onsite";
  if (route === "PICKUP_DROP") return "pickup";
  return leadStatusIntent(lead.status || "") === "onsite" ? "onsite" : "pickup";
}

export type PrefillKey = "customer" | "contact" | "source" | "devices" | "location" | "comment" | "type" | "store";

export interface LeadTripPrefill {
  customerId: string;
  name: string; phone: string; altPhone: string; email: string;
  source: string;
  /** Lead Store id — the default OPERATIONAL store when none is chosen yet. */
  storeId: string;
  type: FieldLeadType;
  devices: FieldTripDevice[];
  comment: string;
  location: ServiceLocation;
  /** What was actually filled, for the "from lead" chips + summary. */
  filled: PrefillKey[];
}

export function leadToTripPrefill(lead: Lead): LeadTripPrefill {
  const devices = tripDevicesFromLead(getLeadDevices(lead)).filter(tripDeviceHasData);
  const location = locationFromLead(lead);
  const comment = (lead.comments || "").trim();
  const filled: PrefillKey[] = [];
  if (lead.customerId || lead.name) filled.push("customer");
  if (lead.number || lead.alternateNumber || lead.email) filled.push("contact");
  if (lead.source) filled.push("source");
  if (devices.length > 0) filled.push("devices");
  if (location.address || location.lat != null) filled.push("location");
  if (comment) filled.push("comment");
  filled.push("type");
  if (lead.branchId) filled.push("store");
  return {
    customerId: lead.customerId || "",
    name: lead.name || "", phone: lead.number || "", altPhone: lead.alternateNumber || "", email: lead.email || "",
    source: lead.source || "", storeId: lead.branchId || "",
    type: tripTypeForLead(lead), devices, comment, location, filled,
  };
}

export const PREFILL_LABEL: Record<PrefillKey, string> = {
  customer: "Customer", contact: "Contact", source: "Source", devices: "Devices", location: "Location",
  comment: "Comment", type: "Trip type", store: "Store",
};

/** Human summary of what linking filled, e.g. "Customer · Contact · 2 devices · Location". */
export function prefillSummary(p: LeadTripPrefill): string {
  return p.filled.filter((k) => k !== "type" && k !== "store").map((k) => (k === "devices" ? `${p.devices.length} device${p.devices.length > 1 ? "s" : ""}` : PREFILL_LABEL[k])).join(" · ");
}

/** Lead fields the trip may FILL (only where the Lead has nothing). Never overwrites. */
export function leadGapPatch(
  lead: Pick<Lead, "location" | "locationLat" | "locationLng" | "locationMapsUrl" | "alternateNumber" | "email">,
  trip: { loc: ServiceLocation; altPhone: string; email: string },
): Partial<Pick<Lead, "location" | "locationLat" | "locationLng" | "locationMapsUrl" | "alternateNumber" | "email">> {
  const patch: Record<string, unknown> = {};
  if (!(lead.location ?? "").trim() && trip.loc.address.trim()) patch.location = trip.loc.address.trim();
  const leadHasPin = lead.locationLat != null && lead.locationLng != null;
  if (!leadHasPin && trip.loc.lat != null && trip.loc.lng != null) { patch.locationLat = trip.loc.lat; patch.locationLng = trip.loc.lng; }
  if (!(lead.locationMapsUrl ?? "").trim() && trip.loc.mapsUrl.trim()) patch.locationMapsUrl = trip.loc.mapsUrl.trim();
  if (!(lead.alternateNumber ?? "").trim() && trip.altPhone.trim()) patch.alternateNumber = trip.altPhone.trim();
  if (!(lead.email ?? "").trim() && trip.email.trim()) patch.email = trip.email.trim();
  return patch;
}
