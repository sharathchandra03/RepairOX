-- ============================================================
-- RLS policies for price_list_* tables
-- Run this in Supabase SQL Editor (one-time setup).
--
-- These policies allow any authenticated user to read/write
-- rows belonging to their own organization. The organization_id
-- is matched via the staff table using auth.uid().
-- ============================================================

-- Helper: returns the organization_id for the current authenticated user.
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.staff
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- ─── price_list_categories ───────────────────────────────────────

ALTER TABLE public.price_list_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (safe to re-run)
DROP POLICY IF EXISTS "catalog_categories_select" ON public.price_list_categories;
DROP POLICY IF EXISTS "catalog_categories_insert" ON public.price_list_categories;
DROP POLICY IF EXISTS "catalog_categories_update" ON public.price_list_categories;
DROP POLICY IF EXISTS "catalog_categories_delete" ON public.price_list_categories;

CREATE POLICY "catalog_categories_select" ON public.price_list_categories
  FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_categories_insert" ON public.price_list_categories
  FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_categories_update" ON public.price_list_categories
  FOR UPDATE USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_categories_delete" ON public.price_list_categories
  FOR DELETE USING (organization_id = public.get_user_org_id());

-- ─── price_list_brands ───────────────────────────────────────────

ALTER TABLE public.price_list_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_brands_select" ON public.price_list_brands;
DROP POLICY IF EXISTS "catalog_brands_insert" ON public.price_list_brands;
DROP POLICY IF EXISTS "catalog_brands_update" ON public.price_list_brands;
DROP POLICY IF EXISTS "catalog_brands_delete" ON public.price_list_brands;

CREATE POLICY "catalog_brands_select" ON public.price_list_brands
  FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_brands_insert" ON public.price_list_brands
  FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_brands_update" ON public.price_list_brands
  FOR UPDATE USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_brands_delete" ON public.price_list_brands
  FOR DELETE USING (organization_id = public.get_user_org_id());

-- ─── price_list_models ───────────────────────────────────────────

ALTER TABLE public.price_list_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_models_select" ON public.price_list_models;
DROP POLICY IF EXISTS "catalog_models_insert" ON public.price_list_models;
DROP POLICY IF EXISTS "catalog_models_update" ON public.price_list_models;
DROP POLICY IF EXISTS "catalog_models_delete" ON public.price_list_models;

CREATE POLICY "catalog_models_select" ON public.price_list_models
  FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_models_insert" ON public.price_list_models
  FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_models_update" ON public.price_list_models
  FOR UPDATE USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_models_delete" ON public.price_list_models
  FOR DELETE USING (organization_id = public.get_user_org_id());

-- ─── price_list_parts ────────────────────────────────────────────

ALTER TABLE public.price_list_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_parts_select" ON public.price_list_parts;
DROP POLICY IF EXISTS "catalog_parts_insert" ON public.price_list_parts;
DROP POLICY IF EXISTS "catalog_parts_update" ON public.price_list_parts;
DROP POLICY IF EXISTS "catalog_parts_delete" ON public.price_list_parts;

CREATE POLICY "catalog_parts_select" ON public.price_list_parts
  FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_parts_insert" ON public.price_list_parts
  FOR INSERT WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_parts_update" ON public.price_list_parts
  FOR UPDATE USING (organization_id = public.get_user_org_id());

CREATE POLICY "catalog_parts_delete" ON public.price_list_parts
  FOR DELETE USING (organization_id = public.get_user_org_id());
