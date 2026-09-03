-- ============================================================================
-- MIGRATION: Quality Check (QC) configuration table
--   Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--   Creates the `qc_config` table so Settings → Tickets → "Quality Check"
--   (the master QC checklist that drives the QC form during ticket creation)
--   persists in the database.
--   One JSON document row per organization.
--   Safe to re-run: everything uses IF NOT EXISTS / drop-if-exists.
-- ============================================================================

-- 1. Table (one row per org; the whole checklist lives in the `config` jsonb)
create table if not exists public.qc_config (
  organization_id uuid primary key default public.auth_org_id() references public.organizations(id) on delete cascade,
  config          jsonb not null default '{"categories":[]}'::jsonb,
  updated_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- 2. Row-Level Security
alter table public.qc_config enable row level security;

-- 3. Policies (org-scoped; read for anyone working tickets, write gated to
--    ticket-settings / settings managers — mirrors the assigned_options model)
drop policy if exists qc_config_sel on public.qc_config;
create policy qc_config_sel on public.qc_config for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['manage_repair_jobs','update_repair_status','view_only','assign_technicians','edit_ticket_settings','manage_settings']::text[])
);

drop policy if exists qc_config_ins on public.qc_config;
create policy qc_config_ins on public.qc_config for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_has_any(array['edit_ticket_settings','manage_settings']::text[])
);

drop policy if exists qc_config_upd on public.qc_config;
create policy qc_config_upd on public.qc_config for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['edit_ticket_settings','manage_settings']::text[])
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_has_any(array['edit_ticket_settings','manage_settings']::text[])
);

drop policy if exists qc_config_del on public.qc_config;
create policy qc_config_del on public.qc_config for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['edit_ticket_settings','manage_settings']::text[])
);

-- 4. Grants + realtime
grant select, insert, update, delete on public.qc_config to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.qc_config;
  exception when duplicate_object then null; end;
end $$;

-- 5. (Optional) audit trigger, matching other business tables
do $$
begin
  if exists (select 1 from pg_proc where proname = 'fn_audit') then
    drop trigger if exists qc_config_audit on public.qc_config;
    create trigger qc_config_audit after insert or update or delete
      on public.qc_config for each row execute function public.fn_audit();
  end if;
end $$;
