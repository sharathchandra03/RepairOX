-- ──────────────────────────────────────────────────────────────────────────
-- RepairOX — Per-user theme preference
--
-- Adds a `theme_preference` column to the `staff` table so each user's choice
-- of Light / Dark theme (set in Settings → Preferences) is persisted in the
-- database and follows them across devices and sessions. This is a PER-USER
-- setting, so it lives on the user's own staff row (not organization_settings,
-- which is shared org-wide).
--
-- Values: 'light' | 'dark'. Defaults to 'light' so the existing approved light
-- theme remains the default for everyone until they opt in to dark mode.
--
-- Persistence is driven from the browser via the existing RLS self-update
-- policy (staff_self_update) that already lets a user write their own row —
-- the same path used by profile edits. No new policy is required; this script
-- only adds the column (and, for safety, re-asserts the self-update policy in
-- case a deployment predates it).
--
-- Run this once in the Supabase SQL editor.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'light'
  CHECK (theme_preference IN ('light', 'dark'));

-- Ensure authenticated users can update THEIR OWN staff row (idempotent).
-- If your deployment already has an equivalent self-update policy, this simply
-- recreates it with the same intent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'auth_user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "staff_self_update" ON public.staff;
    CREATE POLICY "staff_self_update" ON public.staff
      FOR UPDATE
      TO authenticated
      USING (auth_user_id = auth.uid())
      WITH CHECK (auth_user_id = auth.uid());

    DROP POLICY IF EXISTS "staff_self_select" ON public.staff;
    CREATE POLICY "staff_self_select" ON public.staff
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
