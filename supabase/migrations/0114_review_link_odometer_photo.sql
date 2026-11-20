-- 0114_review_link_odometer_photo.sql (additive + idempotent)
--  1) CUSTOMER review link: the customer rates the Ninja on a public page. A Ninja can no longer
--     write a review for their own trip (guard), so they cannot rate themselves.
--        field_review_tokens = hashed, expiring, one-trip tokens (service role only, like tracking tokens).
--  2) ODOMETER photo proof for the start / end reading (private bucket 'ninja-odometer',
--     path <org>/<staff>/<day>-<start|end>.jpg, immutable). Whether a photo is mandatory is a rule in
--     field_policy.odometer_photo_required.
--  3) The GPS-vs-odometer cross-check needs no schema (it reads field_ninja_trip_stats_v).

-- 1) Review tokens -----------------------------------------------------------------------
create table if not exists public.field_review_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  trip_id         uuid not null references public.field_trips(id) on delete cascade,
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  revoked_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists field_review_tokens_trip_idx on public.field_review_tokens(trip_id);
alter table public.field_review_tokens enable row level security;   -- no policies => service role only

alter table public.field_trip_reviews drop constraint if exists field_trip_reviews_channel_check;
alter table public.field_trip_reviews add constraint field_trip_reviews_channel_check
  check (channel in ('ninja_app','customer_link','manager'));

create or replace function public.field_trip_reviews_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.field_trips%rowtype; v_me uuid := public.auth_staff_id(); v_mgr boolean;
begin
  select * into t from public.field_trips where id = new.trip_id;
  if not found then raise exception 'review_trip_not_found' using errcode = '23503'; end if;
  if t.status <> 'completed' then raise exception 'review_trip_not_completed' using errcode = '23514'; end if;
  if t.ninja_id is null then raise exception 'review_trip_has_no_ninja' using errcode = '23514'; end if;
  if v_me is not null then
    -- an end user: only a field manager may record a review (the customer uses the public link, via the service role)
    v_mgr := public.auth_branch_visible(t.branch_id) and coalesce(public.auth_field_ops_manager(), false);
    if t.ninja_id = v_me and not v_mgr then raise exception 'review_customer_only' using errcode = '42501'; end if;
    if not v_mgr then raise exception 'review_not_allowed' using errcode = '42501'; end if;
    new.channel := 'manager';
  else
    new.channel := coalesce(nullif(new.channel, ''), 'customer_link');
  end if;
  new.organization_id := t.organization_id;
  new.branch_id       := t.branch_id;
  new.job_id          := t.job_id;
  new.ninja_id        := t.ninja_id;
  new.created_by      := coalesce(v_me, new.created_by);
  new.created_at      := now();
  new.comment         := nullif(left(btrim(coalesce(new.comment, '')), 500), '');
  return new;
end $$;

-- 2) Odometer photo -------------------------------------------------------------------------
alter table public.field_policy add column if not exists odometer_photo_required boolean not null default true;
alter table public.ninja_day_logs add column if not exists start_photo text;
alter table public.ninja_day_logs add column if not exists end_photo text;

insert into storage.buckets (id, name, public) values ('ninja-odometer', 'ninja-odometer', false) on conflict (id) do nothing;
drop policy if exists ninja_odometer_insert on storage.objects;
create policy ninja_odometer_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ninja-odometer'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and (storage.foldername(name))[2] = public.auth_staff_id()::text);
drop policy if exists ninja_odometer_select on storage.objects;
create policy ninja_odometer_select on storage.objects for select to authenticated using (
  bucket_id = 'ninja-odometer'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and ((storage.foldername(name))[2] = public.auth_staff_id()::text or public.field_att_reader()));
-- no update / delete policy => photos are immutable

create or replace function public.ninja_day_logs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.auth_staff_id(); v_mgr boolean := public.field_att_manager(); v_self boolean; v_need boolean;
begin
  v_self := v_me is not null and not v_mgr;
  if tg_op = 'INSERT' then
    if v_self then new.staff_id := v_me; end if;
    select s.organization_id, s.branch_id into new.organization_id, new.branch_id from public.staff s where s.id = new.staff_id;
    if new.organization_id is null then raise exception 'odometer_staff_not_found' using errcode = '23503'; end if;
    if v_self then
      new.day := public.field_org_today(new.organization_id);
      new.start_at := now();
      new.end_reading := null; new.end_at := null; new.end_photo := null;
      new.correction_reason := null; new.corrected_by := null; new.corrected_at := null;
      -- photo must live under the Ninja's own folder
      if new.start_photo is not null and new.start_photo not like new.organization_id::text || '/' || new.staff_id::text || '/%' then
        raise exception 'odometer_photo_path' using errcode = '23514'; end if;
      select coalesce((select odometer_photo_required from public.field_policy where organization_id = new.organization_id), true) into v_need;
      if v_need and new.start_photo is null then raise exception 'odometer_photo_required' using errcode = '23514'; end if;
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
    if old.start_photo is not null then new.start_photo := old.start_photo; end if;
    if new.end_photo is not null and new.end_photo not like old.organization_id::text || '/' || old.staff_id::text || '/%' then
      raise exception 'odometer_photo_path' using errcode = '23514'; end if;
    if new.start_photo is not null and new.start_photo is distinct from old.start_photo
       and new.start_photo not like old.organization_id::text || '/' || old.staff_id::text || '/%' then
      raise exception 'odometer_photo_path' using errcode = '23514'; end if;
    select coalesce((select odometer_photo_required from public.field_policy where organization_id = old.organization_id), true) into v_need;
    if v_need and new.end_photo is null then raise exception 'odometer_photo_required' using errcode = '23514'; end if;
    new.end_at := now();
    new.correction_reason := old.correction_reason; new.corrected_by := old.corrected_by; new.corrected_at := old.corrected_at;
  elsif v_me is not null then
    if nullif(btrim(coalesce(new.correction_reason,'')),'') is null then raise exception 'odometer_reason_required' using errcode = '23514'; end if;
    new.corrected_by := v_me; new.corrected_at := now();
    if new.end_reading is not null and new.end_at is null then new.end_at := now(); end if;
  end if;
  return new;
end $$;
