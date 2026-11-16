-- 0103: always stamp assigned_at when the legacy->trip sync assigns a Ninja
-- (the trip guard only stamps it for end-user sessions; the sync can run without one).
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
      update public.field_trips set status = 'awaiting_assignment' where id = t.id;
    end if;
    update public.field_trips set status = 'assigned', ninja_id = p_ninja, assigned_at = now() where id = t.id;
  end loop;
end $$;
-- Repair the two trips the 0102 backfill assigned without a fresh stamp.
update public.field_trips t set assigned_at = now()
  from public.field_jobs j
 where j.id = t.job_id and j.job_no in ('FJ-001','FJ-016') and t.status = 'assigned';
