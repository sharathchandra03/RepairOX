import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/api-auth";
import { rowToStaff } from "@/lib/staff-map";
import { normalizeEmail } from "@/lib/auth";
import { ensureOrganization, ensureBranches, orgIdForAuthUser, resolveBranchId, HQ_BRANCH } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* Roles that carry organization-wide administration and therefore MUST NOT be
   assignable by anyone other than a true org/platform administrator. This is
   the backend guard against privilege escalation: a Store Manager assigning
   users to their store can never mint another Owner / org-admin, no matter what
   roleId the browser sends (the client dropdown hides these, but we never trust
   the client). */
const ORG_ADMIN_ROLES = new Set([
  "master_shop_owner",
  "platform_owner",
  "developer_admin",
]);

/* The roles that may GRANT an org-admin role. Only a true org/platform admin
   may create another org-admin-level user. A branch-scoped Store Manager
   (shop_owner_branch_manager) is intentionally excluded. */
const CAN_GRANT_ORG_ADMIN = new Set([
  "master_shop_owner",
  "platform_owner",
  "developer_admin",
]);

/* POST /api/staff — create a staff member and (optionally) their login account.
   Admin-only. Uses the service-role key to create the auth user. */
export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const body = await req.json();
  const {
    name, phone, email: rawEmail, hasLogin, password,
    roleId, branch, storeId, salaryType, salaryAmount, department, designation, createdBy,
  } = body ?? {};

  const email = rawEmail ? normalizeEmail(rawEmail) : "";

  if (!name?.trim()) return NextResponse.json({ ok: false, reason: "missing_name" }, { status: 400 });
  if (hasLogin && !email) return NextResponse.json({ ok: false, reason: "missing_email" }, { status: 400 });
  if (hasLogin && !password) return NextResponse.json({ ok: false, reason: "missing_password" }, { status: 400 });
  if (!roleId || typeof roleId !== "string") return NextResponse.json({ ok: false, reason: "missing_role" }, { status: 400 });

  // ── Role integrity: the assigned role MUST be a real role from the single
  //    source of truth (the roles table / Settings → Roles & Permissions). We
  //    never invent or hardcode permissions here. ──
  const { data: roleRow } = await admin.from("roles").select("id").eq("id", roleId).maybeSingle();
  if (!roleRow) return NextResponse.json({ ok: false, reason: "invalid_role" }, { status: 400 });

  // ── Privilege-escalation guard: only a true org/platform admin may assign an
  //    org-wide administration role. A Store Manager cannot mint an Owner, even
  //    by tampering with the request. ──
  if (ORG_ADMIN_ROLES.has(roleId) && !CAN_GRANT_ORG_ADMIN.has(guard.roleId)) {
    return NextResponse.json({ ok: false, reason: "forbidden_role" }, { status: 403 });
  }

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
  // Resolve the store (branch) this user belongs to. Prefer an explicit
  // storeId (a real branches.id — the robust binding used for store logins);
  // otherwise fall back to resolving the branch name label.
  let branchId: string | null;
  let branchName: string | null = branch ?? null;
  if (storeId) {
    const { data: br } = await admin
      .from("branches")
      .select("id, name, organization_id")
      .eq("id", storeId)
      .maybeSingle();
    // Only accept a store that belongs to the creator's organization.
    if (br && br.organization_id === orgId) {
      branchId = br.id as string;
      branchName = (br.name as string) ?? branchName;
    } else {
      branchId = await resolveBranchId(admin, orgId, branch ?? HQ_BRANCH);
    }
  } else {
    branchId = await resolveBranchId(admin, orgId, branch ?? HQ_BRANCH);
  }

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
      branch: branchName,
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

  // Robust store binding: write an explicit user_stores grant so the user's
  // access is anchored to the store's branch_id (not just the fragile branch
  // name text match). This is the source of truth for "which stores can this
  // user enter". Best-effort: the table is optional (multi-store migration),
  // and the staff.branch/branch_id already scope the user, so we don't fail
  // the whole request if this insert can't run.
  if (branchId) {
    await admin
      .from("user_stores")
      .upsert(
        {
          organization_id: orgId,
          staff_id: inserted.id,
          branch_id: branchId,
          // Persist the assigned role on the grant too, so the user↔store↔role
          // relationship is fully relational (roleId, not text). This is the
          // per-store role for this user's access to this store.
          role_id: roleId,
          is_default: true,
          status: "active",
          created_by: (await orgStaffId(admin, user.id)) ?? null,
        },
        { onConflict: "staff_id,branch_id" }
      )
      .then(() => {}, () => {}); // ignore if user_stores isn't present
  }

  return NextResponse.json({ ok: true, member: rowToStaff(inserted) });
}

/** The staff.id for the signed-in auth user (creator), for created_by stamping. */
async function orgStaffId(admin: SupabaseClient, authUserId: string): Promise<string | null> {
  const { data } = await admin.from("staff").select("id").eq("auth_user_id", authUserId).maybeSingle();
  return (data?.id as string) ?? null;
}
