-- ============================================================================
-- 0066 — Personal TABLE LAYOUT preferences (per-user, DB-backed, reusable).
--
-- A table's COLUMN ORDER and FROZEN-COLUMN selection are PERSONAL, per-user
-- presentation preferences (see the design-system "Personal Table Layout
-- Standard"). Until now they lived only in the browser's localStorage, so a
-- user's layout did not follow them to another browser/device and was lost if
-- they cleared browser data.
--
-- This migration promotes that storage to the database WITHOUT changing the
-- client preference shape: one row PER (user, table_key), each holding the
-- small JSON preference payload the hooks already produced:
--
--   • column_order     jsonb  → ordered list of stable column ids (movable)
--   • frozen_columns   jsonb  → optional user-frozen column ids (left block)
--   • visible_columns  jsonb  → reserved for a future show/hide preference
--
-- The row is self-scoped by auth_user_id so one account's layout can NEVER be
-- seen or changed by another account (UI = RLS). This is a PERSONAL resource:
-- no new permission key, no store scope — it mirrors the per-user table + RLS
-- pattern of lead_kanban_boards (0062) and dashboard_preferences (0026).
--
-- `table_key` makes the SAME engine reusable for every grid: lead_table,
-- ticket_table, invoice_table, walkin_table, field_table, customer_table, …
--
-- Additive + idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_table_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The auth.users id of the owner. The ONE scoping key for this table.
  auth_user_id    uuid NOT NULL,
  -- Which table these preferences belong to (e.g. "lead_table"). Stable id,
  -- never a display label.
  table_key       text NOT NULL,
  -- Optional org tag for housekeeping / future org-level cleanup. NOT used for
  -- visibility — a layout preference is strictly personal (auth_user_id only).
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Ordered list of stable, movable column ids. Opaque to the DB; the client
  -- owns the shape and reconciles it against the current canonical columns.
  column_order    jsonb,
  -- Optional user-selected frozen columns (left block). Mandatory anchors are
  -- implicit and never stored here.
  frozen_columns  jsonb,
  -- Reserved for a future per-user show/hide-columns preference.
  visible_columns jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Exactly one preferences row per (user, table). The API upserts on this key.
CREATE UNIQUE INDEX IF NOT EXISTS user_table_preferences_user_table_uniq
  ON public.user_table_preferences(auth_user_id, table_key);

-- ── Row Level Security — a user may only see/manage their OWN rows ───────────
ALTER TABLE public.user_table_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_table_prefs_self_select ON public.user_table_preferences;
CREATE POLICY user_table_prefs_self_select ON public.user_table_preferences
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS user_table_prefs_self_insert ON public.user_table_preferences;
CREATE POLICY user_table_prefs_self_insert ON public.user_table_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS user_table_prefs_self_update ON public.user_table_preferences;
CREATE POLICY user_table_prefs_self_update ON public.user_table_preferences
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS user_table_prefs_self_delete ON public.user_table_preferences;
CREATE POLICY user_table_prefs_self_delete ON public.user_table_preferences
  FOR DELETE TO authenticated
  USING (auth_user_id = auth.uid());
