/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Demo Visit Tracking

   Tracks unique device visits to demo accounts. Generates a simple device
   fingerprint (not for security, just for counting unique visitors) and
   stores it in the demo_visits table via Supabase.
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
  // Simple hash
  let hash = 0;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return "dev_" + Math.abs(hash).toString(36);
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

  try {
    // Try to upsert — increment visit_count if device already exists
    const { error } = await supabase
      .from("demo_visits")
      .upsert(
        {
          device_id: deviceId,
          user_agent: userAgent,
          screen_size: screenSize,
          last_visit: new Date().toISOString(),
          visit_count: 1,
        },
        { onConflict: "device_id" }
      );

    if (error) {
      // If upsert failed (maybe table doesn't exist yet), just ignore
    } else {
      // Try to increment visit count for returning devices
      try {
        await supabase.rpc("increment_demo_visit", { p_device_id: deviceId });
      } catch {
        // RPC might not exist — that's OK, the upsert already recorded the visit
      }
    }
  } catch {
    // Silently fail — tracking should never break the app
  }
}

/** Get the total unique device count. */
export async function getDemoVisitCount(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) {
    // Local mode fallback
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
