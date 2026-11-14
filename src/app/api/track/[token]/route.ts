/* GET /api/track/:token — PUBLIC customer tracking. No login.
   Returns a whitelisted, customer-safe view of ONE field service job. Never
   returns internal ids, notes, staff phone numbers, prices or other customers.
   Live location only while a trip is actually travelling, the session is open,
   customer-visible and fresh (<10 min). Rate limited per IP. */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now(), w = hits.get(ip);
  if (!w || now - w.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  w.n += 1;
  if (hits.size > 5000) hits.clear();
  return w.n > 40;
}

const MOVING = ["en_route_customer", "en_route_store", "device_received_by_ninja"];
type Step = { key: string; label: string; at: string | null; done: boolean; current?: boolean };

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many requests. Try again in a minute." }, { status: 429 });
  const token = params.token ?? "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NextResponse.json({ ok: false, error: "Invalid link." }, { status: 404 });

  let admin;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ ok: false, error: "Tracking unavailable." }, { status: 503 }); }
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: tok } = await admin.from("field_tracking_tokens").select("job_id, expires_at, revoked_at").eq("token_hash", hash).maybeSingle();
  if (!tok || tok.revoked_at || new Date(tok.expires_at).getTime() < Date.now())
    return NextResponse.json({ ok: false, error: "This tracking link has expired or is no longer valid." }, { status: 404 });

  const { data: job } = await admin.from("field_jobs")
    .select("id, job_no, customer, device, lead_type, status, created_at, branch_id, deleted_at").eq("id", tok.job_id).maybeSingle();
  if (!job || job.deleted_at) return NextResponse.json({ ok: false, error: "This service request is no longer available." }, { status: 404 });

  const [{ data: trips }, { data: br }, { data: bs }] = await Promise.all([
    admin.from("field_trips").select("id, trip_type, status, ninja_id, scheduled_at, scheduled_window, created_at").eq("job_id", job.id).order("created_at"),
    job.branch_id ? admin.from("branches").select("name").eq("id", job.branch_id).maybeSingle() : Promise.resolve({ data: null }),
    job.branch_id ? admin.from("branch_settings").select("display_name, phone").eq("branch_id", job.branch_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const tripIds = (trips ?? []).map((t) => t.id);
  const { data: evs } = tripIds.length
    ? await admin.from("field_trip_events").select("trip_id, new_status, occurred_at").in("trip_id", tripIds).eq("event_type", "status_changed").order("occurred_at")
    : { data: [] as { trip_id: string; new_status: string; occurred_at: string }[] };
  const firstAt = (tripId: string | undefined, statuses: string[]) =>
    (evs ?? []).find((e) => e.trip_id === tripId && statuses.includes(e.new_status))?.occurred_at ?? null;

  const pickup = (trips ?? []).find((t) => t.trip_type === "pickup" || t.trip_type === "warranty_pickup");
  const drop = [...(trips ?? [])].reverse().find((t) => t.trip_type === "drop");
  const onsite = (trips ?? []).find((t) => t.trip_type === "onsite");

  let steps: Step[];
  if (onsite) {
    steps = [
      { key: "req", label: "Visit requested", at: job.created_at, done: true },
      { key: "asg", label: "Engineer assigned", at: firstAt(onsite.id, ["assigned"]), done: false },
      { key: "way", label: "Engineer on the way", at: firstAt(onsite.id, ["en_route_customer"]), done: false },
      { key: "arr", label: "Engineer arrived", at: firstAt(onsite.id, ["arrived_customer"]), done: false },
      { key: "svc", label: "Service completed", at: firstAt(onsite.id, ["service_completed", "service_not_completed"]), done: false },
    ];
  } else {
    const repairAt = job.status === "in_repair" || job.status === "ready_for_drop" || drop ? firstAt(pickup?.id, ["store_received"]) : null;
    steps = [
      { key: "req", label: "Pickup requested", at: job.created_at, done: true },
      { key: "asg", label: "Pickup partner assigned", at: firstAt(pickup?.id, ["assigned"]), done: false },
      { key: "way", label: "Partner on the way", at: firstAt(pickup?.id, ["en_route_customer"]), done: false },
      { key: "col", label: "Device collected", at: firstAt(pickup?.id, ["device_collected"]), done: false },
      { key: "sto", label: "Received at store", at: firstAt(pickup?.id, ["store_received"]), done: false },
      { key: "rep", label: "Repair in progress", at: repairAt, done: false },
      { key: "rdy", label: "Ready for delivery", at: drop?.created_at ?? null, done: false },
      { key: "out", label: "Out for delivery", at: firstAt(drop?.id, ["en_route_customer"]), done: false },
      { key: "del", label: "Delivered", at: firstAt(drop?.id, ["delivered"]), done: false },
    ];
    if (job.lead_type === "drop") steps = steps.filter((s) => ["rdy", "out", "del"].includes(s.key));
  }
  steps.forEach((s) => { if (s.at) s.done = true; });
  // Only completed steps up to the last done one count; never show future steps as done.
  const lastDone = steps.map((s) => s.done).lastIndexOf(true);
  steps.forEach((s, i) => { s.done = i <= lastDone; s.current = i === lastDone + 1; });

  // Live location (customer-visible, moving, fresh)
  let live: { lat: number; lng: number; at: string; partner: string | null } | null = null;
  const moving = (trips ?? []).find((t) => MOVING.includes(t.status));
  if (moving && (moving.status === "en_route_customer" || moving.status === "device_received_by_ninja")) {
    const { data: ses } = await admin.from("field_tracking_sessions").select("last_lat, last_lng, last_point_at, customer_visible")
      .eq("trip_id", moving.id).is("ended_at", null).maybeSingle();
    if (ses?.customer_visible && ses.last_lat != null && ses.last_point_at && Date.now() - new Date(ses.last_point_at).getTime() < 10 * 60_000) {
      const { data: n } = moving.ninja_id ? await admin.from("staff").select("name").eq("id", moving.ninja_id).maybeSingle() : { data: null };
      live = { lat: ses.last_lat, lng: ses.last_lng, at: ses.last_point_at, partner: n?.name ? String(n.name).split(" ")[0] : null };
    }
  }
  const nextVisit = (trips ?? []).filter((t) => !["completed", "cancelled", "delivered"].includes(t.status) && t.scheduled_at).at(-1);

  return NextResponse.json({
    ok: true,
    ref: job.job_no,
    device: job.device,
    customer: job.customer ? String(job.customer).replace(/^\[TEST\]\s*/, "").split(" ")[0] : null,
    kind: onsite ? "onsite" : "pickup_drop",
    store: { name: bs?.display_name || br?.name || null, phone: bs?.phone || null },
    steps,
    cancelled: job.status === "cancelled",
    scheduled: nextVisit ? { at: nextVisit.scheduled_at, window: nextVisit.scheduled_window } : null,
    live,
    updatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
