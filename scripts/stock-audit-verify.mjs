// Stock Audit permissions + workflow guard verification (DB layer, ALWAYS rolled back).
//   node scripts/stock-audit-verify.mjs
// Applies migration 0128 INSIDE the transaction (so it works before or after it is applied for real),
// then checks seeding, RLS, the transition guard, self-approval, high variance and the stock RPC as real users.
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
  const legacyMgr = await mkRole(`sa-legacy-mgr-${tag}`, ["manage_inventory"]);
  const legacyKeeper = await mkRole(`sa-legacy-keeper-${tag}`, ["adjust_stock", "view_inventory"]);
  const legacyView = await mkRole(`sa-legacy-view-${tag}`, ["view_inventory"]);
  const noneRole = await mkRole(`sa-none-${tag}`, ["manage_repair_jobs"]);
  await client.query(fs.readFileSync(path.resolve(ROOT, "supabase/migrations/0128_stock_audit.sql"), "utf8"));
  const starterRole = await mkRole(`sa-starter-${tag}`, ["stock_audit_view", "stock_audit_create"]);
  const counterRole = await mkRole(`sa-counter-${tag}`, ["stock_audit_view", "stock_audit_count"]);
  const counter2Role = await mkRole(`sa-counter2-${tag}`, ["stock_audit_view", "stock_audit_count"]);
  const reviewerRole = await mkRole(`sa-reviewer-${tag}`, ["stock_audit_view", "stock_audit_review"]);
  const approverRole = await mkRole(`sa-approver-${tag}`, ["stock_audit_view", "stock_audit_approve"]);
  const seniorRole = await mkRole(`sa-senior-${tag}`, ["stock_audit_view", "stock_audit_approve", "stock_audit_approve_high"]);
  const cancelRole = await mkRole(`sa-cancel-${tag}`, ["stock_audit_view", "stock_audit_cancel"]);
  const ownerRole = await mkRole(`sa-owner-${tag}`, ["full_access"]);
  const mkUser = async (name, roleId) => {
    const authId = crypto.randomUUID();
    const email = `sa-${authId.slice(0, 8)}@example.test`;
    await sys(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)`, [authId, email]);
    await sys(`insert into staff (auth_user_id, organization_id, branch_id, name, email, role_id, status, login_enabled)
       values ($1, $2, $3, $4, $5, $6, 'active', true)`, [authId, org.id, store.id, name, email, roleId]);
    return authId;
  };
  const starter = await mkUser("T Starter", starterRole);
  const counter = await mkUser("T Counter", counterRole);
  const counter2 = await mkUser("T Counter2", counter2Role);
  const reviewer = await mkUser("T Reviewer", reviewerRole);
  const approver = await mkUser("T Approver", approverRole);
  const senior = await mkUser("T Senior", seniorRole);
  const canceller = await mkUser("T Canceller", cancelRole);
  const owner = await mkUser("T Owner", ownerRole);
  const nobody = await mkUser("T None", noneRole);

  section("Seeding: existing inventory roles keep today's access");
  const has = async (role, key) => Number((await sys(`select count(*) c from role_permissions where role_id = $1 and permission_key = $2`, [role, key]))[0].c) === 1;
  ok("manage_inventory role got count + create + review + approve + export + see_system_qty", (await Promise.all(["count", "create", "review", "approve", "export", "view", "reports", "see_system_qty"].map((k) => has(legacyMgr, `stock_audit_${k}`)))).every(Boolean));
  ok("manage_inventory role did NOT get approve_high or cancel", !(await has(legacyMgr, "stock_audit_approve_high")) && !(await has(legacyMgr, "stock_audit_cancel")));
  ok("adjust_stock role got view + count but not approve / create", (await has(legacyKeeper, "stock_audit_count")) && (await has(legacyKeeper, "stock_audit_view")) && !(await has(legacyKeeper, "stock_audit_approve")) && !(await has(legacyKeeper, "stock_audit_create")));
  ok("view_inventory role got view only", (await has(legacyView, "stock_audit_view")) && !(await has(legacyView, "stock_audit_count")));
  ok("unrelated role got nothing", !(await has(noneRole, "stock_audit_view")));

  const sku = `T-SA-${tag}`, sku2 = `T-SB-${tag}`;
  for (const [id, stock] of [[sku, 100], [sku2, 20]]) {
    await sys(`insert into inventory_items (id, organization_id, branch_id, name, item_type, item_kind, active, current_stock, selling_price, min_stock)
               values ($1, $2, $3, 'SA Test Part', 'Product', 'part', true, $4, 500, 3)`, [id, org.id, store.id, stock]);
  }
  const L = (itemId, system, counted, reason) => ({ itemId, name: "SA Test Part", qty: 0, system, ...(counted === undefined ? {} : { counted }), ...(reason ? { reason } : {}) });
  const create = (uid, id, lines, data = {}, status = "draft") => tryAs(uid, `insert into inventory_docs (id, doc_type, status, party, lines, data) values ($1, 'stock_count', $2, 'Main', $3, $4) returning id`, [id, status, JSON.stringify(lines), JSON.stringify(data)]);
  const save = (uid, id, lines) => tryAs(uid, `update inventory_docs set lines = $2 where id = $1 returning id`, [id, JSON.stringify(lines)]);
  const move = (uid, id, to, lines) => tryAs(uid, lines ? `update inventory_docs set status = $2, lines = $3 where id = $1 returning status` : `update inventory_docs set status = $2 where id = $1 returning status`, lines ? [id, to, JSON.stringify(lines)] : [id, to]);

  section("Starting an audit");
  const a1 = `CNT-T${tag}1`;
  ok("Starter can start an audit", !(await create(starter, a1, [L(sku, 100), L(sku2, 20)])).error);
  ok("Counter (no create key) cannot start one", !!(await create(counter, `CNT-T${tag}x`, [L(sku, 100)])).error);
  ok("Unrelated role cannot start one", !!(await create(nobody, `CNT-T${tag}y`, [L(sku, 100)])).error);
  ok("An audit cannot start already submitted", !!(await create(starter, `CNT-T${tag}z`, [L(sku, 100)], {}, "submitted")).error);
  ok("Creator id is stamped by the server", (await sys(`select data->>'createdById' c, (select id::text from staff where auth_user_id = $2) s from inventory_docs where id = $1`, [a1, starter]))[0].c !== "");
  ok("Counter can read the audit (view key)", (await tryAs(counter, `select id from inventory_docs where id = $1`, [a1])).rows.length === 1);
  ok("Unrelated role cannot read it", (await tryAs(nobody, `select id from inventory_docs where id = $1`, [a1])).rows.length === 0);

  section("Counting");
  ok("Counter can enter counts", !(await save(counter, a1, [L(sku, 100, 100), L(sku2, 20)])).error);
  const stampedBy = (await sys(`select lines->0->>'countedById' c, (select id::text from staff where auth_user_id = $2) s from inventory_docs where id = $1`, [a1, counter]))[0];
  ok("The counter's id is stamped on the line by the server", !!stampedBy.c && stampedBy.c === stampedBy.s);
  ok("A counter cannot attribute a count to someone else", await (async () => {
    await save(counter2, a1, [{ ...L(sku, 100, 100), countedById: "forged" }, L(sku2, 20, 20)]);
    const r = (await sys(`select lines->0->>'countedById' c0, lines->1->>'countedById' c1 from inventory_docs where id = $1`, [a1]))[0];
    return r.c0 === stampedBy.c && r.c1 !== "forged" && r.c1 !== "";
  })());
  ok("Reviewer (no count key) cannot change counts", !!(await save(reviewer, a1, [L(sku, 100, 99)])).error);

  section("Submitting");
  const a2 = `CNT-T${tag}2`;
  await create(starter, a2, [L(sku, 100), L(sku2, 20)]);
  ok("Cannot submit with uncounted items", !!(await move(counter, a2, "submitted")).error);
  await save(counter, a2, [L(sku, 100, 98), L(sku2, 20, 20)]);
  ok("Cannot submit a difference without a reason", /reason_required/.test((await move(counter, a2, "submitted")).error ?? ""));
  ok("Counter can submit once counted with reasons", !(await move(counter, a2, "submitted", [L(sku, 100, 98, "Other"), L(sku2, 20, 20)])).error);
  ok("A submitted audit's counts are locked", !!(await save(counter, a2, [L(sku, 100, 100), L(sku2, 20, 20)])).error);
  const a3 = `CNT-T${tag}3`;
  await create(starter, a3, [L(sku, 100)], { blind: true });
  await save(counter, a3, [L(sku, 100, 98)]);
  ok("Blind audits need no reason from the counter", !(await move(counter, a3, "submitted")).error);

  section("Approval");
  ok("Counter cannot approve (no approve key)", !!(await move(counter, a2, "approved")).error);
  ok("Reviewer (no approve key) cannot approve", !!(await move(reviewer, a2, "approved")).error);
  ok("Counter who submitted cannot approve even with the key", await (async () => {
    const both = await mkUser("T CounterApprover", await mkRole(`sa-both-${tag}`, ["stock_audit_view", "stock_audit_count", "stock_audit_approve"]));
    const a = `CNT-T${tag}B`;
    await create(starter, a, [L(sku, 100)]);
    await save(both, a, [L(sku, 100, 99, "Other")]);
    await move(both, a, "submitted");
    return /self_approval/.test((await move(both, a, "approved")).error ?? "");
  })());
  ok("Approver can post the variance of a submitted audit", !(await tryAs(approver, `select public.post_stock_adjust($1, -2, 'Stock count', 'Adjustment', null, $2) as d`, [sku, `${a2}/1`])).error);
  ok("Balance moved 100 → 98", Number((await sys(`select current_stock from inventory_items where id = $1`, [sku]))[0].current_stock) === 98);
  ok("Approver cannot post stock for an audit still being counted", !!(await tryAs(approver, `select public.post_stock_adjust($1, -1, 'x', 'Adjustment', null, $2)`, [sku, `${a1}/1`])).error);
  ok("Approver cannot post stock for an unrelated doc number", !!(await tryAs(approver, `select public.post_stock_adjust($1, -1, 'x', 'Adjustment', null, $2)`, [sku, `CNT-NOPE-${tag}/1`])).error);
  ok("Approver can approve a normal-variance audit", !(await move(approver, a2, "approved")).error);
  ok("An approved audit is closed", !!(await move(approver, a2, "rejected")).error);
  ok("…and cannot be edited", !!(await save(counter, a2, [L(sku, 98, 1)])).error);

  section("High variance needs a senior approver");
  const a4 = `CNT-T${tag}4`;
  await create(starter, a4, [L(sku, 98)]);
  await save(counter, a4, [L(sku, 98, 80, "Lost or theft")]);
  await move(counter, a4, "submitted");
  ok("Plain approver cannot approve an 18-unit variance", /high_variance/.test((await move(approver, a4, "approved")).error ?? ""));
  ok("Senior approver can", !(await move(senior, a4, "approved")).error);

  section("Review, recount, reject, cancel");
  const a5 = `CNT-T${tag}5`;
  await create(starter, a5, [L(sku2, 20)]); await save(counter, a5, [L(sku2, 20, 19, "Other")]); await move(counter, a5, "submitted");
  ok("Counter cannot request a recount", !!(await move(counter, a5, "draft")).error);
  ok("Reviewer can request a recount (back to counting)", !(await move(reviewer, a5, "draft", [{ ...L(sku2, 20), recount: true }])).error);
  ok("Counter can count again", !(await save(counter2, a5, [L(sku2, 20, 20)])).error);
  ok("…and submit again", !(await move(counter2, a5, "submitted")).error);
  ok("Reviewer can reject", !(await move(reviewer, a5, "rejected")).error);
  const a6 = `CNT-T${tag}6`;
  await create(starter, a6, [L(sku2, 20)]);
  ok("Counter cannot cancel (no cancel key)", !!(await move(counter, a6, "cancelled")).error);
  ok("Canceller can cancel", !(await move(canceller, a6, "cancelled")).error);
  ok("A cancelled audit is closed", !!(await move(canceller, a6, "draft")).error);
  ok("Illegal jump draft → approved is refused", await (async () => { const a = `CNT-T${tag}7`; await create(starter, a, [L(sku2, 20, 20)]); return !!(await move(approver, a, "approved")).error; })());

  section("Owner may approve their own count (flagged)");
  const a8 = `CNT-T${tag}8`;
  await create(owner, a8, [L(sku2, 20)]); await save(owner, a8, [L(sku2, 20, 19, "Other")]); await move(owner, a8, "submitted");
  ok("Owner approves own count", !(await move(owner, a8, "approved")).error);
  ok("…and it is flagged as self-reviewed", (await sys(`select data->>'selfReviewed' f from inventory_docs where id = $1`, [a8]))[0].f === "true");

  section("Existing inventory roles keep working");
  const mgr = await mkUser("T Mgr", legacyMgr);
  const keeper = await mkUser("T Keeper", legacyKeeper);
  ok("manage_inventory role can still start an audit", !(await create(mgr, `CNT-M${tag}`, [L(sku2, 20)])).error);
  ok("adjust_stock role can still count", !(await save(keeper, `CNT-M${tag}`, [L(sku2, 20, 20)])).error);
  ok("adjust_stock role still cannot start one", !!(await create(keeper, `CNT-K${tag}`, [L(sku2, 20)])).error);
} catch (e) {
  fail++;
  console.log("  ERROR ", e.message);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
  console.log(`\n${pass} passed, ${fail} failed (all changes rolled back)`);
  process.exit(fail ? 1 : 0);
}
