-- ──────────────────────────────────────────────────────────────────────────
-- RepairOX — Feature Visibility table
--
-- Stores per-role feature visibility overrides. Only non-default ("visible")
-- values are stored. When a row is absent, the feature defaults to visible.
--
-- Run this in your Supabase SQL editor or add to your migration.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_visibility (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id     text NOT NULL,
  feature_id  text NOT NULL,
  mode        text NOT NULL CHECK (mode IN ('coming_soon', 'hidden')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  -- Each role can only have one visibility mode per feature
  UNIQUE(role_id, feature_id)
);

-- Index for fast lookups when loading all visibility config
CREATE INDEX IF NOT EXISTS idx_feature_visibility_role
  ON feature_visibility(role_id);

-- RLS: Only admins (service role) can read/write this table
ALTER TABLE feature_visibility ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to READ (needed for sidebar filtering on login)
CREATE POLICY "feature_visibility_read"
  ON feature_visibility
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (admin API routes) can INSERT/UPDATE/DELETE
-- (handled by using the admin client in the API route, which bypasses RLS)
