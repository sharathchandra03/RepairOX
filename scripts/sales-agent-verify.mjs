// ============================================================================
// RepairOX — Sales Agent / Lead ownership END-TO-END verification (DB layer).
//
//   node scripts/sales-agent-verify.mjs                  # against the live schema
//   node scripts/sales-agent-verify.mjs --with-migration # load the newest migration first (pre-apply check)
//
// Everything runs inside ONE transaction that is ALWAYS ROLLED BACK — no test
// users, staff or leads are left behind. Each scenario impersonates a real
// signed-in user exactly like PostgREST does (role `authenticated` + the JWT
// `sub` claim), so RLS policies, SECURITY DEFINER helpers and triggers behave
// as they do for the browser.
//
// Covers: Sales Agent role + grants, eligible-agent RPC (role + active + store
// scope), default owner on create, created_by stamping, assignment history,
// own/assigned/follow-up visibility, direct-id access denial, reassignment
// permissions, follow-up agent separation, ineligible (technician / owner /
// other-store / inactive / role-removed) users, soft-delete guard, reporting
// view isolation and the no-Sales-Agent empty state.
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

/** Run a query as postgres with NO end-user JWT (bypasses RLS, auth.uid() null). */
async function sys(sql, params = []) {
  await client.query("reset role");
  await client.query(`select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)`);
  return (await client.query(sql, params)).rows;
}
/** Run a query as a signed-in end user (RLS + auth.uid() apply). Throws on error
 *  (the caller — tryAs — restores the role after rolling back the savepoint). */
async function as(authUid, sql, params = []) {
  await client.query("reset role");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: authUid, role: "authenticated" })]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authUid]);
  await client.query("set local role authenticated");
  const rows = (await client.query(sql, params)).rows;
  await client.query("reset role");
  return rows;
}
/** Same as `as`, but returns the error message (or null) instead of throwing. */
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

  // --with-migration[=NNNN_name.sql]  → load a (not-yet-applied) migration
  // inside the transaction first; defaults to the newest migration file.
  const wm = process.argv.find((a) => a.startsWith("--with-migration"));
  if (wm) {
    const dir = path.resolve(ROOT, "supabase/migrations");
    const file = wm.includes("=") ? wm.split("=")[1] : fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().pop();
    await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
    console.log(`Loaded ${file} inside the test transaction (will be rolled back).`);
  }

  /* ── Fixture: org, two stores, owner, and test users (all rolled back) ── */
  const [org] = await sys(`select id from organizations order by created_at limit 1`);
  const stores = await sys(`select id, name from branches where organization_id = $1 order by created_at`, [org.id]);
  const storeA = stores[0], storeB = stores[1];
  const emptyStore = { id: crypto.randomUUID(), name: "ZZ Empty Store (test)" };
  await sys(`insert into branches (id, organization_id, name) values ($1, $2, $3)`, [emptyStore.id, org.id, emptyStore.name]);

  const mkUser = async (name, roleId, branchId, status = "active") => {
    const authId = crypto.randomUUID();
    const email = `sa-verify-${authId.slice(0, 8)}@example.test`;
    await sys(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)`,
      [authId, email],
    );
    const [s] = await sys(
      `insert into staff (auth_user_id, organization_id, branch_id, name, email, role_id, status, login_enabled)
       values ($1, $2, $3, $4, $5, $6, $7, true) returning id`,
      [authId, org.id, branchId, name, email, roleId, status],
    );
    return { authId, staffId: s.id, name };
  };

  const owner   = await mkUser("T Owner (MSO)",  "master_shop_owner", storeA.id);
  const shashank = await mkUser("T Shashank",    "sales_agent",       storeA.id);
  const ullas    = await mkUser("T Ullas",       "sales_agent",       storeA.id);
  const ahmed    = await mkUser("T Ahmed",       "sales_agent",       storeB.id);
  const tech     = await mkUser("T Technician",  "technician",        storeA.id);
  const managerB = await mkUser("T Manager B",   "shop_owner_branch_manager", storeB.id);

  const insertLead = (who, fields) => {
    const cols = Object.keys(fields);
    const vals = Object.values(fields);
    return tryAs(who.authId,
      `insert into leads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})
       returning id, lead_no, created_by, assigned_user_id, assigned_to, assigned_to_name, assigned_by`, vals);
  };
  const visibleIds = async (who) => (await as(who.authId, `select id from leads where deleted_at is null`)).map((r) => r.id);

  /* ── 1–4. Role + permissions ── */
  section("Sales Agent role (Add User / Roles & Permissions / defaults)");
  const [role] = await sys(`select id, label, is_custom from roles where id = 'sales_agent'`);
  ok("Role exists as a real DB role", !!role && role.label === "Sales Agent" && role.is_custom === false);
  const grants = (await sys(`select permission_key from role_permissions where role_id = 'sales_agent'`)).map((r) => r.permission_key);
  for (const k of ["leads_sales_agent", "leads_view", "leads_create", "leads_edit", "leads_followup", "leads_performance_view_own", "comms_call_log"]) {
    ok(`Default grant ON: ${k}`, grants.includes(k));
  }
  for (const k of ["leads_view_all", "leads_view_team", "leads_performance_view_all", "manage_roles", "add_user", "multi_store_access", "stores_view_all", "manage_sales", "full_access", "view_sales_reports", "leads_delete"]) {
    ok(`Default grant OFF: ${k}`, !grants.includes(k));
  }

  /* ── 5–8. Eligible-agent directory ── */
  section("Sales Agent picker (lead_sales_agents RPC)");
  const listFor = async (who, branch = null) =>
    (await as(who.authId, `select staff_id, name, store_ids from lead_sales_agents($1)`, [branch])).map((r) => r.staff_id);
  const ownerList = await listFor(owner);
  ok("Both Sales Agents appear (owner view)", ownerList.includes(shashank.staffId) && ownerList.includes(ullas.staffId));
  ok("Technician does NOT appear", !ownerList.includes(tech.staffId));
  ok("Master Shop Owner does NOT appear merely because they are a user", !ownerList.includes(owner.staffId));
  const allRealAgents = await sys(
    `select s.id from staff s where exists (select 1 from role_permissions rp where rp.role_id = s.role_id and rp.permission_key = 'leads_sales_agent')`);
  ok("Every returned person is a real Sales Agent", ownerList.every((id) => allRealAgents.some((a) => a.id === id)));
  const storeAList = await listFor(owner, storeA.id);
  ok("Store-scoped list excludes other-store agent", storeAList.includes(shashank.staffId) && !storeAList.includes(ahmed.staffId));
  const mgrBList = await listFor(managerB);
  ok("Single-store manager sees only their store's agents", mgrBList.includes(ahmed.staffId) && !mgrBList.includes(shashank.staffId));
  const emptyList = await listFor(owner, emptyStore.id);
  ok("No-Sales-Agent store returns an empty list (empty state)", emptyList.length === 0);

  /* ── 9–11. Create as Sales Agent → auto-attribution ── */
  section("Create lead as Sales Agent (IVR flow)");
  const l1 = await insertLead(shashank, { branch_id: storeA.id, name: "IVR Caller 1", number: "9000000001", source: "IVR", created_by: owner.staffId });
  ok("Sales Agent can create a lead", !l1.error, l1.error ?? "");
  const L1 = l1.rows[0];
  ok("Owner defaults to the logged-in Sales Agent (no manual pick)", L1?.assigned_user_id === shashank.staffId && L1?.assigned_to === shashank.staffId);
  ok("created_by = logged-in user (client value ignored)", L1?.created_by === shashank.staffId);
  ok("Owner display name is server-stamped", L1?.assigned_to_name === shashank.name);
  const h1 = await sys(`select from_user_id, to_user_id, assigned_by, reason from lead_assignment_history where lead_id = $1`, [L1.id]);
  ok("Assignment history row written on create", h1.length === 1 && h1[0].to_user_id === shashank.staffId && h1[0].reason === "Lead created");
  ok("Lead appears in the agent's own scope", (await visibleIds(shashank)).includes(L1.id));

  // The rest of the capture/work flow the browser runs for a Sales Agent.
  const seq = await tryAs(shashank.authId, `select next_lead_id() as no`);
  ok("Sales Agent can draw the next Lead ID", !seq.error && !!seq.rows[0]?.no, seq.error ?? "");
  const contact = await tryAs(shashank.authId,
    `insert into contacts (id, branch_id, first_name, full_name, phone) values ($1, $2, 'IVR', 'IVR Caller 1', '9000000001') returning id`,
    [`c-${crypto.randomUUID()}`, storeA.id]);
  ok("Sales Agent can resolve a CRM contact during capture", !contact.error, contact.error ?? "");
  const ownFu = await tryAs(shashank.authId,
    `insert into lead_followup_history (lead_id, branch_id, scheduled_at, followup_user_id, status) values ($1, $2, now() + interval '2 hours', $3, 'scheduled') returning id`,
    [L1.id, storeA.id, shashank.staffId]);
  ok("Sales Agent can schedule a follow-up on their own lead", !ownFu.error, ownFu.error ?? "");
  const stage = await tryAs(shashank.authId,
    `insert into lead_status_history (lead_id, branch_id, from_status, to_status) values ($1, $2, 'New', 'Qualified') returning id`, [L1.id, storeA.id]);
  ok("Sales Agent can record a status change on their own lead", !stage.error, stage.error ?? "");
  const edit = await tryAs(shashank.authId, `update leads set comments = 'Called back', status = 'Qualified' where id = $1 returning id`, [L1.id]);
  ok("Sales Agent can edit their own lead", !edit.error && edit.rows.length === 1, edit.error ?? "");

  /* ── 12–14. Assign another lead to another agent ── */
  section("Owner assigns a lead to another Sales Agent");
  const l2 = await insertLead(owner, { branch_id: storeA.id, name: "Web Lead 2", number: "9000000002", source: "Forms", assigned_user_id: ullas.staffId });
  ok("Owner can create a lead assigned to Ullas", !l2.error, l2.error ?? "");
  const L2 = l2.rows[0];
  ok("Lead 2 visible to Ullas", (await visibleIds(ullas)).includes(L2.id));
  ok("Lead 2 NOT visible to Shashank (unrelated agent)", !(await visibleIds(shashank)).includes(L2.id));
  ok("Lead 1 NOT visible to Ullas", !(await visibleIds(ullas)).includes(L1.id));
  const direct = await as(shashank.authId, `select id from leads where id = $1`, [L2.id]);
  ok("Direct access by id is denied (0 rows)", direct.length === 0);
  const directUpd = await tryAs(shashank.authId, `update leads set comments = 'hijack' where id = $1 returning id`, [L2.id]);
  ok("Direct update by id is denied (0 rows)", !directUpd.error && directUpd.rows.length === 0);
  const hist = await as(shashank.authId, `select id from lead_assignment_history where lead_id = $1`, [L2.id]);
  ok("Unrelated lead's history is hidden too", hist.length === 0);
  const rep = await as(shashank.authId, `select id from lead_reporting_v`);
  ok("Reporting view obeys RLS (only own leads)", rep.every((r) => r.id !== L2.id) && rep.some((r) => r.id === L1.id));

  const upd2 = await tryAs(owner.authId, `update leads set assigned_user_id = $1, last_assignment_reason = 'Workload balance' where id = $2 returning assigned_to`, [shashank.staffId, L2.id]);
  ok("Owner reassigns Lead 2 Ullas → Shashank", !upd2.error && upd2.rows[0]?.assigned_to === shashank.staffId, upd2.error ?? "");
  // (now() is constant inside one transaction, so match rows by content, not time.)
  const h2 = await sys(`select from_user_id, to_user_id, assigned_by, reason from lead_assignment_history where lead_id = $1`, [L2.id]);
  const created2 = h2.find((h) => !h.from_user_id && h.to_user_id === ullas.staffId);
  const moved2 = h2.find((h) => h.from_user_id === ullas.staffId);
  ok("Reassignment history retained (previous → new, by, reason)",
    h2.length === 2 && !!created2 && moved2?.to_user_id === shashank.staffId && moved2?.assigned_by === owner.staffId && moved2?.reason === "Workload balance");
  ok("Lead 2 now visible to Shashank, no longer to Ullas",
    (await visibleIds(shashank)).includes(L2.id) && !(await visibleIds(ullas)).includes(L2.id));

  /* ── Ineligible owners ── */
  section("Ineligible owners are rejected by the database");
  const badTech = await tryAs(owner.authId, `update leads set assigned_user_id = $1 where id = $2`, [tech.staffId, L2.id]);
  ok("Technician cannot be made lead owner", !!badTech.error && /lead_owner_not_eligible/.test(badTech.error));
  const badOwner = await tryAs(owner.authId, `update leads set assigned_user_id = $1 where id = $2`, [owner.staffId, L2.id]);
  ok("Master Shop Owner cannot be owner (not a Sales Agent)", !!badOwner.error && /lead_owner_not_eligible/.test(badOwner.error));
  const badStore = await tryAs(owner.authId, `update leads set assigned_user_id = $1 where id = $2`, [ahmed.staffId, L2.id]);
  ok("Other-store Sales Agent cannot own a Store A lead", !!badStore.error && /lead_owner_not_eligible/.test(badStore.error));
  const techCreate = await insertLead(tech, { branch_id: storeA.id, name: "x", number: "9000000009", source: "IVR" });
  ok("Technician cannot create leads (no lead permission)", !!techCreate.error);

  /* ── 15–17. Follow-up agent is separate ── */
  section("Follow-up agent ≠ primary owner");
  const l3 = await insertLead(shashank, { branch_id: storeA.id, name: "IVR Caller 3", number: "9000000003", source: "IVR" });
  const L3 = l3.rows[0];
  const fu = await tryAs(owner.authId,
    `insert into lead_followup_history (lead_id, branch_id, scheduled_at, followup_user_id, status) values ($1, $2, now() + interval '1 day', $3, 'scheduled') returning id, followup_user_name, created_by`,
    [L3.id, storeA.id, ullas.staffId]);
  ok("Owner schedules a follow-up on Lead 3 for Ullas", !fu.error, fu.error ?? "");
  ok("Follow-up agent name + created_by are server-stamped", fu.rows[0]?.followup_user_name === ullas.name && fu.rows[0]?.created_by === owner.staffId);
  ok("Ullas sees Lead 3 in his follow-up workload", (await visibleIds(ullas)).includes(L3.id));
  const [l3now] = await sys(`select assigned_user_id from leads where id = $1`, [L3.id]);
  ok("Primary ownership unchanged (still Shashank)", l3now.assigned_user_id === shashank.staffId);
  const done = await tryAs(ullas.authId, `update lead_followup_history set status = 'completed', completed_at = now(), outcome = 'Interested' where id = $1 returning id`, [fu.rows[0].id]);
  ok("Ullas can complete his follow-up", !done.error && done.rows.length === 1, done.error ?? "");
  const [l3after] = await sys(`select status, assigned_user_id from leads where id = $1`, [L3.id]);
  ok("Completing the follow-up did not change owner", l3after.assigned_user_id === shashank.staffId);
  const fuTech = await tryAs(owner.authId,
    `insert into lead_followup_history (lead_id, branch_id, scheduled_at, followup_user_id) values ($1, $2, now(), $3)`, [L3.id, storeA.id, tech.staffId]);
  ok("Technician cannot be a follow-up agent", !!fuTech.error && /lead_followup_agent_not_eligible/.test(fuTech.error));

  // Scenario D: Shashank sets his own lead's follow-up agent to Ullas.
  const setFu = await tryAs(shashank.authId, `update leads set follow_up_agent_id = $1 where id = $2 returning assigned_user_id, follow_up_agent`, [ullas.staffId, L1.id]);
  ok("Shashank sets Ullas as follow-up agent on his own lead", !setFu.error && setFu.rows[0]?.follow_up_agent === ullas.name, setFu.error ?? "");
  ok("Shashank remains lead owner", setFu.rows[0]?.assigned_user_id === shashank.staffId);
  ok("Ullas now sees Lead 1 (follow-up responsibility)", (await visibleIds(ullas)).includes(L1.id));
  const fuBad = await tryAs(shashank.authId, `update leads set follow_up_agent_id = $1 where id = $2`, [ahmed.staffId, L1.id]);
  ok("Follow-up agent must be authorized for the lead's store", !!fuBad.error && /lead_followup_agent_not_eligible/.test(fuBad.error));
  const takeOver = await tryAs(ullas.authId, `update leads set assigned_user_id = $1 where id = $2`, [ullas.staffId, L1.id]);
  ok("Follow-up agent can't take ownership of someone else's lead", !!takeOver.error && /lead_reassign_forbidden/.test(takeOver.error), takeOver.error ?? "no error");

  section("Hardening (review findings)");
  // A Sales Agent re-pointing their own follow-up at a lead they can't see.
  const myFu = (await sys(`select id from lead_followup_history where lead_id = $1 and followup_user_id = $2 limit 1`, [L1.id, shashank.staffId]))[0];
  const lB0 = (await insertLead(owner, { branch_id: storeB.id, name: "Store B private", number: "9000000012", source: "Forms", assigned_user_id: ahmed.staffId })).rows[0];
  const repoint = await tryAs(shashank.authId, `update lead_followup_history set lead_id = $1 where id = $2`, [lB0.id, myFu.id]);
  const [fuNow] = await sys(`select lead_id from lead_followup_history where id = $1`, [myFu.id]);
  ok("A follow-up can't be re-pointed at another lead", fuNow.lead_id === L1.id && !(await visibleIds(shashank)).includes(lB0.id), repoint.error ?? "");
  const forge = await tryAs(shashank.authId,
    `insert into lead_assignment_history (lead_id, branch_id, from_user_id, to_user_id, reason) values ($1, $2, $3, $4, 'forged')`,
    [L1.id, storeA.id, ullas.staffId, shashank.staffId]);
  ok("Assignment history can't be written by the client (trigger-only)", !!forge.error);
  const optId = crypto.randomUUID();
  await sys(`insert into lead_options (id, organization_id, branch_id, field, value, sort_order) values ($1, $2, null, 'source', 'ZZ Verify Source', 999)`, [optId, org.id]);
  const opts = await as(shashank.authId, `select id from lead_options where id = $1`, [optId]);
  ok("Sales Agent can read Lead Form options (Source, Region …)", opts.length === 1);
  const agentSpoof = await tryAs(shashank.authId, `update leads set agent = 'Fake Owner' where id = $1 returning agent`, [L1.id]);
  ok("Cached AGENTS label can't be spoofed", !agentSpoof.error && agentSpoof.rows[0]?.agent === shashank.name);
  const nameSpoof = await tryAs(shashank.authId, `update lead_followup_history set followup_user_name = 'Fake' where id = $1 returning followup_user_name`, [myFu.id]);
  ok("Follow-up agent name can't be spoofed", !nameSpoof.error && nameSpoof.rows[0]?.followup_user_name === shashank.name);
  await sys(`update leads set deleted_at = now() where id = $1`, [L1.id]);
  const restore = await tryAs(shashank.authId, `update leads set deleted_at = null where id = $1`, [L1.id]);
  ok("Restoring a deleted lead needs the Delete capability", !!restore.error && /lead_delete_forbidden/.test(restore.error));
  await sys(`update leads set deleted_at = null where id = $1`, [L1.id]);
  const moveStore = await tryAs(owner.authId, `update leads set branch_id = $1 where id = $2`, [storeB.id, L1.id]);
  ok("Moving a lead to a store its owner can't work is rejected", !!moveStore.error && /lead_owner_not_eligible/.test(moveStore.error));

  /* ── Permission-gated owner changes ── */
  section("Assignment permissions");
  await sys(`delete from role_permissions where role_id = 'sales_agent' and permission_key = 'leads_assign'`);
  const noAssign = await insertLead(shashank, { branch_id: storeA.id, name: "x", number: "9000000010", source: "IVR", assigned_user_id: ullas.staffId });
  ok("Without leads_assign an agent can't create a lead owned by someone else", !!noAssign.error && /lead_assign_forbidden/.test(noAssign.error));
  const noReassign = await tryAs(shashank.authId, `update leads set assigned_user_id = $1 where id = $2`, [ullas.staffId, L1.id]);
  ok("Without leads_assign/reassign an agent can't reassign", !!noReassign.error && /lead_reassign_forbidden/.test(noReassign.error));
  await sys(`insert into role_permissions (role_id, permission_key) values ('sales_agent', 'leads_assign') on conflict do nothing`);
  const selfReassign = await tryAs(shashank.authId, `update leads set assigned_user_id = $1 where id = $2 returning id`, [ullas.staffId, L3.id]);
  ok("With leads_assign (default) an agent can hand a lead to another agent", !selfReassign.error && selfReassign.rows.length === 1, selfReassign.error ?? "");
  ok("Creator keeps visibility after handing off", (await visibleIds(shashank)).includes(L3.id));
  const del = await tryAs(shashank.authId, `update leads set deleted_at = now() where id = $1`, [L1.id]);
  ok("Sales Agent cannot soft-delete (no delete permission)", !!del.error && /lead_delete_forbidden/.test(del.error));
  const spoof = await tryAs(shashank.authId, `update leads set assigned_to_name = 'Someone Else' where id = $1 returning assigned_to_name`, [L1.id]);
  ok("Owner display name can't be spoofed", !spoof.error && spoof.rows[0]?.assigned_to_name === shashank.name);

  /* ── 18–20. Role removed / deactivated ── */
  section("Role removal / deactivation");
  await sys(`update staff set role_id = 'technician' where id = $1`, [ullas.staffId]);
  ok("Ullas disappears from the picker after losing the role", !(await listFor(owner)).includes(ullas.staffId));
  const [hl] = await sys(`select assigned_user_id, assigned_to_name from leads where id = $1`, [L3.id]);
  ok("Historical lead ownership preserved", hl.assigned_user_id === ullas.staffId && hl.assigned_to_name === ullas.name);
  const oldHist = await sys(`select count(*)::int n from lead_assignment_history where lead_id = $1`, [L3.id]);
  ok("Assignment history intact", oldHist[0].n >= 2);
  const newToUllas = await tryAs(owner.authId, `update leads set assigned_user_id = $1 where id = $2`, [ullas.staffId, L1.id]);
  ok("New assignment to ex-agent is rejected", !!newToUllas.error && /lead_owner_not_eligible/.test(newToUllas.error));
  const safeReassign = await tryAs(owner.authId, `update leads set assigned_user_id = $1 where id = $2 returning id`, [shashank.staffId, L3.id]);
  ok("Authorized user can safely reassign the ex-agent's lead", !safeReassign.error && safeReassign.rows.length === 1, safeReassign.error ?? "");
  await sys(`update staff set status = 'suspended' where id = $1`, [shashank.staffId]);
  ok("Deactivated agent disappears from the picker", !(await listFor(owner)).includes(shashank.staffId));
  await sys(`update staff set status = 'active' where id = $1`, [shashank.staffId]);

  /* ── 21. Store restriction ── */
  section("Store scope");
  const lB = await insertLead(owner, { branch_id: storeB.id, name: "Store B lead", number: "9000000011", source: "Forms", assigned_user_id: ahmed.staffId });
  ok("Store B lead assigned to the Store B agent", !lB.error, lB.error ?? "");
  ok("Store A agent can't see the Store B lead", !(await visibleIds(shashank)).includes(lB.rows[0]?.id));
  ok("Store B agent sees it", (await visibleIds(ahmed)).includes(lB.rows[0]?.id));
  const ahmedSeesA = (await visibleIds(ahmed)).some((id) => [L1.id, L2.id, L3.id].includes(id));
  ok("Store B agent sees no Store A leads", !ahmedSeesA);
  const agentCross = await as(shashank.authId, `select staff_id from lead_sales_agents(null)`);
  ok("A Sales Agent's picker never lists other-store agents", !agentCross.some((r) => r.staff_id === ahmed.staffId));

  /* ── Manager (see-all within store) ── */
  const mgrSees = await visibleIds(managerB);
  ok("Store manager (see-all key) sees Store B leads but not Store A", mgrSees.includes(lB.rows[0]?.id) && !mgrSees.includes(L1.id));
} catch (e) {
  fail++;
  console.error("\nUNEXPECTED ERROR:", e.message);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

console.log(`\n${pass} passed, ${fail} failed (all test data rolled back).`);
process.exit(fail > 0 ? 1 : 0);
