/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Maps URL parsing (pure, no I/O).

   A Sales Agent pastes a Google Maps link when routing a Lead to Pickup & Drop
   / On-Site. This module extracts what can be RELIABLY derived from the link
   and nothing more:

     • coordinates, when they are literally present in the URL
     • a text address hint, when the link is a `?q=<address>` search
     • the ORIGINAL url — always preserved, even when nothing else resolves

   Short links (maps.app.goo.gl / goo.gl/maps) cannot be expanded client-side
   (no API, CORS). They are kept verbatim and flagged `needsConfirmation` so the
   UI asks the user to confirm / type the address. Coordinates are NEVER guessed.
   ────────────────────────────────────────────────────────────────────────── */

export type MapsUrlKind = "empty" | "coordinates" | "address" | "short" | "place" | "invalid";

export interface ParsedMapsUrl {
  /** Original text exactly as submitted (trimmed). "" when empty. */
  original: string;
  kind: MapsUrlKind;
  /** True when the URL is a recognised map link (full, short or OSM). */
  valid: boolean;
  lat: number | null;
  lng: number | null;
  /** Address text hint from `?q=<text>` — NOT verified. */
  addressHint: string;
  /** Short / unresolvable link: coordinates unavailable, user must confirm. */
  needsConfirmation: boolean;
  /** Human-readable reason when `valid` is false or confirmation is needed. */
  message: string;
}

const EMPTY: ParsedMapsUrl = {
  original: "", kind: "empty", valid: false, lat: null, lng: null,
  addressHint: "", needsConfirmation: false, message: "",
};

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    // (0,0) is the "null island" default of broken links — treat as missing.
    && !(lat === 0 && lng === 0);
}

const COORD = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

function coordsFrom(text: string): { lat: number; lng: number } | null {
  const m = COORD.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

function isGoogleHost(host: string): boolean {
  return /(^|\.)google\.[a-z.]+$/.test(host) || host === "maps.google.com";
}

/** Parse any pasted Maps link. Never throws. */
export function parseMapsUrl(input: string | null | undefined): ParsedMapsUrl {
  const original = (input ?? "").trim();
  if (!original) return EMPTY;

  // Tolerate a missing scheme ("maps.app.goo.gl/abc", "google.com/maps/...").
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(original) ? original : `https://${original}`);
  } catch {
    return { ...EMPTY, original, kind: "invalid", message: "That doesn't look like a valid link." };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = decodeURIComponent(url.pathname || "");
  const search = url.searchParams;

  // ── Short links: preserve verbatim, never fabricate a location. ──
  const isShort = host === "maps.app.goo.gl" || (host === "goo.gl" && path.startsWith("/maps")) || host === "g.co";
  if (isShort) {
    return {
      original, kind: "short", valid: true, lat: null, lng: null, addressHint: "",
      needsConfirmation: true,
      message: "Short link saved as-is. Please confirm the address below — coordinates can't be read from short links.",
    };
  }

  // ── OpenStreetMap links (the in-app Leaflet picker is OSM based) ──
  if (host.endsWith("openstreetmap.org")) {
    const mlat = Number(search.get("mlat"));
    const mlon = Number(search.get("mlon"));
    if (search.has("mlat") && isValidLatLng(mlat, mlon)) {
      return { original, kind: "coordinates", valid: true, lat: mlat, lng: mlon, addressHint: "", needsConfirmation: false, message: "" };
    }
    const hash = /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash || "");
    if (hash && isValidLatLng(Number(hash[1]), Number(hash[2]))) {
      return { original, kind: "coordinates", valid: true, lat: Number(hash[1]), lng: Number(hash[2]), addressHint: "", needsConfirmation: false, message: "" };
    }
    return { original, kind: "place", valid: true, lat: null, lng: null, addressHint: "", needsConfirmation: true, message: "Map link saved. No coordinates found in it." };
  }

  if (!isGoogleHost(host)) {
    return { ...EMPTY, original, kind: "invalid", message: "Paste a Google Maps link (maps.app.goo.gl or google.com/maps)." };
  }

  // ── 1) !3d<lat>!4d<lng> (the exact place pin — most precise) ──
  const data = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(path + url.hash + (url.search || ""));
  if (data && isValidLatLng(Number(data[1]), Number(data[2]))) {
    return { original, kind: "coordinates", valid: true, lat: Number(data[1]), lng: Number(data[2]), addressHint: placeNameFromPath(path), needsConfirmation: false, message: "" };
  }

  // ── 2) q / query / ll / destination / daddr / center = "lat,lng" ──
  for (const key of ["q", "query", "ll", "destination", "daddr", "center", "sll"]) {
    const v = search.get(key);
    if (!v) continue;
    const c = coordsFrom(v);
    if (c && /^[\s\d.,+-]+$/.test(v)) {
      return { original, kind: "coordinates", valid: true, lat: c.lat, lng: c.lng, addressHint: "", needsConfirmation: false, message: "" };
    }
  }

  // ── 3) /@lat,lng,zoom in the path (viewport centre — good, not exact pin) ──
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(path);
  if (at && isValidLatLng(Number(at[1]), Number(at[2]))) {
    return { original, kind: "coordinates", valid: true, lat: Number(at[1]), lng: Number(at[2]), addressHint: placeNameFromPath(path), needsConfirmation: false, message: "" };
  }

  // ── 4) /maps/place/<name> or ?q=<address text> → address hint only ──
  const q = search.get("q") || search.get("query") || search.get("destination") || "";
  const hint = q && !coordsFrom(q) ? q.trim() : placeNameFromPath(path);
  if (hint) {
    return {
      original, kind: "address", valid: true, lat: null, lng: null, addressHint: hint,
      needsConfirmation: true,
      message: "Link saved. No coordinates in it — please confirm the address.",
    };
  }

  return {
    original, kind: "place", valid: true, lat: null, lng: null, addressHint: "",
    needsConfirmation: true,
    message: "Link saved. Couldn't read a location from it — please enter the address.",
  };
}

function placeNameFromPath(path: string): string {
  const m = /\/maps\/place\/([^/@]+)/.exec(path);
  if (!m) return "";
  return m[1].replace(/\+/g, " ").trim();
}

/** URL to open for "Directions / Open map". Prefers the stored link; otherwise
 *  builds a destination from SAVED coordinates, then from the address text.
 *  Returns "" when there is nothing to open (never a fabricated destination). */
export function mapsOpenUrl(loc: { mapsUrl?: string | null; lat?: number | null; lng?: number | null; address?: string | null; pincode?: string | null }): string {
  const url = (loc.mapsUrl ?? "").trim();
  if (url) return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  if (loc.lat != null && loc.lng != null && isValidLatLng(loc.lat, loc.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
  }
  const text = [loc.address, loc.pincode].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : "";
}

/** Indian PIN code: 6 digits, first digit 1-9. */
export function isValidPincode(pin: string | null | undefined): boolean {
  return /^[1-9]\d{5}$/.test((pin ?? "").trim());
}

/** Best-effort PIN extraction from free text ("… Bengaluru 560034"). */
export function extractPincode(text: string | null | undefined): string {
  const m = /\b([1-9]\d{5})\b/.exec(text ?? "");
  return m ? m[1] : "";
}
