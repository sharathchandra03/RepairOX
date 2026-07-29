/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Authentication & staff-account helpers.

   Pure (no React) utilities shared by the permission context, the login
   screen and the staff-creation form. Everything here is written to be
   backend-swappable: when you connect a real database + auth provider
   (see DATABASE-SETUP.md), only the persistence + password hashing move
   server-side — the shapes and helpers below stay the same.
   ────────────────────────────────────────────────────────────────────────── */

import { WORKSPACES, getAllowedWorkspaces, type WorkspaceDef } from "@/lib/permissions";

/* ── Branches ────────────────────────────────────────────────────────────
   The physical locations a staff member can be assigned to. Kept here as a
   single source so the staff form, directory filters and role scope all read
   the same list. Swap for a `branches` table when the DB is connected. */
export const BRANCHES = [
  "BTM Layout (HQ)",
  "Koramangala",
  "HSR Layout",
  "Warehouse A",
] as const;

export type Branch = (typeof BRANCHES)[number];

/* ── Salary types ────────────────────────────────────────────────────────
   How a staff member is compensated. Drives payroll generation downstream. */
export type SalaryType = "monthly" | "daily" | "hourly" | "commission";

export const SALARY_TYPES: { value: SalaryType; label: string }[] = [
  { value: "monthly", label: "Monthly Salary" },
  { value: "daily", label: "Daily Wage" },
  { value: "hourly", label: "Hourly Rate" },
  { value: "commission", label: "Commission Only" },
];

export const SALARY_TYPE_LABEL: Record<SalaryType, string> = Object.fromEntries(
  SALARY_TYPES.map((s) => [s.value, s.label])
) as Record<SalaryType, string>;

/* ── Password hashing ──────────────────────────────────────────────────────
   DEMO-GRADE ONLY. This is a fast, deterministic, salted hash so the
   client-only prototype can persist credentials in localStorage without
   storing plaintext. It is NOT cryptographically secure.

   👉 When you connect a real backend, DELETE this and hash passwords on the
   server with bcrypt / argon2 (see DATABASE-SETUP.md). Supabase Auth handles
   this for you automatically. */
const PEPPER = "repairox::v1";

export function hashPassword(password: string, salt: string): string {
  const input = `${salt}::${password}::${PEPPER}`;
  // FNV-1a 32-bit, run twice with a rotation for a bit more spread.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let h2 = 0xc2b2ae35 ^ h;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x27d4eb2f);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  if (!hash) return false;
  return hashPassword(password, salt) === hash;
}

/* ── Password policy ───────────────────────────────────────────────────────
   Validated in the UI before an account is created. Keep in sync with any
   server-side rule you add later. */
export const PASSWORD_MIN_LENGTH = 6;

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

export function validatePassword(password: string, confirm: string): PasswordCheck {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { ok: false, message: "Passwords do not match." };
  }
  return { ok: true };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Default password given to the pre-seeded demo staff accounts so you can
 *  sign in immediately (e.g. owner abc@gmail.com / this password). Real
 *  accounts created through the Add Staff form use whatever password the
 *  owner types. */
export const DEFAULT_SEED_PASSWORD = "repairox123";

/* ── Permission-driven landing ─────────────────────────────────────────────
   The single rule that decides where a user lands after login:
     • access to all modules      → module selection screen
     • access to exactly one       → straight into that module
     • access to some (2 of 3)      → highest-priority module (WORKSPACES order)
   `allowed` is expected to already be in WORKSPACES priority order. */
export function computeLandingHref(allowed: WorkspaceDef[]): string {
  if (!allowed || allowed.length === 0) return "/login";
  if (allowed.length >= WORKSPACES.length) return "/workspaces";
  if (allowed.length === 1) return allowed[0].homeHref;
  return allowed[0].homeHref;
}

/** Convenience: landing straight from a role id. */
export function landingForRole(roleId: string): string {
  return computeLandingHref(getAllowedWorkspaces(roleId));
}
