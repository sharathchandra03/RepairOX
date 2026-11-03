/* Org-wide time display format (Settings → Store → Time Format).
 * The StoreSettingsProvider calls setTimeFormat() whenever the setting loads or
 * changes; every CRM surface formats clock times through these helpers so the
 * whole app follows one preference. Default is 12-hour. */

export type TimeFormat = "12h" | "24h";

let current: TimeFormat = "12h";

export function setTimeFormat(f: TimeFormat | null | undefined) {
  current = f === "24h" ? "24h" : "12h";
}

export function getTimeFormat(): TimeFormat {
  return current;
}

/** Intl `hour12` flag for the current org preference. */
export function useHour12(): boolean {
  return current === "12h";
}

/** Format a Date / ISO string / epoch ms as a clock time (e.g. "5:40 PM"). */
export function formatClock(input: Date | string | number, opts?: { timeZone?: string; pad?: boolean }): string {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  const base: Intl.DateTimeFormatOptions = {
    hour: opts?.pad || current === "24h" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: current === "12h",
  };
  try {
    return new Intl.DateTimeFormat("en-IN", { ...base, timeZone: opts?.timeZone }).format(d).toUpperCase();
  } catch {
    return new Intl.DateTimeFormat("en-IN", base).format(d).toUpperCase();
  }
}

/** Convert a stored "HH:mm" (24h) string into the preferred display format. */
export function formatHHmm(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return value;
  const h = Number(m[1]);
  const min = m[2];
  if (current === "24h") return `${String(h).padStart(2, "0")}:${min}`;
  const mer = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${min} ${mer}`;
}
