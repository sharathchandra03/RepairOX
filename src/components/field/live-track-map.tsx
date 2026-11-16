"use client";
/* Live rider-style tracking map for ONE assignment (View Assignment).
   Opens as a normal street map; the manager can switch to Satellite or Terrain
   like Google Maps. The Ninja's marker glides between real GPS fixes, a trail
   shows where they have been, and a dashed line runs to the destination.
   Only real points are drawn — no fabricated movement. */
import { useEffect, useRef, useState } from "react";
import { Crosshair, Navigation, Radio } from "lucide-react";
import { loadLeaflet } from "@/lib/leaflet-loader";
import { supabase } from "@/lib/supabase";
import { ago, distanceKm, freshness } from "@/lib/ninja/model";
import { cn } from "@/lib/utils";

type Base = "map" | "satellite" | "terrain";
const BASES: Record<Base, { label: string; url: string; attr: string; maxZoom: number; subdomains?: string }> = {
  map: { label: "Map", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap", maxZoom: 19, subdomains: "abc" },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagery © Esri", maxZoom: 19 },
  terrain: { label: "Terrain", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: "© OpenTopoMap · © OpenStreetMap", maxZoom: 17, subdomains: "abc" },
};
const TONE = { green: "#059669", sky: "#0284c7", amber: "#d97706", rose: "#e11d48", slate: "#64748b" } as const;

export interface TrackSession { last_lat: number | null; last_lng: number | null; last_point_at: string | null }
export function LiveTrackMap({ tripId, ninjaName, dest, session, stageLabel, className }: {
  tripId: string; ninjaName: string; dest: { lat: number; lng: number } | null; session: TrackSession | null; stageLabel: string; className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const tiles = useRef<any>(null);
  const rider = useRef<any>(null);
  const trail = useRef<any>(null);
  const link = useRef<any>(null);
  const trailPts = useRef<[number, number][]>([]);
  const follow = useRef(true);
  const [base, setBase] = useState<Base>("map");
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const [, tick] = useState(0);
  const lat = session?.last_lat ?? null, lng = session?.last_lng ?? null;
  const fr = freshness(session?.last_point_at);
  const colour = TONE[fr.tone as keyof typeof TONE] ?? TONE.slate;

  // Map + base layer (default: normal street map)
  useEffect(() => {
    let off = false;
    loadLeaflet().then((L) => {
      if (off || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: false, scrollWheelZoom: true, attributionControl: true }).setView([lat ?? dest?.lat ?? 12.97, lng ?? dest?.lng ?? 77.6], 15);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      map.current = m;
      const b = BASES.map;
      tiles.current = L.tileLayer(b.url, { maxZoom: b.maxZoom, attribution: b.attr, subdomains: b.subdomains ?? "" }).addTo(m);
      trail.current = L.polyline([], { color: "#4361EE", weight: 5, opacity: 0.75, lineCap: "round" }).addTo(m);
      if (dest) {
        const pin = L.divIcon({ className: "", iconSize: [28, 36], iconAnchor: [14, 34], html: `<div style="width:28px;height:28px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#e11d48;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3)"></div>` });
        L.marker([dest.lat, dest.lng], { icon: pin, keyboard: false }).addTo(m).bindTooltip("Destination");
      }
      m.on("dragstart", () => { follow.current = false; setFollowing(false); });
      setReady(true);
    }).catch(() => {});
    return () => { off = true; map.current?.remove(); map.current = null; rider.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Switch base layer
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !map.current) return;
    const b = BASES[base];
    tiles.current?.remove();
    tiles.current = L.tileLayer(b.url, { maxZoom: b.maxZoom, attribution: b.attr, subdomains: b.subdomains ?? "" }).addTo(map.current);
    tiles.current.bringToBack();
  }, [base, ready]);

  // Trail history (real points only)
  useEffect(() => {
    if (!ready || !supabase) return;
    let off = false;
    (async () => {
      const { data } = await supabase!.from("field_location_points").select("lat,lng").eq("trip_id", tripId).order("received_at", { ascending: false }).limit(120);
      if (off) return;
      trailPts.current = ((data ?? []) as { lat: number; lng: number }[]).reverse().map((p) => [p.lat, p.lng]);
      trail.current?.setLatLngs(trailPts.current);
    })();
    return () => { off = true; };
  }, [ready, tripId]);

  // Move the rider on every new fix
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !map.current || lat == null || lng == null) return;
    const last = trailPts.current[trailPts.current.length - 1];
    if (!last || last[0] !== lat || last[1] !== lng) { trailPts.current.push([lat, lng]); trail.current?.setLatLngs(trailPts.current); }
    const html = `<div style="position:relative;width:44px;height:44px;transform:translate(-22px,-22px)">
      <span style="position:absolute;inset:0;border-radius:9999px;background:${colour};opacity:.22"></span>
      <span style="position:absolute;inset:7px;border-radius:9999px;background:${colour};border:3px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font:800 12px Inter,sans-serif">${(ninjaName || "N").slice(0, 1).toUpperCase()}</span></div>`;
    if (!rider.current) rider.current = L.marker([lat, lng], { icon: L.divIcon({ className: "rox-rider", iconSize: [0, 0], html }), zIndexOffset: 1000, keyboard: false }).addTo(map.current);
    else { rider.current.setLatLng([lat, lng]); rider.current.setIcon(L.divIcon({ className: "rox-rider", iconSize: [0, 0], html })); }
    if (dest) {
      if (!link.current) link.current = L.polyline([[lat, lng], [dest.lat, dest.lng]], { color: "#e11d48", weight: 2, dashArray: "6 8", opacity: 0.7 }).addTo(map.current);
      else link.current.setLatLngs([[lat, lng], [dest.lat, dest.lng]]);
    }
    if (follow.current) {
      if (dest) map.current.fitBounds([[lat, lng], [dest.lat, dest.lng]], { padding: [60, 60], maxZoom: 16, animate: true });
      else map.current.panTo([lat, lng], { animate: true });
    }
  }, [ready, lat, lng, session?.last_point_at, colour, ninjaName, dest?.lat, dest?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep "x s ago" truthful
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(iv); }, []);

  const km = lat != null && lng != null && dest ? distanceKm({ lat, lng }, dest) : null;
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border", className)}>
      <div ref={el} className="h-72 w-full bg-slate-100" aria-label="Live Ninja location map" />
      {/* Map type switcher (Google-Maps style) */}
      <div className="absolute right-2 top-2 z-[1001] flex overflow-hidden rounded-lg bg-white text-[11px] font-bold shadow ring-1 ring-black/10">
        {(Object.keys(BASES) as Base[]).map((k) => (
          <button key={k} type="button" onClick={() => setBase(k)} aria-pressed={base === k}
            className={cn("px-2.5 py-1.5 transition", base === k ? "bg-[#4361EE] text-white" : "text-slate-600 hover:bg-slate-50")}>{BASES[k].label}</button>
        ))}
      </div>
      {/* Status card */}
      <div className="absolute bottom-2 left-2 z-[1001] max-w-[70%] rounded-xl bg-white/95 px-3 py-2 shadow ring-1 ring-black/10 backdrop-blur">
        <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-slate-800"><Radio className="h-3.5 w-3.5" style={{ color: colour }} />{ninjaName || "Ninja"} · {stageLabel}</p>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
          {lat == null ? "Waiting for the first location…" : `${fr.label} · updated ${ago(session?.last_point_at)}${km != null ? ` · ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} away` : ""}`}
        </p>
      </div>
      {/* Follow / recentre */}
      <div className="absolute right-2 top-12 z-[1001] flex flex-col gap-1.5">
        <button type="button" title={following ? "Following the Ninja" : "Follow the Ninja"} aria-label="Follow the Ninja"
          onClick={() => { follow.current = true; setFollowing(true); if (lat != null && lng != null) map.current?.panTo([lat, lng]); }}
          className={cn("grid h-8 w-8 place-items-center rounded-lg shadow ring-1 ring-black/10", following ? "bg-[#4361EE] text-white" : "bg-white text-slate-600 hover:bg-slate-50")}><Crosshair className="h-4 w-4" /></button>
        {dest ? <a title="Open destination in Google Maps" aria-label="Open destination in Google Maps" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`}
          className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-600 shadow ring-1 ring-black/10 hover:bg-slate-50"><Navigation className="h-4 w-4" /></a> : null}
      </div>
    </div>
  );
}
