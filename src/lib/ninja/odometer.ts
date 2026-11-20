"use client";
/* Ninja odometer log for the current day (ninja_day_logs, migration 0113).
   The DB stamps the day (org timezone), the time and the Ninja; start is locked once saved and the
   end reading can be saved once. Travelled km = end - start. Feeds attendance, KM and fuel reports. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { localDateKey } from "@/lib/work-session";
import { fetchLastEndReading, fetchPolicy, LOG_COLS, rowToLog } from "@/lib/field-attendance-data";
import { DEFAULT_POLICY, type DayLog, type Policy } from "@/lib/field-attendance";
import { track } from "@/lib/ninja/activity";

const FRIENDLY: Record<string, string> = {
  odometer_too_far: "That is more than 1000 km in a day. Please re-check the reading.",
  odometer_end_locked: "Today's end reading is already saved.",
  odometer_photo_required: "Take a photo of the odometer to go with the reading.",
  odometer_photo_path: "The photo could not be attached. Please retake it.",
  odometer_start_locked: "The start reading is already saved and can't be changed. Ask your manager to correct it.",
};
const friendly = (m: string) => Object.entries(FRIENDLY).find(([k]) => m.includes(k))?.[1] ?? "Could not save the reading. Please try again.";

export function useDayLog() {
  const { currentUser } = usePermissions();
  const { settings } = useStoreSettings();
  const staffId = currentUser?.id ?? null;
  const today = localDateKey(Date.now(), settings.timeZone);
  const [log, setLog] = useState<DayLog | null>(null);
  const [lastEnd, setLastEnd] = useState<number | null>(null);
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [ready, setReady] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase || !staffId) return;
    void supabase.from("staff").select("organization_id").eq("id", staffId).maybeSingle().then(({ data }) => setOrgId((data as { organization_id: string } | null)?.organization_id ?? null));
  }, [staffId]);

  /** Uploads the meter photo to the private bucket; returns its path (or an error). Retrying the same day reuses the path. */
  async function upload(day: string, kind: "start" | "end", photo: Blob): Promise<{ path?: string; error?: string }> {
    if (!supabase || !staffId || !orgId) return { error: "You are offline." };
    const path = `${orgId}/${staffId}/${day}-${kind}.jpg`;
    const { error } = await supabase.storage.from("ninja-odometer").upload(path, photo, { contentType: "image/jpeg", upsert: false });
    if (error && !/exists|duplicate/i.test(error.message)) return { error: "Could not upload the photo. Check your connection and try again." };
    return { path };
  }

  const load = useCallback(async () => {
    if (!supabase || !staffId) { setReady(true); return; }
    const { data } = await supabase.from("ninja_day_logs").select(LOG_COLS)
      .eq("staff_id", staffId).order("day", { ascending: false }).limit(1);
    const latest = data?.[0] ? rowToLog(data[0]) : null;
    setLog(latest);
    setLastEnd(await fetchLastEndReading(staffId, latest && latest.endReading == null ? latest.day : today));
    setPolicy(await fetchPolicy());
    setReady(true);
  }, [staffId, today]);
  useEffect(() => { void load(); }, [load]);

  /** The day the Ninja is currently logging: today's log, or an earlier one still waiting for its end reading. */
  const needsEnd = !!log && log.endReading == null;
  const hasToday = !!log && log.day === today;

  async function saveStart(reading: number, photo: Blob | null): Promise<string | null> {
    if (!supabase || !staffId) return "You are offline.";
    let start_photo: string | null = null;
    if (photo) { const u = await upload(today, "start", photo); if (u.error) return u.error; start_photo = u.path ?? null; }
    const { error } = await supabase.from("ninja_day_logs").insert({ staff_id: staffId, day: today, start_reading: reading, start_photo });
    if (error) {
      if (error.code === "23505") { await load(); return null; }
      return friendly(error.message);
    }
    track({ kind: "odometer_start", screen: "shift", payload: { reading, photo: !!photo } });
    await load(); return null;
  }
  async function saveEnd(reading: number, photo: Blob | null): Promise<string | null> {
    if (!supabase || !staffId || !log) return "You are offline.";
    let end_photo: string | null = null;
    if (photo) { const u = await upload(log.day, "end", photo); if (u.error) return u.error; end_photo = u.path ?? null; }
    const { error } = await supabase.from("ninja_day_logs").update({ end_reading: reading, end_photo }).eq("staff_id", staffId).eq("day", log.day);
    if (error) return friendly(error.message);
    track({ kind: "odometer_end", screen: "shift", payload: { reading, km: reading - log.startReading } });
    await load(); return null;
  }
  return { ready, log, lastEnd, policy, needsEnd, hasToday, today, saveStart, saveEnd, reload: load };
}
