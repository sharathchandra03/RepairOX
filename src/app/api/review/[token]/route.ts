/* PUBLIC customer review of a Ninja — no login.
   GET  /api/review/:token  → whitelisted view (Ninja FIRST NAME, service type, store, device). No phone, no ids.
   POST /api/review/:token  { rating 1-5, comment? } → saves ONE review for the trip (channel customer_link)
   via the service role, then marks the token used. Rate limited per IP; tokens are hashed, expiring and
   single use. */
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
  return w.n > 20;
}
const LABEL: Record<string, string> = { pickup: "pickup", drop: "delivery", onsite: "on-site service", warranty_pickup: "warranty pickup" };
async function resolve(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { err: "Invalid link.", status: 404 as const };
  let admin; try { admin = createAdminClient(); } catch { return { err: "Reviews are unavailable right now.", status: 503 as const }; }
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: tok } = await admin.from("field_review_tokens").select("id, trip_id, expires_at, used_at, revoked_at").eq("token_hash", hash).maybeSingle();
  if (!tok || tok.revoked_at || new Date(tok.expires_at).getTime() < Date.now()) return { err: "This review link has expired or is no longer valid.", status: 404 as const };
  return { admin, tok };
}
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many requests. Try again in a minute." }, { status: 429 });
  const r = await resolve(params.token ?? "");
  if ("err" in r) return NextResponse.json({ ok: false, error: r.err }, { status: r.status });
  const { admin, tok } = r;
  const { data: trip } = await admin.from("field_trips").select("id, trip_type, ninja_id, branch_id, job:field_jobs(device, lead_type)").eq("id", tok.trip_id).maybeSingle();
  if (!trip) return NextResponse.json({ ok: false, error: "This service is no longer available." }, { status: 404 });
  const [{ data: ninja }, { data: br }, { data: done }] = await Promise.all([
    trip.ninja_id ? admin.from("staff").select("name").eq("id", trip.ninja_id).maybeSingle() : Promise.resolve({ data: null }),
    trip.branch_id ? admin.from("branch_settings").select("display_name").eq("branch_id", trip.branch_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("field_trip_reviews").select("rating").eq("trip_id", trip.id).maybeSingle(),
  ]);
  const job = (Array.isArray(trip.job) ? trip.job[0] : trip.job) as { device?: string; lead_type?: string } | null;
  const first = String(ninja?.name ?? "").replace(/^\[TEST\]\s*/, "").split(" ")[0] || "our engineer";
  const service = job?.lead_type === "buyback" ? "buyback" : LABEL[trip.trip_type] ?? "service";
  return NextResponse.json({ ok: true, done: !!done || !!tok.used_at, rating: done?.rating ?? null, ninja: first, service, device: job?.device ?? null, store: br?.display_name ?? null });
}
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many requests. Try again in a minute." }, { status: 429 });
  const r = await resolve(params.token ?? "");
  if ("err" in r) return NextResponse.json({ ok: false, error: r.err }, { status: r.status });
  const { admin, tok } = r;
  if (tok.used_at) return NextResponse.json({ ok: false, error: "Thank you — this review was already submitted." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { rating?: unknown; comment?: unknown };
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ ok: false, error: "Please choose 1 to 5 stars." }, { status: 400 });
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 500) : null;
  const { error } = await admin.from("field_trip_reviews").insert({ trip_id: tok.trip_id, rating, comment, channel: "customer_link" });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: false, error: "Thank you — this trip was already reviewed." }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Could not save your review. Please try again." }, { status: 400 });
  }
  await admin.from("field_review_tokens").update({ used_at: new Date().toISOString() }).eq("id", tok.id);
  return NextResponse.json({ ok: true });
}
