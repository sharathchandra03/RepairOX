// ============================================================================
// RepairOX — Lead Intelligence Search / Shared Reference verification (DB).
//
//   node scripts/lead-search-verify.mjs
//
// Everything runs inside ONE transaction that is ALWAYS ROLLED BACK. Mirrors
// scripts/sales-agent-verify.mjs's impersonation harness. Covers the
// acceptance scenarios from the Lead Intelligence Search spec Phase 11:
// repeat-caller discovery, name/ID/partial-phone/email/device search, new
// enquiry for existing customer, permission denial, read-only enforcement,
// and handoff requests not changing ownership.
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
  const [org] = await sys(`select id from organizations order by created_at limit 1`);
  const stores = await sys(`select id, name from branches where organization_id = $1 order by created_at`, [org.id]);
  const storeA = stores[0];
  const mkUser = async (name, roleId, branchId, extraGrants = [], removeGrants = []) => {
    const authId = crypto.randomUUID();
    const email = `ls-verify-${authId.slice(0, 8)}@example.test`;
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
    // Per-user role so extraGrants never leak to other test users sharing 'sales_agent'.
    if (extraGrants.length || removeGrants.length) {
      const roleId2 = `ls_verify_${s.id.slice(0, 8)}`;
      await sys(`insert into roles (id, label, summary, workspaces, is_custom) values ($1, $2, 'test role', array['leads'], true)`, [roleId2, `Test ${name}`]);
      const base = await sys(`select permission_key from role_permissions where role_id = $1`, [roleId]);
      const keys = Array.from(new Set([...base.map((r) => r.permission_key), ...extraGrants])).filter((k) => !removeGrants.includes(k));
      for (const k of keys) await sys(`insert into role_permissions (role_id, permission_key) values ($1, $2) on conflict do nothing`, [roleId2, k]);
      await sys(`update staff set role_id = $1 where id = $2`, [roleId2, s.id]);
    }
    return { authId, staffId: s.id, name };
  };
  const NOREF = ["leads_shared_reference", "leads_customer_history"];
  const ahmed    = await mkUser("T Ahmed",    "sales_agent", storeA.id, [], NOREF);                               // owns LZV-031, no shared-ref
  const shashank = await mkUser("T Shashank", "sales_agent", storeA.id, ["leads_shared_reference", "leads_customer_history"]);
  const rahul_   = await mkUser("T Rahul2",   "sales_agent", storeA.id, [], NOREF);                                 // no extra grants — denial case
  const defaultAgent = await mkUser("T DefaultAgent", "sales_agent", storeA.id);   // role defaults only
  const owner    = await mkUser("T Owner",    "master_shop_owner", storeA.id);

  /* Customer + Ahmed's lead LZV-031 (rolled back) */
  const custId = "CUST-LSVERIFY-1";
  await sys(
    `insert into customers (id, organization_id, branch_id, first_name, last_name, full_name, mobile, email, created_by)
     values ($1, $2, $3, 'Rahul', 'Sharma', 'Rahul Sharma', '9880909012', 'rahul.sharma@example.test', $4)`,
    [custId, org.id, storeA.id, ahmed.staffId],
  );
  const insertLead = (who, fields) => {
    const cols = Object.keys(fields);
    const vals = Object.values(fields);
    return tryAs(who.authId,
      `insert into leads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id, lead_no`, vals);
  };
  const l1 = await insertLead(ahmed, {
    branch_id: storeA.id, name: "Rahul Sharma", number: "9880909012", email: "rahul.sharma@example.test",
    device: "iPhone 13", issue: "Battery draining fast, needs Battery replacement", customer_id: custId,
    contact_status: "Contacted", comments: "Spoke to customer, quoted battery price",
  });
  ok("Ahmed can create Lead for Rahul Sharma", !l1.error, l1.error ?? "");
  const L031 = l1.rows[0];
  await sys(`update leads set lead_no = 'LZV-031' where id = $1`, [L031.id]);

  const search = (who, q, opts = {}) =>
    as(who.authId, `select lead_search($1, $2, $3, $4) as r`,
      [q, opts.entity ?? "all", opts.limit ?? 5, opts.offset ?? 0]).then((r) => r[0].r);

  /* ── Scenario 1: repeat caller, different agent, phone search ── */
  section("Scenario 1 — customer calls again, Shashank (shared reference) searches mobile");
  let r = await search(shashank, "9880909012");
  ok("Not forbidden", r.forbidden === false);
  let leadRow = r.leads.rows.find((x) => x.lead_no === "LZV-031");
  ok("Ahmed's Lead LZV-031 appears for Shashank", !!leadRow);
  ok("Match field is Mobile Number Match", leadRow?.match_field === "Mobile Number Match");
  ok("Lead owner shown as Ahmed", leadRow?.assigned_to_name === "T Ahmed");
  ok("Lead is flagged non-ordinary (reference)", leadRow?.ordinary === false);
  let custRow = r.customers.rows.find((x) => x.id === custId);
  ok("Customer identity also appears", !!custRow);
  ok("Customer shows lead_count >= 1", (custRow?.lead_count ?? 0) >= 1);

  section("Scenario 1b — Rahul (no shared-reference grant) searches the same mobile");
  let r1b = await search(rahul_, "9880909012");
  ok("Not forbidden (own search still works)", r1b.forbidden === false);
  ok("Ahmed's lead does NOT leak to Rahul", !r1b.leads.rows.some((x) => x.lead_no === "LZV-031"));
  ok("Rahul's view of the customer exposes zero of Ahmed's leads (count/agents not leaked)",
    r1b.customers.rows.filter((x) => x.id === custId).every((x) => x.lead_count === 0 && x.active_count === 0 && (x.agents ?? []).length === 0));

  section("Global default — a plain Sales Agent (role defaults) finds Ahmed's lead, read-only");
  let rg = await search(defaultAgent, "9880909012");
  ok("Default Sales Agent finds another agent's lead", rg.leads.rows.some((x) => x.lead_no === "LZV-031"));
  const mutG = await tryAs(defaultAgent.authId, `with u as (update leads set contact_status = 'X' where id = $1 returning 1) select count(*)::int n from u`, [L031.id]);
  ok("…but cannot edit it", !!mutG.error || mutG.rows[0]?.n === 0);

  /* ── Scenario 2: search by name, no duplicate customer cards ── */
  section("Scenario 2 — search by customer name");
  let r2 = await search(shashank, "Rahul Sharma");
  const custHits = r2.customers.rows.filter((x) => x.id === custId);
  ok("Exactly one Customer card for Rahul Sharma (no duplicates)", custHits.length === 1);

  /* ── Scenario 3: search by Lead ID ── */
  section("Scenario 3 — search by Lead ID LZV-031");
  let r3 = await search(shashank, "LZV-031");
  ok("Exact Lead ID appears at top (score)", r3.leads.rows[0]?.lead_no === "LZV-031");
  ok("Match field is Lead ID Match", r3.leads.rows[0]?.match_field === "Lead ID Match");

  /* ── Scenario 4: partial mobile ── */
  section("Scenario 4 — partial mobile number (last 6 digits)");
  let r4 = await search(shashank, "909012");
  ok("Lead found via partial mobile", r4.leads.rows.some((x) => x.lead_no === "LZV-031"));

  /* ── Scenario 5: email, case/whitespace insensitive ── */
  section("Scenario 5 — search by email with case/whitespace variance");
  let r5 = await search(shashank, "  RAHUL.SHARMA@Example.TEST  ");
  ok("Lead found via normalized email", r5.leads.rows.some((x) => x.lead_no === "LZV-031"));

  /* ── Scenario 6: device/issue term ── */
  section("Scenario 6 — search by device/issue term");
  let r6 = await search(shashank, "Battery");
  ok("Lead found via device/issue match", r6.leads.rows.some((x) => x.lead_no === "LZV-031"));
  ok("Match field identifies Device / Issue", r6.leads.rows.find((x) => x.lead_no === "LZV-031")?.match_field.includes("Device"));

  /* ── Scenario 8: insufficient permission — direct reference fetch denied ── */
  section("Scenario 8/9 — Rahul (no shared-reference) cannot open Ahmed's lead; Shashank can read-only");
  const refRahul = await as(rahul_.authId, `select lead_reference_get($1) as r`, [L031.id]).then((r) => r[0].r);
  ok("Rahul gets null (lead existence not leaked)", refRahul === null);
  const refShashank = await as(shashank.authId, `select lead_reference_get($1) as r`, [L031.id]).then((r) => r[0].r);
  ok("Shashank gets the lead in reference mode", refShashank?.reference === true);
  ok("Shashank can see device/issue/comments", refShashank?.lead?.issue?.includes("Battery"));
  ok("Commercial values are zeroed for a reference view", Number(refShashank?.lead?.estimate ?? 0) === 0);
  const logRows = await sys(`select * from lead_reference_access_log where lead_id = $1 and viewer_staff_id = $2`, [L031.id, shashank.staffId]);
  ok("Access log recorded Shashank's reference view", logRows.length === 1);

  /* ── Scenario 9 continued: a direct mutation attempt by Shashank is rejected ── */
  section("Scenario 9 — Shashank cannot mutate Ahmed's lead via a direct UPDATE");
  const mut = await tryAs(shashank.authId,
    `with u as (update leads set contact_status = 'Connected', assigned_user_id = $2 where id = $1 returning 1) select count(*)::int as n from u`,
    [L031.id, shashank.staffId]);
  const after = await sys(`select contact_status, assigned_user_id from leads where id = $1`, [L031.id]);
  ok("Shashank's direct UPDATE (fields + reassign) touched 0 rows or was rejected", !!mut.error || mut.rows[0]?.n === 0, mut.error ?? "0 rows");
  const unaffected = await as(shashank.authId, `select id from leads where id = $1`, [L031.id]);
  ok("Shashank's own SELECT still can't see the row via plain RLS (search bypasses via RPC only)", unaffected.length === 0);
  ok("Ahmed's lead contact_status is unchanged", after[0].contact_status === "Contacted");
  ok("Ahmed's lead ownership is unchanged", after[0].assigned_user_id === ahmed.staffId);

  /* ── Scenario 7: existing customer, new enquiry — repeat check ── */
  section("Scenario 7 — existing customer calls about a different issue (repeat-check)");
  const rc = await as(shashank.authId, `select lead_repeat_check($1, null, null, $2, $3) as r`,
    ["9880909012", "iPhone 13", "Screen crack"]).then((r) => r[0].r);
  ok("Repeat-check recognises the existing customer", rc?.customer?.id === custId);
  ok("Repeat-check surfaces the existing open lead", rc?.leads?.some((x) => x.id === L031.id));
  ok("Repeat-check does not flag an unrelated device/issue as similar", !rc?.leads?.find((x) => x.id === L031.id)?.similar);

  /* ── Scenario 10: handoff request does not change ownership ── */
  section("Scenario 10 — handoff request");
  const hoDenied = await tryAs(rahul_.authId, `select lead_request_handoff($1, 'Customer prefers me') as r`, [L031.id]);
  ok("A user without reference access cannot request handoff", !!hoDenied.error);
  const ho = await tryAs(shashank.authId, `select lead_request_handoff($1, 'Customer called me directly this time') as r`, [L031.id]);
  ok("Shashank can request a handoff", !ho.error, ho.error ?? "");
  const afterReq = await sys(`select assigned_user_id from leads where id = $1`, [L031.id]);
  ok("Lead ownership unchanged immediately after the request", afterReq[0].assigned_user_id === ahmed.staffId);
  const pendingRow = await sys(`select status, owner_staff_id, requested_by from lead_handoff_requests where lead_id = $1`, [L031.id]);
  ok("One pending request stored", pendingRow.length === 1 && pendingRow[0].status === "pending");
  ok("Request captures current owner + requester", pendingRow[0].owner_staff_id === ahmed.staffId && pendingRow[0].requested_by === shashank.staffId);
  const notif = await sys(`select recipient_id from notifications where kind = 'lead_handoff_requested' and reference = 'LZV-031'`);
  ok("Owner (Ahmed) was notified", notif.some((n) => n.recipient_id === ahmed.staffId));

  // Owner approves → ownership actually transfers through the guarded path.
  const reqId = (await sys(`select id from lead_handoff_requests where lead_id = $1 and status = 'pending'`, [L031.id]))[0].id;
  const dec = await tryAs(owner.authId, `select lead_handoff_decide($1, 'approve') as r`, [reqId]);
  ok("Owner can approve the handoff", !dec.error, dec.error ?? "");
  const afterApprove = await sys(`select assigned_user_id from leads where id = $1`, [L031.id]);
  ok("Ownership transferred to Shashank only after explicit approval", afterApprove[0].assigned_user_id === shashank.staffId);
  const hist = await sys(`select 1 from lead_assignment_history where lead_id = $1 and from_user_id = $2 and to_user_id = $3`, [L031.id, ahmed.staffId, shashank.staffId]);
  ok("Assignment history recorded the transfer", hist.length === 1);

  /* ── Scenario 11: opening/searching never fabricates activity ── */
  section("Scenario 11 — search/open does not create fake activity or move Last Action");
  const beforeAct = await sys(`select count(*)::int as n from lead_activity_history where lead_id = $1`, [L031.id]);
  await search(shashank, "Rahul Sharma");
  await search(shashank, "LZV-031");
  await as(shashank.authId, `select lead_reference_get($1) as r`, [L031.id]);
  const afterAct = await sys(`select count(*)::int as n from lead_activity_history where lead_id = $1`, [L031.id]);
  ok("No new lead_activity_history rows from searching/opening", afterAct[0].n === beforeAct[0].n);
  const afterStatus = await sys(`select contact_status, status from leads where id = $1`, [L031.id]);
  ok("Contact status / status unchanged by viewing", afterStatus[0].contact_status === "Contacted");

  /* ── Customer 360 ── */
  section("Customer 360 — lead_customer_history");
  const hist360 = await as(shashank.authId, `select lead_customer_history($1) as r`, [custId]).then((r) => r[0].r);
  ok("Customer history returns the customer identity once", hist360?.customer?.id === custId);
  ok("Customer history includes the lead (now owned by Shashank)", hist360?.leads?.some((x) => x.id === L031.id));
  ok("Timeline includes at least lead_created + assignment events", (hist360?.timeline?.length ?? 0) >= 2);
} catch (e) {
  fail++;
  console.error("\nUNEXPECTED ERROR:", e.message);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
console.log(`\n${pass} passed, ${fail} failed (all test data rolled back).`);
process.exit(fail > 0 ? 1 : 0);
