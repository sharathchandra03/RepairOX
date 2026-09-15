-- ============================================================================
-- 0024 — Backfill field_jobs tenancy for rows created before 0021.
--
-- field_jobs previously had no org/branch defaults, so historical rows may have
-- NULL organization_id / branch_id. Those rows would be invisible under the new
-- org-scoped RLS. This assigns them to the default organization (single-org
-- install) and resolves their branch from the free-text `branch` label when
-- possible, else the HQ / first branch.
--
-- SAFETY: only touches rows where organization_id IS NULL. Emits before/after
-- counts as NOTICE (per the audit's data-backfill checklist). If more than one
-- organization exists, it skips the org backfill and warns, because the correct
-- org can't be inferred automatically — resolve manually in that case.
-- ============================================================================

do $$
declare
  v_org_count   int;
  v_org         uuid;
  v_hq          uuid;
  v_null_before int;
  v_null_after  int;
begin
  select count(*) into v_org_count from public.organizations;
  select count(*) into v_null_before from public.field_jobs where organization_id is null;

  raise notice 'field_jobs rows with NULL organization_id before backfill: %', v_null_before;

  if v_null_before = 0 then
    raise notice 'Nothing to backfill.';
    return;
  end if;

  if v_org_count <> 1 then
    raise notice 'Found % organizations — cannot auto-assign org for orphan field_jobs. Skipping org backfill; resolve manually.', v_org_count;
    return;
  end if;

  select id into v_org from public.organizations limit 1;

  -- HQ branch (label contains "(HQ)") else the first branch in the org.
  select id into v_hq from public.branches
   where organization_id = v_org and name ilike '%(HQ)%'
   order by created_at limit 1;
  if v_hq is null then
    select id into v_hq from public.branches where organization_id = v_org order by created_at limit 1;
  end if;

  -- Assign org to all orphan rows.
  update public.field_jobs set organization_id = v_org where organization_id is null;

  -- Resolve branch from the free-text `branch` label; fall back to HQ.
  update public.field_jobs fj
     set branch_id = b.id
    from public.branches b
   where fj.branch_id is null
     and fj.branch is not null
     and b.organization_id = v_org
     and lower(b.name) = lower(fj.branch);

  update public.field_jobs
     set branch_id = v_hq
   where branch_id is null and v_hq is not null;

  select count(*) into v_null_after from public.field_jobs where organization_id is null;
  raise notice 'field_jobs rows with NULL organization_id after backfill: %', v_null_after;
end $$;

-- ============================================================================
-- Done.
-- ============================================================================
