-- ============================================================================
-- 0022 — Consolidate price_list_* RLS and remove the duplicate org resolver.
--
-- PROBLEM (found in audit, confirmed live — price_list_* had 8 policies each):
--   scripts/rls-price-list.sql (now deprecated) created a SECOND set of
--   permissionless policies ("catalog_*_select/insert/update/delete") plus a
--   duplicate function public.get_user_org_id() that mirrors auth_org_id().
--   Combined with the permission-gated policies from 0001_initial_schema, this
--   left each price_list_* table with two competing/overlapping policy sets —
--   the permissionless one effectively widened access to any org member.
--
-- FIX: drop the permissionless "catalog_*" policies so ONLY the permission-
--   gated policies from the base schema remain, and drop the duplicate
--   get_user_org_id() function. auth_org_id() is the single org resolver.
--
-- Non-destructive: no data is touched; only redundant policies/functions removed.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'price_list_categories','price_list_brands','price_list_models','price_list_parts'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I;', 'catalog_' || replace(t, 'price_list_', '') || '_select', t);
    execute format('drop policy if exists %I on public.%I;', 'catalog_' || replace(t, 'price_list_', '') || '_insert', t);
    execute format('drop policy if exists %I on public.%I;', 'catalog_' || replace(t, 'price_list_', '') || '_update', t);
    execute format('drop policy if exists %I on public.%I;', 'catalog_' || replace(t, 'price_list_', '') || '_delete', t);
  end loop;
end $$;

-- Drop the duplicate org resolver only if nothing else depends on it.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'get_user_org_id') then
    begin
      drop function if exists public.get_user_org_id();
    exception when dependent_objects_still_exist then
      raise notice 'get_user_org_id() still has dependents; left in place. Re-run after removing dependents.';
    end;
  end if;
end $$;

-- ============================================================================
-- Done. price_list_* tables now have a single, permission-gated policy set.
-- ============================================================================
