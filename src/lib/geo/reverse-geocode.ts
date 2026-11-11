/* RepairOX — reverse geocoding (coordinates → address + PIN).
   Same provider the Lead map picker already uses (OpenStreetMap Nominatim, no
   API key). Only the coordinates are sent. Never throws; returns empty strings
   when nothing reliable is found, so callers keep the manual flow. */
import { extractPincode, isValidPincode } from "@/lib/maps-url";

const NOMINATIM = "https://nominatim.openstreetmap.org";

export interface ReverseResult { address: string; pincode: string }

/** Pure: turn a Nominatim jsonv2 payload into { address, pincode }. */
export function pickReverseResult(data: any, placeHint = ""): ReverseResult {
  if (!data || typeof data !== "object") return { address: "", pincode: "" };
  let display: string = typeof data.display_name === "string" ? data.display_name : "";
  // Drop the trailing country (", India") — redundant for an Indian service address.
  display = display.replace(/,\s*India\s*$/i, "").trim();
  const postcode = String(data.address?.postcode ?? "").replace(/\s/g, "");
  const pincode = isValidPincode(postcode) ? postcode : extractPincode(display);
  // Prefix the place name from the link ("Toit") when the geocoder didn't name it.
  const hint = placeHint.trim();
  if (hint && display && !display.toLowerCase().startsWith(hint.toLowerCase())) display = `${hint}, ${display}`;
  else if (hint && !display) display = hint;
  return { address: display, pincode };
}

export async function reverseGeocodeFull(lat: number, lng: number, placeHint = ""): Promise<ReverseResult> {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&accept-language=en&zoom=18&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { address: placeHint.trim(), pincode: "" };
    return pickReverseResult(await res.json(), placeHint);
  } catch {
    return { address: placeHint.trim(), pincode: "" };
  }
}
