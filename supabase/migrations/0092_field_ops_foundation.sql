-- 0092_field_ops_foundation.sql
-- Field Operations ecosystem — PHASE 1/2 foundation (additive + idempotent).
--
-- Model (see .kiro/steering/field-operations-ecosystem.md):
--   field_jobs (existing)  = Field Service Job (parent customer journey). NOT replaced.
--   field_trips            = one execution leg (pickup | drop | onsite) per row.
--   field_assignments      = append-only Ninja assignment history (accept/reject).
--   field_trip_events      = append-only trip event trail (idempotent, offline-safe).
--   field_tracking_sessions / field_location_points = active-trip GPS only.
--   field_handovers        = chain-of-custody (ninja<->store) records.
--   field_tracking_tokens  = hashed, revocable public tracking tokens (service-role only).
-- Server-side state machine: field_trip_transition_ok() + field_trips_guard().
-- Lockstep: RLS key arrays below MUST match CAP.field.* in capabilities.ts.

-- 1) Trips ---------------------------------------------------------------------
create table if not exists public.field_trips (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null default public.auth_org_id(),
  branch_id           uuid,                       -- OPERATIONAL store
  job_id              uuid not null references public.field_jobs(id) on delete restrict,
  trip_no             text,                       -- server generated, e.g. FJ-001-P1
  trip_type           text not null check (trip_type in ('pickup','drop','onsite','warranty_pickup')),
  status              text not null default 'awaiting_assignment' check (status in (
    'awaiting_assignment','assigned','accepted','en_route_customer','arrived_customer',
    'pickup_in_progress','device_collected','en_route_store','arrived_store',
    'handover_pending','store_received','store_dispatch_confirmed','device_received_by_ninja',
    'delivery_in_progress','delivered','service_in_progress','service_completed',
    'service_not_completed','completed','failed_attempt','customer_unavailable',
    'rescheduled','return_to_store','cancelled')),
  lead_id             text,
  customer_id         text,
  ninja_id            uuid,                       -- staff.id of the current assignee
  assigned_by         uuid,
  assigned_at         timestamptz,
  accepted_at         timestamptz,
  journey_started_at  timestamptz,
  arrived_at          timestamptz,
  completed_at        timestamptz,
  scheduled_at        timestamptz,
  scheduled_window    text,
  source_label        text,
  source_lat          double precision,
  source_lng          double precision,
  source_address      text,
  dest_lat            double precision,
  dest_lng            double precision,
  dest_address        text,
  dest_maps_url       text,
  instructions        text,
  ticket_id           text,
  invoice_id          text,
  failure_reason      text,
  client_request_id   text,
  created_by          uuid,
  created_at         timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists field_trips_job_idx    on public.field_trips(job_id);
create index if not exists field_trips_ninja_idx  on public.field_trips(ninja_id, status);
create index if not exists field_trips_org_st_idx on public.field_trips(organization_id, branch_id, status);
create index if not exists field_trips_sched_idx  on public.field_trips(scheduled_at);
create unique index if not exists field_trips_client_req_uq
  on public.field_trips(organization_id, client_request_id) where client_request_id is not null;
create unique index if not exists field_trips_trip_no_uq
  on public.field_trips(organization_id, trip_no) where trip_no is not null;
-- One ACTIVE trip per (job, type): a retry/duplicate cannot create a second open leg.
create unique index if not exists field_trips_one_open_per_leg
  on public.field_trips(job_id, trip_type)
  where status not in ('completed','cancelled','delivered','failed_attempt','rescheduled','return_to_store');

-- 2) State machine --------------------------------------------------------------
create or replace function public.field_trip_transition_ok(p_type text, p_from text, p_to text)
returns boolean language sql immutable as $$
  select case
    when p_from = p_to then false
    when p_to = 'cancelled' then p_from not in ('completed','delivered','cancelled')
    when p_to = 'rescheduled' then p_from in ('awaiting_assignment','assigned','accepted')
    when p_to in ('failed_attempt','customer_unavailable')
      then p_from in ('en_route_customer','arrived_customer','pickup_in_progress','delivery_in_progress','service_in_progress')
    -- common leading legs
    when p_from = 'awaiting_assignment' then p_to = 'assigned'
    when p_from = 'assigned'            then p_to in ('accepted','awaiting_assignment')  -- reject => back to queue
    when p_type in ('pickup','warranty_pickup') then
      (p_from, p_to) in (
        ('accepted','en_route_customer'),('en_route_customer','arrived_customer'),
        ('arrived_customer','pickup_in_progress'),('pickup_in_progress','device_collected'),
        ('device_collected','en_route_store'),('en_route_store','arrived_store'),
        ('arrived_store','handover_pending'),
        ('handover_pending','store_received'),   -- store reception only (guard)
        ('store_received','completed'),
        ('failed_attempt','awaiting_assignment'),('customer_unavailable','awaiting_assignment'))
    when p_type = 'drop' then
      (p_from, p_to) in (
        ('accepted','arrived_store'),
        ('arrived_store','store_dispatch_confirmed'),          -- store employee only (guard)
        ('store_dispatch_confirmed','device_received_by_ninja'),
        ('device_received_by_ninja','en_route_customer'),
        ('en_route_customer','arrived_customer'),
        ('arrived_customer','delivery_in_progress'),
        ('delivery_in_progress','delivered'),('delivered','completed'),
        ('failed_attempt','return_to_store'),('customer_unavailable','return_to_store'),
        ('return_to_store','awaiting_assignment'))
    when p_type = 'onsite' then
      (p_from, p_to) in (
        ('accepted','en_route_customer'),('en_route_customer','arrived_customer'),
        ('arrived_customer','service_in_progress'),
        ('service_in_progress','service_completed'),('service_in_progress','service_not_completed'),
        ('service_completed','completed'),('service_not_completed','completed'),
        ('failed_attempt','awaiting_assignment'),('customer_unavailable','awaiting_assignment'))
    else false end;
$$;

-- Keys allowed to perform the store-side / manager-side steps.
create or replace function public.field_trips_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.auth_staff_id();
  v_seq   int;
  v_job   text;
  v_mgr   boolean;
  v_store boolean;
begin
  if v_actor is null then          -- service-role / no end-user JWT bypasses actor checks
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;
  v_mgr   := coalesce(public.auth_has_any(array['manage_field_jobs','assign_ninja','manage_field','full_access']), false);
  v_store := coalesce(public.auth_has_any(array['receive_store_handoff','manage_field_jobs','full_access']), false);

  if tg_op = 'INSERT' then
    select job_no into v_job from public.field_jobs where id = new.job_id;
    select count(*) + 1 into v_seq from public.field_trips
      where job_id = new.job_id and trip_type = new.trip_type;
    new.trip_no := coalesce(v_job, 'FJ') || '-' ||
      (case new.trip_type when 'pickup' then 'P' when 'drop' then 'D' when 'onsite' then 'O' else 'W' end) || v_seq;
    new.created_by := v_actor;
    new.status := 'awaiting_assignment';
    new.ninja_id := null;
    return new;
  end if;

  new.updated_at := now();
  -- immutable identity
  if new.job_id is distinct from old.job_id or new.trip_type is distinct from old.trip_type
     or new.organization_id is distinct from old.organization_id or new.trip_no is distinct from old.trip_no then
    raise exception 'field_trip_immutable' using errcode = '42501';
  end if;
  -- assignee changes are manager-only (accept/reject use status moves)
  if new.ninja_id is distinct from old.ninja_id and not v_mgr
     and not (new.status = 'awaiting_assignment' and old.ninja_id = v_actor) then
    raise exception 'field_trip_assign_forbidden' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not public.field_trip_transition_ok(old.trip_type, old.status, new.status) then
      raise exception 'field_trip_invalid_transition: % -> %', old.status, new.status using errcode = '23514';
    end if;
    -- Ninja-driven moves must be the assignee; manager may act on any.
    if not v_mgr and old.ninja_id is distinct from v_actor and not (new.status in ('store_received','store_dispatch_confirmed') and v_store) then
      raise exception 'field_trip_not_assignee' using errcode = '42501';
    end if;
    if new.status in ('store_received','store_dispatch_confirmed') and not v_store then
      raise exception 'field_trip_store_action_required' using errcode = '42501';
    end if;
    if new.status = 'assigned' then new.assigned_at := now(); new.assigned_by := v_actor; end if;
    if new.status = 'accepted' then new.accepted_at := now(); end if;
    if new.status = 'en_route_customer' or (new.status = 'arrived_store' and old.trip_type = 'drop') then
      new.journey_started_at := coalesce(new.journey_started_at, now());
    end if;
    if new.status in ('arrived_customer','arrived_store') then new.arrived_at := now(); end if;
    if new.status in ('completed','cancelled') then new.completed_at := now(); end if;
    if new.status = 'awaiting_assignment' and old.status = 'assigned' then new.ninja_id := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists field_trips_guard_trg on public.field_trips;
create trigger field_trips_guard_trg before insert or update on public.field_trips
  for each row execute function public.field_trips_guard();

-- 3) Append-only trip events (idempotent) --------------------------------------
create table if not exists public.field_trip_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid,
  job_id           uuid not null,
  trip_id          uuid not null references public.field_trips(id) on delete cascade,
  lead_id          text,
  event_type       text not null,
  previous_status  text,
  new_status       text,
  actor_staff_id   uuid,
  actor_name       text,
  note             text,
  location         jsonb,                 -- {lat,lng,accuracy}
  payload          jsonb,
  idempotency_key  text,
  device_at        timestamptz,           -- device clock (offline queue); never authoritative
  occurred_at      timestamptz not null default now()   -- server receipt time
);
create unique index if not exists field_trip_events_idem_uq
  on public.field_trip_events(trip_id, idempotency_key) where idempotency_key is not null;
create index if not exists field_trip_events_trip_idx on public.field_trip_events(trip_id, occurred_at desc);
create index if not exists field_trip_events_job_idx  on public.field_trip_events(job_id, occurred_at desc);

create or replace function public.field_trips_record_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.auth_staff_id(); v_name text;
begin
  if v_actor is not null then select name into v_name from public.staff where id = v_actor; end if;
  if tg_op = 'INSERT' then
    insert into public.field_trip_events(organization_id, branch_id, job_id, trip_id, lead_id, event_type, new_status, actor_staff_id, actor_name)
    values (new.organization_id, new.branch_id, new.job_id, new.id, new.lead_id, 'created', new.status, v_actor, v_name);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.field_trip_events(organization_id, branch_id, job_id, trip_id, lead_id, event_type, previous_status, new_status, actor_staff_id, actor_name, note)
    values (new.organization_id, new.branch_id, new.job_id, new.id, new.lead_id, 'status_changed', old.status, new.status, v_actor, v_name, new.failure_reason);
  end if;
  return new;
end $$;
drop trigger if exists field_trips_events_trg on public.field_trips;
create trigger field_trips_events_trg after insert or update on public.field_trips
  for each row execute function public.field_trips_record_events();

-- 4) Assignment history (append-only) ------------------------------------------
create table if not exists public.field_assignments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid,
  trip_id          uuid not null references public.field_trips(id) on delete cascade,
  previous_ninja   uuid,
  ninja_id         uuid not null,
  assigned_by      uuid,
  assigned_at      timestamptz not null default now(),
  reason           text,
  outcome          text not null default 'pending' check (outcome in ('pending','accepted','rejected','reassigned','cancelled')),
  responded_at     timestamptz,
  reject_reason    text
);
create index if not exists field_assignments_trip_idx on public.field_assignments(trip_id, assigned_at desc);
create index if not exists field_assignments_ninja_idx on public.field_assignments(ninja_id, outcome);

create or replace function public.field_trips_record_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'assigned' and old.status is distinct from 'assigned' and new.ninja_id is not null then
    update public.field_assignments set outcome = 'reassigned', responded_at = now()
      where trip_id = new.id and outcome = 'pending';
    insert into public.field_assignments(organization_id, branch_id, trip_id, previous_ninja, ninja_id, assigned_by)
    values (new.organization_id, new.branch_id, new.id, old.ninja_id, new.ninja_id, public.auth_staff_id());
  elsif new.status = 'accepted' and old.status = 'assigned' then
    update public.field_assignments set outcome = 'accepted', responded_at = now()
      where trip_id = new.id and outcome = 'pending';
  elsif new.status = 'awaiting_assignment' and old.status = 'assigned' then
    update public.field_assignments set outcome = 'rejected', responded_at = now(), reject_reason = new.failure_reason
      where trip_id = new.id and outcome = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists field_trips_assignment_trg on public.field_trips;
create trigger field_trips_assignment_trg after update on public.field_trips
  for each row execute function public.field_trips_record_assignment();

-- 5) Tracking sessions + points (ACTIVE trip only) -----------------------------
create table if not exists public.field_tracking_sessions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid,
  trip_id          uuid not null references public.field_trips(id) on delete cascade,
  staff_id         uuid not null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  end_reason       text,
  last_lat         double precision,
  last_lng         double precision,
  last_accuracy    real,
  last_point_at    timestamptz,            -- server time of newest point (freshness source)
  customer_visible boolean not null default true
);
create unique index if not exists field_tracking_one_open_per_trip
  on public.field_tracking_sessions(trip_id) where ended_at is null;
create table if not exists public.field_location_points (
  id              bigserial primary key,
  organization_id uuid not null,
  session_id      uuid not null references public.field_tracking_sessions(id) on delete cascade,
  trip_id         uuid not null,
  staff_id        uuid not null,
  seq             int  not null,
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  accuracy        real,
  speed           real,
  heading         real,
  source          text not null default 'gps',
  device_at       timestamptz,
  received_at     timestamptz not null default now(),
  unique (session_id, seq)
);
create index if not exists field_location_points_trip_idx on public.field_location_points(trip_id, received_at desc);

create or replace function public.field_points_roll_latest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.field_tracking_sessions
     set last_lat = new.lat, last_lng = new.lng, last_accuracy = new.accuracy, last_point_at = new.received_at
   where id = new.session_id and ended_at is null;
  return new;
end $$;
drop trigger if exists field_points_latest_trg on public.field_location_points;
create trigger field_points_latest_trg after insert on public.field_location_points
  for each row execute function public.field_points_roll_latest();

-- Close any open session when the trip leaves an in-motion state.
create or replace function public.field_trips_close_tracking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and new.status not in ('en_route_customer','en_route_store','device_received_by_ninja') then
    update public.field_tracking_sessions
       set ended_at = now(), end_reason = new.status
     where trip_id = new.id and ended_at is null;
  end if;
  return new;
end $$;
drop trigger if exists field_trips_close_tracking_trg on public.field_trips;
create trigger field_trips_close_tracking_trg after update on public.field_trips
  for each row execute function public.field_trips_close_tracking();

-- 6) Chain of custody ----------------------------------------------------------
create table if not exists public.field_handovers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid,
  trip_id          uuid not null references public.field_trips(id) on delete cascade,
  job_id           uuid not null,
  kind             text not null check (kind in ('customer_to_ninja','ninja_to_store','store_to_ninja','ninja_to_customer')),
  from_staff_id    uuid,
  to_staff_id      uuid,
  status           text not null default 'pending' check (status in ('pending','accepted','rejected')),
  device_identity  text,                  -- IMEI / serial verified
  accessories      text,
  condition_notes  text,
  evidence         jsonb,                 -- storage object paths (never data URLs)
  ack_method       text check (ack_method in ('otp','signature','store_confirm')),
  ack_at           timestamptz,
  reject_reason    text,
  created_at       timestamptz not null default now(),
  idempotency_key  text
);
create unique index if not exists field_handovers_idem_uq
  on public.field_handovers(trip_id, idempotency_key) where idempotency_key is not null;
create index if not exists field_handovers_trip_idx on public.field_handovers(trip_id);

-- 7) Public tracking tokens (hash only; read/written by service role only) -----
create table if not exists public.field_tracking_tokens (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  job_id           uuid not null references public.field_jobs(id) on delete cascade,
  token_hash       text not null unique,   -- sha256 hex of the opaque token
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

-- 8) RLS -----------------------------------------------------------------------
alter table public.field_trips             enable row level security;
alter table public.field_trip_events       enable row level security;
alter table public.field_assignments       enable row level security;
alter table public.field_tracking_sessions enable row level security;
alter table public.field_location_points   enable row level security;
alter table public.field_handovers         enable row level security;
alter table public.field_tracking_tokens   enable row level security;  -- no policies => service role only

-- Helper: manager/store scope (mirrors CAP.field.viewAll / manage).
create or replace function public.auth_field_ops_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_has_any(array[
    'manage_field_jobs','field_view_all','assign_ninja','manage_field','receive_store_handoff','full_access']), false);
$$;
grant execute on function public.auth_field_ops_manager() to authenticated;

drop policy if exists field_trips_sel on public.field_trips;
create policy field_trips_sel on public.field_trips for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    ninja_id = public.auth_staff_id()                       -- a Ninja sees only own trips
    or (public.auth_branch_visible(branch_id) and public.auth_field_ops_manager())
    or (public.auth_branch_visible(branch_id) and public.auth_has_any(array['view_field_jobs','manage_sales']) and not public.auth_has_any(array['update_pickup']) )
  ));
drop policy if exists field_trips_ins on public.field_trips;
create policy field_trips_ins on public.field_trips for insert to authenticated with check (
  organization_id = public.auth_org_id() and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['manage_field_jobs','route_leads','manage_field','manage_sales']));
drop policy if exists field_trips_upd on public.field_trips;
create policy field_trips_upd on public.field_trips for update to authenticated using (
  public.auth_member_of_org(organization_id) and (
    ninja_id = public.auth_staff_id()
    or (public.auth_branch_visible(branch_id) and public.auth_field_ops_manager())))
with check (organization_id = public.auth_org_id());   -- transitions enforced by field_trips_guard

drop policy if exists field_trip_events_sel on public.field_trip_events;
create policy field_trip_events_sel on public.field_trip_events for select to authenticated using (
  public.auth_member_of_org(organization_id)
  and exists (select 1 from public.field_trips t where t.id = trip_id));   -- inherits trip RLS
-- Human/offline events only; structural events come from triggers. No update/delete => append-only.
drop policy if exists field_trip_events_ins on public.field_trip_events;
create policy field_trip_events_ins on public.field_trip_events for insert to authenticated with check (
  organization_id = public.auth_org_id()
  and actor_staff_id = public.auth_staff_id()
  and event_type in ('comment','problem_reported','proof_added','offline_sync','communication')
  and exists (select 1 from public.field_trips t where t.id = trip_id));

drop policy if exists field_assignments_sel on public.field_assignments;
create policy field_assignments_sel on public.field_assignments for select to authenticated using (
  public.auth_member_of_org(organization_id) and exists (select 1 from public.field_trips t where t.id = trip_id));

drop policy if exists field_tracking_sessions_sel on public.field_tracking_sessions;
create policy field_tracking_sessions_sel on public.field_tracking_sessions for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    staff_id = public.auth_staff_id()
    or (public.auth_branch_visible(branch_id) and public.auth_field_ops_manager())));
drop policy if exists field_tracking_sessions_ins on public.field_tracking_sessions;
create policy field_tracking_sessions_ins on public.field_tracking_sessions for insert to authenticated with check (
  organization_id = public.auth_org_id() and staff_id = public.auth_staff_id()
  and exists (select 1 from public.field_trips t where t.id = trip_id and t.ninja_id = public.auth_staff_id()
              and t.status in ('en_route_customer','en_route_store','device_received_by_ninja')));
drop policy if exists field_tracking_sessions_upd on public.field_tracking_sessions;
create policy field_tracking_sessions_upd on public.field_tracking_sessions for update to authenticated
  using (staff_id = public.auth_staff_id()) with check (staff_id = public.auth_staff_id());

drop policy if exists field_location_points_sel on public.field_location_points;
create policy field_location_points_sel on public.field_location_points for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    staff_id = public.auth_staff_id() or public.auth_field_ops_manager()));
drop policy if exists field_location_points_ins on public.field_location_points;
create policy field_location_points_ins on public.field_location_points for insert to authenticated with check (
  organization_id = public.auth_org_id() and staff_id = public.auth_staff_id()
  and exists (select 1 from public.field_tracking_sessions s
              where s.id = session_id and s.ended_at is null and s.staff_id = public.auth_staff_id()));

drop policy if exists field_handovers_sel on public.field_handovers;
create policy field_handovers_sel on public.field_handovers for select to authenticated using (
  public.auth_member_of_org(organization_id) and exists (select 1 from public.field_trips t where t.id = trip_id));
drop policy if exists field_handovers_ins on public.field_handovers;
create policy field_handovers_ins on public.field_handovers for insert to authenticated with check (
  organization_id = public.auth_org_id() and exists (select 1 from public.field_trips t where t.id = trip_id));
drop policy if exists field_handovers_upd on public.field_handovers;
create policy field_handovers_upd on public.field_handovers for update to authenticated using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['receive_store_handoff','manage_field_jobs','full_access'])
  and public.auth_branch_visible(branch_id));

grant select, insert, update on public.field_trips to authenticated;
grant select, insert on public.field_trip_events, public.field_assignments to authenticated;
grant select, insert, update on public.field_tracking_sessions to authenticated;
grant select, insert on public.field_location_points to authenticated;
grant select, insert, update on public.field_handovers to authenticated;
grant usage, select on sequence public.field_location_points_id_seq to authenticated;

-- 9) Realtime ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['field_trips','field_trip_events','field_tracking_sessions','field_handovers'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when others then
  raise notice 'realtime publication not updated: %', sqlerrm;
end $$;
