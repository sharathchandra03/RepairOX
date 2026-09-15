-- ============================================================================
-- 0026 — Per-store dashboard preferences + monthly target.
--
-- REQUIREMENT: the dashboard layout/order and the monthly revenue target must
-- be independent for each store (a user's Store A layout differs from Store B).
-- Today dashboard_preferences is keyed only by (auth_user_id, section), so
-- switching stores shows the same layout everywhere, and the monthly target was
-- never persisted server-side at all.
--
-- This migration:
--   • adds store_id (branch) to dashboard_preferences so preferences are
--     per-user PER-STORE. store_id IS NULL means the consolidated "All Shops"
--     bucket (owner view) — a valid, distinct bucket.
--   • widens the uniqueness key to (auth_user_id, section, store_id) using a
--     unique INDEX with COALESCE so NULL (All Shops) is treated as one bucket.
--   • adds monthly_target (numeric) so the dashboard revenue target persists in
--     the DB per user per store (fixes the drop in /api/dashboard-preferences).
--
-- Additive and backfill-safe: existing rows get store_id NULL (their previous
-- behaviour = the All-Shops / default bucket).
-- ============================================================================

alter table public.dashboard_preferences
  add column if not exists store_id      uuid references public.branches(id) on delete cascade;
alter table public.dashboard_preferences
  add column if not exists monthly_target numeric;

-- The old unique constraint/index was on (auth_user_id, section). Replace the
-- uniqueness with a store-aware one. We keep the old constraint if present but
-- rely on the new index for conflict resolution.
do $$
begin
  -- Drop a legacy UNIQUE CONSTRAINT on (auth_user_id, section) if it exists,
  -- so it doesn't reject legitimate per-store duplicates of the same section.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_preferences'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(auth_user_id, section)%'
  ) then
    execute (
      select 'alter table public.dashboard_preferences drop constraint ' || quote_ident(conname)
      from pg_constraint
      where conrelid = 'public.dashboard_preferences'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) ilike '%(auth_user_id, section)%'
      limit 1
    );
  end if;
end $$;

-- Store-aware uniqueness: one row per (user, section, store). COALESCE folds the
-- All-Shops NULL bucket into a single deterministic key so upserts work.
create unique index if not exists dashboard_preferences_user_section_store_uniq
  on public.dashboard_preferences (
    auth_user_id,
    section,
    (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

create index if not exists dashboard_preferences_store_idx
  on public.dashboard_preferences(store_id);

-- ============================================================================
-- Done. The API route upserts on the store-aware key and persists monthly_target.
-- ============================================================================
