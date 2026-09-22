import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { orgIdForAuthUser } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* PATCH /api/owner/stores/[id]
   Update a store's editable fields or ACTIVATE / DEACTIVATE it. Stores are
   never hard-deleted — historical records must stay intact — so deactivation
   flips is_active to false and the store simply disappears from the active
   selector while all its data is preserved. Owner/admin only, scoped to the
   caller's own organization. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  // Editing / (de)activating a store requires store-edit authority.
  const guard = await requirePermission(req, ["stores_edit", "stores_deactivate", "manage_branches"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  // Verify the store belongs to the caller's org before touching it.
  const { data: store } = await admin
    .from("branches")
    .select("id, organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!store || store.organization_id !== orgId) {
    return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.code === "string") patch.code = body.code.trim() || null;
  if (typeof body?.address === "string") patch.address = body.address.trim() || null;
  if (typeof body?.isActive === "boolean") patch.is_active = body.isActive;
  // Environment (DEMO | LIVE) — only accept the two valid values.
  if (typeof body?.environment === "string") {
    const env = body.environment.trim().toLowerCase();
    if (env === "demo" || env === "live") patch.environment = env;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("branches")
    .update(patch)
    .eq("id", params.id)
    .select("id, name, code, address, is_active, environment, created_at")
    .single();
  if (error || !updated) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Update failed." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, store: {
    id: updated.id, name: updated.name, code: updated.code, address: updated.address,
    isActive: updated.is_active, environment: updated.environment ?? "live", createdAt: updated.created_at,
  } });
}
