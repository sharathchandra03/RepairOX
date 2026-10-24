-- ############################################################################
-- 0081 — Explicit store grants CONSTRAIN scope, even with multi_store_access
-- ############################################################################
--
-- THE BUG this fixes
-- ──────────────────
-- An admin gives a user "full access" (which, for the owner roles, bundles
-- `multi_store_access`) AND limits them to a few specific stores via the
-- per-user Store Access checklist (`user_stores` rows). The user STILL saw
-- EVERY store in the org, because `auth_store_ids()` / `auth_branch_visible()`
-- treated `multi_store_access` (cross-branch) as "see every store in the org"
-- and NEVER consulted the user's explicit `user_stores` grants.
--
-- THE RULE after this migration
-- ──────────────────────────────
-- `multi_store_access` means "can operate ACROSS THE STORES THE USER IS
-- ASSIGNED", not "across every store in the org". Scope is resolved as:
--
--   • TRUE org owners (is_admin(): master_shop_owner / platform_owner /
--     developer_admin)            → every store in the org (unchanged).
--   • A user WITH explicit user_stores grants
--                                 → home branch + those grants ONLY,
--                                   EVEN IF they hold multi_store_access.
--   • A user with NO explicit grants (and not an owner)
--                                 → home branch + (if multi_store_access)
--                                   every store in the org. This preserves the
--                                   existing "no checklist set = all stores"
--                                   behaviour so nobody is suddenly locked out.
--
-- This keeps "full access to their given stores, but ONLY those stores" working
-- at the DATABASE layer. The client (store-context.tsx) + consolidated server
-- route (/api/owner/summary) are updated to the same rule so UI = server = RLS.
--
-- Idempotent: pure `create or replace` of existing helpers. No data changes.
-- ############################################################################

-- Does the CALLER have any active explicit store grant? (home branch is NOT a
-- user_stores row — this is specifically about the per-user checklist.)
create or replace function public.auth_has_store_grants()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_stores us
    where us.staff_id = public.auth_staff_id()
      and us.status = 'active'
  );
$$;
grant execute on function public.auth_has_store_grants() to authenticated;

-- ── auth_store_ids(): the caller's accessible branch ids ────────────────────
-- Owners (is_admin) → all org branches. A user WITH explicit grants → home
-- branch + those grants (even if multi_store_access). Otherwise, if the user
-- can cross branches → all org branches (the "no checklist = all" fallback);
-- else just their home branch.
create or replace function public.auth_store_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select case
    -- True org owners always see every store (they manage the whole org).
    when public.is_admin() then
      (select coalesce(array_agg(b.id), '{}') from public.branches b
        where b.organization_id = public.auth_org_id())
    -- Explicit per-user grants CONSTRAIN scope — even for a multi_store_access
    -- user. This is what makes "full access, but only these stores" work.
    when public.auth_has_store_grants() then
      (
        select coalesce(array_agg(distinct x), '{}')
        from (
          select public.auth_branch_id() as x
          union
          select us.branch_id
          from public.user_stores us
          where us.staff_id = public.auth_staff_id()
            and us.status = 'active'
        ) s
        where x is not null
      )
    -- No explicit grants: a cross-branch user still sees the whole org (the
    -- prior default — preserves "no checklist set = all stores"); everyone
    -- else is limited to their single home branch.
    when public.auth_can_cross_branch() then
      (select coalesce(array_agg(b.id), '{}') from public.branches b
        where b.organization_id = public.auth_org_id())
    else
      (
        select coalesce(array_agg(distinct x), '{}')
        from (select public.auth_branch_id() as x) s
        where x is not null
      )
  end;
$$;
grant execute on function public.auth_store_ids() to authenticated;

-- ── auth_branch_visible(b): is branch `b` visible to the caller? ────────────
-- Previously the bare `auth_can_cross_branch()` disjunct made EVERY branch
-- visible to any multi_store_access user, leaking rows past their grant set.
-- Now visibility is: true owners (all), org-wide master data (branch null),
-- or a branch in the caller's resolved accessible set (auth_store_ids, which
-- now already honours explicit grants). A multi_store_access user WITH grants
-- is therefore confined to those grants; one WITHOUT grants still sees all org
-- branches because auth_store_ids returns them.
create or replace function public.auth_branch_visible(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or b is null                           -- org-wide shared master data
      or b = public.auth_branch_id()          -- own home store
      or b = any(public.auth_store_ids());    -- resolved accessible stores
$$;
grant execute on function public.auth_branch_visible(uuid) to authenticated;

-- ── staff_store_ids(p_staff_id): arbitrary-staff mirror of auth_store_ids ────
-- Kept consistent so lead-agent eligibility + the Sales Agent directory scope
-- a staff member exactly as the caller-scoped helper does: owners → all;
-- explicit grants constrain even multi_store_access; no grants + multi_store →
-- all; else home branch only.
create or replace function public.staff_store_ids(p_staff_id uuid)
returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v uuid[];
  has_grants boolean;
  is_owner boolean;
  can_cross boolean;
begin
  select id, organization_id, branch_id, role_id into s
  from public.staff where id = p_staff_id;
  if not found then
    return '{}'::uuid[];
  end if;

  is_owner := s.role_id in ('master_shop_owner', 'platform_owner', 'developer_admin');

  select exists (
    select 1 from public.user_stores us
    where us.staff_id = s.id and us.status = 'active'
  ) into has_grants;

  select exists (
    select 1 from public.role_permissions rp
    where rp.role_id = s.role_id and rp.permission_key in ('*', 'multi_store_access')
  ) into can_cross;

  -- Owners, or (no explicit grants AND cross-branch) → every store in the org.
  if is_owner or (can_cross and not has_grants) then
    select coalesce(array_agg(b.id), '{}'::uuid[]) into v
    from public.branches b where b.organization_id = s.organization_id;
    return v;
  end if;

  -- Explicit grants constrain scope (even with multi_store_access); otherwise
  -- just the home branch.
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v
  from (
    select s.branch_id as x
    union all
    select us.branch_id from public.user_stores us
    where us.staff_id = s.id and us.status = 'active'
  ) t
  where x is not null;
  return v;
end;
$$;
grant execute on function public.staff_store_ids(uuid) to authenticated;
