-- ═══════════════════════════════════════════════════════════════════════════
-- RepairOX — Category → Brand → Model hierarchy
--
-- Extends the existing `brands` / `device_models` master tables so each Brand
-- can belong to a Device Category (Settings → Device Categories) and both
-- Brands and Models can be soft-disabled/archived instead of hard-deleted.
--
-- This is a purely ADDITIVE migration:
--   • Adds nullable `category_id` to `brands` (links a brand to a device
--     category id such as "iphone", "android"). NULL = legacy/global brand that
--     shows under every category, so existing data keeps working untouched.
--   • Adds `archived boolean` to `brands` and `device_models` for soft-disable.
--
-- No existing column is dropped or altered, so current Tickets, Invoices and
-- Devices are unaffected. Safe to re-run.
--
-- Run this in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Brands: link to a device category + archive flag ─────────────────────

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS category_id text,
  ADD COLUMN IF NOT EXISTS archived    boolean NOT NULL DEFAULT false;

-- Index brands by (org, category) so per-category brand lookups stay fast.
CREATE INDEX IF NOT EXISTS brands_org_category_idx
  ON public.brands(organization_id, category_id);

-- ─── 2. Device models: category link + archive flag ──────────────────────────

ALTER TABLE public.device_models
  ADD COLUMN IF NOT EXISTS category_id text,
  ADD COLUMN IF NOT EXISTS archived    boolean NOT NULL DEFAULT false;

-- Index models by (org, category, brand) for fast strict category-scoped lookups.
CREATE INDEX IF NOT EXISTS device_models_org_cat_brand_idx
  ON public.device_models(organization_id, category_id, brand_id);

-- STRICT ISOLATION NOTE
-- Each brand belongs to exactly ONE category (brands.category_id) and each
-- model carries the SAME category as its brand (device_models.category_id).
-- The same brand NAME may exist as separate rows under different categories.
-- Legacy category-less rows are split into per-category copies by the app's
-- one-time migration on load (originals archived, never deleted).

-- NOTE: `category_id` intentionally references the device category id (text),
-- NOT a hard FK, because `device_categories` uses a composite primary key
-- (organization_id, id) and categories may be renamed/removed while historical
-- brands keep their value. The application resolves categories by id/label and
-- degrades gracefully for unknown values.
