/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Supabase browser client.

   Uses the public anon key. Safe to import in client components. All
   privileged writes (creating logins, resetting passwords, editing roles)
   go through server API routes that use the service-role key instead — this
   client only signs users in/out and performs RLS-protected reads.
   ────────────────────────────────────────────────────────────────────────── */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the public env vars are present. When false, the app falls back
 *  to its built-in local (localStorage) behaviour so nothing breaks. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
