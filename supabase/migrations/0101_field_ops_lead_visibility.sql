-- 0101: a Sales Agent who can see a Lead can see that Lead's field job and its
-- trips (status, Ninja, proofs) read-only — so they never have to call the Field
-- Manager. Ninja live location stays restricted (field_tracking_* unchanged).
-- Additive permissive SELECT policies; existing policies are untouched.
drop policy if exists field_jobs_sel_lead on public.field_jobs;
create policy field_jobs_sel_lead on public.field_jobs for select to authenticated using (
  public.auth_member_of_org(organization_id)
  and public.field_try_uuid(lead_id) is not null
  and public.auth_lead_visible(public.field_try_uuid(lead_id)));

create or replace function public.auth_field_job_lead_visible(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.field_jobs j
                  where j.id = p_job and public.field_try_uuid(j.lead_id) is not null
                    and public.auth_lead_visible(public.field_try_uuid(j.lead_id)));
$$;
grant execute on function public.auth_field_job_lead_visible(uuid) to authenticated;

drop policy if exists field_trips_sel_lead on public.field_trips;
create policy field_trips_sel_lead on public.field_trips for select to authenticated using (
  public.auth_member_of_org(organization_id) and public.auth_field_job_lead_visible(job_id));
