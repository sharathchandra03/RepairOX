"use client";

/**
 * RepairOX — Issue Library (persistent).
 *
 * Stores a growing list of known device issues centrally. Issues persist
 * via localStorage (same pattern as other RepairOX stores). When Supabase
 * is available in the future, this can be upgraded to DB-backed storage.
 *
 * Every issue created during ticket intake is automatically added here
 * so the library continuously grows.
 */

const STORAGE_KEY = "repairox-issue-library";

/** Default issues that ship with the app. */
const DEFAULT_ISSUES: string[] = [
  "Display Not Working",
  "Charging Issue",
  "Face ID",
  "Water Damage",
  "Speaker",
  "Microphone",
  "Battery Drain",
  "Camera Issue",
  "Touch Not Responding",
  "Back Glass Broken",
  "Power Button",
  "Volume Button",
  "WiFi Issue",
  "Bluetooth Issue",
  "SIM Not Detected",
  "Software Issue",
  "Overheating",
  "Restart Loop",
  "No Signal",
  "Motherboard Repair",
];

/** Get all stored issues (merged with defaults, de-duplicated). */
export function getIssueLibrary(): string[] {
  if (typeof window === "undefined") return DEFAULT_ISSUES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ISSUES;
    const stored: string[] = JSON.parse(raw);
    // Merge defaults + stored, de-duplicate (case-insensitive)
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const item of [...DEFAULT_ISSUES, ...stored]) {
      const key = item.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(item.trim());
      }
    }
    return merged;
  } catch {
    return DEFAULT_ISSUES;
  }
}

/** Add a new issue to the library. Returns the updated list. */
export function addIssueToLibrary(issue: string): string[] {
  const trimmed = issue.trim();
  if (!trimmed) return getIssueLibrary();
  const current = getIssueLibrary();
  const exists = current.some((i) => i.toLowerCase() === trimmed.toLowerCase());
  if (exists) return current;
  const updated = [...current, trimmed];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail on quota errors
  }
  return updated;
}

/** Parse a stored issue string (comma-separated) back into an array. */
export function parseIssueString(issueStr: string): string[] {
  if (!issueStr) return [];
  return issueStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Serialize an array of issues into a comma-separated string for storage. */
export function serializeIssues(issues: string[]): string {
  return issues.filter(Boolean).join(", ");
}
