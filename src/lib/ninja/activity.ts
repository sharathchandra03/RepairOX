/* Ninja activity footprint.
   Everything a Ninja does in the app is appended to `ninja_activity_log` (migration 0106) so any
   report can be built later. State changes (accept / reject / status moves / handovers) are ALSO
   recorded server-side by the trip tables; this log adds the behaviour around them: what was seen,
   how fast, what was tapped, searched or filtered, and which documents were raised.

   Design: fire-and-forget. A failed write never blocks the UI. Entries queue in memory + localStorage,
   flush in batches, and survive offline. Server stamps staff / org / branch / received_at; the device
   clock is kept as occurred_at. If the table does not exist yet (migration not applied) logging
   switches itself off for the session instead of retrying forever. */
import { supabase } from "@/lib/supabase";
import { uid } from "./outbox";

export type ActivityKind =
  | "app_open" | "app_foreground" | "app_background"
  | "screen_view"
  | "jobs_tab_changed" | "jobs_filter_changed" | "jobs_search"
  | "assignment_seen" | "assignment_accepted" | "assignment_rejected"
  | "trip_status_change" | "trip_opened"
  | "call_customer" | "whatsapp_customer" | "navigate_tapped" | "tracking_link_shared"
  | "problem_reported" | "note_added" | "review_captured" | "odometer_start" | "odometer_end" | "leave_requested" | "review_link_sent"
  | "stock_search" | "stock_item_viewed"
  | "doc_ticket_created" | "doc_invoice_created" | "doc_failed"
  | "insights_viewed" | "notice_opened" | "sync_flushed";

export interface ActivityInput {
  kind: ActivityKind;
  screen?: string;
  tripId?: string | null;
  jobId?: string | null;
  payload?: Record<string, unknown>;
}
interface Entry extends ActivityInput { key: string; at: string; online: boolean; location: { lat: number; lng: number; acc?: number } | null; branchId?: string | null; orgId?: string | null }

const QKEY = "repairox-ninja-activity-v1";
const MAX_QUEUE = 600;
const BATCH = 40;

let cfg: { staffId: string; orgId: string | null; branchId: string | null; getLocation: () => { lat: number; lng: number; acc?: number } | null } | null = null;
let queue: Entry[] = [];
let loaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let disabled = false;
let flushing = false;
let deviceInfo: Record<string, unknown> | null = null;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { queue = JSON.parse(localStorage.getItem(QKEY) || "[]") as Entry[]; } catch { queue = []; }
}
function save() {
  try { localStorage.setItem(QKEY, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch { /* storage full: keep in memory */ }
}
function device(): Record<string, unknown> {
  if (deviceInfo) return deviceInfo;
  const w = window as unknown as { Capacitor?: unknown };
  deviceInfo = {
    ua: navigator.userAgent.slice(0, 140), w: window.innerWidth, h: window.innerHeight,
    standalone: typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches,
    native: !!w.Capacitor, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return deviceInfo;
}

export function configureActivity(c: NonNullable<typeof cfg>) { cfg = c; load(); schedule(2000); }

export function track(input: ActivityInput): void {
  if (typeof window === "undefined" || disabled) return;
  load();
  queue.push({
    ...input, key: uid(), at: new Date().toISOString(), online: navigator.onLine,
    location: cfg?.getLocation() ?? null, branchId: cfg?.branchId ?? null, orgId: cfg?.orgId ?? null,
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  save();
  schedule(queue.length >= BATCH ? 300 : 6000);
}

function schedule(ms: number) {
  if (timer || disabled) return;
  timer = setTimeout(() => { timer = null; void flushActivity(); }, ms);
}

const toRow = (e: Entry, staffId: string) => ({
  organization_id: e.orgId ?? undefined, branch_id: e.branchId ?? null, staff_id: staffId,
  trip_id: e.tripId ?? null, job_id: e.jobId ?? null, kind: e.kind, screen: e.screen ?? null,
  payload: e.payload ?? {}, location: e.location, online: e.online, device: device(),
  occurred_at: e.at, idempotency_key: e.key,
});

export async function flushActivity(): Promise<void> {
  if (flushing || disabled || !cfg || !supabase || typeof navigator === "undefined" || !navigator.onLine) return;
  load();
  if (!queue.length) return;
  flushing = true;
  try {
    while (queue.length) {
      const batch = queue.slice(0, BATCH);
      const { error } = await supabase.from("ninja_activity_log").insert(batch.map((e) => toRow(e, cfg!.staffId)));
      if (!error) { queue = queue.slice(batch.length); save(); continue; }
      const code = (error as { code?: string }).code ?? "";
      if (code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(error.message)) { disabled = true; queue = []; save(); return; }  // migration not applied yet
      if (code === "23505") {            // a retried batch partly landed: insert singly, skipping duplicates
        for (const e of batch) { await supabase.from("ninja_activity_log").insert(toRow(e, cfg.staffId)); }
        queue = queue.slice(batch.length); save(); continue;
      }
      if (/fetch|network|Failed to fetch|timeout/i.test(error.message)) return;   // offline: keep the queue
      queue = queue.slice(batch.length); save();   // poison entries must not block the rest
    }
  } finally { flushing = false; }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { void flushActivity(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flushActivity(); });
}
