/* ────────────────────────────────────────────────────────────────────────
 * RepairOX — Leaflet CDN loader (shared singleton, zero npm dependency)
 *
 * Leaflet (CSS + JS) is loaded ON DEMAND from CDN the first time any map
 * surface needs it — no npm dependency, no SSR issues, and it never touches
 * the bundle for pages that don't render a map (the same load-on-demand
 * philosophy the design system uses for SheetJS).
 *
 * The loader is a cross-call singleton: the Location Picker and the Lead Map
 * View both call `loadLeaflet()` and share the SAME `window.L` instance and the
 * SAME injected <link>/<script>. Do NOT add `leaflet` / `react-leaflet` as npm
 * dependencies — this is the one true Leaflet integration.
 * ──────────────────────────────────────────────────────────────────────── */

/* Pinned CDN URLs. */
export const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
export const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

let leafletPromise: Promise<any> | null = null;

/** Load Leaflet from CDN once; resolves with the global `L`. Safe to call from
 *  many surfaces — the <link>/<script> and the resolved `L` are shared. */
export function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
    // JS
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing && (window as any).L) return resolve((window as any).L);
    const script = existing ?? document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.crossOrigin = "";
    script.addEventListener("load", () => resolve((window as any).L));
    script.addEventListener("error", () => reject(new Error("Failed to load Leaflet")));
    if (!existing) document.body.appendChild(script);
  });
  return leafletPromise;
}
