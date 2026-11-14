-- 0093_field_ops_wiring.sql
-- Wires the Field Operations trip model to the existing field_jobs flow:
--   1) every NEW field_job auto-creates its first trip (pickup | drop | onsite)
--   2) trip status/assignee is mirrored back to the legacy field_jobs columns so the
--      existing Field table, Lead table (fieldMilestone) and dashboards keep working
--   3) private `field-proofs` storage bucket (path: <org>/<trip>/<file>), trip-scoped RLS
-- Additive + idempotent. Does NOT backfill historical jobs.

-- 1) Auto-create the first trip ---------------------------------------------------
create or replace function public.field_jobs_create_trip()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_sched timestamptz;
begin
  v_type := case
    when new.lead_type in ('drop') then 'drop'
    when new.lead_type in ('onsite','warranty_onsite') then 'onsite'
    when new.lead_type = 'warranty_pickup' then 'warranty_pickup'
    else 'pickup' end;
  begin
    v_sched := case when new.pickup_date is not null
      then (new.pickup_date::text || ' ' || coalesce(nullif(new.pickup_time,''),'09:00'))::timestamp at time zone 'Asia/Kolkata'
      else null end;
  exception when others then v_sched := null; end;
  insert into public.field_trips(
    organization_id, branch_id, job_id, trip_type, lead_id, customer_id, scheduled_at, scheduled_window,
    dest_address, dest_lat, dest_lng, dest_maps_url, instructions, client_request_id)
  values (
    new.organization_id, new.branch_id, new.id, v_type, new.lead_id, new.customer_id, v_sched, new.preferred_window,
    case when v_type = 'drop' then coalesce(new.drop_address, new.pickup_address) else new.pickup_address end,
    case when v_type = 'drop' then coalesce(new.drop_lat, new.location_lat) else new.location_lat end,
    case when v_type = 'drop' then coalesce(new.drop_lng, new.location_lng) else new.location_lng end,
    case when v_type = 'drop' then coalesce(new.drop_maps_url, new.location_maps_url) else new.location_maps_url end,
    new.location_instructions, 'auto-' || new.id::text)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists field_jobs_create_trip_trg on public.field_jobs;
create trigger field_jobs_create_trip_trg after insert on public.field_jobs
  for each row execute function public.field_jobs_create_trip();

-- 2) Mirror trip -> legacy job columns -------------------------------------------
create or replace function public.field_trip_legacy_status(p_type text, p_status text)
returns text language sql immutable as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when p_type in ('pickup','warranty_pickup') then case p_status
      when 'awaiting_assignment' then 'pending_assignment'
      when 'assigned' then 'assigned'
      when 'accepted' then 'pickup_scheduled'
      when 'en_route_customer' then 'out_for_pickup'
      when 'arrived_customer' then 'out_for_pickup'
      when 'pickup_in_progress' then 'out_for_pickup'
      when 'device_collected' then 'picked_up'
      when 'en_route_store' then 'picked_up'
      when 'arrived_store' then 'picked_up'
      when 'handover_pending' then 'picked_up'
      when 'store_received' then 'at_store'
      when 'completed' then 'at_store'
      when 'failed_attempt' then 'failed_pickup'
      when 'customer_unavailable' then 'failed_pickup'
      else null end
    when p_type = 'drop' then case p_status
      when 'awaiting_assignment' then 'ready_for_drop'
      when 'assigned' then 'ready_for_drop'
      when 'accepted' then 'drop_scheduled'
      when 'arrived_store' then 'drop_scheduled'
      when 'store_dispatch_confirmed' then 'drop_scheduled'
      when 'device_received_by_ninja' then 'out_for_drop'
      when 'en_route_customer' then 'out_for_drop'
      when 'arrived_customer' then 'out_for_drop'
      when 'delivery_in_progress' then 'out_for_drop'
      when 'delivered' then 'delivered'
      when 'completed' then 'completed'
      when 'failed_attempt' then 'failed_drop'
      when 'customer_unavailable' then 'failed_drop'
      else null end
    when p_type = 'onsite' then case p_status
      when 'awaiting_assignment' then 'pending_assignment'
      when 'assigned' then 'assigned'
      when 'accepted' then 'assigned'
      when 'en_route_customer' then 'out_for_pickup'
      when 'arrived_customer' then 'out_for_pickup'
      when 'service_in_progress' then 'in_repair'
      when 'service_completed' then 'in_repair'
      when 'completed' then 'completed'
      else null end
    else null end;
$$;

create or replace function public.field_trips_mirror_job()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_legacy text; v_name text;
begin
  v_legacy := public.field_trip_legacy_status(new.trip_type, new.status);
  if new.ninja_id is distinct from old.ninja_id or tg_op = 'INSERT' then
    select name into v_name from public.staff where id = new.ninja_id;
    if new.trip_type = 'drop' then
      update public.field_jobs set drop_ninja_id = new.ninja_id::text, drop_ninja_name = v_name where id = new.job_id;
    else
      update public.field_jobs set ninja_id = new.ninja_id::text, ninja_name = v_name where id = new.job_id;
    end if;
  end if;
  if tg_op = 'UPDATE' and v_legacy is not null and new.status is distinct from old.status then
    update public.field_jobs set status = v_legacy, updated_at = now() where id = new.job_id and status is distinct from v_legacy;
  end if;
  return new;
end $$;
drop trigger if exists field_trips_mirror_job_trg on public.field_trips;
create trigger field_trips_mirror_job_trg after update on public.field_trips
  for each row execute function public.field_trips_mirror_job();

-- 3) Proof storage ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('field-proofs', 'field-proofs', false)
  on conflict (id) do nothing;
drop policy if exists field_proofs_select on storage.objects;
create policy field_proofs_select on storage.objects for select to authenticated using (
  bucket_id = 'field-proofs'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and exists (select 1 from public.field_trips t where t.id::text = (storage.foldername(name))[2]));
drop policy if exists field_proofs_insert on storage.objects;
create policy field_proofs_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'field-proofs'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and exists (select 1 from public.field_trips t where t.id::text = (storage.foldername(name))[2]));
-- no update/delete policy => proofs are immutable
