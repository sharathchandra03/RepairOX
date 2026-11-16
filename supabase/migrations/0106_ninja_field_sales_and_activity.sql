-- 0106_ninja_field_sales_and_activity.sql (additive + idempotent)
--  1) Ninja may create Tickets + Invoices from the field and read Inventory.
--     Narrow by design: only a Ninja-only role (auth_is_field_ninja), only rows the
--     Ninja created themself, never other people's tickets/invoices.
--  2) created_by is stamped by the DB on tickets/invoices (it was client-optional).
--  3) ninja_link_trip_docs(): the ONE legal way a Ninja attaches a ticket/invoice to a
--     trip + its job (trip ticket_id/invoice_id stay manager-only for direct writes).
--  4) ninja_activity_log: append-only footprint of everything a Ninja does in the app
--     (views, filters, calls, navigation, inventory searches, documents) for reporting.
--  5) Reporting views: per-assignment (accept/reject/response time) and per-trip
--     (travel time, distance, service time, documents).

-- 1) Role grants -------------------------------------------------------------------
insert into public.role_permissions(role_id, permission_key)
select 'ninja', k from unnest(array['create_ticket','view_ticket','create_invoice','view_invoice','view_inventory']) k
where exists (select 1 from public.roles where id = 'ninja')
on conflict do nothing;

-- 2) created_by stamping --------------------------------------------------------------
create or replace function public.stamp_created_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null and public.auth_staff_id() is not null then
    new.created_by := public.auth_staff_id();
  end if;
  return new;
end $$;
drop trigger if exists tickets_stamp_created_by on public.tickets;
create trigger tickets_stamp_created_by before insert on public.tickets for each row execute function public.stamp_created_by();
drop trigger if exists invoices_stamp_created_by on public.invoices;
create trigger invoices_stamp_created_by before insert on public.invoices for each row execute function public.stamp_created_by();

-- 3) Ninja document policies (permissive, OR-ed with the existing ones) -----------------
drop policy if exists tickets_ins_field on public.tickets;
create policy tickets_ins_field on public.tickets for insert to authenticated with check (
  organization_id = public.auth_org_id() and public.auth_branch_visible(branch_id)
  and public.auth_is_field_ninja() and public.auth_has_any(array['create_ticket']));
drop policy if exists tickets_upd_field on public.tickets;
create policy tickets_upd_field on public.tickets for update to authenticated
  using (public.auth_member_of_org(organization_id) and created_by = public.auth_staff_id()
         and public.auth_is_field_ninja() and public.auth_has_any(array['create_ticket']))
  with check (organization_id = public.auth_org_id() and created_by = public.auth_staff_id());

drop policy if exists invoices_ins_field on public.invoices;
create policy invoices_ins_field on public.invoices for insert to authenticated with check (
  organization_id = public.auth_org_id() and public.auth_branch_visible(branch_id)
  and public.auth_is_field_ninja() and public.auth_has_any(array['create_invoice']));
drop policy if exists invoices_sel_field on public.invoices;
create policy invoices_sel_field on public.invoices for select to authenticated using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and created_by = public.auth_staff_id() and public.auth_has_any(array['view_invoice','create_invoice']));
drop policy if exists invoices_upd_field on public.invoices;
create policy invoices_upd_field on public.invoices for update to authenticated
  using (public.auth_member_of_org(organization_id) and created_by = public.auth_staff_id()
         and public.auth_is_field_ninja() and public.auth_has_any(array['create_invoice']))
  with check (organization_id = public.auth_org_id() and created_by = public.auth_staff_id());

-- Inventory: explicit read key (the Ninja role no longer relies on the generic view_only).
drop policy if exists inventory_items_sel_field on public.inventory_items;
create policy inventory_items_sel_field on public.inventory_items for select to authenticated using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['view_inventory']));

-- 4) Trip guard: allow ticket_id / invoice_id changes only inside ninja_link_trip_docs() ------
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.field_trips_guard'::regproc);
  if position('rox.ninja_link' in v_def) = 0 then
    v_new := replace(v_def,
      'or new.ticket_id is distinct from old.ticket_id or new.invoice_id is distinct from old.invoice_id) then',
      'or (coalesce(current_setting(''rox.ninja_link'', true), '''') <> ''1'' and (new.ticket_id is distinct from old.ticket_id or new.invoice_id is distinct from old.invoice_id))) then');
    if v_new = v_def then raise exception 'field_trips_guard patch marker not found'; end if;
    execute v_new;
  end if;
end $$;

create or replace function public.ninja_link_trip_docs(p_trip uuid, p_ticket text default null, p_invoice text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.field_trips; me uuid := public.auth_staff_id();
begin
  select * into t from public.field_trips where id = p_trip;
  if t.id is null or me is null or t.ninja_id is distinct from me then
    raise exception 'ninja_link_not_assignee' using errcode = '42501';
  end if;
  if p_ticket is not null and not exists (select 1 from public.tickets x where x.id = p_ticket and x.organization_id = t.organization_id and x.created_by = me) then
    raise exception 'ninja_link_ticket_not_yours' using errcode = '42501';
  end if;
  if p_invoice is not null and not exists (select 1 from public.invoices x where x.id = p_invoice and x.organization_id = t.organization_id and x.created_by = me) then
    raise exception 'ninja_link_invoice_not_yours' using errcode = '42501';
  end if;
  perform set_config('rox.ninja_link', '1', true);
  update public.field_trips set ticket_id = coalesce(p_ticket, ticket_id), invoice_id = coalesce(p_invoice, invoice_id) where id = p_trip;
  update public.field_jobs set linked_ticket_id = coalesce(p_ticket, linked_ticket_id), linked_invoice_id = coalesce(p_invoice, linked_invoice_id) where id = t.job_id;
  perform set_config('rox.ninja_link', '', true);
  insert into public.field_trip_events(organization_id, branch_id, job_id, trip_id, lead_id, event_type, actor_staff_id, actor_name, note, payload)
  select t.organization_id, t.branch_id, t.job_id, t.id, t.lead_id,
         case when p_invoice is not null and p_ticket is null then 'invoice_created' else 'ticket_created' end,
         me, (select name from public.staff where id = me),
         case when p_invoice is not null then 'Invoice ' || p_invoice || ' created in the field' else 'Ticket ' || p_ticket || ' created in the field' end,
         jsonb_build_object('ticket_id', p_ticket, 'invoice_id', p_invoice);
end $$;
grant execute on function public.ninja_link_trip_docs(uuid, text, text) to authenticated;

-- 5) Activity footprint ------------------------------------------------------------------
create table if not exists public.ninja_activity_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid,
  staff_id        uuid not null,
  trip_id         uuid,
  job_id          uuid,
  kind            text not null,
  screen          text,
  payload         jsonb not null default '{}'::jsonb,
  location        jsonb,
  online          boolean,
  device          jsonb,
  occurred_at     timestamptz not null default now(),   -- device clock
  received_at     timestamptz not null default now(),   -- server clock
  idempotency_key text
);
create unique index if not exists ninja_activity_idem on public.ninja_activity_log(staff_id, idempotency_key) where idempotency_key is not null;
create index if not exists ninja_activity_staff_time on public.ninja_activity_log(organization_id, staff_id, occurred_at desc);
create index if not exists ninja_activity_trip on public.ninja_activity_log(trip_id) where trip_id is not null;
create index if not exists ninja_activity_kind on public.ninja_activity_log(organization_id, kind, occurred_at desc);

create or replace function public.ninja_activity_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.auth_staff_id() is not null then
    new.staff_id := public.auth_staff_id();
    new.organization_id := public.auth_org_id();
    if new.branch_id is null then new.branch_id := public.auth_branch_id(); end if;
  end if;
  new.received_at := now();
  if new.occurred_at > now() + interval '5 minutes' then new.occurred_at := now(); end if;  -- bad device clock
  return new;
end $$;
drop trigger if exists ninja_activity_stamp_trg on public.ninja_activity_log;
create trigger ninja_activity_stamp_trg before insert on public.ninja_activity_log for each row execute function public.ninja_activity_stamp();

alter table public.ninja_activity_log enable row level security;
drop policy if exists ninja_activity_ins on public.ninja_activity_log;
create policy ninja_activity_ins on public.ninja_activity_log for insert to authenticated
  with check (staff_id = public.auth_staff_id() and public.auth_member_of_org(organization_id));
drop policy if exists ninja_activity_sel on public.ninja_activity_log;
create policy ninja_activity_sel on public.ninja_activity_log for select to authenticated using (
  public.auth_member_of_org(organization_id) and (
    staff_id = public.auth_staff_id()
    or (public.auth_branch_visible(branch_id) and public.auth_has_any(array['field_view_all','view_field_reports','manage_field_jobs','full_access']))));
-- append-only: no update / delete policy.

-- 6) Reporting views (security_invoker => they obey the caller's RLS) ------------------------
create or replace view public.field_ninja_assignment_stats_v with (security_invoker = true) as
select a.id as assignment_id, a.organization_id, a.branch_id, a.trip_id, a.ninja_id, a.assigned_by,
       a.assigned_at, a.responded_at, a.outcome, a.reject_reason,
       case when a.responded_at is not null then extract(epoch from (a.responded_at - a.assigned_at))::int end as response_seconds,
       t.trip_type, t.trip_no
from public.field_assignments a left join public.field_trips t on t.id = a.trip_id;

create or replace view public.field_ninja_trip_stats_v with (security_invoker = true) as
with seg as (
  select p.trip_id,
         case when lag(p.lat) over w is null then 0 else
           2 * 6371000 * asin(sqrt(least(1,
             power(sin(radians(p.lat - lag(p.lat) over w) / 2), 2)
             + cos(radians(lag(p.lat) over w)) * cos(radians(p.lat)) * power(sin(radians(p.lng - lag(p.lng) over w) / 2), 2)))) end as m
  from public.field_location_points p
  window w as (partition by p.trip_id, p.session_id order by p.seq)
), dist as (select trip_id, round(sum(m))::int as distance_m, count(*) as points from seg group by trip_id)
select t.id as trip_id, t.organization_id, t.branch_id, t.ninja_id, t.trip_type, t.trip_no, t.status,
       t.assigned_at, t.accepted_at, t.journey_started_at, t.arrived_at, t.completed_at,
       case when t.accepted_at is not null and t.assigned_at is not null then extract(epoch from (t.accepted_at - t.assigned_at))::int end as response_seconds,
       case when t.arrived_at is not null and t.journey_started_at is not null then extract(epoch from (t.arrived_at - t.journey_started_at))::int end as travel_seconds,
       case when t.completed_at is not null and t.arrived_at is not null then extract(epoch from (t.completed_at - t.arrived_at))::int end as service_seconds,
       coalesce(d.distance_m, 0) as distance_m, coalesce(d.points, 0) as tracked_points,
       t.ticket_id, t.invoice_id
from public.field_trips t left join dist d on d.trip_id = t.id;

grant select on public.field_ninja_assignment_stats_v, public.field_ninja_trip_stats_v to authenticated;
grant insert, select on public.ninja_activity_log to authenticated;

-- 7) Invoice numbering must see the WHOLE series ------------------------------------------------
-- A Ninja can only read invoices they created, so the client-side "next invoice number" lookup would
-- restart the series and collide. This returns ONLY ids (+ whether soft-deleted) for the caller's org,
-- and only to someone who may raise invoices. Existing roles get the same (complete) answer as before.
create or replace function public.invoice_series_ids(p_type text, p_branch uuid default null)
returns table(id text, deleted boolean)
language sql stable security definer set search_path = public as $$
  select i.id, i.deleted_at is not null
    from public.invoices i
   where i.organization_id = public.auth_org_id()
     and i.invoice_type = p_type
     and (p_branch is null or i.branch_id = p_branch)
     and coalesce(public.auth_has_any(array['create_invoice','manage_invoices','manage_payments','manage_sales','use_pos','full_access']), false)
$$;
grant execute on function public.invoice_series_ids(text, uuid) to authenticated;
