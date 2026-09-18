-- ============================================================================
-- 0030 — Multi-store access as a first-class capability
--
-- RepairOX policy: multi-store access is OFF by default for every role except
-- Master Shop Owner and Platform Owner. The header "All Shops" selector, the
-- consolidated All-Shops view, and cross-store DATA visibility must ALL be
-- gated by the SAME capability so the UI, the server and the database agree
-- (UI = backend = DB).
--
-- Before this migration, cross-branch DATA visibility keyed off
-- `manage_branches` (store administration). That let store admins read every
-- store's data even without multi-store access. This migration:
--   1. Re-defines auth_can_cross_branch() to require `multi_store_access`
--      (full_access / '*' are still honoured inside auth_has_any).
--   2. Grants `multi_store_access` to the two default owner roles so existing
--      installs keep working without a full reseed. NO other role receives it.
--
-- Idempotent and safe to run on an existing database.
-- ============================================================================

-- 1) Cross-store visibility = multi-store capability (not store admin).
create or replace function public.auth_can_cross_branch()
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_has_any(array['multi_store_access']);
$$;

-- 2) Backfill the capability onto the default owner roles only.
--    (platform_owner is typically seeded with '*' which already implies every
--     permission; adding the explicit key is harmless and keeps intent clear.)
insert into public.role_permissions (role_id, permission_key)
select r.id, 'multi_store_access'
from public.roles r
where r.id in ('master_shop_owner', 'platform_owner')
on conflict (role_id, permission_key) do nothing;

-- NOTE: cross-store visibility is intentionally NOT granted to any other
-- built-in or custom role here. Grant `multi_store_access` explicitly via
-- Settings → Roles & Permissions to enable it for additional roles.

-- 3) Publish roles + role_permissions on realtime so a permission change made
--    by an admin streams to every OTHER signed-in session, which re-reads its
--    effective permissions with no manual reload. (The client also revalidates
--    on tab focus as a guaranteed fallback if realtime is unavailable.)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  begin execute 'alter table public.roles replica identity full'; exception when others then null; end;
  begin execute 'alter table public.role_permissions replica identity full'; exception when others then null; end;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='roles') then
    execute 'alter publication supabase_realtime add table public.roles';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='role_permissions') then
    execute 'alter publication supabase_realtime add table public.role_permissions';
  end if;
end $$;
