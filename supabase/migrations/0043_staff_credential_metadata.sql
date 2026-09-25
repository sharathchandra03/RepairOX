-- ============================================================================
-- 0043 — Staff credential metadata (SAFE, additive)
--
-- Adds password-LIFECYCLE metadata to `staff` so an authorized administrator
-- (Master Shop Owner / Platform Owner / a role with credential-management
-- authority) can SEE the credential STATUS of a user:
--   • whether a password is set,
--   • WHEN it was last changed, and
--   • whether the user must change it at next login.
--
-- It NEVER stores the password itself. Passwords remain hashed inside Supabase
-- Auth (auth.users). There is no plaintext-password column and there never
-- will be — the "view current password" capability is impossible by design.
-- This satisfies the RepairOX security rules (passwords are never stored or
-- exposed in plaintext; owners may reset but never retrieve).
--
-- Every column is nullable / defaulted, so existing users keep working and
-- their existing authentication state is untouched.
-- ============================================================================

alter table public.staff
  -- When the account's login password was last set/changed (by the user or by
  -- an admin reset). NULL = unknown (legacy accounts created before this
  -- column). Stamped server-side whenever a password is written.
  add column if not exists last_password_changed_at timestamptz,
  -- Force the user to change their password on next login. Set when an admin
  -- issues a temporary password. Cleared once the user changes it.
  add column if not exists password_reset_required   boolean not null default false,
  -- When the account was disabled (login turned off / suspended) — a light
  -- audit aid for the credential panel. NULL = not disabled.
  add column if not exists disabled_at               timestamptz;

-- No RLS change needed: the existing staff_read / staff_write policies already
-- govern who can read/write these columns (self + admins in the same org). The
-- privileged /api/staff routes (service-role) remain the write path for
-- credential actions and continue to enforce requirePermission + the
-- privilege-escalation guards.

-- ============================================================================
-- Done.
-- ============================================================================
