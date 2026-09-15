// Read-only live-schema inspection for drift auditing.
//
//   node scripts/db-inspect.mjs
//
// Connects via SUPABASE_DB_URL / DATABASE_URL from .env.local using `pg` and
// prints a compact snapshot of the live schema: tables, per-table column count,
// RLS-enabled flag, policy count, function list, publication membership, and a
// focused check on the tables this audit cares about. It NEVER prints secrets
// and performs NO writes.
import fs from "node:fs";
import path from "node:path";

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = { ...parseEnv(path.resolve(process.cwd(), ".env.local")), ...process.env };
const conn = env.SUPABASE_DB_URL || env.DATABASE_URL || env.POSTGRES_URL || null;

if (!conn) {
  console.error("No SUPABASE_DB_URL / DATABASE_URL in .env.local — cannot inspect the live DB.");
  process.exit(2);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error("The `pg` package is not installed. Run `npm i pg` then retry.");
  process.exit(2);
}

const { Client } = pg.default ?? pg;
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (e) {
  console.error("Could not connect to the database:", e?.message ?? String(e));
  process.exit(1);
}

const q = (sql, params) => client.query(sql, params);

try {
  const tables = await q(`
    select c.relname as table,
           c.relrowsecurity as rls,
           (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
           (select count(*) from information_schema.columns col where col.table_schema='public' and col.table_name=c.relname) as columns
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
    order by c.relname;
  `);

  console.log(`\nLIVE DATABASE — ${tables.rowCount} tables in public schema\n`);
  console.log("table".padEnd(28), "cols".padStart(4), "rls".padStart(5), "pols".padStart(5));
  console.log("-".repeat(46));
  for (const r of tables.rows) {
    console.log(
      String(r.table).padEnd(28),
      String(r.columns).padStart(4),
      String(r.rls).padStart(5),
      String(r.policies).padStart(5)
    );
  }

  const fns = await q(`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' order by p.proname;
  `);
  console.log(`\nFUNCTIONS (${fns.rowCount}):`, fns.rows.map((r) => r.proname).join(", "));

  const pub = await q(`
    select tablename from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' order by tablename;
  `).catch(() => ({ rows: [] }));
  console.log(`\nREALTIME PUBLICATION (${pub.rows.length}):`, pub.rows.map((r) => r.tablename).join(", ") || "(none)");

  // Focused drift checks on the audit's tables of interest.
  const interest = [
    "organizations", "branches", "staff", "tickets", "invoices", "walk_ins",
    "inventory_items", "stock_movements", "customers", "leads", "field_jobs",
    "quotations", "expenses", "user_stores", "branch_settings", "notifications",
  ];
  const present = new Set(tables.rows.map((r) => r.table));
  console.log("\nAUDIT TABLES OF INTEREST:");
  for (const t of interest) {
    console.log(`  ${present.has(t) ? "PRESENT " : "MISSING "} ${t}`);
  }

  // field_jobs RLS policy detail (the critical finding).
  if (present.has("field_jobs")) {
    const pol = await q(`select policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='field_jobs';`);
    console.log("\nfield_jobs policies:");
    for (const p of pol.rows) console.log(`  ${p.policyname} [${p.cmd}] using=(${p.qual}) check=(${p.with_check})`);
    const cols = await q(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='field_jobs' and column_name in ('organization_id','branch_id') order by column_name;`);
    console.log("  key columns:", cols.rows.map((c) => `${c.column_name}:${c.data_type}`).join(", ") || "(none)");
  }
} finally {
  await client.end();
}
