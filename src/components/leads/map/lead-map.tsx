"use client";

/* ────────────────────────────────────────────────────────────────────────
 * RepairOX — Lead Map (Leaflet + OpenStreetMap, zero-cost, no API key)
 *
 * A read-only map that shows WHERE leads are. Each lead is resolved to a point:
 *   1. its exact saved pin (`locationLat` / `locationLng` from the picker), or
 *   2. a geocoded point from its free-text address / region (cached +
 *      rate-limited via `@/lib/geo/city-scopes`), so leads that were never
 *      pinned still appear on the map "belonging to that place".
 *
 * Reuses the SAME on-demand CDN Leaflet loader as the Location Picker
 * (`@/lib/leaflet-loader`) — no npm dependency, no SSR issues. Load this via
 * `next/dynamic` with `ssr:false`.
 * ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { loadLeaflet } from "@/lib/leaflet-loader";
import { geocodeLeadLocation, type Bbox, type CityScope } from "@/lib/geo/city-scopes";
import { formatINR } from "@/lib/utils";

export interface MappableLead {
  id: string;
  name: string;
  /** Secondary line: region / free-text location. */
  place: string;
  /** The free-text used to geocode when there is no exact pin. */
  geocodeText: string;
  /** Pipeline value (estimate / expectedValue) — may be null. */
  value: number | null;
  /** Normalized status key used to pick the marker color. */
  statusKey: string;
  /** Human label for the status (shown in the popup). */
  statusLabel: string;
  /** Exact pin from the lead form, when present. */
  lat: number | null;
  lng: number | null;
}

/* Marker palette by normalized status key. Mirrors the leads status language;
   falls back to a neutral slate for anything unmapped. */
const STATUS_COLOR: Record<string, string> = {
  new: "#0ea5e9",
  contacted: "#8b5cf6",
  qualified: "#6366f1",
  "follow-up": "#f59e0b",
  proposal: "#f59e0b",
  quotation: "#f59e0b",
  converted: "#10b981",
  won: "#10b981",
  lost: "#ef4444",
  "not-qualified": "#9ca3af",
};

export function statusColor(key: string): string {
  return STATUS_COLOR[key] ?? "#64748b";
}

/* India-ish default view when nothing is resolved yet. */
const DEFAULT_CENTER: [number, number] = [22.3511, 78.6677];
const DEFAULT_ZOOM = 4;

/** A lead resolved to a concrete point (pin or geocoded). */
interface ResolvedLead extends MappableLead {
  rlat: number;
  rlng: number;
  /** How we got the coordinates. */
  via: "pin" | "geocode";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface LeadMapProps {
  leads: MappableLead[];
  /** Selected city to fly to (null = fit to all resolved leads). */
  city: CityScope | null;
  /** Bbox to constrain geocoding + plotting (the selected city or all cities). */
  bbox?: Bbox;
  /** Reports resolution progress to the parent for the counts UI. */
  onResolved?: (info: { plotted: number; geocoding: boolean; unresolved: number }) => void;
}

export function LeadMap({ leads, city, bbox, onResolved }: LeadMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Geocoded fallbacks: lead id -> resolved point (or null if unresolvable).
  const [geo, setGeo] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [geocoding, setGeocoding] = useState(false);

  const bboxKey = bbox ? bbox.join(",") : "";

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        const map = L.map(mapEl.current, { zoomControl: true, scrollWheelZoom: true }).setView(
          DEFAULT_CENTER,
          DEFAULT_ZOOM,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setLoading(false);
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
        layerRef.current = null;
      }
    };
  }, []);

  // Geocode leads that have no exact pin (cached + rate-limited). Runs when the
  // lead set or the geocoding bbox changes.
  useEffect(() => {
    const pending = leads.filter(
      (l) => (l.lat == null || l.lng == null) && l.geocodeText.trim() && geo[l.id] === undefined,
    );
    if (pending.length === 0) {
      setGeocoding(false);
      return;
    }
    let cancelled = false;
    setGeocoding(true);
    (async () => {
      for (const lead of pending) {
        if (cancelled) return;
        const point = await geocodeLeadLocation(lead.geocodeText, bbox);
        if (cancelled) return;
        setGeo((prev) => ({ ...prev, [lead.id]: point ? { lat: point.lat, lng: point.lng } : null }));
      }
      if (!cancelled) setGeocoding(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, bboxKey]);

  // Resolve every lead to a concrete point (pin first, else geocoded).
  const resolved = useMemo<ResolvedLead[]>(() => {
    const out: ResolvedLead[] = [];
    for (const l of leads) {
      if (l.lat != null && l.lng != null) {
        out.push({ ...l, rlat: l.lat, rlng: l.lng, via: "pin" });
      } else {
        const g = geo[l.id];
        if (g) out.push({ ...l, rlat: g.lat, rlng: g.lng, via: "geocode" });
      }
    }
    return out;
  }, [leads, geo]);

  // Report progress to the parent (counts UI).
  useEffect(() => {
    const geocodable = leads.filter((l) => l.lat == null || l.lng == null);
    const unresolved = geocodable.filter((l) => geo[l.id] === null).length;
    onResolved?.({ plotted: resolved.length, geocoding, unresolved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.length, geocoding, geo, leads]);

  // (Re)draw markers whenever the resolved set changes.
  useEffect(() => {
    const L = (typeof window !== "undefined" && (window as any).L) || null;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    const pts: [number, number][] = [];

    for (const lead of resolved) {
      const color = statusColor(lead.statusKey);
      const marker = L.circleMarker([lead.rlat, lead.rlng], {
        radius: 8,
        color: "#ffffff",
        weight: 2.5,
        fillColor: color,
        fillOpacity: 1,
      });
      const value = lead.value != null ? formatINR(lead.value) : "—";
      const approx =
        lead.via === "geocode"
          ? `<div style="font-size:10px;color:#a1a1aa;margin-top:4px;font-style:italic">Approx. from address</div>`
          : "";
      marker.bindPopup(
        `<div style="min-width:160px;font-family:ui-sans-serif,system-ui,sans-serif">
           <div style="font-weight:650;font-size:12.5px;color:#18181b">${escapeHtml(lead.name)}</div>
           ${lead.place ? `<div style="font-size:11px;color:#71717a;margin-top:1px">${escapeHtml(lead.place)}</div>` : ""}
           <div style="display:flex;align-items:center;gap:6px;margin-top:7px">
             <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color}"></span>
             <span style="font-size:11px;color:#3f3f46;text-transform:capitalize">${escapeHtml(lead.statusLabel)}</span>
             <span style="margin-left:auto;font-size:11.5px;font-weight:650;color:#18181b">${value}</span>
           </div>
           ${approx}
         </div>`,
      );
      marker.addTo(layer);
      pts.push([lead.rlat, lead.rlng]);
    }

    // Camera: a selected city flies to its box; otherwise fit to all points.
    if (city) {
      map.flyToBounds(
        [
          [city.bbox[1], city.bbox[0]],
          [city.bbox[3], city.bbox[2]],
        ],
        { padding: [40, 40], maxZoom: 13, duration: 0.6 },
      );
    } else if (pts.length === 1) {
      map.flyTo(pts[0], 12, { duration: 0.6 });
    } else if (pts.length > 1) {
      map.flyToBounds(pts, { padding: [48, 48], maxZoom: 13, duration: 0.6 });
    } else {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.4 });
    }
  }, [resolved, city]);

  return (
    <div className="relative min-h-[560px] overflow-hidden rounded-2xl border-2 border-zinc-200 shadow-card">
      <div ref={mapEl} className="absolute inset-0 h-full w-full" />

      {/* Resolving pill (geocoding fallback in progress). */}
      {geocoding && !loading && !error && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#4361EE]" />
          Placing leads from their address…
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-[500] grid place-items-center bg-card/70">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading map…
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-[500] grid place-items-center bg-card/80 px-6 text-center">
          <div className="flex max-w-xs flex-col items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-5 w-5 text-zinc-400" />
            {error}
          </div>
        </div>
      )}
    </div>
  );
}

export default LeadMap;
