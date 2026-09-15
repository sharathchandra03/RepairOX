-- ============================================================================
-- 0027 — Personal, per-store sticky notes (notepad).
--
-- REQUIREMENT: the notepad is a PERSONAL, account-to-account sticky note —
-- each user has their own notes, and they are INDEPENDENT per store. A user's
-- notes in Store A are separate from their notes in Store B, and no other user
-- can see them.
--
-- Model:
--   • organization_id + branch_id → the store the note belongs to
--     (branch_id NULL = the user's "All Shops" personal board).
--   • owner_staff_id → the staff row that owns the note. RLS restricts every
--     row to its owner (personal), regardless of role.
--
-- RLS: a user can only SELECT/INSERT/UPDATE/DELETE their own notes. Even admins
-- do not read other users' personal notes through this table (personal by
-- design). Realtime + updated_at + audit triggers included.
-- ============================================================================

create table if not exists public.notes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id        uuid default public.auth_branch_id() references public.branches(id) on delete cascade,
  owner_staff_id   uuid not null default public.auth_staff_id() references public.staff(id) on delete cascade,

  title            text,
  body             text not null default '',
  color            text,                              -- sticky-note colour token
  pinned_at        timestamptz,                       -- non-null floats to top
  sort_order       integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists notes_owner_idx        on public.notes(owner_staff_id);
create index if not exists notes_owner_store_idx   on public.notes(owner_staff_id, branch_id);
create index if not exists notes_org_idx           on public.notes(organization_id);

-- updated_at trigger (shared helper).
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- RLS — strictly personal: owner-only across all commands.
alter table public.notes enable row level security;

drop policy if exists notes_sel on public.notes;
create policy notes_sel on public.notes
  for select to authenticated
  using (owner_staff_id = public.auth_staff_id());

drop policy if exists notes_ins on public.notes;
create policy notes_ins on public.notes
  for insert to authenticated
  with check (
    owner_staff_id = public.auth_staff_id()
    and organization_id = public.auth_org_id()
  );

drop policy if exists notes_upd on public.notes;
create policy notes_upd on public.notes
  for update to authenticated
  using (owner_staff_id = public.auth_staff_id())
  with check (owner_staff_id = public.auth_staff_id());

drop policy if exists notes_del on public.notes;
create policy notes_del on public.notes
  for delete to authenticated
  using (owner_staff_id = public.auth_staff_id());

-- Realtime + grants.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  execute 'alter table public.notes replica identity full';
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    execute 'alter publication supabase_realtime add table public.notes';
  end if;
end $$;

grant select, insert, update, delete on public.notes to authenticated;

-- ============================================================================
-- Done. Personal per-store notes are ready.
-- ============================================================================
