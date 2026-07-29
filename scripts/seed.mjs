// Seed runner — calls the app's /api/setup/seed endpoint with the setup secret.
// Usage:
//   npm run db:seed                         (targets http://localhost:3000 — dev server must be running)
//   npm run db:seed -- https://your.vercel.app   (targets a deployed URL)
import fs from "node:fs";
import path from "node:path";

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

const env = parseEnv(path.resolve(process.cwd(), ".env.local"));
const secret = process.env.SETUP_SECRET || env.SETUP_SECRET;
const base = process.env.SEED_URL || process.argv[2] || "http://localhost:3000";

if (!secret) {
  console.error("SETUP_SECRET not found. Add it to .env.local.");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/setup/seed`;
console.log(`Seeding via ${url} ...`);

try {
  const res = await fetch(url, { method: "POST", headers: { "x-setup-secret": secret } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    console.error("Seed failed:", json.error || `HTTP ${res.status}`, json.reason ? `(${json.reason})` : "");
    process.exit(1);
  }
  console.log("Seed complete.");
  for (const l of json.log || []) console.log("  -", l);
  if (json.ownerLogin) console.log(`  Owner login: ${json.ownerLogin.email} / ${json.ownerLogin.password}`);
} catch (e) {
  console.error("Could not reach the app. Make sure `npm run dev` is running,");
  console.error("or pass a deployed URL:  npm run db:seed -- https://your-app.vercel.app");
  console.error(String(e));
  process.exit(1);
}
