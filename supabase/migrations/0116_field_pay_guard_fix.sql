-- 0116: the dated-guard read NEW.config on the salary table too (record has no such field). Idempotent replace.
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
    if tg_table_name = 'field_incentive_plans' then
      if pg_column_size(to_jsonb(new) -> 'config') > 40000 then raise exception 'pay_plan_too_large' using errcode = '23514'; end if;
    end if;
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
