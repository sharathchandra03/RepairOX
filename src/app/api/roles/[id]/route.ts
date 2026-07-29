import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/* PATCH /api/roles/[id] — replace a role's permission grants. Admin-only. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin } = guard;

  const { permissions } = await req.json();
  const keys: string[] = permissions === "all" ? ["*"] : Array.isArray(permissions) ? permissions : [];

  await admin.from("role_permissions").delete().eq("role_id", params.id);
  if (keys.length > 0) {
    const { error } = await admin
      .from("role_permissions")
      .insert(keys.map((k) => ({ role_id: params.id, permission_key: k })));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/* DELETE /api/roles/[id]?reassignTo=roleId — delete a role, moving any staff
   currently on it to `reassignTo` first. Admin-only. Platform Owner is protected. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin } = guard;

  if (params.id === "platform_owner") {
    return NextResponse.json({ ok: false, error: "Platform Owner can't be deleted." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const reassignTo = searchParams.get("reassignTo");

  const { data: assigned } = await admin.from("staff").select("id").eq("role_id", params.id);
  if (assigned && assigned.length > 0) {
    if (!reassignTo) {
      return NextResponse.json({ ok: false, reason: "in_use", count: assigned.length }, { status: 409 });
    }
    await admin.from("staff").update({ role_id: reassignTo }).eq("role_id", params.id);
  }

  const { error } = await admin.from("roles").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
