// Apply the multi-store migration (supabase/multi-store.sql).
//
//   npm run ms:migrate
//
// The migration is DDL (create table / functions / policies), which the
// Supabase JS client (PostgREST) cannot execute. This script tries, in order:
//
//   1. A direct Postgres connection using SUPABASE_DB_URL or DATABASE_URL from
//      .env.local (requires the `pg` package). This fully applies the file.
//   2. If no connection string / pg is available, it prints the SQL path and
//      the exact one-click steps to run it in the Supabase SQL Editor.
//
// The file is idempotent and backfill-safe — re-running it is harmless.
import fs from "node:fs";
import path from "node:path";

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = { ...parseEnv(path.resolve(process.cwd(), ".env.local")), ...process.env };
const sqlPath = path.resolve(process.cwd(), "supabase/multi-store.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const connStr = env.SUPABASE_DB_URL || env.DATABASE_URL || env.POSTGRES_URL || null;

async function applyViaPg(conn) {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    return { ok: false, reason: "no-pg" };
  }
  const { Client } = pg.default ?? pg;
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    return { ok: true };
  } finally {
    await client.end();
  }
}

function printManualInstructions() {
  console.log("");
  console.log("Multi-store migration is ready but must be applied to Postgres directly.");
  console.log("The Supabase JS client cannot run DDL (create table / functions / policies).");
  console.log("");
  console.log("Option A — Supabase SQL Editor (30 seconds, recommended):");
  console.log("  1. Open your Supabase project → SQL Editor → New query");
  console.log(`  2. Paste the contents of:  ${sqlPath}`);
  console.log("  3. Click Run. (The file is idempotent — safe to re-run.)");
  console.log("");
  console.log("Option B — automatic apply via this script:");
  console.log("  1. Add your Postgres connection string to .env.local as SUPABASE_DB_URL");
  console.log("     (Supabase → Project Settings → Database → Connection string → URI).");
  console.log("  2. npm i pg  (one-time)");
  console.log("  3. npm run ms:migrate");
  console.log("");
  console.log("The app runs correctly WITHOUT this migration (it degrades gracefully);");
  console.log("applying it enables multi-store user grants (user_stores) and per-store");
  console.log("settings (branch_settings).");
}

if (!connStr) {
  printManualInstructions();
  process.exit(0);
}

console.log("Applying supabase/multi-store.sql via direct Postgres connection…");
try {
  const res = await applyViaPg(connStr);
  if (res.ok) {
    console.log("✓ Multi-store migration applied successfully.");
    console.log("  Run `npm run ms:verify` to confirm the new tables are present.");
    process.exit(0);
  }
  if (res.reason === "no-pg") {
    console.error("The `pg` package is not installed. Run `npm i pg` then retry, or use Option A.");
    printManualInstructions();
    process.exit(1);
  }
} catch (e) {
  console.error("Migration failed:", e?.message ?? String(e));
  printManualInstructions();
  process.exit(1);
}
