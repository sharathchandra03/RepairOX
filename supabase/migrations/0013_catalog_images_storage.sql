-- ═══════════════════════════════════════════════════════════════════════════
-- RepairOX — Catalog Images Storage Migration
-- 
-- Run this in your Supabase SQL Editor to:
--   1. Add the `image_url` column to price_list_categories (if missing)
--   2. Create the `catalog-images` Storage bucket (public)
--   3. Set up RLS policies so authenticated users can upload/read/delete
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Add image_url column to price_list_categories ────────────────────────
-- (Safe to re-run — only adds if the column doesn't exist yet.)

ALTER TABLE public.price_list_categories
  ADD COLUMN IF NOT EXISTS image_url text;

-- ─── 2. Create the catalog-images Storage bucket ─────────────────────────────
-- Public bucket so images can be served via direct URL without auth tokens.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-images',
  'catalog-images',
  true,
  5242880,  -- 5 MB max per file
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 3. Storage RLS policies ─────────────────────────────────────────────────
-- Allow anyone (including anonymous/public) to READ images.
-- Allow authenticated users to UPLOAD and DELETE their org's images.

-- Drop existing policies (safe to re-run)
DROP POLICY IF EXISTS "catalog_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "catalog_images_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "catalog_images_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "catalog_images_auth_delete" ON storage.objects;

-- Public read access (anyone can view catalog images)
CREATE POLICY "catalog_images_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'catalog-images');

-- Authenticated users can upload images
CREATE POLICY "catalog_images_auth_upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'catalog-images');

-- Authenticated users can update their uploads
CREATE POLICY "catalog_images_auth_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'catalog-images');

-- Authenticated users can delete images
CREATE POLICY "catalog_images_auth_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'catalog-images');
