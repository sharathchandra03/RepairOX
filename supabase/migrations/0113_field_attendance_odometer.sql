-- 0113_field_attendance_odometer.sql (additive + idempotent)
-- Automates the Ninja attendance / KM / fuel Google Sheet from the Ninja app.
--   PUNCH IN / OUT      = the existing Work Session (work_sessions) — nothing duplicated.
--   ODOMETER (km, fuel) = ninja_day_logs: one row per Ninja per local day, start reading when the
--                         day starts, end reading when it ends. Travelled km = end - start.
--   LEAVE / WEEK OFF    = field_attendance_marks (Ninja requests, a field manager approves) +
--                         field_weekly_off (default weekly off day).
--   RULES               = field_policy (fuel rate per km, leave quotas, half-day hours), one row per org.
--   PRESENT / ABSENT / HALF DAY are DERIVED in the app from work sessions + marks — never typed.
-- Permissions reuse existing keys: managers = manage_field_jobs / full_access;
-- readers = view_field_reports / field_view_all (LOCKSTEP with CAP.field.reports).

-- 1) Policy ---------------------------------------------------------------------------
create table if not exists public.field_policy (
  organization_id        uuid primary key default public.auth_org_id() references public.organizations(id) on delete cascade,
  fuel_rate_per_km       numeric(8,2) not null default 3.5  check (fuel_rate_per_km >= 0),
  festival_leave_per_year smallint    not null default 8    check (festival_leave_per_year between 0 and 60),
  casual_leave_per_month smallint     not null default 1    check (casual_leave_per_month between 0 and 31),
  week_off_per_month     smallint     not null default 4    check (week_off_per_month between 0 and 31),
  half_day_hours         numeric(4,1) not null default 4    check (half_day_hours between 0 and 12),
  updated_by             uuid,
  updated_at             timestamptz not null default now()
);

-- 2) Daily odometer log -----------------------------------------------------------------
create table if not exists public.ninja_day_logs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default public.auth_org_id(),
  branch_id         uuid,
  staff_id          uuid not null references public.staff(id) on delete cascade,
  day               date not null,                       -- local day in the org timezone (server-stamped for the Ninja)
  start_reading     integer not null check (start_reading between 0 and 9999999),
  start_at          timestamptz not null default now(),
  end_reading       integer check (end_reading between 0 and 9999999),
  end_at            timestamptz,
  travelled_km      integer generated always as (case when end_reading is not null then end_reading - start_reading end) stored,
  correction_reason text,
  corrected_by      uuid,
  corrected_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (staff_id, day),
  check (end_reading is null or end_reading >= start_reading)
);
create index if not exists ninja_day_logs_org_day_idx on public.ninja_day_logs(organization_id, day);

-- 3) Leave / week-off marks ----------------------------------------------------------------
create table if not exists public.field_attendance_marks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  branch_id       uuid,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  day             date not null,
  kind            text not null check (kind in ('week_off','casual_leave','festival_leave','half_day','absent')),
  status          text not null default 'approved' check (status in ('requested','approved','rejected')),
  reason          text,
  requested_by    uuid,
  decided_by      uuid,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (staff_id, day)
);
create index if not exists field_attendance_marks_org_day_idx on public.field_attendance_marks(organization_id, day);

create table if not exists public.field_weekly_off (
  staff_id        uuid primary key references public.staff(id) on delete cascade,
  organization_id uuid not null default public.auth_org_id(),
  weekday         smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  updated_at      timestamptz not null default now()
);

-- helpers -------------------------------------------------------------------------------
create or replace function public.field_att_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_has_any(array['manage_field_jobs','full_access']), false);
$$;
create or replace function public.field_att_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_has_any(array['view_field_reports','field_view_all','manage_field_jobs','full_access']), false);
$$;
create or replace function public.field_org_today(p_org uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select nullif(timezone,'') from public.organization_settings where organization_id = p_org), 'Asia/Kolkata'))::date;
$$;
grant execute on function public.field_att_manager(), public.field_att_reader(), public.field_org_today(uuid) to authenticated;

-- 4) Guards -------------------------------------------------------------------------------
create or replace function public.ninja_day_logs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.auth_staff_id(); v_mgr boolean := public.field_att_manager(); v_self boolean;
begin
  v_self := v_me is not null and not v_mgr;
  if tg_op = 'INSERT' then
    if v_self then new.staff_id := v_me; end if;
    select s.organization_id, s.branch_id into new.organization_id, new.branch_id from public.staff s where s.id = new.staff_id;
    if new.organization_id is null then raise exception 'odometer_staff_not_found' using errcode = '23503'; end if;
    if v_self then
      new.day := public.field_org_today(new.organization_id);
      new.start_at := now();
      new.end_reading := null; new.end_at := null;
      new.correction_reason := null; new.corrected_by := null; new.corrected_at := null;
    else
      if v_me is not null and nullif(btrim(coalesce(new.correction_reason,'')),'') is null then
        raise exception 'odometer_reason_required' using errcode = '23514'; end if;
      if v_me is not null then new.corrected_by := v_me; new.corrected_at := now(); end if;
    end if;
    return new;
  end if;
  -- UPDATE
  new.staff_id := old.staff_id; new.organization_id := old.organization_id; new.branch_id := old.branch_id;
  if v_self then
    if new.day is distinct from old.day or new.start_reading is distinct from old.start_reading or new.start_at is distinct from old.start_at then
      raise exception 'odometer_start_locked' using errcode = '42501'; end if;
    if old.end_reading is not null then raise exception 'odometer_end_locked' using errcode = '42501'; end if;
    if new.end_reading is null then raise exception 'odometer_end_required' using errcode = '23514'; end if;
    if new.end_reading - old.start_reading > 1000 then raise exception 'odometer_too_far' using errcode = '23514'; end if;
    new.end_at := now();
    new.correction_reason := old.correction_reason; new.corrected_by := old.corrected_by; new.corrected_at := old.corrected_at;
  elsif v_me is not null then
    if nullif(btrim(coalesce(new.correction_reason,'')),'') is null then raise exception 'odometer_reason_required' using errcode = '23514'; end if;
    new.corrected_by := v_me; new.corrected_at := now();
    if new.end_reading is not null and new.end_at is null then new.end_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists ninja_day_logs_guard_trg on public.ninja_day_logs;
create trigger ninja_day_logs_guard_trg before insert or update on public.ninja_day_logs
  for each row execute function public.ninja_day_logs_guard();

create or replace function public.field_attendance_marks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.auth_staff_id(); v_mgr boolean := public.field_att_manager(); v_self boolean;
begin
  v_self := v_me is not null and not v_mgr;
  if tg_op = 'INSERT' then
    if v_self then new.staff_id := v_me; end if;
    select s.organization_id, s.branch_id into new.organization_id, new.branch_id from public.staff s where s.id = new.staff_id;
    if new.organization_id is null then raise exception 'attendance_staff_not_found' using errcode = '23503'; end if;
    if v_self then
      if new.kind not in ('casual_leave','festival_leave') then raise exception 'attendance_kind_not_requestable' using errcode = '42501'; end if;
      if new.day < public.field_org_today(new.organization_id) then raise exception 'attendance_past_day' using errcode = '23514'; end if;
      new.status := 'requested'; new.requested_by := v_me; new.decided_by := null; new.decided_at := null;
    else
      new.status := coalesce(nullif(new.status,''), 'approved');
      new.requested_by := coalesce(new.requested_by, v_me);
      if new.status <> 'requested' then new.decided_by := v_me; new.decided_at := now(); end if;
    end if;
    return new;
  end if;
  new.staff_id := old.staff_id; new.organization_id := old.organization_id; new.branch_id := old.branch_id;
  new.requested_by := old.requested_by; new.created_at := old.created_at;
  if v_self then raise exception 'attendance_not_editable' using errcode = '42501'; end if;
  if new.status is distinct from old.status or new.kind is distinct from old.kind then
    new.decided_by := v_me; new.decided_at := now();
  end if;
  return new;
end $$;
drop trigger if exists field_attendance_marks_guard_trg on public.field_attendance_marks;
create trigger field_attendance_marks_guard_trg before insert or update on public.field_attendance_marks
  for each row execute function public.field_attendance_marks_guard();

create or replace function public.field_policy_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.updated_by := public.auth_staff_id(); new.updated_at := now(); return new; end $$;
drop trigger if exists field_policy_stamp_trg on public.field_policy;
create trigger field_policy_stamp_trg before insert or update on public.field_policy
  for each row execute function public.field_policy_stamp();

-- 5) RLS ---------------------------------------------------------------------------------
alter table public.field_policy enable row level security;
drop policy if exists field_policy_sel on public.field_policy;
create policy field_policy_sel on public.field_policy for select to authenticated using (public.auth_member_of_org(organization_id));
drop policy if exists field_policy_ins on public.field_policy;
create policy field_policy_ins on public.field_policy for insert to authenticated with check (public.auth_member_of_org(organization_id) and public.field_att_manager());
drop policy if exists field_policy_upd on public.field_policy;
create policy field_policy_upd on public.field_policy for update to authenticated using (public.auth_member_of_org(organization_id) and public.field_att_manager()) with check (public.auth_member_of_org(organization_id) and public.field_att_manager());

alter table public.ninja_day_logs enable row level security;
drop policy if exists ninja_day_logs_sel on public.ninja_day_logs;
create policy ninja_day_logs_sel on public.ninja_day_logs for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id()
    or (public.auth_branch_visible(branch_id) and public.field_att_reader())));
drop policy if exists ninja_day_logs_ins on public.ninja_day_logs;
create policy ninja_day_logs_ins on public.ninja_day_logs for insert to authenticated
  with check (public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or public.field_att_manager()));
drop policy if exists ninja_day_logs_upd on public.ninja_day_logs;
create policy ninja_day_logs_upd on public.ninja_day_logs for update to authenticated
  using (public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or (public.auth_branch_visible(branch_id) and public.field_att_manager())))
  with check (public.auth_member_of_org(organization_id));

alter table public.field_attendance_marks enable row level security;
drop policy if exists field_attendance_marks_sel on public.field_attendance_marks;
create policy field_attendance_marks_sel on public.field_attendance_marks for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id()
    or (public.auth_branch_visible(branch_id) and public.field_att_reader())));
drop policy if exists field_attendance_marks_ins on public.field_attendance_marks;
create policy field_attendance_marks_ins on public.field_attendance_marks for insert to authenticated
  with check (public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or public.field_att_manager()));
drop policy if exists field_attendance_marks_upd on public.field_attendance_marks;
create policy field_attendance_marks_upd on public.field_attendance_marks for update to authenticated
  using (public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id) and public.field_att_manager())
  with check (public.auth_member_of_org(organization_id));
drop policy if exists field_attendance_marks_del on public.field_attendance_marks;
create policy field_attendance_marks_del on public.field_attendance_marks for delete to authenticated using (
  public.auth_member_of_org(organization_id) and (
    (staff_id = public.auth_staff_id() and status = 'requested')
    or (public.auth_branch_visible(branch_id) and public.field_att_manager())));

alter table public.field_weekly_off enable row level security;
drop policy if exists field_weekly_off_sel on public.field_weekly_off;
create policy field_weekly_off_sel on public.field_weekly_off for select to authenticated using (
  public.auth_member_of_org(organization_id) and (staff_id = public.auth_staff_id() or public.field_att_reader()));
drop policy if exists field_weekly_off_ins on public.field_weekly_off;
create policy field_weekly_off_ins on public.field_weekly_off for insert to authenticated with check (public.auth_member_of_org(organization_id) and public.field_att_manager());
drop policy if exists field_weekly_off_upd on public.field_weekly_off;
create policy field_weekly_off_upd on public.field_weekly_off for update to authenticated using (public.auth_member_of_org(organization_id) and public.field_att_manager()) with check (public.auth_member_of_org(organization_id));
drop policy if exists field_weekly_off_del on public.field_weekly_off;
create policy field_weekly_off_del on public.field_weekly_off for delete to authenticated using (public.auth_member_of_org(organization_id) and public.field_att_manager());

grant select, insert, update on public.field_policy to authenticated;
grant select, insert, update on public.ninja_day_logs to authenticated;
grant select, insert, update, delete on public.field_attendance_marks to authenticated;
grant select, insert, update, delete on public.field_weekly_off to authenticated;

-- 6) Roster for the CRM attendance grid ---------------------------------------------------
-- Work sessions are readable only by their owner / productivity-report holders, so a field manager gets
-- the Ninjas' sessions through this gated, scope-limited function (Ninjas only, caller's stores only).
create or replace function public.field_attendance_roster(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.auth_org_id();
begin
  if not public.field_att_reader() then return jsonb_build_object('ninjas', '[]'::jsonb, 'sessions', '[]'::jsonb); end if;
  return jsonb_build_object(
    'ninjas', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'branch_id', s.branch_id, 'status', s.status) order by s.name), '[]'::jsonb)
                 from public.staff s where s.organization_id = v_org and s.role_id = 'ninja' and public.auth_branch_visible(s.branch_id)),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', w.id, 'staff_id', w.staff_id, 'started_at', w.started_at, 'ended_at', w.ended_at, 'status', w.status, 'last_seen_at', w.last_seen_at,
                    'breaks', (select coalesce(jsonb_agg(jsonb_build_object('started_at', b.started_at, 'ended_at', b.ended_at)), '[]'::jsonb)
                                 from public.work_session_breaks b where b.session_id = w.id))), '[]'::jsonb)
                   from public.work_sessions w join public.staff s on s.id = w.staff_id
                  where w.organization_id = v_org and s.role_id = 'ninja' and public.auth_branch_visible(s.branch_id)
                    and w.started_at >= (p_from::timestamp - interval '1 day') and w.started_at < (p_to::timestamp + interval '2 days')));
end $$;
grant execute on function public.field_attendance_roster(date, date) to authenticated;
