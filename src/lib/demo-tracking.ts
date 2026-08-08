/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Demo Visit Tracking

   Tracks unique device visits to demo accounts. Generates a simple device
   fingerprint (not for security, just for counting unique visitors) and
   stores it in the demo_visits table via Supabase.

   Collected info (no permission popups):
   - Device fingerprint (unique ID)
   - Browser & platform
   - Screen size
   - Timezone
   - Language
   - City/Country (via free IP geolocation)
   - First & last visit timestamps
   ────────────────────────────────────────────────────────────────────────── */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/** Generate a simple device fingerprint for unique visitor tracking. */
function generateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const parts = [
    navigator.userAgent,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.language,
    navigator.hardwareConcurrency || 0,
  ];
  let hash = 0;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "dev_" + Math.abs(hash).toString(36);
}

/** Parse browser name from user agent. */
function parseBrowser(ua: string): string {
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  return "Other";
}

/** Parse platform/OS from user agent. */
function parsePlatform(ua: string): string {
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Other";
}

/** Get city/country from IP using free geolocation API. */
async function getLocation(): Promise<{ city: string; country: string; ip: string } | null> {
  try {
    const res = await fetch("https://ip-api.com/json/?fields=city,country,query", { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { city: data.city || "", country: data.country || "", ip: data.query || "" };
  } catch {
    return null;
  }
}

/** Record a demo visit. Called once per demo session. */
export async function trackDemoVisit(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured || !supabase) {
    // Local mode: store in localStorage for basic counting
    try {
      const key = "repairox-demo-visit-count";
      const count = parseInt(localStorage.getItem(key) || "0", 10);
      localStorage.setItem(key, String(count + 1));
    } catch { /* ignore */ }
    return;
  }

  const deviceId = generateDeviceId();
  const userAgent = navigator.userAgent.slice(0, 500);
  const screenSize = `${screen.width}x${screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const language = navigator.language || "";
  const browser = parseBrowser(userAgent);
  const platform = parsePlatform(userAgent);

  // Get location (non-blocking — if it fails, we still record the visit)
  const location = await getLocation();

  try {
    await supabase.from("demo_visits").upsert(
      {
        device_id: deviceId,
        user_agent: userAgent,
        screen_size: screenSize,
        timezone,
        language,
        browser,
        platform,
        city: location?.city || null,
        country: location?.country || null,
        ip_address: location?.ip || null,
        last_visit: new Date().toISOString(),
        visit_count: 1,
      },
      { onConflict: "device_id" }
    );

    // Increment visit count for returning devices
    try {
      await supabase.rpc("increment_demo_visit", { p_device_id: deviceId });
    } catch {
      // RPC might not exist — that's OK
    }
  } catch {
    // Silently fail — tracking should never break the app
  }
}

/** Get the total unique device count. */
export async function getDemoVisitCount(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) {
    if (typeof window === "undefined") return 0;
    try {
      return parseInt(localStorage.getItem("repairox-demo-visit-count") || "0", 10);
    } catch { return 0; }
  }

  try {
    const { count, error } = await supabase
      .from("demo_visits")
      .select("*", { count: "exact", head: true });

    if (error || count === null) return 0;
    return count;
  } catch {
    return 0;
  }
}
