/* ────────────────────────────────────────────────────────────────────────
 * RepairOX — Geo: City Scopes + Geocoding (shared, zero-cost, no API key)
 *
 * The single source of truth for:
 *   • The admin-managed TARGET CITIES (bbox + center), persisted per browser —
 *     the SAME list the Lead-form Location Picker uses, so the Lead Map's city
 *     selector and the capture form never drift apart.
 *   • OSM-based geocoding (Nominatim + Photon) used to resolve a city name and
 *     to turn a lead's free-text location/region into coordinates.
 *
 * All network calls hit free OpenStreetMap services. Their usage policy asks for
 * light, debounced, non-bulk use — so lead geocoding is QUEUED (≤ ~1 req/sec)
 * and CACHED in localStorage, and only ever runs for leads that have no exact
 * pin saved from the picker.
 * ──────────────────────────────────────────────────────────────────────── */

export const NOMINATIM = "https://nominatim.openstreetmap.org";
export const PHOTON = "https://photon.komoot.io";

/* ── City scopes ─────────────────────────────────────────────────────────── */

export interface CityScope {
  id: string;
  label: string;
  center: [number, number];                 // [lat, lng]
  bbox: [number, number, number, number];    // [minLng, minLat, maxLng, maxLat]
  zoom: number;
}

export type Bbox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

/** Seed cities shipped by default. Admins can add/remove cities; the working
 *  set is persisted per browser (localStorage) under CITY_SCOPES_KEY. */
export const DEFAULT_CITY_SCOPES: CityScope[] = [
  {
    id: "bengaluru",
    label: "Bengaluru",
    center: [12.9716, 77.5946],
    bbox: [77.46, 12.83, 77.78, 13.14],
    zoom: 11,
  },
  {
    id: "hyderabad",
    label: "Hyderabad",
    center: [17.385, 78.4867],
    bbox: [78.24, 17.2, 78.66, 17.56],
    zoom: 11,
  },
];

export const CITY_SCOPES_KEY = "repairox-location-target-cities";

export function isValidScope(s: any): s is CityScope {
  return (
    s &&
    typeof s.id === "string" &&
    typeof s.label === "string" &&
    Array.isArray(s.center) &&
    s.center.length === 2 &&
    Array.isArray(s.bbox) &&
    s.bbox.length === 4 &&
    typeof s.zoom === "number"
  );
}

/** Load the admin-managed city list (falls back to the seed defaults). */
export function loadCityScopes(): CityScope[] {
  if (typeof window === "undefined") return DEFAULT_CITY_SCOPES;
  try {
    const raw = window.localStorage.getItem(CITY_SCOPES_KEY);
    if (!raw) return DEFAULT_CITY_SCOPES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isValidScope) && parsed.length > 0) return parsed;
    return DEFAULT_CITY_SCOPES;
  } catch {
    return DEFAULT_CITY_SCOPES;
  }
}

export function saveCityScopes(scopes: CityScope[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CITY_SCOPES_KEY, JSON.stringify(scopes));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Combined bbox spanning every configured city (the "All cities" scope). */
export function allCitiesBboxOf(scopes: CityScope[]): Bbox {
  const list = scopes.length ? scopes : DEFAULT_CITY_SCOPES;
  const xs = list.flatMap((c) => [c.bbox[0], c.bbox[2]]);
  const ys = list.flatMap((c) => [c.bbox[1], c.bbox[3]]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Is a point inside a bbox? */
export function inBbox(lat: number, lng: number, b: Bbox): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/** Which configured city (region) does a point fall in? Returns the matching
 *  CityScope, or null when the point isn't inside any configured city's box.
 *  Used to classify a map-picked address into a stable REGION bucket instead of
 *  dumping the full street address as a brand-new region. */
export function cityScopeForPoint(lat: number, lng: number, scopes: CityScope[]): CityScope | null {
  const list = scopes.length ? scopes : DEFAULT_CITY_SCOPES;
  // Prefer the smallest matching box (handles overlapping/nested city boxes).
  let best: CityScope | null = null;
  let bestArea = Infinity;
  for (const c of list) {
    if (!inBbox(lat, lng, c.bbox)) continue;
    const area = Math.abs((c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]));
    if (area < bestArea) { best = c; bestArea = area; }
  }
  return best;
}

/** Resolve a city NAME to a CityScope (center + bounding box) via Nominatim,
 *  which returns a `boundingbox` for places. Returns null when unresolved. */
export async function resolveCityScope(name: string): Promise<CityScope | null> {
  const q = name.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `${NOMINATIM}/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit || !Array.isArray(hit.boundingbox) || hit.boundingbox.length < 4) return null;
    // Nominatim boundingbox = [minLat, maxLat, minLng, maxLng] (strings).
    const [minLat, maxLat, minLng, maxLng] = hit.boundingbox.map(Number);
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if ([minLat, maxLat, minLng, maxLng, lat, lng].some(Number.isNaN)) return null;
    const label: string = hit.name || (hit.display_name ? String(hit.display_name).split(",")[0] : q);
    const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Math.round(lat * 100)}${Math.round(lng * 100)}`;
    return { id, label, center: [lat, lng], bbox: [minLng, minLat, maxLng, maxLat], zoom: 11 };
  } catch {
    return null;
  }
}

/* ── Geocoding (free-text → coordinates) ─────────────────────────────────── */

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Readable label returned by the geocoder (may be ""). */
  label: string;
}

/** Geocode a free-text address/landmark/city string. Optionally bias/bound to
 *  a bbox. Tries Nominatim first (good for postal addresses), then Photon
 *  (fuzzy / POI). Returns the best single hit, or null. */
export async function geocodeText(query: string, bbox?: Bbox): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;

  // Nominatim — bounded to the bbox when provided.
  try {
    let url = `${NOMINATIM}/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
    if (bbox) {
      // Nominatim viewbox order is minLng,maxLat,maxLng,minLat.
      const viewbox = `${bbox[0]},${bbox[3]},${bbox[2]},${bbox[1]}`;
      url += `&viewbox=${viewbox}&bounded=1`;
    }
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (hit) {
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          return { lat, lng, label: String(hit.display_name ?? q) };
        }
      }
    }
  } catch {
    /* fall through to Photon */
  }

  // Photon — fuzzy / POI fallback.
  try {
    let url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`;
    if (bbox) {
      const centerLat = (bbox[1] + bbox[3]) / 2;
      const centerLng = (bbox[0] + bbox[2]) / 2;
      url += `&bbox=${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}&lat=${centerLat}&lon=${centerLng}`;
    }
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      const f = Array.isArray(data?.features) ? data.features[0] : null;
      const c = f?.geometry?.coordinates;
      if (Array.isArray(c) && c.length >= 2) {
        const lat = Number(c[1]);
        const lng = Number(c[0]);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          const p = f.properties ?? {};
          const label = [p.name, p.city || p.town || p.village, p.state].filter(Boolean).join(", ");
          return { lat, lng, label: label || q };
        }
      }
    }
  } catch {
    /* give up */
  }

  return null;
}

/* ── Cached, rate-limited lead geocoder ──────────────────────────────────── */

const GEO_CACHE_KEY = "repairox-geocode-cache-v1";
type GeoCache = Record<string, { lat: number; lng: number; label: string } | null>;

function loadGeoCache(): GeoCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GEO_CACHE_KEY);
    return raw ? (JSON.parse(raw) as GeoCache) : {};
  } catch {
    return {};
  }
}

function saveGeoCache(cache: GeoCache): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

/** Normalize a location string into a stable cache key. */
export function geoCacheKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Simple FIFO queue so we never fire geocoding faster than OSM's ~1 req/sec.
let geoChain: Promise<void> = Promise.resolve();
const GEO_MIN_GAP_MS = 1100;

function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = geoChain.then(async () => {
    const started = Date.now();
    const result = await fn();
    const elapsed = Date.now() - started;
    if (elapsed < GEO_MIN_GAP_MS) await new Promise((r) => setTimeout(r, GEO_MIN_GAP_MS - elapsed));
    return result;
  });
  // Keep the chain alive regardless of individual failures.
  geoChain = run.then(() => undefined, () => undefined);
  return run;
}

/** Geocode a lead's free-text location, cached + rate-limited. Returns a point
 *  or null (null is also cached so we don't re-query an unresolvable string).
 *  `null` cache entries are retried only when the text changes. */
export async function geocodeLeadLocation(text: string, bbox?: Bbox): Promise<GeoPoint | null> {
  const key = geoCacheKey(text);
  if (!key) return null;

  const cache = loadGeoCache();
  if (Object.prototype.hasOwnProperty.call(cache, key)) {
    const cached = cache[key];
    return cached ? { ...cached } : null;
  }

  const point = await queued(() => geocodeText(text, bbox));
  const next = loadGeoCache();
  next[key] = point ? { lat: point.lat, lng: point.lng, label: point.label } : null;
  saveGeoCache(next);
  return point;
}
