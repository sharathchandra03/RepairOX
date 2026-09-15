-- ============================================================================
-- MIGRATION: Assigned By / Assigned To master-list tables
--   Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--   Creates the two missing tables so Settings → Tickets → "Assigned By &
--   Assigned To" entries persist in the database (they were vanishing on reload
--   because these tables did not exist).
--   Safe to re-run: everything uses IF NOT EXISTS / drop-if-exists.
-- ============================================================================

-- 1. Tables (same shape as public.brands so they fit the existing RLS model)
create table if not exists public.assigned_by_options (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  name            text not null,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.assigned_to_options (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  name            text not null,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- 2. Row-Level Security
alter table public.assigned_by_options enable row level security;
alter table public.assigned_to_options enable row level security;

-- 3. Policies (mirror the ticket module: org-scoped, branch-visible, permissioned)
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('assigned_by_options'),
      ('assigned_to_options')
    ) as x(tbl)
  loop
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_sel', r.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(array['manage_repair_jobs','update_repair_status','view_only','assign_technicians','manage_settings']::text[])
      );$f$, r.tbl || '_sel', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_ins', r.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(array['manage_repair_jobs','assign_technicians','manage_settings']::text[])
      );$f$, r.tbl || '_ins', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_upd', r.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(array['manage_repair_jobs','assign_technicians','manage_settings']::text[])
      )
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(array['manage_repair_jobs','assign_technicians','manage_settings']::text[])
      );$f$, r.tbl || '_upd', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_del', r.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(array['manage_repair_jobs','assign_technicians','manage_settings']::text[])
      );$f$, r.tbl || '_del', r.tbl);
  end loop;
end $$;

-- 4. Grants + realtime
grant select, insert, update, delete on public.assigned_by_options to authenticated;
grant select, insert, update, delete on public.assigned_to_options to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.assigned_by_options;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.assigned_to_options;
  exception when duplicate_object then null; end;
end $$;

-- 5. (Optional) audit trigger, matching other business tables
do $$
begin
  if exists (select 1 from pg_proc where proname = 'fn_audit') then
    drop trigger if exists assigned_by_options_audit on public.assigned_by_options;
    create trigger assigned_by_options_audit after insert or update or delete
      on public.assigned_by_options for each row execute function public.fn_audit();
    drop trigger if exists assigned_to_options_audit on public.assigned_to_options;
    create trigger assigned_to_options_audit after insert or update or delete
      on public.assigned_to_options for each row execute function public.fn_audit();
  end if;
end $$;
