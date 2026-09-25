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
  // Primary manager assignment (nullable). Only accept a staff member who
  // belongs to this org; setting null clears the manager without orphaning the
  // previous manager's history (their staff row/activity is untouched).
  if (body?.managerStaffId !== undefined) {
    const mgrId = body.managerStaffId;
    if (mgrId === null || mgrId === "") {
      patch.manager_staff_id = null;
    } else {
      const { data: mgr } = await admin
        .from("staff").select("id, organization_id").eq("id", mgrId).maybeSingle();
      if (!mgr || mgr.organization_id !== orgId) {
        return NextResponse.json({ ok: false, error: "That manager isn't in your organization." }, { status: 400 });
      }
      patch.manager_staff_id = mgrId;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("branches")
    .update(patch)
    .eq("id", params.id)
    .select("id, name, code, address, is_active, environment, created_at, manager_staff_id")
    .single();
  if (error || !updated) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Update failed." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, store: {
    id: updated.id, name: updated.name, code: updated.code, address: updated.address,
    isActive: updated.is_active, environment: updated.environment ?? "live", createdAt: updated.created_at,
    managerStaffId: updated.manager_staff_id ?? null,
  } });
}

/* GET /api/owner/stores/[id] — full store administration detail:
   identity, primary manager, ALL people with access (home-branch staff +
   active user_stores members, incl. staff a Store Manager created), each
   member's role + credential status + access origin, and a concise data
   summary. Read authority: store-view / user-view / management. Org-scoped. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, [
    "stores_list_view", "stores_users_view", "manage_branches",
    "multi_store_access", "stores_view_all", "manage_users",
  ]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  const { data: store } = await admin
    .from("branches")
    .select("id, organization_id, name, code, address, is_active, environment, created_at, updated_at, manager_staff_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!store || store.organization_id !== orgId) {
    return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });
  }

  // ── People with access ──
  // Two sources, de-duplicated by staff id:
  //   • staff whose HOME branch is this store (staff.branch_id)
  //   • active user_stores grants pointing at this store (multi-store members
  //     AND anyone a Store Manager added here)
  const membersById = new Map<string, any>();

  const { data: homeStaff } = await admin
    .from("staff")
    .select("*")
    .eq("organization_id", orgId)
    .eq("branch_id", params.id);
  for (const s of homeStaff ?? []) {
    membersById.set(s.id, { row: s, isHome: true, grantRoleId: null, createdByGrant: null, viaGrant: false });
  }

  let grants: any[] = [];
  try {
    const { data: g } = await admin
      .from("user_stores")
      .select("staff_id, role_id, is_default, status, created_by")
      .eq("branch_id", params.id)
      .eq("status", "active");
    grants = g ?? [];
  } catch { /* user_stores optional */ }

  if (grants.length > 0) {
    const missingIds = grants.map((g) => g.staff_id).filter((id) => !membersById.has(id));
    if (missingIds.length > 0) {
      const { data: extra } = await admin.from("staff").select("*").in("id", missingIds);
      for (const s of extra ?? []) {
        membersById.set(s.id, { row: s, isHome: s.branch_id === params.id, grantRoleId: null, createdByGrant: null, viaGrant: true });
      }
    }
    for (const g of grants) {
      const m = membersById.get(g.staff_id);
      if (m) { m.grantRoleId = g.role_id ?? null; m.createdByGrant = g.created_by ?? null; m.viaGrant = true; }
    }
  }

  // Resolve creator names (for the access-origin label) in one round-trip.
  const creatorIds = Array.from(new Set(
    Array.from(membersById.values()).map((m) => m.createdByGrant).filter(Boolean)
  )) as string[];
  const creatorNames = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: creators } = await admin.from("staff").select("id, name").in("id", creatorIds);
    for (const c of creators ?? []) creatorNames.set(c.id, c.name as string);
  }

  // Roles that carry store administration — used to label access origin.
  const { data: mgrRoleRows } = await admin
    .from("role_permissions").select("role_id, permission_key")
    .in("permission_key", ["manage_branches", "full_access", "*"]);
  const managerRoleIds = new Set((mgrRoleRows ?? []).map((r) => r.role_id as string));

  const members = Array.from(membersById.values()).map(({ row, isHome, grantRoleId, createdByGrant, viaGrant }) => {
    // Access origin: assigned by a manager (grant has a creator) vs directly
    // assigned/owner-level vs inherited (home branch, no explicit grant).
    let accessOrigin: "manager" | "owner" | "inherited";
    if (createdByGrant && !managerRoleIds.has(row.role_id)) accessOrigin = "manager";
    else if (viaGrant) accessOrigin = "owner";
    else accessOrigin = "inherited";
    const creatorName = createdByGrant ? (creatorNames.get(createdByGrant) ?? null) : null;
    return {
      id: row.id,
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? null,
      roleId: row.role_id ?? "",
      perStoreRoleId: grantRoleId,
      status: row.status ?? "active",
      loginEnabled: Boolean(row.login_enabled),
      lastLogin: row.last_login ?? null,
      isHome,
      accessOrigin,
      accessOriginBy: creatorName,
      credential: {
        hasLogin: Boolean(row.auth_user_id) && Boolean(row.login_enabled),
        passwordSet: Boolean(row.auth_user_id),
        lastPasswordChangedAt: row.last_password_changed_at ?? null,
        passwordResetRequired: Boolean(row.password_reset_required),
      },
    };
  });
  members.sort((a, b) => a.name.localeCompare(b.name));

  // Manager name.
  let manager: { id: string; name: string; email: string } | null = null;
  if (store.manager_staff_id) {
    const m = members.find((x) => x.id === store.manager_staff_id);
    if (m) manager = { id: m.id, name: m.name, email: m.email };
    else {
      const { data: mr } = await admin.from("staff").select("id, name, email").eq("id", store.manager_staff_id).maybeSingle();
      if (mr) manager = { id: mr.id, name: mr.name as string, email: (mr.email as string) ?? "" };
    }
  }

  // Data summary via the SECURITY-DEFINER helper (respects branch visibility).
  let data: Record<string, number> | null = null;
  try {
    const { data: summary } = await admin.rpc("store_data_summary", { p_branch_id: params.id });
    if (summary) data = summary as Record<string, number>;
  } catch { /* helper not migrated yet */ }

  // Per-store document prefixes (optional branch_settings).
  let prefixes: Record<string, string | null> = {};
  try {
    const { data: bs } = await admin
      .from("branch_settings")
      .select("ticket_prefix, invoice_prefix, walkin_prefix, field_prefix")
      .eq("branch_id", params.id)
      .maybeSingle();
    if (bs) prefixes = {
      ticket: bs.ticket_prefix ?? null, invoice: bs.invoice_prefix ?? null,
      walkin: bs.walkin_prefix ?? null, field: bs.field_prefix ?? null,
    };
  } catch { /* optional */ }

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "invited" || (!m.loginEnabled && m.status !== "suspended")).length;

  return NextResponse.json({
    ok: true,
    store: {
      id: store.id, name: store.name, code: store.code, address: store.address,
      isActive: store.is_active, environment: store.environment ?? "live",
      createdAt: store.created_at, updatedAt: store.updated_at,
      managerStaffId: store.manager_staff_id ?? null,
    },
    manager,
    members,
    summary: {
      total: members.length,
      active: activeCount,
      pending: pendingCount,
    },
    data,
    prefixes,
  });
}

/* DELETE /api/owner/stores/[id] — SAFE store removal.
   Default behaviour is ARCHIVE (deactivate: is_active=false) so historical
   tickets/invoices/etc. stay valid. PERMANENT deletion is only permitted when
   BOTH: the caller holds `stores_delete`, AND the store has ZERO transactional
   data. Otherwise we refuse hard delete and report the counts so the UI can
   offer Archive instead. Requires ?confirm=<exact store name>. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission(req, ["stores_delete", "stores_deactivate", "manage_branches"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user, permissions, roleId } = guard;

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  const { data: store } = await admin
    .from("branches").select("id, name, organization_id").eq("id", params.id).maybeSingle();
  if (!store || store.organization_id !== orgId) {
    return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });
  }

  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm") ?? "";
  const mode = url.searchParams.get("mode") ?? "archive"; // "archive" | "delete"

  // Name confirmation guard (matches the UI's type-the-name gate).
  if (confirm.trim() !== (store.name as string)) {
    return NextResponse.json({ ok: false, reason: "name_mismatch", error: "Store name confirmation didn't match." }, { status: 400 });
  }

  // ── ARCHIVE (safe default): deactivate, preserve all data. ──
  if (mode !== "delete") {
    const { error } = await admin.from("branches").update({ is_active: false }).eq("id", params.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, mode: "archived" });
  }

  // ── PERMANENT delete: requires the explicit stores_delete capability AND an
  //    empty store (no transactional data). ──
  const canHardDelete =
    ["master_shop_owner", "platform_owner", "developer_admin"].includes(roleId) ||
    permissions.has("*") || permissions.has("full_access") || permissions.has("stores_delete");
  if (!canHardDelete) {
    return NextResponse.json({ ok: false, reason: "forbidden", error: "You aren't allowed to permanently delete a store." }, { status: 403 });
  }

  let counts: Record<string, number> = {};
  try {
    const { data: summary } = await admin.rpc("store_data_summary", { p_branch_id: params.id });
    counts = (summary as Record<string, number>) ?? {};
  } catch { /* fall through — treat as unknown, refuse to be safe */ }
  const totalData = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
  if (totalData > 0) {
    // Never destroy history. Force the caller to archive instead.
    return NextResponse.json({ ok: false, reason: "has_data", counts, error: "This store has historical records. Archive it instead of deleting." }, { status: 409 });
  }

  // Empty store — safe to hard delete. user_stores/branch_settings cascade or
  // are cleaned by FK on delete.
  const { error } = await admin.from("branches").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, mode: "deleted" });
}
