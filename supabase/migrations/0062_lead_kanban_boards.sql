-- ============================================================================
-- 0062 — Lead Kanban: per-user PERSONAL board storage (DB-backed).
--
-- The Lead Kanban (boards → columns → ordered card placements + personal
-- note colors) is a PERSONAL, per-user visualization layer over the canonical
-- leads. Until now it lived only in the browser's localStorage, so a user's
-- card placements were lost on refresh in another browser/device and could be
-- clobbered by a first-load reconcile race.
--
-- This migration promotes that storage to the database WITHOUT changing the
-- client state shape: the whole KanbanState (the same object the hook already
-- serialized to localStorage) is stored as a single JSONB blob, one row per
-- user. The row is self-scoped by auth_user_id so one account's board config
-- can NEVER be seen or changed by another account (UI = RLS).
--
-- This is a PERSONAL resource: no new permission key, no store scope. It
-- mirrors the per-user table + RLS pattern of user_sessions (0009) and the
-- dual-mode persistence of dashboard_preferences (0026).
--
-- Additive + idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_kanban_boards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The auth.users id of the owner. The ONE scoping key for this table.
  auth_user_id    uuid NOT NULL,
  -- Optional org tag for housekeeping / future org-level cleanup. NOT used for
  -- visibility — a Kanban board is strictly personal (auth_user_id only).
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The entire personal KanbanState: { boards:[...], activeBoardId }. Opaque to
  -- the DB; the client owns the shape. Defaults to an empty object (the hook
  -- then seeds a default board on first use).
  state           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One Kanban state row per user. The API upserts on this key.
CREATE UNIQUE INDEX IF NOT EXISTS lead_kanban_boards_user_uniq
  ON public.lead_kanban_boards(auth_user_id);

-- ── Row Level Security — a user may only see/manage their OWN Kanban row ─────
ALTER TABLE public.lead_kanban_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_kanban_self_select ON public.lead_kanban_boards;
CREATE POLICY lead_kanban_self_select ON public.lead_kanban_boards
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS lead_kanban_self_insert ON public.lead_kanban_boards;
CREATE POLICY lead_kanban_self_insert ON public.lead_kanban_boards
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS lead_kanban_self_update ON public.lead_kanban_boards;
CREATE POLICY lead_kanban_self_update ON public.lead_kanban_boards
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS lead_kanban_self_delete ON public.lead_kanban_boards;
CREATE POLICY lead_kanban_self_delete ON public.lead_kanban_boards
  FOR DELETE TO authenticated
  USING (auth_user_id = auth.uid());

-- ============================================================================
-- Done. The /api/lead-kanban route (service-role, scoped by auth.user.id)
-- reads/writes the single per-user state blob; the client useLeadKanban hook
-- loads it in Supabase mode and falls back to localStorage in local mode.
-- ============================================================================
