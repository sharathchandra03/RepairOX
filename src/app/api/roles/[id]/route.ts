import { NextResponse } from "next/server";
import { requirePermission, keysBeyondAuthority } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/* PATCH /api/roles/[id] — replace a role's permission grants (or workspaces).
   Gated on `manage_roles` and protected against privilege escalation: the
   editor can only grant keys within their own delegation authority. Every
   permission change is recorded in the audit log (who / role / old / new). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, "manage_roles");
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user, roleId: callerRoleId, permissions: callerPerms } = guard;

  const body = await req.json();
  const { permissions, workspaces } = body ?? {};

  // Workspaces-only update (no permission grant change).
  if (permissions === undefined && Array.isArray(workspaces)) {
    const { error } = await admin.from("roles").update({ workspaces }).eq("id", params.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const keys: string[] = permissions === "all" ? ["*"] : Array.isArray(permissions) ? permissions : [];

  // ── No privilege escalation: reject any key the editor can't delegate. We
  //    only validate keys being ADDED beyond the caller's authority; removing
  //    permissions is always allowed. ──
  const beyond = keysBeyondAuthority(keys, callerRoleId, callerPerms);
  if (beyond.length > 0) {
    return NextResponse.json(
      { ok: false, reason: "escalation", error: `You can't grant permissions you don't have: ${beyond.join(", ")}.`, keys: beyond },
      { status: 403 }
    );
  }

  // Snapshot the previous grants for the audit trail.
  const { data: beforeRows } = await admin
    .from("role_permissions")
    .select("permission_key")
    .eq("role_id", params.id);
  const before = (beforeRows ?? []).map((r) => r.permission_key as string).sort();

  await admin.from("role_permissions").delete().eq("role_id", params.id);
  if (keys.length > 0) {
    const { error } = await admin
      .from("role_permissions")
      .insert(keys.map((k) => ({ role_id: params.id, permission_key: k })));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // ── Audit log: record the change so administrators can see who altered a
  //    role's permissions and how. Best-effort — never fail the save on it. ──
  await writePermissionAudit(admin, {
    authUserId: user.id,
    roleId: params.id,
    before,
    after: [...keys].sort(),
  });

  return NextResponse.json({ ok: true });
}

/* DELETE /api/roles/[id]?reassignTo=roleId — delete a role, moving any staff
   currently on it to `reassignTo` first. Gated on `manage_roles`. Platform
   Owner is protected. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, "manage_roles");
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

/* ── Audit helper ─────────────────────────────────────────────────────────
   Writes a row to the existing audit_log table describing the permission
   change. Resolves the acting staff member + org for scoping. Any failure is
   swallowed so an audit hiccup never blocks a legitimate save. */
async function writePermissionAudit(
  admin: import("@supabase/supabase-js").SupabaseClient,
  args: { authUserId: string; roleId: string; before: string[]; after: string[] }
) {
  try {
    const { data: actor } = await admin
      .from("staff")
      .select("id, name, organization_id")
      .eq("auth_user_id", args.authUserId)
      .maybeSingle();

    const added = args.after.filter((k) => !args.before.includes(k));
    const removed = args.before.filter((k) => !args.after.includes(k));
    if (added.length === 0 && removed.length === 0) return;

    await admin.from("audit_log").insert({
      organization_id: actor?.organization_id ?? null,
      module: "roles_permissions",
      entity_type: "role",
      record_id: args.roleId,
      action_type: "update",
      action: "permissions_changed",
      severity: "info",
      description: `Permissions updated for role "${args.roleId}" by ${actor?.name ?? "an administrator"}.`,
      previous_value: { permissions: args.before },
      new_value: { permissions: args.after },
      changes: { added, removed },
    });
  } catch {
    /* audit is best-effort */
  }
}
