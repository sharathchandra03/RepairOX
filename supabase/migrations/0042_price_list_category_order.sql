-- RepairOX — Price List category display order
--
-- Adds an administrator-controlled display order to the Device Catalog
-- categories (Settings → Price List → Categories). This is the ONE ordering
-- layer that admins control manually; brands and models always sort A–Z.
--
-- The order is organization-scoped (the Price List master configuration is the
-- single source of truth, shared by Settings → Device Catalog and
-- Shop → Price List) and persisted so it survives refresh, logout/login,
-- different browsers, devices and users within the same organization.
--
-- Run this in Supabase SQL Editor (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Add the ordering column ──────────────────────────────────────────────

ALTER TABLE public.price_list_categories
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- ─── 2. Backfill existing rows ───────────────────────────────────────────────
-- Seed the initial order from the current creation order so nothing jumps on
-- first load. Per organization, number rows 0..n by (created_at, id).

WITH ordered AS (
  SELECT
    id,
    organization_id,
    row_number() OVER (
      PARTITION BY organization_id
      ORDER BY created_at ASC, id ASC
    ) - 1 AS rn
  FROM public.price_list_categories
)
UPDATE public.price_list_categories c
SET sort_order = ordered.rn
FROM ordered
WHERE c.id = ordered.id
  AND c.organization_id = ordered.organization_id;

-- ─── 3. Helpful index for ordered reads ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS price_list_categories_order_idx
  ON public.price_list_categories (organization_id, sort_order);

-- RLS is unchanged: the new column inherits the existing per-org row policies
-- for price_list_categories (see 0022_consolidate_price_list_rls.sql). No new
-- policy is required — reorder is an UPDATE of sort_order, already governed by
-- the existing update policy.
