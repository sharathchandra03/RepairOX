-- ============================================================================
-- 0029 — Store environment (Demo | Live).
--
-- RepairOX distinguishes TWO independent store concepts that must not be
-- collapsed into one field:
--
--   • branches.is_active  (ACTIVE | INACTIVE) — answers "can this store
--     operate?" (operational activation). Untouched by this migration.
--   • branches.environment (DEMO | LIVE)      — answers "what KIND of store /
--     environment is this?" A real business branch is LIVE (production). A
--     demonstration / training / test store is DEMO.
--
-- Both concepts are orthogonal, so all four combinations are valid:
--   Live+Active, Live+Inactive, Demo+Active, Demo+Inactive.
--
-- A newly created real branch should naturally be LIVE, so the column defaults
-- to 'live'. Existing branches are treated as Live (production) on backfill —
-- they predate the concept and are real operational stores.
--
-- Additive and backfill-safe. No column is dropped, no row is deleted. Safe to
-- run multiple times.
-- ============================================================================

alter table public.branches
  add column if not exists environment text not null default 'live';

-- Constrain to the two allowed values. Guarded so re-runs don't error if the
-- constraint already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'branches_environment_check'
  ) then
    alter table public.branches
      add constraint branches_environment_check
      check (environment in ('demo', 'live'));
  end if;
end $$;

-- Backfill any pre-existing rows (created before the column) to 'live'.
update public.branches set environment = 'live' where environment is null;

-- Helpful for filtering owner reports / selectors by environment.
create index if not exists branches_org_environment_idx
  on public.branches(organization_id, environment);

-- ============================================================================
-- Done.
-- ============================================================================
