-- ──────────────────────────────────────────────────────────────────────────
-- RepairOX — Account & Security (Settings → Account)
--
-- Backs the two Account pages:
--   • Profile        → adds per-user Access PIN + Language to the staff row.
--   • Active Sessions → real, revocable session records in `user_sessions`.
--
-- Design notes
--   • Access PIN is stored HASHED (SHA-256 with a per-row salt), never in plain
--     text. The UI masks it and only ever sends a new PIN to the server; the
--     server hashes it. The stored hash is never returned to the browser.
--   • Language is a PER-USER preference on the staff row (the org-wide default
--     lives on organization_settings.language and is unchanged).
--   • user_sessions is written on sign-in and touched on activity. Revoking a
--     row sets revoked_at; a revoked/expired row can no longer be treated as
--     an active session. The current device is matched by session_token.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Per-user account fields on staff ─────────────────────────────────────

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS access_pin_hash text,
  ADD COLUMN IF NOT EXISTS access_pin_salt text,
  ADD COLUMN IF NOT EXISTS access_pin_set  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS language        text NOT NULL DEFAULT 'English';


-- ── 2. Active session tracking ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  auth_user_id    uuid,                              -- auth.users id of the owner
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Opaque handle for THIS device/browser. Stored client-side (localStorage)
  -- so a device can identify (and refresh) its own row. Not a real auth token.
  session_token   text NOT NULL,

  -- Device / browser info parsed from the User-Agent (no secrets).
  user_agent      text,
  browser         text,                              -- e.g. 'Chrome'
  browser_version text,                              -- e.g. '152.0.0.0'
  os              text,                               -- e.g. 'Mac'
  device_type     text DEFAULT 'desktop',            -- 'desktop' | 'mobile' | 'tablet'

  -- Network. Location is only stored if the infra genuinely resolves it.
  ip_address      text,
  location        text,

  -- Lifecycle
  login_at        timestamptz NOT NULL DEFAULT now(),
  last_activity   timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_token_idx    ON public.user_sessions(session_token);
CREATE INDEX        IF NOT EXISTS user_sessions_staff_idx    ON public.user_sessions(staff_id);
CREATE INDEX        IF NOT EXISTS user_sessions_active_idx   ON public.user_sessions(staff_id, revoked_at, last_activity DESC);


-- ── 3. Row Level Security — a user may only see/manage their OWN sessions ─────

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Read your own sessions.
DROP POLICY IF EXISTS user_sessions_self_select ON public.user_sessions;
CREATE POLICY user_sessions_self_select ON public.user_sessions
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Update your own sessions (touch last_activity / revoke).
DROP POLICY IF EXISTS user_sessions_self_update ON public.user_sessions;
CREATE POLICY user_sessions_self_update ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Insert a session row for yourself.
DROP POLICY IF EXISTS user_sessions_self_insert ON public.user_sessions;
CREATE POLICY user_sessions_self_insert ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());


-- ── 4. Housekeeping helper: drop stale (idle > 30 days) session rows ─────────
-- Optional; keeps the table tidy. Safe to run manually or via a scheduled job.
CREATE OR REPLACE FUNCTION public.prune_stale_sessions()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.user_sessions
  WHERE last_activity < now() - interval '30 days'
     OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days');
$$;
