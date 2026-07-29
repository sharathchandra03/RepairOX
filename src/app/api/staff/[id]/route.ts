import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { rowToStaff } from "@/lib/staff-map";
import { normalizeEmail } from "@/lib/auth";
import { resolveBranchId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const BANNED = "876000h"; // ~100 years
const UNBANNED = "none";

/* PATCH /api/staff/[id] — update profile / role / branch / salary / status /
   login access. Admin-only. Keeps the auth account (ban state, password) in
   sync with the staff row. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin } = guard;

  const { data: row, error: findErr } = await admin
    .from("staff").select("*").eq("id", params.id).maybeSingle();
  if (findErr || !row) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = await req.json();
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

  const finalStatus = (update.status ?? row.status) as string;
  const finalLoginEnabled = (update.login_enabled ?? row.login_enabled) as boolean;
  let authUserId: string | null = row.auth_user_id;
  const email = (update.email ?? row.email) as string | null;

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
  } else if (body.password && authUserId) {
    // Password reset / change.
    await admin.auth.admin.updateUserById(authUserId, { password: body.password });
    update.login_enabled = true;
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

/* DELETE /api/staff/[id] — remove the staff record and its login. Admin-only. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(req);
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
