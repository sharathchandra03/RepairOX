-- 0099_field_ops_hardening.sql (additive + idempotent)
--  1) A Ninja keeps read access to trips they were assigned to (needed so a
--     reject/unassign UPDATE passes the SELECT check on the new row, and gives
--     the Ninja their own rejected/cancelled history).
--  2) Assignment requires an ELIGIBLE Ninja: active, same org, authorised for the
--     trip's store (home store, active user_stores grant, or multi-store role).
--  3) A Ninja can only change status / reason on their trip, never manager fields.
--  4) Recipient-targeted field notifications are org-wide (branch_id NULL) so a
--     multi-store Ninja/manager always sees their own notification.

create or replace function public.field_ninja_eligible(p_staff uuid, p_org uuid, p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
     where s.id = p_staff and s.organization_id = p_org and coalesce(s.status,'active') = 'active'
       and exists (select 1 from public.role_permissions rp where rp.role_id = s.role_id
                    and rp.permission_key in ('update_pickup','update_drop','manage_field_jobs','full_access','*'))
       and (p_branch is null or s.branch_id = p_branch
            or exists (select 1 from public.user_stores us where us.staff_id = s.id and us.branch_id = p_branch and coalesce(us.status,'active') = 'active')
            or exists (select 1 from public.role_permissions r2 where r2.role_id = s.role_id and r2.permission_key in ('multi_store_access','full_access','*'))));
$$;
grant execute on function public.field_ninja_eligible(uuid, uuid, uuid) to authenticated;

create or replace function public.auth_field_was_assigned(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.field_assignments a where a.trip_id = p_trip and a.ninja_id = public.auth_staff_id());
$$;
grant execute on function public.auth_field_was_assigned(uuid) to authenticated;

drop policy if exists field_trips_sel on public.field_trips;
create policy field_trips_sel on public.field_trips for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    ninja_id = public.auth_staff_id()
    or public.auth_field_was_assigned(id)
    or (public.auth_branch_visible(branch_id) and public.auth_field_ops_manager())
    or (public.auth_branch_visible(branch_id) and public.auth_has_any(array['view_field_jobs','manage_sales']) and not public.auth_is_field_ninja())
  ));

create or replace function public.field_ops_notify(
  p_org uuid, p_branch uuid, p_to uuid, p_kind text, p_title text, p_body text, p_href text, p_ref text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_to is null then return; end if;
  insert into public.notifications(organization_id, branch_id, kind, title, body, recipient_id, href, reference, dedupe_key)
  values (p_org, null, p_kind, p_title, p_body, p_to, p_href, p_ref, p_key || ':' || p_to::text)
  on conflict do nothing;
exception when others then
  raise notice 'field_ops_notify skipped: %', sqlerrm;
end $$;

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
  -- A Ninja may only move status (+ give a reason). Everything else is manager data.
  if not v_mgr and (
       new.branch_id is distinct from old.branch_id or new.lead_id is distinct from old.lead_id
    or new.customer_id is distinct from old.customer_id or new.scheduled_at is distinct from old.scheduled_at
    or new.scheduled_window is distinct from old.scheduled_window or new.dest_address is distinct from old.dest_address
    or new.dest_lat is distinct from old.dest_lat or new.dest_lng is distinct from old.dest_lng
    or new.dest_maps_url is distinct from old.dest_maps_url or new.instructions is distinct from old.instructions
    or new.ticket_id is distinct from old.ticket_id or new.invoice_id is distinct from old.invoice_id) then
    raise exception 'field_trip_fields_manager_only' using errcode = '42501';
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
    if new.status = 'assigned' then
      if not public.field_ninja_eligible(new.ninja_id, new.organization_id, new.branch_id) then
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
drop trigger if exists field_trips_guard_trg on public.field_trips;
create trigger field_trips_guard_trg before insert or update on public.field_trips
  for each row execute function public.field_trips_guard();
