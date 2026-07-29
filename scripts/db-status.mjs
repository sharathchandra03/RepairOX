// Shows the current state of your Supabase setup. Run:  npm run db:status
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

console.log("OWNER_EMAIL in env :", env.OWNER_EMAIL ?? "(not set — will use abc@gmail.com)");
console.log("OWNER_PASSWORD set :", env.OWNER_PASSWORD ? "yes" : "no (will use repairox123)");
console.log("");

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: usersData, error: uErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (uErr) console.error("listUsers error:", uErr.message);
else {
  console.log(`AUTH USERS (${usersData.users.length}):`);
  for (const u of usersData.users) {
    console.log(`  - ${u.email}   banned=${u.banned_until ? "yes" : "no"}  confirmed=${!!u.email_confirmed_at}`);
  }
}
console.log("");

const { data: roles, error: rErr } = await admin.from("roles").select("id");
if (rErr) console.log("ROLES TABLE  : NOT FOUND  ->  run supabase/schema.sql in the SQL Editor");
else console.log(`ROLES TABLE  : ${roles.length} roles seeded`);

const { data: staff, error: sErr } = await admin.from("staff").select("email,role_id,login_enabled,status");
if (sErr) console.log("STAFF TABLE  : NOT FOUND  ->  run supabase/schema.sql in the SQL Editor");
else {
  console.log(`STAFF ROWS   : ${staff.length}`);
  for (const s of staff) console.log(`  - ${s.email}  role=${s.role_id}  login=${s.login_enabled}  status=${s.status}`);
}
