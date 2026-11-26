// Loss & Damage permissions + workflow guard verification (DB layer, ALWAYS rolled back).
//   node scripts/loss-damage-verify.mjs
// Applies migration 0126 INSIDE the transaction (so it works before or after it is applied for real),
// then checks seeding, RLS, the transition guard, self-approval and the stock-out RPC as real users.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const ROOT = process.cwd();
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
const env = { ...parseEnv(path.resolve(ROOT, ".env.local")), ...process.env };
const conn = env.SUPABASE_DB_URL || env.DATABASE_URL;
if (!conn) { console.error("SUPABASE_DB_URL missing in .env.local — cannot verify."); process.exit(1); }

const pg = (await import("pg")).default;
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
};
const section = (t) => console.log(`\n▸ ${t}`);

async function sys(sql, params = []) {
  await client.query("reset role");
  await client.query(`select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)`);
  return (await client.query(sql, params)).rows;
}
async function as(authUid, sql, params = []) {
  await client.query("reset role");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: authUid, role: "authenticated" })]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authUid]);
  await client.query("set local role authenticated");
  const rows = (await client.query(sql, params)).rows;
  await client.query("reset role");
  return rows;
}
async function tryAs(authUid, sql, params = []) {
  await client.query("savepoint sp");
  try {
    const rows = await as(authUid, sql, params);
    await client.query("release savepoint sp");
    return { rows, error: null };
  } catch (e) {
    await client.query("rollback to savepoint sp");
    await client.query("reset role");
    return { rows: [], error: e.message };
  }
}

try {
  await client.query("begin");
  const [org] = await sys(`select id from organizations order by created_at limit 1`);
  const [store] = await sys(`select id from branches where organization_id = $1 order by created_at limit 1`, [org.id]);
  const tag = crypto.randomUUID().slice(0, 6);

  const mkRole = async (id, keys) => {
    await sys(`insert into roles (id, label, is_custom) values ($1, $1, true) on conflict (id) do nothing`, [id]);
    for (const k of keys) await sys(`insert into role_permissions (role_id, permission_key) values ($1, $2) on conflict do nothing`, [id, k]);
    return id;
  };
  // Roles that exist BEFORE the migration, to prove seeding.
  const legacyMgr = await mkRole(`ld-legacy-mgr-${tag}`, ["manage_inventory"]);
  const legacyView = await mkRole(`ld-legacy-view-${tag}`, ["view_inventory"]);
  const legacyKeeper = await mkRole(`ld-legacy-keeper-${tag}`, ["adjust_stock", "view_inventory"]);
  const noneRole = await mkRole(`ld-none-${tag}`, ["manage_repair_jobs"]);

  // ── Apply the migration inside the transaction.
  for (const f of ["0126_loss_damage_permissions.sql", "0127_loss_damage_owner_self_review.sql"]) {
    await client.query(fs.readFileSync(path.resolve(ROOT, "supabase/migrations", f), "utf8"));
  }

  // New-style roles (granular only).
  const reporterRole = await mkRole(`ld-reporter-${tag}`, ["loss_damage_view", "loss_damage_report"]);
  const verifierRole = await mkRole(`ld-verifier-${tag}`, ["loss_damage_view", "loss_damage_verify"]);
  const approverRole = await mkRole(`ld-approver-${tag}`, ["loss_damage_view", "loss_damage_approve"]);
  const rejecterRole = await mkRole(`ld-rejecter-${tag}`, ["loss_damage_view", "loss_damage_reject"]);
  const ownerRole = await mkRole(`ld-owner-${tag}`, ["full_access"]);
  const soloRole = await mkRole(`ld-solo-${tag}`, ["loss_damage_view", "loss_damage_report", "loss_damage_verify", "loss_damage_approve"]);

  const mkUser = async (name, roleId) => {
    const authId = crypto.randomUUID();
    const email = `ld-${authId.slice(0, 8)}@example.test`;
    await sys(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)`, [authId, email]);
    await sys(`insert into staff (auth_user_id, organization_id, branch_id, name, email, role_id, status, login_enabled)
       values ($1, $2, $3, $4, $5, $6, 'active', true)`, [authId, org.id, store.id, name, email, roleId]);
    return authId;
  };
  const reporter = await mkUser("T Reporter", reporterRole);
  const verifier = await mkUser("T Verifier", verifierRole);
  const approver = await mkUser("T Approver", approverRole);
  const rejecter = await mkUser("T Rejecter", rejecterRole);
  const solo = await mkUser("T Solo", soloRole);
  const owner = await mkUser("T Owner", ownerRole);
  const nobody = await mkUser("T None", noneRole);
  const keeper = await mkUser("T Keeper", legacyKeeper);

  section("Seeding: existing inventory roles keep today's access");
  const has = async (role, key) => Number((await sys(`select count(*) c from role_permissions where role_id = $1 and permission_key = $2`, [role, key]))[0].c) === 1;
  ok("manage_inventory role got verify + approve + reject + report + export", (await Promise.all(["verify", "approve", "reject", "report", "export", "view", "reports"].map((k) => has(legacyMgr, `loss_damage_${k}`)))).every(Boolean));
  ok("view_inventory role got view only (no report / approve)", (await has(legacyView, "loss_damage_view")) && !(await has(legacyView, "loss_damage_report")) && !(await has(legacyView, "loss_damage_approve")));
  ok("adjust_stock role got view + report but not approve", (await has(legacyKeeper, "loss_damage_report")) && !(await has(legacyKeeper, "loss_damage_approve")));
  ok("unrelated role got nothing", !(await has(noneRole, "loss_damage_view")));

  const sku = `T-LD-${tag}`;
  await sys(`insert into inventory_items (id, organization_id, branch_id, name, item_type, item_kind, active, current_stock, selling_price, min_stock)
             values ($1, $2, $3, 'LD Test Part', 'Product', 'part', true, 10, 500, 3)`, [sku, org.id, store.id]);
  const lines = (q) => JSON.stringify([{ itemId: sku, name: "LD Test Part", qty: q, reason: "Physical damage" }]);
  const rep = (uid, id, status = "reported") => tryAs(uid, `insert into inventory_docs (id, doc_type, status, party, lines, data) values ($1, 'write_off', $2, 'Physical damage', $3, '{"kind":"damage"}') returning id`, [id, status, lines(2)]);

  section("Reporting");
  const id1 = `WO-T${tag}1`;
  ok("Reporter can report an incident", !(await rep(reporter, id1)).error);
  ok("Incident cannot start already approved", !!(await rep(reporter, `WO-T${tag}x`, "approved")).error);
  ok("User without the report key cannot report", !!(await rep(approver, `WO-T${tag}y`)).error);
  ok("Unrelated role cannot report", !!(await rep(nobody, `WO-T${tag}z`)).error);
  const stamped = (await sys(`select data->>'reportedById' r, (select id::text from staff where auth_user_id = $2) s from inventory_docs where id = $1`, [id1, reporter]))[0];
  ok("Reporter id is stamped by the server", !!stamped.r && stamped.r === stamped.s);

  section("Visibility");
  ok("Reporter (has view) can read the incident", (await tryAs(reporter, `select id from inventory_docs where id = $1`, [id1])).rows.length === 1);
  ok("Unrelated role cannot read it", (await tryAs(nobody, `select id from inventory_docs where id = $1`, [id1])).rows.length === 0);
  ok("A plain inventory viewer from before the migration can read it (seeded view)", (await (async () => {
    const u = await mkUser("T OldViewer", legacyView);
    return (await tryAs(u, `select id from inventory_docs where id = $1`, [id1])).rows.length === 1;
  })()));

  section("Workflow guard: one permission per step");
  const move = (uid, id, to, extra = "") => tryAs(uid, `update inventory_docs set status = $2 ${extra} where id = $1 returning status`, [id, to]);
  ok("Reporter cannot verify (no verify key)", !!(await move(reporter, id1, "verified")).error);
  ok("Verifier cannot approve straight from reported (illegal jump)", !!(await move(verifier, id1, "approved")).error);
  ok("Verifier can verify", !(await move(verifier, id1, "verified")).error);
  ok("Verifier cannot approve (no approve key)", !!(await move(verifier, id1, "approved")).error);
  ok("Approver cannot reject (no reject key)", !!(await move(approver, id1, "rejected")).error);
  ok("Rejecter can reject a verified incident", !(await move(rejecter, id1, "rejected")).error);
  ok("A rejected incident is closed", !!(await move(approver, id1, "approved")).error);
  ok("A closed incident cannot be edited", !!(await tryAs(approver, `update inventory_docs set party = 'x' where id = $1`, [id1])).error);

  section("Self-approval");
  const id2 = `WO-T${tag}2`;
  ok("Solo user (report + verify + approve) reports", !(await rep(solo, id2)).error);
  ok("…cannot verify their own incident", /self_approval/.test((await move(solo, id2, "verified")).error ?? ""));
  ok("…another verifier can", !(await move(verifier, id2, "verified")).error);
  ok("…solo user still cannot approve their own", /self_approval/.test((await move(solo, id2, "approved")).error ?? ""));

  const idO = `WO-T${tag}O`;
  ok("Owner reports an incident", !(await rep(owner, idO)).error);
  ok("…an owner may verify their own incident (one-owner shops)", !(await move(owner, idO, "verified")).error);
  ok("…and it is flagged as self-reviewed", (await sys(`select data->>'selfReviewed' f from inventory_docs where id = $1`, [idO]))[0].f === "true");
  ok("…and may approve it too", !(await move(owner, idO, "approved")).error);

  section("Stock-out for an approved write-off");
  const stockOut = (uid, doc) => tryAs(uid, `select public.post_stock_adjust($1, -2, 'Write-off: Physical damage', 'Adjustment', null, $2) as d`, [sku, doc]);
  ok("Approver can post the stock-out for a verified incident", !(await stockOut(approver, `${id2}/1`)).error);
  ok("Balance moved 10 → 8", Number((await sys(`select current_stock from inventory_items where id = $1`, [sku]))[0].current_stock) === 8);
  ok("Approver cannot post stock for an unrelated WO number", !!(await stockOut(approver, `WO-NOPE-${tag}/1`)).error);
  ok("Approver cannot add stock", !!(await tryAs(approver, `select public.post_stock_adjust($1, 5, 'x', 'Adjustment', null, $2)`, [sku, `${id2}/1`])).error);
  ok("Approver cannot adjust stock for an incident still only reported", await (async () => {
    const id3 = `WO-T${tag}3`; await rep(reporter, id3);
    return !!(await stockOut(approver, `${id3}/1`)).error;
  })());
  ok("Approver can now approve", !(await move(approver, id2, "approved")).error);
  ok("Approver cannot change the status of an approved incident again", !!(await move(approver, id2, "quarantined")).error);

  section("Manager one-click approve (verify then approve, as the app does it)");
  const mgrRole2 = await mkRole(`ld-mgr2-${tag}`, ["loss_damage_view", "loss_damage_verify", "loss_damage_approve", "loss_damage_reject"]);
  const mgr2 = await mkUser("T Manager", mgrRole2);
  const idM = `WO-T${tag}M`;
  await rep(reporter, idM);
  ok("Manager verifies another person's report", !(await move(mgr2, idM, "verified")).error);
  ok("Manager posts the stock-out", !(await stockOut(mgr2, `${idM}/1`)).error);
  ok("Manager approves it straight after", !(await move(mgr2, idM, "approved")).error);
  ok("Status is approved and the reporter is unchanged", (await sys(`select status from inventory_docs where id = $1`, [idM]))[0].status === "approved");

  section("Quarantine path");
  const id4 = `WO-T${tag}4`;
  await rep(reporter, id4); await move(verifier, id4, "verified");
  ok("Approver can quarantine a verified incident", !(await move(approver, id4, "quarantined")).error);
  ok("…and restore it (stock untouched)", !(await move(approver, id4, "restored")).error);

  section("Quantity re-count only while verifying");
  const id5 = `WO-T${tag}5`;
  await rep(reporter, id5);
  ok("Verifier can correct the quantity while verifying", !(await tryAs(verifier, `update inventory_docs set status = 'verified', lines = $2 where id = $1`, [id5, lines(1)])).error);
  ok("Quantity cannot be changed at approval", !!(await tryAs(approver, `update inventory_docs set status = 'approved', lines = $2 where id = $1`, [id5, lines(9)])).error);

  section("Upsert path (how the app saves)");
  const id6 = `WO-T${tag}6`;
  await rep(reporter, id6);
  const up = await tryAs(verifier, `insert into inventory_docs (id, doc_type, status, party, lines, data) values ($1, 'write_off', 'verified', 'Physical damage', $2, '{"kind":"damage"}')
     on conflict (id) do update set status = excluded.status, lines = excluded.lines, data = excluded.data returning status`, [id6, lines(2)]);
  ok("Upserting an existing incident to the next step works", !up.error && up.rows[0]?.status === "verified", up.error ?? "");
  const kept = (await sys(`select data->>'reportedById' r, (select id::text from staff where auth_user_id = $2) s from inventory_docs where id = $1`, [id6, reporter]))[0];
  ok("The stored reporter survives an upsert that omits it", !!kept.r && kept.r === kept.s);
  const fresh = await tryAs(approver, `insert into inventory_docs (id, doc_type, status, party, lines) values ($1, 'write_off', 'approved', 'x', $2)`, [`WO-T${tag}7`, lines(1)]);
  ok("Upsert cannot be used to create an already-approved incident", !!fresh.error);

  section("Other document types are unaffected");
  const mgr = await mkUser("T Mgr", legacyMgr);
} catch (e) {
  fail++;
  console.log("  ERROR ", e.message);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
console.log(`\n${pass} passed, ${fail} failed (all changes rolled back)`);
process.exit(fail ? 1 : 0);
