/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — "Link existing Lead" lookup (pure). Searches EVERY useful lead
   field, ranked, and understands a bare Lead number:

     "L-031" · "l031" · "031" · "31" · "009"  → the lead whose number is 31 / 9
     "8660771346" / "+91 86607-71346"          → mobile / alternate mobile
     "name@mail.com" · "shash" · "dell xps"   → email / name / device / issue …

   Runs over the leads the caller can already see (RLS-scoped), so it never
   reveals a lead the user has no access to.
   ────────────────────────────────────────────────────────────────────────── */
import type { Lead } from "@/lib/leads-data";
import { getLeadDevices } from "@/lib/leads-data";

/** The numeric part of a lead number: "L-009" → 9, "KOR-L-0045" → 45. */
export function leadNumber(leadNo: string | null | undefined): number | null {
  const m = /(\d+)\s*$/.exec(leadNo ?? "");
  return m ? Number(m[1]) : null;
}

const digitsOf = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const last10 = (s: string | null | undefined) => { const d = digitsOf(s); return d.length > 10 ? d.slice(-10) : d; };
/** A token that looks like a lead id: optional letters/dash prefix + digits. */
const ID_LIKE = /^[a-z]{0,6}[-\s]?\d{1,8}$/i;

function haystacks(l: Lead) {
  const devices = getLeadDevices(l);
  return {
    name: (l.name ?? "").toLowerCase(),
    email: (l.email ?? "").toLowerCase(),
    device: [l.device, ...devices.map((d) => d.label)].filter(Boolean).join(" ").toLowerCase(),
    issue: [l.issue, ...devices.map((d) => d.issue)].filter(Boolean).join(" ").toLowerCase(),
    other: [
      l.source, l.region, l.location, l.locationUnit, l.status, l.contactStatus, l.category, l.leadCategory,
      l.subCategory, l.assignedToName, l.comments, l.finalRemarks, l.customerId, l.captureChannel,
    ].filter(Boolean).join(" ").toLowerCase(),
  };
}

/** Score one token against one lead (0 = no match). */
function scoreToken(l: Lead, tok: string, h: ReturnType<typeof haystacks>): number {
  const t = tok.toLowerCase();
  let best = 0;
  const bump = (n: number) => { if (n > best) best = n; };

  // Lead number — full text, or just the number ("009", "9", "31").
  const no = (l.leadNo ?? "").toLowerCase();
  if (no && no === t) bump(100);
  if (ID_LIKE.test(tok)) {
    const q = digitsOf(tok);
    const n = leadNumber(l.leadNo);
    if (q && n != null) {
      if (n === Number(q)) bump(98);                              // 009 == 9 == L-009
      else if (digitsOf(l.leadNo).startsWith(q)) bump(60);        // "03" → L-031
      else if (digitsOf(l.leadNo).includes(q) && q.length >= 2) bump(45);
    }
  }
  if (no && no.includes(t) && t.length >= 2) bump(55);

  // Phones: 4+ digits, compared on the normalised last-10 digits.
  const qd = digitsOf(tok);
  if (qd.length >= 4 && /^[+\d\s-]+$/.test(tok)) {
    const q10 = qd.length > 10 ? qd.slice(-10) : qd;
    for (const p of [last10(l.number), last10(l.alternateNumber)]) {
      if (!p) continue;
      if (p === q10) bump(96);
      else if (p.startsWith(q10)) bump(82);
      else if (p.includes(q10)) bump(75);
    }
  }

  // Text fields.
  if (h.email.includes(t)) bump(h.email.startsWith(t) ? 85 : 78);
  if (h.name.startsWith(t)) bump(80);
  else if (h.name.split(/\s+/).some((w) => w.startsWith(t))) bump(72);
  else if (h.name.includes(t)) bump(60);
  if (h.device.includes(t)) bump(55);
  if (h.issue.includes(t)) bump(48);
  if (h.other.includes(t)) bump(40);
  return best;
}

export function scoreLead(l: Lead, query: string): number {
  const toks = query.trim().split(/\s+/).filter(Boolean);
  if (toks.length === 0) return 0;
  // "+91 86607 71346" — the whole query is one phone number.
  const whole = query.trim();
  const wholeIsPhone = /^[+\d\s-]+$/.test(whole) && digitsOf(whole).length >= 7;
  const h = haystacks(l);
  if (wholeIsPhone) {
    const q10 = last10(whole);
    for (const p of [last10(l.number), last10(l.alternateNumber)]) if (p && p.includes(q10)) return p === q10 ? 96 : 80;
  }
  let total = 0;
  for (const t of toks) {
    const s = scoreToken(l, t, h);
    if (s === 0) return 0;          // every term must match something (AND)
    total += s;
  }
  return Math.round(total / toks.length);
}

/** Ranked matches (best first; ties → newest lead number). */
export function searchLeads(leads: Lead[], query: string, limit = 8): Lead[] {
  if (!query.trim()) return [];
  return leads
    .map((l) => ({ l, s: scoreLead(l, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (leadNumber(b.l.leadNo) ?? 0) - (leadNumber(a.l.leadNo) ?? 0))
    .slice(0, limit)
    .map((x) => x.l);
}

/** A single unambiguous lead for "Find"/Enter: an exact number/phone hit, or the only result. */
export function pickBestLead(leads: Lead[], query: string): Lead | null {
  const scored = leads.map((l) => ({ l, s: scoreLead(l, query) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (scored.length === 0) return null;
  if (scored.length === 1) return scored[0].l;
  return scored[0].s >= 96 && scored[0].s > scored[1].s ? scored[0].l : null;
}
