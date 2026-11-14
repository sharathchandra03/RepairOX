"use client";
/* Live Operations Map — authorised active trips with their latest REAL location
   (field_tracking_sessions.last_*; RLS-scoped). Destinations are plotted too.
   Stale points are labelled stale, never shown as live. */
import { useEffect, useRef } from "react";
import { loadLeaflet } from "@/lib/leaflet-loader";
import { freshness, STATUS_META, TYPE_LABEL, type NinjaTrip } from "@/lib/ninja/model";

export interface LivePoint { trip_id: string; last_lat: number | null; last_lng: number | null; last_point_at: string | null }

const COLOR: Record<string, string> = { green: "#059669", sky: "#0284c7", amber: "#d97706", rose: "#e11d48", slate: "#64748b" };

export function LiveOpsMap({ trips, live, ninjaName, onSelect }: { trips: NinjaTrip[]; live: Record<string, LivePoint>; ninjaName: (id: string | null) => string; onSelect?: (t: NinjaTrip) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const fitted = useRef(false);

  useEffect(() => {
    let off = false;
    loadLeaflet().then((L) => {
      if (off || !el.current || map.current) return;
      map.current = L.map(el.current, { zoomControl: true, scrollWheelZoom: true }).setView([12.97, 77.6], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      draw();
    }).catch(() => {});
    return () => { off = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const L = (window as any).L;
    if (!L || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: [number, number][] = [];
    for (const t of trips) {
      const p = live[t.id];
      if (t.dest_lat != null && t.dest_lng != null) {
        L.circleMarker([t.dest_lat, t.dest_lng], { radius: 6, color: "#4361EE", weight: 2, fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(`${t.trip_no} · destination`).addTo(layer.current);
        pts.push([t.dest_lat, t.dest_lng]);
      }
      if (p?.last_lat != null && p.last_lng != null) {
        const fr = freshness(p.last_point_at);
        const c = COLOR[fr.tone] ?? "#64748b";
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;gap:6px;transform:translate(-14px,-14px)"><span style="width:28px;height:28px;border-radius:9999px;background:${c};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.3);display:grid;place-items:center;color:#fff;font:800 11px Inter,sans-serif">${(ninjaName(t.ninja_id) || "N").slice(0, 1)}</span><span style="background:#fff;border-radius:8px;padding:2px 6px;font:700 11px Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);white-space:nowrap">${t.trip_no ?? ""} · ${fr.label}</span></div>`,
        });
        const m = L.marker([p.last_lat, p.last_lng], { icon }).addTo(layer.current);
        m.bindPopup(`<b>${ninjaName(t.ninja_id)}</b><br/>${t.trip_no} · ${TYPE_LABEL[t.trip_type]}<br/>${STATUS_META[t.status].label}<br/>${t.job?.customer ?? ""}`);
        if (onSelect) m.on("click", () => onSelect(t));
        if (t.dest_lat != null && t.dest_lng != null) L.polyline([[p.last_lat, p.last_lng], [t.dest_lat, t.dest_lng]], { color: c, weight: 2, dashArray: "6 6", opacity: 0.7 }).addTo(layer.current);
        pts.push([p.last_lat, p.last_lng]);
      }
    }
    if (pts.length && !fitted.current) { map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); fitted.current = true; }
  }

  useEffect(() => { draw(); }); // redraw on every data change (cheap: few markers)

  return <div ref={el} className="h-[460px] w-full rounded-xl" aria-label="Live operations map" />;
}
