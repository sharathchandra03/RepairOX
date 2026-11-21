// ============================================================================
// RepairOX — realistic operating data for Inventory + Field.
//
//   node scripts/seed-ops-data.mjs                 # inventory + field
//   node scripts/seed-ops-data.mjs --inventory     # inventory only
//   node scripts/seed-ops-data.mjs --field         # field only
//   node scripts/seed-ops-data.mjs --undo          # remove everything this script added
//
// Every inserted primary key is written to scripts/seed-ops-manifest.json, so
// --undo deletes exactly those rows (and nothing else) and restores counters.
// Re-running while a manifest exists is refused (run --undo first).
//
// Inventory runs with normal triggers (item codes, cost layers) but with the
// Price-List sync trigger paused, so existing Price List rows are not rewritten.
// Field runs with triggers off (session_replication_role = replica) so the
// guards / notifications don't fire and timestamps stay back-dated; all
// referential integrity is maintained here.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const MANIFEST = path.resolve(ROOT, "scripts/seed-ops-manifest.json");
const args = new Set(process.argv.slice(2));
const doInv = args.has("--inventory") || !args.has("--field");
const doField = args.has("--field") || !args.has("--inventory");

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
const env = { ...parseEnv(path.resolve(ROOT, ".env.local")), ...process.env };
const conn = env.SUPABASE_DB_URL || env.DATABASE_URL;
if (!conn) { console.error("SUPABASE_DB_URL missing in .env.local"); process.exit(1); }
const pg = (await import("pg")).default;
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, p = []) => (await client.query(sql, p)).rows;

/* ── undo ─────────────────────────────────────────────────────────────── */
const UNDO_ORDER = [
  ["field_location_points", "id"], ["field_tracking_sessions", "id"], ["field_trip_reviews", "id"], ["field_handovers", "id"],
  ["field_assignments", "id"], ["field_trip_events", "id"], ["field_trips", "id"], ["field_jobs", "id"],
  ["ninja_activity_log", "id"], ["ninja_day_logs", "id"], ["field_attendance_marks", "id"], ["field_incentive_adjustments", "id"],
  ["field_incentive_inputs", "id"], ["field_pay_salary", "id"], ["work_session_breaks", "id"], ["work_sessions", "id"],
  ["inventory_serials", "id"], ["inventory_docs", "id"], ["stock_movements", "doc_number"], ["inventory_stock_layers", "id"],
  ["inventory_item_costs", "item_id"], ["inventory_items", "id"], ["inventory_vendors", "id"],
];
if (args.has("--undo")) {
  if (!fs.existsSync(MANIFEST)) { console.log("Nothing to undo (no manifest)."); await client.end(); process.exit(0); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  await client.query("begin");
  await client.query("set local session_replication_role = replica");
  for (const [table, pk] of UNDO_ORDER) {
    const ids = m.ids?.[table];
    if (!ids?.length) continue;
    const r = await client.query(`delete from public.${table} where ${pk}::text = any($1::text[])`, [ids.map(String)]);
    console.log(`  removed ${String(r.rowCount).padStart(5)} from ${table}`);
  }
  if (m.weeklyOffStaff?.length) await client.query(`delete from public.field_weekly_off where staff_id = any($1::uuid[])`, [m.weeklyOffStaff]);
  if (m.policyOrg) await client.query(`delete from public.field_policy where organization_id = $1`, [m.policyOrg]);
  for (const [scope, seq] of Object.entries(m.counters ?? {})) {
    if (seq === null) await client.query(`delete from public.field_job_counters where scope = $1 and organization_id = $2`, [scope, m.org]);
    else await client.query(`update public.field_job_counters set last_seq = $1 where scope = $2 and organization_id = $3`, [seq, scope, m.org]);
  }
  if (m.staff?.length) {
    await client.query(`delete from public.staff where id = any($1::uuid[])`, [m.staff.map((s) => s.id)]);
    await client.query(`delete from auth.users where id = any($1::uuid[])`, [m.staff.map((s) => s.authId)]);
    console.log(`  removed ${m.staff.length} field staff accounts`);
  }
  await client.query("commit");
  fs.unlinkSync(MANIFEST);
  console.log("Undo complete.");
  await client.end();
  process.exit(0);
}
if (fs.existsSync(MANIFEST)) { console.error("A seed manifest already exists. Run with --undo first."); await client.end(); process.exit(1); }

/* ── helpers ──────────────────────────────────────────────────────────── */
let seedState = 20261121;
const rnd = () => { seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0; let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const wpick = (pairs) => { let r = rnd() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };
const uuid = () => crypto.randomUUID();
// IST wall-clock → Date. daysAgo is calendar days back from today (IST).
const nowIst = new Date(Date.now() + 5.5 * 3600e3);
const at = (daysAgo, h, m = 0) => new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() - daysAgo, h, m) - 5.5 * 3600e3);
const addMin = (d, m) => new Date(d.getTime() + m * 60e3);
const iso = (d) => d.toISOString();
const ymd = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const ddmmyyyy = (d) => { const s = ymd(d); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; };

const manifest = { org: null, ids: {}, staff: [], counters: {}, weeklyOffStaff: [], policyOrg: null };
const track = (table, id) => { (manifest.ids[table] ??= []).push(id); };

async function insertMany(table, rows, { json = [], idKey, chunk = 150 } = {}) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const tuples = part.map((r) => `(${cols.map((c) => {
      let v = r[c];
      if (v instanceof Date) v = v.toISOString();
      if (json.includes(c)) { params.push(v == null ? null : JSON.stringify(v)); return `$${params.length}::jsonb`; }
      params.push(v === undefined ? null : v);
      return `$${params.length}`;
    }).join(",")})`);
    await client.query(`insert into public.${table} (${cols.map((c) => `"${c}"`).join(",")}) values ${tuples.join(",")}`, params);
  }
  if (idKey) rows.forEach((r) => track(table, r[idKey]));
  return rows;
}
const DRY = args.has("--dry");
const save = () => { if (!DRY) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1)); };
const finish = async () => { await client.query(DRY ? "rollback" : "commit"); if (DRY) console.log("  (dry run: rolled back)"); };

/* ── shared fixtures ──────────────────────────────────────────────────── */
const [{ id: ORG }] = await q(`select id from organizations order by created_at limit 1`);
manifest.org = ORG;
const branches = Object.fromEntries((await q(`select id, name from branches where organization_id = $1`, [ORG])).map((b) => [b.name, b.id]));
const IND = branches["Indiranagar"], KOR = branches["Koramangala"], MAR = branches["Marathahalli"];
if (!IND || !KOR || !MAR) throw new Error("Expected Indiranagar, Koramangala and Marathahalli stores to exist.");
const staffAll = await q(`select id, name, role_id, branch_id from staff where organization_id = $1`, [ORG]);
const manager = staffAll.find((s) => s.name === "Rahil") ?? staffAll.find((s) => s.role_id === "manager") ?? staffAll[0];
const managers = ["Rahil", "Shreyas", "Vishwa"];
const salesNames = staffAll.filter((s) => s.role_id === "sales_agent");
const tickets = await q(`select id, customer from tickets order by created_at desc limit 60`);

/* ════════════════════════════════ INVENTORY ════════════════════════════ */
if (doInv) {
  console.log("\n▸ Inventory");
  await client.query("begin");
  await client.query("alter table public.inventory_items disable trigger inventory_items_sync_price_list");

  const vendors = [
    ["VND-0101", "Mobile Parts Co", "Faizan Ahmed", "9845012233", "sales@mobilepartsco.in", "29AAJCM4821F1Z3", "No. 14, Chickpet Main Road, Bengaluru 560053", "Net 15", 3],
    ["VND-0102", "SP Road Components", "Ramesh Jain", "9880145670", "orders@sproadcomponents.in", "29AAFFS7710K1ZP", "SP Road, Bengaluru 560002", "Net 30", 4],
    ["VND-0103", "Apex Mobile Spares", "Vivek Shetty", "9986201144", "vivek@apexspares.in", "29AALCA5532Q1Z8", "Avenue Road, Bengaluru 560002", "Net 15", 5],
    ["VND-0104", "Orion Battery Works", "Sandeep Rao", "9740556618", "sales@orionbattery.in", "29AAGCO9087L1ZD", "Peenya Industrial Area, Bengaluru 560058", "Advance", 2],
    ["VND-0105", "TechNova Distributors", "Anitha Krishnan", "9731880042", "anitha@technovadist.in", "29AAHCT3321B1ZX", "Brigade Road, Bengaluru 560001", "Net 30", 7],
    ["VND-0106", "Bench Tools & Supplies", "Kiran Pai", "9900123478", "kiran@benchtools.in", "29AAKFB6644M1Z2", "Kalasipalyam, Bengaluru 560002", "Net 15", 3],
  ].map(([id, name, contact, phone, email, gst, address, terms, lead]) => ({
    id, organization_id: ORG, branch_id: IND, name, contact_person: contact, phone, email, gst_number: gst, address,
    payment_terms: terms, lead_time_days: lead, notes: null, active: true, created_at: iso(at(60, 11)), updated_at: iso(at(60, 11)),
  }));
  await insertMany("inventory_vendors", vendors, { idKey: "id" });
  const V = { mp: "Mobile Parts Co", sp: "SP Road Components", ap: "Apex Mobile Spares", or: "Orion Battery Works", tn: "TechNova Distributors", bt: "Bench Tools & Supplies" };

  // [sku, name, category, brand/model, vendor, cost, sell, mrp, min, max, stock, store(I|K|M), grade, variantGroup, warrantyMonths, hsn, barcode(price-list part no)]
  const D = "Display Modules", B = "Batteries", P = "Charging Ports", C = "Cameras", L = "Logic Boards", A = "Accessories", T = "Tools & Consumables", S = "Speakers & Mics", G = "Back Glass";
  const items = [
    // iPhone 16 Pro Max (linked to the Price List by part number)
    ["IP16PM-DSP-OLED", "iPhone 16 Pro Max Display Assembly (OLED)", D, "Apple / iPhone 16 Pro Max", V.mp, 21800, 28500, 32000, 3, 10, 7, "I", "OLED", "iPhone 16 Pro Max · Display", 6, "85177090", "661-30001"],
    ["IP16PM-DSP-OEM", "iPhone 16 Pro Max Display Assembly (OEM pull)", D, "Apple / iPhone 16 Pro Max", V.mp, 27500, 34900, 38500, 2, 6, 3, "I", "OEM", "iPhone 16 Pro Max · Display", 12, "85177090", null],
    ["IP16PM-BAT", "iPhone 16 Pro Max Battery", B, "Apple / iPhone 16 Pro Max", V.or, 2650, 4800, 5500, 6, 24, 18, "I", "Premium", "iPhone 16 Pro Max · Battery", 6, "85076000", "661-30002"],
    ["IP16PM-CAM-R", "iPhone 16 Pro Max Rear Camera Module", C, "Apple / iPhone 16 Pro Max", V.ap, 11400, 15200, 17000, 3, 8, 2, "I", null, null, 6, "85258900", "661-30003"],
    ["IP16PM-CAM-F", "iPhone 16 Pro Max Front Camera", C, "Apple / iPhone 16 Pro Max", V.ap, 3400, 5600, 6500, 3, 8, 6, "I", null, null, 3, "85258900", "661-30004"],
    ["IP16PM-CHG", "iPhone 16 Pro Max Charging Port Assembly", P, "Apple / iPhone 16 Pro Max", V.sp, 1450, 3200, 3800, 5, 20, 14, "I", null, null, 3, "85366990", "661-30005"],
    ["IP16PM-EAR", "iPhone 16 Pro Max Ear Speaker", S, "Apple / iPhone 16 Pro Max", V.sp, 780, 1800, 2200, 5, 15, 9, "I", null, null, 3, "85183000", "661-30006"],
    ["IP16PM-LDS", "iPhone 16 Pro Max Loudspeaker", S, "Apple / iPhone 16 Pro Max", V.sp, 920, 2100, 2500, 5, 15, 11, "I", null, null, 3, "85183000", "661-30007"],
    ["IP16PM-BKG", "iPhone 16 Pro Max Back Glass", G, "Apple / iPhone 16 Pro Max", V.mp, 5100, 9400, 10500, 4, 12, 8, "I", null, null, 1, "70072900", "661-30008"],
    ["IP16PM-SIM", "iPhone 16 Pro Max SIM Tray", A, "Apple / iPhone 16 Pro Max", V.sp, 140, 450, 600, 10, 40, 0, "I", null, null, 0, "85389000", "661-30009"],
    ["IP16PM-TAP", "iPhone 16 Pro Max Taptic Engine", S, "Apple / iPhone 16 Pro Max", V.ap, 1350, 2800, 3300, 3, 10, 5, "I", null, null, 3, "85012000", "661-30010"],
    // MacBook Air M2 (linked)
    ["MBA-M2-DSP", "MacBook Air M2 Display Assembly", D, "Apple / MacBook Air M2", V.tn, 12900, 17200, 19500, 2, 5, 3, "I", "OEM", "MacBook Air M2 · Display", 6, "85177090", "661-27501"],
    ["MBA-M2-BAT", "MacBook Air M2 Battery", B, "Apple / MacBook Air M2", V.tn, 3600, 5800, 6800, 3, 8, 6, "I", "Premium", "MacBook Air M2 · Battery", 6, "85076000", "661-27502"],
    ["MBA-M2-KBD", "MacBook Air M2 Keyboard with Top Case", A, "Apple / MacBook Air M2", V.tn, 6400, 10200, 12000, 2, 6, 4, "I", null, null, 6, "84716090", "661-27503"],
    ["MBA-M2-TRK", "MacBook Air M2 Trackpad", A, "Apple / MacBook Air M2", V.tn, 4300, 6800, 7900, 2, 5, 3, "I", null, null, 6, "84716090", "661-27504"],
    ["MBA-M2-LB256", "MacBook Air M2 Logic Board (256GB)", L, "Apple / MacBook Air M2", V.tn, 29500, 38000, 43000, 1, 3, 1, "I", "Refurbished", "MacBook Air M2 · Logic Board", 3, "84733099", "661-27505"],
    ["MBA-M2-CHG", "MacBook Air M2 Charging Port Board", P, "Apple / MacBook Air M2", V.tn, 1300, 2200, 2700, 2, 6, 5, "I", null, null, 3, "85366990", "661-27507"],
    ["MBA-M2-FAN", "MacBook Air M2 Cooling Fan", A, "Apple / MacBook Air M2", V.tn, 620, 1200, 1500, 2, 8, 6, "I", null, null, 3, "84145990", "661-27510"],
    // iPhone 15 / 14 / 13 / 12 / 11
    ["IP15-DSP-OEM", "iPhone 15 Display (OEM pull)", D, "Apple / iPhone 15", V.mp, 9800, 14500, 16500, 4, 12, 9, "I", "OEM", "iPhone 15 · Display", 6, "85177090", null],
    ["IP15-DSP-SOFT", "iPhone 15 Display (Soft OLED)", D, "Apple / iPhone 15", V.mp, 6200, 9900, 11500, 4, 14, 12, "I", "Soft OLED", "iPhone 15 · Display", 3, "85177090", null],
    ["IP15-DSP-INC", "iPhone 15 Display (Incell)", D, "Apple / iPhone 15", V.mp, 3400, 5900, 7000, 5, 16, 20, "I", "Incell", "iPhone 15 · Display", 1, "85177090", null],
    ["IP15-BAT", "iPhone 15 Battery", B, "Apple / iPhone 15", V.or, 1650, 3200, 3900, 8, 30, 26, "I", "Premium", "iPhone 15 · Battery", 6, "85076000", null],
    ["IP15-CHG", "iPhone 15 Type-C Charging Port Flex", P, "Apple / iPhone 15", V.sp, 520, 1400, 1800, 6, 25, 4, "I", null, null, 3, "85366990", null],
    ["IP14-DSP-OEM", "iPhone 14 Display (OEM pull)", D, "Apple / iPhone 14", V.mp, 7400, 11800, 13500, 4, 12, 6, "I", "OEM", "iPhone 14 · Display", 6, "85177090", null],
    ["IP14-DSP-INC", "iPhone 14 Display (Incell)", D, "Apple / iPhone 14", V.mp, 2800, 4900, 5900, 6, 18, 15, "I", "Incell", "iPhone 14 · Display", 1, "85177090", null],
    ["IP14-BAT", "iPhone 14 Battery", B, "Apple / iPhone 14", V.or, 1350, 2800, 3400, 8, 30, 19, "I", "Premium", "iPhone 14 · Battery", 6, "85076000", null],
    ["IP13-DSP-INC", "iPhone 13 Display (Incell)", D, "Apple / iPhone 13", V.mp, 2400, 4200, 5100, 6, 18, 17, "K", "Incell", "iPhone 13 · Display", 1, "85177090", null],
    ["IP13-DSP-HOLED", "iPhone 13 Display (Hard OLED)", D, "Apple / iPhone 13", V.mp, 4300, 6900, 8200, 4, 12, 8, "K", "Hard OLED", "iPhone 13 · Display", 3, "85177090", null],
    ["IP13-BAT-OEM", "iPhone 13 Battery (OEM cell)", B, "Apple / iPhone 13", V.or, 1500, 2900, 3500, 8, 30, 3, "K", "OEM", "iPhone 13 · Battery", 6, "85076000", null],
    ["IP13-BAT-PRE", "iPhone 13 Battery (Premium)", B, "Apple / iPhone 13", V.or, 780, 1800, 2300, 8, 30, 22, "K", "Premium", "iPhone 13 · Battery", 3, "85076000", null],
    ["IP13-CAM-R", "iPhone 13 Rear Camera", C, "Apple / iPhone 13", V.ap, 3600, 5800, 6900, 3, 10, 7, "K", null, null, 3, "85258900", null],
    ["IP13-LB-RF", "iPhone 13 Logic Board (Refurbished, 128GB)", L, "Apple / iPhone 13", V.ap, 14500, 21500, 25000, 1, 4, 3, "K", "Refurbished", "iPhone 13 · Logic Board", 3, "84733099", null],
    ["IP12-DSP-INC", "iPhone 12 Display (Incell)", D, "Apple / iPhone 12", V.mp, 2100, 3700, 4500, 5, 15, 13, "K", "Incell", "iPhone 12 · Display", 1, "85177090", null],
    ["IP12-BAT", "iPhone 12 Battery", B, "Apple / iPhone 12", V.or, 980, 2100, 2700, 8, 24, 14, "K", "Premium", "iPhone 12 · Battery", 3, "85076000", null],
    ["IP11-DSP", "iPhone 11 Display (LCD)", D, "Apple / iPhone 11", V.mp, 1250, 2400, 3000, 6, 20, 24, "K", null, null, 1, "85177090", null],
    ["IPXR-BAT", "iPhone XR Battery", B, "Apple / iPhone XR", V.or, 720, 1700, 2200, 5, 20, 31, "K", null, null, 3, "85076000", null],
    // Samsung / OnePlus / Pixel / tablets / wearables
    ["SGS24U-DSP-OEM", "Galaxy S24 Ultra AMOLED Display (Service pack)", D, "Samsung / Galaxy S24 Ultra", V.sp, 23800, 31500, 36000, 2, 6, 2, "I", "OEM", "Galaxy S24 Ultra · Display", 6, "85177090", null],
    ["SGS24U-DSP-AM", "Galaxy S24 Ultra AMOLED Display (Aftermarket)", D, "Samsung / Galaxy S24 Ultra", V.sp, 14200, 19800, 23000, 2, 6, 4, "I", "Aftermarket", "Galaxy S24 Ultra · Display", 3, "85177090", null],
    ["SGS24U-BAT", "Galaxy S24 Ultra Battery", B, "Samsung / Galaxy S24 Ultra", V.or, 1900, 3600, 4400, 4, 14, 9, "I", null, null, 6, "85076000", null],
    ["SGA55-DSP", "Galaxy A55 Display Assembly", D, "Samsung / Galaxy A55", V.sp, 3900, 6200, 7400, 3, 10, 5, "M", null, null, 3, "85177090", null],
    ["SGA55-CHG", "Galaxy A55 Charging Port Board", P, "Samsung / Galaxy A55", V.sp, 480, 1250, 1600, 5, 18, 12, "M", null, null, 3, "85366990", null],
    ["OP12-DSP", "OnePlus 12 Display Assembly", D, "OnePlus / OnePlus 12", V.ap, 9800, 14900, 17500, 2, 6, 3, "M", null, null, 3, "85177090", null],
    ["PX9-DSP", "Pixel 9 Display Assembly", D, "Google / Pixel 9", V.ap, 10800, 16400, 19000, 1, 4, 2, "M", null, null, 3, "85177090", null],
    ["IPADA5-DIG", "iPad Air 5 Digitizer Glass", D, "Apple / iPad Air 5", V.tn, 3200, 5400, 6500, 2, 6, 4, "M", null, null, 3, "85177090", null],
    ["AWS9-BAT", "Apple Watch Series 9 Battery (45mm)", B, "Apple / Watch Series 9", V.or, 1100, 2400, 3000, 3, 10, 6, "M", null, null, 3, "85076000", null],
    ["APP2-CASE", "AirPods Pro 2 Charging Case", A, "Apple / AirPods Pro 2", V.tn, 3300, 5200, 6500, 2, 6, 5, "M", null, null, 3, "85183000", null],
    // Accessories
    ["ACC-TG-IP15", "Tempered Glass (iPhone 15 series, 9H)", A, "Generic", V.sp, 38, 199, 349, 30, 120, 74, "I", null, null, 0, "70072100", "8901234500011"],
    ["ACC-TG-UNI", "Tempered Glass (Universal Android)", A, "Generic", V.sp, 24, 149, 299, 40, 150, 22, "I", null, null, 0, "70072100", "8901234500028"],
    ["ACC-CASE-SIL", "Silicone Case (Clear, assorted models)", A, "Generic", V.sp, 52, 249, 449, 20, 80, 46, "I", null, null, 0, "39269099", "8901234500035"],
    ["ACC-CBL-C2C", "USB-C to USB-C Cable 1m (60W)", A, "Generic", V.sp, 85, 399, 599, 15, 60, 38, "I", null, null, 3, "85444999", "8901234500042"],
    ["ACC-ADP-20W", "20W USB-C Power Adapter", A, "Generic", V.sp, 190, 799, 1199, 10, 40, 7, "I", null, null, 6, "85044090", "8901234500059"],
    ["ACC-CBL-LGT", "USB-C to Lightning Cable 1m", A, "Generic", V.sp, 120, 499, 799, 15, 60, 41, "K", null, null, 3, "85444999", "8901234500066"],
    // Tools & consumables
    ["TL-ADH-B7000", "B-7000 Adhesive 50ml", T, "Generic", V.bt, 48, 160, 220, 10, 40, 18, "I", null, null, 0, "35069190", null],
    ["TL-SOLD-063", "Solder Wire 0.6mm (50g)", T, "Generic", V.bt, 210, 420, 550, 4, 16, 9, "I", null, null, 0, "83113090", null],
    ["TL-FLUX-NC", "No-clean Flux Paste", T, "Generic", V.bt, 95, 240, 320, 4, 16, 3, "I", null, null, 0, "38101090", null],
    ["TL-IPA-500", "Isopropyl Alcohol 500ml", T, "Generic", V.bt, 110, 260, 340, 6, 24, 15, "I", null, null, 0, "29051220", null],
    ["TL-TAPE-DS", "Double-sided Adhesive Tape Set", T, "Generic", V.bt, 28, 90, 140, 20, 80, 52, "I", null, null, 0, "39191000", null],
    ["TL-SCR-PREC", "Precision Screwdriver Set (24 bits)", T, "Generic", V.bt, 340, 790, 999, 3, 10, 6, "I", null, null, 6, "82054000", null],
    ["TL-GUN-NOZ", "Hot Air Gun Nozzle Set", T, "Generic", V.bt, 260, 590, 799, 2, 8, 1, "K", null, null, 3, "84148090", null],
    ["TL-ESD-GLV", "ESD Gloves (pair)", T, "Generic", V.bt, 18, 70, 120, 25, 100, 64, "K", null, null, 0, "61161000", null],
  ].map((r) => ({
    sku: r[0], name: r[1], category: r[2], brandModel: r[3], vendor: r[4], cost: r[5], sell: r[6], mrp: r[7], min: r[8], max: r[9], stock: r[10],
    store: r[11], grade: r[12], group: r[13], warranty: r[14], hsn: r[15], barcode: r[16],
  }));

  const BR = { I: [IND, "Indiranagar"], K: [KOR, "Koramangala"], M: [MAR, "Marathahalli"] };
  const itemRows = items.map((it, i) => ({
    id: it.sku, organization_id: ORG, branch_id: BR[it.store][0], name: it.name, category: it.category, item_type: "Product", item_kind: "part", mode: "Both",
    uom: "Piece", store: BR[it.store][1], active: true, current_stock: it.stock, default_price: it.sell, regular_buying_price: 0, wholesale_buying_price: 0,
    regular_selling_price: it.sell, selling_price: it.sell, mrp: it.mrp, dealer_price: Math.round(it.cost * 1.1), distributor_price: Math.round(it.cost * 1.04),
    hsn_code: it.hsn, tax: 18, cost_tax: 18, min_stock: it.min, max_stock: it.max, reserved_stock: 0,
    sold_units: Math.max(0, int(4, 40) + (it.stock < it.min ? 20 : 0)), purchased_units: it.stock + int(10, 60), track_stock: true,
    barcode: it.barcode, brand_model: it.brandModel, vendor: it.vendor, grade: it.grade, variant_group: it.group, warranty_months: it.warranty,
    created_at: iso(at(58 - (i % 20), 11, i % 50)), updated_at: iso(at(int(0, 12), 12)),
  }));
  await insertMany("inventory_items", itemRows, { idKey: "id" });

  await insertMany("inventory_item_costs", items.map((it) => ({
    item_id: it.sku, organization_id: ORG, branch_id: null, cost_price: it.cost, standard_labour_cost: 0, cost_configured: true, updated_at: iso(at(30, 12)),
  })), { idKey: "item_id" });

  // Two cost layers per stocked item (older cheaper, newer current) so valuation isn't flat.
  const layers = [];
  for (const it of items) {
    if (it.stock <= 0) continue;
    const bid = BR[it.store][0];
    if (it.stock >= 6) {
      const a = Math.floor(it.stock / 2), b = it.stock - a;
      layers.push({ id: uuid(), organization_id: ORG, branch_id: bid, item_id: it.sku, source: "purchase", qty_in: a + 4, qty_remaining: a, unit_cost: Math.round(it.cost * 0.95), received_at: iso(at(44, 12)), created_at: iso(at(44, 12)) });
      layers.push({ id: uuid(), organization_id: ORG, branch_id: bid, item_id: it.sku, source: "purchase", qty_in: b, qty_remaining: b, unit_cost: it.cost, received_at: iso(at(14, 12)), created_at: iso(at(14, 12)) });
    } else {
      layers.push({ id: uuid(), organization_id: ORG, branch_id: bid, item_id: it.sku, source: "purchase", qty_in: it.stock + 2, qty_remaining: it.stock, unit_cost: it.cost, received_at: iso(at(21, 12)), created_at: iso(at(21, 12)) });
    }
  }
  await insertMany("inventory_stock_layers", layers, { idKey: "id" });

  const byId = Object.fromEntries(items.map((i) => [i.sku, i]));
  const L$ = (sku, qty, withCost = true) => ({ itemId: sku, name: byId[sku].name, qty, ...(withCost ? { unitCost: byId[sku].cost } : {}) });
  const mgrName = () => pick(managers);
  const doc = (id, type, status, party, ref, lines, data, daysAgo, h = 11) => ({
    id, organization_id: ORG, branch_id: IND, doc_type: type, status, party, ref, lines, data,
    created_by: manager.id, created_by_name: mgrName(), created_at: iso(at(daysAgo, h, int(0, 50))), updated_at: iso(at(Math.max(daysAgo - 1, 0), h + 2)),
  });
  const docs = [];
  const moves = [];
  const mv = (docNo, from, to, items_, daysAgo, type, itemId, h = 12) => moves.push({
    doc_number: docNo, organization_id: ORG, branch_id: IND, from_store: from, to_store: to, items: items_, movement_date: ddmmyyyy(at(daysAgo, h)),
    movement_user: mgrName(), movement_type: type, status: "completed", item_id: itemId, created_at: iso(at(daysAgo, h)), updated_at: iso(at(daysAgo, h)),
  });

  // Purchase orders + receipts
  const po1 = [L$("IP15-DSP-SOFT", 12), L$("IP15-BAT", 20), L$("IP14-BAT", 15), L$("IP15-DSP-INC", 16)].map((l, i) => ({ ...l, received: l.qty }));
  const po2 = [L$("ACC-TG-IP15", 100), L$("ACC-CBL-C2C", 40), L$("IP16PM-CHG", 12), L$("IP16PM-LDS", 10)].map((l) => ({ ...l, received: l.qty }));
  const po3 = [L$("IP16PM-DSP-OLED", 8), L$("IP16PM-CAM-R", 6), L$("IP16PM-CAM-F", 6), L$("IP16PM-TAP", 6)].map((l, i) => ({ ...l, received: i < 2 ? l.qty : 0 }));
  docs.push(doc("PO-0001", "purchase_order", "closed", V.mp, "", po1, { notes: "Monthly display and battery replenishment" }, 38));
  docs.push(doc("PO-0002", "purchase_order", "received", V.sp, "", po2, { notes: "Accessories and small parts" }, 27));
  docs.push(doc("PO-0003", "purchase_order", "partial", V.ap, "", po3, { notes: "Camera modules backordered; balance expected this week" }, 11));
  docs.push(doc("PO-0004", "purchase_order", "sent", V.or, "", [L$("IP13-BAT-OEM", 20), L$("IPXR-BAT", 10), L$("SGS24U-BAT", 8)].map((l) => ({ ...l, received: 0 })), { notes: "OEM-cell battery stock is low" }, 4));
  docs.push(doc("PO-0005", "purchase_order", "sent", V.mp, "", [L$("IP16PM-DSP-OEM", 4), L$("IP14-DSP-OEM", 6)].map((l) => ({ ...l, received: 0 })), {}, 2));
  docs.push(doc("PO-0006", "purchase_order", "draft", V.tn, "", [L$("MBA-M2-LB256", 2), L$("MBA-M2-DSP", 2)].map((l) => ({ ...l, received: 0 })), { notes: "Awaiting owner approval" }, 0, 10));
  docs.push(doc("PO-0007", "purchase_order", "cancelled", V.ap, "", [L$("OP12-DSP", 3).valueOf()].map((l) => ({ ...l, received: 0 })), { notes: "Vendor out of stock; re-sourcing" }, 19));
  const grn = (id, status, vendor, ref, lines, daysAgo) => {
    docs.push(doc(id, "grn", status, vendor, ref, lines.map(({ received, ...l }) => l), { notes: `Invoice received with delivery` }, daysAgo, 15));
    if (status === "posted") lines.forEach((l, i) => mv(`${id}/${i + 1}`, `${vendor} · ${id}`, BR[byId[l.itemId].store][1], l.qty, daysAgo, "Inward", l.itemId, 15));
  };
  grn("GRN-0001", "posted", V.mp, "PO-0001", po1, 36);
  grn("GRN-0002", "posted", V.sp, "PO-0002", po2, 25);
  grn("GRN-0003", "posted", V.ap, "PO-0003", po3.filter((l) => l.received > 0), 8);
  grn("GRN-0004", "draft", V.ap, "PO-0003", po3.filter((l) => l.received === 0).map((l) => ({ ...l, qty: 3 })), 0);

  // Vendor returns
  docs.push(doc("RMA-0001", "vendor_return", "sent", V.mp, "", [{ ...L$("IP15-DSP-INC", 2, false), reason: "Dead on arrival" }], { notes: "Touch not responding on arrival" }, 9));
  docs.push(doc("RMA-0002", "vendor_return", "credited", V.or, "", [{ ...L$("IP13-BAT-PRE", 3, false), reason: "Defective" }], { notes: "Swelling within a week" }, 22));
  docs.push(doc("RMA-0003", "vendor_return", "draft", V.sp, "", [{ ...L$("IP16PM-CHG", 1, false), reason: "Wrong item" }], {}, 1));
  docs.push(doc("RMA-0004", "vendor_return", "replaced", V.ap, "", [{ ...L$("IP16PM-CAM-F", 1, false), reason: "Defective" }], { notes: "Replacement received against the same PO" }, 31));
  mv("RMA-0001/1", "Indiranagar", "Vendor return RMA-0001 → Mobile Parts Co", 2, 9, "Outward", "IP15-DSP-INC");
  mv("RMA-0002/1", "Koramangala", "Vendor return RMA-0002 → Orion Battery Works", 3, 22, "Outward", "IP13-BAT-PRE");
  mv("RMA-0004/1", "Indiranagar", "Vendor return RMA-0004 → Apex Mobile Spares", 1, 31, "Outward", "IP16PM-CAM-F");
  mv("RMA-0004/1-REP", "Replacement · RMA-0004", "Indiranagar", 1, 24, "Inward", "IP16PM-CAM-F");

  // Transfers (K variants exist for a few SKUs; destination defaults to same item)
  docs.push(doc("TRF-0001", "transfer", "received", "Koramangala", "", [{ itemId: "ACC-CBL-C2C", name: byId["ACC-CBL-C2C"].name, qty: 12, toItemId: "ACC-CBL-LGT" }], { notes: "Counter stock top-up" }, 17));
  docs.push(doc("TRF-0002", "transfer", "in_transit", "Marathahalli", "", [{ itemId: "IP15-BAT", name: byId["IP15-BAT"].name, qty: 6 }, { itemId: "IP15-DSP-INC", name: byId["IP15-DSP-INC"].name, qty: 4 }], {}, 1));
  docs.push(doc("TRF-0003", "transfer", "requested", "Indiranagar", "", [{ itemId: "IP13-DSP-HOLED", name: byId["IP13-DSP-HOLED"].name, qty: 3 }], { notes: "Requested by Koramangala counter" }, 0, 9));
  docs.push(doc("TRF-0004", "transfer", "cancelled", "Koramangala", "", [{ itemId: "TL-GUN-NOZ", name: byId["TL-GUN-NOZ"].name, qty: 1 }], { notes: "Bought locally instead" }, 14));
  mv("TRF-0001/1", "Indiranagar", "Transfer TRF-0001 → Koramangala", 12, 17, "Transfer", "ACC-CBL-C2C");
  mv("TRF-0001/1-IN", "Transfer TRF-0001", "Koramangala", 12, 16, "Transfer", "ACC-CBL-LGT");
  mv("TRF-0002/1", "Indiranagar", "Transfer TRF-0002 → Marathahalli", 6, 1, "Transfer", "IP15-BAT");
  mv("TRF-0002/2", "Indiranagar", "Transfer TRF-0002 → Marathahalli", 4, 1, "Transfer", "IP15-DSP-INC");

  // Stock counts
  const countLines = (skus, drift) => skus.map((s) => { const sys = byId[s].stock; const d = drift[s] ?? 0; return { itemId: s, name: byId[s].name, qty: 0, system: sys, counted: Math.max(sys + d, 0) }; });
  docs.push(doc("CNT-0001", "stock_count", "approved", "Indiranagar", "", countLines(["IP15-BAT", "IP14-BAT", "ACC-TG-IP15", "TL-ADH-B7000", "IP16PM-BAT", "ACC-CBL-C2C", "TL-IPA-500", "IP15-DSP-INC"], { "ACC-TG-IP15": -3, "TL-ADH-B7000": 2, "IP16PM-BAT": -1 }), { notes: "Monthly cycle count: accessories and batteries" }, 12));
  docs.push(doc("CNT-0002", "stock_count", "submitted", "Koramangala", "", countLines(["IP13-DSP-INC", "IP13-BAT-OEM", "IP13-BAT-PRE", "IP12-BAT", "IP11-DSP", "ACC-CBL-LGT"], { "IP13-BAT-OEM": -1, "IP11-DSP": 2 }), { notes: "Awaiting manager approval" }, 2));
  docs.push(doc("CNT-0003", "stock_count", "draft", "Marathahalli", "", countLines(["SGA55-DSP", "SGA55-CHG", "OP12-DSP", "PX9-DSP"], {}).map((l, i) => (i < 2 ? l : { ...l, counted: undefined })), {}, 0, 9));
  mv("CNT-0001/1", "Stock count CNT-0001", "Indiranagar", 1, 12, "Adjustment", "TL-ADH-B7000");
  mv("CNT-0001/2", "Indiranagar", "Stock count CNT-0001", 3, 12, "Adjustment", "ACC-TG-IP15");
  mv("CNT-0001/3", "Indiranagar", "Stock count CNT-0001", 1, 12, "Adjustment", "IP16PM-BAT");

  // Write-offs
  const wos = [
    ["IP15-DSP-INC", 1, "Damaged", "Cracked during bench testing", 28, "Indiranagar"], ["IP13-BAT-PRE", 2, "Expired / Defective", "Swollen cells found on inspection", 24, "Koramangala"],
    ["ACC-TG-UNI", 6, "Damaged", "Box crushed in transit", 20, "Indiranagar"], ["TL-FLUX-NC", 1, "Expired / Defective", "Dried out", 18, "Indiranagar"],
    ["IP14-DSP-INC", 1, "Used for testing", "Used for fault isolation on a customer unit", 13, "Indiranagar"], ["IP16PM-BKG", 1, "Damaged", "Chipped edge on unboxing", 9, "Indiranagar"],
    ["SGA55-CHG", 2, "Lost / Missing", "Not found during shelf audit", 6, "Marathahalli"], ["ACC-ADP-20W", 1, "Other", "Customer goodwill replacement", 3, "Indiranagar"],
  ];
  wos.forEach(([sku, qty, reason, note, d, loc], i) => {
    const id = `WO-${String(i + 1).padStart(4, "0")}`;
    docs.push(doc(id, "write_off", "posted", reason, "", [{ itemId: sku, name: byId[sku].name, qty, reason }], { note, location: loc }, d, 17));
    mv(`${id}/1`, loc, `Write-off: ${reason}`, qty, d, "Adjustment", sku, 17);
  });

  // Old parts + warranty claims (tied to real tickets)
  const tk = (i) => tickets[i % tickets.length];
  const oldParts = [
    ["IP15-DSP-INC", "returned_vendor", 26], ["IP14-BAT", "scrapped", 21], ["IP13-DSP-INC", "recycled", 19], ["IP16PM-DSP-OLED", "returned_vendor", 12],
    ["IP15-BAT", "pending", 6], ["MBA-M2-BAT", "pending", 5], ["IP13-DSP-HOLED", "pending", 2], ["SGS24U-DSP-AM", "returned_vendor", 15],
  ];
  oldParts.forEach(([sku, st, d], i) => docs.push(doc(`OLD-${String(i + 1).padStart(4, "0")}`, "old_part", st, tk(i).id, "", [{ itemId: sku, name: `Old ${byId[sku].name}`, qty: 1 }], { notes: `Replaced on ticket for ${tk(i).customer}` }, d, 16)));
  const claims = [
    ["IP16PM-BAT", "replaced", V.or, 33], ["IP15-DSP-SOFT", "approved", V.mp, 8], ["IP14-BAT", "sent", V.or, 5], ["IP13-CAM-R", "raised", V.ap, 1],
  ];
  claims.forEach(([sku, st, vend, d], i) => docs.push(doc(`WCL-${String(i + 1).padStart(4, "0")}`, "warranty_claim", st, vend, tk(i + 9).id, [{ itemId: sku, name: byId[sku].name, qty: 1 }], { notes: "Failed within warranty period" }, d, 14)));
  mv("WCL-0001/1-REP", "Replacement · WCL-0001", "Indiranagar", 1, 27, "Inward", "IP16PM-BAT");

  // Sales / consumption + returns for the movement chart (outward against tickets)
  const consumable = items.filter((i) => i.stock > 0 && !i.sku.startsWith("MBA-M2-LB"));
  for (let n = 0; n < 62; n++) {
    const it = pick(consumable);
    const d = wpick([[0, 2], [1, 3], [2, 3], [3, 3], [5, 2], [8, 2], [12, 2], [17, 2], [22, 1], [27, 1]]) + int(0, 2);
    mv(`MOV-${ymd(at(d, 12)).replace(/-/g, "")}-${String(n + 1).padStart(3, "0")}`, BR[it.store][1], `Ticket ${tk(n).id}`, wpick([[1, 8], [2, 2]]), d, "Outward", it.sku, int(10, 19));
  }
  for (let n = 0; n < 6; n++) { const it = pick(consumable); mv(`MOV-RET-${String(n + 1).padStart(3, "0")}`, `Ticket ${tk(n + 20).id}`, BR[it.store][1], 1, int(1, 25), "Return", it.sku); }

  await insertMany("inventory_docs", docs, { json: ["lines", "data"], idKey: "id" });
  // de-dupe movement ids defensively
  const seenMv = new Set(); const movesU = moves.filter((m) => !seenMv.has(m.doc_number) && seenMv.add(m.doc_number));
  await insertMany("stock_movements", movesU, { idKey: "doc_number" });

  // Serial / IMEI units
  const imei = (n) => `35${String(int(1000000, 9999999))}${String(n).padStart(6, "0")}`;
  const serialRows = [];
  const serial = (sku, serialNo, status, ticket, vendor, doc_, d) => serialRows.push({
    id: uuid(), organization_id: ORG, branch_id: BR[byId[sku].store][0], item_id: sku, serial: serialNo, status, ticket_id: ticket, vendor, received_doc: doc_, notes: null,
    created_at: iso(at(d, 12)), updated_at: iso(at(Math.max(d - 2, 0), 12)),
  });
  for (let n = 0; n < 9; n++) serial("IP13-LB-RF", imei(n + 1), n < 3 ? "in_stock" : n < 7 ? "installed" : n === 7 ? "rma" : "scrapped", n >= 3 && n < 7 ? tk(n).id : null, V.ap, "GRN-0003", 40 - n * 3);
  for (let n = 0; n < 6; n++) serial("MBA-M2-LB256", `FVFH${int(100, 999)}${String.fromCharCode(65 + n)}Q6L${int(10, 99)}`, n === 0 ? "in_stock" : n < 4 ? "installed" : "sold", n >= 1 && n < 4 ? tk(n + 3).id : null, V.tn, "GRN-0001", 35 - n * 4);
  for (let n = 0; n < 5; n++) serial("IP16PM-DSP-OEM", `DSPC${int(1000, 9999)}${String.fromCharCode(66 + n)}${int(100, 999)}`, n < 3 ? "in_stock" : "installed", n >= 3 ? tk(n + 11).id : null, V.mp, "GRN-0003", 14 - n);
  for (let n = 0; n < 4; n++) serial("SGS24U-DSP-OEM", `R5CT${int(10000, 99999)}${String.fromCharCode(70 + n)}`, n < 2 ? "in_stock" : "installed", n >= 2 ? tk(n + 15).id : null, V.sp, "", 18 - n);
  await insertMany("inventory_serials", serialRows, { idKey: "id" });

  await client.query("alter table public.inventory_items enable trigger inventory_items_sync_price_list");
  await finish();
  save();
  console.log(`  ${vendors.length} vendors · ${itemRows.length} items · ${layers.length} cost layers · ${docs.length} documents · ${movesU.length} stock movements · ${serialRows.length} serial units`);
}

/* ═════════════════════════════════ FIELD ═══════════════════════════════ */
if (doField) {
  console.log("\n▸ Field");
  await client.query("begin");
  await client.query("set local session_replication_role = replica");

  // ── Ninjas: the 3 existing + 4 additional field staff ──
  const existingNinjas = await q(`select id, name, branch_id from staff where role_id = 'ninja' and organization_id = $1 order by name`, [ORG]);
  const addNinja = [
    ["Kiran Kumar", "9845100111", IND, "Indiranagar", 18500], ["Mohammed Irfan", "9886100222", KOR, "Koramangala", 19500],
    ["Suresh Babu", "9741100333", MAR, "Marathahalli", 17500], ["Naveen Gowda", "9900100444", IND, "Indiranagar", 21000],
  ];
  const newNinjas = [];
  for (const [name, phone, bid, bname, salary] of addNinja) {
    const authId = uuid(); const sid = uuid();
    const email = `${name.toLowerCase().replace(/\s+/g, ".")}@repairox.app`;
    await client.query(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)`, [authId, email]);
    await client.query(`insert into staff (id, auth_user_id, organization_id, branch_id, branch, name, phone, email, role_id, status, login_enabled, designation, department, joining_date, salary_type, salary_amount, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,'ninja','active',false,'Field Ninja','Field Operations',$9,'monthly',$10,$11,$11)`,
      [sid, authId, ORG, bid, bname, name, phone, email, ymd(at(120, 10)), salary, iso(at(120, 10))]);
    manifest.staff.push({ id: sid, authId });
    newNinjas.push({ id: sid, name, branch_id: bid, salary });
  }
  const ninjas = [
    ...existingNinjas.map((n, i) => ({ id: n.id, name: n.name, branch_id: n.branch_id, salary: [18000, 19000, 20000][i % 3], existing: true })),
    ...newNinjas,
  ];
  const ninjasByStore = (bid) => { const l = ninjas.filter((n) => n.branch_id === bid); return l.length ? l : ninjas; };
  const STORE = { [IND]: { name: "Indiranagar", lat: 12.9784, lng: 77.6408 }, [KOR]: { name: "Koramangala", lat: 12.9352, lng: 77.6245 }, [MAR]: { name: "Marathahalli", lat: 12.9569, lng: 77.7011 } };

  // ── Customer areas ──
  const AREAS = [
    ["Indiranagar", 12.9719, 77.6412, "560038", 1], ["HAL 2nd Stage", 12.9606, 77.6404, "560008", 1], ["Domlur", 12.9609, 77.6387, "560071", 1], ["Koramangala 5th Block", 12.9352, 77.6205, "560095", 1],
    ["HSR Layout", 12.9116, 77.6389, "560102", 1], ["BTM Layout", 12.9166, 77.6101, "560076", 1], ["Jayanagar 4th Block", 12.9250, 77.5938, "560011", 1], ["JP Nagar", 12.9063, 77.5857, "560078", 1],
    ["Bellandur", 12.9304, 77.6784, "560103", 1], ["Marathahalli", 12.9569, 77.7011, "560037", 1], ["Whitefield", 12.9698, 77.7500, "560066", 1], ["Brookefield", 12.9650, 77.7160, "560037", 1],
    ["Kalyan Nagar", 13.0250, 77.6400, "560043", 1], ["HBR Layout", 13.0330, 77.6290, "560043", 1], ["Hebbal", 13.0358, 77.5970, "560024", 1], ["Malleshwaram", 13.0035, 77.5646, "560003", 1],
    ["Rajajinagar", 12.9910, 77.5520, "560010", 1], ["Basavanagudi", 12.9430, 77.5757, "560004", 1], ["Electronic City", 12.8452, 77.6602, "560100", 1], ["Sarjapur Road", 12.9101, 77.6870, "560035", 1],
    ["Yelahanka", 13.1007, 77.5963, "560064", 1], ["Banashankari", 12.9255, 77.5468, "560070", 1], ["RT Nagar", 13.0210, 77.5950, "560032", 1], ["CV Raman Nagar", 12.9855, 77.6640, "560093", 1],
    // far-out (XL trips: > 40 km round trip)
    ["Hoskote", 13.0707, 77.7982, "562114", 2], ["Devanahalli", 13.2476, 77.7138, "562110", 2], ["Nelamangala", 13.0950, 77.3940, "562123", 2], ["Hosur", 12.7409, 77.8253, "635109", 2],
  ];
  const STREETS = ["Main Road", "Cross Road", "Layout Road", "Service Road", "Temple Street"];
  const ord = (n) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
  const FIRST = ["Aditya", "Priya", "Rohan", "Sneha", "Vikram", "Ananya", "Arjun", "Divya", "Karthik", "Meera", "Nikhil", "Pooja", "Rahul", "Shruti", "Suresh", "Lakshmi", "Manoj", "Deepa", "Harish", "Kavya", "Sanjay", "Neha", "Gopal", "Swathi", "Tarun", "Ishita", "Prakash", "Roshni", "Varun", "Bhavana", "Faisal", "Zoya", "Joseph", "Anita", "Ramesh", "Sunitha"];
  const LAST = ["Sharma", "Reddy", "Nair", "Iyer", "Gowda", "Rao", "Menon", "Patil", "Hegde", "Shetty", "Kulkarni", "Naidu", "Joshi", "Khan", "D'Souza", "Pillai", "Bhat", "Das", "Mehta", "Agarwal"];
  const DEVICES = [
    ["Apple iPhone 16 Pro Max", "cat-mobile", "plb-apple", "plm-ip16pm", ["Screen cracked", "Battery draining fast", "Not charging", "Back glass broken", "Water damage"], 3],
    ["Apple iPhone 16 Pro", "cat-mobile", "plb-apple", "plm-ip16p", ["Screen cracked", "Camera blurry", "Face ID not working", "Battery swelling"], 3],
    ["Apple iPhone 15 Pro Max", "cat-mobile", "plb-apple", "plm-ip15pm", ["Display lines", "Battery health 78%", "Speaker crackling"], 3],
    ["Samsung Galaxy S24 Ultra", "cat-mobile", "plb-samsung", "plm-gs24u", ["Green line on screen", "Back glass broken", "Charging port loose"], 3],
    ["Samsung Galaxy S25 Ultra", "cat-mobile", "plb-samsung", "plm-gs25u", ["Screen cracked", "Overheating"], 2],
    ["Apple MacBook Air M2", "cat-laptop", "plb-apple-l", "plm-mba-m2", ["Battery not holding charge", "Keyboard keys stuck", "Liquid spill", "Not powering on"], 3],
    ["Apple MacBook Air M3", "cat-laptop", "plb-apple-l", "plm-mba-m3", ["Display flicker", "Trackpad not clicking"], 1],
    ["Dell XPS 15", "cat-laptop", "plb-dell", "plm-xps15", ["Battery drain", "Fan noise", "Screen hinge broken"], 2],
    ["Dell XPS 13", "cat-laptop", "plb-dell", "plm-xps13", ["Not charging", "Keyboard backlight off"], 1],
  ];
  const wDev = DEVICES.flatMap((d) => Array(d[5]).fill(d));
  const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  let phoneSeq = 1000;
  const person = () => { const f = pick(FIRST), l = pick(LAST); return [`${f} ${l}`, `98${String(450 + (phoneSeq % 400)).padStart(3, "0")}${String(phoneSeq++ * 7 % 100000).padStart(5, "0")}`.slice(0, 10)]; };
  const hav = (a, b, c, d) => { const R = 6371000, rad = (x) => (x * Math.PI) / 180; const dLat = rad(c - a), dLng = rad(d - b); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

  const PICKUP_PATH = ["awaiting_assignment", "assigned", "accepted", "en_route_customer", "arrived_customer", "pickup_in_progress", "device_collected", "en_route_store", "arrived_store", "handover_pending", "store_received", "completed"];
  const DROP_PATH = ["awaiting_assignment", "assigned", "accepted", "arrived_store", "store_dispatch_confirmed", "device_received_by_ninja", "en_route_customer", "arrived_customer", "delivery_in_progress", "delivered", "completed"];
  const ONSITE_PATH = ["awaiting_assignment", "assigned", "accepted", "en_route_customer", "arrived_customer", "service_in_progress", "service_completed", "completed"];
  const LEGACY = {
    pickup: { awaiting_assignment: "pending_assignment", assigned: "assigned", accepted: "pickup_scheduled", en_route_customer: "out_for_pickup", arrived_customer: "out_for_pickup", pickup_in_progress: "out_for_pickup", device_collected: "picked_up", en_route_store: "picked_up", arrived_store: "picked_up", handover_pending: "picked_up", store_received: "at_store", completed: "at_store", failed_attempt: "failed_pickup", customer_unavailable: "failed_pickup", cancelled: "cancelled" },
    drop: { awaiting_assignment: "ready_for_drop", assigned: "ready_for_drop", accepted: "drop_scheduled", arrived_store: "drop_scheduled", store_dispatch_confirmed: "drop_scheduled", device_received_by_ninja: "out_for_drop", en_route_customer: "out_for_drop", arrived_customer: "out_for_drop", delivery_in_progress: "out_for_drop", delivered: "delivered", completed: "completed", failed_attempt: "failed_drop", customer_unavailable: "failed_drop", cancelled: "cancelled" },
    onsite: { awaiting_assignment: "pending_assignment", assigned: "assigned", accepted: "assigned", en_route_customer: "out_for_pickup", arrived_customer: "out_for_pickup", service_in_progress: "in_repair", service_completed: "in_repair", completed: "completed", cancelled: "cancelled" },
  };
  const nextSeq = {};
  for (const bid of [IND, KOR, MAR]) {
    const r = await q(`select last_seq from field_job_counters where organization_id=$1 and scope=$2`, [ORG, bid]);
    manifest.counters[bid] = r.length ? r[0].last_seq : null;
    nextSeq[bid] = r.length ? r[0].last_seq : 0;
  }

  const J = [], T = [], E = [], AS = [], H = [], SES = [], PTS = [], REV = [], ACT = [];
  const dayKm = new Map(); // `${ninja}|${ymd}` -> metres travelled by tracked trips
  const addKm = (nid, date, m) => { const k = `${nid}|${ymd(date)}`; dayKm.set(k, (dayKm.get(k) ?? 0) + m); };
  const busyDays = new Map(); // `${ninja}|${ymd}` -> true
  const COMMENTS = { 5: ["Quick pickup, very professional.", "Arrived on time and explained everything.", "Handled my laptop carefully. Great service.", "Smooth process from pickup to delivery.", "Polite and punctual."], 4: ["Good service, slightly late.", "Helpful, but waited a bit for the callback.", "Overall good experience."], 3: ["Took longer than promised.", "Average. Communication could be better."], 2: ["Arrived much later than the slot."], 1: ["Missed the slot and did not inform me."] };
  const NOTE_ASSIGN = ["Initial assignment", "Assigned from dispatch board", "Assigned by field manager"];
  const REJ = ["Out of service area", "Already on another trip", "Vehicle issue"];
  const CONDITION = [{ body: "Minor scratches", screen: "Cracked", powers_on: "Yes" }, { body: "Dents / scratches", screen: "Minor scratches", powers_on: "Yes" }, { body: "Clean", screen: "Good", powers_on: "No" }, { body: "Minor scratches", screen: "Good", powers_on: "Yes" }];
  const ACCS = ["Charger", "Charger, case", "SIM tray", "None", "Charger, cable"];

  function buildTrip(job, type, path, endStatus, startAt, ninja, opts = {}) {
    const trip = { id: uuid(), job, type, ninja };
    const endIdx = path.indexOf(endStatus);
    let steps = endIdx >= 0 ? path.slice(0, endIdx + 1) : [...path.slice(0, Math.max(opts.failFrom ?? 4, 1)), endStatus];
    if (!ninja) steps = endStatus === "awaiting_assignment" ? ["awaiting_assignment"] : ["awaiting_assignment", endStatus];
    let t = startAt;
    let tl = [];
    steps.forEach((st, i) => {
      if (i > 0) {
        const gap = { assigned: int(3, 25), accepted: int(2, 14), en_route_customer: int(8, 35), arrived_customer: opts.xl ? int(45, 75) : int(14, 48), pickup_in_progress: int(1, 4), device_collected: int(6, 20), en_route_store: int(1, 5), arrived_store: opts.xl ? int(45, 70) : int(15, 45), handover_pending: int(1, 4), store_received: int(4, 30), completed: int(1, 5), store_dispatch_confirmed: int(4, 25), device_received_by_ninja: int(2, 8), delivery_in_progress: int(2, 6), delivered: int(4, 18), service_in_progress: int(2, 6), service_completed: int(10, 55) }[st] ?? int(2, 10);
        t = addMin(t, gap);
      }
      tl.push([st, t]);
    });
    // Nothing may happen in the future: cut the timeline at "now".
    const now = new Date();
    while (tl.length > 1 && tl[tl.length - 1][1] > now) tl.pop();
    let journeyStart = null, arrived = null, accepted = null, assigned = null, completed = null;
    for (const [st, time] of tl) {
      if (st === "assigned") assigned = time;
      if (st === "accepted") accepted = time;
      if (st === "en_route_customer" || (st === "arrived_store" && type === "drop")) journeyStart ??= time;
      if (st === "arrived_customer" || st === "arrived_store") arrived = time;
      if (st === "completed" || st === "cancelled") completed = time;
    }
    Object.assign(trip, { status: tl[tl.length - 1][0], tl, assigned, accepted, journeyStart, arrived, completed });
    return trip;
  }

  // Trip numbers are unique per organisation (not per store), so job numbers are
  // drawn from ONE running sequence and every store counter is advanced past it.
  let globalSeq = Math.max(...(await q(`select coalesce(max(last_seq),0) m from field_job_counters where organization_id=$1`, [ORG])).map((r) => Number(r.m)), 0);
  const total = 96;
  const jobPlans = [];
  for (let i = 0; i < total; i++) {
    const age = wpick([[0, 5], [1, 5], [2, 5], [3, 5], [4, 4], [6, 6], [8, 6], [11, 6], [14, 6], [18, 6], [22, 5], [26, 5], [31, 5], [35, 4], [39, 3]]) + int(0, 1);
    jobPlans.push(age);
  }
  jobPlans.sort((a, b) => b - a); // oldest first so job numbers rise with time

  const driveKmMax = new Map();
  for (const age of jobPlans) {
    const bid = wpick([[KOR, 46], [IND, 36], [MAR, 18]]);
    const store = STORE[bid];
    const kind = wpick([["pickup", 52], ["onsite", 16], ["buyback", 10], ["pickup_drop", 22]]);
    const area = (kind === "onsite" || chance(0.88)) ? pick(AREAS.filter((a) => a[4] === 1)) : pick(AREAS.filter((a) => a[4] === 2));
    const xl = area[4] === 2;
    const [cname, phone] = person();
    const dev = pick(wDev);
    const issue = pick(dev[4]);
    const lat = area[1] + (rnd() - 0.5) * 0.012, lng = area[2] + (rnd() - 0.5) * 0.012;
    const addr = `${int(2, 480)}, ${ord(int(1, 14))} ${pick(STREETS)}, ${area[0]}, Bengaluru, Karnataka ${area[3]}`;
    const ninja = pick(ninjasByStore(bid));
    let created = at(age, int(9, 17), int(0, 59));
    if (created > new Date()) created = addMin(new Date(), -int(25, 300));
    const leadType = kind === "buyback" ? "buyback" : kind === "onsite" ? "onsite" : "pickup";
    globalSeq += 1; nextSeq[bid] = globalSeq;
    const jobNo = `FJ-${String(globalSeq).padStart(3, "0")}`;
    const jobId = uuid();
    const sales = salesNames.length ? pick(salesNames) : null;

    // outcome by age
    let outcome;
    if (age >= 4) outcome = wpick([["done", 84], ["cancelled", 5], ["failed", 6], ["unavailable", 5]]);
    else if (age >= 1) outcome = wpick([["done", 48], ["active", 40], ["cancelled", 4], ["failed", 8]]);
    else outcome = wpick([["active", 82], ["done", 10], ["unassigned", 8]]);

    const job = {
      id: jobId, organization_id: ORG, branch_id: bid, job_no: jobNo, lead_type: leadType, source: pick(["Google", "Meta", "Walk-in referral", "GMB", "Existing customer", "WhatsApp"]),
      customer: cname, phone, device: dev[0], category: dev[1], issue, branch: store.name, sales_person_id: sales?.id ?? null, sales_person_name: sales?.name ?? null,
      field_manager_id: manager.id, field_manager_name: manager.name, pickup_address: addr, pickup_date: ymd(created), pickup_time: `${String(int(10, 18)).padStart(2, "0")}:${pick(["00", "15", "30", "45"])}`,
      ninja_id: null, ninja_name: null, drop_ninja_id: null, drop_ninja_name: null,
      status: "pending_assignment", notes: null, delivery_confirmed: false, created_by: manager.id, created_at: iso(created), updated_at: iso(created),
      accessories: pick(ACCS), device_condition: pick(["Screen cracked", "Minor scratches", "Good", "Dented frame", "Water exposure suspected"]),
      device_category_id: dev[1], device_brand_id: dev[2], preferred_window: pick(["10:00-12:00", "12:00-14:00", "14:00-17:00", "16:00-19:00"]), pincode: area[3],
      landmark: pick(["Near the signal", "Opposite the pharmacy", "Behind the bus stop", "Next to the park", "Above the bakery"]),
      location_lat: lat, location_lng: lng, location_maps_url: mapsUrl(lat, lng), location_source: "map_pin", location_instructions: pick([null, "Call before arriving", "Security will hold the gate", "Ring the bell twice"]),
      drop_address: addr, drop_lat: lat, drop_lng: lng, drop_maps_url: mapsUrl(lat, lng), lead_branch_id: bid, assigned_at: null, created_by_name: manager.name,
      devices: [{ id: `td-${uuid().slice(0, 8)}`, imei: dev[1] === "cat-mobile" ? String(int(350000000000000, 359999999999999)) : "", issue, label: dev[0], brandId: dev[2], modelId: dev[3], condition: "", categoryId: dev[1], accessories: "" }],
      imei: dev[1] === "cat-mobile" ? String(int(350000000000000, 359999999999999)) : null,
    };
    J.push(job);
    const jobTrips = [];
    const makeTripRows = (t) => {
      const path = t.type === "pickup" ? PICKUP_PATH : t.type === "drop" ? DROP_PATH : ONSITE_PATH;
      T.push({
        id: t.id, organization_id: ORG, branch_id: bid, job_id: jobId, trip_no: `${jobNo}-${t.type === "pickup" ? "P" : t.type === "drop" ? "D" : "O"}1`, trip_type: t.type, status: t.status,
        lead_id: null, customer_id: null, ninja_id: t.ninja ? t.ninja.id : null, assigned_by: t.assigned ? manager.id : null, assigned_at: t.assigned ? iso(t.assigned) : null,
        accepted_at: t.accepted ? iso(t.accepted) : null, journey_started_at: t.journeyStart ? iso(t.journeyStart) : null, arrived_at: t.arrived ? iso(t.arrived) : null,
        completed_at: t.completed ? iso(t.completed) : null, scheduled_at: iso(addMin(t.tl[0][1], int(60, 240))), scheduled_window: job.preferred_window,
        source_label: t.type === "pickup" || t.type === "onsite" ? "Customer" : `${store.name} store`, source_lat: t.type === "drop" ? store.lat : lat, source_lng: t.type === "drop" ? store.lng : lng,
        source_address: t.type === "drop" ? `${store.name} store` : addr, dest_lat: t.type === "drop" ? lat : t.type === "pickup" ? store.lat : lat, dest_lng: t.type === "drop" ? lng : t.type === "pickup" ? store.lng : lng,
        dest_address: t.type === "drop" ? addr : t.type === "pickup" ? `${store.name} store` : addr, dest_maps_url: mapsUrl(lat, lng), instructions: job.location_instructions,
        failure_reason: t.status === "failed_attempt" ? pick(["Customer not reachable", "Device not ready", "Wrong address shared"]) : t.status === "customer_unavailable" ? "Customer not available at the address" : null,
        client_request_id: `${t.id}`, created_by: manager.id, created_at: iso(t.tl[0][1]), updated_at: iso(t.tl[t.tl.length - 1][1]),
      });
      // events
      let prev = null; let n = 0;
      t.tl.forEach(([st, time]) => {
        const storeStep = st === "store_received" || st === "store_dispatch_confirmed";
        const mgrStep = st === "assigned" || st === "awaiting_assignment" || storeStep;
        E.push({
          id: uuid(), organization_id: ORG, branch_id: bid, job_id: jobId, trip_id: t.id, lead_id: null, event_type: prev === null ? "created" : "status_changed", previous_status: prev, new_status: st,
          actor_staff_id: mgrStep || !t.ninja ? manager.id : t.ninja.id, actor_name: mgrStep || !t.ninja ? manager.name : t.ninja.name, note: null, location: null, payload: null,
          idempotency_key: `${t.id}:${n++}`, device_at: iso(time), occurred_at: iso(time),
        });
        prev = st;
      });
      // assignment history
      if (t.ninja && t.assigned) {
        if (opts_rejected.has(t.id)) {
          const other = pick(ninjas.filter((x) => x.id !== t.ninja.id));
          AS.push({ id: uuid(), organization_id: ORG, branch_id: bid, trip_id: t.id, previous_ninja: null, ninja_id: other.id, assigned_by: manager.id, assigned_at: iso(addMin(t.assigned, -12)), reason: pick(NOTE_ASSIGN), outcome: "rejected", responded_at: iso(addMin(t.assigned, -8)), reject_reason: pick(REJ) });
          AS.push({ id: uuid(), organization_id: ORG, branch_id: bid, trip_id: t.id, previous_ninja: other.id, ninja_id: t.ninja.id, assigned_by: manager.id, assigned_at: iso(t.assigned), reason: "Reassigned after rejection", outcome: t.accepted ? "accepted" : "pending", responded_at: t.accepted ? iso(t.accepted) : null, reject_reason: null });
        } else {
          AS.push({ id: uuid(), organization_id: ORG, branch_id: bid, trip_id: t.id, previous_ninja: null, ninja_id: t.ninja.id, assigned_by: manager.id, assigned_at: iso(t.assigned), reason: pick(NOTE_ASSIGN), outcome: t.accepted ? "accepted" : t.status === "cancelled" ? "cancelled" : "pending", responded_at: t.accepted ? iso(t.accepted) : null, reject_reason: null });
        }
        if (t.accepted) {
          ACT.push({ organization_id: ORG, branch_id: bid, staff_id: t.ninja.id, trip_id: t.id, job_id: jobId, kind: "assignment_accepted", screen: "/ninja", payload: { tripNo: `${jobNo}` }, location: null, online: true, device: { native: false, standalone: true, tz: "Asia/Calcutta" }, occurred_at: iso(t.accepted), received_at: iso(t.accepted), idempotency_key: `${t.id}:acc` });
          ACT.push({ organization_id: ORG, branch_id: bid, staff_id: t.ninja.id, trip_id: t.id, job_id: jobId, kind: "trip_opened", screen: "/ninja/trip", payload: {}, location: null, online: true, device: { native: false, standalone: true, tz: "Asia/Calcutta" }, occurred_at: iso(addMin(t.accepted, 1)), received_at: iso(addMin(t.accepted, 1)), idempotency_key: `${t.id}:open` });
          t.tl.slice(3).forEach(([st, time], k) => ACT.push({ organization_id: ORG, branch_id: bid, staff_id: t.ninja.id, trip_id: t.id, job_id: jobId, kind: "trip_status_change", screen: "/ninja/trip", payload: { to: st }, location: null, online: true, device: { native: false, standalone: true, tz: "Asia/Calcutta" }, occurred_at: iso(time), received_at: iso(time), idempotency_key: `${t.id}:s${k}` }));
        }
      }
      // handovers
      const reached = (st) => t.tl.some((x) => x[0] === st);
      const stamp = (st) => t.tl.find((x) => x[0] === st)?.[1];
      const ho = (kind, from, to, status, ack, time) => H.push({
        id: uuid(), organization_id: ORG, branch_id: bid, trip_id: t.id, job_id: jobId, kind, from_staff_id: from, to_staff_id: to, status, device_identity: job.imei ?? job.device, accessories: job.accessories,
        condition_notes: pick(["Powers on, screen cracked", "Minor wear on frame", "No visible damage", "Does not power on"]), evidence: { photos: [], signature: null, condition: pick(CONDITION), collected_at: iso(time) },
        ack_method: ack, ack_at: status === "accepted" ? iso(time) : null, reject_reason: null, created_at: iso(time), idempotency_key: `${t.id}:${kind}`,
      });
      if (t.type === "pickup") {
        if (reached("device_collected")) ho("customer_to_ninja", null, t.ninja.id, "accepted", "otp", stamp("device_collected"));
        if (reached("handover_pending")) ho("ninja_to_store", t.ninja.id, manager.id, reached("store_received") ? "accepted" : "pending", reached("store_received") ? "store_confirm" : null, stamp("store_received") ?? stamp("handover_pending"));
      } else if (t.type === "drop") {
        if (reached("store_dispatch_confirmed")) ho("store_to_ninja", manager.id, t.ninja.id, "accepted", "store_confirm", stamp("store_dispatch_confirmed"));
        if (reached("delivered")) ho("ninja_to_customer", t.ninja.id, null, "accepted", "otp", stamp("delivered"));
      }
      // GPS tracking
      if (t.journeyStart && t.arrived && t.ninja) {
        const from = t.type === "drop" ? [store.lat, store.lng] : [store.lat, store.lng];
        const phases = [];
        if (t.type === "pickup") {
          phases.push([store.lat, store.lng, lat, lng, t.journeyStart, t.arrived && reached("arrived_customer") ? stamp("arrived_customer") : t.arrived]);
          if (reached("en_route_store")) phases.push([lat, lng, store.lat, store.lng, stamp("en_route_store"), t.arrived]);
        } else if (t.type === "drop") phases.push([store.lat, store.lng, lat, lng, t.journeyStart, reached("arrived_customer") ? stamp("arrived_customer") : t.arrived]);
        else phases.push([store.lat, store.lng, lat, lng, t.journeyStart, t.arrived]);
        void from;
        const sid = uuid(); let seq = 0; let metres = 0; let lastP = null;
        const first = phases[0][4], last = phases[phases.length - 1][5];
        for (const [a, b, c, d, t0, t1] of phases) {
          const N = 8; const span = Math.max((t1 - t0) / 60e3, 6);
          for (let k = 0; k <= N; k++) {
            const f = k / N; const jitter = k === 0 || k === N ? 0 : (rnd() - 0.5) * 0.004;
            const la = a + (c - a) * f + jitter, lo = b + (d - b) * f + jitter * 0.8;
            if (lastP) metres += hav(lastP[0], lastP[1], la, lo);
            lastP = [la, lo];
            PTS.push({ organization_id: ORG, session_id: sid, trip_id: t.id, staff_id: t.ninja.id, seq: ++seq, lat: la, lng: lo, accuracy: int(6, 30), speed: k === 0 || k === N ? 0 : Math.round((rnd() * 9 + 3) * 10) / 10, heading: int(0, 359), source: "gps", device_at: iso(addMin(t0, span * f)), received_at: iso(addMin(t0, span * f)) });
          }
        }
        SES.push({ id: sid, organization_id: ORG, branch_id: bid, trip_id: t.id, staff_id: t.ninja.id, started_at: iso(first), ended_at: iso(last), end_reason: "arrived", last_lat: lastP[0], last_lng: lastP[1], last_accuracy: 12, last_point_at: iso(last), customer_visible: true });
        addKm(t.ninja.id, t.completed ?? last, metres);
      }
      if (t.ninja && t.completed) busyDays.set(`${t.ninja.id}|${ymd(t.completed)}`, true);
    };
    const opts_rejected = (globalThis.__rej ??= new Set());

    const wantsDrop = kind === "pickup_drop";
    const primaryType = kind === "onsite" ? "onsite" : "pickup";
    const primaryPath = primaryType === "onsite" ? ONSITE_PATH : PICKUP_PATH;
    let endStatus, noNinja = false;
    if (outcome === "done") endStatus = "completed";
    else if (outcome === "cancelled") endStatus = "cancelled";
    else if (outcome === "failed") endStatus = chance(0.6) ? "failed_attempt" : "customer_unavailable";
    else if (outcome === "unassigned") { endStatus = "awaiting_assignment"; noNinja = true; }
    else endStatus = pick(primaryPath.slice(1, primaryPath.length - 1));
    if (endStatus === "cancelled" && chance(0.5)) noNinja = true;
    const canReject = !noNinja && endStatus !== "awaiting_assignment";
    const pT = buildTrip(job, primaryType, primaryPath, endStatus, created, noNinja ? null : ninja, { xl, failFrom: endStatus.startsWith("failed") || endStatus === "customer_unavailable" ? 5 : 3 });
    if (canReject && chance(0.09)) opts_rejected.add(pT.id);
    if (endStatus === "cancelled") { /* cancelled path: steps up to assigned/accepted then cancelled */ }
    makeTripRows(pT);
    jobTrips.push(pT);

    let dT = null;
    if (wantsDrop && pT.status === "completed") {
      const dropAge = Math.max(age - int(1, 3), 0);
      const dStart = dropAge === age ? addMin(pT.completed, int(240, 600)) : at(dropAge, int(10, 16), int(0, 59));
      const dOutcome = dropAge >= 2 ? wpick([["completed", 90], ["failed_attempt", 6], ["cancelled", 4]]) : wpick([["completed", 45], ["active", 55]]);
      let dEnd = dOutcome === "active" ? pick(DROP_PATH.slice(2, DROP_PATH.length - 1)) : dOutcome;
      const dNinja = chance(0.75) ? ninja : pick(ninjasByStore(bid));
      dT = buildTrip(job, "drop", DROP_PATH, dEnd, dStart, dNinja, { xl, failFrom: 8 });
      if (dT.tl[0][1] > new Date()) dT = null;
      if (dT) { makeTripRows(dT); jobTrips.push(dT); }
    }

    // legacy job projection
    const lastTrip = dT ?? pT;
    job.status = LEGACY[lastTrip.type]?.[lastTrip.status] ?? "pending_assignment";
    if (leadType === "buyback" && pT.status === "completed") job.status = "completed";
    job.ninja_id = pT.ninja ? pT.ninja.id : null; job.ninja_name = pT.ninja ? pT.ninja.name : null;
    if (dT?.ninja) { job.drop_ninja_id = dT.ninja.id; job.drop_ninja_name = dT.ninja.name; }
    job.assigned_at = pT.assigned ? iso(pT.assigned) : null;
    job.delivery_confirmed = !!dT && dT.status === "completed";
    job.updated_at = iso(lastTrip.tl[lastTrip.tl.length - 1][1]);

    // reviews: one per completed trip (about half), customer-submitted
    for (const t of jobTrips) {
      if (t.status !== "completed" || !t.ninja || !chance(0.58)) continue;
      const rating = wpick([[5, 62], [4, 24], [3, 8], [2, 3], [1, 3]]);
      REV.push({ id: uuid(), organization_id: ORG, branch_id: bid, trip_id: t.id, job_id: jobId, ninja_id: t.ninja.id, rating, comment: chance(0.7) ? pick(COMMENTS[rating]) : null, channel: chance(0.85) ? "customer_link" : "manager", created_by: null, created_at: iso(addMin(t.completed, int(30, 1500))) });
    }
  }

  // job counters
  for (const bid of [IND, KOR, MAR]) {
    await client.query(`insert into field_job_counters (organization_id, scope, last_seq) values ($1,$2,$3) on conflict (organization_id, scope) do update set last_seq = excluded.last_seq`, [ORG, bid, globalSeq]);
  }
  await insertMany("field_jobs", J, { json: ["devices"], idKey: "id", chunk: 40 });
  await insertMany("field_trips", T, { idKey: "id", chunk: 60 });
  await insertMany("field_trip_events", E, { json: ["location", "payload"], idKey: "id", chunk: 100 });
  await insertMany("field_assignments", AS, { idKey: "id" });
  await insertMany("field_handovers", H, { json: ["evidence"], idKey: "id", chunk: 80 });
  await insertMany("field_tracking_sessions", SES, { idKey: "id" });
  await insertMany("field_location_points", PTS, { chunk: 300 });
  manifest.ids.field_location_points = []; // removed via trip/session cascade below
  await insertMany("field_trip_reviews", REV, { idKey: "id" });
  // location points have a bigserial id; track by session instead for undo
  const ptIds = await q(`select id from field_location_points where session_id = any($1::uuid[])`, [SES.map((s) => s.id)]);
  manifest.ids.field_location_points = ptIds.map((r) => r.id);

  // ── Attendance, odometer, work sessions, pay ──
  const DAYS = 32;
  const weeklyOff = {}; ninjas.forEach((n, i) => { weeklyOff[n.id] = [0, 0, 2, 0, 3, 0, 1][i % 7]; });
  await insertMany("field_weekly_off", ninjas.map((n) => ({ staff_id: n.id, organization_id: ORG, weekday: weeklyOff[n.id], updated_at: iso(at(40, 10)) })));
  manifest.weeklyOffStaff = ninjas.map((n) => n.id);
  const hasPolicy = (await q(`select 1 from field_policy where organization_id = $1`, [ORG])).length > 0;
  if (!hasPolicy) { await client.query(`insert into field_policy (organization_id, fuel_rate_per_km) values ($1, 3.5)`, [ORG]); manifest.policyOrg = ORG; }

  const marks = []; const leaveDays = new Set();
  const mark = (n, daysAgo, kind, status, reason) => { marks.push({ id: uuid(), organization_id: ORG, branch_id: n.branch_id, staff_id: n.id, day: ymd(at(daysAgo, 12)), kind, status, reason, requested_by: n.id, decided_by: status === "requested" ? null : manager.id, decided_at: status === "requested" ? null : iso(at(Math.max(daysAgo + 1, 1), 10)), created_at: iso(at(daysAgo + 2, 10)) }); if (status === "approved" && kind !== "week_off") leaveDays.add(`${n.id}|${ymd(at(daysAgo, 12))}`); };
  mark(ninjas[0], 20, "casual_leave", "approved", "Family function");
  mark(ninjas[1], 16, "casual_leave", "approved", "Fever");
  mark(ninjas[2], 12, "half_day", "approved", "Bank work");
  mark(ninjas[3], 9, "absent", "approved", "Did not report");
  mark(ninjas[4], 25, "festival_leave", "approved", "Diwali");
  mark(ninjas[5], 25, "festival_leave", "approved", "Diwali");
  mark(ninjas[6], 7, "casual_leave", "rejected", "Short notice during peak load");
  mark(ninjas[1], -2, "casual_leave", "requested", "Travelling for a wedding");
  await insertMany("field_attendance_marks", marks, { idKey: "id" });

  const openNow = new Set((await q(`select staff_id from work_sessions where ended_at is null`)).map((r) => r.staff_id));
  const dayLogs = [], sessions = [], breaks = [], odo = {};
  ninjas.forEach((n, i) => { odo[n.id] = 18000 + i * 4200 + int(0, 900); });
  for (let d = DAYS; d >= 0; d--) {
    const date = at(d, 12); const wd = new Date(date.getTime() + 5.5 * 3600e3).getUTCDay();
    for (const n of ninjas) {
      if (wd === weeklyOff[n.id]) continue;
      if (leaveDays.has(`${n.id}|${ymd(date)}`)) continue;
      const trackedKm = Math.round((dayKm.get(`${n.id}|${ymd(date)}`) ?? 0) / 1000);
      const km = Math.max(trackedKm + int(3, 12), int(8, 18));
      const startAt = at(d, 9, int(0, 25)), isToday = d === 0;
      const endAt = at(d, 18, int(20, 59));
      const start = odo[n.id];
      const row = { id: uuid(), organization_id: ORG, branch_id: n.branch_id, staff_id: n.id, day: ymd(date), start_reading: start, start_at: iso(startAt), end_reading: isToday && nowIst.getUTCHours() < 18 ? null : start + km, end_at: isToday && nowIst.getUTCHours() < 18 ? null : iso(endAt), correction_reason: null, corrected_by: null, corrected_at: null, created_at: iso(startAt), start_photo: null, end_photo: null };
      if (!isToday || nowIst.getUTCHours() >= 18) odo[n.id] = start + km;
      dayLogs.push(row);
      if (isToday && nowIst.getUTCHours() < 18 && openNow.has(n.id)) continue;
      const sid = uuid(); const open = isToday && nowIst.getUTCHours() < 18;
      sessions.push({ id: sid, organization_id: ORG, branch_id: n.branch_id, staff_id: n.id, started_at: iso(startAt), ended_at: open ? null : iso(endAt), status: open ? "open" : "completed", end_reason: open ? null : "logout", last_seen_at: iso(open ? new Date() : endAt), source: "web", created_at: iso(startAt), updated_at: iso(open ? new Date() : endAt) });
      const bs = at(d, 13, int(0, 30));
      if (!(open && nowIst.getUTCHours() < 13)) breaks.push({ id: uuid(), organization_id: ORG, session_id: sid, staff_id: n.id, branch_id: n.branch_id, started_at: iso(bs), ended_at: iso(addMin(bs, int(25, 50))), created_at: iso(bs), updated_at: iso(addMin(bs, 40)) });
      // daily app footprint
      for (const [kind, hh, mm, screen] of [["app_open", 9, 5, "/ninja"], ["screen_view", 9, 6, "/ninja"], ["jobs_tab_changed", 9, 8, "/ninja"], ["insights_viewed", 18, 30, "/ninja/insights"], ["app_background", 18, 40, "/ninja"]])
        ACT.push({ organization_id: ORG, branch_id: n.branch_id, staff_id: n.id, trip_id: null, job_id: null, kind, screen, payload: {}, location: null, online: true, device: { native: false, standalone: true, tz: "Asia/Calcutta" }, occurred_at: iso(at(d, hh, mm + int(0, 20))), received_at: iso(at(d, hh, mm + int(0, 20))), idempotency_key: `${n.id}:${ymd(date)}:${kind}` });
    }
  }
  await insertMany("ninja_day_logs", dayLogs, { idKey: "id", chunk: 120 });
  await insertMany("work_sessions", sessions, { idKey: "id", chunk: 120 });
  await insertMany("work_session_breaks", breaks, { idKey: "id", chunk: 120 });

  // activity log has a generated id; capture it for undo
  const actIds = [];
  for (let i = 0; i < ACT.length; i += 150) {
    const part = ACT.slice(i, i + 150); const params = [];
    const tuples = part.map((r) => `(${["organization_id", "branch_id", "staff_id", "trip_id", "job_id", "kind", "screen", "payload", "location", "online", "device", "occurred_at", "received_at", "idempotency_key"].map((c) => {
      let v = r[c]; if (["payload", "location", "device"].includes(c)) { params.push(v == null ? null : JSON.stringify(v)); return `$${params.length}::jsonb`; } params.push(v ?? null); return `$${params.length}`;
    }).join(",")})`);
    const r = await client.query(`insert into ninja_activity_log (organization_id, branch_id, staff_id, trip_id, job_id, kind, screen, payload, location, online, device, occurred_at, received_at, idempotency_key) values ${tuples.join(",")} on conflict do nothing returning id`, params);
    actIds.push(...r.rows.map((x) => x.id));
  }
  manifest.ids.ninja_activity_log = actIds;

  await insertMany("field_pay_salary", ninjas.map((n) => ({ id: uuid(), organization_id: ORG, branch_id: n.branch_id, staff_id: n.id, effective_from: "2026-10-01", monthly_salary: n.salary, note: "Monthly fixed salary", created_by: manager.id, created_at: iso(at(60, 10)) })), { idKey: "id" });
  const inputs = [];
  for (const n of ninjas) for (const m of ["2026-10", "2026-11"]) inputs.push({ id: uuid(), organization_id: ORG, branch_id: n.branch_id, staff_id: n.id, month: m, key: "organic_leads", value: int(2, 14), note: null, updated_by: manager.id, updated_at: iso(at(m === "2026-10" ? 22 : 1, 11)) });
  await insertMany("field_incentive_inputs", inputs, { idKey: "id" });
  await insertMany("field_incentive_adjustments", [
    { id: uuid(), organization_id: ORG, branch_id: ninjas[0].branch_id, staff_id: ninjas[0].id, month: "2026-10", amount: 500, reason: "Festival season bonus", created_by: manager.id, created_at: iso(at(25, 12)) },
    { id: uuid(), organization_id: ORG, branch_id: ninjas[2].branch_id, staff_id: ninjas[2].id, month: "2026-10", amount: -300, reason: "Tool kit not returned on time", created_by: manager.id, created_at: iso(at(24, 12)) },
  ], { idKey: "id" });

  await finish();
  save();
  console.log(`  ${ninjas.length} Ninjas (${newNinjas.length} new) · ${J.length} jobs · ${T.length} trips · ${E.length} events · ${AS.length} assignments · ${H.length} handovers`);
  console.log(`  ${SES.length} tracked journeys · ${PTS.length} GPS points · ${REV.length} reviews · ${dayLogs.length} odometer days · ${sessions.length} shifts · ${actIds.length} app activity rows`);
}
await client.end();
console.log("\nDone. Remove everything this script added with:  node scripts/seed-ops-data.mjs --undo");
