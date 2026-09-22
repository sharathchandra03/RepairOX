-- ############################################################################
-- 0034 — RepairOX Authorization Standard
--
-- Locks in the single-source-of-truth authorization model:
--   1. Re-assert cross-branch visibility is gated on `multi_store_access`
--      (never `manage_branches`), so store administration does NOT widen data
--      visibility. This is defensive: if any older `create or replace` of
--      auth_can_cross_branch / auth_branch_visible were applied out of order,
--      this migration makes the correct definitions the FINAL ones.
--   2. Introduce the ADD USER capability (`add_user`) as a first-class,
--      permission-controlled key that is SEPARATE from `manage_roles`.
--   3. Backfill administrative defaults: Platform Owner / Master Shop Owner /
--      Developer-Admin receive `manage_roles` + `add_user` (+ multi-store for
--      the two owner roles). Every OTHER role — built-in or custom — is left
--      untouched (OFF by default). Legitimate existing custom grants are never
--      overwritten (INSERT ... ON CONFLICT DO NOTHING only ADDS).
--   4. Ensure roles / role_permissions / audit_log stream on realtime so an
--      admin's permission change propagates to other sessions live.
--
-- Idempotent + safe to re-run.
-- ############################################################################

-- ── 1. Cross-branch visibility = the MULTI-STORE capability (final word) ─────
create or replace function public.auth_can_cross_branch()
returns boolean language sql stable security definer set search_path = public as $$
  -- Cross-store data visibility is the MULTI-STORE capability, NOT store admin.
  -- `manage_branches` (store administration) must never, on its own, widen data
  -- visibility across stores. `full_access` / `*` are covered inside
  -- auth_has_any. This keeps UI = backend = DB.
  select public.auth_has_any(array['multi_store_access']);
$$;

-- Re-assert the multi-store-aware branch visibility (own branch + granted
-- stores + cross-branch), so the correct definition is the final one even if an
-- older base definition was replayed after 0020.
create or replace function public.auth_branch_visible(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_can_cross_branch()
      or b is null                          -- org-wide shared master data
      or b = public.auth_branch_id()        -- own home store
      or b = any(public.auth_store_ids());  -- explicitly granted stores
$$;

grant execute on function public.auth_can_cross_branch()   to authenticated;
grant execute on function public.auth_branch_visible(uuid) to authenticated;


-- ── 2 + 3. Administrative capability defaults ────────────────────────────────
-- Add User is a distinct capability. Grant the administrative defaults ONLY to
-- the three org/platform administration roles. Never auto-enable on any other
-- role. ON CONFLICT DO NOTHING guarantees we only ADD (never remove a custom
-- grant, never duplicate).
insert into public.role_permissions (role_id, permission_key)
select r.id, k.key
from public.roles r
cross join (values
  ('manage_roles'),
  ('add_user')
) as k(key)
where r.id in ('master_shop_owner', 'platform_owner', 'developer_admin')
on conflict (role_id, permission_key) do nothing;

-- The two OWNER roles also receive multi-store access + the consolidated
-- All-Shops view + store switching by default (platform_owner is typically '*'
-- which already implies everything — the explicit keys are harmless & clear).
insert into public.role_permissions (role_id, permission_key)
select r.id, k.key
from public.roles r
cross join (values
  ('multi_store_access'),
  ('stores_view_all'),
  ('stores_multi_select'),
  ('stores_switch'),
  ('stores_list_view')
) as k(key)
where r.id in ('master_shop_owner', 'platform_owner')
on conflict (role_id, permission_key) do nothing;

-- NOTE: We intentionally do NOT grant `add_user`, `manage_roles`,
-- `multi_store_access` or `stores_view_all` to any other built-in or custom
-- role here. New custom roles therefore default to OFF for all administrative
-- and multi-store capabilities, satisfying the "safe default" requirement.


-- ── 4. Realtime: publish the authorization tables so permission changes made
--    by an admin stream to every other signed-in session (which re-reads its
--    effective permissions with no manual reload). audit_log is added so the
--    activity feed can reflect permission changes live. ─────────────────────
do $$
declare
  t text;
  tables text[] := array['roles', 'role_permissions', 'audit_log', 'user_stores'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array tables loop
    begin execute format('alter table public.%I replica identity full;', t); exception when others then null; end;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      begin execute format('alter publication supabase_realtime add table public.%I;', t); exception when others then null; end;
    end if;
  end loop;
end $$;
