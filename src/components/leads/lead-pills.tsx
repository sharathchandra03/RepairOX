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
