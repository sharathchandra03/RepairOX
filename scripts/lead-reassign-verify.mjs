// RepairOX — Lead Reassignment access verification (DB). node scripts/lead-reassign-verify.mjs
// One transaction, ALWAYS rolled back; impersonates real users (JWT claims + authenticated role).
import fs from "node:fs";
import path from "node:path";
const env = {};
for (const l of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) env[t.slice(0, i)] = t.slice(i + 1);
}
const pg = (await import("pg")).default;
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`); };
async function sys(sql, p = []) { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims','',true), set_config('request.jwt.claim.sub','',true)`); return (await c.query(sql, p)).rows; }
async function tryAs(uid, sql, p = []) {
  await c.query("savepoint s");
  try {
    await c.query("reset role");
    await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
    await c.query("set local role authenticated");
    const r = await c.query(sql, p); await c.query("release savepoint s"); return { rows: r.rows, count: r.rowCount };
  } catch (e) { await c.query("rollback to savepoint s"); return { err: String(e.message) }; }
}
try {
  await c.query("begin");
  console.log("\n▸ Who holds the key");
  const roles = await sys(`select r.id, bool_or(rp.permission_key='leads_reassign_access') has from roles r left join role_permissions rp on rp.role_id=r.id group by r.id`);
  const has = Object.fromEntries(roles.map((r) => [r.id, !!r.has]));
  ok("manager role has it", has.manager === true);
  ok("master_shop_owner / branch manager have it", has.master_shop_owner === true && has.shop_owner_branch_manager === true);
  ok("sales_agent does NOT have it", has.sales_agent === false);

  // Fixture: a sales agent who owns a lead, another eligible agent, and a manager.
  const [agent] = await sys(`select s.id, s.auth_user_id, s.organization_id from staff s join leads l on l.assigned_user_id=s.id and l.deleted_at is null where s.role_id='sales_agent' and s.auth_user_id is not null and s.status='active' group by s.id limit 1`);
  const [other] = await sys(`select s.id from staff s where s.role_id='sales_agent' and s.id<>$1 and s.status='active' limit 1`, [agent.id]);
  const [mgr] = await sys(`select s.id, s.auth_user_id from staff s where s.role_id='manager' and s.auth_user_id is not null limit 1`);
  const [lead] = await sys(`select id, branch_id from leads where assigned_user_id=$1 and deleted_at is null limit 1`, [agent.id]);
  if (!lead) throw new Error("no lead owned by the fixture sales agent");
  console.log(`\nlead ${lead.id}  agent=${agent.id.slice(0, 8)} other=${other.id.slice(0, 8)}`);

  console.log("\n▸ Sales Agent (no key)");
  let r = await tryAs(agent.auth_user_id, `update leads set assigned_user_id=$2 where id=$1`, [lead.id, other.id]);
  ok("cannot change the owner of their own lead", /lead_reassign_access_forbidden/.test(r.err || ""), r.err);
  r = await tryAs(agent.auth_user_id, `update leads set follow_up_agent_id=$2 where id=$1`, [lead.id, other.id]);
  ok("cannot hand the follow-up agent to someone new", /lead_reassign_access_forbidden/.test(r.err || ""), r.err);
  r = await tryAs(agent.auth_user_id, `update leads set follow_up_agent_id=$2 where id=$1`, [lead.id, agent.id]);
  ok("CAN keep the follow-up with themselves", !r.err, r.err);
  r = await tryAs(agent.auth_user_id, `update leads set comments = coalesce(comments,'') || ' ' where id=$1`, [lead.id]);
  ok("normal edits still work", !r.err, r.err);
  r = await tryAs(agent.auth_user_id, `insert into lead_followup_history(lead_id, scheduled_at, followup_user_id, status) values ($1, now() + interval '1 day', $2, 'scheduled')`, [lead.id, other.id]);
  ok("cannot schedule a follow-up FOR another agent", /lead_reassign_access_forbidden/.test(r.err || ""), r.err);
  r = await tryAs(agent.auth_user_id, `insert into lead_followup_history(lead_id, scheduled_at, followup_user_id, status) values ($1, now() + interval '1 day', $2, 'scheduled')`, [lead.id, agent.id]);
  ok("CAN schedule a follow-up for themselves", !r.err, r.err);

  console.log("\n▸ Manager (has the key)");
  r = await tryAs(mgr.auth_user_id, `update leads set assigned_user_id=$2 where id=$1`, [lead.id, other.id]);
  ok("manager CAN reassign the lead", !r.err && r.count === 1, r.err);
  r = await tryAs(mgr.auth_user_id, `insert into lead_followup_history(lead_id, scheduled_at, followup_user_id, status) values ($1, now() + interval '2 day', $2, 'scheduled')`, [lead.id, agent.id]);
  ok("manager CAN give a follow-up to another agent", !r.err, r.err);

  console.log("\n▸ Switching the access ON for Sales Agents again (the Roles & Permissions toggle)");
  await sys(`update leads set assigned_user_id=$2 where id=$1`, [lead.id, agent.id]);   // put the lead back with the agent
  await sys(`insert into role_permissions(role_id, permission_key) values ('sales_agent','leads_reassign_access') on conflict do nothing`);
  r = await tryAs(agent.auth_user_id, `update leads set assigned_user_id=$2 where id=$1`, [lead.id, other.id]);
  ok("agent CAN now change the owner of their lead", !r.err && r.count === 1, r.err);
  await sys(`update leads set assigned_user_id=$2 where id=$1`, [lead.id, agent.id]);
  r = await tryAs(agent.auth_user_id, `insert into lead_followup_history(lead_id, scheduled_at, followup_user_id, status) values ($1, now() + interval '3 day', $2, 'scheduled')`, [lead.id, other.id]);
  ok("agent CAN now give a follow-up to another agent", !r.err, r.err);
  r = await tryAs(agent.auth_user_id, `update leads set follow_up_agent_id=$2 where id=$1`, [lead.id, other.id]);
  ok("agent CAN now set another follow-up agent on the lead", !r.err, r.err);

  console.log("\n▸ The key alone is enough (a role without leads_reassign / leads_assign)");
  await sys(`update leads set assigned_user_id=$2 where id=$1`, [lead.id, agent.id]);
  await sys(`delete from role_permissions where role_id='sales_agent' and permission_key in ('leads_reassign','leads_assign','assign','manage_sales')`);
  r = await tryAs(agent.auth_user_id, `update leads set assigned_user_id=$2 where id=$1`, [lead.id, other.id]);
  ok("key-only role CAN reassign (leads_ownership_guard accepts it)", !r.err && r.count === 1, r.err);

  console.log("\n▸ Switching it OFF again");
  await sys(`update leads set assigned_user_id=$2 where id=$1`, [lead.id, agent.id]);
  await sys(`delete from role_permissions where role_id='sales_agent' and permission_key='leads_reassign_access'`);
  await sys(`insert into role_permissions(role_id, permission_key) values ('sales_agent','leads_reassign') on conflict do nothing`);
  r = await tryAs(agent.auth_user_id, `update leads set assigned_user_id=$2 where id=$1`, [lead.id, other.id]);
  ok("blocked again the moment the key is removed (even with leads_reassign)", /lead_reassign_access_forbidden/.test(r.err || ""), r.err);

  console.log("\n▸ First assignment is not reassignment");
  await sys(`update leads set assigned_user_id=null where id=$1`, [lead.id]);
  r = await tryAs(agent.auth_user_id, `update leads set assigned_user_id=$2 where id=$1`, [lead.id, agent.id]);
  ok("an unowned lead can still be given its first owner (not blocked by this key)", !/lead_reassign_access_forbidden/.test(r.err || ""), r.err);
} catch (e) { fail++; console.log("  ERROR ", e.message); }
finally { try { await c.query("rollback"); } catch {} await c.end(); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
