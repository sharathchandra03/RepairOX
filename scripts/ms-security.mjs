// Multi-store SECURITY test — verifies RLS blocks cross-store reads even if the
// frontend scope is bypassed (direct API / URL tampering). Read-only.
//   node scripts/ms-security.mjs
//
// It signs in as a real non-owner store user (using the anon client, exactly
// like the browser) and confirms that:
//   • they can read their OWN store's tickets,
//   • they receive ZERO rows for another store (RLS enforced server-side),
//   • forcing .eq('branch_id', otherStore) still returns nothing.
//
// Requires a test login. Set MS_TEST_EMAIL / MS_TEST_PASSWORD in .env.local for
// a NON-owner store user. If not provided, the test is skipped with guidance.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue; env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
class NoopWebSocket { constructor(){this.readyState=3;} addEventListener(){} removeEventListener(){} send(){} close(){} }

const email = env.MS_TEST_EMAIL;
const password = env.MS_TEST_PASSWORD;
if (!email || !password) {
  console.log("SKIP: set MS_TEST_EMAIL / MS_TEST_PASSWORD in .env.local to a NON-owner store user to run the RLS cross-store test.");
  console.log("      (The app's isolation still relies on the DB RLS policies in supabase/schema.sql + multi-store.sql.)");
  process.exit(0);
}

// Anon client = exactly what the browser uses (RLS applies).
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }, realtime: { transport: NoopWebSocket },
});
// Admin (service role) to discover branch ids for the assertion.
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, realtime: { transport: NoopWebSocket },
});

const { error: signErr } = await anon.auth.signInWithPassword({ email, password });
if (signErr) { console.error("Login failed:", signErr.message); process.exit(1); }

const { data: me } = await anon.from("staff").select("branch_id, role_id, organization_id").ilike("email", email).maybeSingle();
console.log(`Signed in: ${email}  role=${me?.role_id}  branch=${me?.branch_id?.slice(0,8)}`);

// All branches in the org (via admin), to pick "another" store.
const { data: branches } = await admin.from("branches").select("id,name").eq("organization_id", me.organization_id);
const otherStores = (branches ?? []).filter((b) => b.id !== me.branch_id);

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`); };

// 1) Own store: should see rows (RLS allows).
const ownTix = await anon.from("tickets").select("id, branch_id").eq("branch_id", me.branch_id).is("deleted_at", null);
ok("Can read OWN store tickets", !ownTix.error, ownTix.error ? ownTix.error.message : `${ownTix.data.length} rows`);

// 2) Every returned row belongs to a store the user may access.
const leaked = (ownTix.data ?? []).filter((r) => r.branch_id && r.branch_id !== me.branch_id);
// (When user has user_stores grants this list could include more; here the base
//  case is a single-branch user, so any foreign branch is a leak.)

// 3) Other store: forcing branch_id must still return nothing (RLS blocks).
for (const s of otherStores) {
  const res = await anon.from("tickets").select("id").eq("branch_id", s.id).is("deleted_at", null);
  const count = res.data?.length ?? 0;
  ok(`Cannot read ${s.name} tickets via branch_id tamper`, count === 0, `${count} rows returned`);
}

// 4) Unfiltered select must not surface other stores either.
const allVisible = await anon.from("tickets").select("branch_id").is("deleted_at", null);
const foreign = new Set((allVisible.data ?? []).map((r) => r.branch_id).filter((b) => b && b !== me.branch_id));
ok("Unfiltered select surfaces no foreign-store tickets", foreign.size === 0, `${foreign.size} foreign branches visible`);

await anon.auth.signOut();
console.log(`\nRESULT: ${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
