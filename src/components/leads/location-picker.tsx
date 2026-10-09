"use client";

/* ────────────────────────────────────────────────────────────────────────
 * RepairOX — Location Picker (Leaflet + OpenStreetMap, zero-cost, no API key)
 *
 * A drop-in map picker for the Lead capture Location field. It captures an
 * EXACT pin (lat / lng) + a shareable maps URL alongside the free-text address,
 * so the field team gets a navigable point.
 *
 * Capabilities:
 *   • Search an address  → Nominatim (OSM) geocoding → drops the pin.
 *   • Drag / click the map → moves the pin → reverse-geocodes to an address.
 *   • Paste coordinates ("12.9716, 77.5946") → resolves & drops the pin.
 *   • "Use my location"  → browser geolocation.
 *
 * Leaflet is loaded ON DEMAND from CDN (CSS + JS) the first time the picker
 * opens — no npm dependency, no SSR issues, and it never touches the bundle for
 * pages that don't open it (the same load-on-demand philosophy the design
 * system uses for SheetJS).
 *
 * OSM Nominatim usage policy: max ~1 req/sec, a descriptive UA/Referer, and no
 * heavy bulk use. We debounce search and only geocode on explicit intent.
 * ──────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Search, X, LocateFixed, Loader2, Check, Crosshair, Plus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadLeaflet } from "@/lib/leaflet-loader";
import {
  type CityScope,
  DEFAULT_CITY_SCOPES,
  loadCityScopes,
  saveCityScopes,
  resolveCityScope,
  allCitiesBboxOf,
  cityScopeForPoint,
} from "@/lib/geo/city-scopes";

export type { CityScope } from "@/lib/geo/city-scopes";
export { DEFAULT_CITY_SCOPES } from "@/lib/geo/city-scopes";

const NOMINATIM = "https://nominatim.openstreetmap.org";
// Photon (Komoot) — OSM-based geocoder that does fuzzy, partial, POI-aware
// search (shop names, landmarks, businesses) far better than raw Nominatim, and
// is CORS-open for browser use. We query it first and fall back / merge with
// Nominatim so both address AND place-name searches resolve.
const PHOTON = "https://photon.komoot.io";
const PIN_ZOOM = 16;

/* City scopes, the admin-managed city list + geocoding live in the shared geo
   module (`@/lib/geo/city-scopes`) so the Lead Map and this picker share ONE
   source of truth. Imported at the top of this file. */

const DEFAULT_ZOOM = 5;

export interface PickedLocation {
  lat: number;
  lng: number;
  /** Reverse-geocoded / searched display address (may be ""). */
  address: string;
  /** Shareable maps URL for the picked point. */
  mapsUrl: string;
  /** The configured city/region the pin falls in (a stable REGION bucket), or
   *  "" when the point isn't inside any configured city box. Callers use this to
   *  set the lead's `region` instead of the full street address. */
  region: string;
}

/** Build a shareable maps URL for a point. Uses Google Maps (universally
 *  openable on any device) with the coordinates as the query. */
export function mapsUrlFor(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Parse a pasted "lat, lng" (or "lat lng") string into a point, or null. */
export function parseCoordinates(raw: string): { lat: number; lng: number } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.display_name ?? "";
  } catch {
    return "";
  }
}

interface SearchResult {
  lat: number;
  lng: number;
  label: string;
}

/** Build a readable label from Photon's GeoJSON properties (name + locality). */
function photonLabel(p: any): string {
  const parts = [
    p.name,
    p.street && p.housenumber ? `${p.housenumber} ${p.street}` : p.street,
    p.district,
    p.city || p.town || p.village,
    p.state,
    p.postcode,
    p.country,
  ].filter(Boolean);
  // De-dupe consecutive repeats (Photon sometimes repeats name in street).
  const seen = new Set<string>();
  const clean = parts.filter((x: string) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return clean.join(", ");
}

type Bbox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

function inBbox(lat: number, lng: number, b: Bbox): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/** Photon — fuzzy / POI-aware. Best for "shop name + area" queries. Bounded to
 *  the scope's bbox so only in-city results come back. */
async function searchPhoton(query: string, b: Bbox): Promise<SearchResult[]> {
  try {
    const centerLat = (b[1] + b[3]) / 2;
    const centerLng = (b[0] + b[2]) / 2;
    // bbox constrains results; lat/lon biases ranking toward the city centre.
    const res = await fetch(
      `${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=10&lang=en&bbox=${b[0]},${b[1]},${b[2]},${b[3]}&lat=${centerLat}&lon=${centerLng}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const feats = Array.isArray(data?.features) ? data.features : [];
    return feats
      .map((f: any): SearchResult | null => {
        const c = f?.geometry?.coordinates;
        if (!Array.isArray(c) || c.length < 2) return null;
        return { lat: Number(c[1]), lng: Number(c[0]), label: photonLabel(f.properties) };
      })
      .filter((x: SearchResult | null): x is SearchResult => !!x && !!x.label && inBbox(x.lat, x.lng, b));
  } catch {
    return [];
  }
}

/** Nominatim — solid for full postal addresses. `viewbox` + `bounded=1` keeps
 *  results strictly inside the city box. */
async function searchNominatim(query: string, b: Bbox): Promise<SearchResult[]> {
  try {
    // Nominatim viewbox order is minLng,maxLat,maxLng,minLat (x1,y1,x2,y2).
    const viewbox = `${b[0]},${b[3]},${b[2]},${b[1]}`;
    const res = await fetch(
      `${NOMINATIM}/search?format=jsonv2&limit=10&addressdetails=0&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((d: any) => ({ lat: Number(d.lat), lng: Number(d.lon), label: d.display_name as string }))
      .filter((x: SearchResult) => inBbox(x.lat, x.lng, b));
  } catch {
    return [];
  }
}

/** Combined search: query BOTH providers in parallel (bounded to `bbox`) and
 *  merge, so shop/POI names (Photon) AND postal addresses (Nominatim) both
 *  resolve — only within the chosen city. De-duped by proximity. */
async function searchAddress(query: string, bbox: Bbox): Promise<SearchResult[]> {
  const [photon, nominatim] = await Promise.all([searchPhoton(query, bbox), searchNominatim(query, bbox)]);
  const merged: SearchResult[] = [];
  const near = (a: SearchResult, b: SearchResult) =>
    Math.abs(a.lat - b.lat) < 0.0006 && Math.abs(a.lng - b.lng) < 0.0006; // ~60m
  for (const r of [...photon, ...nominatim]) {
    if (!r.label || Number.isNaN(r.lat) || Number.isNaN(r.lng)) continue;
    if (merged.some((m) => near(m, r))) continue;
    merged.push(r);
    if (merged.length >= 10) break;
  }
  return merged;
}

/* ── The picker modal ───────────────────────────────────────────────────── */

export function LocationPicker({
  open,
  onClose,
  initial,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  /** Existing pin to preload (edit mode). */
  initial?: { lat: number | null; lng: number | null; address?: string } | null;
  onPick: (loc: PickedLocation) => void;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [noResults, setNoResults] = useState(false);
  // Admin-managed target cities (persisted per browser). Search is constrained
  // to the selected city's bounding box; results only come from inside it.
  const [cities, setCities] = useState<CityScope[]>(DEFAULT_CITY_SCOPES);
  useEffect(() => { setCities(loadCityScopes()); }, []);
  const [scopeId, setScopeId] = useState<string>(() => loadCityScopes()[0]?.id ?? "all");
  const scope = cities.find((c) => c.id === scopeId) ?? cities[0];
  const searchBbox = scopeId === "all"
    ? allCitiesBboxOf(cities.length ? cities : DEFAULT_CITY_SCOPES)
    : (scope?.bbox ?? allCitiesBboxOf(cities.length ? cities : DEFAULT_CITY_SCOPES));
  const searchBboxRef = useRef<Bbox>(searchBbox);
  searchBboxRef.current = searchBbox;

  // City-management UI state.
  const [addingCity, setAddingCity] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [resolvingCity, setResolvingCity] = useState(false);
  const [cityError, setCityError] = useState("");
  const [copied, setCopied] = useState<"coords" | "address" | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const copyText = useCallback(async (text: string, which: "coords" | "address") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  }, []);

  const persistCities = useCallback((next: CityScope[]) => {
    setCities(next);
    saveCityScopes(next);
  }, []);

  const setPin = useCallback(async (lat: number, lng: number, addressHint?: string) => {
    const L = LRef.current;
    if (L && mapRef.current) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current);
        markerRef.current.on("dragend", async () => {
          const p = markerRef.current.getLatLng();
          await setPin(p.lat, p.lng);
        });
      }
      mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), PIN_ZOOM));
    }
    // Optimistic pin (coordinates first); resolve the address in the background.
    setPicked({ lat, lng, address: addressHint ?? "", mapsUrl: mapsUrlFor(lat, lng), region: "" });
    if (!addressHint) {
      setResolving(true);
      const addr = await reverseGeocode(lat, lng);
      setResolving(false);
      setPicked((prev) => (prev && prev.lat === lat && prev.lng === lng ? { ...prev, address: addr } : prev));
    }
  }, []);

  // Initialise the map when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current) return;
        LRef.current = L;
        const hasPin = initial?.lat != null && initial?.lng != null;
        // No pin yet → center on the active city scope (not all-India).
        const scopeCenter = scope?.center ?? [12.9716, 77.5946];
        const scopeZoom = scope?.zoom ?? DEFAULT_ZOOM;
        const startLat = initial?.lat ?? scopeCenter[0];
        const startLng = initial?.lng ?? scopeCenter[1];
        const map = L.map(mapEl.current, { zoomControl: true }).setView(
          [startLat, startLng],
          hasPin ? PIN_ZOOM : scopeZoom,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
        map.on("click", (e: any) => setPin(e.latlng.lat, e.latlng.lng));
        mapRef.current = map;
        setLoading(false);
        if (hasPin) setPin(initial!.lat as number, initial!.lng as number, initial?.address);
        // Leaflet needs a size recalculation once the container is laid out.
        setTimeout(() => map.invalidateSize(), 120);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load the map. Check your connection and try again.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search. If the query is a coordinate pair, resolve it directly.
  useEffect(() => {
    setNoResults(false);
    const coords = parseCoordinates(query);
    if (coords) {
      setResults([]);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchAddress(query.trim(), searchBboxRef.current);
      setResults(r);
      setNoResults(r.length === 0);
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query, scopeId]);

  const onSearchSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    // Paste-coordinates path.
    const coords = parseCoordinates(q);
    if (coords) {
      await setPin(coords.lat, coords.lng);
      setResults([]);
      setNoResults(false);
      return;
    }
    // If the debounce already produced hits, pin the best one immediately.
    if (results[0]) {
      await setPin(results[0].lat, results[0].lng, results[0].label);
      setQuery(results[0].label);
      setResults([]);
      setNoResults(false);
      return;
    }
    // Otherwise fetch NOW (Enter/Search pressed before debounce completed) and
    // drop the pin on the top hit so searching always moves the map.
    setSearching(true);
    setNoResults(false);
    const r = await searchAddress(q, searchBboxRef.current);
    setSearching(false);
    if (r[0]) {
      await setPin(r[0].lat, r[0].lng, r[0].label);
      setQuery(r[0].label);
      setResults([]);
    } else {
      setNoResults(true);
    }
  }, [query, results, setPin]);

  // Close the results dropdown when clicking outside the search area / list.
  useEffect(() => {
    if (results.length === 0) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchWrapRef.current?.contains(t)) return;
      if (resultsRef.current?.contains(t)) return;
      setResults([]);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [results.length]);

  // Switch the search city and recenter the map there (unless a pin is set).
  const changeScope = useCallback((id: string) => {
    setScopeId(id);
    setResults([]);
    setNoResults(false);
    const s = cities.find((c) => c.id === id);
    if (s && mapRef.current && !markerRef.current) {
      mapRef.current.setView(s.center, s.zoom);
    }
  }, [cities]);

  // Add a target city by NAME (bbox auto-resolved via geocoding).
  const addCity = useCallback(async () => {
    const name = cityQuery.trim();
    if (!name) return;
    setResolvingCity(true);
    setCityError("");
    const resolved = await resolveCityScope(name);
    setResolvingCity(false);
    if (!resolved) {
      setCityError("Couldn't find that city. Try a more specific name (e.g. \u201CPune, Maharashtra\u201D).");
      return;
    }
    // Skip duplicates (same id or a near-identical center).
    if (cities.some((c) => c.id === resolved.id || (Math.abs(c.center[0] - resolved.center[0]) < 0.05 && Math.abs(c.center[1] - resolved.center[1]) < 0.05))) {
      setCityError(`${resolved.label} is already in the list.`);
      return;
    }
    const next = [...cities, resolved];
    persistCities(next);
    setCityQuery("");
    setAddingCity(false);
    // Select the new city AND recenter the map directly from `resolved` — do
    // NOT go through changeScope(), which looks up `cities` state that hasn't
    // updated yet (so it wouldn't find the new city and the map would stay put).
    setScopeId(resolved.id);
    setResults([]);
    setNoResults(false);
    if (mapRef.current && !markerRef.current) {
      mapRef.current.setView(resolved.center, resolved.zoom);
    }
  }, [cityQuery, cities, persistCities]);

  const removeCity = useCallback((id: string) => {
    const next = cities.filter((c) => c.id !== id);
    const finalList = next.length ? next : DEFAULT_CITY_SCOPES;
    persistCities(finalList);
    if (scopeId === id) {
      const fallback = finalList[0];
      setScopeId(fallback.id);
      setResults([]);
      setNoResults(false);
      if (mapRef.current && !markerRef.current) {
        mapRef.current.setView(fallback.center, fallback.zoom);
      }
    }
  }, [cities, scopeId, persistCities]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location. Search or drop a pin instead.");
      return;
    }
    setResolving(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => setPin(pos.coords.latitude, pos.coords.longitude),
      () => {
        setResolving(false);
        setError("Location permission denied. Search or drop a pin instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [setPin]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10050] bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        data-lead-popover-open="true"
        className="fixed left-1/2 top-1/2 z-[10051] flex max-h-[90vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-20px_rgba(20,30,80,0.45)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
              <MapPin className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[13px] font-bold text-foreground">Pick location</h2>
              <p className="text-[11px] text-muted-foreground">Search a shop, landmark or address · drop a pin · paste coordinates</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + actions */}
        <div className="relative z-[10060] border-b border-border p-3">
          {/* City scope — search is constrained to the selected city. Admins
              add/remove target cities here; the set persists per browser. */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Search in:</span>
            {cities.map((c) => {
              const active = scopeId === c.id;
              return (
                <span
                  key={c.id}
                  className={cn(
                    "group relative inline-flex items-center gap-1 rounded-full border py-1 pl-2.5 text-[11.5px] font-medium transition-colors",
                    cities.length > 1 ? "pr-1" : "pr-2.5",
                    active
                      ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]"
                      : "border-border text-muted-foreground hover:border-[#4361EE]/40",
                  )}
                >
                  <button type="button" onClick={() => changeScope(c.id)}>{c.label}</button>
                  {cities.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(c.id)}
                      title={`Remove ${c.label}`}
                      className={cn(
                        "grid h-4 w-4 place-items-center rounded-full transition-colors",
                        active ? "hover:bg-[#4361EE]/15" : "hover:bg-rose-100 hover:text-rose-600",
                      )}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}

                  {/* Remove confirmation */}
                  {confirmRemoveId === c.id && (
                    <>
                      <div className="fixed inset-0 z-[10061]" onClick={() => setConfirmRemoveId(null)} />
                      <div className="absolute left-1/2 top-[calc(100%+6px)] z-[10062] w-52 -translate-x-1/2 rounded-xl border border-border bg-card p-3 text-left shadow-[0_16px_40px_-12px_rgba(20,30,80,0.35)]">
                        <p className="text-[12px] font-semibold text-foreground">Remove {c.label}?</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">It will no longer be a search target.</p>
                        <div className="mt-2.5 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => { removeCity(c.id); setConfirmRemoveId(null); }}
                            className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-rose-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </span>
              );
            })}
            {/* Add city — placed right after the cities, before "All cities" */}
            {addingCity ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-input bg-card py-0.5 pl-2 pr-0.5">
                <input
                  autoFocus
                  value={cityQuery}
                  onChange={(e) => { setCityQuery(e.target.value); setCityError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } if (e.key === "Escape") { setAddingCity(false); setCityQuery(""); setCityError(""); } }}
                  placeholder="City name…"
                  className="w-28 bg-transparent px-1 text-[11.5px] outline-none ring-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={addCity}
                  disabled={resolvingCity || cityQuery.trim().length < 2}
                  title="Add city"
                  className="grid h-5 w-5 place-items-center rounded-full bg-[#4361EE] text-white disabled:opacity-40"
                >
                  {resolvingCity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingCity(false); setCityQuery(""); setCityError(""); }}
                  title="Cancel"
                  className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCity(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-[#4361EE]/50 hover:text-[#4361EE]"
              >
                <Plus className="h-3 w-3" /> Add city
              </button>
            )}
            {/* All cities — always last */}
            {cities.length > 1 && (
              <button
                type="button"
                onClick={() => changeScope("all")}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  scopeId === "all"
                    ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]"
                    : "border-border text-muted-foreground hover:border-[#4361EE]/40",
                )}
              >
                All cities
              </button>
            )}
          </div>
          {cityError && <p className="mb-2 text-[11px] font-medium text-rose-600">{cityError}</p>}
          <div ref={searchWrapRef} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSearchSubmit(); } }}
                placeholder={`Search a shop, landmark or area in ${scopeId === "all" ? "any city" : scope?.label ?? "the city"}…`}
                className="h-[38px] w-full rounded-xl border border-input bg-card pl-9 pr-3 text-[13px] outline-none transition-all placeholder:text-muted-foreground hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
            <Button size="sm" className="gap-1.5 whitespace-nowrap" onClick={onSearchSubmit} disabled={searching || query.trim().length < 2}>
              <Search className="h-4 w-4" /> Search
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" onClick={useMyLocation}>
              <LocateFixed className="h-4 w-4" /> My location
            </Button>
          </div>
          {noResults && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              No match in {scopeId === "all" ? "the configured cities" : scope?.label}. Try a nearby landmark, switch the city above, or drop the pin on the map manually.
            </p>
          )}

          {/* Search results dropdown — pick the right place */}
          {results.length > 0 && (
            <div ref={resultsRef} className="absolute inset-x-3 top-[52px] z-[10060] max-h-72 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {results.length} {results.length === 1 ? "result" : "results"}
                </span>
                <button
                  type="button"
                  onClick={() => { setResults([]); setNoResults(false); }}
                  title="Close results"
                  className="grid h-5 w-5 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto p-1">
              {results.map((r, i) => {
                const [primary, ...restParts] = r.label.split(",");
                const context = restParts.join(",").trim();
                return (
                  <button
                    key={`${r.lat}-${r.lng}-${i}`}
                    type="button"
                    onClick={async () => { await setPin(r.lat, r.lng, r.label); setQuery(r.label); setResults([]); setNoResults(false); }}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[#EEF1FD]/60"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-foreground">{primary.trim()}</span>
                      {context && <span className="block truncate text-[11px] text-muted-foreground">{context}</span>}
                    </span>
                  </button>
                );
              })}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="relative min-h-[320px] flex-1">
          {loading && (
            <div className="absolute inset-0 z-[5] grid place-items-center bg-muted/40 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading map…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-[5] grid place-items-center bg-card p-6 text-center text-[12.5px] text-rose-600">
              {error}
            </div>
          )}
          <div ref={mapEl} className="h-full w-full" style={{ minHeight: 320 }} />
          {!loading && !error && !picked && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[5] flex justify-center">
              <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white">
                <Crosshair className="h-3 w-3" /> Tap the map to drop a pin
              </span>
            </div>
          )}
        </div>

        {/* Picked summary + footer */}
        <div className="border-t border-border p-3">
          <div className="mb-3 rounded-xl border border-border bg-muted/20 p-3">
            {picked ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
                    {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyText(`${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}`, "coords")}
                    title="Copy coordinates"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-[#4361EE]"
                  >
                    {copied === "coords" ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
                <div className="flex items-start gap-1.5">
                  <p className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">
                    {resolving ? "Resolving address…" : picked.address || "No address resolved — coordinates saved."}
                  </p>
                  {!resolving && !!picked.address && (
                    <button
                      type="button"
                      onClick={() => copyText(picked.address, "address")}
                      title="Copy address"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-[#4361EE]"
                    >
                      {copied === "address" ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">No pin yet. Search, use your location, or tap the map.</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!picked}
              onClick={() => {
                if (!picked) return;
                // Classify the pin into a stable REGION (configured city) rather
                // than letting the full street address become a new region. Fall
                // back to the actively-selected city when the pin sits just
                // outside its box.
                const hit = cityScopeForPoint(picked.lat, picked.lng, cities);
                const region = hit?.label ?? (scopeId !== "all" ? scope?.label ?? "" : "");
                onPick({ ...picked, region });
                onClose();
              }}
            >
              <Check className="h-4 w-4" /> Use this location
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
