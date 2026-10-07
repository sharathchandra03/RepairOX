/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead status / priority pill tone helpers.

   Because status, priority, result etc. are ADMIN-CONFIGURABLE (any label is
   possible), we can't hardcode a fixed enum → colour map. Instead we match on
   keywords so common lifecycle terms get sensible colours, and anything
   unrecognised falls back to a neutral tone. Pills still render for custom
   values — they just use the neutral style.
   ────────────────────────────────────────────────────────────────────────── */

const NEUTRAL = "bg-zinc-100 text-zinc-600 ring-zinc-200";

/** Ring/bg tone for a (configurable) status value. */
export function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (/new/.test(s)) return "bg-sky-50 text-sky-700 ring-sky-200";
  if (/won|convert|qualif/.test(s)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (/lost|drop|not interested/.test(s)) return "bg-zinc-100 text-zinc-500 ring-zinc-200";
  if (/follow/.test(s)) return "bg-orange-50 text-orange-700 ring-orange-200";
  if (/contact|progress|proposal/.test(s)) return "bg-violet-50 text-violet-700 ring-violet-200";
  if (/interest/.test(s)) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  return NEUTRAL;
}

/** Text tone for a (configurable) priority / nature value. */
export function priorityTone(priority: string): string {
  const p = priority.toLowerCase();
  if (/urgent|hot|high/.test(p)) return "text-rose-600";
  if (/warm|normal|medium/.test(p)) return "text-amber-600";
  if (/cold|low/.test(p)) return "text-sky-600";
  return "text-zinc-500";
}

/** Pill tone (bg + text + ring) for a (configurable) Lead Nature value —
 *  Hot / Warm / Cold. Keyword-matched so admin-renamed labels still colour
 *  sensibly; unrecognised values fall back to neutral. */
export function leadNatureTone(nature: string): string {
  const n = nature.toLowerCase();
  if (/hot|urgent|high/.test(n)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (/warm|medium/.test(n)) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (/cold|low/.test(n)) return "bg-sky-50 text-sky-700 ring-sky-200";
  return NEUTRAL;
}

/** Hex dot/flame colour matching leadNatureTone for the leading glyph. */
export function leadNatureDot(nature: string): string {
  const n = nature.toLowerCase();
  if (/hot|urgent|high/.test(n)) return "#e11d48";  // rose-600
  if (/warm|medium/.test(n)) return "#d97706";      // amber-600
  if (/cold|low/.test(n)) return "#0284c7";         // sky-600
  return "#71717a";                                 // zinc-500
}

/** Emoji glyph for a (configurable) Lead Nature value — 🔥 Hot, 🌤️ Warm,
 *  ❄️ Cold. Keyword-matched; unrecognised values get a neutral 🏷️. */
export function leadNatureGlyph(nature: string): string {
  const n = nature.toLowerCase();
  if (/hot|urgent|high/.test(n)) return "🔥";
  if (/warm|medium/.test(n)) return "🌤️";
  if (/cold|low/.test(n)) return "❄️";
  return "🏷️";
}

/** Pill tone (bg + text + ring) for the LEAD CATEGORY = qualification value
 *  (Qualified Lead / Not Qualified Lead). Not-Qualified is matched FIRST so it
 *  never falls into the generic "qualif" → green branch. Keyword-matched so
 *  admin-renamed labels still colour sensibly; empty / unrecognised → neutral. */
export function qualificationTone(value: string): string {
  const v = (value || "").toLowerCase();
  if (!v) return NEUTRAL;
  if (/not\s*-?\s*qualif|unqualif|disqualif/.test(v)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (/qualif/.test(v)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return NEUTRAL;
}

/** Hex dot colour matching qualificationTone for the leading glyph. */
export function qualificationDot(value: string): string {
  const v = (value || "").toLowerCase();
  if (!v) return "#a1a1aa";                                    // zinc-400
  if (/not\s*-?\s*qualif|unqualif|disqualif/.test(v)) return "#e11d48"; // rose-600
  if (/qualif/.test(v)) return "#10b981";                      // emerald-500
  return "#a1a1aa";
}
