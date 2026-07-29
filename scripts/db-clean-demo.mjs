// Removes the seeded DEMO staff (the @repairox.in accounts) + their logins,
// keeping your real owner and any staff you created. Run:  npm run db:clean
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// The demo accounts all use the @repairox.in domain. Your real owner
// (e.g. owner@gmail.com) and anyone you added is left untouched.
const DEMO_DOMAIN = "@repairox.in";

const { data: staff, error } = await admin
  .from("staff")
  .select("id, email, auth_user_id, name")
  .ilike("email", `%${DEMO_DOMAIN}`);

if (error) {
  console.error("Could not read staff:", error.message, "\nHave you applied supabase/schema.sql?");
  process.exit(1);
}

if (!staff || staff.length === 0) {
  console.log("No demo staff found. Nothing to clean.");
  process.exit(0);
}

let removed = 0;
for (const s of staff) {
  await admin.from("staff").delete().eq("id", s.id);
  if (s.auth_user_id) await admin.auth.admin.deleteUser(s.auth_user_id).catch(() => {});
  console.log(`  removed ${s.name} <${s.email}>`);
  removed++;
}

// Also delete any lingering demo auth users without a staff row.
const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
for (const u of users?.users ?? []) {
  if (u.email && u.email.toLowerCase().endsWith(DEMO_DOMAIN)) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
}

console.log(`\nDone. Removed ${removed} demo staff. Your owner + real staff are untouched.`);
