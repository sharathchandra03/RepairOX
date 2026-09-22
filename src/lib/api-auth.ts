import "server-only";
import { createAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/* Server-side authorization guard for privileged API routes.

   The browser sends the signed-in user's access token as a Bearer header.
   We verify it, look up their staff role, and only allow admins through.
   The returned `admin` client uses the service-role key (bypasses RLS). */

/* TRUE organization / platform administrators only. A Branch Manager is NOT a
   global admin — they operate within their assigned store via their granted
   permissions + store scope, exactly like every other role. This list mirrors
   the DB `is_admin()` function (migration 0035); the two MUST stay in sync. */
const ADMIN_ROLES = [
  "master_shop_owner",
  "platform_owner",
  "developer_admin",
];

export type AdminGuard =
  | { ok: true; admin: SupabaseClient; user: User; roleId: string }
  | { ok: false; status: number; error: string };

export async function requireAdmin(req: Request): Promise<AdminGuard> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Not signed in." };

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    // Almost always a missing/invalid SUPABASE_SERVICE_ROLE_KEY on the server
    // (e.g. env var not set in the deployment). Surface it clearly so writes
    // don't fail silently.
    return { ok: false, status: 500, error: e?.message ?? "Server not configured: missing service-role key." };
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Invalid session." };

  const { data: staff } = await admin
    .from("staff")
    .select("role_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (!staff || !ADMIN_ROLES.includes(staff.role_id)) {
    return { ok: false, status: 403, error: "You don't have permission to do that." };
  }
  return { ok: true, admin, user: data.user, roleId: staff.role_id };
}

export type PermissionGuard =
  | { ok: true; admin: SupabaseClient; user: User; roleId: string; permissions: Set<string> }
  | { ok: false; status: number; error: string };

/* Central permission-based server guard.

   Resolves the caller's EFFECTIVE permissions LIVE from `role_permissions`
   (never a snapshot), so a role change takes effect on the very next request
   with no cache to invalidate. Passes when the caller's role grants ANY of the
   required keys, or the wildcards `*` / `full_access`, or the caller is a
   built-in admin role. Use this — not scattered `role === "..."` checks — for
   every protected server operation. */
export async function requirePermission(
  req: Request,
  anyOf: string | string[]
): Promise<PermissionGuard> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Not signed in." };

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return { ok: false, status: 500, error: e?.message ?? "Server not configured: missing service-role key." };
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Invalid session." };

  const { data: staff } = await admin
    .from("staff")
    .select("role_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!staff?.role_id) return { ok: false, status: 403, error: "You don't have permission to do that." };

  const { data: rows } = await admin
    .from("role_permissions")
    .select("permission_key")
    .eq("role_id", staff.role_id);
  const permissions = new Set<string>((rows ?? []).map((r) => r.permission_key as string));

  const required = Array.isArray(anyOf) ? anyOf : [anyOf];
  const allowed =
    ADMIN_ROLES.includes(staff.role_id) ||
    permissions.has("*") ||
    permissions.has("full_access") ||
    required.some((k) => permissions.has(k));

  if (!allowed) return { ok: false, status: 403, error: "You don't have permission to do that." };
  return { ok: true, admin, user: data.user, roleId: staff.role_id, permissions };
}

/* ── Delegation / privilege-escalation guard ────────────────────────────────
   A user may never grant a permission they do not themselves hold. When an
   admin edits a role's permission grants, we compare the DESIRED key set
   against the editor's OWN effective permissions and reject any key they lack
   the authority to delegate.

   `full_access` / `*` (and the built-in owner roles) confer universal
   delegation authority, matching the rest of the system. Everyone else can
   only grant keys within their own grant set. This is enforced on the SERVER
   so it holds even if the client is tampered with. */

/** Store-scope capabilities are a SEPARATE axis from action authority.
 *  `full_access` (all actions) must NOT let a non-owner delegate cross-store
 *  scope — only holding the store key itself (or being a true owner / '*') can.
 *  Mirrors the DB: full_access ≠ multi_store_access (migration 0039). */
const STORE_SCOPE_KEYS = new Set([
  "multi_store_access",
  "stores_view_all",
  "stores_multi_select",
]);

/** True when the caller has UNIVERSAL ACTION authority (can delegate any
 *  action key). Note: this is about WHAT, not WHERE — store-scope keys are
 *  handled separately in keysBeyondAuthority. */
export function callerCanDelegateAll(
  roleId: string,
  permissions: Set<string>
): boolean {
  return (
    ADMIN_ROLES.includes(roleId) ||
    permissions.has("*") ||
    permissions.has("full_access")
  );
}

/** Whether the caller may delegate STORE-SCOPE keys. Only true owners, the
 *  platform wildcard `*`, or a caller who literally holds the store key — NOT
 *  merely `full_access`. */
function callerCanDelegateStoreScope(roleId: string, permissions: Set<string>): boolean {
  return ADMIN_ROLES.includes(roleId) || permissions.has("*");
}

/** Returns the subset of `desired` keys the caller is NOT authorized to grant.
 *  Empty array = the change is fully within the caller's delegation authority. */
export function keysBeyondAuthority(
  desired: string[],
  roleId: string,
  permissions: Set<string>
): string[] {
  const universalActions = callerCanDelegateAll(roleId, permissions);
  const canDelegateStore = callerCanDelegateStoreScope(roleId, permissions);

  // Keys that are NEVER delegatable unless the caller is a true owner / '*'.
  const NEVER_DELEGATABLE = new Set([
    "*",
    "system_administrator",
  ]);

  return desired.filter((k) => {
    if (NEVER_DELEGATABLE.has(k) && !permissions.has("*") && !ADMIN_ROLES.includes(roleId)) return true;
    // Store-scope keys: separate axis. full_access does NOT confer these.
    if (STORE_SCOPE_KEYS.has(k)) {
      return !(canDelegateStore || permissions.has(k));
    }
    // Action keys: universal action authority (full_access/'*'/owner) covers
    // them; otherwise the caller must hold the exact key.
    if (universalActions) return false;
    return !permissions.has(k);
  });
}
