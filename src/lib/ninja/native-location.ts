/* Location provider adapter for the Ninja app.
   - Installed RepairOX Ninja app (Capacitor shell, see docs/ninja-mobile-app.md):
     uses @capacitor-community/background-geolocation, which keeps reporting with
     the screen locked / while Google Maps is in front, behind the OS-required
     persistent "sharing location" notification.
   - Browser / PWA: navigator.geolocation.watchPosition (foreground only; the UI
     says so). No dependency is imported here: the native plugin is discovered at
     runtime via window.Capacitor, so the web bundle stays unchanged. */

export interface Fix { lat: number; lng: number; accuracy: number; speed: number | null; heading: number | null; at: number }
export type FixCb = (f: Fix) => void;
export type ErrCb = (code: "denied" | "unavailable", message: string) => void;

interface BgPlugin {
  addWatcher(opts: Record<string, unknown>, cb: (loc?: { latitude: number; longitude: number; accuracy: number; speed: number | null; bearing: number | null; time: number | null }, err?: { code?: string; message?: string }) => void): Promise<string>;
  removeWatcher(opts: { id: string }): Promise<void>;
  openSettings?(): Promise<void>;
}

function capacitor(): { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor ?? null;
}

export function nativeBackgroundAvailable(): boolean {
  const c = capacitor();
  return !!(c?.isNativePlatform?.() && c.Plugins?.BackgroundGeolocation);
}

/** Start watching. Returns a stop() function. */
export async function watchLocation(onFix: FixCb, onErr: ErrCb, label: string): Promise<() => void> {
  const c = capacitor();
  const bg = c?.Plugins?.BackgroundGeolocation as BgPlugin | undefined;
  if (c?.isNativePlatform?.() && bg) {
    const id = await bg.addWatcher(
      { backgroundTitle: "RepairOX Ninja", backgroundMessage: `Sharing location for ${label}`, requestPermissions: true, stale: false, distanceFilter: 20 },
      (loc, err) => {
        if (err) { onErr(err.code === "NOT_AUTHORIZED" ? "denied" : "unavailable", err.message ?? "Location unavailable"); return; }
        if (loc) onFix({ lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy, speed: loc.speed, heading: loc.bearing, at: loc.time ?? Date.now() });
      },
    );
    return () => { void bg.removeWatcher({ id }); };
  }
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) { onErr("unavailable", "This device has no GPS access."); return () => {}; }
  const w = navigator.geolocation.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, heading: p.coords.heading, at: p.timestamp }),
    (e) => onErr(e.code === 1 ? "denied" : "unavailable", e.code === 1 ? "Location permission denied. Turn it on to share your trip." : "Can't get a GPS fix."),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(w);
}
