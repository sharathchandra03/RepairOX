-- 0111_field_trip_reviews.sql (additive + idempotent)
-- Customer review of the Field Engineer (Ninja) for ONE completed trip.
--   * Captured in the Ninja app after the trip is completed (customer rates on the phone).
--   * One review per trip (unique), append-only: no update / delete policy.
--   * org / branch / job / ninja are stamped from the TRIP by the guard, never trusted from the client.
--   * A Ninja can review only their OWN completed trips; field managers may record one for any visible trip.
--   * Read: the Ninja sees their own; reporting needs the same keys as Field reports (LOCKSTEP with CAP.field.reports).
-- Buyback needs no schema: it is field_jobs.lead_type = 'buyback' (a pickup-style trip with no drop leg).
create table if not exists public.field_trip_reviews (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  branch_id       uuid,
  trip_id         uuid not null unique references public.field_trips(id) on delete cascade,
  job_id          uuid not null,
  ninja_id        uuid not null,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  channel         text not null default 'ninja_app' check (channel in ('ninja_app','customer_link')),
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists field_trip_reviews_ninja_idx on public.field_trip_reviews(organization_id, ninja_id, created_at);
create index if not exists field_trip_reviews_job_idx   on public.field_trip_reviews(job_id);

create or replace function public.field_trip_reviews_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.field_trips%rowtype; v_me uuid := public.auth_staff_id();
begin
  select * into t from public.field_trips where id = new.trip_id;
  if not found then raise exception 'review_trip_not_found' using errcode = '23503'; end if;
  if t.status <> 'completed' then raise exception 'review_trip_not_completed' using errcode = '23514'; end if;
  if t.ninja_id is null then raise exception 'review_trip_has_no_ninja' using errcode = '23514'; end if;
  -- end users only; service-role writes (no JWT) skip the identity checks
  if v_me is not null and t.ninja_id <> v_me
     and not (public.auth_branch_visible(t.branch_id) and coalesce(public.auth_field_ops_manager(), false)) then
    raise exception 'review_not_your_trip' using errcode = '42501';
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
drop trigger if exists field_trip_reviews_guard_trg on public.field_trip_reviews;
create trigger field_trip_reviews_guard_trg before insert on public.field_trip_reviews
  for each row execute function public.field_trip_reviews_guard();

alter table public.field_trip_reviews enable row level security;
drop policy if exists field_trip_reviews_ins on public.field_trip_reviews;
create policy field_trip_reviews_ins on public.field_trip_reviews for insert to authenticated
  with check (public.auth_member_of_org(organization_id));
drop policy if exists field_trip_reviews_sel on public.field_trip_reviews;
create policy field_trip_reviews_sel on public.field_trip_reviews for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    ninja_id = public.auth_staff_id()
    or (public.auth_branch_visible(branch_id)
        and public.auth_has_any(array['view_field_reports','field_view_all','manage_field_jobs','full_access']))));
grant select, insert on public.field_trip_reviews to authenticated;
