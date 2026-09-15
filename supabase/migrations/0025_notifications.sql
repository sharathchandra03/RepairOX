-- ============================================================================
-- 0025 — Durable, multi-store notifications table.
--
-- PROBLEM (audit, HIGH): notifications (src/lib/notifications.ts) are
-- localStorage-only, even when Supabase is configured — so they are per-browser,
-- not multi-device, not multi-store, not server-enforced, and duplicates across
-- devices are possible. This creates a real, org+store-scoped, recipient-
-- targeted notifications table with read/resolved state, a dedupe uniqueness
-- guarantee, RLS, and realtime — so the client can be migrated off localStorage.
--
-- Mirrors the AppNotification shape in src/lib/notifications.ts:
--   kind, title, body, recipientId, recipientRole, href, reference, dedupeKey,
--   read → plus server-side org/branch scope, resolved state, and timestamps.
-- ============================================================================

create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id        uuid default public.auth_branch_id() references public.branches(id) on delete set null,

  kind             text not null default 'generic',
  title            text not null,
  body             text,

  -- Targeting: a specific staff member and/or a role. NULL/NULL = broadcast.
  recipient_id     uuid references public.staff(id) on delete cascade,
  recipient_role   text references public.roles(id) on delete set null,

  href             text,           -- deep-link opened on click
  reference        text,           -- related entity display ref (e.g. FJ-001)

  -- Idempotency: one due-event → exactly one notification. A unique index on
  -- (organization_id, dedupe_key) prevents duplicates across devices/sessions.
  dedupe_key       text,

  -- Relationship to a follow-up (optional; links notification ↔ follow-up).
  follow_up_id     uuid,

  read             boolean not null default false,
  read_at          timestamptz,
  resolved         boolean not null default false,
  resolved_at      timestamptz,

  created_by       uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists notifications_org_idx        on public.notifications(organization_id);
create index if not exists notifications_recipient_idx  on public.notifications(recipient_id) where read = false;
create index if not exists notifications_role_idx       on public.notifications(recipient_role) where read = false;
create index if not exists notifications_branch_idx     on public.notifications(branch_id);
create index if not exists notifications_created_idx    on public.notifications(created_at desc);

-- Dedupe guarantee: at most one notification per (org, dedupe_key).
create unique index if not exists notifications_dedupe_unique
  on public.notifications(organization_id, dedupe_key) where dedupe_key is not null;

-- updated_at + audit triggers (reuse the shared functions).
drop trigger if exists notifications_touch on public.notifications;
create trigger notifications_touch before update on public.notifications
  for each row execute function public.touch_updated_at();

drop trigger if exists audit_notifications on public.notifications;
create trigger audit_notifications after insert or update or delete on public.notifications
  for each row execute function public.fn_audit('Notification');

-- RLS: a user reads notifications addressed to them (by id or their role) or
-- broadcast within their org+store scope; may update read/resolved state on
-- those; org members may insert (targeted); admins manage all in their org.
alter table public.notifications enable row level security;

drop policy if exists notifications_sel on public.notifications;
create policy notifications_sel on public.notifications
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and (
      public.is_admin()
      or recipient_id = public.auth_staff_id()
      or recipient_role = public.auth_role_id()
      or (recipient_id is null and recipient_role is null)
    )
  );

drop policy if exists notifications_ins on public.notifications;
create policy notifications_ins on public.notifications
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
  );

drop policy if exists notifications_upd on public.notifications;
create policy notifications_upd on public.notifications
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and (
      public.is_admin()
      or recipient_id = public.auth_staff_id()
      or recipient_role = public.auth_role_id()
      or (recipient_id is null and recipient_role is null)
    )
  )
  with check (public.auth_member_of_org(organization_id));

drop policy if exists notifications_del on public.notifications;
create policy notifications_del on public.notifications
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and (public.is_admin() or created_by = public.auth_staff_id() or recipient_id = public.auth_staff_id())
  );

-- Realtime + grants.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  execute 'alter table public.notifications replica identity full';
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

grant select, insert, update, delete on public.notifications to authenticated;

-- ============================================================================
-- Done. The notifications table is ready. The client (src/lib/notifications.ts)
-- can now be migrated from localStorage to this table with realtime sync.
-- ============================================================================
