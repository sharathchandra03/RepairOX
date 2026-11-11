/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field service-location value object (pure).

   ONE structure used by Route Lead, New Field Assignment, the Lead and the Trip:
   address, PIN, landmark, instructions, original Maps URL, nullable lat/lng,
   and where the data came from. Coordinates are nullable; a manual address
   without coordinates is always saveable. The ORIGINAL pasted URL is never
   discarded.
   ────────────────────────────────────────────────────────────────────────── */
import { parseMapsUrl, isValidPincode, extractPincode, type ParsedMapsUrl } from "@/lib/maps-url";
import type { Lead } from "@/lib/leads-data";
import { fullLeadLocation } from "@/lib/leads-data";
import type { FieldJob } from "@/lib/field-data";

export type LocationSource = "manual" | "maps_url" | "lead" | "map_pin";

export interface ServiceLocation {
  address: string;
  pincode: string;
  landmark: string;
  instructions: string;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  source: LocationSource;
}

export const EMPTY_LOCATION: ServiceLocation = {
  address: "", pincode: "", landmark: "", instructions: "", mapsUrl: "", lat: null, lng: null, source: "manual",
};

/** Seed from a Lead (copies its pin + maps link — never just the text). */
export function locationFromLead(lead: Pick<Lead, "location" | "locationUnit" | "locationLat" | "locationLng" | "locationMapsUrl">): ServiceLocation {
  const address = fullLeadLocation(lead);
  const hasPin = lead.locationLat != null && lead.locationLng != null;
  return {
    address,
    pincode: extractPincode(address),
    landmark: "",
    instructions: "",
    mapsUrl: lead.locationMapsUrl || "",
    lat: hasPin ? lead.locationLat : null,
    lng: hasPin ? lead.locationLng : null,
    source: "lead",
  };
}

export function locationFromJob(j: FieldJob): ServiceLocation {
  return {
    address: j.pickupAddress || "", pincode: j.pincode || "", landmark: j.landmark || "",
    instructions: j.locationInstructions || "", mapsUrl: j.locationMapsUrl || "",
    lat: j.locationLat ?? null, lng: j.locationLng ?? null,
    source: ((j.locationSource as LocationSource) || "manual"),
  };
}

/** Apply a pasted Maps link. Always keeps the original text; fills lat/lng only
 *  when they are literally present. Never overwrites a typed address. */
export function applyMapsUrl(loc: ServiceLocation, input: string): { next: ServiceLocation; parsed: ParsedMapsUrl } {
  const parsed = parseMapsUrl(input);
  const next: ServiceLocation = { ...loc, mapsUrl: input.trim() };
  if (parsed.kind === "coordinates" && parsed.lat != null && parsed.lng != null) {
    next.lat = parsed.lat; next.lng = parsed.lng; next.source = "maps_url";
  } else if (!input.trim()) {
    next.lat = null; next.lng = null;
    if (next.source === "maps_url") next.source = "manual";
  } else if (parsed.kind === "short" || parsed.kind === "address" || parsed.kind === "place") {
    // Link kept, coordinates unknown — drop stale coords from a PREVIOUS link.
    if (loc.source === "maps_url") { next.lat = null; next.lng = null; }
    next.source = loc.lat != null ? loc.source : "maps_url";
  }
  return { next, parsed };
}

export interface LocationErrors { address?: string; pincode?: string; mapsUrl?: string }

/** Customer-location rules for a field route: address required; PIN valid when
 *  given (required unless `pinOptional`); a Maps URL is optional but if present
 *  must be a recognised map link. */
export function validateLocation(loc: ServiceLocation, opts: { pinOptional?: boolean } = {}): LocationErrors {
  const e: LocationErrors = {};
  if (loc.address.trim().length < 5) e.address = "Enter the customer's address.";
  if (loc.pincode.trim()) { if (!isValidPincode(loc.pincode)) e.pincode = "Enter a valid 6-digit PIN code."; }
  else if (!opts.pinOptional) e.pincode = "PIN code is required.";
  if (loc.mapsUrl.trim() && !parseMapsUrl(loc.mapsUrl).valid) e.mapsUrl = "Paste a valid Google Maps link, or clear it.";
  return e;
}
export const hasLocationErrors = (e: LocationErrors) => Object.keys(e).length > 0;

/** Job fields for a ServiceLocation (pickup / on-site leg). */
export function locationToJobFields(loc: ServiceLocation) {
  return {
    pickupAddress: loc.address.trim(),
    pincode: loc.pincode.trim(),
    landmark: loc.landmark.trim(),
    locationInstructions: loc.instructions.trim(),
    locationMapsUrl: loc.mapsUrl.trim(),
    locationLat: loc.lat,
    locationLng: loc.lng,
    locationSource: loc.source,
  } satisfies Partial<FieldJob>;
}

/** Lead patch for the CURRENT linked service location (explicit rule: Route /
 *  Link flows update the Lead's pin; trip-only edits never touch the Lead). */
export function locationToLeadPatch(loc: ServiceLocation) {
  return {
    location: loc.address.trim(),
    locationLat: loc.lat,
    locationLng: loc.lng,
    locationMapsUrl: loc.mapsUrl.trim(),
  };
}

/** After a short link has been expanded server-side: take coordinates from the
 *  final URL but KEEP the originally pasted link. Fills the PIN from the place
 *  name only when empty; never overwrites a typed address. */
export function applyResolvedUrl(loc: ServiceLocation, finalUrl: string): { next: ServiceLocation; parsed: ParsedMapsUrl } {
  const parsed = parseMapsUrl(finalUrl);
  const next: ServiceLocation = { ...loc };
  if (parsed.kind === "coordinates" && parsed.lat != null && parsed.lng != null) {
    next.lat = parsed.lat; next.lng = parsed.lng; next.source = "maps_url";
  }
  if (!next.pincode.trim()) { const pin = extractPincode(parsed.addressHint); if (pin) next.pincode = pin; }
  return { next, parsed };
}
