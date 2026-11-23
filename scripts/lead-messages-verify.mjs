// RepairOX — Lead Conversation verification (DB). node scripts/lead-messages-verify.mjs
// One transaction, ALWAYS rolled back. Impersonates real users (JWT claims + authenticated role).
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
async function as(uid, sql, p = []) {
  await c.query("reset role");
  await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
  await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
  await c.query("set local role authenticated");
  return (await c.query(sql, p)).rows;
}
async function tryAs(uid, sql, p = []) { await c.query("savepoint s"); try { const r = await as(uid, sql, p); await c.query("release savepoint s"); return { rows: r }; } catch (e) { await c.query("rollback to savepoint s"); return { err: String(e.message) }; } }
try {
  await c.query("begin");
  const [job] = await sys(`select j.id, j.lead_id, j.ninja_id, j.sales_person_id from field_jobs j where j.ninja_id is not null and j.sales_person_id is not null and j.lead_id ~* '^[0-9a-f-]{36}$' and j.deleted_at is null limit 1`);
  if (!job) throw new Error("no fixture job with a ninja + sales person");
  const FM = (await sys(`select id, auth_user_id from staff where role_id='manager' and auth_user_id is not null limit 1`))[0];
  await sys(`update field_jobs set field_manager_id=$1 where id=$2`, [FM.id, job.id]);
  const sales = (await sys(`select id, name, auth_user_id from staff where id=$1`, [job.sales_person_id]))[0];
  const ninja = (await sys(`select id, name, auth_user_id from staff where id=$1`, [job.ninja_id]))[0];
  const outsider = (await sys(`select id, auth_user_id from staff where role_id='ninja' and id<>$1 and auth_user_id is not null limit 1`, [ninja.id]))[0];
  const lead = job.lead_id;
  console.log(`\nlead ${lead}  sales=${sales.name}  ninja=${ninja.name}`);

  console.log("\n▸ Chain + addressing");
  const ppl = await as(sales.auth_user_id, `select * from lead_message_people($1)`, [lead]);
  ok("sales sees FM + Ninja on the lead", ppl.some((p) => p.staff_id === ninja.id) && ppl.some((p) => p.staff_id === FM.id), ppl.map((p) => `${p.name}:${p.role_label}`).join(", "));
  const sent = await tryAs(sales.auth_user_id, `select * from lead_message_send($1,$2,$3,null)`, [lead, "Customer changed the pickup time to 5pm", [ninja.id]]);
  ok("sales sends to the Ninja", !!sent.rows?.[0]?.id, sent.err);
  const msgId = sent.rows?.[0]?.id;
  ok("audience is exactly the Ninja", JSON.stringify(sent.rows?.[0]?.audience) === JSON.stringify([ninja.id]));

  console.log("\n▸ Recipient reads + replies");
  const seen = await as(ninja.auth_user_id, `select id from lead_messages where lead_id=$1`, [lead]);
  ok("Ninja can read the message", seen.some((r) => r.id === msgId));
  const noteRows = await sys(`select recipient_id from notifications where dedupe_key like $1`, ["lm:" + msgId + "%"]);
  ok("Ninja got a notification", noteRows.some((r) => r.recipient_id === ninja.id));
  const rep = await tryAs(ninja.auth_user_id, `select * from lead_message_send($1,$2,$3,$4)`, [lead, "On my way", [sales.id], msgId]);
  ok("Ninja replies to the Sales Agent", !!rep.rows?.[0]?.id, rep.err);
  const back = await as(sales.auth_user_id, `select author_role, reply_to from lead_messages where lead_id=$1 order by created_at`, [lead]);
  ok("Sales sees the reply (threaded)", back.length >= 2 && back.some((r) => r.reply_to === msgId));
  // A manager-role Field Manager can see the lead itself (auth_lead_visible), so they can read its thread too.
  const fmSees = await as(FM.auth_user_id, `select id from lead_messages where lead_id=$1`, [lead]);
  ok("Field Manager (lead-visible role) can read the lead's thread", fmSees.length >= 1);
  const toFm = await tryAs(sales.auth_user_id, `select * from lead_message_send($1,$2,$3,null)`, [lead, "FYI everyone", []]);
  ok("empty audience = everyone else on the lead", toFm.rows?.[0]?.audience?.length === ppl.filter((p) => p.staff_id !== sales.id).length && toFm.rows[0].audience.includes(FM.id) && toFm.rows[0].audience.includes(ninja.id), toFm.err);
  const nSees = await as(ninja.auth_user_id, `select id from lead_messages where lead_id=$1`, [lead]);
  ok("Ninja sees the 'everyone' message too", nSees.some((r) => r.id === toFm.rows?.[0]?.id));
  const fmReply = await tryAs(FM.auth_user_id, `select * from lead_message_send($1,$2,$3,null)`, [lead, "Noted, I will assign", [sales.id]]);
  ok("Field Manager replies", !!fmReply.rows?.[0]?.id, fmReply.err);

  console.log("\n▸ Outsiders + forgery");
  const out = await as(outsider.auth_user_id, `select id from lead_messages where lead_id=$1`, [lead]);
  ok("a Ninja not on this lead reads nothing", out.length === 0);
  const outSend = await tryAs(outsider.auth_user_id, `select * from lead_message_send($1,$2,$3,null)`, [lead, "hi", [sales.id]]);
  ok("a Ninja not on this lead cannot send", !!outSend.err && /not_on_this_lead/.test(outSend.err), outSend.err);
  const toOut = await tryAs(sales.auth_user_id, `select * from lead_message_send($1,$2,$3,null)`, [lead, "hi", [outsider.id]]);
  ok("cannot address someone who is not on the lead", !!toOut.err && /no_recipients/.test(toOut.err), toOut.err);
  const direct = await tryAs(sales.auth_user_id, `insert into lead_messages(organization_id, lead_id, author_id, body, audience) select organization_id, id, $2::uuid, 'forged', '{}' from leads where id=$1`, [lead, ninja.id]);
  ok("direct INSERT is blocked (no client write policy)", !!direct.err, direct.err);
  const rd = await tryAs(ninja.auth_user_id, `select lead_message_mark_read($1)`, [lead]);
  ok("mark read works", !rd.err, rd.err);
} catch (e) { fail++; console.log("  ERROR ", e.message); }
finally { try { await c.query("rollback"); } catch {} await c.end(); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
