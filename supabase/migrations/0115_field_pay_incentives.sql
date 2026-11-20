-- 0115_field_pay_incentives.sql (additive + idempotent)
-- Salary + incentive rules per Field Engineer (Ninja), EFFECTIVE-DATED:
--   a change applies from its effective date forward and never touches earlier days.
--   field_pay_salary          monthly basic salary per Ninja, by effective date
--   field_incentive_plans     the rule set (daily trips, slabs, reviews, devices, long distance, petrol, Sunday ...)
--                             as JSON; staff_id NULL = company default, otherwise a per-Ninja override
--   field_incentive_device_lists  the Cluster Manager's eligible MacBook / iPhone list (valid 90 days)
--   field_incentive_inputs    monthly figures that are not in the system yet (organic billed leads)
--   field_incentive_adjustments   append-only bonus / deduction ledger with a mandatory reason
-- Amounts are NEVER stored per day: the app computes them from trips, shifts, odometer, reviews and the
-- plan in force on each day, so past days stay exactly as they were unless the data itself is corrected.
-- Permissions (new, OFF unless granted; owners via full_access; seeded onto field_manager at the user's request):
--   field_pay_view   see every Ninja's pay      field_pay_manage   change salary / plans / lists / inputs

create or replace function public.field_pay_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_has_any(array['field_pay_view','field_pay_manage','full_access']), false);
$$;
create or replace function public.field_pay_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_has_any(array['field_pay_manage','full_access']), false);
$$;
grant execute on function public.field_pay_reader(), public.field_pay_manager() to authenticated;

-- 1) Tables ---------------------------------------------------------------------------------
create table if not exists public.field_pay_salary (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  branch_id       uuid,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  effective_from  date not null,
  monthly_salary  numeric(12,2) not null check (monthly_salary >= 0),
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  unique (staff_id, effective_from)
);
create table if not exists public.field_incentive_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  staff_id        uuid references public.staff(id) on delete cascade,   -- NULL = company default
  branch_id       uuid,
  effective_from  date not null,
  config          jsonb not null check (jsonb_typeof(config) = 'object'),
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create unique index if not exists field_incentive_plans_scope_idx
  on public.field_incentive_plans(organization_id, coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);
create table if not exists public.field_incentive_device_lists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  kind            text not null check (kind in ('macbook','iphone')),
  pattern         text not null check (length(btrim(pattern)) between 1 and 80),
  valid_from      date not null,
  valid_until     date not null,
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  check (valid_until >= valid_from)
);
create table if not exists public.field_incentive_inputs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  branch_id       uuid,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  month           text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  key             text not null check (key in ('organic_leads')),
  value           numeric(12,2) not null check (value >= 0),
  note            text,
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  unique (staff_id, month, key)
);
create table if not exists public.field_incentive_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  branch_id       uuid,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  month           text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount          numeric(12,2) not null check (amount <> 0),
  reason          text not null check (length(btrim(reason)) > 0),
  created_by      uuid,
  created_at      timestamptz not null default now()
);

-- 2) Guards -----------------------------------------------------------------------------------
-- Effective-dated rows (salary / plans): a NEW row may start today or later; only the very first row of a
-- scope may be back-dated (initial set-up). Past rows are immutable. Today/future rows may be edited or cancelled.
create or replace function public.field_pay_dated_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.auth_staff_id(); v_today date; v_has boolean; v_org uuid;
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
  else
    v_org := new.organization_id;
  end if;
  v_today := public.field_org_today(v_org);
  if tg_op = 'DELETE' then
    if old.effective_from < v_today then raise exception 'pay_past_immutable' using errcode = '42501'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if tg_table_name = 'field_pay_salary' then
      select s.organization_id, s.branch_id into new.organization_id, new.branch_id from public.staff s where s.id = new.staff_id;
      select exists(select 1 from public.field_pay_salary x where x.staff_id = new.staff_id) into v_has;
    else
      if new.staff_id is not null then
        select s.organization_id, s.branch_id into new.organization_id, new.branch_id from public.staff s where s.id = new.staff_id;
      end if;
      select exists(select 1 from public.field_incentive_plans x where x.organization_id = new.organization_id
                      and x.staff_id is not distinct from new.staff_id) into v_has;
    end if;
    if new.organization_id is null then raise exception 'pay_staff_not_found' using errcode = '23503'; end if;
    if v_has and new.effective_from < v_today then raise exception 'pay_backdate_not_allowed' using errcode = '23514'; end if;
    if tg_table_name = 'field_incentive_plans' and pg_column_size(new.config) > 40000 then raise exception 'pay_plan_too_large' using errcode = '23514'; end if;
    new.created_by := coalesce(v_me, new.created_by); new.created_at := now();
    return new;
  end if;
  -- UPDATE
  if old.effective_from < v_today then raise exception 'pay_past_immutable' using errcode = '42501'; end if;
  if new.effective_from < v_today then raise exception 'pay_backdate_not_allowed' using errcode = '23514'; end if;
  new.staff_id := old.staff_id; new.organization_id := old.organization_id; new.branch_id := old.branch_id;
  new.created_by := coalesce(v_me, old.created_by); new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists field_pay_salary_guard_trg on public.field_pay_salary;
create trigger field_pay_salary_guard_trg before insert or update or delete on public.field_pay_salary
  for each row execute function public.field_pay_dated_guard();
drop trigger if exists field_incentive_plans_guard_trg on public.field_incentive_plans;
create trigger field_incentive_plans_guard_trg before insert or update or delete on public.field_incentive_plans
  for each row execute function public.field_pay_dated_guard();

create or replace function public.field_pay_misc_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.auth_staff_id();
begin
  if tg_table_name = 'field_incentive_device_lists' then
    new.pattern := btrim(new.pattern);
    if new.valid_from is null then new.valid_from := public.field_org_today(new.organization_id); end if;
    if new.valid_until is null then new.valid_until := new.valid_from + 90; end if;   -- the list is valid for 90 days
    new.created_by := coalesce(v_me, new.created_by);
  else
    select s.organization_id, s.branch_id into new.organization_id, new.branch_id from public.staff s where s.id = new.staff_id;
    if new.organization_id is null then raise exception 'pay_staff_not_found' using errcode = '23503'; end if;
    if tg_table_name = 'field_incentive_adjustments' then
      new.reason := btrim(new.reason); new.created_by := coalesce(v_me, new.created_by); new.created_at := now();
    else
      new.updated_by := coalesce(v_me, new.updated_by); new.updated_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists field_incentive_lists_guard_trg on public.field_incentive_device_lists;
create trigger field_incentive_lists_guard_trg before insert on public.field_incentive_device_lists
  for each row execute function public.field_pay_misc_guard();
drop trigger if exists field_incentive_inputs_guard_trg on public.field_incentive_inputs;
create trigger field_incentive_inputs_guard_trg before insert or update on public.field_incentive_inputs
  for each row execute function public.field_pay_misc_guard();
drop trigger if exists field_incentive_adj_guard_trg on public.field_incentive_adjustments;
create trigger field_incentive_adj_guard_trg before insert on public.field_incentive_adjustments
  for each row execute function public.field_pay_misc_guard();

-- 3) RLS --------------------------------------------------------------------------------------
alter table public.field_pay_salary enable row level security;
alter table public.field_incentive_plans enable row level security;
alter table public.field_incentive_device_lists enable row level security;
alter table public.field_incentive_inputs enable row level security;
alter table public.field_incentive_adjustments enable row level security;

drop policy if exists field_pay_salary_sel on public.field_pay_salary;
create policy field_pay_salary_sel on public.field_pay_salary for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or (public.auth_branch_visible(branch_id) and public.field_pay_reader())));
drop policy if exists field_pay_salary_ins on public.field_pay_salary;
create policy field_pay_salary_ins on public.field_pay_salary for insert to authenticated with check (public.auth_member_of_org(organization_id) and public.field_pay_manager());
drop policy if exists field_pay_salary_upd on public.field_pay_salary;
create policy field_pay_salary_upd on public.field_pay_salary for update to authenticated using (public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id) and public.field_pay_manager()) with check (public.auth_member_of_org(organization_id));
drop policy if exists field_pay_salary_del on public.field_pay_salary;
create policy field_pay_salary_del on public.field_pay_salary for delete to authenticated using (public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id) and public.field_pay_manager());

drop policy if exists field_incentive_plans_sel on public.field_incentive_plans;
create policy field_incentive_plans_sel on public.field_incentive_plans for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id is null or staff_id = public.auth_staff_id() or public.field_pay_reader()));
drop policy if exists field_incentive_plans_ins on public.field_incentive_plans;
create policy field_incentive_plans_ins on public.field_incentive_plans for insert to authenticated with check (public.auth_member_of_org(organization_id) and public.field_pay_manager());
drop policy if exists field_incentive_plans_upd on public.field_incentive_plans;
create policy field_incentive_plans_upd on public.field_incentive_plans for update to authenticated using (public.auth_member_of_org(organization_id) and public.field_pay_manager()) with check (public.auth_member_of_org(organization_id));
drop policy if exists field_incentive_plans_del on public.field_incentive_plans;
create policy field_incentive_plans_del on public.field_incentive_plans for delete to authenticated using (public.auth_member_of_org(organization_id) and public.field_pay_manager());

drop policy if exists field_incentive_lists_sel on public.field_incentive_device_lists;
create policy field_incentive_lists_sel on public.field_incentive_device_lists for select to authenticated using (public.auth_member_of_org(organization_id));
drop policy if exists field_incentive_lists_ins on public.field_incentive_device_lists;
create policy field_incentive_lists_ins on public.field_incentive_device_lists for insert to authenticated with check (public.auth_member_of_org(organization_id) and public.field_pay_manager());
drop policy if exists field_incentive_lists_del on public.field_incentive_device_lists;
create policy field_incentive_lists_del on public.field_incentive_device_lists for delete to authenticated using (public.auth_member_of_org(organization_id) and public.field_pay_manager());

drop policy if exists field_incentive_inputs_sel on public.field_incentive_inputs;
create policy field_incentive_inputs_sel on public.field_incentive_inputs for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or (public.auth_branch_visible(branch_id) and public.field_pay_reader())));
drop policy if exists field_incentive_inputs_ins on public.field_incentive_inputs;
create policy field_incentive_inputs_ins on public.field_incentive_inputs for insert to authenticated with check (public.auth_member_of_org(organization_id) and public.field_pay_manager());
drop policy if exists field_incentive_inputs_upd on public.field_incentive_inputs;
create policy field_incentive_inputs_upd on public.field_incentive_inputs for update to authenticated using (public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id) and public.field_pay_manager()) with check (public.auth_member_of_org(organization_id));

drop policy if exists field_incentive_adj_sel on public.field_incentive_adjustments;
create policy field_incentive_adj_sel on public.field_incentive_adjustments for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or (public.auth_branch_visible(branch_id) and public.field_pay_reader())));
drop policy if exists field_incentive_adj_ins on public.field_incentive_adjustments;
create policy field_incentive_adj_ins on public.field_incentive_adjustments for insert to authenticated with check (public.auth_member_of_org(organization_id) and public.field_pay_manager());

grant select, insert, update, delete on public.field_pay_salary, public.field_incentive_plans to authenticated;
grant select, insert, delete on public.field_incentive_device_lists to authenticated;
grant select, insert, update on public.field_incentive_inputs to authenticated;
grant select, insert on public.field_incentive_adjustments to authenticated;

-- 4) Field managers can see + manage pay (the owner already can via full_access). Adjust per role in Roles & Permissions.
insert into public.role_permissions(role_id, permission_key)
select 'field_manager', k from unnest(array['field_pay_view','field_pay_manage']) k
where exists (select 1 from public.roles where id = 'field_manager')
on conflict do nothing;
