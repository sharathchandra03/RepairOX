-- ═══════════════════════════════════════════════════════════════════════════
-- RepairOX — Device Categories table
--
-- These are the top-level device categories shown in ticket creation
-- (category wheel) and managed in Settings → Device Categories.
--
-- Run this in Supabase SQL Editor (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Create the table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.device_categories (
  id              text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label           text NOT NULL,
  image_url       text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS device_categories_org_idx ON public.device_categories(organization_id);

-- ─── 2. updated_at trigger ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS device_categories_touch ON public.device_categories;
CREATE TRIGGER device_categories_touch
  BEFORE UPDATE ON public.device_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── 3. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE public.device_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_categories_select" ON public.device_categories;
DROP POLICY IF EXISTS "device_categories_insert" ON public.device_categories;
DROP POLICY IF EXISTS "device_categories_update" ON public.device_categories;
DROP POLICY IF EXISTS "device_categories_delete" ON public.device_categories;

-- All authenticated org members can read their org's categories.
CREATE POLICY "device_categories_select" ON public.device_categories
  FOR SELECT TO authenticated
  USING (organization_id = public.auth_org_id());

-- All authenticated org members can insert (needed for seeding on first load).
CREATE POLICY "device_categories_insert" ON public.device_categories
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.auth_org_id());

-- All authenticated org members can update their org's categories.
CREATE POLICY "device_categories_update" ON public.device_categories
  FOR UPDATE TO authenticated
  USING (organization_id = public.auth_org_id())
  WITH CHECK (organization_id = public.auth_org_id());

-- All authenticated org members can delete their org's categories.
CREATE POLICY "device_categories_delete" ON public.device_categories
  FOR DELETE TO authenticated
  USING (organization_id = public.auth_org_id());

-- ─── 4. Realtime ─────────────────────────────────────────────────────────────

ALTER TABLE public.device_categories REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'device_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.device_categories;
  END IF;
END $$;

-- ─── 5. Grants ───────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_categories TO authenticated;
