-- 0105: per-assignment accept deadline (field manager override of the org default).
--   field_trips.accept_deadline_at NULL  => deadline = assigned_at + org default window
--   field_trips.accept_deadline_at SET   => that exact moment (manager chose "N minutes from now")
-- Manager-only, only while the trip is still 'assigned' (not yet accepted); cleared whenever the
-- trip is (re)assigned so a new Ninja gets the standard window. Audited as a trip event.
alter table public.field_trips add column if not exists accept_deadline_at timestamptz;

create or replace function public.field_trips_accept_deadline()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.auth_staff_id(); v_mgr boolean;
begin
  if tg_op = 'UPDATE' then
    -- a fresh (re)assignment starts from the default window again
    if new.status = 'assigned' and old.status is distinct from 'assigned' then
      new.accept_deadline_at := null;
      return new;
    end if;
    if new.status is distinct from 'assigned' and new.accept_deadline_at is not null and old.status = 'assigned' then
      null;  -- keep the value as history once accepted / closed
    end if;
    if new.accept_deadline_at is distinct from old.accept_deadline_at then
      if v_actor is not null then
        v_mgr := coalesce(public.auth_has_any(array['manage_field_jobs','assign_ninja','manage_field','full_access']), false);
        if not v_mgr then raise exception 'field_trip_fields_manager_only' using errcode = '42501'; end if;
      end if;
      if new.status <> 'assigned' then
        raise exception 'field_trip_accept_deadline_not_assigned' using errcode = '23514';
      end if;
      insert into public.field_trip_events(organization_id, branch_id, job_id, trip_id, lead_id, event_type, actor_staff_id, actor_name, note, payload)
      values (new.organization_id, new.branch_id, new.job_id, new.id, new.lead_id, 'accept_time_changed', v_actor,
              (select name from public.staff where id = v_actor),
              case when new.accept_deadline_at is null then 'Accept time reset to default'
                   else 'Accept deadline set to ' || to_char(new.accept_deadline_at at time zone 'Asia/Kolkata', 'DD Mon HH12:MI AM') end,
              jsonb_build_object('accept_deadline_at', new.accept_deadline_at));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists field_trips_accept_deadline_trg on public.field_trips;
create trigger field_trips_accept_deadline_trg before update on public.field_trips
  for each row execute function public.field_trips_accept_deadline();
