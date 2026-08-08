-- ──────────────────────────────────────────────────────────────────────────
-- RepairOX — Demo Visit Tracking
--
-- Tracks unique device visits to demo accounts.
-- Run this in your Supabase SQL editor.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS demo_visits (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id     text NOT NULL UNIQUE,
  user_agent    text,
  screen_size   text,
  first_visit   timestamptz DEFAULT now(),
  last_visit    timestamptz DEFAULT now(),
  visit_count   integer DEFAULT 1
);

-- Allow authenticated users to insert/update (for the demo login to record visits)
ALTER TABLE demo_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_visits_insert"
  ON demo_visits
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "demo_visits_update"
  ON demo_visits
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "demo_visits_read"
  ON demo_visits
  FOR SELECT
  TO authenticated
  USING (true);
