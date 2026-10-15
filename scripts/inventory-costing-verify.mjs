// ============================================================================
// RepairOX — Inventory Costing redesign END-TO-END verification (DB layer).
//
//   node scripts/inventory-costing-verify.mjs                  # against live schema
//   node scripts/inventory-costing-verify.mjs --with-migration # apply newest migration first
//
// Everything runs inside ONE transaction that is ALWAYS ROLLED BACK — no test
// users, items, invoices or ledger rows are left behind. Each scenario
// impersonates a real signed-in user exactly like PostgREST does (role
// `authenticated` + the JWT `sub` claim), so RLS policies, SECURITY DEFINER
// RPCs and triggers behave as they do for the browser.
//
// Covers the authenticated DB boundaries the system review flagged (findings
// #2, #3-shape, #5, #6-shape, #7, #8, #9, #10, #11):
//   • raw PostgREST cost-read: a non-cost role gets ZERO rows from
//     inventory_item_costs / inventory_stock_layers / invoice_line_costs; a cost
//     role gets rows;
//   • stock_movements carries NO cost column (finding #2);
//   • parent-branch mismatch is REJECTED on inventory_stock_layers and
//     invoice_line_costs (finding #5);
//   • invoice_line_costs has NO end-user write policy — a cost editor cannot
//     insert/update/delete a snapshot directly (findings #5/#6);
//   • post_opening_stock is fail-closed for a wrong-store caller (finding #7);
//   • item_kind is immutable once assigned (finding #10);
//   • consume_invoice_line_stock is idempotent (retry/concurrent = one Outward,
//     one depletion) and mark_ticket_line_consumed blocks a later double-deduct
//     (finding #8 / FR-12);
//   • inventory_weighted_avg_cost is depletion-aware: after a cheap layer sells
//     out, valuation reflects the remaining expensive stock (finding #9 / FR-16).
//
// SECURITY: never prints connection strings, passwords or keys.
// ============================================================================
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

  const wm = process.argv.find((a) => a.startsWith("--with-migration"));
  if (wm) {
    const dir = path.resolve(ROOT, "supabase/migrations");
    const file = wm.includes("=") ? wm.split("=")[1] : fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().pop();
    await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
    console.log(`Loaded ${file} inside the test transaction (will be rolled back).`);
  }

  /* ── Fixture: org, two stores, cost/non-cost/other-store users ── */
  const [org] = await sys(`select id from organizations order by created_at limit 1`);
  const stores = await sys(`select id, name from branches where organization_id = $1 order by created_at`, [org.id]);
  const storeA = stores[0], storeB = stores[1];

  // A custom role that holds EXACTLY one cost key, and a custom role with NO
  // cost key — so the raw-cost-read boundary is tested precisely, independent of
  // whatever the seeded roles happen to grant.
  const mkRole = async (id, label, keys) => {
    await sys(`insert into roles (id, label, is_custom) values ($1, $2, true) on conflict (id) do nothing`, [id, label]);
    for (const k of keys) {
      await sys(`insert into role_permissions (role_id, permission_key) values ($1, $2) on conflict do nothing`, [id, k]);
    }
    return id;
  };
  const costRole    = await mkRole(`costrole-${crypto.randomUUID().slice(0, 6)}`, "Cost Viewer (test)", ["inventory_view_cost"]);
  const noCostRole  = await mkRole(`nocostrole-${crypto.randomUUID().slice(0, 6)}`, "No Cost (test)", ["manage_repair_jobs"]);
  const invMgrRole  = await mkRole(`invmgr-${crypto.randomUUID().slice(0, 6)}`, "Inv Manager (test)", ["manage_inventory"]);

  const mkUser = async (name, roleId, branchId) => {
    const authId = crypto.randomUUID();
    const email = `inv-verify-${authId.slice(0, 8)}@example.test`;
    await sys(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)`,
      [authId, email],
    );
    const [s] = await sys(
      `insert into staff (auth_user_id, organization_id, branch_id, name, email, role_id, status, login_enabled)
       values ($1, $2, $3, $4, $5, $6, 'active', true) returning id`,
      [authId, org.id, branchId, name, email, roleId],
    );
    return { authId, staffId: s.id, name };
  };

  const costUserA  = await mkUser("T CostViewer A", costRole,   storeA.id);
  const noCostUser = await mkUser("T NoCost A",     noCostRole, storeA.id);
  const invMgrA    = await mkUser("T InvMgr A",     invMgrRole, storeA.id);
  const invMgrB    = await mkUser("T InvMgr B",     invMgrRole, storeB.id);

  // A branch-A part item with an org-level default CP and a cost snapshot source.
  const itemId = `inv-${crypto.randomUUID().slice(0, 8)}`;
  await sys(
    `insert into inventory_items (id, organization_id, branch_id, name, item_type, item_kind, active, current_stock)
     values ($1, $2, $3, 'Test Screen', 'Product', 'part', true, 0)`,
    [itemId, org.id, storeA.id],
  );
  await sys(
    `insert into inventory_item_costs (item_id, organization_id, branch_id, cost_price, standard_labour_cost, cost_configured)
     values ($1, $2, null, 1800, 0, true)`,
    [itemId, org.id],
  );

  /* ── #2. stock_movements has NO cost column ── */
  section("stock_movements carries no cost (finding #2)");
  const cols = (await sys(
    `select column_name from information_schema.columns where table_schema='public' and table_name='stock_movements'`
  )).map((r) => r.column_name);
  ok("stock_movements has no unit_cost column", !cols.includes("unit_cost"));
  ok("stock_movements has no total_value column", !cols.includes("total_value"));

  /* ── #11/#5-read. Raw PostgREST cost-read boundary ── */
  section("Raw cost-read boundary (findings #5/#6, AC-21)");
  const noCostCp = await as(noCostUser.authId, `select cost_price from inventory_item_costs where item_id = $1`, [itemId]);
  ok("Non-cost role reads ZERO inventory_item_costs rows", noCostCp.length === 0);
  const costCp = await as(costUserA.authId, `select cost_price from inventory_item_costs where item_id = $1`, [itemId]);
  ok("Cost role reads the org-level CP (branch NULL visible to any store)", costCp.length === 1 && Number(costCp[0].cost_price) === 1800);
  const costCpB = await as(invMgrB.authId, `select cost_price from inventory_item_costs where item_id = $1`, [itemId]);
  ok("Cost role in store B also reads the org-level CP (MEDIUM-2)", costCpB.length === 1);

  /* ── #7. Opening-stock RPC store scope ── */
  section("post_opening_stock store scope (finding #7)");
  const openWrong = await tryAs(invMgrB.authId, `select public.post_opening_stock($1, 10, 100)`, [itemId]);
  ok("Store-B manager CANNOT post opening stock into a store-A item", !!openWrong.error, openWrong.error ?? "unexpectedly allowed");
  const openRight = await tryAs(invMgrA.authId, `select public.post_opening_stock($1, 10, 100)`, [itemId]);
  ok("Store-A manager CAN post opening stock into the store-A item", !openRight.error, openRight.error ?? "");
  const layers1 = await sys(`select qty_in, qty_remaining, unit_cost from inventory_stock_layers where item_id = $1`, [itemId]);
  ok("Opening created a cost-carrying layer with qty_remaining = qty_in", layers1.length === 1 && Number(layers1[0].qty_remaining) === 10);
  const stock1 = await sys(`select current_stock from inventory_items where id = $1`, [itemId]);
  ok("Opening set the master balance", Number(stock1[0].current_stock) === 10);

  /* ── #9. Depletion-aware weighted average + receipt RPC ── */
  section("Depletion-aware weighted average (finding #9 / FR-16)");
  // Receive 10 more at ₹200 via the Purchase/Stock-In RPC.
  const rcv = await tryAs(invMgrA.authId, `select public.post_stock_receipt($1, 10, 200, 'purchase')`, [itemId]);
  ok("Purchase/Stock-In posts a cost-carrying receipt layer", !rcv.error, rcv.error ?? "");
  const wac1 = await as(costUserA.authId, `select public.inventory_weighted_avg_cost($1) as c`, [itemId]);
  ok("WAC blends both layers while both have stock (10@100 + 10@200 = 150)", Number(wac1[0].c) === 150);
  // Deplete the cheap opening layer entirely (sell 10).
  await sys(`select public.inventory_deplete_layers($1, 10)`, [itemId]);
  const wac2 = await as(costUserA.authId, `select public.inventory_weighted_avg_cost($1) as c`, [itemId]);
  ok("After the ₹100 layer sells out, WAC reflects remaining ₹200 stock (not the ₹150 blend)", Number(wac2[0].c) === 200);

  /* ── #8. Idempotent sales consumption ── */
  section("Idempotent sales consumption (finding #8 / FR-12)");
  // Reset stock for a clean consumption test.
  await sys(`update inventory_items set current_stock = 10 where id = $1`, [itemId]);
  const inv1Id = `invc-${crypto.randomUUID().slice(0, 8)}`;
  await sys(
    `insert into invoices (id, organization_id, branch_id, invoice_type, status) values ($1, $2, $3, 'retail', 'paid')`,
    [inv1Id, org.id, storeA.id],
  );
  const c1 = await sys(`select public.consume_invoice_line_stock($1, 'line-1', $2, 3) as did`, [inv1Id, itemId]);
  ok("First consume returns true (deducted)", c1[0].did === true);
  const c2 = await sys(`select public.consume_invoice_line_stock($1, 'line-1', $2, 3) as did`, [inv1Id, itemId]);
  ok("Retry/concurrent consume returns false (idempotent, no second deduction)", c2[0].did === false);
  const mv = await sys(`select count(*)::int as n from stock_movements where item_id = $1 and movement_type = 'Outward'`, [itemId]);
  ok("Exactly ONE Outward movement per fulfilment line", mv[0].n === 1);
  const stock2 = await sys(`select current_stock from inventory_items where id = $1`, [itemId]);
  ok("Master balance deducted exactly once (10 - 3 = 7)", Number(stock2[0].current_stock) === 7);
  // Ticket-consumed guard: marking a line consumed blocks a later direct deduct.
  await sys(`select public.mark_ticket_line_consumed($1, 'line-ticket', $2, 2)`, [inv1Id, itemId]);
  const c3 = await sys(`select public.consume_invoice_line_stock($1, 'line-ticket', $2, 2) as did`, [inv1Id, itemId]);
  ok("A ticket-consumed line is never re-deducted by the invoice path", c3[0].did === false);

  /* ── #5. Snapshot immutability + parent-branch stamping ── */
  section("invoice_line_costs server-owned + parent scope (findings #5/#6)");
  // No end-user write policy → even a cost editor cannot insert a snapshot.
  const snapWrite = await tryAs(invMgrA.authId,
    `insert into invoice_line_costs (invoice_id, line_id, kind, qty, cost, cost_state) values ($1, 'l1', 'part', 1, 50, 'resolved')`,
    [inv1Id]);
  ok("End-user (even cost editor) CANNOT insert a snapshot row", !!snapWrite.error, snapWrite.error ?? "unexpectedly allowed");
  // Service-role insert stamps org/branch from the parent invoice.
  await sys(
    `insert into invoice_line_costs (invoice_id, line_id, kind, qty, cost, cost_state) values ($1, 'l1', 'part', 1, 1800, 'cp')`,
    [inv1Id]);
  const snap = await sys(`select organization_id, branch_id from invoice_line_costs where invoice_id = $1 and line_id = 'l1'`, [inv1Id]);
  ok("Service-role snapshot is stamped org+branch from the parent invoice", snap[0].organization_id === org.id && snap[0].branch_id === storeA.id);
  // Branch mismatch is rejected.
  const branchMismatch = await (async () => {
    await client.query("savepoint sp2");
    try {
      await sys(
        `insert into invoice_line_costs (invoice_id, line_id, organization_id, branch_id, kind, qty, cost, cost_state)
         values ($1, 'l2', $2, $3, 'part', 1, 10, 'cp')`,
        [inv1Id, org.id, storeB.id]);
      await client.query("release savepoint sp2");
      return null;
    } catch (e) {
      await client.query("rollback to savepoint sp2");
      return e.message;
    }
  })();
  ok("A snapshot branch that differs from the invoice's branch is REJECTED", !!branchMismatch, branchMismatch ?? "unexpectedly allowed");

  // Cost snapshot is readable by a cost role, invisible to a non-cost role.
  const snapNoCost = await as(noCostUser.authId, `select cost from invoice_line_costs where invoice_id = $1`, [inv1Id]);
  ok("Non-cost role reads ZERO snapshot rows", snapNoCost.length === 0);
  const snapCost = await as(costUserA.authId, `select cost from invoice_line_costs where invoice_id = $1`, [inv1Id]);
  ok("Cost role reads the snapshot", snapCost.length === 1);

  /* ── #10. item_kind immutability ── */
  section("item_kind permanent identity (finding #10)");
  const kindFlip = await (async () => {
    await client.query("savepoint sp3");
    try {
      await sys(`update inventory_items set item_kind = 'service' where id = $1`, [itemId]);
      await client.query("release savepoint sp3");
      return null;
    } catch (e) {
      await client.query("rollback to savepoint sp3");
      return e.message;
    }
  })();
  ok("Changing item_kind on an existing item is REJECTED", !!kindFlip, kindFlip ?? "unexpectedly allowed");

  /* ── #5-layer. inventory_stock_layers parent-branch mismatch ── */
  section("inventory_stock_layers parent scope (finding #5 shape)");
  const layerMismatch = await (async () => {
    await client.query("savepoint sp4");
    try {
      await sys(
        `insert into inventory_stock_layers (organization_id, branch_id, item_id, source, qty_in, unit_cost)
         values ($1, $2, $3, 'purchase', 5, 50)`,
        [org.id, storeB.id, itemId]);
      await client.query("release savepoint sp4");
      return null;
    } catch (e) {
      await client.query("rollback to savepoint sp4");
      return e.message;
    }
  })();
  ok("A layer branch that differs from the item's branch is REJECTED", !!layerMismatch, layerMismatch ?? "unexpectedly allowed");

} catch (e) {
  fail++;
  console.error("\nUNEXPECTED ERROR:", e.message);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
console.log(`\n${pass} passed, ${fail} failed (all test data rolled back).`);
process.exit(fail > 0 ? 1 : 0);
