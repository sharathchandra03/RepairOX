-- ============================================================================
-- 0021 — Fix field_jobs multi-tenant isolation (CRITICAL security fix).
--
-- PROBLEM (found in audit, confirmed live):
--   • field_jobs RLS was `auth.role() = 'authenticated'` for SELECT and ALL —
--     ANY signed-in user of ANY organization could read/write EVERY field job.
--   • organization_id / branch_id existed but had NO foreign keys, NO defaults,
--     and the app never stamped them — so rows were unscoped/orphanable.
--   • the updated_at trigger guarded on a non-existent function `set_updated_at`
--     (the real one is public.touch_updated_at), so it was never created.
--   • no audit trigger existed on field_jobs.
--
-- This migration brings field_jobs in line with every other business table:
-- org + branch scoping with defaults + FKs, permission-gated RLS, working
-- updated_at + audit triggers. It is additive and backfill-safe.
--
-- NOTE: existing rows with NULL organization_id are left as-is (they predate
-- scoping). The backfill migration 0024 assigns them to the default org/branch.
-- ============================================================================

-- 1) Defaults + foreign keys on the tenancy columns ---------------------------
alter table public.field_jobs
  alter column organization_id set default public.auth_org_id();
alter table public.field_jobs
  alter column branch_id set default public.auth_branch_id();

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'field_jobs'
      and constraint_name = 'field_jobs_org_fk'
  ) then
    alter table public.field_jobs
      add constraint field_jobs_org_fk
      foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'field_jobs'
      and constraint_name = 'field_jobs_branch_fk'
  ) then
    alter table public.field_jobs
      add constraint field_jobs_branch_fk
      foreign key (branch_id) references public.branches(id) on delete set null;
  end if;
end $$;

-- 2) Indexes for the real access patterns (store-scoped lists + status) -------
create index if not exists field_jobs_org_idx           on public.field_jobs(organization_id);
create index if not exists field_jobs_branch_id_idx      on public.field_jobs(branch_id);
create index if not exists field_jobs_branch_status_idx  on public.field_jobs(branch_id, status);
create index if not exists field_jobs_branch_created_idx on public.field_jobs(branch_id, created_at desc);

-- 3) Replace the wide-open RLS with org + branch + permission gating ----------
--    Read: any org member who can see the branch and has a field/repair key.
--    Write: manage_repair_jobs / manage_field (fall back to repair keys).
alter table public.field_jobs enable row level security;

drop policy if exists field_jobs_read  on public.field_jobs;
drop policy if exists field_jobs_write on public.field_jobs;
drop policy if exists field_jobs_sel   on public.field_jobs;
drop policy if exists field_jobs_ins   on public.field_jobs;
drop policy if exists field_jobs_upd   on public.field_jobs;
drop policy if exists field_jobs_del   on public.field_jobs;

create policy field_jobs_sel on public.field_jobs
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_repair_jobs','update_repair_status','manage_field','view_only','manage_sales'])
  );

create policy field_jobs_ins on public.field_jobs
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_repair_jobs','manage_field','manage_sales'])
  );

create policy field_jobs_upd on public.field_jobs
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_repair_jobs','update_repair_status','manage_field'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_repair_jobs','update_repair_status','manage_field'])
  );

create policy field_jobs_del on public.field_jobs
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_repair_jobs','manage_field'])
  );

-- 4) Working updated_at trigger (correct function name) -----------------------
drop trigger if exists field_jobs_touch on public.field_jobs;
create trigger field_jobs_touch before update on public.field_jobs
  for each row execute function public.touch_updated_at();

-- 5) Audit trigger (was missing) ----------------------------------------------
drop trigger if exists audit_field_jobs on public.field_jobs;
create trigger audit_field_jobs after insert or update or delete on public.field_jobs
  for each row execute function public.fn_audit('Field Job');

-- 6) Grants (RLS still enforces the boundary) ---------------------------------
grant select, insert, update, delete on public.field_jobs to authenticated;

-- ============================================================================
-- Done. field_jobs is now organization- and store-isolated like every other
-- business table, with working audit + updated_at triggers.
-- ============================================================================
