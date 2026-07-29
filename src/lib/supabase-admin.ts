import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Supabase admin (service-role) client.

   SERVER ONLY. The `server-only` import makes the build fail if this module
   is ever pulled into client code, so the service-role key can never leak to
   the browser. Used inside app/api/* route handlers for privileged actions:
   creating auth users, resetting passwords, banning accounts, and writing
   role/permission tables (bypasses Row Level Security by design).
   ────────────────────────────────────────────────────────────────────────── */

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
