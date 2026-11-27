-- ============================================================================
-- MIGRATION 0129: Ticket dropdown options (Lead Type, Source, Job Type)
--
-- Custom values that users add with "+ Add" in the ticket form (Device Details
-- → Lead Type / Source, Job Details → Job Type). Lives next to the Assigned By / Assigned To
-- masters (0004) and is managed from the same Settings › Tickets page.
--
-- Built-in values (Walk-In/Pick-Up/On-Site, Google/Meta/…, Service/…) stay in code and are
-- not stored here; only org-added values are. Org-wide (branch_id NULL), like
-- the other ticket masters. Additive + idempotent.
-- ============================================================================

create table if not exists public.ticket_field_options (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  field           text not null check (field in ('lead_type', 'source', 'job_type')),
  label           text not null check (length(btrim(label)) > 0),
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- One value per field per org (case-insensitive).
create unique index if not exists ticket_field_options_unique_label
  on public.ticket_field_options (organization_id, field, lower(btrim(label)));

alter table public.ticket_field_options enable row level security;

drop policy if exists ticket_field_options_sel on public.ticket_field_options;
create policy ticket_field_options_sel on public.ticket_field_options for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['view_ticket','create_ticket','edit_ticket','manage_repair_jobs','update_repair_status','view_only','manage_settings','edit_ticket_settings']::text[])
);

drop policy if exists ticket_field_options_ins on public.ticket_field_options;
create policy ticket_field_options_ins on public.ticket_field_options for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['create_ticket','edit_ticket','manage_repair_jobs','edit_ticket_settings','manage_settings']::text[])
);

drop policy if exists ticket_field_options_del on public.ticket_field_options;
create policy ticket_field_options_del on public.ticket_field_options for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['edit_ticket_settings','manage_settings']::text[])
);

grant select, insert, delete on public.ticket_field_options to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.ticket_field_options;
  exception when duplicate_object then null; end;
end $$;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'fn_audit') then
    drop trigger if exists ticket_field_options_audit on public.ticket_field_options;
    create trigger ticket_field_options_audit after insert or update or delete
      on public.ticket_field_options for each row execute function public.fn_audit();
  end if;
end $$;
