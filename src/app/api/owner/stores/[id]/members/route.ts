import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { orgIdForAuthUser } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* POST /api/owner/stores/[id]/members — grant an existing user access to this
   store (adds an active user_stores row). Body: { staffId, roleId? }.
   Gated on store-user-assignment authority; org-scoped. Does NOT change the
   user's home branch — this is an additional store grant. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, ["stores_users_assign", "manage_branches", "manage_users"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  // Verify the store is in the caller's org.
  const { data: store } = await admin
    .from("branches").select("id, organization_id").eq("id", params.id).maybeSingle();
  if (!store || store.organization_id !== orgId) {
    return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const staffId = String(body?.staffId ?? "");
  if (!staffId) return NextResponse.json({ ok: false, error: "staffId required." }, { status: 400 });

  // The staff member must belong to the same org.
  const { data: staff } = await admin
    .from("staff").select("id, organization_id").eq("id", staffId).maybeSingle();
  if (!staff || staff.organization_id !== orgId) {
    return NextResponse.json({ ok: false, error: "That user isn't in your organization." }, { status: 400 });
  }

  // Resolve who is granting (created_by) for the access-origin label.
  const { data: me } = await admin.from("staff").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { error } = await admin.from("user_stores").upsert(
    {
      organization_id: orgId,
      staff_id: staffId,
      branch_id: params.id,
      role_id: body?.roleId ?? null,
      is_default: false,
      status: "active",
      created_by: me?.id ?? null,
    },
    { onConflict: "staff_id,branch_id" }
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/owner/stores/[id]/members?staffId=... — REMOVE a user's access
   to this store. This removes the STORE MEMBERSHIP only — it never deletes the
   user or their historical activity. If the store is the user's HOME branch we
   refuse (they must be reassigned first, not orphaned). Gated on store-user
   removal authority. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, ["stores_users_remove", "manage_branches", "manage_users"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  const staffId = new URL(req.url).searchParams.get("staffId") ?? "";
  if (!staffId) return NextResponse.json({ ok: false, error: "staffId required." }, { status: 400 });

  const { data: staff } = await admin
    .from("staff").select("id, organization_id, branch_id").eq("id", staffId).maybeSingle();
  if (!staff || staff.organization_id !== orgId) {
    return NextResponse.json({ ok: false, error: "That user isn't in your organization." }, { status: 400 });
  }
  if (staff.branch_id === params.id) {
    return NextResponse.json(
      { ok: false, reason: "home_store", error: "This is the user's home store. Reassign them to another store before removing access." },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from("user_stores").delete().eq("staff_id", staffId).eq("branch_id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
