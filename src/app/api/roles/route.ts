import { NextResponse } from "next/server";
import { requirePermission, keysBeyondAuthority } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/* POST /api/roles — create a custom role + its starting permission grants.
   Gated on `manage_roles` (NOT a hardcoded admin-role check) so permission
   administration is itself permission-controlled. New roles are created with
   is_custom = true and default to NO administrative capabilities unless the
   creator explicitly grants (and is authorized to delegate) them. */
export async function POST(req: Request) {
  const guard = await requirePermission(req, "manage_roles");
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, roleId: callerRoleId, permissions: callerPerms } = guard;

  const { id, label, summary, workspaces, permissions } = await req.json();
  if (!id || !label) return NextResponse.json({ ok: false, error: "Missing role id/label." }, { status: 400 });

  const keys: string[] = permissions === "all" ? ["*"] : Array.isArray(permissions) ? permissions : [];

  // ── No privilege escalation: the creator may only seed the new role with
  //    permissions they themselves hold the authority to delegate. ──
  const beyond = keysBeyondAuthority(keys, callerRoleId, callerPerms);
  if (beyond.length > 0) {
    return NextResponse.json(
      { ok: false, reason: "escalation", error: `You can't grant permissions you don't have: ${beyond.join(", ")}.`, keys: beyond },
      { status: 403 }
    );
  }

  const { error: roleErr } = await admin.from("roles").insert({
    id, label, summary: summary ?? null, workspaces: workspaces ?? [], is_custom: true,
  });
  if (roleErr) return NextResponse.json({ ok: false, error: roleErr.message }, { status: 400 });

  if (keys.length > 0) {
    const { error: pErr } = await admin
      .from("role_permissions")
      .insert(keys.map((k) => ({ role_id: id, permission_key: k })));
    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
