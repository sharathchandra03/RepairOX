import "server-only";
import { createAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/* Server-side authorization guard for privileged API routes.

   The browser sends the signed-in user's access token as a Bearer header.
   We verify it, look up their staff role, and only allow admins through.
   The returned `admin` client uses the service-role key (bypasses RLS). */

const ADMIN_ROLES = [
  "master_shop_owner",
  "platform_owner",
  "shop_owner_branch_manager",
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

/** The keys the editor is allowed to delegate. `*`/`full_access`/owner → all. */
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

/** Returns the subset of `desired` keys the caller is NOT authorized to grant.
 *  Empty array = the change is fully within the caller's delegation authority. */
export function keysBeyondAuthority(
  desired: string[],
  roleId: string,
  permissions: Set<string>
): string[] {
  if (callerCanDelegateAll(roleId, permissions)) return [];
  // A caller without universal authority can only delegate keys they hold, and
  // can NEVER mint universal keys or the administration capabilities.
  const NEVER_DELEGATABLE_WITHOUT_FULL = new Set([
    "*",
    "full_access",
    "system_administrator",
  ]);
  return desired.filter(
    (k) => NEVER_DELEGATABLE_WITHOUT_FULL.has(k) || !permissions.has(k)
  );
}
