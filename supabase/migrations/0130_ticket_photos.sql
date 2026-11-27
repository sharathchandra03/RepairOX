-- ============================================================================
-- MIGRATION 0130: Ticket photos
--
-- Device photos captured / uploaded in the ticket wizard (Upload step) and shown
-- on View Ticket. Rules (enforced here, not only in the UI):
--   • max 3 photos per ticket          (ticket_photos_guard trigger)
--   • each file ≤ 1,000,000 bytes       (bucket file_size_limit + check)
--   • images only (jpeg / png / webp)   (bucket allowed_mime_types)
--
-- Files live in the PRIVATE bucket `ticket-photos` at
--   <organization_id>/<ticket_id>/<uuid>.<ext>
-- and are read through short-lived signed URLs. Access follows the ticket: a
-- photo (row or file) is visible only if the caller can see the ticket under the
-- tickets RLS. Additive + idempotent.
-- ============================================================================

-- 1) Storage bucket -----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-photos', 'ticket-photos', false, 1000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Metadata table -----------------------------------------------------------
create table if not exists public.ticket_photos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id        uuid references public.branches(id) on delete set null,
  ticket_id        text not null references public.tickets(id) on delete cascade,
  storage_path     text not null unique,
  file_name        text,
  mime_type        text not null default 'image/jpeg',
  size_bytes       integer not null check (size_bytes > 0 and size_bytes <= 1000000),
  width            integer,
  height           integer,
  source           text not null default 'upload' check (source in ('camera', 'upload')),
  sort_order       integer not null default 0,
  uploaded_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  uploaded_by_name text,
  created_at       timestamptz not null default now()
);

create index if not exists ticket_photos_ticket_idx on public.ticket_photos (ticket_id, sort_order, created_at);

-- 3) Guard: org/branch from the ticket, uploader stamped, max 3 per ticket ------
create or replace function public.ticket_photos_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_branch uuid;
  v_count int;
begin
  select organization_id, branch_id into v_org, v_branch from public.tickets where id = new.ticket_id;
  if v_org is null then
    raise exception 'ticket_not_found' using errcode = '23503';
  end if;
  new.organization_id := v_org;
  new.branch_id := v_branch;

  if auth.uid() is not null then
    new.uploaded_by := public.auth_staff_id();
    select name into new.uploaded_by_name from public.staff where id = new.uploaded_by;
  end if;

  -- Serialize concurrent inserts for the same ticket, then count.
  perform pg_advisory_xact_lock(hashtext('ticket_photos:' || new.ticket_id));
  select count(*) into v_count from public.ticket_photos where ticket_id = new.ticket_id;
  if v_count >= 3 then
    raise exception 'ticket_photo_limit' using errcode = '23514', hint = 'A ticket can have at most 3 photos.';
  end if;

  if split_part(new.storage_path, '/', 1) <> v_org::text
     or split_part(new.storage_path, '/', 2) <> new.ticket_id then
    raise exception 'ticket_photo_bad_path' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists ticket_photos_guard_trg on public.ticket_photos;
create trigger ticket_photos_guard_trg before insert on public.ticket_photos
  for each row execute function public.ticket_photos_guard();

-- 4) RLS: follows ticket visibility ------------------------------------------------
alter table public.ticket_photos enable row level security;

drop policy if exists ticket_photos_sel on public.ticket_photos;
create policy ticket_photos_sel on public.ticket_photos for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and exists (select 1 from public.tickets t where t.id = ticket_photos.ticket_id)
);

drop policy if exists ticket_photos_ins on public.ticket_photos;
create policy ticket_photos_ins on public.ticket_photos for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and exists (select 1 from public.tickets t where t.id = ticket_photos.ticket_id)
  and public.auth_has_any(array['create_ticket','edit_ticket','manage_repair_jobs','update_repair_status']::text[])
);

drop policy if exists ticket_photos_del on public.ticket_photos;
create policy ticket_photos_del on public.ticket_photos for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and exists (select 1 from public.tickets t where t.id = ticket_photos.ticket_id)
  and public.auth_has_any(array['edit_ticket','manage_repair_jobs']::text[])
);

grant select, insert, delete on public.ticket_photos to authenticated;

-- 5) Storage object policies (path = <org>/<ticket>/<file>) ----------------------
drop policy if exists ticket_photos_obj_select on storage.objects;
create policy ticket_photos_obj_select on storage.objects for select to authenticated using (
  bucket_id = 'ticket-photos'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and exists (select 1 from public.tickets t where t.id = (storage.foldername(name))[2]));

drop policy if exists ticket_photos_obj_insert on storage.objects;
create policy ticket_photos_obj_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ticket-photos'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and exists (select 1 from public.tickets t where t.id = (storage.foldername(name))[2])
  and public.auth_has_any(array['create_ticket','edit_ticket','manage_repair_jobs','update_repair_status']::text[]));

drop policy if exists ticket_photos_obj_delete on storage.objects;
create policy ticket_photos_obj_delete on storage.objects for delete to authenticated using (
  bucket_id = 'ticket-photos'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and exists (select 1 from public.tickets t where t.id = (storage.foldername(name))[2])
  and public.auth_has_any(array['edit_ticket','manage_repair_jobs']::text[]));

-- 6) Realtime + audit --------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.ticket_photos;
  exception when duplicate_object then null; end;
end $$;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'fn_audit') then
    drop trigger if exists ticket_photos_audit on public.ticket_photos;
    create trigger ticket_photos_audit after insert or update or delete
      on public.ticket_photos for each row execute function public.fn_audit();
  end if;
end $$;
