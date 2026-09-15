// ============================================================================
// RepairOX — per-store data inspector (READ-ONLY).
//
//   node scripts/store-data.mjs            → summary: row counts per store
//   node scripts/store-data.mjs notes      → list notes with store + owner
//   node scripts/store-data.mjs <table>    → per-store counts for one table
//
// Uses SUPABASE_DB_URL from .env.local via `pg`. Never writes, never prints
// secrets. This is the quick way to confirm data is being stored per store
// (branch_id) and to spot rows that landed under "All Shops" (branch_id NULL).
// ============================================================================
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
  console.error("No SUPABASE_DB_URL in .env.local — cannot connect.");
  process.exit(2);
}

let pg;
try { pg = await import("pg"); } catch {
  console.error("The `pg` package is not installed. Run `npm i pg`.");
  process.exit(2);
}
const { Client } = pg.default ?? pg;
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();

// Business tables that carry branch_id (i.e. are store-scoped).
const STORE_TABLES = [
  "tickets", "invoices", "walk_ins", "inventory_items", "stock_movements",
  "notes", "audit_log", "field_jobs", "expenses", "leads",
];

const arg = (process.argv[2] || "").toLowerCase();

try {
  // Always print the store list first.
  const { rows: branches } = await client.query(
    "select id, name, code from public.branches order by created_at"
  );
  console.log("\nSTORES (branches):");
  for (const b of branches) console.log(`  ${b.name.padEnd(18)} code=${b.code ?? "-"}  id=${b.id}`);

  if (arg === "notes") {
    const { rows } = await client.query(`
      select coalesce(b.name,'(All Shops / null)') store,
             coalesce(s.name,'(unknown)') owner,
             coalesce(nullif(n.title,''),'(untitled)') title,
             n.created_at
      from public.notes n
      left join public.branches b on b.id = n.branch_id
      left join public.staff s on s.id = n.owner_staff_id
      order by n.created_at desc
      limit 100;`);
    console.log(`\nNOTES (${rows.length}):`);
    if (rows.length === 0) console.log("  (no notes stored yet)");
    for (const r of rows) console.log(`  [${r.store}]  owner=${r.owner}  “${r.title}”`);
  } else if (arg && STORE_TABLES.includes(arg)) {
    const { rows } = await client.query(`
      select coalesce(b.name,'(All Shops / null)') store, count(*)::int n
      from public.${arg} t
      left join public.branches b on b.id = t.branch_id
      group by 1 order by n desc;`);
    console.log(`\n${arg.toUpperCase()} rows per store:`);
    for (const r of rows) console.log(`  ${String(r.n).padStart(5)}  ${r.store}`);
  } else {
    // Summary across all store tables.
    console.log("\nROW COUNTS PER STORE (branch_id):");
    for (const tbl of STORE_TABLES) {
      try {
        const { rows } = await client.query(`
          select coalesce(b.name,'(null=All Shops)') store, count(*)::int n
          from public.${tbl} t
          left join public.branches b on b.id = t.branch_id
          group by 1 order by n desc;`);
        const parts = rows.map((r) => `${r.store}:${r.n}`).join("  ");
        console.log(`  ${tbl.padEnd(16)} ${parts || "(empty)"}`);
      } catch (e) {
        console.log(`  ${tbl.padEnd(16)} (skipped: ${e.message})`);
      }
    }
    console.log("\nTip: `node scripts/store-data.mjs notes` to list notes,");
    console.log("     `node scripts/store-data.mjs tickets` for one table's per-store counts.");
  }
} finally {
  await client.end();
}
