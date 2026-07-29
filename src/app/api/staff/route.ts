import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { rowToStaff } from "@/lib/staff-map";
import { normalizeEmail } from "@/lib/auth";
import { ensureOrganization, ensureBranches, orgIdForAuthUser, resolveBranchId, HQ_BRANCH } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* POST /api/staff — create a staff member and (optionally) their login account.
   Admin-only. Uses the service-role key to create the auth user. */
export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const body = await req.json();
  const {
    name, phone, email: rawEmail, hasLogin, password,
    roleId, branch, salaryType, salaryAmount, department, designation, createdBy,
  } = body ?? {};

  const email = rawEmail ? normalizeEmail(rawEmail) : "";

  if (!name?.trim()) return NextResponse.json({ ok: false, reason: "missing_name" }, { status: 400 });
  if (hasLogin && !email) return NextResponse.json({ ok: false, reason: "missing_email" }, { status: 400 });
  if (hasLogin && !password) return NextResponse.json({ ok: false, reason: "missing_password" }, { status: 400 });

  // Duplicate email check (whenever an email is supplied).
  if (email) {
    const { data: existing } = await admin.from("staff").select("id").ilike("email", email).maybeSingle();
    if (existing) return NextResponse.json({ ok: false, reason: "duplicate_email" }, { status: 409 });
  }

  // Create the auth user if login is requested.
  let authUserId: string | null = null;
  if (hasLogin) {
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr || !created.user) {
      const msg = authErr?.message ?? "";
      if (/registered|exists/i.test(msg)) {
        return NextResponse.json({ ok: false, reason: "duplicate_email" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: msg || "Could not create login." }, { status: 400 });
    }
    authUserId = created.user.id;
  }

  // Scope the new staff member to the creator's organization + branch. If the
  // creator has no org yet (fresh install), bootstrap the default one.
  let orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) {
    orgId = await ensureOrganization(admin);
    await ensureBranches(admin, orgId);
  }
  const branchId = await resolveBranchId(admin, orgId, branch ?? HQ_BRANCH);

  const { data: inserted, error: insErr } = await admin
    .from("staff")
    .insert({
      auth_user_id: authUserId,
      organization_id: orgId,
      branch_id: branchId,
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email || null,
      role_id: roleId,
      branch: branch ?? null,
      status: "active",
      login_enabled: Boolean(hasLogin),
      salary_type: salaryType ?? "monthly",
      salary_amount: Number(salaryAmount ?? 0),
      department: department ?? null,
      designation: designation ?? null,
      joining_date: new Date().toISOString().slice(0, 10),
      created_by: createdBy ?? user.email ?? "System",
    })
    .select("*")
    .single();

  if (insErr || !inserted) {
    // Roll back the auth user so we don't leave an orphaned login.
    if (authUserId) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    if (/duplicate|unique/i.test(insErr?.message ?? "")) {
      return NextResponse.json({ ok: false, reason: "duplicate_email" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: insErr?.message ?? "Insert failed." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, member: rowToStaff(inserted) });
}
