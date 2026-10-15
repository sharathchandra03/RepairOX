import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { resolveStaff, rowToRecord, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/work-session/report — owner "Sales Agent Productivity" report.

   Returns RAW, scope-constrained session + break rows (NO server-side duration
   or interrupted math — all derivation runs through the one pure engine on the
   client, so export == on-screen). The on-screen owner report AND the HR/payroll
   export both read THIS route.

   Gated by requirePermission with the owner-key array (the SAME array as
   CAP.workSession.viewTeam/viewAll). requirePermission returns the service-role
   admin client that BYPASSES RLS, so the route reproduces auth_work_sessions_see
   BY HAND:

     organization_id = callerOrgId
     AND (
       staff_id = callerStaffId
       OR ( callerHasOwnerKey AND ( callerCanCrossBranch
                                    OR branch_id = callerBranchId
                                    OR branch_id IS NULL ) )
     )

   ── LOCKSTEP ──────────────────────────────────────────────────────────────
   This hand-written predicate DUPLICATES public.auth_work_sessions_see
   (migration 0075 §1.5) and MUST be kept in lockstep with it: any change to the
   RLS helper's org/self/branch-visible(incl. null-branch)/owner-key logic MUST
   be mirrored here in the same change, and vice-versa.
   ──────────────────────────────────────────────────────────────────────────
   On top, the requested agent set is intersected with the eligible active
   Sales-Agent directory, then date-range + store filters apply.
   ────────────────────────────────────────────────────────────────────────── */

// Keep this in lockstep with auth_work_sessions_see AND CAP.workSession.viewTeam/viewAll.
const OWNER_KEYS = [
  "work_sessions_view_team",
  "work_sessions_view_all",
  "manage_attendance",
  "view_sales_reports",
  "manage_reports",
];
const ADMIN_ROLE_IDS = ["master_shop_owner", "platform_owner", "developer_admin"];

export async function POST(req: Request) {
  const guard = await requirePermission(req, OWNER_KEYS);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;
  const { permissions, roleId } = guard;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const requestedAgentIds: string[] = Array.isArray(body.agentIds)
    ? (body.agentIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const storeFilter: string[] = Array.isArray(body.storeIds)
    ? (body.storeIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const fromISO = typeof body.from === "string" ? body.from : null;
  const toISO = typeof body.to === "string" ? body.to : null;

  const caller = await resolveStaff(admin, guard.user.id);
  if (!caller || !caller.organization_id) {
    return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });
  }
  const callerOrgId = caller.organization_id;
  const callerStaffId = caller.id;
  const callerBranchId = caller.branch_id;

  const isAdminRole = ADMIN_ROLE_IDS.includes(roleId);
  const hasWildcard = permissions.has("*") || permissions.has("full_access");
  // Mirror auth_can_cross_branch() = multi_store_access (admins/wildcard imply it).
  const callerCanCrossBranch = isAdminRole || hasWildcard || permissions.has("multi_store_access");
  // Any owner-key holder (the caller already passed requirePermission, so this
  // is true here, but re-derived to build the row predicate explicitly).
  const callerHasOwnerKey = isAdminRole || hasWildcard || OWNER_KEYS.some((k) => permissions.has(k));

  // Resolve the eligible active Sales-Agent directory (reproduces
  // lead_sales_agents under the service role, which can't rely on auth.uid()).
  const { data: staffRows } = await admin
    .from("staff")
    .select("id, name, avatar_url, role_id, branch_id, status, organization_id")
    .eq("organization_id", callerOrgId);
  const activeStaff = (staffRows ?? []).filter((s: any) => (s.status ?? "active") === "active");

  const roleIds = Array.from(new Set(activeStaff.map((s: any) => s.role_id).filter(Boolean)));
  let salesAgentRoleIds = new Set<string>();
  if (roleIds.length) {
    const { data: perms } = await admin
      .from("role_permissions")
      .select("role_id")
      .in("role_id", roleIds)
      .eq("permission_key", "leads_sales_agent");
    salesAgentRoleIds = new Set((perms ?? []).map((r: any) => r.role_id));
  }
  const eligibleAgents = activeStaff.filter((s: any) => salesAgentRoleIds.has(s.role_id));
  const eligibleIds = new Set(eligibleAgents.map((s: any) => s.id));

  // The effective agent set = eligible directory, intersected with the request
  // (empty request = All eligible agents).
  let agentIds = requestedAgentIds.length
    ? requestedAgentIds.filter((id) => eligibleIds.has(id))
    : Array.from(eligibleIds);

  // Build the directory payload the UI uses for the agent selector + labels.
  const branchIds = Array.from(
    new Set(eligibleAgents.map((s: any) => s.branch_id).filter(Boolean)),
  ) as string[];
  const branchNameById: Record<string, string> = {};
  if (branchIds.length) {
    const { data: branches } = await admin.from("branches").select("id, name").in("id", branchIds);
    for (const b of branches ?? []) branchNameById[b.id] = b.name;
  }
  const agents = eligibleAgents.map((s: any) => ({
    staffId: s.id,
    name: s.name,
    avatarUrl: s.avatar_url ?? null,
    branchId: s.branch_id ?? null,
    storeName: s.branch_id ? branchNameById[s.branch_id] ?? null : null,
  }));

  // If after intersection nothing remains, return empty (but still the dir).
  if (!agentIds.length) {
    return NextResponse.json({ ok: true, agents, sessions: [], storeNameById: branchNameById });
  }

  // Query sessions under the hand-written scope predicate + request filters.
  let q = admin
    .from("work_sessions")
    .select("*")
    .eq("organization_id", callerOrgId)
    .in("staff_id", agentIds);

  // Store scope (the hand-mirror of auth_branch_visible incl. null-branch rows)
  // is applied per-row below after fetching — own records are always visible,
  // owner-key rows only when branch-visible — so no branch filter is added to
  // the query chain here.
  if (fromISO) q = q.gte("started_at", fromISO);
  if (toISO) q = q.lte("started_at", toISO);

  const { data: sessionRows, error } = await q.order("started_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Apply the exact scope predicate per row (own OR owner-key + branch-visible).
  const scoped = (sessionRows ?? []).filter((row: any) => {
    if (row.organization_id !== callerOrgId) return false;
    if (row.staff_id === callerStaffId) return true;
    if (!callerHasOwnerKey) return false;
    return callerCanCrossBranch || row.branch_id === callerBranchId || row.branch_id == null;
  });

  // Request store filter (StoreMultiSelect) — empty = all; applied on top.
  const storeScoped = storeFilter.length
    ? scoped.filter((row: any) => (row.branch_id ? storeFilter.includes(row.branch_id) : false))
    : scoped;

  // Fetch breaks for the returned sessions.
  const sessionIds = storeScoped.map((r: any) => r.id);
  let breaksById: Record<string, any[]> = {};
  if (sessionIds.length) {
    const { data: breakRows } = await admin
      .from("work_session_breaks")
      .select("id, session_id, started_at, ended_at")
      .in("session_id", sessionIds)
      .order("started_at", { ascending: true });
    for (const b of breakRows ?? []) {
      (breaksById[b.session_id] ??= []).push(b);
    }
  }

  const sessions = storeScoped.map((row: any) => rowToRecord(row, breaksById[row.id] ?? []));

  return NextResponse.json({ ok: true, agents, sessions, storeNameById: branchNameById });
}
