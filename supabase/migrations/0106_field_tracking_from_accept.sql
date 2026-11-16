-- 0106: (1) live tracking from the moment a Ninja ACCEPTS until the job is handed over;
--       (2) Ninja availability for the assigning manager (duty + trip state, no session internals).
-- Tracking window (mirrors TRACKING_STATUSES in lib/ninja/model.ts — LOCKSTEP): accepted .. in-progress statuses.
-- The public customer tracking API still exposes location ONLY while the trip is travelling.

create or replace function public.field_tracking_status_ok(p_status text) returns boolean
language sql immutable as $$
  select p_status in ('accepted','en_route_customer','arrived_customer','pickup_in_progress','device_collected',
                      'en_route_store','arrived_store','handover_pending','store_dispatch_confirmed',
                      'device_received_by_ninja','delivery_in_progress','service_in_progress');
$$;

drop policy if exists field_tracking_sessions_ins on public.field_tracking_sessions;
create policy field_tracking_sessions_ins on public.field_tracking_sessions for insert to authenticated with check (
  organization_id = public.auth_org_id() and staff_id = public.auth_staff_id()
  and exists (select 1 from public.field_trips t where t.id = trip_id and t.ninja_id = public.auth_staff_id()
              and public.field_tracking_status_ok(t.status)));

create or replace function public.field_trips_close_tracking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and not public.field_tracking_status_ok(new.status) then
    update public.field_tracking_sessions
       set ended_at = now(), end_reason = new.status
     where trip_id = new.id and ended_at is null;
  end if;
  return new;
end $$;

-- Availability of Ninjas for the assigning manager --------------------------------
create or replace function public.field_ninja_availability(p_staff uuid[])
returns table (staff_id uuid, duty text, last_seen_at timestamptz, open_trips int, moving int, on_job int, waiting int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(public.auth_has_any(array['assign_ninja','manage_field_jobs','manage_field','field_view_all','view_field_jobs','full_access']), false) then
    return;
  end if;
  return query
  select s.id,
    case
      when w.id is null or w.last_seen_at < now() - interval '30 minutes' then 'off_duty'
      when exists (select 1 from public.work_session_breaks b where b.session_id = w.id and b.ended_at is null) then 'on_break'
      else 'on_duty' end,
    w.last_seen_at,
    coalesce(t.open_trips, 0)::int, coalesce(t.moving, 0)::int, coalesce(t.on_job, 0)::int, coalesce(t.waiting, 0)::int
  from public.staff s
  left join lateral (select ws.id, ws.last_seen_at from public.work_sessions ws
                      where ws.staff_id = s.id and ws.ended_at is null order by ws.started_at desc limit 1) w on true
  left join lateral (select
      count(*) filter (where ft.status not in ('awaiting_assignment','completed','cancelled','rescheduled','failed_attempt','customer_unavailable','return_to_store','delivered')) as open_trips,
      count(*) filter (where ft.status in ('en_route_customer','en_route_store','device_received_by_ninja')) as moving,
      count(*) filter (where ft.status in ('arrived_customer','pickup_in_progress','arrived_store','handover_pending','delivery_in_progress','service_in_progress')) as on_job,
      count(*) filter (where ft.status = 'assigned') as waiting
    from public.field_trips ft where ft.ninja_id = s.id) t on true
  where s.organization_id = public.auth_org_id()
    and s.id = any(p_staff)
    and (s.branch_id is null or public.auth_branch_visible(s.branch_id));
end $$;
grant execute on function public.field_ninja_availability(uuid[]) to authenticated;
