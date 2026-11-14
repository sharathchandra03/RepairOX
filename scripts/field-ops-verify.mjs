/* Field Operations end-to-end verification (DB level, real users, ROLLED BACK).
   Run: npm run field:ops:verify
   Covers: assignment/accept/reject history, pickup chain of custody, store-only
   steps, ticket repaired -> drop trip, drop release + delivery, cancel rules,
   idempotency, GPS session lifecycle, location visibility, notifications,
   Ninja data isolation, legacy Field UI sync. Nothing is persisted. */
import { createRequire } from "module";
import fs from "fs";
const pg = createRequire(import.meta.url)("pg");
const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^SUPABASE_DB_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = async (q, p) => (await c.query(q, p)).rows;
let pass = 0, fail = 0;
const ok = (name, v) => { v ? pass++ : fail++; console.log(`${v ? "PASS" : "FAIL"}  ${name}`); };
const as = async (u) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: u, role: "authenticated" })]); await c.query("set local role authenticated"); };
const svc = () => c.query("reset role");
const tryQ = async (q, p) => { await c.query("savepoint s"); try { await c.query(q, p); await c.query("release savepoint s"); return null; } catch (e) { await c.query("rollback to savepoint s"); return e.message; } };

await c.query("begin");
try {
  const [own] = await r(`select s.id, s.auth_user_id, s.organization_id, s.branch_id from staff s join role_permissions rp on rp.role_id=s.role_id
                          where rp.permission_key in ('full_access','*') and s.auth_user_id is not null and s.status='active' limit 1`);
  const ninjas = await r(`select id, auth_user_id from staff where role_id='ninja' and organization_id=$1 and auth_user_id is not null order by email limit 3`, [own.organization_id]);
  const [sales] = await r(`select s.id, s.auth_user_id from staff s where s.role_id='sales_agent' and s.organization_id=$1 and s.auth_user_id is not null
                            order by (select count(*) from leads l where l.assigned_user_id=s.id and l.deleted_at is null) desc limit 1`, [own.organization_id]);
  if (ninjas.length < 3) throw new Error("need 3 ninja users");
  const [n1, n2, n3] = ninjas;
  const br = (await r(`select branch_id from staff where id=$1`, [n1.id]))[0].branch_id;   // the Ninjas' store

  // A — routed job auto-creates the first trip
  await as(own.auth_user_id);
  const [job] = await r(`insert into field_jobs(organization_id,branch_id,lead_type,status,customer,phone,device,pickup_address,location_lat,location_lng)
                         values ($1,$2,'pickup','pending_assignment','[VERIFY] Customer','9000000099','Pixel 7','Test addr',12.97,77.6) returning id`, [own.organization_id, br]);
  let [t] = await r(`select id,status,trip_no from field_trips where job_id=$1`, [job.id]);
  ok("A1 job insert auto-creates pickup trip", t?.status === "awaiting_assignment" && /-P1$/.test(t.trip_no));

  // B — eligibility, assign, reject (history), reassign, accept
  const [far] = await r(`select id from branches where organization_id=$1 and id<>$2 limit 1`, [own.organization_id, br]);
  if (far) {
    await svc();
    const [jf] = await r(`insert into field_jobs(organization_id,branch_id,lead_type,status,customer) values ($1,$2,'pickup','pending_assignment','[VERIFY] far') returning id`, [own.organization_id, far.id]);
    const [tf] = await r(`select id from field_trips where job_id=$1`, [jf.id]);
    await as(own.auth_user_id);
    ok("B0 ninja from another store is not eligible", /not_eligible/.test(await tryQ(`update field_trips set status='assigned', ninja_id=$2 where id=$1`, [tf.id, n1.id]) ?? ""));
  }
  await c.query(`update field_trips set status='assigned', ninja_id=$2 where id=$1`, [t.id, n1.id]);
  await as(n1.auth_user_id);
  ok("B1 ninja receives assignment notification", (await r(`select count(*)::int n from notifications where recipient_id=$1 and kind='field_trip_assigned' and reference=$2`, [n1.id, t.trip_no]))[0].n === 1);
  await c.query(`update field_trips set status='awaiting_assignment', failure_reason='Too far' where id=$1`, [t.id]);
  await svc();
  const h1 = await r(`select outcome, reject_reason from field_assignments where trip_id=$1`, [t.id]);
  ok("B2 rejection kept in history with reason", h1.length === 1 && h1[0].outcome === "rejected" && h1[0].reject_reason === "Too far");
  await as(n1.auth_user_id);
  ok("B2b rejecting ninja still sees it in own history", (await r(`select count(*)::int n from field_trips where id=$1`, [t.id]))[0].n === 1);
  await as(own.auth_user_id);
  await c.query(`update field_trips set status='assigned', ninja_id=$2 where id=$1`, [t.id, n2.id]);
  await as(n2.auth_user_id);
  await c.query(`update field_trips set status='accepted' where id=$1`, [t.id]);
  await svc();
  ok("B3 history: rejected + accepted rows", (await r(`select string_agg(outcome,',' order by assigned_at) o from field_assignments where trip_id=$1`, [t.id]))[0].o === "rejected,accepted");
  ok("B4 manager notified of acceptance", (await r(`select count(*)::int n from notifications where kind='field_trip_update' and title like '%accepted%' and reference=$1`, [t.trip_no]))[0].n > 0);

  // I — isolation
  await as(n3.auth_user_id);
  ok("I1 other ninja cannot see the trip", (await r(`select count(*)::int n from field_trips where id=$1`, [t.id]))[0].n === 0);
  ok("I2 other ninja cannot see the job", (await r(`select count(*)::int n from field_jobs where id=$1`, [job.id]))[0].n === 0);
  ok("I3 other ninja cannot move the trip", (await tryQ(`update field_trips set status='en_route_customer' where id=$1`, [t.id])) !== null || (await r(`select status from field_trips where id=$1`, [t.id])).length === 0);

  // C — pickup execution + GPS
  await as(n2.auth_user_id);
  ok("C0 skipping steps rejected", !!(await tryQ(`update field_trips set status='device_collected' where id=$1`, [t.id])));
  ok("C00 ninja cannot edit manager fields", /manager_only/.test(await tryQ(`update field_trips set dest_address='x' where id=$1`, [t.id]) ?? ""));
  await c.query(`update field_trips set status='en_route_customer' where id=$1`, [t.id]);
  const [ses] = await r(`insert into field_tracking_sessions(organization_id,branch_id,trip_id,staff_id) values ($1,$2,$3,$4) returning id`, [own.organization_id, br, t.id, n2.id]);
  await c.query(`insert into field_location_points(organization_id,session_id,trip_id,staff_id,seq,lat,lng,accuracy) values ($1,$2,$3,$4,1,12.96,77.61,8)`, [own.organization_id, ses.id, t.id, n2.id]);
  ok("C1 duplicate GPS seq rejected (idempotent)", !!(await tryQ(`insert into field_location_points(organization_id,session_id,trip_id,staff_id,seq,lat,lng) values ($1,$2,$3,$4,1,12.96,77.61)`, [own.organization_id, ses.id, t.id, n2.id])));
  await as(own.auth_user_id);
  ok("C2 manager sees live session", (await r(`select last_lat from field_tracking_sessions where id=$1`, [ses.id]))[0]?.last_lat === 12.96);
  if (sales) { await as(sales.auth_user_id); ok("C3 sales agent cannot see ninja location", (await r(`select count(*)::int n from field_tracking_sessions where id=$1`, [ses.id]))[0].n === 0); }
  await as(n2.auth_user_id);
  for (const s of ["arrived_customer", "pickup_in_progress"]) await c.query(`update field_trips set status=$2 where id=$1`, [t.id, s]);
  await svc();
  ok("C4 tracking session auto-closed on arrival", (await r(`select ended_at is not null c from field_tracking_sessions where id=$1`, [ses.id]))[0].c);
  await as(n2.auth_user_id);
  await c.query(`insert into field_handovers(organization_id,branch_id,trip_id,job_id,kind,status,ack_method,idempotency_key) values ($1,$2,$3,$4,'customer_to_ninja','accepted','signature','k1')`, [own.organization_id, br, t.id, job.id]);
  ok("C5 duplicate handover (offline retry) rejected", !!(await tryQ(`insert into field_handovers(organization_id,branch_id,trip_id,job_id,kind,status,idempotency_key) values ($1,$2,$3,$4,'customer_to_ninja','accepted','k1')`, [own.organization_id, br, t.id, job.id])));
  await c.query(`update field_trips set status='device_collected' where id=$1`, [t.id]);
  ok("C6 cancel blocked while device is in custody", !!(await tryQ(`update field_trips set status='cancelled' where id=$1`, [t.id])));
  for (const s of ["en_route_store", "arrived_store", "handover_pending"]) await c.query(`update field_trips set status=$2 where id=$1`, [t.id, s]);

  // D — store receipt (store-only)
  ok("D1 ninja cannot self-confirm store receipt", !!(await tryQ(`update field_trips set status='store_received' where id=$1`, [t.id])));
  await as(own.auth_user_id);
  await c.query(`update field_trips set status='store_received' where id=$1`, [t.id]);
  await c.query(`update field_trips set status='completed' where id=$1`, [t.id]);
  await svc();
  ok("D2 field job mirrored to at_store", (await r(`select status from field_jobs where id=$1`, [job.id]))[0].status === "at_store");
  ok("D3 sales/manager milestone notifications written", (await r(`select count(*)::int n from notifications where reference=$1 and title like 'Store received%'`, [t.trip_no]))[0].n > 0);

  // E — ticket repaired -> drop trip
  const [tk] = await r(`select id from tickets where organization_id=$1 limit 1`, [own.organization_id]);
  await c.query(`update field_jobs set linked_ticket_id=$2 where id=$1`, [job.id, tk.id]);
  await c.query(`update tickets set status='in_progress' where id=$1`, [tk.id]);
  await c.query(`update tickets set status='repaired' where id=$1`, [tk.id]);
  let [d] = await r(`select id,status,trip_no,ticket_id from field_trips where job_id=$1 and trip_type='drop'`, [job.id]);
  ok("E1 repaired ticket creates ONE drop trip", !!d && d.status === "awaiting_assignment");
  await c.query(`update tickets set status='in_progress' where id=$1`, [tk.id]); await c.query(`update tickets set status='repaired' where id=$1`, [tk.id]);
  ok("E2 no duplicate drop trip on re-trigger", (await r(`select count(*)::int n from field_trips where job_id=$1 and trip_type='drop'`, [job.id]))[0].n === 1);

  // F — drop: legacy UI assign syncs, store release, delivery
  await as(own.auth_user_id);
  await c.query(`update field_jobs set drop_ninja_id=$2, drop_ninja_name='x' where id=$1`, [job.id, n1.id]);
  ok("F1 legacy drop-ninja assignment syncs to trip", (await r(`select status,ninja_id from field_trips where id=$1`, [d.id]))[0].ninja_id === n1.id);
  await as(n1.auth_user_id);
  for (const s of ["accepted", "arrived_store"]) await c.query(`update field_trips set status=$2 where id=$1`, [d.id, s]);
  ok("F2 ninja cannot self-release device from store", !!(await tryQ(`update field_trips set status='store_dispatch_confirmed' where id=$1`, [d.id])));
  await as(own.auth_user_id);
  await c.query(`update field_trips set status='store_dispatch_confirmed' where id=$1`, [d.id]);
  await as(n1.auth_user_id);
  ok("F3 ninja notified of release", (await r(`select count(*)::int n from notifications where recipient_id=$1 and kind='field_trip_released'`, [n1.id]))[0].n > 0);
  for (const s of ["device_received_by_ninja", "en_route_customer", "arrived_customer", "delivery_in_progress", "delivered", "completed"]) await c.query(`update field_trips set status=$2 where id=$1`, [d.id, s]);
  await svc();
  ok("F4 job completed after delivery", (await r(`select status from field_jobs where id=$1`, [job.id]))[0].status === "completed");
  ok("F5 invoice/payment untouched by delivery", (await r(`select count(*)::int n from invoices where ticket_id=$1 and updated_at > now() - interval '1 minute'`, [tk.id]).catch(() => [{ n: 0 }]))[0].n === 0);

  // K — Sales Agent sees the field job/trips of their OWN lead only (read-only, no location)
  if (sales) {
    const [ld] = await r(`select id from leads where assigned_user_id=$1 and deleted_at is null limit 1`, [sales.id]).catch(() => []);
    if (ld) {
      await svc();
      const [jl] = await r(`insert into field_jobs(organization_id,branch_id,lead_type,status,customer,lead_id) values ($1,$2,'pickup','pending_assignment','[VERIFY] lead',$3) returning id`, [own.organization_id, br, ld.id]);
      await as(sales.auth_user_id);
      ok("K1 sales agent sees own lead's field job", (await r(`select count(*)::int n from field_jobs where id=$1`, [jl.id]))[0].n === 1);
      ok("K2 sales agent sees own lead's trip", (await r(`select count(*)::int n from field_trips where job_id=$1`, [jl.id]))[0].n === 1);
      ok("K3 sales agent does not see unrelated trip", (await r(`select count(*)::int n from field_trips where id=$1`, [t.id]))[0].n === 0);
      ok("K4 sales agent cannot move a trip", (await tryQ(`update field_trips set status='assigned' where job_id=$1`, [jl.id])) !== null || (await r(`select status from field_trips where job_id=$1`, [jl.id]))[0].status === "awaiting_assignment");
    } else console.log("SKIP  K* (sales agent has no lead)");
  }

  // J — cancel a drop trip never cancels the service job
  await svc();
  const [job2] = await r(`insert into field_jobs(organization_id,branch_id,lead_type,status,customer) values ($1,$2,'drop','ready_for_drop','[VERIFY] D') returning id`, [own.organization_id, br]);
  const [d2] = await r(`select id from field_trips where job_id=$1`, [job2.id]);
  await as(own.auth_user_id);
  await c.query(`update field_trips set status='cancelled', failure_reason='test' where id=$1`, [d2.id]);
  await svc();
  ok("J1 drop cancel keeps job open (ready_for_drop)", (await r(`select status from field_jobs where id=$1`, [job2.id]))[0].status === "ready_for_drop");
  ok("J2 trip events append-only (no update policy)", (await r(`select count(*)::int n from pg_policies where tablename='field_trip_events' and cmd in ('UPDATE','DELETE')`))[0].n === 0);
  ok("J3 tracking tokens unreadable by end users (no policies)", (await r(`select count(*)::int n from pg_policies where tablename='field_tracking_tokens'`))[0].n === 0);
} catch (e) {
  fail++; console.log("ERROR", e.message, e.stack?.split("\n")[1]);
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
console.log(`\n${pass} passed, ${fail} failed (all changes rolled back)`);
process.exit(fail ? 1 : 0);
