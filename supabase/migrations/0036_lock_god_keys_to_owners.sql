-- ############################################################################
-- 0036 — Lock "god keys" to owner roles (system-wide guarantee)
--
-- REQUIREMENT: EVERY role — existing and future, built-in or custom — must act
-- strictly according to the permissions given in the Permission Matrix. Nothing
-- may silently bypass the matrix.
--
-- The ONLY legitimate matrix-bypass is the wildcard authority `full_access` /
-- `*` (owners). The risk is that a custom or future role accidentally receives
-- one of these (e.g. an admin clicking a master "Full" switch, or a stray SQL
-- insert) and thereby gains god-mode that ignores every finer permission.
--
-- This migration makes that IMPOSSIBLE at the database level:
--   1. Strip `full_access` / `*` (and platform-level keys) from every role that
--      is NOT an owner role, so all existing roles act on their matrix grants.
--   2. Install a trigger on role_permissions that REJECTS any future insert of
--      `full_access` / `*` for a non-owner role. The matrix, the API and even
--      manual SQL all go through this table, so this is a single, unbypassable
--      chokepoint. Owners (master_shop_owner, platform_owner) are the sole
--      roles allowed to hold the wildcard.
--
-- Everything else (module-level keys, add_user, multi_store_access, manage_roles
-- etc.) remains freely grantable per role via the matrix — those are REAL,
-- individually-enforced capabilities, not blanket bypasses.
--
-- Idempotent + safe to re-run.
-- ############################################################################

-- ── The roles permitted to hold wildcard/full authority ─────────────────────
-- (Kept in a tiny immutable helper so the trigger and cleanup agree.)
create or replace function public.role_may_hold_wildcard(p_role_id text)
returns boolean language sql immutable set search_path = public as $$
  select p_role_id in ('master_shop_owner', 'platform_owner');
$$;

-- ── 1. Strip god / platform keys from every NON-owner role ───────────────────
delete from public.role_permissions rp
where not public.role_may_hold_wildcard(rp.role_id)
  and rp.permission_key in (
    'full_access', '*',
    'system_administrator', 'backup_restore', 'access_api', 'manage_subscription'
  );

-- ── 2. Trigger: block wildcard grants to non-owner roles, forever ────────────
create or replace function public.enforce_wildcard_owner_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.permission_key in ('full_access', '*')
     and not public.role_may_hold_wildcard(NEW.role_id) then
    raise exception
      'Permission "%" (full/wildcard access) may only be granted to owner roles. Grant specific matrix capabilities to role "%" instead.',
      NEW.permission_key, NEW.role_id
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists role_permissions_wildcard_guard on public.role_permissions;
create trigger role_permissions_wildcard_guard
  before insert or update on public.role_permissions
  for each row execute function public.enforce_wildcard_owner_only();

grant execute on function public.role_may_hold_wildcard(text) to authenticated;
