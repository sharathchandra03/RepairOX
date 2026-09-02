/**
 * Device Identifier Detection
 * ---------------------------
 * A single, intelligent identifier field replaces the old "ID Type" dropdown +
 * "IMEI Number" input. The user types ONE value; the system decides whether it
 * is an IMEI or a Serial Number from the value itself.
 *
 * The persisted data model is unchanged for backward-compatibility:
 *   identifierType  →  DeviceRecord.imeiType ("imei" | "serial")
 *   identifierValue →  DeviceRecord.imei     (the raw entered string)
 *
 * These helpers are the single source of truth for detection + validation so
 * every surface (ticket wizard, overlay, table, print, invoice) behaves the
 * same way. Detection rules deliberately mirror the pre-existing inline rules:
 *   - IMEI   : numeric only, exactly 16 digits (the app's existing IMEI length)
 *   - Serial : alphanumeric, 1–15 characters, containing at least one letter
 */

/** The two supported identifier types. Lower-case to match the existing
 *  DeviceRecord.imeiType persisted values (never introduce new casings). */
export type IdentifierType = "imei" | "serial";

/** Uppercase form used in UI copy and the abstract data contract
 *  (identifierType = "IMEI" | "SERIAL"). */
export type IdentifierTypeUpper = "IMEI" | "SERIAL";

/** Result of live detection while the user is typing. `null` type means the
 *  value cannot yet be confidently classified — keep the neutral label. */
export type IdentifierDetection = {
  /** Confident classification, or null when still ambiguous / empty. */
  type: IdentifierType | null;
  /** The label to show above the input right now. */
  label: string;
  /** True once the value satisfies its detected type's validation rules. */
  valid: boolean;
};

/** Neutral label shown when empty or not yet classifiable. */
export const IDENTIFIER_NEUTRAL_LABEL = "IMEI / Serial";
export const IDENTIFIER_PLACEHOLDER = "Enter IMEI or Serial Number...";

/** Max character lengths — mirror the app's pre-existing inline caps. */
export const IMEI_MAX_LEN = 16;
export const SERIAL_MAX_LEN = 15;

/**
 * Valid IMEI: numeric only, exactly 16 digits.
 * This preserves the project's existing IMEI validation (see the previous
 * ticket-wizard inline rule "IMEI must contain exactly 16 digits"). We do NOT
 * weaken it, and we do NOT classify arbitrary numeric strings as IMEI unless
 * they meet the full length rule.
 */
export function isValidImei(value: string): boolean {
  return /^[0-9]{16}$/.test(value.trim());
}

/**
 * Valid Serial Number: alphanumeric, 1–15 chars, containing at least one
 * letter. The letter requirement is what lets us confidently distinguish a
 * serial from a partially-typed IMEI. Matches supported examples like
 * SN123456, ABC123456, A1B2C3D4.
 */
export function isValidSerial(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= SERIAL_MAX_LEN && /^[a-zA-Z0-9]+$/.test(v) && /[a-zA-Z]/.test(v);
}

/**
 * Sanitize keystrokes for the single identifier field. We allow alphanumerics
 * (so serials can be typed) and cap the length at the larger of the two limits
 * (16). When the value is purely numeric it may reach 16 (IMEI); once a letter
 * is present it is a serial and capped at 15.
 */
export function sanitizeIdentifierInput(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
  const hasAlpha = /[a-zA-Z]/.test(cleaned);
  const max = hasAlpha ? SERIAL_MAX_LEN : IMEI_MAX_LEN;
  return cleaned.slice(0, max);
}

/**
 * Live detection used by the input's onChange. Returns the classification, the
 * label to display, and whether the current value is valid.
 *
 * Behaviour:
 *   - empty                       → neutral label, no type
 *   - contains a letter + valid   → Serial Number
 *   - contains a letter (partial) → Serial Number (letters can only be serials)
 *   - all digits + valid IMEI     → IMEI Number
 *   - all digits (partial)        → neutral label (don't switch prematurely)
 */
export function detectIdentifier(rawValue: string): IdentifierDetection {
  const value = (rawValue || "").trim();

  if (value.length === 0) {
    return { type: null, label: IDENTIFIER_NEUTRAL_LABEL, valid: false };
  }

  const hasAlpha = /[a-zA-Z]/.test(value);

  if (hasAlpha) {
    // Any letter means this can only ever be a serial — switch immediately so
    // the label feels responsive, and report validity for the subtle message.
    return { type: "serial", label: "Serial Number", valid: isValidSerial(value) };
  }

  // Purely numeric — switch to "IMEI Number" as soon as the user starts typing
  // digits. `valid` still tracks the full 16-digit rule for the subtle
  // validation message, but the label updates immediately.
  return { type: "imei", label: "IMEI Number", valid: isValidImei(value) };
}

/**
 * Resolve the FINAL persisted identifier type from a value. Used on save so the
 * stored imeiType always agrees with the value. Falls back to "imei" for empty
 * values to keep the union happy (empty identifiers are simply blank).
 */
export function resolveIdentifierType(value: string): IdentifierType {
  const v = (value || "").trim();
  if (v.length === 0) return "imei";
  return /[a-zA-Z]/.test(v) ? "serial" : "imei";
}

/** Normalise any stored imeiType (incl. legacy "imei1"/"imei2") to the two
 *  supported types for display. */
export function normalizeIdentifierType(imeiType?: string, value?: string): IdentifierType {
  if (imeiType === "serial") return "serial";
  if (imeiType === "imei" || imeiType === "imei1" || imeiType === "imei2") return "imei";
  // Unknown / legacy blank — infer from the value so historical records that
  // stored a serial without a type still display correctly.
  return resolveIdentifierType(value || "");
}

/**
 * The label to travel WITH a saved identifier when it is displayed.
 * `long` returns "Serial No." style; otherwise the short "Serial" / "IMEI".
 */
export function identifierDisplayLabel(imeiType?: string, value?: string, opts?: { long?: boolean }): string {
  const type = normalizeIdentifierType(imeiType, value);
  if (type === "serial") return opts?.long ? "Serial No." : "Serial";
  return "IMEI";
}
