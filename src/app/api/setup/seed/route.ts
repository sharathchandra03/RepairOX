import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { ROLES } from "@/lib/permissions";
import { DEFAULT_SEED_PASSWORD, normalizeEmail } from "@/lib/auth";
import { ensureOrganization, ensureBranches, HQ_BRANCH } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* POST /api/setup/seed  (header: x-setup-secret: <SETUP_SECRET>)
   One-time bootstrap: fills roles + role_permissions from the code catalogue,
   and creates the demo staff + their login accounts. Idempotent — skips any
   staff that already exists. Run once after applying supabase/schema.sql. */
export async function POST(req: Request) {
  const secret = req.headers.get("x-setup-secret");
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ ok: false, error: "Bad or missing setup secret." }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Admin client failed." }, { status: 500 });
  }

  const log: string[] = [];

  // Optional custom owner login (set OWNER_EMAIL / OWNER_PASSWORD in .env.local).
  const ownerEmailOverride = process.env.OWNER_EMAIL ? normalizeEmail(process.env.OWNER_EMAIL) : null;
  const ownerPassword = process.env.OWNER_PASSWORD || DEFAULT_SEED_PASSWORD;

  // 1) Roles + permission grants
  for (const r of ROLES) {
    const { error: rErr } = await admin.from("roles").upsert(
      { id: r.id, label: r.label, summary: r.summary, workspaces: r.workspaces, is_custom: false },
      { onConflict: "id" }
    );
    if (rErr) return NextResponse.json({ ok: false, error: `roles: ${rErr.message}` }, { status: 400 });

    const keys = r.permissions === "all" ? ["*"] : r.permissions;
    await admin.from("role_permissions").delete().eq("role_id", r.id);
    if (keys.length > 0) {
      const { error: pErr } = await admin
        .from("role_permissions")
        .insert(keys.map((k) => ({ role_id: r.id, permission_key: k })));
      if (pErr) return NextResponse.json({ ok: false, error: `grants: ${pErr.message}` }, { status: 400 });
    }
  }
  log.push(`Seeded ${ROLES.length} roles + grants.`);

  // 1b) Tenancy: default organization + branches (all staff belong here).
  let orgId: string;
  let branchMap: Map<string, string>;
  try {
    orgId = await ensureOrganization(admin);
    branchMap = await ensureBranches(admin, orgId);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Tenant bootstrap failed." }, { status: 400 });
  }
  const branchIdFor = (name?: string | null) =>
    branchMap.get(name ?? "") ?? branchMap.get(HQ_BRANCH) ?? null;
  log.push(`Organization ready + ${branchMap.size} branches.`);

  // 2) Existing auth users (to avoid duplicates on re-run)
  const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authByEmail = new Map<string, string>();
  for (const u of usersPage?.users ?? []) {
    if (u.email) authByEmail.set(normalizeEmail(u.email), u.id);
  }

  let created = 0;
  let skipped = 0;

  // 3) Owner login + staff row (no demo staff — start with real data).
  const ownerEmail = ownerEmailOverride ?? "abc@gmail.com";
  const ownerBranch = HQ_BRANCH;

  const { data: existingOwner } = await admin
    .from("staff")
    .select("id, organization_id, branch_id")
    .ilike("email", ownerEmail)
    .maybeSingle();

  if (existingOwner) {
    // Backfill tenancy if this owner predates the multi-tenant schema.
    const patch: Record<string, unknown> = {};
    if (!existingOwner.organization_id) patch.organization_id = orgId;
    if (!existingOwner.branch_id) patch.branch_id = branchIdFor(ownerBranch);
    if (Object.keys(patch).length) await admin.from("staff").update(patch).eq("id", existingOwner.id);
    skipped = 1;
  } else {
    let authUserId = authByEmail.get(ownerEmail) ?? null;
    if (!authUserId) {
      const { data: c, error: aErr } = await admin.auth.admin.createUser({
        email: ownerEmail, password: ownerPassword, email_confirm: true,
      });
      if (aErr && !/registered|exists/i.test(aErr.message)) {
        return NextResponse.json({ ok: false, error: `auth(${ownerEmail}): ${aErr.message}` }, { status: 400 });
      }
      authUserId = c?.user?.id ?? null;
    }
    const { error: sErr } = await admin.from("staff").insert({
      auth_user_id: authUserId,
      organization_id: orgId,
      branch_id: branchIdFor(ownerBranch),
      name: "Owner",
      email: ownerEmail,
      role_id: "platform_owner",
      branch: ownerBranch,
      status: "active",
      login_enabled: true,
      salary_type: "monthly",
      salary_amount: 0,
      created_by: "System",
    });
    if (sErr) return NextResponse.json({ ok: false, error: `staff(${ownerEmail}): ${sErr.message}` }, { status: 400 });
    created = 1;
  }
  log.push(created ? `Created owner ${ownerEmail}.` : `Owner ${ownerEmail} already exists.`);

  return NextResponse.json({
    ok: true,
    log,
    ownerLogin: { email: ownerEmailOverride ?? "abc@gmail.com", password: ownerPassword },
  });
}
