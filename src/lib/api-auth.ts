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
