import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { orgIdForAuthUser, ensureOrganization } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   Owner store management.

   GET  /api/owner/stores           → list stores in the caller's organization
                                       (with live per-store row counts).
   POST /api/owner/stores           → create a NEW store (branch). The store
                                       starts as a FRESH RepairOX workspace:
                                       zero tickets / invoices / walk-ins /
                                       inventory. We deliberately DO NOT copy
                                       any other store's transactional data.

   Owner/admin only, always constrained to the caller's own organization.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  // Listing stores for management requires a store-management or multi-store
  // capability — not merely being on an admin role.
  const guard = await requirePermission(req, ["stores_list_view", "manage_branches", "multi_store_access", "stores_view_all"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  const { data: branches, error } = await admin
    .from("branches")
    .select("id, name, code, address, is_active, environment, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // Per-store staff + ticket counts (compact — counts only, not full rows) and
  // the store's manager. "Manager" is resolved by CAPABILITY, not a hardcoded
  // role name: any role that grants store administration (`manage_branches`)
  // or full/wildcard authority qualifies. This works for custom roles too and
  // stays consistent with the "no hardcoded role names" standard.
  const { data: mgrRoleRows } = await admin
    .from("role_permissions")
    .select("role_id, permission_key")
    .in("permission_key", ["manage_branches", "full_access", "*"]);
  const MANAGER_ROLES = Array.from(new Set((mgrRoleRows ?? []).map((r) => r.role_id as string)));
  const stores = await Promise.all((branches ?? []).map(async (b) => {
    const [{ count: staffCount }, { count: ticketCount }, { data: mgr }] = await Promise.all([
      admin.from("staff").select("*", { count: "exact", head: true }).eq("branch_id", b.id).eq("status", "active"),
      admin.from("tickets").select("*", { count: "exact", head: true }).eq("branch_id", b.id).is("deleted_at", null),
      admin.from("staff")
        .select("name, role_id")
        .eq("branch_id", b.id)
        .eq("status", "active")
        .in("role_id", MANAGER_ROLES)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);
    return {
      id: b.id, name: b.name, code: b.code, address: b.address,
      isActive: b.is_active, environment: b.environment ?? "live", createdAt: b.created_at,
      staffCount: staffCount ?? 0, ticketCount: ticketCount ?? 0,
      manager: mgr && mgr[0] ? mgr[0].name : null,
    };
  }));

  return NextResponse.json({ ok: true, stores });
}

export async function POST(req: Request) {
  // Creating a store is restricted to store-creation authority. Note: this is
  // deliberately NOT implied by `add_user` — adding users must not confer store
  // creation (RepairOX authorization standard §35).
  const guard = await requirePermission(req, ["stores_create", "manage_branches"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const code = String(body?.code ?? "").trim() || null;
  const address = String(body?.address ?? "").trim() || null;
  const phone = String(body?.phone ?? "").trim() || null;
  const email = String(body?.email ?? "").trim() || null;
  const timezone = String(body?.timezone ?? "").trim() || null;
  // Environment (DEMO | LIVE) is a distinct concept from is_active
  // (ACTIVE | INACTIVE). A real branch defaults to LIVE (production); only an
  // explicit "demo" makes it a demonstration/test store.
  const environment = String(body?.environment ?? "").trim().toLowerCase() === "demo" ? "demo" : "live";

  if (!name) return NextResponse.json({ ok: false, reason: "missing_name" }, { status: 400 });

  let orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) orgId = await ensureOrganization(admin);

  // Uniqueness within the org (the branches table enforces this too).
  const { data: existing } = await admin
    .from("branches")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("name", name)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: false, reason: "duplicate_name" }, { status: 409 });

  const { data: created, error } = await admin
    .from("branches")
    .insert({ organization_id: orgId, name, code, address, is_active: true, environment })
    .select("id, name, code, address, is_active, environment, created_at")
    .single();
  if (error || !created) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Create failed." }, { status: 400 });
  }

  // Initialise SAFE store defaults (never copies another store's live data).
  // organization_id is NOT NULL on branch_settings — always include it. This
  // seeds the per-store settings row so later prefix/settings saves just update
  // it. If the table doesn't exist yet, the client upsert will create the row
  // on first save, so we log-and-continue rather than fail store creation.
  const { error: bsErr } = await admin.from("branch_settings").insert({
    branch_id: created.id,
    organization_id: orgId,
    display_name: name,
    phone, email, address, timezone,
    settings: {},
  });
  if (bsErr && !/relation .*does not exist/i.test(bsErr.message)) {
    // A real error (not "table missing") — surface it in server logs but don't
    // roll back the store; the settings row can be created on first save.
    console.warn("[owner/stores] branch_settings seed failed:", bsErr.code, bsErr.message);
  }

  return NextResponse.json({ ok: true, store: {
    id: created.id, name: created.name, code: created.code, address: created.address,
    isActive: created.is_active, environment: created.environment ?? "live",
    createdAt: created.created_at, staffCount: 0, ticketCount: 0,
  } });
}
