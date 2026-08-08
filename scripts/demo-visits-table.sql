-- ──────────────────────────────────────────────────────────────────────────
-- RepairOX — Demo Visit Tracking (Enhanced)
--
-- Tracks unique device visits to demo accounts with full device info
-- and IP-based geolocation.
-- Run this in your Supabase SQL editor.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS demo_visits (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id     text NOT NULL UNIQUE,
  user_agent    text,
  screen_size   text,
  timezone      text,
  language      text,
  browser       text,
  platform      text,
  city          text,
  country       text,
  ip_address    text,
  first_visit   timestamptz DEFAULT now(),
  last_visit    timestamptz DEFAULT now(),
  visit_count   integer DEFAULT 1
);

-- RLS
ALTER TABLE demo_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_visits_insert"
  ON demo_visits FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "demo_visits_update"
  ON demo_visits FOR UPDATE TO authenticated USING (true);

CREATE POLICY "demo_visits_read"
  ON demo_visits FOR SELECT TO authenticated USING (true);

-- Function to increment visit count on returning devices
CREATE OR REPLACE FUNCTION increment_demo_visit(p_device_id text)
RETURNS void AS $$
BEGIN
  UPDATE demo_visits
  SET visit_count = visit_count + 1,
      last_visit = now()
  WHERE device_id = p_device_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
