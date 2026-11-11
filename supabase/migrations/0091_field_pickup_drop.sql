-- ============================================================================
-- 0091 — Field Management: Pickup & Drop trip foundation.
--
-- Additive + idempotent. Extends the EXISTING field_jobs table (no parallel
-- trip table) and adds:
--   1. Trip detail + canonical service-location columns on field_jobs.
--   2. Server-side, never-reused Trip ID generator  (next_field_job_no RPC +
--      field_job_counters) and a guarded unique (org, branch, job_no) index.
--   3. Idempotency key (client_request_id) so a retried/double-clicked create
--      can never produce two trips.
--   4. field_job_events — APPEND-ONLY trail (status change, ninja assign /
--      reassign, location change, ticket link, communication note). Status /
--      assignment / location / ticket events are written by a DB trigger so
--      they cannot be forged; communication notes are inserted by the app.
--   5. RLS lockstep with the granular Field permission keys (the 0021 policies
--      only knew the coarse keys, so e.g. a Ninja holding just update_pickup
--      could not even read their jobs).
--
-- It does NOT touch the status enum, the transition map or any Lead column:
-- the Lead keeps reflecting field status through the live derivation
-- (lead-workflow.ts fieldMilestone) — no second status engine, no write-back.
-- ============================================================================

-- 1) Trip detail + canonical location columns ---------------------------------
alter table public.field_jobs add column if not exists alt_phone             text;
alter table public.field_jobs add column if not exists imei                  text;
alter table public.field_jobs add column if not exists accessories           text;
alter table public.field_jobs add column if not exists device_condition      text;
alter table public.field_jobs add column if not exists device_category_id    text;
alter table public.field_jobs add column if not exists device_brand_id       text;
alter table public.field_jobs add column if not exists preferred_window      text;
alter table public.field_jobs add column if not exists pincode               text;
alter table public.field_jobs add column if not exists landmark              text;
alter table public.field_jobs add column if not exists location_lat          double precision;
alter table public.field_jobs add column if not exists location_lng          double precision;
alter table public.field_jobs add column if not exists location_maps_url     text;
alter table public.field_jobs add column if not exists location_instructions text;
alter table public.field_jobs add column if not exists location_source       text;
alter table public.field_jobs add column if not exists drop_lat              double precision;
alter table public.field_jobs add column if not exists drop_lng              double precision;
alter table public.field_jobs add column if not exists drop_maps_url         text;
alter table public.field_jobs add column if not exists lead_branch_id        uuid;   -- Lead Store (sales origin); branch_id stays the OPERATIONAL store
alter table public.field_jobs add column if not exists assigned_at           timestamptz;
alter table public.field_jobs add column if not exists created_by_name       text;
alter table public.field_jobs add column if not exists client_request_id     text;
alter table public.field_jobs add column if not exists devices               jsonb;   -- multi-device list; device #1 is mirrored into the flat device columns

create index if not exists field_jobs_lead_branch_idx on public.field_jobs(lead_branch_id);
create index if not exists field_jobs_ninja_idx       on public.field_jobs(ninja_id);
create index if not exists field_jobs_pickup_date_idx on public.field_jobs(pickup_date);

-- Idempotency: one trip per (org, client_request_id).
create unique index if not exists field_jobs_client_request_uq
  on public.field_jobs(organization_id, client_request_id)
  where client_request_id is not null;

-- 2) Unique job numbers per (org, store) — guarded so a legacy duplicate never
--    aborts the migration (the app already retries on 23505). -----------------
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'field_jobs_org_branch_job_no_uq') then
    begin
      create unique index field_jobs_org_branch_job_no_uq
        on public.field_jobs(organization_id, branch_id, job_no);
    exception when unique_violation then
      raise notice 'field_jobs has legacy duplicate job_no values; unique index skipped (resolve duplicates then re-run).';
    end;
  end if;
end $$;

-- Monotonic per-store counter: a Trip ID is NEVER reused (cancel / delete keep
-- their numbers) and concurrent creates cannot collide.
create table if not exists public.field_job_counters (
  organization_id uuid not null,
  scope           text not null,              -- branch uuid as text, or 'org'
  last_seq        integer not null default 0,
  primary key (organization_id, scope)
);
alter table public.field_job_counters enable row level security;  -- no policies: RPC only

create or replace function public.next_field_job_no(p_branch uuid, p_prefix text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_scope  text := coalesce(p_branch::text, 'org');
  v_seed   integer;
  v_seq    integer;
  v_prefix text := nullif(regexp_replace(upper(coalesce(p_prefix, '')), '-+$', ''), '');
begin
  if v_org is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_branch is not null and not coalesce(public.auth_branch_visible(p_branch), false) then
    raise exception 'store_not_authorized' using errcode = '42501';
  end if;

  -- First use for this scope: seed from the highest existing number so the
  -- counter continues the legacy client-derived sequence.
  select coalesce(max((substring(job_no from 'FJ-(\d+)$'))::int), 0)
    into v_seed
    from public.field_jobs
   where organization_id = v_org
     and (p_branch is null or branch_id = p_branch)
     and (v_prefix is null or job_no like v_prefix || '-FJ-%');

  insert into public.field_job_counters as c (organization_id, scope, last_seq)
  values (v_org, v_scope, v_seed + 1)
  on conflict (organization_id, scope)
  do update set last_seq = c.last_seq + 1
  returning last_seq into v_seq;

  return coalesce(v_prefix || '-', '') || 'FJ-' || lpad(v_seq::text, 3, '0');
end $$;
grant execute on function public.next_field_job_no(uuid, text) to authenticated;

-- 3) Append-only event trail ---------------------------------------------------
create table if not exists public.field_job_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id(),
  branch_id       uuid,
  job_id          uuid not null references public.field_jobs(id) on delete cascade,
  job_no          text,
  lead_id         text,
  kind            text not null check (kind in (
                    'created','status_changed','ninja_assigned','ninja_reassigned',
                    'drop_ninja_assigned','location_changed','ticket_linked',
                    'communication','comment')),
  previous        jsonb,
  next            jsonb,
  note            text,
  source          text not null default 'system',   -- system | lead_routing | field_form | field_app
  actor_staff_id  uuid,
  actor_name      text,
  occurred_at     timestamptz not null default now()
);
create index if not exists fje_job_idx  on public.field_job_events(job_id, occurred_at desc);
create index if not exists fje_lead_idx on public.field_job_events(lead_id, occurred_at desc);
create index if not exists fje_org_idx  on public.field_job_events(organization_id);

alter table public.field_job_events enable row level security;
drop policy if exists fje_sel on public.field_job_events;
drop policy if exists fje_ins on public.field_job_events;

-- Visible iff the caller can see the parent trip (RLS on field_jobs applies).
create policy fje_sel on public.field_job_events
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and exists (select 1 from public.field_jobs j where j.id = job_id)
  );

-- The app may add ONLY human-authored kinds (communication / comment). The
-- structural kinds are written by the trigger below and cannot be forged.
-- No update / delete policy => append-only.
create policy fje_ins on public.field_job_events
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and kind in ('communication', 'comment')
    and actor_staff_id = public.auth_staff_id()
    and exists (select 1 from public.field_jobs j where j.id = job_id)
    and public.auth_has_any(array[
      'manage_field_jobs','route_leads','update_pickup','update_drop','assign_ninja',
      'manage_field','manage_repair_jobs','manage_sales','leads_edit','full_access'])
  );
grant select, insert on public.field_job_events to authenticated;

-- 4) Trigger: DB-owned structural events --------------------------------------
create or replace function public.field_jobs_record_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.auth_staff_id();
  v_name  text;
  v_loc_changed boolean;
begin
  if v_actor is not null then
    select s.name into v_name from public.staff s where s.id = v_actor;
  end if;

  if tg_op = 'INSERT' then
    insert into public.field_job_events(organization_id, branch_id, job_id, job_no, lead_id, kind, next, actor_staff_id, actor_name)
    values (new.organization_id, new.branch_id, new.id, new.job_no, new.lead_id, 'created',
            jsonb_build_object('status', new.status, 'lead_type', new.lead_type, 'ninja', new.ninja_name),
            v_actor, v_name);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.field_job_events(organization_id, branch_id, job_id, job_no, lead_id, kind, previous, next, actor_staff_id, actor_name)
    values (new.organization_id, new.branch_id, new.id, new.job_no, new.lead_id, 'status_changed',
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status), v_actor, v_name);
  end if;

  if new.ninja_id is distinct from old.ninja_id and coalesce(new.ninja_id, '') <> '' then
    insert into public.field_job_events(organization_id, branch_id, job_id, job_no, lead_id, kind, previous, next, actor_staff_id, actor_name)
    values (new.organization_id, new.branch_id, new.id, new.job_no, new.lead_id,
            case when coalesce(old.ninja_id, '') = '' then 'ninja_assigned' else 'ninja_reassigned' end,
            jsonb_build_object('ninja_id', old.ninja_id, 'ninja', old.ninja_name),
            jsonb_build_object('ninja_id', new.ninja_id, 'ninja', new.ninja_name),
            v_actor, v_name);
  end if;

  if new.drop_ninja_id is distinct from old.drop_ninja_id and coalesce(new.drop_ninja_id, '') <> '' then
    insert into public.field_job_events(organization_id, branch_id, job_id, job_no, lead_id, kind, previous, next, actor_staff_id, actor_name)
    values (new.organization_id, new.branch_id, new.id, new.job_no, new.lead_id, 'drop_ninja_assigned',
            jsonb_build_object('ninja_id', old.drop_ninja_id, 'ninja', old.drop_ninja_name),
            jsonb_build_object('ninja_id', new.drop_ninja_id, 'ninja', new.drop_ninja_name),
            v_actor, v_name);
  end if;

  v_loc_changed :=
       new.pickup_address is distinct from old.pickup_address
    or new.pincode is distinct from old.pincode
    or new.location_maps_url is distinct from old.location_maps_url
    or new.location_lat is distinct from old.location_lat
    or new.location_lng is distinct from old.location_lng;
  if v_loc_changed then
    insert into public.field_job_events(organization_id, branch_id, job_id, job_no, lead_id, kind, previous, next, actor_staff_id, actor_name)
    values (new.organization_id, new.branch_id, new.id, new.job_no, new.lead_id, 'location_changed',
            jsonb_build_object('address', old.pickup_address, 'pincode', old.pincode, 'maps_url', old.location_maps_url, 'lat', old.location_lat, 'lng', old.location_lng),
            jsonb_build_object('address', new.pickup_address, 'pincode', new.pincode, 'maps_url', new.location_maps_url, 'lat', new.location_lat, 'lng', new.location_lng),
            v_actor, v_name);
  end if;

  if new.linked_ticket_id is distinct from old.linked_ticket_id and coalesce(new.linked_ticket_id, '') <> '' then
    insert into public.field_job_events(organization_id, branch_id, job_id, job_no, lead_id, kind, previous, next, actor_staff_id, actor_name)
    values (new.organization_id, new.branch_id, new.id, new.job_no, new.lead_id, 'ticket_linked',
            jsonb_build_object('ticket_id', old.linked_ticket_id), jsonb_build_object('ticket_id', new.linked_ticket_id),
            v_actor, v_name);
  end if;

  return new;
end $$;

drop trigger if exists field_jobs_events_trg on public.field_jobs;
create trigger field_jobs_events_trg after insert or update on public.field_jobs
  for each row execute function public.field_jobs_record_events();

-- Stamp assigned_at / created_by_name server-side (not client-supplied).
create or replace function public.field_jobs_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.auth_staff_id();
begin
  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.created_by_name := (select s.name from public.staff s where s.id = v_actor);
    end if;
  elsif coalesce(new.ninja_id, '') <> '' and new.ninja_id is distinct from old.ninja_id then
    new.assigned_at := now();
  end if;
  return new;
end $$;
drop trigger if exists field_jobs_stamp_trg on public.field_jobs;
create trigger field_jobs_stamp_trg before insert or update on public.field_jobs
  for each row execute function public.field_jobs_stamp();

-- 5) RLS lockstep with the granular Field keys --------------------------------
--    CAP.field.* (capabilities.ts) and these arrays MUST stay identical.
drop policy if exists field_jobs_sel on public.field_jobs;
drop policy if exists field_jobs_ins on public.field_jobs;
drop policy if exists field_jobs_upd on public.field_jobs;

create policy field_jobs_sel on public.field_jobs
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array[
      'manage_repair_jobs','update_repair_status','manage_field','view_only','manage_sales',
      'view_field_jobs','manage_field_jobs','field_view_all','view_field_reports','update_pickup','update_drop'])
  );
create policy field_jobs_ins on public.field_jobs
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array[
      'manage_repair_jobs','manage_field','manage_sales','manage_field_jobs','route_leads'])
  );
create policy field_jobs_upd on public.field_jobs
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array[
      'manage_repair_jobs','update_repair_status','manage_field','manage_field_jobs',
      'update_pickup','update_drop','assign_ninja','assign_field_manager','receive_store_handoff',
      'field_pickup_status_change','field_drop_status_change'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array[
      'manage_repair_jobs','update_repair_status','manage_field','manage_field_jobs',
      'update_pickup','update_drop','assign_ninja','assign_field_manager','receive_store_handoff',
      'field_pickup_status_change','field_drop_status_change'])
  );

-- Realtime for the event trail (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'field_job_events') then
    alter publication supabase_realtime add table public.field_job_events;
  end if;
exception when others then
  raise notice 'realtime publication not updated: %', sqlerrm;
end $$;
