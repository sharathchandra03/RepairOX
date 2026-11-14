-- 0094: trip numbering for every writer (incl. service role / DB triggers)
create or replace function public.field_trips_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.auth_staff_id();
  v_seq   int;
  v_job   text;
  v_mgr   boolean;
  v_store boolean;
begin
  if tg_op = 'INSERT' then          -- trip numbering applies to every writer
    select job_no into v_job from public.field_jobs where id = new.job_id;
    select count(*) + 1 into v_seq from public.field_trips
      where job_id = new.job_id and trip_type = new.trip_type;
    new.trip_no := coalesce(v_job, 'FJ') || '-' ||
      (case new.trip_type when 'pickup' then 'P' when 'drop' then 'D' when 'onsite' then 'O' else 'W' end) || v_seq;
    new.created_by := v_actor;
    if v_actor is not null then new.status := 'awaiting_assignment'; new.ninja_id := null; end if;
    return new;
  end if;
  if v_actor is null then          -- service-role / no end-user JWT bypasses actor checks
    new.updated_at := now();
    return new;
  end if;
  v_mgr   := coalesce(public.auth_has_any(array['manage_field_jobs','assign_ninja','manage_field','full_access']), false);
  v_store := coalesce(public.auth_has_any(array['receive_store_handoff','manage_field_jobs','full_access']), false);

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
