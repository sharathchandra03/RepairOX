"use client";

/**
 * Centralized Activity Log / Audit Trail.
 *
 * A single module-level store (not tied to React render) so ANY module —
 * store.tsx, catalog-context.tsx, UI actions — can record an activity by
 * simply importing `logActivity(...)`. Components subscribe via
 * `useActivityLog()` (React 18 useSyncExternalStore). Entries persist to
 * localStorage so the audit trail survives reloads and outlives the records
 * they describe (critical for delete auditing).
 */

import { useSyncExternalStore } from "react";
import { CURRENT_USER, currentRole } from "./permissions";

/* ─── Types ──────────────────────────────────────────────────────── */

export type ActivitySeverity = "success" | "info" | "warning" | "critical" | "neutral";

export type ActivityModule =
  | "Ticket" | "Invoice" | "Inventory" | "Customer" | "Walk-In"
  | "Price List" | "Employee" | "Settings" | "Auth" | "System";

export interface ActivityChange {
  field: string;
  from?: string;
  to?: string;
}

export interface ActivityEntry {
  id: string;
  /** epoch ms */
  ts: number;
  module: ActivityModule;
  /** Human action label, e.g. "Ticket Created", "Invoice Deleted". */
  action: string;
  severity: ActivitySeverity;
  /** Entity type, e.g. "Ticket", "Invoice", "Part". */
  entity?: string;
  /** Reference / record id, e.g. "TK-1025", "INV-230". */
  reference?: string;
  /** One-line human description. */
  description: string;
  actor: string;
  role?: string;
  branch?: string;
  /** Field-level before/after diffs (for updates). */
  changes?: ActivityChange[];
  /** Reason captured on deletes / cancellations. */
  reason?: string;
  /** Extra key/value context shown in the detail view. */
  meta?: Record<string, string>;
}

/** Everything except the auto-filled fields; actor/role/branch/ts optional. */
export type ActivityInput =
  Omit<ActivityEntry, "id" | "ts" | "actor" | "role" | "branch"> &
  Partial<Pick<ActivityEntry, "actor" | "role" | "branch" | "ts">>;

/* ─── Store (module singleton) ───────────────────────────────────── */

const STORAGE_KEY = "repairox-activity-log";
const MAX_ENTRIES = 600;

let entries: ActivityEntry[] = [];
let hydrated = false;
const listeners = new Set<() => void>();
let _counter = 0;

function genId(): string {
  _counter += 1;
  return `act-${Date.now().toString(36)}-${_counter}`;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch { /* storage full/unavailable */ }
}

function emit() {
  for (const l of listeners) l();
}

/** Load persisted entries (or seed) once on the client. */
function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) { entries = parsed; return; }
    }
  } catch { /* ignore */ }
  // First run — seed a realistic recent trail so the widget isn't empty.
  entries = seedActivities();
  persist();
}

export function logActivity(input: ActivityInput): ActivityEntry {
  ensureHydrated();
  const role = currentRole();
  const entry: ActivityEntry = {
    id: genId(),
    ts: input.ts ?? Date.now(),
    module: input.module,
    action: input.action,
    severity: input.severity,
    entity: input.entity,
    reference: input.reference,
    description: input.description,
    actor: input.actor ?? CURRENT_USER.name,
    role: input.role ?? role?.label,
    branch: input.branch ?? CURRENT_USER.branch,
    changes: input.changes?.filter((c) => c.from !== c.to),
    reason: input.reason,
    meta: input.meta,
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  persist();
  emit();
  return entry;
}

export function getActivities(): ActivityEntry[] {
  ensureHydrated();
  return entries;
}

export function clearActivities() {
  entries = [];
  persist();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/* ─── React hook ─────────────────────────────────────────────────── */

export function useActivityLog(): ActivityEntry[] {
  return useSyncExternalStore(subscribe, getActivities, () => []);
}

/* ─── Severity visual tokens ─────────────────────────────────────── */
// Subtle colored icon/badge — rows stay clean (RepairOX premium look).

export const SEVERITY_STYLE: Record<ActivitySeverity, { icon: string; badge: string; dot: string; label: string }> = {
  success:  { icon: "bg-emerald-50 text-emerald-600 ring-emerald-200/60", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", label: "Success" },
  info:     { icon: "bg-[#EEF1FD] text-[#4361EE] ring-[#B3BFF6]/60",       badge: "bg-[#EEF1FD] text-[#3347D6] ring-[#B3BFF6]/60", dot: "bg-[#4361EE]", label: "Info" },
  warning:  { icon: "bg-amber-50 text-amber-600 ring-amber-200/60",        badge: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", label: "Warning" },
  critical: { icon: "bg-rose-50 text-rose-600 ring-rose-200/60",           badge: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500", label: "Critical" },
  neutral:  { icon: "bg-zinc-100 text-zinc-500 ring-zinc-200/60",          badge: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400", label: "Neutral" },
};

export const ALL_MODULES: ActivityModule[] = [
  "Ticket", "Invoice", "Inventory", "Customer", "Walk-In", "Price List", "Employee", "Settings", "Auth", "System",
];

/* ─── Time formatting ────────────────────────────────────────────── */

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Just now" / "5 min ago" / "2 h ago" / "Today • 10:42 AM" / "28 Jul 2026 • 11:42 AM". */
export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min ago`;
  if (isSameDay(d, now)) return `Today • ${time}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return `Yesterday • ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} • ${time}`;
}

/** Chronological bucket label for grouped timelines. */
export function timeGroup(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (isSameDay(d, now)) return "Today";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  const diffDays = Math.floor((now.getTime() - ts) / 86_400_000);
  if (diffDays <= 7) return "Earlier This Week";
  if (diffDays <= 31) return "Earlier This Month";
  return "Older";
}

export function fullTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/* ─── Diff helper ────────────────────────────────────────────────── */

/** Build a change list from an updates object vs the previous record. */
export function buildChanges(
  prev: Record<string, unknown> | undefined,
  updates: Record<string, unknown>,
  fields: { key: string; label: string; format?: (v: unknown) => string }[],
): ActivityChange[] {
  const changes: ActivityChange[] = [];
  for (const f of fields) {
    if (!(f.key in updates)) continue;
    const to = updates[f.key];
    const from = prev?.[f.key];
    const fmt = f.format ?? ((v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v)));
    if (String(from ?? "") === String(to ?? "")) continue;
    changes.push({ field: f.label, from: fmt(from), to: fmt(to) });
  }
  return changes;
}

/* ─── Seed trail ─────────────────────────────────────────────────── */
// A realistic recent audit trail so the dashboard widget is populated on first
// load. Real activities logged by store/catalog actions stack on top.

function seedActivities(): ActivityEntry[] {
  const now = Date.now();
  const min = 60_000, hr = 3_600_000, day = 86_400_000;
  const mk = (
    ago: number,
    module: ActivityModule,
    action: string,
    severity: ActivitySeverity,
    reference: string | undefined,
    description: string,
    actor: string,
    role: string,
    extra: Partial<ActivityEntry> = {},
  ): ActivityEntry => ({
    id: genId(), ts: now - ago, module, action, severity, reference, description,
    actor, role, branch: "BTM Layout (HQ)", ...extra,
  });

  return [
    mk(3 * min, "Ticket", "Ticket Created", "success", "TK-1042", "Created a new repair ticket for iPhone 15 Pro.", "Anjali R.", "Reception"),
    mk(18 * min, "Invoice", "Invoice Generated", "success", "INV-238", "Generated invoice from Ticket TK-1042.", "Radha Iyer", "Cashier / Accounts", { meta: { "From Ticket": "TK-1042", Amount: "₹18,500" } }),
    mk(40 * min, "Ticket", "Technician Changed", "info", "TK-1039", "Reassigned technician for MacBook Air M2 repair.", "Ritesh Kumar", "Branch Manager", { changes: [{ field: "Technician", from: "Pooja Iyer", to: "Anand Rao" }] }),
    mk(1 * hr + 12 * min, "Inventory", "Stock Reduced", "warning", "INV-BATT-14", "Deducted 2 units of iPhone 14 battery for a repair.", "Anand Rao", "Senior Technician", { changes: [{ field: "Stock", from: "24", to: "22" }] }),
    mk(2 * hr, "Invoice", "Payment Added", "success", "INV-236", "Recorded ₹6,500 payment (UPI).", "Radha Iyer", "Cashier / Accounts", { meta: { Method: "UPI", Amount: "₹6,500" } }),
    mk(3 * hr + 20 * min, "Price List", "Price Updated", "info", "Display Assembly", "Updated MacBook Air M3 Display Assembly price.", "Kalai S.", "Master Shop Owner", { changes: [{ field: "Price", from: "₹17,800", to: "₹18,500" }] }),
    mk(5 * hr, "Ticket", "Ticket Deleted", "critical", "TK-1019", "Deleted a cancelled repair ticket.", "Kalai S.", "Master Shop Owner", { reason: "Duplicate ticket" }),
    mk(1 * day, "Customer", "Customer Created", "success", "CUS-208", "Added new customer Meera Nair.", "Anjali R.", "Reception"),
    mk(1 * day + 2 * hr, "Walk-In", "Walk-In Converted", "info", "WI-88", "Converted walk-in to repair ticket TK-1035.", "Anjali R.", "Reception", { meta: { "New Ticket": "TK-1035" } }),
    mk(1 * day + 5 * hr, "Inventory", "Item Added", "success", "INV-SPKR-09", "Added new inventory item: OnePlus 12 loudspeaker.", "Vikas Nair", "Inventory Manager"),
    mk(2 * day, "Invoice", "Invoice Deleted", "critical", "INV-230", "Deleted duplicate invoice.", "Kalai S.", "Master Shop Owner", { reason: "Duplicate invoice" }),
    mk(2 * day + 4 * hr, "Settings", "Configuration Changed", "info", undefined, "Updated store printing preferences.", "Kalai S.", "Master Shop Owner"),
    mk(3 * day, "Auth", "Login", "neutral", undefined, "Signed in to RepairOX.", "Ritesh Kumar", "Branch Manager"),
    mk(4 * day, "Price List", "Model Added", "success", "Galaxy S25 Ultra", "Added Galaxy S25 Ultra under Samsung.", "Kalai S.", "Master Shop Owner"),
    mk(6 * day, "Employee", "Employee Created", "success", undefined, "Invited Manoj S. as Sales Executive.", "Kalai S.", "Master Shop Owner"),
  ];
}
