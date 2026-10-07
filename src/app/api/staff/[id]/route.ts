import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  const { admin, user, roleId: callerRoleId, permissions: callerPerms } = guard;

  const { data: row, error: findErr } = await admin
    .from("staff").select("*").eq("id", params.id).maybeSingle();
  if (findErr || !row) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = await req.json();

  // ── Store relocation ──────────────────────────────────────────────────────
  // A `storeId` (real branches.id) RELOCATES the user's HOME store: staff.branch_id
  // becomes the new store, the old home user_stores grant is removed, and the new
  // store is upserted as the default grant. The user then operates in the NEW
  // store only. Records they still own in the old store keep their old branch_id
  // (option a) — the store-change audit explains the transition. Gated on the
  // store-user-assign capability with the SAME store-scope guard as staff creation.
  let storeMove: { fromId: string | null; fromName: string | null; toId: string; toName: string } | null = null;
  if (body.storeId !== undefined && body.storeId && body.storeId !== row.branch_id) {
    const { data: target } = await admin
      .from("branches").select("id, name, organization_id").eq("id", String(body.storeId)).maybeSingle();
    if (!target || target.organization_id !== row.organization_id) {
      return NextResponse.json({ ok: false, reason: "store_not_found", error: "That store isn't in this organization." }, { status: 400 });
    }
    // Store-scope guard: a caller WITHOUT multi-store authority may only move a
    // user INTO a store they can themselves manage. Owners / full_access /
    // multi_store_access bypass. Mirrors POST /api/staff.
    if (!callerCanDelegateAll(callerRoleId, callerPerms) && !callerPerms.has("multi_store_access")) {
      const authorized = await callerAuthorizedBranchIds(admin, user.id, row.organization_id as string);
      if (authorized.size > 0 && !authorized.has(target.id as string)) {
        return NextResponse.json(
          { ok: false, reason: "forbidden_store", error: "You can only move users to a store you're authorized to manage." },
          { status: 403 }
        );
      }
    }
    storeMove = {
      fromId: (row.branch_id as string) ?? null,
      fromName: (row.branch as string) ?? null,
      toId: target.id as string,
      toName: (target.name as string) ?? "",
    };
  }

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
  // A validated store relocation sets BOTH the FK and the display name directly
  // (takes precedence over a `branch` name if both were sent).
  if (storeMove) {
    update.branch_id = storeMove.toId;
    update.branch = storeMove.toName;
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

  // ── Sync user_stores + write the store-change audit for a relocation ──
  // Best-effort: user_stores is optional (multi-store migration) and audit is a
  // trail — neither blocks the already-committed staff move.
  if (storeMove) {
    const finalRoleId = (update.role_id ?? row.role_id) as string | null;
    try {
      // Remove the OLD home-store grant (clean relocation — the user no longer
      // operates in the old store).
      if (storeMove.fromId) {
        await admin.from("user_stores").delete().eq("staff_id", params.id).eq("branch_id", storeMove.fromId);
      }
      // Upsert the NEW store as the default grant, carrying the user's role.
      await admin.from("user_stores").upsert(
        {
          organization_id: row.organization_id,
          staff_id: params.id,
          branch_id: storeMove.toId,
          role_id: finalRoleId,
          is_default: true,
          status: "active",
          created_by: await actingStaffId(admin, user.id),
        },
        { onConflict: "staff_id,branch_id" }
      );
    } catch { /* user_stores not present — staff.branch_id already scopes the user */ }

    await writeStoreChangeAudit(admin, {
      authUserId: user.id,
      staffId: params.id,
      staffName: (updated.name as string) ?? (row.name as string) ?? "",
      organizationId: (row.organization_id as string) ?? null,
      fromName: storeMove.fromName,
      toName: storeMove.toName,
      fromId: storeMove.fromId,
      toId: storeMove.toId,
    });
  }

  // ── Additional store access: grant / revoke (multi-store) ──────────────────
  // addStoreIds / removeStoreIds manage the user's EXTRA store grants WITHOUT
  // touching their home branch (that's what `storeId` relocation does). This is
  // how an owner lets a user work leads / records across several stores. The
  // home branch can never be removed here (reassign the home store instead).
  const addIds: string[] = Array.isArray(body.addStoreIds)
    ? Array.from(new Set(body.addStoreIds.filter((x: unknown): x is string => typeof x === "string" && !!x)))
    : [];
  const removeIds: string[] = Array.isArray(body.removeStoreIds)
    ? Array.from(new Set(body.removeStoreIds.filter((x: unknown): x is string => typeof x === "string" && !!x)))
    : [];

  if (addIds.length > 0 || removeIds.length > 0) {
    const orgId = row.organization_id as string | null;
    const homeId = (update.branch_id ?? row.branch_id) as string | null;
    const finalRoleId = (update.role_id ?? row.role_id) as string | null;

    // GRANT additional stores.
    if (addIds.length > 0 && orgId) {
      // Keep only real stores in this org, excluding the home branch.
      const { data: validBranches } = await admin
        .from("branches").select("id, organization_id").in("id", addIds);
      let allowed = (validBranches ?? [])
        .filter((b) => b.organization_id === orgId && b.id !== homeId)
        .map((b) => b.id as string);

      // Store-scope guard: a caller without multi-store authority may only grant
      // stores THEY can themselves manage.
      if (!callerCanDelegateAll(callerRoleId, callerPerms) && !callerPerms.has("multi_store_access")) {
        const authorized = await callerAuthorizedBranchIds(admin, user.id, orgId);
        if (authorized.size > 0) allowed = allowed.filter((id) => authorized.has(id));
      }

      if (allowed.length > 0) {
        const createdById = await actingStaffId(admin, user.id);
        try {
          await admin.from("user_stores").upsert(
            allowed.map((bid) => ({
              organization_id: orgId,
              staff_id: params.id,
              branch_id: bid,
              role_id: finalRoleId,
              is_default: false,
              status: "active",
              created_by: createdById,
            })),
            { onConflict: "staff_id,branch_id" },
          );
        } catch { /* user_stores optional */ }
      }
    }

    // REVOKE additional stores — never the home branch (membership only, keeps
    // the user + their history intact, per the store-administration standard).
    const toRemove = removeIds.filter((id) => id !== homeId);
    if (toRemove.length > 0) {
      try {
        await admin.from("user_stores")
          .delete().eq("staff_id", params.id).in("branch_id", toRemove);
      } catch { /* user_stores optional */ }
    }
  }

  return NextResponse.json({ ok: true, member: rowToStaff(updated) });
}

/** The staff.id for the signed-in auth user (the actor), for created_by /
 *  performed_by stamping. */
async function actingStaffId(admin: SupabaseClient, authUserId: string): Promise<string | null> {
  const { data } = await admin.from("staff").select("id").eq("auth_user_id", authUserId).maybeSingle();
  return (data?.id as string) ?? null;
}

/** The set of branch ids the caller may assign users to when they lack
 *  multi-store authority: their own staff.branch_id + active user_stores grants.
 *  Mirrors auth_store_ids() / the POST /api/staff guard. Empty set → the caller
 *  skips the restriction (RLS remains the backstop) to avoid a false lockout. */
async function callerAuthorizedBranchIds(
  admin: SupabaseClient,
  authUserId: string,
  orgId: string
): Promise<Set<string>> {
  const out = new Set<string>();
  const { data: me } = await admin
    .from("staff").select("id, branch_id").eq("auth_user_id", authUserId).maybeSingle();
  if (me?.branch_id) out.add(me.branch_id as string);
  if (me?.id) {
    const { data: grants } = await admin
      .from("user_stores").select("branch_id, status").eq("staff_id", me.id).eq("status", "active");
    for (const g of grants ?? []) out.add(g.branch_id as string);
  }
  return out;
}

/** Best-effort audit of a staff store relocation. Mirrors writePermissionAudit
 *  in /api/roles/[id]: resolves the acting staff, then appends to audit_log.
 *  Any failure is swallowed so an audit hiccup never blocks a legitimate move. */
async function writeStoreChangeAudit(
  admin: SupabaseClient,
  args: {
    authUserId: string; staffId: string; staffName: string; organizationId: string | null;
    fromName: string | null; toName: string; fromId: string | null; toId: string;
  }
) {
  try {
    const { data: actor } = await admin
      .from("staff").select("id, name").eq("auth_user_id", args.authUserId).maybeSingle();
    const from = args.fromName || "—";
    await admin.from("audit_log").insert({
      organization_id: args.organizationId,
      module: "Employee",
      entity_type: "staff",
      record_id: args.staffId,
      action_type: "update",
      action: "store_changed",
      severity: "info",
      description: `Store for ${args.staffName || "a user"} changed from ${from} to ${args.toName} by ${actor?.name ?? "an administrator"}.`,
      previous_value: { store: args.fromName, storeId: args.fromId },
      new_value: { store: args.toName, storeId: args.toId },
      changes: { field: "store", from: args.fromName, to: args.toName },
      performed_by: actor?.id ?? null,
      actor: actor?.name ?? null,
    });
  } catch {
    /* audit is best-effort */
  }
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

  // Store-change history: every relocation of this user, newest first. Sourced
  // from the append-only audit_log (module=Employee, action=store_changed) so it
  // reflects exactly who moved them and when. Tolerates the table being empty.
  let storeHistory: { from: string | null; to: string | null; by: string | null; at: string | null }[] = [];
  try {
    const { data: events } = await admin
      .from("audit_log")
      .select("previous_value, new_value, actor, created_at")
      .eq("entity_type", "staff")
      .eq("record_id", params.id)
      .eq("action", "store_changed")
      .order("created_at", { ascending: false });
    storeHistory = (events ?? []).map((e: any) => ({
      from: e.previous_value?.store ?? null,
      to: e.new_value?.store ?? null,
      by: e.actor ?? null,
      at: e.created_at ?? null,
    }));
  } catch { /* audit_log unavailable — history simply empty */ }

  return NextResponse.json({
    ok: true,
    member,
    stores,
    credential,
    storeHistory,
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
