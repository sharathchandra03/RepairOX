-- ############################################################################
-- 0039 — "Full access" means all ACTIONS, not all STORES
--
-- CONCEPT (the two independent axes of authorization):
--   • WHAT can the user do?   → permissions / `full_access` (all actions)
--   • WHERE can they do it?   → store scope / `multi_store_access` (all stores)
--
-- These MUST be independent. "Give this person full access to ONE store" =
-- full_access (every action) + single-store scope (multi_store_access OFF).
--
-- THE BUG THIS FIXES:
--   `auth_can_cross_branch()` calls `auth_has_any(['multi_store_access'])`, and
--   `auth_has_any` treats `full_access` (and '*') as satisfying ANY key. So a
--   role with `full_access` accidentally passed the multi_store_access check
--   and could see EVERY store. That conflates "all actions" with "all stores".
--
-- THE FIX:
--   1. Cross-branch visibility now requires the multi-store capability
--      SPECIFICALLY — `multi_store_access` or the platform wildcard `*`
--      (Platform Owner). `full_access` alone NO LONGER widens store scope.
--      Master Shop Owner keeps cross-store because it holds an EXPLICIT
--      `multi_store_access` grant (migration 0034), not because of full_access.
--   2. Because `full_access` no longer leaks cross-store data, it is now SAFE
--      to grant `full_access` to a non-owner role for a single store. So the
--      0036 wildcard guard is relaxed: `full_access` is allowed on any role
--      (it means "all actions in the stores you're scoped to"); only the true
--      platform god-key `*` remains owner-only.
--
-- Result: an admin can create a role "Store Full Access", give it full_access,
-- assign a user to exactly one store, leave multi_store_access OFF — and that
-- user has complete control of THEIR store and cannot see any other store
-- (enforced by auth_branch_visible → auth_store_ids at the RLS layer, plus the
-- header selector / All-Shops guards on the client).
--
-- Idempotent + safe to re-run.
-- ############################################################################

-- ── 1. A key check that does NOT expand wildcards (exact capability only) ────
-- Unlike auth_has_any (which honours full_access/'*'), this checks whether the
-- role literally holds a specific key, OR the platform wildcard '*'. It does
-- NOT treat `full_access` as a match. Used for the STORE-SCOPE axis so that
-- "all actions" never implies "all stores".
create or replace function public.auth_has_store_capability(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.staff s
    join public.role_permissions rp on rp.role_id = s.role_id
    where s.auth_user_id = auth.uid()
      and (rp.permission_key = '*'          -- platform wildcard (Platform Owner)
           or rp.permission_key = p_key)    -- the exact capability
  );
$$;
grant execute on function public.auth_has_store_capability(text) to authenticated;

-- ── 2. Cross-branch = multi-store capability SPECIFICALLY (not full_access) ──
create or replace function public.auth_can_cross_branch()
returns boolean language sql stable security definer set search_path = public as $$
  -- Cross-store data visibility requires the MULTI-STORE capability itself
  -- (or the platform wildcard '*'). `full_access` means "all actions" and does
  -- NOT, on its own, grant cross-store scope. `is_admin()` (true owners) still
  -- cross branches. This keeps WHAT and WHERE independent.
  select public.is_admin() or public.auth_has_store_capability('multi_store_access');
$$;
grant execute on function public.auth_can_cross_branch() to authenticated;

-- ── 3. Relax the wildcard guard: full_access is now store-safe ───────────────
-- Only the platform god-key '*' remains owner-only. `full_access` (all actions,
-- store-scoped) may be granted to any role.
create or replace function public.role_may_hold_wildcard(p_role_id text)
returns boolean language sql immutable set search_path = public as $$
  select p_role_id in ('master_shop_owner', 'platform_owner');
$$;

create or replace function public.enforce_wildcard_owner_only()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Only the platform wildcard '*' is restricted to owner roles now.
  -- `full_access` is a normal (store-scoped) action grant and is allowed
  -- on any role, because it no longer widens store visibility (0039).
  if NEW.permission_key = '*'
     and not public.role_may_hold_wildcard(NEW.role_id) then
    raise exception
      'The platform wildcard "*" may only be granted to owner roles. Use full_access (store-scoped) for full ACTION access on a single store.'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists role_permissions_wildcard_guard on public.role_permissions;
create trigger role_permissions_wildcard_guard
  before insert or update on public.role_permissions
  for each row execute function public.enforce_wildcard_owner_only();
