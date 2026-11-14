-- 0098_field_ops_rules.sql (additive + idempotent)
--  1) Cancel only before custody: a device that is with the Ninja or the store
--     must finish its handover; it can never be "cancelled" mid-custody.
--  2) Cancelling a DROP trip never cancels the whole service job.
--  3) Ninja is notified when the manager reschedules their trip.
--  4) Live location visibility gated by field_live_location_view (+ dispatch keys).
--     LOCKSTEP with CAP.field.liveLocation in capabilities.ts.

create or replace function public.field_trip_transition_ok(p_type text, p_from text, p_to text)
returns boolean language sql immutable as $$
  select case
    when p_from = p_to then false
    when p_to = 'cancelled' then p_from in (
      'awaiting_assignment','assigned','accepted','en_route_customer','arrived_customer','pickup_in_progress',
      'failed_attempt','customer_unavailable','rescheduled','return_to_store','service_in_progress')
      or (p_type = 'drop' and p_from = 'arrived_store')
    when p_to = 'rescheduled' then p_from in ('awaiting_assignment','assigned','accepted')
    when p_to in ('failed_attempt','customer_unavailable')
      then p_from in ('en_route_customer','arrived_customer','pickup_in_progress','delivery_in_progress','service_in_progress')
    when p_from = 'awaiting_assignment' then p_to = 'assigned'
    when p_from = 'assigned'            then p_to in ('accepted','awaiting_assignment')
    when p_from = 'accepted' and p_to = 'awaiting_assignment' then true
    when p_type in ('pickup','warranty_pickup') then
      (p_from, p_to) in (
        ('accepted','en_route_customer'),('en_route_customer','arrived_customer'),
        ('arrived_customer','pickup_in_progress'),('pickup_in_progress','device_collected'),
        ('device_collected','en_route_store'),('en_route_store','arrived_store'),
        ('arrived_store','handover_pending'),('handover_pending','store_received'),
        ('store_received','completed'),
        ('failed_attempt','awaiting_assignment'),('customer_unavailable','awaiting_assignment'))
    when p_type = 'drop' then
      (p_from, p_to) in (
        ('accepted','arrived_store'),('arrived_store','store_dispatch_confirmed'),
        ('store_dispatch_confirmed','device_received_by_ninja'),('device_received_by_ninja','en_route_customer'),
        ('en_route_customer','arrived_customer'),('arrived_customer','delivery_in_progress'),
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

create or replace function public.field_trip_legacy_status(p_type text, p_status text)
returns text language sql immutable as $$
  select case
    when p_status = 'cancelled' then case when p_type = 'drop' then 'ready_for_drop' else 'cancelled' end
    when p_type in ('pickup','warranty_pickup') then case p_status
      when 'awaiting_assignment' then 'pending_assignment' when 'assigned' then 'assigned'
      when 'accepted' then 'pickup_scheduled'
      when 'en_route_customer' then 'out_for_pickup' when 'arrived_customer' then 'out_for_pickup'
      when 'pickup_in_progress' then 'out_for_pickup'
      when 'device_collected' then 'picked_up' when 'en_route_store' then 'picked_up'
      when 'arrived_store' then 'picked_up' when 'handover_pending' then 'picked_up'
      when 'store_received' then 'at_store' when 'completed' then 'at_store'
      when 'failed_attempt' then 'failed_pickup' when 'customer_unavailable' then 'failed_pickup'
      else null end
    when p_type = 'drop' then case p_status
      when 'awaiting_assignment' then 'ready_for_drop' when 'assigned' then 'ready_for_drop'
      when 'accepted' then 'drop_scheduled' when 'arrived_store' then 'drop_scheduled'
      when 'store_dispatch_confirmed' then 'drop_scheduled'
      when 'device_received_by_ninja' then 'out_for_drop' when 'en_route_customer' then 'out_for_drop'
      when 'arrived_customer' then 'out_for_drop' when 'delivery_in_progress' then 'out_for_drop'
      when 'delivered' then 'delivered' when 'completed' then 'completed'
      when 'failed_attempt' then 'failed_drop' when 'customer_unavailable' then 'failed_drop'
      when 'return_to_store' then 'ready_for_drop'
      else null end
    when p_type = 'onsite' then case p_status
      when 'awaiting_assignment' then 'pending_assignment' when 'assigned' then 'assigned'
      when 'accepted' then 'assigned' when 'en_route_customer' then 'out_for_pickup'
      when 'arrived_customer' then 'out_for_pickup' when 'service_in_progress' then 'in_repair'
      when 'service_completed' then 'in_repair' when 'service_not_completed' then 'in_repair'
      when 'completed' then 'completed'
      else null end
    else null end;
$$;

-- Reschedule notification (status unchanged, scheduled_at moved by someone else).
create or replace function public.field_trips_notify_schedule()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scheduled_at is distinct from old.scheduled_at and new.ninja_id is not null
     and new.ninja_id is distinct from public.auth_staff_id() and new.status = old.status then
    perform public.field_ops_notify(new.organization_id, new.branch_id, new.ninja_id, 'field_trip_update',
      'Trip rescheduled', coalesce(new.trip_no, '') || ' · new time ' || to_char(new.scheduled_at at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM'),
      '/ninja/trip/' || new.id, new.trip_no, 'ft:' || new.id::text || ':sched:' || floor(extract(epoch from clock_timestamp()))::text);
  end if;
  return new;
end $$;
drop trigger if exists field_trips_notify_schedule_trg on public.field_trips;
create trigger field_trips_notify_schedule_trg after update of scheduled_at on public.field_trips
  for each row execute function public.field_trips_notify_schedule();

-- Live location viewer (LOCKSTEP with CAP.field.liveLocation).
create or replace function public.auth_field_location_viewer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_has_any(array['field_live_location_view','manage_field_jobs','assign_ninja','field_view_all','full_access']), false);
$$;
grant execute on function public.auth_field_location_viewer() to authenticated;

drop policy if exists field_tracking_sessions_sel on public.field_tracking_sessions;
create policy field_tracking_sessions_sel on public.field_tracking_sessions for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    staff_id = public.auth_staff_id()
    or (public.auth_branch_visible(branch_id) and public.auth_field_location_viewer())));
drop policy if exists field_location_points_sel on public.field_location_points;
create policy field_location_points_sel on public.field_location_points for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    staff_id = public.auth_staff_id()
    or (public.auth_field_location_viewer()
        and exists (select 1 from public.field_tracking_sessions s where s.id = session_id and public.auth_branch_visible(s.branch_id)))));

-- Location retention: raw GPS points older than 90 days can be purged by the service role.
create or replace function public.field_purge_old_points(p_days int default 90) returns bigint
language sql security definer set search_path = public as $$
  with d as (delete from public.field_location_points where received_at < now() - make_interval(days => p_days) returning 1)
  select count(*) from d;
$$;
revoke all on function public.field_purge_old_points(int) from public, authenticated;
