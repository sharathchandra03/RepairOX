-- 0108: the Field Manager's assignment always lands in the chosen Ninja's bucket.
-- Fixes:
--  (1) Assignment to a Ninja whose home store differs from the trip's store was rejected
--      (field_ninja_not_eligible) and the legacy->trip sync SWALLOWED the error, so the Field
--      table showed the Ninja while the Ninja app never received the trip.
--      Now: a manager may assign any ACTIVE Ninja (field role) of the same organisation, as long
--      as the MANAGER can see the trip's store. Store scope stays enforced on the manager.
--  (2) Re-assigning the SAME Ninja after they rejected, or re-saving the same Ninja, now
--      re-runs the sync (it previously fired only when ninja_id changed).
--  (3) Assignment failures are no longer silent: they raise to the caller (UI shows an error).
--  (4) A Ninja assigned to a trip in another store can read that job (customer, device, address).
--  (5) Repair: open trips whose job names a Ninja chosen AFTER the last rejection are assigned.

create or replace function public.field_ninja_assignable(p_staff uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
     where s.id = p_staff and s.organization_id = p_org and coalesce(s.status,'active') = 'active'
       and exists (select 1 from public.role_permissions rp where rp.role_id = s.role_id
                    and rp.permission_key in ('update_pickup','update_drop','manage_field_jobs','full_access','*')));
$$;
grant execute on function public.field_ninja_assignable(uuid, uuid) to authenticated;

-- Guard: same as 0099/0106 except the assignment eligibility line.
create or replace function public.field_trips_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.auth_staff_id();
  v_seq   int;
  v_job   text;
  v_mgr   boolean;
  v_store boolean;
begin
  if tg_op = 'INSERT' then
    v_job := public.field_trip_job_ref(new.job_id);
    select count(*) + 1 into v_seq from public.field_trips
      where job_id = new.job_id and trip_type = new.trip_type;
    new.trip_no := coalesce(v_job, 'FJ') || '-' ||
      (case new.trip_type when 'pickup' then 'P' when 'drop' then 'D' when 'onsite' then 'O' else 'W' end) || v_seq;
    new.created_by := v_actor;
    if v_actor is not null then new.status := 'awaiting_assignment'; new.ninja_id := null; end if;
    return new;
  end if;
  if v_actor is null then
    new.updated_at := now();
    return new;
  end if;
  v_mgr   := coalesce(public.auth_has_any(array['manage_field_jobs','assign_ninja','manage_field','full_access']), false);
  v_store := coalesce(public.auth_has_any(array['receive_store_handoff','manage_field_jobs','full_access']), false);
  new.updated_at := now();
  if new.job_id is distinct from old.job_id or new.trip_type is distinct from old.trip_type
     or new.organization_id is distinct from old.organization_id or new.trip_no is distinct from old.trip_no then
    raise exception 'field_trip_immutable' using errcode = '42501';
  end if;
  if new.ninja_id is distinct from old.ninja_id and not v_mgr
     and not (new.status = 'awaiting_assignment' and old.ninja_id = v_actor) then
    raise exception 'field_trip_assign_forbidden' using errcode = '42501';
  end if;
  if not v_mgr and (
       new.branch_id is distinct from old.branch_id or new.lead_id is distinct from old.lead_id
    or new.customer_id is distinct from old.customer_id or new.scheduled_at is distinct from old.scheduled_at
    or new.scheduled_window is distinct from old.scheduled_window or new.dest_address is distinct from old.dest_address
    or new.dest_lat is distinct from old.dest_lat or new.dest_lng is distinct from old.dest_lng
    or new.dest_maps_url is distinct from old.dest_maps_url or new.instructions is distinct from old.instructions
    or (coalesce(current_setting('rox.ninja_link', true), '') <> '1' and (new.ticket_id is distinct from old.ticket_id or new.invoice_id is distinct from old.invoice_id))) then
    raise exception 'field_trip_fields_manager_only' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not public.field_trip_transition_ok(old.trip_type, old.status, new.status) then
      raise exception 'field_trip_invalid_transition: % -> %', old.status, new.status using errcode = '23514';
    end if;
    if not v_mgr and old.ninja_id is distinct from v_actor and not (new.status in ('store_received','store_dispatch_confirmed') and v_store) then
      raise exception 'field_trip_not_assignee' using errcode = '42501';
    end if;
    if new.status in ('store_received','store_dispatch_confirmed') and not v_store then
      raise exception 'field_trip_store_action_required' using errcode = '42501';
    end if;
    if new.status = 'assigned' then
      -- Manager's choice wins across stores; the manager must still be able to see the trip's store.
      if not public.field_ninja_assignable(new.ninja_id, new.organization_id)
         or not (new.branch_id is null or public.auth_branch_visible(new.branch_id)) then
        raise exception 'field_ninja_not_eligible' using errcode = '42501';
      end if;
      new.assigned_at := now(); new.assigned_by := v_actor;
    end if;
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

-- Sync: also fire on an explicit (re)assign of the same Ninja; never swallow assignment errors.
create or replace function public.field_jobs_sync_trips()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n uuid; v_d uuid; v_assign boolean; v_dassign boolean;
begin
  if tg_op = 'UPDATE' then
    if new.linked_ticket_id is distinct from old.linked_ticket_id or new.linked_invoice_id is distinct from old.linked_invoice_id then
      update public.field_trips set ticket_id = nullif(new.linked_ticket_id, ''), invoice_id = nullif(new.linked_invoice_id, '')
       where job_id = new.id;
    end if;
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
  end if;
  if pg_trigger_depth() > 1 then return new; end if;

  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    begin
      update public.field_trips set status = 'cancelled', failure_reason = coalesce(failure_reason, 'Field job cancelled')
       where job_id = new.id and status not in ('completed','cancelled','delivered');
    exception when others then raise notice 'legacy->trip cancel skipped: %', sqlerrm;
    end;
  end if;

  v_n := public.field_try_uuid(new.ninja_id);
  v_assign := v_n is not null and (tg_op = 'INSERT' or new.ninja_id is distinct from old.ninja_id
              or (new.status is distinct from old.status and new.status in ('assigned','pickup_scheduled')));
  if v_assign then perform public.field_assign_open_trip(new.id, false, v_n); end if;

  v_d := public.field_try_uuid(new.drop_ninja_id);
  v_dassign := v_d is not null and (tg_op = 'INSERT' or new.drop_ninja_id is distinct from old.drop_ninja_id
               or (new.status is distinct from old.status and new.status = 'drop_scheduled'));
  if v_dassign then perform public.field_assign_open_trip(new.id, true, v_d); end if;
  return new;
end $$;

-- A Ninja reads the jobs they are assigned to, in any store of their organisation.
drop policy if exists field_jobs_sel_ninja on public.field_jobs;
create policy field_jobs_sel_ninja on public.field_jobs for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    ninja_id = public.auth_staff_id()::text or drop_ninja_id = public.auth_staff_id()::text
    or exists (select 1 from public.field_trips t where t.job_id = field_jobs.id and t.ninja_id = public.auth_staff_id())));

-- Repair (service role): job names a Ninja chosen after the trip's last rejection.
do $$
declare r record;
begin
  for r in
    select j.id, j.ninja_id, j.updated_at from public.field_jobs j
     where j.status not in ('completed','cancelled','at_store','delivered','closed') and public.field_try_uuid(j.ninja_id) is not null
       and exists (select 1 from public.field_trips t where t.job_id = j.id and t.trip_type <> 'drop'
                     and t.status in ('awaiting_assignment','assigned','accepted') and t.ninja_id is distinct from public.field_try_uuid(j.ninja_id)
                     and j.updated_at > coalesce((select max(coalesce(a.responded_at, a.assigned_at)) from public.field_assignments a
                                                   where a.trip_id = t.id and a.outcome = 'rejected'), '-infinity'::timestamptz))
  loop
    perform public.field_assign_open_trip(r.id, false, public.field_try_uuid(r.ninja_id));
  end loop;
end $$;
