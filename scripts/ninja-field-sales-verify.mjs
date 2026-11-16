/* Verifies migration 0106 (Ninja tickets/invoices/inventory + activity footprint + stats views)
   at DB level with real users. It APPLIES the migration inside the transaction and ROLLS BACK,
   so it is safe before AND after the migration has been applied. Run: npm run ninja:sales:verify */
import { createRequire } from "module";
import fs from "fs";
const pg = createRequire(import.meta.url)("pg");
const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^SUPABASE_DB_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
const sql = fs.readFileSync(new URL("../supabase/migrations/0106_ninja_field_sales_and_activity.sql", import.meta.url), "utf8");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = async (q, p) => (await c.query(q, p)).rows;
let pass = 0, fail = 0;
const ok = (name, v) => { v ? pass++ : fail++; console.log(`${v ? "PASS" : "FAIL"}  ${name}`); };
const as = async (u) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: u, role: "authenticated" })]); await c.query("set local role authenticated"); };
const svc = () => c.query("reset role");
const tryQ = async (q, p) => { await c.query("savepoint s"); try { const x = await c.query(q, p); await c.query("release savepoint s"); return { err: null, rows: x.rows, n: x.rowCount }; } catch (e) { await c.query("rollback to savepoint s"); return { err: e.message, rows: [], n: 0 }; } };
await c.query("begin");
try {
  await c.query(sql);
  const [own] = await r(`select s.id, s.auth_user_id, s.organization_id, s.branch_id from staff s join role_permissions rp on rp.role_id=s.role_id
                          where rp.permission_key in ('full_access','*') and s.auth_user_id is not null and s.status='active' limit 1`);
  const ninjas = await r(`select id, auth_user_id, branch_id from staff where role_id='ninja' and organization_id=$1 and auth_user_id is not null order by email limit 2`, [own.organization_id]);
  const [n1, n2] = ninjas;
  const br = n1.branch_id;
  ok("0 ninja role holds the new keys", (await r(`select count(*)::int n from role_permissions where role_id='ninja' and permission_key in ('create_ticket','create_invoice','view_inventory','view_ticket','view_invoice')`))[0].n === 5);

  // trip assigned + accepted by ninja1
  await as(own.auth_user_id);
  const [job] = await r(`insert into field_jobs(organization_id,branch_id,lead_type,status,customer,phone,device,pickup_address) values ($1,$2,'pickup','pending_assignment','[VERIFY] C','9000000088','Pixel','addr') returning id`, [own.organization_id, br]);
  const [t] = await r(`select id from field_trips where job_id=$1`, [job.id]);
  await c.query(`update field_trips set status='assigned', ninja_id=$2 where id=$1`, [t.id, n1.id]);
  await as(n1.auth_user_id);
  await c.query(`update field_trips set status='accepted' where id=$1`, [t.id]);

  // tickets
  const tid = "VERIFY-T-" + Date.now();
  const ins = await tryQ(`insert into tickets(id, organization_id, branch_id, customer, phone, device, model, issue, status, priority, amount) values ($1,$2,$3,'[VERIFY] C','9000000088','Google','Pixel','Screen','in_progress','normal',100) returning created_by`, [tid, own.organization_id, br]);
  ok("T1 ninja can create a ticket in own store", !ins.err);
  ok("T2 created_by stamped to the ninja", ins.rows[0]?.created_by === n1.id);
  const [otherBr] = await r(`select id from branches where organization_id=$1 and id<>$2 limit 1`, [own.organization_id, br]);
  if (otherBr) ok("T3 ninja cannot create a ticket in another store", !!(await tryQ(`insert into tickets(id, organization_id, branch_id, customer, status, priority, amount) values ($1,$2,$3,'x','in_progress','normal',1)`, ["VERIFY-X-" + Date.now(), own.organization_id, otherBr.id])).err);
  ok("T4 ninja can update own ticket", (await tryQ(`update tickets set internal_notes='n' where id=$1`, [tid])).n === 1);
  await svc();
  const otherId = "VERIFY-O-" + Date.now();
  await c.query(`insert into tickets(id, organization_id, branch_id, customer, status, priority, amount, created_by) values ($1,$2,$3,'o','in_progress','normal',1,$4)`, [otherId, own.organization_id, br, own.id]);
  await as(n1.auth_user_id);
  ok("T5 ninja cannot update someone else's ticket", (await tryQ(`update tickets set internal_notes='hack' where id=$1`, [otherId])).n === 0);

  // invoices
  const iid = "VERIFY-I-" + Date.now();
  const ii = await tryQ(`insert into invoices(id, organization_id, branch_id, customer, status, subtotal, total, paid_amount, ticket_id) values ($1,$2,$3,'[VERIFY] C','paid',100,100,100,$4) returning created_by`, [iid, own.organization_id, br, tid]);
  ok("I1 ninja can create an invoice", !ii.err);
  ok("I2 ninja reads back own invoice", (await r(`select id from invoices where id=$1`, [iid])).length === 1);
  await svc();
  const otherInv = "VERIFY-OI-" + Date.now();
  await c.query(`insert into invoices(id, organization_id, branch_id, customer, status, subtotal, total, paid_amount, created_by) values ($1,$2,$3,'o','paid',1,1,1,$4)`, [otherInv, own.organization_id, br, own.id]);
  await as(n1.auth_user_id);
  ok("I3 ninja cannot read others' invoices", (await r(`select id from invoices where id=$1`, [otherInv])).length === 0);
  const [ty] = await r(`select invoice_type from invoices where id=$1`, [iid]);
  ok("I3b numbering RPC returns ids of invoices the ninja cannot read", (await r(`select id from invoice_series_ids($1, null)`, [ty.invoice_type])).some((x) => x.id === otherInv));
  ok("I4 ninja can update own invoice", (await tryQ(`update invoices set notes='x' where id=$1`, [iid])).n === 1);
  ok("I5 ninja cannot update others' invoices", (await tryQ(`update invoices set notes='x' where id=$1`, [otherInv])).n === 0);

  // inventory
  ok("V1 ninja can read inventory", !(await tryQ(`select id from inventory_items limit 1`)).err);
  ok("V2 ninja cannot write inventory", !!(await tryQ(`insert into inventory_items(id, organization_id, branch_id, name) values ('VERIFY-INV',$1,$2,'x')`, [own.organization_id, br])).err);

  // link RPC
  ok("L1 direct trip ticket_id write still manager-only", /manager_only/.test((await tryQ(`update field_trips set ticket_id=$2 where id=$1`, [t.id, tid])).err ?? ""));
  ok("L2 link RPC attaches ticket + invoice", !(await tryQ(`select ninja_link_trip_docs($1,$2,$3)`, [t.id, tid, iid])).err);
  await svc();
  const [lt] = await r(`select ticket_id, invoice_id from field_trips where id=$1`, [t.id]);
  const [lj] = await r(`select linked_ticket_id, linked_invoice_id from field_jobs where id=$1`, [job.id]);
  ok("L3 trip + job carry the links", lt.ticket_id === tid && lt.invoice_id === iid && lj.linked_ticket_id === tid && lj.linked_invoice_id === iid);
  ok("L4 manager-visible event written", (await r(`select count(*)::int n from field_trip_events where trip_id=$1 and event_type in ('ticket_created','invoice_created')`, [t.id]))[0].n >= 1);
  await as(n2.auth_user_id);
  ok("L5 another ninja cannot link to this trip", /not_assignee/.test((await tryQ(`select ninja_link_trip_docs($1,$2,null)`, [t.id, tid])).err ?? ""));
  await as(n1.auth_user_id);
  ok("L6 cannot link a ticket you did not create", /not_yours/.test((await tryQ(`select ninja_link_trip_docs($1,$2,null)`, [t.id, otherId])).err ?? ""));

  // activity log
  await as(n1.auth_user_id);
  const a1 = await tryQ(`insert into ninja_activity_log(organization_id, staff_id, kind, screen, payload, idempotency_key) values ($1,$2,'screen_view','jobs','{}','k1')`, [own.organization_id, n1.id]);
  ok("A1 ninja logs own activity", !a1.err);
  const a2 = await tryQ(`insert into ninja_activity_log(organization_id, staff_id, kind) values ($1,$2,'x') returning staff_id`, [own.organization_id, n2.id]);
  ok("A2 cannot log as someone else (forced to caller)", !!a2.err || a2.rows[0]?.staff_id === n1.id);
  ok("A3 duplicate idempotency key rejected", !!(await tryQ(`insert into ninja_activity_log(organization_id, staff_id, kind, idempotency_key) values ($1,$2,'screen_view','k1')`, [own.organization_id, n1.id])).err);
  ok("A4 append-only (no update)", (await tryQ(`update ninja_activity_log set kind='z'`)).n === 0);
  ok("A5 append-only (no delete)", (await tryQ(`delete from ninja_activity_log`)).n === 0);
  await as(n2.auth_user_id);
  ok("A6 another ninja cannot read it", (await r(`select id from ninja_activity_log`)).length === 0);
  await as(own.auth_user_id);
  ok("A7 manager can read store activity", (await r(`select id from ninja_activity_log`)).length >= 1);

  // views
  await as(own.auth_user_id);
  ok("S1 trip stats view returns the trip", (await r(`select trip_id from field_ninja_trip_stats_v where trip_id=$1`, [t.id])).length === 1);
  ok("S2 assignment stats view works", !(await tryQ(`select * from field_ninja_assignment_stats_v limit 1`)).err);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
