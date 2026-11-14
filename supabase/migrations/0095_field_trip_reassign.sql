-- 0095: manager reassign after acceptance + correct reject vs reassign outcome
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
    when p_from = 'assigned'            then p_to in ('accepted','awaiting_assignment')  -- reject / manager unassign
    when p_from = 'accepted' and p_to = 'awaiting_assignment' then true               -- manager reassign after acceptance
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
    if new.status = 'awaiting_assignment' and old.status in ('assigned','accepted') then new.ninja_id := null; end if;
  end if;
  return new;
end $$;

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
  elsif new.status = 'awaiting_assignment' and old.status in ('assigned','accepted') then
    update public.field_assignments
       set outcome = case when public.auth_staff_id() is not distinct from old.ninja_id then 'rejected' else 'reassigned' end,
           responded_at = now(),
           reject_reason = case when public.auth_staff_id() is not distinct from old.ninja_id then new.failure_reason else null end
     where trip_id = new.id and outcome in ('pending','accepted');
  end if;
  return new;
end $$;
