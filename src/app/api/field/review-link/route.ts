/* POST /api/field/review-link  { tripId }
   Issues a one-trip CUSTOMER review link for a COMPLETED trip. The opaque token is returned once; only
   its SHA-256 is stored (field_review_tokens: service role only). The Ninja of that trip may issue it
   (to send to the customer) but cannot submit the review themselves: the guard on field_trip_reviews
   rejects a Ninja writing a review for their own trip. A field manager may issue it for any trip in
   their stores. Issuing a new link revokes the previous unused one. */
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { requirePermission } from "@/lib/api-auth";
export const dynamic = "force-dynamic";
const TTL_DAYS = 7;
const MANAGER_KEYS = ["manage_field_jobs", "assign_ninja", "field_view_all", "manage_field"];
export async function POST(req: Request) {
  const guard = await requirePermission(req, [...MANAGER_KEYS, "update_pickup", "update_drop"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user, permissions } = guard;
  const body = (await req.json().catch(() => ({}))) as { tripId?: string };
  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) return NextResponse.json({ ok: false, error: "Invalid trip." }, { status: 400 });
  const { data: me } = await admin.from("staff").select("id, organization_id, branch_id").eq("auth_user_id", user.id).maybeSingle();
  const { data: trip } = await admin.from("field_trips").select("id, organization_id, branch_id, ninja_id, status").eq("id", tripId).maybeSingle();
  if (!me || !trip || trip.organization_id !== me.organization_id) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });
  const all = permissions.has("full_access") || permissions.has("*");
  const isManager = all || MANAGER_KEYS.some((k) => permissions.has(k));
  if (!isManager && trip.ninja_id !== me.id) return NextResponse.json({ ok: false, error: "You can request a review only for your own trip." }, { status: 403 });
  if (isManager && !all && !permissions.has("multi_store_access") && trip.branch_id && trip.branch_id !== me.branch_id) {
    const { data: grant } = await admin.from("user_stores").select("branch_id").eq("staff_id", me.id).eq("branch_id", trip.branch_id).maybeSingle();
    if (!grant) return NextResponse.json({ ok: false, error: "That trip belongs to a store you can't access." }, { status: 403 });
  }
  if (trip.status !== "completed") return NextResponse.json({ ok: false, error: "The review link is available once the trip is completed." }, { status: 409 });
  const { data: done } = await admin.from("field_trip_reviews").select("rating").eq("trip_id", tripId).maybeSingle();
  if (done) return NextResponse.json({ ok: true, alreadyReviewed: true, rating: done.rating });
  await admin.from("field_review_tokens").update({ revoked_at: new Date().toISOString() }).eq("trip_id", tripId).is("used_at", null).is("revoked_at", null);
  const token = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + TTL_DAYS * 864e5).toISOString();
  const { error } = await admin.from("field_review_tokens").insert({ organization_id: trip.organization_id, trip_id: tripId, token_hash: hash, expires_at: expires, created_by: me.id });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  return NextResponse.json({ ok: true, url: `${origin}/review/${token}`, expiresAt: expires });
}
