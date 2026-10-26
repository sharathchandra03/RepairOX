-- ============================================================================
-- 0082 — Single-device login + owner login alerts (ADDITIVE, idempotent).
--
-- Two client-requested behaviours for EMPLOYEES (every role EXCEPT the org
-- owners master_shop_owner / platform_owner):
--
--   1. SINGLE-DEVICE LOGIN — when an employee signs in on a new device, their
--      OTHER active sessions are revoked, so only the current device stays
--      signed in. Enforced in POST /api/account/sessions by setting
--      user_sessions.revoked_at on the employee's other live rows; the revoked
--      device's next heartbeat returns HTTP 410 and the client signs it out.
--
--   2. OWNER LOGIN ALERT — the same event writes a durable row into the
--      existing public.notifications table (migration 0025), addressed to the
--      owner roles via recipient_role, with kind = 'employee_login'. An
--      owner-only client poller (/api/account/login-alerts) surfaces it into
--      the owner's topbar bell on the owner's OWN device.
--
-- NO SCHEMA CHANGE is required — public.user_sessions (migration 0009) and
-- public.notifications (migration 0025) already carry every column these
-- features use (revoked_at; kind/title/body/recipient_role/dedupe_key/read).
-- This migration only adds a supporting index for the owner-alert query and
-- documents the contract. It is purely additive and safe to re-run.
--
-- Owners are EXEMPT from both behaviours (never single-device-restricted; their
-- own logins never raise an alert). The owner-role targeting here is a
-- notification-routing detail, not a security gate — RLS on both tables and the
-- routes' own self-scoping remain the real boundary.
-- ============================================================================

-- Fast lookup for the owner login-alert poller:
--   notifications WHERE kind='employee_login' AND recipient_role=? AND read=false
-- Partial index keeps it tiny (only unread login alerts).
create index if not exists notifications_login_alert_idx
  on public.notifications (organization_id, recipient_role, created_at desc)
  where kind = 'employee_login' and read = false;

-- ============================================================================
-- Done. No table/column changes. The sessions route writes the revoke + the
-- employee_login notifications; the login-alerts route reads/acks them; the
-- client (use-session-tracker.ts / use-login-alerts.ts) enforces + surfaces.
-- ============================================================================
