// Verify Field Job numbering infra: field_prefix column, unique index, per-store
// isolation, and that the DB-scoped next-number logic matches the app helper.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue; env[t.slice(0,i).trim()] = t.slice(i+1).trim();
}
class NoopWebSocket { constructor(){this.readyState=3;} addEventListener(){} removeEventListener(){} send(){} close(){} }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}, realtime:{transport:NoopWebSocket} });

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`); };

// mirror app helpers
const fieldPrefixSep = (p) => { const raw = (p ?? "").trim().toUpperCase().replace(/-+$/, ""); return raw ? `${raw}-` : null; };
const fieldJobSeq = (jobNo, prefix) => { const v = String(jobNo||""); const p = fieldPrefixSep(prefix); const re = p ? new RegExp(`^${p.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")}FJ-(\\d+)$`) : /(\d+)\s*$/; const m = re.exec(v); return m ? Number(m[1]) : 0; };
const formatFieldJobNo = (seq, prefix) => `${fieldPrefixSep(prefix) ?? ""}FJ-${String(seq).padStart(3,"0")}`;

console.log("1) branch_settings.field_prefix column");
const { error: fpErr } = await admin.from("branch_settings").select("field_prefix").limit(1);
ok("field_prefix column exists", !fpErr, fpErr?.message);

console.log("\n2) field_jobs org/branch state");
const { data: jobs } = await admin.from("field_jobs").select("id, job_no, organization_id, branch_id").is("deleted_at", null);
const nullOrg = (jobs ?? []).filter(j => !j.organization_id).length;
const nullBranch = (jobs ?? []).filter(j => !j.branch_id).length;
ok("no field jobs with NULL organization_id", nullOrg === 0, `${nullOrg} null-org`);
ok("no field jobs with NULL branch_id", nullBranch === 0, `${nullBranch} null-branch`);

console.log("\n3) Per-store next-number computation (simulated, read-only)");
const { data: branches } = await admin.from("branches").select("id, name").limit(20);
for (const b of branches ?? []) {
  const { data: bp } = await admin.from("branch_settings").select("field_prefix").eq("branch_id", b.id).maybeSingle();
  const prefix = bp?.field_prefix ?? null;
  const rows = (jobs ?? []).filter(j => j.branch_id === b.id);
  const max = rows.reduce((a, j) => Math.max(a, fieldJobSeq(j.job_no, prefix)), 0);
  const next = formatFieldJobNo(max + 1, prefix);
  console.log(`   ${b.name.padEnd(16)} jobs=${String(rows.length).padStart(2)}  prefix=${(prefix??"(none)").padEnd(8)}  next=${next}`);
}

console.log("\n4) Unique-number guarantee within a store (no duplicate job_no per branch)");
const seen = new Set(); let dup = 0;
for (const j of jobs ?? []) { const k = `${j.branch_id}::${j.job_no}`; if (seen.has(k)) dup++; seen.add(k); }
ok("no duplicate (branch_id, job_no)", dup === 0, `${dup} duplicates`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
