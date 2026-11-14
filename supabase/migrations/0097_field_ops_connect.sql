-- 0097_field_ops_connect.sql
-- Connects the Ninja trip model to the rest of RepairOX (additive + idempotent):
--   1) Ninja-only users see only field_jobs they are assigned to (was: whole branch).
--   2) DB-owned, cross-user notifications for every trip milestone (notifications table),
--      addressed to real staff ids (no role FK dependency).
--   3) Legacy Field UI -> trips sync (assign ninja, cancel, ticket link, ready-for-drop
--      auto-creates the Drop trip).
--   4) Ticket status 'repaired' on a field ticket => field job ready_for_drop => Drop trip.
--   5) Backfill trips for open legacy jobs created before 0093.

-- 1) Ninja visibility on field_jobs ---------------------------------------------
create or replace function public.auth_is_field_ninja() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_has_any(array['update_pickup','update_drop']), false)
     and not coalesce(public.auth_has_any(array[
       'manage_field_jobs','field_view_all','assign_ninja','manage_field','manage_repair_jobs',
       'update_repair_status','manage_sales','view_field_reports','receive_store_handoff','full_access']), false);
$$;
grant execute on function public.auth_is_field_ninja() to authenticated;

drop policy if exists field_jobs_sel on public.field_jobs;
create policy field_jobs_sel on public.field_jobs
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array[
      'manage_repair_jobs','update_repair_status','manage_field','view_only','manage_sales',
      'view_field_jobs','manage_field_jobs','field_view_all','view_field_reports','update_pickup','update_drop'])
    and (
      not public.auth_is_field_ninja()
      or ninja_id = public.auth_staff_id()::text
      or drop_ninja_id = public.auth_staff_id()::text
      or exists (select 1 from public.field_trips t where t.job_id = field_jobs.id and t.ninja_id = public.auth_staff_id())
    )
  );

-- 2) Notifications --------------------------------------------------------------
create or replace function public.field_ops_notify(
  p_org uuid, p_branch uuid, p_to uuid, p_kind text, p_title text, p_body text, p_href text, p_ref text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_to is null then return; end if;
  insert into public.notifications(organization_id, branch_id, kind, title, body, recipient_id, href, reference, dedupe_key)
  values (p_org, p_branch, p_kind, p_title, p_body, p_to, p_href, p_ref, p_key || ':' || p_to::text)
  on conflict do nothing;
exception when others then
  raise notice 'field_ops_notify skipped: %', sqlerrm;   -- a notification must never block an operation
end $$;

-- Field managers for a store: active staff whose role can dispatch, scoped to the branch
-- (or cross-store via multi_store_access / full_access).
create or replace function public.field_ops_staff_with(p_org uuid, p_branch uuid, p_keys text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct s.id
    from public.staff s
    join public.role_permissions rp on rp.role_id = s.role_id
   where s.organization_id = p_org
     and coalesce(s.status, 'active') = 'active'
     and rp.permission_key = any (p_keys || array['full_access','*'])
     and (p_branch is null or s.branch_id = p_branch
          or exists (select 1 from public.role_permissions r2 where r2.role_id = s.role_id and r2.permission_key in ('multi_store_access','full_access','*'))
          or exists (select 1 from public.user_stores us where us.staff_id = s.id and us.branch_id = p_branch and coalesce(us.status,'active') = 'active'))
   limit 30;
$$;

create or replace function public.field_try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  if p is null or p !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return p::uuid;
end $$;

create or replace function public.field_trips_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j        record;
  v_actor  uuid := public.auth_staff_id();
  v_ninja  text;
  v_type   text := case new.trip_type when 'pickup' then 'Pickup' when 'drop' then 'Drop' when 'onsite' then 'On-Site' else 'Warranty pickup' end;
  v_key    text := 'ft:' || new.id::text || ':' || new.status || ':' || floor(extract(epoch from clock_timestamp()))::text;
  v_who    text;
  v_mgr    uuid;
  v_sales  uuid;
  v_fm     uuid;
  v_label  text;
begin
  select job_no, customer, device, sales_person_id, field_manager_id into j from public.field_jobs where id = new.job_id;
  v_who := coalesce(j.customer, 'Customer') || coalesce(' · ' || j.device, '');
  v_sales := public.field_try_uuid(j.sales_person_id);
  v_fm := public.field_try_uuid(j.field_manager_id);
  if new.ninja_id is not null then select name into v_ninja from public.staff where id = new.ninja_id; end if;

  if tg_op = 'INSERT' then
    for v_mgr in select * from public.field_ops_staff_with(new.organization_id, new.branch_id, array['manage_field_jobs','assign_ninja']) loop
      perform public.field_ops_notify(new.organization_id, new.branch_id, v_mgr, 'field_new_job',
        'New ' || lower(v_type) || ' trip to assign', coalesce(new.trip_no,'') || ' · ' || v_who, '/field/dispatch', new.trip_no, v_key);
    end loop;
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  -- Ninja-facing
  if new.status = 'assigned' then
    perform public.field_ops_notify(new.organization_id, new.branch_id, new.ninja_id, 'field_trip_assigned',
      'New ' || lower(v_type) || ' assignment', coalesce(new.trip_no,'') || ' · ' || v_who, '/ninja/trip/' || new.id, new.trip_no, v_key);
  elsif new.status = 'store_dispatch_confirmed' then
    perform public.field_ops_notify(new.organization_id, new.branch_id, new.ninja_id, 'field_trip_released',
      'Device released by the store', coalesce(new.trip_no,'') || ' · confirm you received it', '/ninja/trip/' || new.id, new.trip_no, v_key);
  elsif new.status = 'cancelled' and new.ninja_id is not null and new.ninja_id is distinct from v_actor then
    perform public.field_ops_notify(new.organization_id, new.branch_id, new.ninja_id, 'field_trip_cancelled',
      'Trip cancelled', coalesce(new.trip_no,'') || ' · ' || v_who, '/ninja/jobs?tab=history', new.trip_no, v_key);
  elsif new.status = 'awaiting_assignment' and old.ninja_id is not null and old.ninja_id is distinct from v_actor then
    perform public.field_ops_notify(new.organization_id, new.branch_id, old.ninja_id, 'field_trip_unassigned',
      'Trip reassigned', coalesce(new.trip_no,'') || ' was moved off your list by the manager.', '/ninja/jobs', new.trip_no, v_key);
  end if;

  -- Manager-facing
  v_label := case new.status
    when 'accepted' then coalesce(v_ninja, 'Ninja') || ' accepted ' || coalesce(new.trip_no, 'the trip')
    when 'awaiting_assignment' then case when old.status in ('assigned','accepted') and old.ninja_id is not distinct from v_actor
                                         then 'Trip rejected: ' || coalesce(new.failure_reason, 'no reason') else null end
    when 'device_collected' then 'Device collected · ' || coalesce(new.trip_no, '')
    when 'handover_pending' then 'Device waiting at store reception · ' || coalesce(new.trip_no, '')
    when 'store_received' then 'Store received device · ' || coalesce(new.trip_no, '')
    when 'delivered' then 'Delivered to customer · ' || coalesce(new.trip_no, '')
    when 'service_completed' then 'On-site service completed · ' || coalesce(new.trip_no, '')
    when 'service_not_completed' then 'On-site service NOT completed · ' || coalesce(new.trip_no, '')
    when 'failed_attempt' then 'Failed attempt: ' || coalesce(new.failure_reason, '') || ' · ' || coalesce(new.trip_no, '')
    when 'customer_unavailable' then 'Customer unavailable · ' || coalesce(new.trip_no, '')
    when 'rescheduled' then 'Reschedule requested · ' || coalesce(new.trip_no, '')
    else null end;
  if v_label is not null then
    if v_fm is not null then
      perform public.field_ops_notify(new.organization_id, new.branch_id, v_fm, 'field_trip_update', v_label, v_who, '/field/dispatch', new.trip_no, v_key);
    else
      for v_mgr in select * from public.field_ops_staff_with(new.organization_id, new.branch_id, array['manage_field_jobs','assign_ninja']) loop
        perform public.field_ops_notify(new.organization_id, new.branch_id, v_mgr, 'field_trip_update', v_label, v_who, '/field/dispatch', new.trip_no, v_key);
      end loop;
    end if;
  end if;

  -- Store reception
  if new.status = 'handover_pending' then
    for v_mgr in select * from public.field_ops_staff_with(new.organization_id, new.branch_id, array['receive_store_handoff']) loop
      perform public.field_ops_notify(new.organization_id, new.branch_id, v_mgr, 'device_received',
        'Incoming device to verify', coalesce(new.trip_no,'') || ' · ' || v_who, '/field/dispatch', new.trip_no, v_key || ':rx');
    end loop;
  end if;

  -- Sales Agent who routed the lead: customer-journey milestones only
  if new.status in ('device_collected','store_received','delivered','service_completed','failed_attempt','customer_unavailable') then
    perform public.field_ops_notify(new.organization_id, new.branch_id, v_sales, 'field_trip_update',
      coalesce(v_label, initcap(replace(new.status, '_', ' '))), v_who, '/field/' || new.job_id, new.trip_no, v_key || ':sa');
  end if;
  return new;
end $$;
drop trigger if exists field_trips_notify_trg on public.field_trips;
create trigger field_trips_notify_trg after insert or update on public.field_trips
  for each row execute function public.field_trips_notify();

-- Problems reported from the Ninja app -> managers.
create or replace function public.field_trip_events_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mgr uuid; t record;
begin
  if new.event_type <> 'problem_reported' then return new; end if;
  select trip_no, branch_id, organization_id into t from public.field_trips where id = new.trip_id;
  for v_mgr in select * from public.field_ops_staff_with(t.organization_id, t.branch_id, array['manage_field_jobs','assign_ninja']) loop
    perform public.field_ops_notify(t.organization_id, t.branch_id, v_mgr, 'field_trip_problem',
      'Problem reported · ' || coalesce(t.trip_no, ''), coalesce(new.actor_name || ': ', '') || coalesce(new.note, ''), '/field/dispatch', t.trip_no, 'fte:' || new.id::text);
  end loop;
  return new;
end $$;
drop trigger if exists field_trip_events_notify_trg on public.field_trip_events;
create trigger field_trip_events_notify_trg after insert on public.field_trip_events
  for each row execute function public.field_trip_events_notify();

-- actor_name on Ninja-written events (client must not forge it).
create or replace function public.field_trip_events_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actor_staff_id is not null and new.actor_name is null then
    select name into new.actor_name from public.staff where id = new.actor_staff_id;
  end if;
  return new;
end $$;
drop trigger if exists field_trip_events_stamp_trg on public.field_trip_events;
create trigger field_trip_events_stamp_trg before insert on public.field_trip_events
  for each row execute function public.field_trip_events_stamp();

-- 3) Legacy Field UI -> trips ----------------------------------------------------
create or replace function public.field_jobs_sync_trips()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n uuid; v_d uuid;
begin
  -- Ticket / invoice link always flows down to the trips.
  if new.linked_ticket_id is distinct from old.linked_ticket_id or new.linked_invoice_id is distinct from old.linked_invoice_id then
    update public.field_trips set ticket_id = nullif(new.linked_ticket_id, ''), invoice_id = nullif(new.linked_invoice_id, '')
     where job_id = new.id;
  end if;

  -- Repair done => one Drop trip (any writer, any depth).
  if new.status = 'ready_for_drop' and old.status is distinct from 'ready_for_drop'
     and new.lead_type in ('pickup','warranty_pickup','drop')
     and not exists (select 1 from public.field_trips t where t.job_id = new.id and t.trip_type = 'drop'
                     and t.status not in ('completed','cancelled','failed_attempt','rescheduled','return_to_store')) then
    insert into public.field_trips(organization_id, branch_id, job_id, trip_type, lead_id, customer_id,
                                   dest_address, dest_lat, dest_lng, dest_maps_url, instructions, client_request_id)
    values (new.organization_id, new.branch_id, new.id, 'drop', new.lead_id, new.customer_id,
            coalesce(nullif(new.drop_address,''), new.pickup_address), coalesce(new.drop_lat, new.location_lat),
            coalesce(new.drop_lng, new.location_lng), coalesce(nullif(new.drop_maps_url,''), new.location_maps_url),
            new.location_instructions, 'drop-auto-' || new.id::text || '-' || floor(extract(epoch from clock_timestamp()))::text)
    on conflict do nothing;
  end if;

  -- Below: only DIRECT edits from the legacy Field UI (depth 1); mirror writes from trips are depth >= 2.
  if pg_trigger_depth() > 1 then return new; end if;

  begin
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      update public.field_trips set status = 'cancelled', failure_reason = coalesce(failure_reason, 'Field job cancelled')
       where job_id = new.id and status not in ('completed','cancelled','delivered');
    end if;
    v_n := public.field_try_uuid(new.ninja_id);
    if v_n is not null and new.ninja_id is distinct from old.ninja_id then
      update public.field_trips set status = 'assigned', ninja_id = v_n
       where job_id = new.id and trip_type <> 'drop' and status = 'awaiting_assignment';
    end if;
    v_d := public.field_try_uuid(new.drop_ninja_id);
    if v_d is not null and new.drop_ninja_id is distinct from old.drop_ninja_id then
      update public.field_trips set status = 'assigned', ninja_id = v_d
       where job_id = new.id and trip_type = 'drop' and status = 'awaiting_assignment';
    end if;
  exception when others then
    raise notice 'legacy->trip sync skipped: %', sqlerrm;   -- never break the legacy Field UI
  end;
  return new;
end $$;
drop trigger if exists field_jobs_sync_trips_trg on public.field_jobs;
create trigger field_jobs_sync_trips_trg after update on public.field_jobs
  for each row execute function public.field_jobs_sync_trips();

-- 4) Ticket repaired => field job ready for drop ---------------------------------
create or replace function public.tickets_field_ready()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'repaired' and old.status is distinct from 'repaired' then
    update public.field_jobs set status = 'ready_for_drop', updated_at = now()
     where linked_ticket_id = new.id and deleted_at is null
       and status in ('at_store','in_repair','picked_up')
       and lead_type in ('pickup','warranty_pickup');
  end if;
  return new;
exception when others then
  raise notice 'tickets_field_ready skipped: %', sqlerrm;
  return new;
end $$;
drop trigger if exists tickets_field_ready_trg on public.tickets;
create trigger tickets_field_ready_trg after update of status on public.tickets
  for each row execute function public.tickets_field_ready();

-- 5) Backfill trips for open legacy jobs -----------------------------------------
insert into public.field_trips(organization_id, branch_id, job_id, trip_type, status, ninja_id, assigned_at, lead_id, customer_id,
                               scheduled_at, scheduled_window, dest_address, dest_lat, dest_lng, dest_maps_url, instructions, client_request_id)
select j.organization_id, j.branch_id, j.id,
       x.ttype,
       case
         when j.status in ('pending_assignment','ready_for_drop') or n.id is null then 'awaiting_assignment'
         when j.status in ('assigned','drop_scheduled') then 'assigned'
         when j.status = 'pickup_scheduled' then 'accepted'
         when j.status in ('out_for_pickup','out_for_drop') then 'en_route_customer'
       end,
       case when j.status in ('pending_assignment','ready_for_drop') then null else n.id end,
       case when n.id is not null and j.status not in ('pending_assignment','ready_for_drop') then coalesce(j.assigned_at, j.updated_at) end,
       j.lead_id, j.customer_id,
       case when x.ttype = 'drop' then null
            when j.pickup_date is not null then (j.pickup_date::text || ' ' || coalesce(nullif(j.pickup_time,''),'09:00'))::timestamp at time zone 'Asia/Kolkata' end,
       j.preferred_window,
       case when x.ttype = 'drop' then coalesce(nullif(j.drop_address,''), j.pickup_address) else j.pickup_address end,
       case when x.ttype = 'drop' then coalesce(j.drop_lat, j.location_lat) else j.location_lat end,
       case when x.ttype = 'drop' then coalesce(j.drop_lng, j.location_lng) else j.location_lng end,
       case when x.ttype = 'drop' then coalesce(nullif(j.drop_maps_url,''), j.location_maps_url) else j.location_maps_url end,
       j.location_instructions,
       'backfill-' || j.id::text
  from public.field_jobs j
  cross join lateral (select case
      when j.status in ('ready_for_drop','drop_scheduled','out_for_drop') or j.lead_type = 'drop' then 'drop'
      when j.lead_type in ('onsite','warranty_onsite') then 'onsite'
      when j.lead_type = 'warranty_pickup' then 'warranty_pickup'
      else 'pickup' end as ttype) x
  left join public.staff n on n.id = public.field_try_uuid(case when x.ttype = 'drop' then j.drop_ninja_id else j.ninja_id end)
 where j.deleted_at is null
   and j.status in ('pending_assignment','assigned','pickup_scheduled','out_for_pickup','ready_for_drop','drop_scheduled','out_for_drop')
   and not exists (select 1 from public.field_trips t where t.job_id = j.id)
on conflict do nothing;

insert into public.field_assignments(organization_id, branch_id, trip_id, ninja_id, assigned_at, outcome, reason)
select t.organization_id, t.branch_id, t.id, t.ninja_id, coalesce(t.assigned_at, t.created_at),
       case when t.status = 'assigned' then 'pending' else 'accepted' end, 'Backfilled from legacy field job'
  from public.field_trips t
 where t.client_request_id like 'backfill-%' and t.ninja_id is not null
   and not exists (select 1 from public.field_assignments a where a.trip_id = t.id);

-- Notifications realtime (already published in 0025 in most installs).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then raise notice 'publication: %', sqlerrm;
end $$;
