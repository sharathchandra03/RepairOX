import { NextResponse } from "next/server";
import { requirePermission, keysBeyondAuthority, callerCanDelegateAll } from "@/lib/api-auth";
import { rowToStaff } from "@/lib/staff-map";
import { normalizeEmail } from "@/lib/auth";
import { resolveBranchId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const BANNED = "876000h"; // ~100 years
const UNBANNED = "none";

/* Org-wide administration roles that may only be assigned by a true org admin
   (mirrors the guard in /api/staff POST). */
const ORG_ADMIN_ROLES = new Set(["master_shop_owner", "platform_owner", "developer_admin"]);
const CAN_GRANT_ORG_ADMIN = new Set(["master_shop_owner", "platform_owner", "developer_admin"]);

/* PATCH /api/staff/[id] — update profile / role / branch / salary / status /
   login access. Gated on user-management capability (NOT a hardcoded admin
   role). Role changes and store moves are guarded against privilege escalation
   the same way staff creation is. Keeps the auth account (ban state, password)
   in sync with the staff row. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, ["edit_users", "manage_users", "manage_roles", "assign_roles", "add_user"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, roleId: callerRoleId, permissions: callerPerms } = guard;

  const { data: row, error: findErr } = await admin
    .from("staff").select("*").eq("id", params.id).maybeSingle();
  if (findErr || !row) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = await req.json();

  // ── Privilege-escalation guard on ROLE CHANGE. Only a true org admin may
  //    move someone onto an org-admin role, and a caller without full authority
  //    may only assign a role whose permissions are within their delegation. ──
  if (body.roleId !== undefined && body.roleId !== row.role_id) {
    const nextRoleId = String(body.roleId);
    if (ORG_ADMIN_ROLES.has(nextRoleId) && !CAN_GRANT_ORG_ADMIN.has(callerRoleId)) {
      return NextResponse.json({ ok: false, reason: "forbidden_role" }, { status: 403 });
    }
    if (!callerCanDelegateAll(callerRoleId, callerPerms)) {
      const { data: roleGrantRows } = await admin
        .from("role_permissions").select("permission_key").eq("role_id", nextRoleId);
      const roleKeys = (roleGrantRows ?? []).map((r) => r.permission_key as string);
      const beyond = keysBeyondAuthority(roleKeys, callerRoleId, callerPerms);
      if (beyond.length > 0) {
        return NextResponse.json({ ok: false, reason: "forbidden_role", error: "You can't assign a role with permissions beyond your own authority." }, { status: 403 });
      }
    }
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.phone !== undefined) update.phone = body.phone || null;
  if (body.email !== undefined) update.email = body.email ? normalizeEmail(body.email) : null;
  if (body.roleId !== undefined) update.role_id = body.roleId;
  if (body.branch !== undefined) {
    update.branch = body.branch;
    // Keep the branch_id foreign key in sync with the branch label.
    update.branch_id = await resolveBranchId(admin, row.organization_id ?? null, body.branch);
  }
  if (body.salaryType !== undefined) update.salary_type = body.salaryType;
  if (body.salaryAmount !== undefined) update.salary_amount = Number(body.salaryAmount);
  if (body.department !== undefined) update.department = body.department;
  if (body.designation !== undefined) update.designation = body.designation;
  if (body.status !== undefined) update.status = body.status;
  if (body.loginEnabled !== undefined) update.login_enabled = Boolean(body.loginEnabled);
  // Force-password-change flag (temporary password). An explicit boolean lets
  // an admin set OR clear it independently of a password write.
  if (body.passwordResetRequired !== undefined) {
    update.password_reset_required = Boolean(body.passwordResetRequired);
  }

  const finalStatus = (update.status ?? row.status) as string;
  const finalLoginEnabled = (update.login_enabled ?? row.login_enabled) as boolean;
  let authUserId: string | null = row.auth_user_id;
  const email = (update.email ?? row.email) as string | null;
  // Track whether the login password was (re)written on this request so we can
  // stamp the credential-lifecycle metadata. We NEVER store the password
  // itself — only WHEN it changed. Passwords stay hashed in Supabase Auth.
  let passwordWritten = false;

  // Enabling login for a staff member who has no auth account yet needs a password.
  if (finalLoginEnabled && !authUserId) {
    if (!body.password) return NextResponse.json({ ok: false, reason: "missing_password" }, { status: 400 });
    if (!email) return NextResponse.json({ ok: false, reason: "missing_email" }, { status: 400 });
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email, password: body.password, email_confirm: true,
    });
    if (authErr || !created.user) {
      return NextResponse.json({ ok: false, error: authErr?.message ?? "Could not create login." }, { status: 400 });
    }
    authUserId = created.user.id;
    update.auth_user_id = authUserId;
    passwordWritten = true;
  } else if (body.password && authUserId) {
    // Password reset / change.
    await admin.auth.admin.updateUserById(authUserId, { password: body.password });
    update.login_enabled = true;
    passwordWritten = true;
  }

  // Stamp credential-lifecycle metadata when the password was written. If the
  // caller flagged this as a TEMPORARY password, force a change at next login;
  // otherwise a normal reset clears any prior force-change requirement.
  if (passwordWritten) {
    update.last_password_changed_at = new Date().toISOString();
    if (body.temporary === true || body.passwordResetRequired === true) {
      update.password_reset_required = true;
    } else if (body.passwordResetRequired === undefined) {
      update.password_reset_required = false;
    }
  }

  // Stamp/clear disabled_at when login is toggled or the account is suspended.
  if (body.loginEnabled !== undefined || body.status !== undefined) {
    const nowDisabled = finalStatus === "suspended" || finalLoginEnabled === false;
    update.disabled_at = nowDisabled ? (row.disabled_at ?? new Date().toISOString()) : null;
  }

  const { data: updated, error: updErr } = await admin
    .from("staff").update(update).eq("id", params.id).select("*").single();
  if (updErr || !updated) {
    return NextResponse.json({ ok: false, error: updErr?.message ?? "Update failed." }, { status: 400 });
  }

  // Keep auth access in sync: suspended OR login disabled => cannot sign in.
  if (authUserId) {
    const banned = finalStatus === "suspended" || finalLoginEnabled === false;
    await admin.auth.admin.updateUserById(authUserId, { ban_duration: banned ? BANNED : UNBANNED }).catch(() => {});
  }

  return NextResponse.json({ ok: true, member: rowToStaff(updated) });
}

/* GET /api/staff/[id] — full account detail for the User Details view.
   Returns the staff profile, the role, EVERY store the user is assigned to
   (their home branch + active user_stores grants, resolved to store names),
   and the credential STATUS (password set? last changed? must reset?). It
   NEVER returns a password — no plaintext credential exists to return.
   Gated on user-view / user-management authority. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, [
    "view_users", "manage_users", "edit_users", "add_user",
    "stores_users_view", "manage_roles",
  ]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const { data: row, error } = await admin
    .from("staff").select("*").eq("id", params.id).maybeSingle();
  if (error || !row) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const member = rowToStaff(row);

  // Assigned stores: the user's home branch + any active user_stores grants,
  // resolved to { id, name, code, isDefault, roleId, accessOrigin }. Tolerates
  // the user_stores table being absent (multi-store migration optional).
  const storeIds = new Set<string>();
  if (row.branch_id) storeIds.add(row.branch_id as string);
  let grants: any[] = [];
  try {
    const { data: g } = await admin
      .from("user_stores")
      .select("branch_id, is_default, status, role_id, created_by")
      .eq("staff_id", params.id)
      .eq("status", "active");
    grants = g ?? [];
    for (const gr of grants) if (gr.branch_id) storeIds.add(gr.branch_id as string);
  } catch { /* user_stores not present */ }

  const stores: {
    id: string; name: string; code: string | null; isDefault: boolean;
    roleId: string | null; isHome: boolean;
  }[] = [];
  if (storeIds.size > 0) {
    const { data: branches } = await admin
      .from("branches")
      .select("id, name, code")
      .in("id", Array.from(storeIds));
    const byId = new Map((branches ?? []).map((b) => [b.id as string, b]));
    for (const id of storeIds) {
      const b = byId.get(id);
      if (!b) continue;
      const grant = grants.find((gr) => gr.branch_id === id);
      stores.push({
        id,
        name: (b.name as string) ?? "",
        code: (b.code as string) ?? null,
        isDefault: Boolean(grant?.is_default) || id === row.branch_id,
        roleId: (grant?.role_id as string) ?? null,
        isHome: id === row.branch_id,
      });
    }
  }

  // Credential STATUS — never the password. Whether an auth login exists,
  // whether it's set, when it last changed, and whether a reset is required.
  const credential = {
    hasLogin: Boolean(row.auth_user_id) && Boolean(row.login_enabled),
    passwordSet: Boolean(row.auth_user_id),
    lastPasswordChangedAt: row.last_password_changed_at ?? null,
    passwordResetRequired: Boolean(row.password_reset_required),
    disabledAt: row.disabled_at ?? null,
  };

  return NextResponse.json({
    ok: true,
    member,
    stores,
    credential,
    // Convenience flag: is this the caller's own account?
    isSelf: row.auth_user_id === user.id,
  });
}

/* DELETE /api/staff/[id] — remove the staff record and its login. Gated on the
   user-deletion capability (delete_users / manage_users). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, ["delete_users", "manage_users"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin } = guard;

  const { data: row } = await admin.from("staff").select("auth_user_id").eq("id", params.id).maybeSingle();

  const { error: delErr } = await admin.from("staff").delete().eq("id", params.id);
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });

  if (row?.auth_user_id) {
    await admin.auth.admin.deleteUser(row.auth_user_id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
