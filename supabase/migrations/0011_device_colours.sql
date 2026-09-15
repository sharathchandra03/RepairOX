-- ═══════════════════════════════════════════════════════════════════════════
-- RepairOX — Device Colours table
--
-- These are the device colours offered in ticket creation (Job Details →
-- Device Colour) and managed in Settings → Device Colours. Each colour pairs
-- a stored `id`/value with a human-readable `label` and a `swatch` hex used to
-- render the coloured dot beside the name.
--
-- Run this in Supabase SQL Editor (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Create the table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.device_colours (
  id              text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label           text NOT NULL,
  swatch          text NOT NULL DEFAULT '#2B2B2E',
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS device_colours_org_idx ON public.device_colours(organization_id);

-- ─── 2. updated_at trigger ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS device_colours_touch ON public.device_colours;
CREATE TRIGGER device_colours_touch
  BEFORE UPDATE ON public.device_colours
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── 3. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE public.device_colours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_colours_select" ON public.device_colours;
DROP POLICY IF EXISTS "device_colours_insert" ON public.device_colours;
DROP POLICY IF EXISTS "device_colours_update" ON public.device_colours;
DROP POLICY IF EXISTS "device_colours_delete" ON public.device_colours;

-- All authenticated org members can read their org's colours.
CREATE POLICY "device_colours_select" ON public.device_colours
  FOR SELECT TO authenticated
  USING (organization_id = public.auth_org_id());

-- All authenticated org members can insert (needed for seeding on first load).
CREATE POLICY "device_colours_insert" ON public.device_colours
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.auth_org_id());

-- All authenticated org members can update their org's colours.
CREATE POLICY "device_colours_update" ON public.device_colours
  FOR UPDATE TO authenticated
  USING (organization_id = public.auth_org_id())
  WITH CHECK (organization_id = public.auth_org_id());

-- All authenticated org members can delete their org's colours.
CREATE POLICY "device_colours_delete" ON public.device_colours
  FOR DELETE TO authenticated
  USING (organization_id = public.auth_org_id());

-- ─── 4. Realtime ─────────────────────────────────────────────────────────────

ALTER TABLE public.device_colours REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'device_colours'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.device_colours;
  END IF;
END $$;

-- ─── 5. Grants ───────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_colours TO authenticated;
