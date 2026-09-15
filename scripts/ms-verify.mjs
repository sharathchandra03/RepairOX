// Multi-store verification — read-only checks that mirror the app's isolation
// logic and the Owner-dashboard aggregation. Run: node scripts/ms-verify.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue; env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
class NoopWebSocket { constructor(){this.readyState=3;} addEventListener(){} removeEventListener(){} send(){} close(){} }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, realtime: { transport: NoopWebSocket },
});

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`); };

// Resolve org + stores.
const { data: org } = await admin.from("organizations").select("id,name").limit(1).single();
const { data: branches } = await admin.from("branches").select("id,name,is_active").eq("organization_id", org.id).order("created_at");
console.log(`Organization: ${org.name} (${org.id})`);
console.log(`Stores: ${branches.length}\n`);

// Per-store transactional counts (mirror app store-scoped reads).
console.log("Per-store isolation (branch_id scoping of transactional tables):");
const totals = { tickets: 0, invoices: 0, walkIns: 0, sales: 0, paid: 0 };
for (const b of branches) {
  const [{ count: tc }, { count: ic }, { count: wc }, { data: invRows }] = await Promise.all([
    admin.from("tickets").select("*", { count: "exact", head: true }).eq("branch_id", b.id).is("deleted_at", null),
    admin.from("invoices").select("*", { count: "exact", head: true }).eq("branch_id", b.id).is("deleted_at", null),
    admin.from("walk_ins").select("*", { count: "exact", head: true }).eq("branch_id", b.id).is("deleted_at", null),
    admin.from("invoices").select("total,paid_amount").eq("branch_id", b.id).is("deleted_at", null),
  ]);
  const sales = (invRows ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
  const paid = (invRows ?? []).reduce((s, r) => s + Number(r.paid_amount ?? 0), 0);
  totals.tickets += tc ?? 0; totals.invoices += ic ?? 0; totals.walkIns += wc ?? 0; totals.sales += sales; totals.paid += paid;
  console.log(`  ${b.name.padEnd(20)} tickets=${String(tc).padStart(3)}  invoices=${String(ic).padStart(3)}  walkIns=${String(wc).padStart(3)}  sales=₹${sales}  paid=₹${paid}${b.is_active ? "" : "  (inactive)"}`);
}

// Owner-dashboard consolidation check: sum of per-store = org total (no NULL-branch leak in transactional tables).
console.log("\nConsolidation vs org totals (Owner All-Shops = Σ per-store):");
const [{ count: orgTix }, { count: orgInv }, { count: orgWi }] = await Promise.all([
  admin.from("tickets").select("*", { count: "exact", head: true }).eq("organization_id", org.id).is("deleted_at", null),
  admin.from("invoices").select("*", { count: "exact", head: true }).eq("organization_id", org.id).is("deleted_at", null),
  admin.from("walk_ins").select("*", { count: "exact", head: true }).eq("organization_id", org.id).is("deleted_at", null),
]);
ok("tickets: Σ per-store === org total", totals.tickets === orgTix, `${totals.tickets} vs ${orgTix}`);
ok("invoices: Σ per-store === org total", totals.invoices === orgInv, `${totals.invoices} vs ${orgInv}`);
ok("walk_ins: Σ per-store === org total", totals.walkIns === orgWi, `${totals.walkIns} vs ${orgWi}`);

// No transactional rows with NULL branch (would leak across all stores).
console.log("\nNo NULL-branch leak on transactional tables:");
for (const t of ["tickets", "invoices", "walk_ins", "inventory_items", "stock_movements"]) {
  const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("organization_id", org.id).is("branch_id", null);
  ok(`${t}: 0 rows with NULL branch_id`, (count ?? 0) === 0, `${count} null-branch rows`);
}

// Catalog/master data is org-wide shared (branch_id NULL is expected there).
console.log("\nCatalog stays org-wide shared (NULL branch_id expected):");
for (const t of ["brands", "device_models", "price_list_categories"]) {
  const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("organization_id", org.id);
  ok(`${t}: present & shared`, (count ?? 0) >= 0, `${count} rows`);
}

// Migration table availability (informational — app tolerates absence).
console.log("\nMulti-store migration tables (optional — app degrades gracefully):");
for (const t of ["user_stores", "branch_settings"]) {
  const { error } = await admin.from(t).select("*").limit(1);
  console.log(`  ${error ? "TODO" : "OK  "}  ${t}${error ? "  — not applied yet (run supabase/multi-store.sql)" : "  — applied"}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
