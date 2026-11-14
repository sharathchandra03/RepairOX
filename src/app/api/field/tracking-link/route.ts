/* POST /api/field/tracking-link  { jobId }
   Issues a customer tracking link for a Field Service Job. The opaque token is
   returned ONCE; only its SHA-256 is stored (field_tracking_tokens has RLS on
   with no policies => service role only). Allowed for: field managers / sales /
   anyone who can view field jobs in that store, or the Ninja assigned to an open
   trip on the job. Org + store scope is checked server-side. */
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
const TTL_DAYS = 14;
const MANAGER_KEYS = ["manage_field_jobs", "assign_ninja", "route_leads", "manage_sales", "field_view_all", "view_field_jobs", "receive_store_handoff", "manage_field"];

export async function POST(req: Request) {
  const guard = await requirePermission(req, [...MANAGER_KEYS, "update_pickup", "update_drop"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user, permissions } = guard;
  const body = (await req.json().catch(() => ({}))) as { jobId?: string };
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ ok: false, error: "Invalid job." }, { status: 400 });

  const { data: me } = await admin.from("staff").select("id, organization_id, branch_id").eq("auth_user_id", user.id).maybeSingle();
  const { data: job } = await admin.from("field_jobs").select("id, organization_id, branch_id, deleted_at").eq("id", jobId).maybeSingle();
  if (!me || !job || job.deleted_at || job.organization_id !== me.organization_id)
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });

  const all = permissions.has("full_access") || permissions.has("*");
  const isManager = all || MANAGER_KEYS.some((k) => k !== "view_field_jobs" && permissions.has(k));
  if (!isManager) {
    // Ninja path: must be assigned to an open trip on this job.
    const { data: mine } = await admin.from("field_trips").select("id").eq("job_id", jobId).eq("ninja_id", me.id)
      .not("status", "in", "(completed,cancelled)").limit(1);
    if (!mine?.length) return NextResponse.json({ ok: false, error: "You can share tracking only for your own active job." }, { status: 403 });
  } else if (!all && !permissions.has("multi_store_access") && job.branch_id && job.branch_id !== me.branch_id) {
    const { data: grant } = await admin.from("user_stores").select("branch_id").eq("staff_id", me.id).eq("branch_id", job.branch_id).maybeSingle();
    if (!grant) return NextResponse.json({ ok: false, error: "That job belongs to a store you can't access." }, { status: 403 });
  }

  const token = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + TTL_DAYS * 864e5).toISOString();
  const { error } = await admin.from("field_tracking_tokens").insert({
    organization_id: job.organization_id, job_id: job.id, token_hash: hash, expires_at: expires, created_by: me.id,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  return NextResponse.json({ ok: true, url: `${origin}/track/${token}`, expiresAt: expires });
}
