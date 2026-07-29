import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BRANCHES } from "@/lib/auth";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Tenant bootstrap helpers (SERVER ONLY).

   The multi-tenant schema (supabase/schema.sql) scopes every business record
   to an organization + branch. These helpers make sure those tenancy rows
   exist and resolve a branch label ("BTM Layout (HQ)") to its branch id, so
   the seed + staff routes can stamp organization_id / branch_id correctly.

   All calls take the service-role `admin` client (bypasses RLS by design).
   ────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_ORG_NAME = process.env.ORG_NAME || "RepairOX";
export const DEFAULT_ORG_SLUG = process.env.ORG_SLUG || "repairox";

/** The head-office branch (first entry in BRANCHES) — used as the fallback. */
export const HQ_BRANCH: string = BRANCHES[0];

/** Upsert the default organization and return its id. Idempotent. */
export async function ensureOrganization(admin: SupabaseClient): Promise<string> {
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", DEFAULT_ORG_SLUG)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await admin
    .from("organizations")
    .insert({ name: DEFAULT_ORG_NAME, slug: DEFAULT_ORG_SLUG })
    .select("id")
    .single();
  if (error || !data) throw new Error(`organizations: ${error?.message ?? "insert failed"}`);
  return data.id as string;
}

/** Ensure one branch row per BRANCHES entry; return a name -> id map. Idempotent. */
export async function ensureBranches(
  admin: SupabaseClient,
  orgId: string
): Promise<Map<string, string>> {
  const rows = BRANCHES.map((name, i) => ({
    organization_id: orgId,
    name,
    code: name.includes("(HQ)") ? "HQ" : `B${i + 1}`,
  }));
  const { error } = await admin
    .from("branches")
    .upsert(rows, { onConflict: "organization_id,name" });
  if (error) throw new Error(`branches: ${error.message}`);

  const { data } = await admin
    .from("branches")
    .select("id,name")
    .eq("organization_id", orgId);

  const map = new Map<string, string>();
  for (const b of data ?? []) map.set(b.name as string, b.id as string);
  return map;
}

/** Resolve a branch label to its id within an org. Falls back to HQ, then the
 *  first available branch, else null. */
export async function resolveBranchId(
  admin: SupabaseClient,
  orgId: string | null,
  branchName?: string | null
): Promise<string | null> {
  if (!orgId) return null;
  const { data } = await admin
    .from("branches")
    .select("id,name")
    .eq("organization_id", orgId);
  const list = data ?? [];
  const byName = (n?: string | null) => list.find((b) => b.name === n)?.id ?? null;
  return byName(branchName) ?? byName(HQ_BRANCH) ?? (list[0]?.id ?? null);
}

/** Look up the organization id for a signed-in user (by their auth user id). */
export async function orgIdForAuthUser(
  admin: SupabaseClient,
  authUserId: string
): Promise<string | null> {
  const { data } = await admin
    .from("staff")
    .select("organization_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return (data?.organization_id as string) ?? null;
}
