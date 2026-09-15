// ============================================================================
// RepairOX — versioned migration runner (CLI-free, pg-based).
//
//   node scripts/migrate.mjs status                 # applied vs pending
//   node scripts/migrate.mjs up                      # apply all pending migrations
//   node scripts/migrate.mjs up --dry-run            # print what WOULD run
//   node scripts/migrate.mjs baseline 0020_multi_store.sql
//                                                    # record base migrations as
//                                                    # already-applied WITHOUT running
//                                                    # them (adopt on an existing DB)
//
// This is the source-controlled migration mechanism that replaces manual
// copy/paste into the Supabase SQL Editor. It:
//   • reads ordered SQL files from supabase/migrations/ (NNNN_name.sql)
//   • records applied migrations in a public.schema_migrations ledger
//   • runs each migration inside a single transaction (all-or-nothing)
//   • is idempotent at the ledger level (never re-applies a recorded migration)
//
// It works today WITHOUT the Supabase CLI, using a direct Postgres connection
// (SUPABASE_DB_URL / DATABASE_URL from .env.local). When the CLI is later
// installed and the project linked, `supabase db push` reads the SAME files.
//
// SECURITY: never prints connection strings, passwords, or keys.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

const ROOT = process.cwd();
const env = { ...parseEnv(path.resolve(ROOT, ".env.local")), ...process.env };
const MIGRATIONS_DIR = path.resolve(ROOT, "supabase/migrations");

const cmd = process.argv[2] || "status";
const dryRun = process.argv.includes("--dry-run");

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const full = path.join(MIGRATIONS_DIR, f);
      const sql = fs.readFileSync(full, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex").slice(0, 16);
      return { name: f, full, sql, checksum };
    });
}

async function getClient() {
  const conn = env.SUPABASE_DB_URL || env.DATABASE_URL || env.POSTGRES_URL || null;
  if (!conn) {
    console.error(
      "\nNo database connection string found.\n" +
      "  Add SUPABASE_DB_URL to .env.local (Supabase → Project Settings → Database →\n" +
      "  Connection string → URI). Migrations were NOT applied.\n"
    );
    return null;
  }
  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("The `pg` package is not installed. Run `npm i pg` then retry.");
    return null;
  }
  const { Client } = pg.default ?? pg;
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function ensureLedger(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    );
  `);
}

async function appliedSet(client) {
  const { rows } = await client.query("select name, checksum from public.schema_migrations;");
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

async function run() {
  const migrations = listMigrations();
  if (migrations.length === 0) {
    console.log("No migrations found in supabase/migrations/.");
    return 0;
  }

  const client = await getClient();
  if (!client) return cmd === "status" ? 0 : 2;

  try {
    await ensureLedger(client);
    const applied = await appliedSet(client);

    if (cmd === "status") {
      console.log(`\nMigrations (${migrations.length}) — ledger: public.schema_migrations\n`);
      for (const m of migrations) {
        const state = applied.has(m.name)
          ? applied.get(m.name) === m.checksum
            ? "APPLIED "
            : "CHANGED*"
          : "PENDING ";
        console.log(`  ${state}  ${m.name}`);
      }
      const pending = migrations.filter((m) => !applied.has(m.name));
      console.log(`\n${pending.length} pending, ${applied.size} applied.`);
      if (migrations.some((m) => applied.has(m.name) && applied.get(m.name) !== m.checksum)) {
        console.log(
          "\n* CHANGED = an already-applied migration file was edited after apply.\n" +
          "  Migrations should be append-only. Create a NEW migration to change the schema."
        );
      }
      return 0;
    }

    // baseline <upToName>: record migrations up to and including <upToName> as
    // already-applied WITHOUT executing them. Used ONCE when adopting this
    // migration system on a database whose schema already exists (so the base
    // migrations that reconstruct the current live schema are not re-run).
    if (cmd === "baseline") {
      const upTo = process.argv[3];
      if (!upTo) {
        console.error('Usage: migrate.mjs baseline <migration-name>  (e.g. 0020_multi_store.sql)');
        return 2;
      }
      const idx = migrations.findIndex((m) => m.name === upTo || m.name.startsWith(upTo));
      if (idx === -1) {
        console.error(`No migration matches "${upTo}".`);
        return 2;
      }
      // Optional: --skip=a.sql,b.sql to leave specific migrations PENDING even
      // though they fall within the baseline range (e.g. a migration whose
      // objects are not yet present in the existing DB and must actually run).
      const skipArg = process.argv.find((a) => a.startsWith("--skip="));
      const skip = new Set(
        skipArg ? skipArg.slice("--skip=".length).split(",").map((s) => s.trim()).filter(Boolean) : []
      );
      const toMark = migrations
        .slice(0, idx + 1)
        .filter((m) => !applied.has(m.name) && !skip.has(m.name));
      if (toMark.length === 0) {
        console.log("Nothing to baseline — all target migrations already recorded.");
        return 0;
      }
      if (dryRun) {
        console.log(`[dry-run] would record ${toMark.length} migration(s) as applied (no SQL run):`);
        for (const m of toMark) console.log(`  ${m.name}`);
        return 0;
      }
      for (const m of toMark) {
        await client.query(
          "insert into public.schema_migrations(name, checksum) values ($1,$2) on conflict (name) do nothing",
          [m.name, m.checksum]
        );
        console.log(`  recorded (not executed)  ${m.name}`);
      }
      console.log(`\nBaselined ${toMark.length} migration(s). Run \`migrate.mjs up\` to apply the rest.`);
      return 0;
    }

    // verify: execute each pending migration inside a transaction that is
    // ALWAYS rolled back. Confirms the SQL runs cleanly against the real DB
    // without committing any change. Safe on production.
    if (cmd === "verify") {
      const pending = migrations.filter((m) => !applied.has(m.name));
      if (pending.length === 0) {
        console.log("Nothing pending to verify.");
        return 0;
      }
      console.log(`Verifying ${pending.length} pending migration(s) (each rolled back):\n`);
      let failed = 0;
      for (const m of pending) {
        process.stdout.write(`  verify  ${m.name} … `);
        try {
          await client.query("begin");
          await client.query(m.sql);
          await client.query("rollback");
          console.log("ok (rolled back)");
        } catch (e) {
          await client.query("rollback").catch(() => {});
          failed += 1;
          console.log("FAILED");
          console.error(`      ${e?.message ?? String(e)}`);
        }
      }
      console.log(`\n${failed === 0 ? "All pending migrations execute cleanly." : failed + " migration(s) failed verification."}`);
      return failed === 0 ? 0 : 1;
    }

    if (cmd !== "up") {
      console.error(`Unknown command "${cmd}". Use: status | up [--dry-run] | verify | baseline <name> [--dry-run] [--skip=a,b]`);
      return 2;
    }

    const pending = migrations.filter((m) => !applied.has(m.name));
    if (pending.length === 0) {
      console.log("Nothing to do — all migrations already applied.");
      return 0;
    }

    console.log(`${dryRun ? "[dry-run] " : ""}Applying ${pending.length} migration(s):\n`);
    for (const m of pending) {
      if (dryRun) {
        console.log(`  would apply  ${m.name}  (${m.sql.length} bytes)`);
        continue;
      }
      process.stdout.write(`  applying  ${m.name} … `);
      try {
        await client.query("begin");
        await client.query(m.sql);
        await client.query(
          "insert into public.schema_migrations(name, checksum) values ($1, $2)",
          [m.name, m.checksum]
        );
        await client.query("commit");
        console.log("ok");
      } catch (e) {
        await client.query("rollback").catch(() => {});
        console.log("FAILED");
        console.error(`\n  ${m.name} failed and was rolled back:\n  ${e?.message ?? String(e)}\n`);
        return 1;
      }
    }
    console.log(`\n${dryRun ? "[dry-run] no changes made." : "Done."}`);
    return 0;
  } finally {
    await client.end();
  }
}

process.exit(await run());
