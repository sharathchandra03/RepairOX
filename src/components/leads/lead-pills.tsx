import { CalendarClock, Handshake, Home, MessageCircle, PhoneCall, PhoneOff, Sparkles, Store, Tag, Trophy, Truck, XCircle } from "lucide-react";
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
/* Lead Stage ICON (shown in the coloured cap of the Lead Stage tag). Same
   keyword idea as the colours; unknown stages get a neutral tag icon. */
export function stageIcon(status: string, className = "h-3.5 w-3.5"): React.ReactNode {
  const s = (status || "").toLowerCase();
  if (/new/.test(s)) return <Sparkles className={className} />;
  if (/not connected|rnr|no response|unreachable/.test(s)) return <PhoneOff className={className} />;
  if (/call ?back/.test(s)) return <PhoneCall className={className} />;
  if (/follow/.test(s)) return <CalendarClock className={className} />;
  if (/pick ?up/.test(s)) return <Truck className={className} />;
  if (/on ?-?site/.test(s)) return <Home className={className} />;
  if (/walk ?-?in|store visit/.test(s)) return <Store className={className} />;
  if (/deal|discount|quot/.test(s)) return <Handshake className={className} />;
  if (/won|convert|qualif|complete/.test(s)) return <Trophy className={className} />;
  if (/lost|drop|not interested|cancel|reject/.test(s)) return <XCircle className={className} />;
  if (/contact|progress|proposal|interest/.test(s)) return <MessageCircle className={className} />;
  return <Tag className={className} />;
}
/** Heat level 1–3 for a Lead Nature value (Cold 1 · Warm 2 · Hot 3; 0 = unknown). */
export function leadNatureLevel(nature: string): number {
  const n = (nature || "").toLowerCase();
  if (/hot|urgent|high/.test(n)) return 3;
  if (/warm|medium|normal/.test(n)) return 2;
  if (/cold|low/.test(n)) return 1;
  return 0;
}

/* Lead Stage colours — ONE keyword map shared by the pill tone and the dot
   (statusDotColor). Every stage gets a colour; an unrecognised admin-added
   stage gets a stable colour from a fixed palette (same name → same colour). */
const STAGE_RULES: { re: RegExp; tone: string; dot: string }[] = [
  { re: /new/, tone: "bg-sky-50 text-sky-700 ring-sky-200", dot: "#0284c7" },
  { re: /not connected|rnr|no response|unreachable/, tone: "bg-pink-50 text-pink-700 ring-pink-200", dot: "#db2777" },
  { re: /call ?back/, tone: "bg-amber-50 text-amber-700 ring-amber-200", dot: "#d97706" },
  { re: /follow/, tone: "bg-orange-50 text-orange-700 ring-orange-200", dot: "#ea580c" },
  { re: /pick ?up/, tone: "bg-blue-50 text-blue-700 ring-blue-200", dot: "#2563eb" },
  { re: /on ?-?site/, tone: "bg-violet-50 text-violet-700 ring-violet-200", dot: "#7c3aed" },
  { re: /walk ?-?in|store visit/, tone: "bg-teal-50 text-teal-700 ring-teal-200", dot: "#0d9488" },
  { re: /deal|discount|quot/, tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", dot: "#c026d3" },
  { re: /won|convert|qualif|complete/, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "#059669" },
  { re: /lost|drop|not interested|cancel|reject/, tone: "bg-rose-50 text-rose-700 ring-rose-200", dot: "#e11d48" },
  { re: /contact|progress|proposal/, tone: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "#4f46e5" },
  { re: /interest/, tone: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "#4361EE" },
];
const STAGE_FALLBACK = [
  { tone: "bg-cyan-50 text-cyan-700 ring-cyan-200", dot: "#0891b2" },
  { tone: "bg-lime-50 text-lime-700 ring-lime-200", dot: "#65a30d" },
  { tone: "bg-purple-50 text-purple-700 ring-purple-200", dot: "#9333ea" },
  { tone: "bg-yellow-50 text-yellow-700 ring-yellow-200", dot: "#ca8a04" },
  { tone: "bg-slate-100 text-slate-700 ring-slate-200", dot: "#475569" },
];
function stageStyle(status: string): { tone: string; dot: string } | null {
  const s = (status || "").trim().toLowerCase();
  if (!s) return null;
  const hit = STAGE_RULES.find((r) => r.re.test(s));
  if (hit) return hit;
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STAGE_FALLBACK[h % STAGE_FALLBACK.length];
}
export function statusTone(status: string): string {
  return stageStyle(status)?.tone ?? NEUTRAL;
}
/** Hex dot colour for a Lead Stage (matches statusTone). */
export function statusDotColor(status: string): string {
  return stageStyle(status)?.dot ?? "#71717a";
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

/* ─── Outline pill variant (Lead Table, calmer columns) ───────────────────
   Turns a filled tone ("bg-X-50 text-X-700 ring-X-200") into an OUTLINE pill:
   white surface, the tone's colour as the border (one shade stronger so it
   stays visible), neutral text. The colour also stays on the leading dot /
   glyph (`accent` = the tone's text colour class). Used for every Lead Table
   pill EXCEPT Contact Status, Lead Nature and Lead Stage (those stay filled). */
/* Literal class list so Tailwind generates every stronger border shade. */
const OUTLINE_RING: Record<string, string> = {
  emerald: "ring-emerald-300", green: "ring-green-300", teal: "ring-teal-300", cyan: "ring-cyan-300",
  sky: "ring-sky-300", blue: "ring-blue-300", indigo: "ring-indigo-300", violet: "ring-violet-300",
  purple: "ring-purple-300", fuchsia: "ring-fuchsia-300", pink: "ring-pink-300", rose: "ring-rose-300",
  red: "ring-red-300", orange: "ring-orange-300", amber: "ring-amber-300", yellow: "ring-yellow-300",
  lime: "ring-lime-300", zinc: "ring-zinc-300", slate: "ring-slate-300", gray: "ring-gray-300", stone: "ring-stone-300",
};
export function outlineTone(tone: string): { pill: string; accent: string } {
  const parts = tone.split(/\s+/).filter(Boolean);
  const accent = parts.find((p) => p.startsWith("text-")) ?? "text-zinc-500";
  const ring = parts
    .filter((p) => p.startsWith("ring-") && p !== "ring-1" && p !== "ring-inset")
    .map((p) => { const m = p.match(/^ring-([a-z]+)-(100|200)$/); return m && OUTLINE_RING[m[1]] ? OUTLINE_RING[m[1]] : p; });
  return { pill: ["bg-card text-zinc-700", ...ring].join(" "), accent };
}
