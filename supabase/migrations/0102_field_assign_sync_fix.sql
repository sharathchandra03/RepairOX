-- 0102: legacy Field UI assignment -> Ninja trips (fixes "assigned but not in the Ninja app")
-- Gaps fixed:
--   (a) a job INSERTED with a Ninja chosen (New Field Assignment form) left its auto-created trip
--       'awaiting_assignment' with no Ninja;
--   (b) re-assigning a job that already had a Ninja did not move the open trip (it only handled
--       trips still 'awaiting_assignment');
--   (c) the drop Ninja had the same two gaps.
-- Additive + idempotent: replaces one function, adds one trigger, repairs mismatched open trips.
create or replace function public.field_assign_open_trip(p_job uuid, p_drop boolean, p_ninja uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if p_ninja is null then return; end if;
  for t in select id, status, ninja_id from public.field_trips
            where job_id = p_job
              and ((p_drop and trip_type = 'drop') or (not p_drop and trip_type <> 'drop'))
              and status in ('awaiting_assignment','assigned','accepted')
            order by created_at desc limit 1 loop
    if t.status in ('assigned','accepted') then
      if t.ninja_id = p_ninja then continue; end if;
      update public.field_trips set status = 'awaiting_assignment' where id = t.id;   -- manager reassign (guard clears ninja)
    end if;
    update public.field_trips set status = 'assigned', ninja_id = p_ninja where id = t.id;
  end loop;
end $$;

create or replace function public.field_jobs_sync_trips()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n uuid; v_d uuid;
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
  -- Only DIRECT edits from the legacy Field UI (depth 1); mirror writes from trips are depth >= 2.
  if pg_trigger_depth() > 1 then return new; end if;
  begin
    if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      update public.field_trips set status = 'cancelled', failure_reason = coalesce(failure_reason, 'Field job cancelled')
       where job_id = new.id and status not in ('completed','cancelled','delivered');
    end if;
    v_n := public.field_try_uuid(new.ninja_id);
    if v_n is not null and (tg_op = 'INSERT' or new.ninja_id is distinct from old.ninja_id) then
      perform public.field_assign_open_trip(new.id, false, v_n);
    end if;
    v_d := public.field_try_uuid(new.drop_ninja_id);
    if v_d is not null and (tg_op = 'INSERT' or new.drop_ninja_id is distinct from old.drop_ninja_id) then
      perform public.field_assign_open_trip(new.id, true, v_d);
    end if;
  exception when others then
    raise notice 'legacy->trip sync skipped: %', sqlerrm;   -- never break the legacy Field UI
  end;
  return new;
end $$;

drop trigger if exists field_jobs_sync_trips_trg on public.field_jobs;
create trigger field_jobs_sync_trips_trg after update on public.field_jobs
  for each row execute function public.field_jobs_sync_trips();
-- Name sorts after field_jobs_create_trip_trg, so the first trip already exists when this runs.
drop trigger if exists field_jobs_sync_trips_ins_trg on public.field_jobs;
create trigger field_jobs_sync_trips_ins_trg after insert on public.field_jobs
  for each row when (new.ninja_id is not null and new.ninja_id <> '' or new.drop_ninja_id is not null and new.drop_ninja_id <> '')
  execute function public.field_jobs_sync_trips();

-- Repair: open trips whose legacy job already names a different / missing Ninja.
do $$
declare j record;
begin
  for j in select id, ninja_id, drop_ninja_id from public.field_jobs
            where status not in ('completed','cancelled','at_store','delivered','closed') loop
    perform public.field_assign_open_trip(j.id, false, public.field_try_uuid(j.ninja_id));
    perform public.field_assign_open_trip(j.id, true,  public.field_try_uuid(j.drop_ninja_id));
  end loop;
end $$;
