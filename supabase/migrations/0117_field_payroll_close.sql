-- 0117_field_payroll_close.sql (additive + idempotent)
-- MONTH CLOSE for Field Engineer pay. Closing a month freezes each Ninja's payslip (a snapshot of the
-- numbers the engine produced) so later data corrections cannot change what was paid.
--   field_payroll_months   one row per closed month (header, no money)
--   field_payroll_lines    one frozen payslip per Ninja per closed month (own row or field_pay_view)
--   field_payroll_audit    append-only: every close / reopen, who, why
-- Writes only through the two gated functions below (no direct insert/update/delete policies).
-- A closed month also locks the monthly figures typed by hand (organic leads); a bonus / deduction can
-- still be added afterwards and is shown as a post-close adjustment.
create table if not exists public.field_payroll_months (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  month           text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  note            text,
  closed_by       uuid,
  closed_at       timestamptz not null default now(),
  unique (organization_id, month)
);
create table if not exists public.field_payroll_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id       uuid,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  month           text not null,
  summary         jsonb not null,
  total           numeric(12,2) not null,
  created_at      timestamptz not null default now(),
  unique (staff_id, month)
);
create table if not exists public.field_payroll_audit (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  month           text not null,
  action          text not null check (action in ('close','reopen')),
  reason          text,
  by_staff        uuid,
  at              timestamptz not null default now(),
  ninjas          integer,
  total           numeric(14,2)
);
alter table public.field_payroll_months enable row level security;
alter table public.field_payroll_lines enable row level security;
alter table public.field_payroll_audit enable row level security;
drop policy if exists field_payroll_months_sel on public.field_payroll_months;
create policy field_payroll_months_sel on public.field_payroll_months for select to authenticated using (public.auth_member_of_org(organization_id));
drop policy if exists field_payroll_lines_sel on public.field_payroll_lines;
create policy field_payroll_lines_sel on public.field_payroll_lines for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or (public.auth_branch_visible(branch_id) and public.field_pay_reader())));
drop policy if exists field_payroll_audit_sel on public.field_payroll_audit;
create policy field_payroll_audit_sel on public.field_payroll_audit for select to authenticated using (public.auth_member_of_org(organization_id) and public.field_pay_reader());
grant select on public.field_payroll_months, public.field_payroll_lines, public.field_payroll_audit to authenticated;

create or replace function public.field_payroll_close(p_month text, p_lines jsonb, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.auth_org_id(); v_me uuid := public.auth_staff_id(); v_today date; r jsonb; s record; v_n int := 0; v_total numeric := 0;
begin
  if not public.field_pay_manager() then raise exception 'payroll_forbidden' using errcode = '42501'; end if;
  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'payroll_bad_month' using errcode = '22023'; end if;
  v_today := public.field_org_today(v_org);
  if p_month >= to_char(v_today, 'YYYY-MM') then raise exception 'payroll_month_not_over' using errcode = '23514'; end if;
  if exists (select 1 from public.field_payroll_months where organization_id = v_org and month = p_month) then raise exception 'payroll_already_closed' using errcode = '23505'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'payroll_no_lines' using errcode = '22023'; end if;
  insert into public.field_payroll_months(organization_id, month, note, closed_by) values (v_org, p_month, nullif(btrim(coalesce(p_note,'')),''), v_me);
  for r in select * from jsonb_array_elements(p_lines) loop
    select st.id, st.organization_id, st.branch_id into s from public.staff st where st.id = (r->>'staff_id')::uuid;
    if s.id is null or s.organization_id <> v_org then raise exception 'payroll_staff_not_found' using errcode = '23503'; end if;
    if not public.auth_branch_visible(s.branch_id) then raise exception 'payroll_staff_out_of_scope' using errcode = '42501'; end if;
    insert into public.field_payroll_lines(organization_id, branch_id, staff_id, month, summary, total)
      values (v_org, s.branch_id, s.id, p_month, coalesce(r->'summary', '{}'::jsonb), coalesce((r->>'total')::numeric, 0));
    v_n := v_n + 1; v_total := v_total + coalesce((r->>'total')::numeric, 0);
  end loop;
  insert into public.field_payroll_audit(organization_id, month, action, reason, by_staff, ninjas, total) values (v_org, p_month, 'close', nullif(btrim(coalesce(p_note,'')),''), v_me, v_n, v_total);
end $$;

create or replace function public.field_payroll_reopen(p_month text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.auth_org_id(); v_me uuid := public.auth_staff_id(); v_n int; v_total numeric;
begin
  if not public.field_pay_manager() then raise exception 'payroll_forbidden' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'payroll_reason_required' using errcode = '23514'; end if;
  if not exists (select 1 from public.field_payroll_months where organization_id = v_org and month = p_month) then raise exception 'payroll_not_closed' using errcode = '22023'; end if;
  select count(*), coalesce(sum(total),0) into v_n, v_total from public.field_payroll_lines where organization_id = v_org and month = p_month;
  delete from public.field_payroll_lines where organization_id = v_org and month = p_month;
  delete from public.field_payroll_months where organization_id = v_org and month = p_month;
  insert into public.field_payroll_audit(organization_id, month, action, reason, by_staff, ninjas, total) values (v_org, p_month, 'reopen', btrim(p_reason), v_me, v_n, v_total);
end $$;
grant execute on function public.field_payroll_close(text, jsonb, text), public.field_payroll_reopen(text, text) to authenticated;

-- A closed month locks the hand-typed monthly figures (organic leads).
create or replace function public.field_payroll_input_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.field_payroll_months m where m.organization_id = new.organization_id and m.month = new.month) then
    raise exception 'payroll_month_closed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists field_incentive_inputs_lock_trg on public.field_incentive_inputs;
create trigger field_incentive_inputs_lock_trg before insert or update on public.field_incentive_inputs
  for each row execute function public.field_payroll_input_lock();
