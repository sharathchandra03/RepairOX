-- 0100: trip numbers are unique PER JOB (job numbers are only unique per store,
-- and may be null on legacy rows), so an org-wide unique index could silently
-- drop the auto-created trip (on conflict do nothing). Re-scope it.
drop index if exists public.field_trips_trip_no_uq;
create unique index if not exists field_trips_job_trip_no_uq on public.field_trips(job_id, trip_no) where trip_no is not null;

-- Legacy jobs without a job number: number the trip from the job id, never a shared "FJ".
create or replace function public.field_trip_job_ref(p_job uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(j.job_no, ''), 'FJ-' || upper(left(j.id::text, 6))) from public.field_jobs j where j.id = p_job;
$$;

do $$
declare src text;
begin
  select pg_get_functiondef('public.field_trips_guard()'::regprocedure) into src;
  src := replace(src, 'select job_no into v_job from public.field_jobs where id = new.job_id;', 'v_job := public.field_trip_job_ref(new.job_id);');
  execute src;
end $$;

-- Backfill: jobs that lost their auto trip to the old collision get one now.
insert into public.field_trips(organization_id, branch_id, job_id, trip_type, lead_id, customer_id, dest_address, dest_lat, dest_lng, dest_maps_url, instructions, client_request_id)
select j.organization_id, j.branch_id, j.id,
       case when j.lead_type = 'drop' then 'drop' when j.lead_type in ('onsite','warranty_onsite') then 'onsite' when j.lead_type = 'warranty_pickup' then 'warranty_pickup' else 'pickup' end,
       j.lead_id, j.customer_id, j.pickup_address, j.location_lat, j.location_lng, j.location_maps_url, j.location_instructions, 'auto-' || j.id::text
  from public.field_jobs j
 where j.deleted_at is null and j.status in ('pending_assignment','ready_for_drop')
   and not exists (select 1 from public.field_trips t where t.job_id = j.id)
on conflict do nothing;
