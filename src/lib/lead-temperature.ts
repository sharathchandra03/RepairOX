/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Temperature (buying-intent) model + history.

   Lead TEMPERATURE is the customer's BUYING INTENT — Hot / Warm / Cold. It is
   a DIFFERENT concept from Lead Status (the sales/workflow lifecycle), Action
   (system-derived) and Result (system-derived). A lead can be "Hot" while its
   Status is "Follow-up"; the two never merge.

   Temperature lives on the canonical lead as `lead.leadNature` (the existing
   configurable field — Hot/Warm/Cold). This module adds:
     • a stable `TemperatureLevel` classification (keyword-matched so an
       admin-renamed label like "Very Hot" still buckets to `hot`);
     • the Cold → Warm → Hot STEP model for the stepped indicator; and
     • an append-only TEMPERATURE HISTORY record type.

   The history is REVERSIBLE (Hot → Warm → Cold are all valid) and NEVER
   overwritten — every real transition is preserved with who changed it, when,
   and an optional reason. No React here — pure types + helpers.
   ────────────────────────────────────────────────────────────────────────── */

/** The stable temperature bucket a (configurable) leadNature value maps to. */
export type TemperatureLevel = "hot" | "warm" | "cold" | "other";

/** The Cold → Warm → Hot progression order (ascending intent). "other" is not
 *  part of the step rail. */
export const TEMPERATURE_STEPS: Exclude<TemperatureLevel, "other">[] = ["cold", "warm", "hot"];

/**
 * Classify a (configurable) leadNature value into a stable temperature bucket.
 * Keyword-matched (case-insensitive) so admin-renamed labels still bucket
 * sensibly; an empty / unrecognised value → "other".
 */
export function temperatureLevel(nature: string | null | undefined): TemperatureLevel {
  const n = (nature || "").trim().toLowerCase();
  if (!n) return "other";
  if (/hot|urgent|high/.test(n)) return "hot";
  if (/warm|medium/.test(n)) return "warm";
  if (/cold|low/.test(n)) return "cold";
  return "other";
}

/** Short human label for a temperature bucket. */
export function temperatureLevelLabel(level: TemperatureLevel): string {
  switch (level) {
    case "hot":  return "Hot";
    case "warm": return "Warm";
    case "cold": return "Cold";
    default:     return "Not set";
  }
}

/** Emoji glyph per temperature bucket (🔥 / 🌤️ / ❄️). */
export function temperatureGlyph(level: TemperatureLevel): string {
  switch (level) {
    case "hot":  return "🔥";
    case "warm": return "🌤️";
    case "cold": return "❄️";
    default:     return "🏷️";
  }
}

/** Restrained semantic pill tone (bg + text + ring) per temperature bucket.
 *  Cold = sky/neutral, Warm = amber, Hot = rose — only the indicator carries
 *  the strong semantic colour (never splashed across the page). */
export function temperatureTone(level: TemperatureLevel): string {
  switch (level) {
    case "hot":  return "bg-rose-50 text-rose-700 ring-rose-200";
    case "warm": return "bg-amber-50 text-amber-700 ring-amber-200";
    case "cold": return "bg-sky-50 text-sky-700 ring-sky-200";
    default:     return "bg-zinc-100 text-zinc-500 ring-zinc-200";
  }
}

/** Solid accent hex per temperature bucket — for the stepped indicator dot /
 *  connector fill. */
export function temperatureAccent(level: TemperatureLevel): string {
  switch (level) {
    case "hot":  return "#e11d48"; // rose-600
    case "warm": return "#d97706"; // amber-600
    case "cold": return "#0284c7"; // sky-600
    default:     return "#a1a1aa"; // zinc-400
  }
}

/** The 0-based position of a level on the Cold→Warm→Hot rail (-1 for other). */
export function temperatureStepIndex(level: TemperatureLevel): number {
  return TEMPERATURE_STEPS.indexOf(level as Exclude<TemperatureLevel, "other">);
}

/** Direction of a transition for display ("rose" = cooling, "warmed" = heating,
 *  "set" = first set / lateral). */
export function temperatureDirection(prev: TemperatureLevel, next: TemperatureLevel): "warmed" | "cooled" | "set" {
  const a = temperatureStepIndex(prev);
  const b = temperatureStepIndex(next);
  if (a < 0 || b < 0) return "set";
  if (b > a) return "warmed";
  if (b < a) return "cooled";
  return "set";
}

/* ─── Temperature history (append-only transition record) ──────────────────
   One row per REAL temperature change. Reversible — a Hot→Warm→Cold sequence
   keeps all three rows; nothing is ever overwritten. Where the architecture
   permits, each row records the previous + new value, who changed it, when,
   and an optional reason/comment. */

export interface LeadTemperatureEvent {
  id: string;
  leadId: string;
  /** The leadNature value BEFORE the change ("" when first set). */
  fromValue: string;
  /** The leadNature value AFTER the change. */
  toValue: string;
  /** Classified buckets (derived from the raw values, cached for display). */
  fromLevel: TemperatureLevel;
  toLevel: TemperatureLevel;
  /** Who made the change. */
  changedBy: string;
  changedByName: string;
  /** Optional free-text reason / comment captured at change time ("" = none). */
  reason: string;
  /** ISO instant of the change. */
  changedAt: string;
}

/** Build a transition event from raw leadNature values. */
export function makeTemperatureEvent(args: {
  id: string;
  leadId: string;
  fromValue: string;
  toValue: string;
  changedBy: string;
  changedByName: string;
  reason?: string;
  changedAt?: string;
}): LeadTemperatureEvent {
  return {
    id: args.id,
    leadId: args.leadId,
    fromValue: args.fromValue || "",
    toValue: args.toValue || "",
    fromLevel: temperatureLevel(args.fromValue),
    toLevel: temperatureLevel(args.toValue),
    changedBy: args.changedBy || "",
    changedByName: args.changedByName || "",
    reason: (args.reason || "").trim(),
    changedAt: args.changedAt || new Date().toISOString(),
  };
}
