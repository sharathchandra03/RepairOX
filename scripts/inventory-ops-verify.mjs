// Inventory operations + price-list link verification (DB layer, always rolled back).
//   node scripts/inventory-ops-verify.mjs
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
  const mkRole = async (id, keys) => {
    await sys(`insert into roles (id, label, is_custom) values ($1, $1, true) on conflict (id) do nothing`, [id]);
    for (const k of keys) await sys(`insert into role_permissions (role_id, permission_key) values ($1, $2) on conflict do nothing`, [id, k]);
    return id;
  };
  const tag = crypto.randomUUID().slice(0, 6);
  const mgrRole = await mkRole(`invops-mgr-${tag}`, ["manage_inventory", "manage_purchases"]);
  const viewRole = await mkRole(`invops-view-${tag}`, ["view_inventory"]);
  const salesRole = await mkRole(`invops-sales-${tag}`, ["manage_repair_jobs"]);
  const mkUser = async (name, roleId) => {
    const authId = crypto.randomUUID();
    const email = `invops-${authId.slice(0, 8)}@example.test`;
    await sys(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)`, [authId, email]);
    await sys(`insert into staff (auth_user_id, organization_id, branch_id, name, email, role_id, status, login_enabled)
       values ($1, $2, $3, $4, $5, $6, 'active', true)`, [authId, org.id, store.id, name, email, roleId]);
    return authId;
  };
  const mgr = await mkUser("T Mgr", mgrRole);
  const viewer = await mkUser("T Viewer", viewRole);
  const sales = await mkUser("T Sales", salesRole);

  section("Documents: cost-bearing docs are purchasing-only");
  const ins = (uid, id, type) => tryAs(uid, `insert into inventory_docs (id, doc_type, status, lines) values ($1, $2, 'draft', '[{"itemId":"X","qty":1,"unitCost":50}]') returning id`, [id, type]);
  const poId = `PO-T${tag}`;
  ok("Manager can create a purchase order", !(await ins(mgr, poId, "purchase_order")).error);
  ok("Viewer CANNOT create a purchase order", !!(await ins(viewer, `PO-V${tag}`, "purchase_order")).error);
  ok("Viewer CANNOT read purchase orders (cost)", (await tryAs(viewer, `select id from inventory_docs where id = $1`, [poId])).rows.length === 0);
  ok("Sales CANNOT read purchase orders", (await tryAs(sales, `select id from inventory_docs where id = $1`, [poId])).rows.length === 0);
  ok("Manager can read purchase orders", (await tryAs(mgr, `select id from inventory_docs where id = $1`, [poId])).rows.length === 1);
  await sys(`insert into inventory_docs (id, organization_id, doc_type, status, lines) values ($1, $2, 'transfer', 'requested', '[]')`, [`TRF-T${tag}`, org.id]);
  ok("Viewer can READ a quantity-only transfer", (await tryAs(viewer, `select id from inventory_docs where id = $1`, [`TRF-T${tag}`])).rows.length === 1);
  ok("Viewer CANNOT write a transfer", !!(await ins(viewer, `TRF-W${tag}`, "transfer")).error);
  ok("Sales CANNOT read a transfer", (await tryAs(sales, `select id from inventory_docs where id = $1`, [`TRF-T${tag}`])).rows.length === 0);
  ok("Vendors: manager reads, sales does not",
    !(await tryAs(mgr, `insert into inventory_vendors (id, name) values ($1, 'V') returning id`, [`VND-${tag}`])).error &&
    (await tryAs(sales, `select id from inventory_vendors`)).rows.length === 0);

  section("post_stock_adjust: atomic stock, layers and movement");
  const sku = `T-SKU-${tag}`;
  await sys(`insert into inventory_items (id, organization_id, branch_id, name, item_type, item_kind, active, current_stock, selling_price, min_stock)
             values ($1, $2, $3, 'Test Part', 'Product', 'part', true, 10, 500, 3)`, [sku, org.id, store.id]);
  const up = await tryAs(mgr, `select public.post_stock_adjust($1, 5, 'Test in', 'Adjustment', 40, $2) as d`, [sku, `ADJ-${tag}/1`]);
  ok("Manager can add stock", !up.error, up.error ?? "");
  ok("Balance moved 10 → 15", Number((await sys(`select current_stock from inventory_items where id = $1`, [sku]))[0].current_stock) === 15);
  ok("A cost layer was opened at 40", Number((await sys(`select unit_cost from inventory_stock_layers where item_id = $1`, [sku]))[0]?.unit_cost) === 40);
  const down = await tryAs(mgr, `select public.post_stock_adjust($1, -4, 'Test out', 'Adjustment', null, $2) as d`, [sku, `ADJ-${tag}/2`]);
  ok("Manager can remove stock", !down.error, down.error ?? "");
  ok("Balance 15 → 11", Number((await sys(`select current_stock from inventory_items where id = $1`, [sku]))[0].current_stock) === 11);
  ok("Over-removal is rejected", !!(await tryAs(mgr, `select public.post_stock_adjust($1, -999, 'x', 'Adjustment', null, null)`, [sku])).error);
  ok("Viewer cannot adjust stock", !!(await tryAs(viewer, `select public.post_stock_adjust($1, 1, 'x', 'Adjustment', null, null)`, [sku])).error);
  ok("Two movement rows were written", Number((await sys(`select count(*) c from stock_movements where item_id = $1`, [sku]))[0].c) === 2);

  section("Price List link trigger (migration 0118)");
  await sys(`insert into price_list_parts (id, organization_id, part_name, part_number, price, availability) values ($1, $2, 'Test display', $3, 100, 'In Stock')`, [`PLP-${tag}`, org.id, sku.toLowerCase()]);
  await sys(`update inventory_items set selling_price = 750 where id = $1`, [sku]);
  const [p1] = await sys(`select price, availability from price_list_parts where id = $1`, [`PLP-${tag}`]);
  ok("Selling price change reaches the Price List (case-insensitive SKU)", Number(p1.price) === 750, `price=${p1.price}`);
  await sys(`update inventory_items set current_stock = 2 where id = $1`, [sku]);
  ok("Stock at/below minimum → Limited", (await sys(`select availability from price_list_parts where id = $1`, [`PLP-${tag}`]))[0].availability === "Limited");
  await sys(`update inventory_items set current_stock = 0 where id = $1`, [sku]);
  ok("Zero stock → Out of Stock", (await sys(`select availability from price_list_parts where id = $1`, [`PLP-${tag}`]))[0].availability === "Out of Stock");
  await sys(`insert into price_list_parts (id, organization_id, part_name, part_number, price) values ($1, $2, 'Unlinked', 'NOT-A-SKU', 999)`, [`PLP-U${tag}`, org.id]);
  await sys(`update inventory_items set selling_price = 800 where id = $1`, [sku]);
  ok("An unlinked part is untouched", Number((await sys(`select price from price_list_parts where id = $1`, [`PLP-U${tag}`]))[0].price) === 999);
  ok("Sales cannot run the bulk sync RPC", !!(await tryAs(sales, `select public.sync_price_list_from_inventory()`)).error);
  ok("Manager can run the bulk sync RPC", !(await tryAs(mgr, `select public.sync_price_list_from_inventory()`)).error);

  section("Serials");
  await sys(`insert into inventory_serials (organization_id, item_id, serial) values ($1, $2, 'IMEI-1')`, [org.id, sku]);
  const dup = await (async () => { await client.query("savepoint s9"); try { await sys(`insert into inventory_serials (organization_id, item_id, serial) values ($1, $2, 'imei-1')`, [org.id, sku]); await client.query("release savepoint s9"); return null; } catch (e) { await client.query("rollback to savepoint s9"); return e.message; } })();
  ok("Duplicate serial (case-insensitive) is rejected", !!dup);
} catch (e) {
  fail++;
  console.error("\nUNEXPECTED ERROR:", e.message);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
console.log(`\n${pass} passed, ${fail} failed (all test data rolled back).`);
process.exit(fail > 0 ? 1 : 0);
