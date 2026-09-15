-- ============================================================================
-- RepairOX — Multi-Store architecture migration (idempotent, backfill-safe).
--
-- The base schema (supabase/schema.sql) already scopes every business record to
-- an organization + branch and enforces isolation with RLS. This migration adds
-- the pieces required to turn "branches" into a real multi-STORE experience:
--
--   1. user_stores          — a user may be granted access to MANY stores
--                             (Owner → all, Manager → some, Employee → one),
--                             each with an optional per-store role override.
--   2. branch_settings      — per-store settings (printing, ticket/invoice
--                             numbering prefixes, terms) that override the
--                             organization defaults without leaking across
--                             stores.
--   3. auth_store_ids()     — the set of store ids the current user may access
--                             (their staff.branch_id + any user_stores grants;
--                             cross-branch roles see every store in the org).
--   4. auth_branch_visible() is UPGRADED to also honour user_stores grants, so
--      a manager assigned to two stores sees both — while NULL branch_id keeps
--      meaning "organization-wide shared master data" (brands, price lists…),
--      which every member may read. Transactional rows always carry a
--      concrete branch_id, so they remain strictly isolated per store.
--
-- Safe to run multiple times. Never deletes data, never changes primary keys.
-- Run in Supabase → SQL Editor, or via `node scripts/apply-multi-store.mjs`.
-- ============================================================================


-- ############################################################################
-- 1 — USER ↔ STORE ACCESS
--   userId ↔ storeId (+ optional role override + status). This is the source of
--   truth for "which stores can this user enter". A user with a cross-branch
--   role (manage_branches) implicitly sees all stores and does not need rows
--   here; rows here GRANT extra stores to otherwise single-store users.
-- ############################################################################

create table if not exists public.user_stores (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  branch_id       uuid not null references public.branches(id) on delete cascade,
  -- Optional per-store role override. NULL = use the staff row's global role.
  role_id         text references public.roles(id) on delete set null,
  is_default      boolean not null default false,
  status          text not null default 'active',   -- 'active' | 'inactive'
  created_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (staff_id, branch_id)
);

create index if not exists user_stores_staff_idx  on public.user_stores(staff_id);
create index if not exists user_stores_branch_idx on public.user_stores(branch_id);
create index if not exists user_stores_org_idx    on public.user_stores(organization_id);

drop trigger if exists user_stores_touch on public.user_stores;
create trigger user_stores_touch before update on public.user_stores
  for each row execute function public.touch_updated_at();


-- ############################################################################
-- 2 — PER-STORE SETTINGS
--   One optional row per branch. Anything NULL falls back to the org default in
--   organization_settings. Keeps store-specific printing / numbering / terms
--   isolated so Koramangala's ticket prefix never bleeds into Indiranagar's.
-- ############################################################################

create table if not exists public.branch_settings (
  branch_id            uuid primary key references public.branches(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,

  -- Store identity overrides (fall back to org + branch base fields when NULL)
  display_name         text,
  phone                text,
  email                text,
  address              text,
  city                 text,
  state                text,
  postal_code          text,
  timezone             text,
  currency             text,

  -- Store-aware numbering. Prefix is prepended to the org sequence so numbers
  -- never collide across stores, e.g. BLR-T-0001 vs IND-T-0001.
  ticket_prefix        text,
  invoice_prefix       text,
  walkin_prefix        text,
  field_prefix         text,

  -- Store-specific print / terms overrides
  ticket_terms         text,
  ticket_footer        text,
  invoice_terms        text,
  invoice_footer       text,
  print_slogan         text,

  -- Free-form extra preferences
  settings             jsonb not null default '{}'::jsonb,

  updated_by           uuid references public.staff(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Backfill for installs where branch_settings was created before these columns
-- existed (safe to re-run).
alter table public.branch_settings add column if not exists ticket_prefix  text;
alter table public.branch_settings add column if not exists invoice_prefix text;
alter table public.branch_settings add column if not exists walkin_prefix  text;
alter table public.branch_settings add column if not exists field_prefix   text;

create index if not exists branch_settings_org_idx on public.branch_settings(organization_id);

drop trigger if exists branch_settings_touch on public.branch_settings;
create trigger branch_settings_touch before update on public.branch_settings
  for each row execute function public.touch_updated_at();


-- ############################################################################
-- 3 — SESSION HELPERS
-- ############################################################################

-- The set of branch ids the current user may access:
--   • cross-branch roles (manage_branches / admin) → every branch in the org
--   • everyone else → their own staff.branch_id + any active user_stores grants
create or replace function public.auth_store_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select case
    when public.auth_can_cross_branch() or public.is_admin() then
      (select coalesce(array_agg(b.id), '{}') from public.branches b where b.organization_id = public.auth_org_id())
    else
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
  end;
$$;

-- Upgraded branch visibility: a row is visible when
--   • the caller can cross branches (owner / admin), OR
--   • the row is org-wide shared master data (branch_id IS NULL), OR
--   • the row's branch is one of the caller's accessible stores.
create or replace function public.auth_branch_visible(b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_can_cross_branch()
      or b is null
      or b = public.auth_branch_id()
      or b = any(public.auth_store_ids());
$$;

grant execute on function public.auth_store_ids()          to authenticated;
grant execute on function public.auth_branch_visible(uuid) to authenticated;


-- ############################################################################
-- 4 — RLS FOR NEW TABLES
-- ############################################################################

alter table public.user_stores     enable row level security;
alter table public.branch_settings enable row level security;

-- user_stores: a user may read their own grants; admins/branch managers read
-- all grants in their org; only admins/branch managers may write.
drop policy if exists user_stores_read on public.user_stores;
create policy user_stores_read on public.user_stores
  for select to authenticated
  using (
    staff_id = public.auth_staff_id()
    or (organization_id = public.auth_org_id()
        and (public.is_admin() or public.auth_has_any(array['manage_branches','manage_users'])))
  );

drop policy if exists user_stores_write on public.user_stores;
create policy user_stores_write on public.user_stores
  for all to authenticated
  using (
    organization_id = public.auth_org_id()
    and (public.is_admin() or public.auth_has_any(array['manage_branches','manage_users']))
  )
  with check (
    organization_id = public.auth_org_id()
    and (public.is_admin() or public.auth_has_any(array['manage_branches','manage_users']))
  );

-- branch_settings: any org member may read the store settings for a store they
-- can see; admins / branch managers / settings managers may write.
drop policy if exists branch_settings_read on public.branch_settings;
create policy branch_settings_read on public.branch_settings
  for select to authenticated
  using (organization_id = public.auth_org_id() and public.auth_branch_visible(branch_id));

drop policy if exists branch_settings_write on public.branch_settings;
create policy branch_settings_write on public.branch_settings
  for all to authenticated
  using (
    organization_id = public.auth_org_id()
    and (public.is_admin() or public.auth_has_any(array['manage_branches','manage_settings']))
  )
  with check (
    organization_id = public.auth_org_id()
    and (public.is_admin() or public.auth_has_any(array['manage_branches','manage_settings']))
  );


-- ############################################################################
-- 5 — REALTIME + GRANTS
-- ############################################################################

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  perform 1;
  begin execute 'alter table public.user_stores replica identity full'; exception when others then null; end;
  begin execute 'alter table public.branch_settings replica identity full'; exception when others then null; end;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_stores') then
    execute 'alter publication supabase_realtime add table public.user_stores';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='branch_settings') then
    execute 'alter publication supabase_realtime add table public.branch_settings';
  end if;
end $$;

grant select, insert, update, delete on public.user_stores     to authenticated;
grant select, insert, update, delete on public.branch_settings to authenticated;

-- Audit triggers for the new tables (reuse the generic fn_audit).
drop trigger if exists audit_user_stores on public.user_stores;
create trigger audit_user_stores after insert or update or delete on public.user_stores
  for each row execute function public.fn_audit('System');

drop trigger if exists audit_branch_settings on public.branch_settings;
create trigger audit_branch_settings after insert or update or delete on public.branch_settings
  for each row execute function public.fn_audit('Settings');


-- ############################################################################
-- 6 — FIELD JOBS: make it a first-class store-scoped business document
--   The field_jobs table ships from supabase/field-management.sql. Here we make
--   it behave exactly like tickets/invoices/walk-ins:
--     • organization_id / branch_id default to the caller's store context, so
--       inserts are always stamped even if the client omits them,
--     • a UNIQUE(organization_id, branch_id, job_no) constraint guarantees the
--       human-readable Field Job number is unique WITHIN a store (the same
--       FJ-001 may exist in another store — different branch_id),
--     • RLS is tightened from "any authenticated user" to real org + branch
--       isolation (previously a cross-store/cross-org leak).
--   All guarded so this migration is a no-op if field_jobs isn't present yet.
-- ############################################################################

do $$
begin
  if to_regclass('public.field_jobs') is null then
    return; -- field_jobs not created yet; nothing to harden
  end if;

  -- Default org/branch to the caller's context (mirrors the core tables).
  begin
    execute 'alter table public.field_jobs
             alter column organization_id set default public.auth_org_id()';
  exception when others then null; end;
  begin
    execute 'alter table public.field_jobs
             alter column branch_id set default public.auth_branch_id()';
  exception when others then null; end;

  -- Helpful indexes for per-store scoping + lookups.
  execute 'create index if not exists field_jobs_org_idx on public.field_jobs(organization_id)';
  execute 'create index if not exists field_jobs_org_branch_idx on public.field_jobs(organization_id, branch_id)';
  execute 'create index if not exists field_jobs_job_no_idx on public.field_jobs(organization_id, branch_id, job_no)';

  -- Uniqueness of the human-readable number within a store. Uses a partial
  -- unique index so multiple NULL job_no rows (if any legacy) don't collide,
  -- and cancelled/soft-deleted numbers are never reused (they keep the number).
  execute 'create unique index if not exists field_jobs_no_unique
           on public.field_jobs(organization_id, branch_id, job_no)
           where job_no is not null';

  -- Tighten RLS: replace the permissive authenticated-only policies with real
  -- org + branch scoping consistent with the rest of the platform. Drop BOTH
  -- the legacy names and our own names so this block is fully idempotent.
  execute 'drop policy if exists field_jobs_read on public.field_jobs';
  execute 'drop policy if exists field_jobs_write on public.field_jobs';
  execute 'drop policy if exists field_jobs_sel on public.field_jobs';
  execute 'drop policy if exists field_jobs_ins on public.field_jobs';
  execute 'drop policy if exists field_jobs_upd on public.field_jobs';
  execute 'drop policy if exists field_jobs_del on public.field_jobs';

  execute $p$
    create policy field_jobs_sel on public.field_jobs
      for select to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
      );
  $p$;
  execute $p$
    create policy field_jobs_ins on public.field_jobs
      for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
      );
  $p$;
  execute $p$
    create policy field_jobs_upd on public.field_jobs
      for update to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
      )
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
      );
  $p$;
  execute $p$
    create policy field_jobs_del on public.field_jobs
      for delete to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
      );
  $p$;
end $$;

-- ============================================================================
-- Done.
-- ============================================================================
