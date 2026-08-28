-- ═══════════════════════════════════════════════════════════════════════════
-- RepairOX — "Assigned By" & "Assigned To" master-list tables
--
-- These back the two dropdowns on the ticket wizard Device step. Entries the
-- user adds there ("+ Add new") are stored here so they can be reused on later
-- tickets. Without these tables the app's inserts fail silently and the values
-- disappear on reload.
--
-- Mirrors the shape / RLS pattern of public.brands. Uses the same auth helper
-- functions (auth_org_id, auth_staff_id, auth_member_of_org, auth_branch_visible,
-- auth_has_any) so organization_id / created_by auto-fill for the signed-in user.
--
-- Run this in the Supabase SQL Editor. Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tables ───────────────────────────────────────────────────────────────

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

create index if not exists assigned_by_options_org_idx on public.assigned_by_options(organization_id);
create index if not exists assigned_to_options_org_idx on public.assigned_to_options(organization_id);

-- ─── 2. Row Level Security ───────────────────────────────────────────────────

alter table public.assigned_by_options enable row level security;
alter table public.assigned_to_options enable row level security;

-- Generate select/insert/update/delete policies for both tables, matching the
-- permission keys used by brands/device_models.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('assigned_by_options', array['manage_repair_jobs','manage_sales','manage_inventory','view_only','manage_settings'], array['manage_repair_jobs','manage_sales','manage_inventory','manage_settings']),
      ('assigned_to_options', array['manage_repair_jobs','manage_sales','manage_inventory','view_only','manage_settings'], array['manage_repair_jobs','manage_sales','manage_inventory','manage_settings'])
    ) as x(tbl, read_keys, write_keys)
  loop
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_sel', r.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_sel', r.tbl, r.read_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_ins', r.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_ins', r.tbl, r.write_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_upd', r.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      )
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_upd', r.tbl, r.write_keys, r.write_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_del', r.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_del', r.tbl, r.write_keys);
  end loop;
end $$;

-- ─── 3. Realtime ─────────────────────────────────────────────────────────────

alter table public.assigned_by_options replica identity full;
alter table public.assigned_to_options replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assigned_by_options'
  ) then
    alter publication supabase_realtime add table public.assigned_by_options;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assigned_to_options'
  ) then
    alter publication supabase_realtime add table public.assigned_to_options;
  end if;
end $$;

-- ─── 4. Grants ───────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.assigned_by_options to authenticated;
grant select, insert, update, delete on public.assigned_to_options to authenticated;
