-- ============================================================================
-- 0121 — Lead Conversation (internal messages between the people on a lead).
--
-- A Sales Agent routes a lead to a Field Manager, who assigns a Ninja /
-- engineer. This gives everyone on that chain ONE internal thread per lead:
--   • the sender chooses WHO receives each message (any person on the chain, or
--     everyone on it);
--   • recipients are notified (bell) and can REPLY in the same thread
--     (Field Manager and Ninja included);
--   • it is internal only — never a customer channel — and append-only.
--
-- Security model: the chain is derived from real records (leads owner /
-- follow-up agent, field_jobs field manager / ninjas / sales person,
-- field_trips ninja). A caller may read / write a lead's thread only when they
-- are on that chain OR can see the lead (auth_lead_visible). Writes go ONLY
-- through lead_message_send() (SECURITY DEFINER) — there is no client INSERT
-- policy, so the author, audience and notifications can't be forged.
-- ============================================================================

-- ── 1. Tables ────────────────────────────────────────────────────────────────
create table if not exists public.lead_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  author_id       uuid references public.staff(id) on delete set null,
  author_name     text,
  author_role     text,                       -- label at send time ("Field Manager", "Ninja"…)
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  audience        uuid[] not null default '{}', -- staff ids this message was addressed to
  reply_to        uuid references public.lead_messages(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists lead_messages_lead_idx on public.lead_messages(lead_id, created_at);
create index if not exists lead_messages_aud_idx  on public.lead_messages using gin (audience);

create table if not exists public.lead_message_reads (
  staff_id     uuid not null references public.staff(id) on delete cascade,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (staff_id, lead_id)
);

-- ── 2. The chain: who is on a lead ──────────────────────────────────────────
create or replace function public.lead_msg_chain(p_lead uuid)
returns table(staff_id uuid, role_label text, ord int)
language sql stable security definer set search_path = public as $$
  with src as (
    select l.assigned_user_id as sid, 'Sales Agent' as lbl, 1 as o from public.leads l where l.id = p_lead
    union all
    select l.follow_up_agent_id, 'Follow-up Agent', 2 from public.leads l where l.id = p_lead
    union all
    select public.field_try_uuid(j.sales_person_id), 'Sales Agent', 1 from public.field_jobs j where j.lead_id = p_lead::text and j.deleted_at is null
    union all
    select public.field_try_uuid(j.field_manager_id), 'Field Manager', 3 from public.field_jobs j where j.lead_id = p_lead::text and j.deleted_at is null
    union all
    select public.field_try_uuid(j.ninja_id), 'Ninja (pickup)', 4 from public.field_jobs j where j.lead_id = p_lead::text and j.deleted_at is null
    union all
    select public.field_try_uuid(j.drop_ninja_id), 'Ninja (drop)', 4 from public.field_jobs j where j.lead_id = p_lead::text and j.deleted_at is null
    union all
    select t.ninja_id, 'Ninja', 4 from public.field_trips t where t.lead_id = p_lead::text and t.ninja_id is not null
  )
  select distinct on (sid) sid, lbl, o
    from src where sid is not null
   order by sid, o;
$$;

create or replace function public.lead_msg_is_party(p_lead uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.lead_msg_chain(p_lead) c where c.staff_id = public.auth_staff_id())
    or public.auth_lead_visible(p_lead),
    false);
$$;

-- People the caller can address on this lead (excludes nobody; the client marks "me").
create or replace function public.lead_message_people(p_lead uuid)
returns table(staff_id uuid, name text, role_label text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select c.staff_id, s.name, c.role_label, (c.staff_id = public.auth_staff_id())
    from public.lead_msg_chain(p_lead) c
    join public.staff s on s.id = c.staff_id
   where public.lead_msg_is_party(p_lead)
     and coalesce(s.status, 'active') = 'active'
   order by c.ord, s.name;
$$;

-- ── 3. Send (the ONLY write path) ───────────────────────────────────────────
create or replace function public.lead_message_send(p_lead uuid, p_body text, p_to uuid[], p_reply_to uuid default null)
returns public.lead_messages
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := public.auth_staff_id();
  v_name   text;
  v_label  text;
  v_lead   record;
  v_aud    uuid[];
  v_row    public.lead_messages;
  r        uuid;
  v_href   text;
  v_body   text := btrim(coalesce(p_body, ''));
begin
  if v_me is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_body = '' or char_length(v_body) > 2000 then raise exception 'invalid_message' using errcode = '23514'; end if;
  select id, organization_id, branch_id, lead_no into v_lead from public.leads where id = p_lead;
  if not found or not public.lead_msg_is_party(p_lead) then raise exception 'not_on_this_lead' using errcode = '42501'; end if;

  select name into v_name from public.staff where id = v_me;
  select role_label into v_label from public.lead_msg_chain(p_lead) where staff_id = v_me;

  -- Audience: only people actually on the chain, never the sender.
  select coalesce(array_agg(c.staff_id), '{}') into v_aud
    from public.lead_msg_chain(p_lead) c
   where c.staff_id <> v_me
     and (p_to is null or cardinality(p_to) = 0 or c.staff_id = any(p_to));
  if cardinality(v_aud) = 0 then raise exception 'no_recipients' using errcode = '23514'; end if;

  insert into public.lead_messages(organization_id, branch_id, lead_id, author_id, author_name, author_role, body, audience, reply_to)
  values (v_lead.organization_id, v_lead.branch_id, p_lead, v_me, v_name, coalesce(v_label, 'Sales'), v_body, v_aud, p_reply_to)
  returning * into v_row;

  -- The sender has read the thread up to now.
  insert into public.lead_message_reads(staff_id, lead_id, last_read_at) values (v_me, p_lead, now())
  on conflict (staff_id, lead_id) do update set last_read_at = excluded.last_read_at;

  foreach r in array v_aud loop
    v_href := coalesce(
      (select '/ninja/trip/' || t.id::text from public.field_trips t where t.lead_id = p_lead::text and t.ninja_id = r order by t.created_at desc limit 1),
      (select '/field/' || j.id::text from public.field_jobs j where j.lead_id = p_lead::text and public.field_try_uuid(j.field_manager_id) = r limit 1),
      '/leads/' || p_lead::text);
    perform public.field_ops_notify(v_lead.organization_id, v_lead.branch_id, r, 'lead_message',
      'Message on ' || coalesce(v_lead.lead_no, 'a lead') || ' from ' || coalesce(v_name, 'a teammate'),
      left(v_body, 140), v_href, v_lead.lead_no, 'lm:' || v_row.id::text);
  end loop;
  return v_row;
end $$;

create or replace function public.lead_message_mark_read(p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_staff_id() is null or not public.lead_msg_is_party(p_lead) then return; end if;
  insert into public.lead_message_reads(staff_id, lead_id, last_read_at) values (public.auth_staff_id(), p_lead, now())
  on conflict (staff_id, lead_id) do update set last_read_at = excluded.last_read_at;
end $$;

-- ── 4. RLS: read-only for clients (writes only via the RPCs above) ─────────
alter table public.lead_messages      enable row level security;
alter table public.lead_message_reads enable row level security;

drop policy if exists lead_messages_sel on public.lead_messages;
create policy lead_messages_sel on public.lead_messages for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and (
    author_id = public.auth_staff_id()
    or public.auth_staff_id() = any(audience)
    or public.auth_lead_visible(lead_id)
  )
);

drop policy if exists lead_message_reads_sel on public.lead_message_reads;
create policy lead_message_reads_sel on public.lead_message_reads for select to authenticated
using (staff_id = public.auth_staff_id());

grant select on public.lead_messages      to authenticated;
grant select on public.lead_message_reads to authenticated;
grant execute on function public.lead_message_people(uuid)                   to authenticated;
grant execute on function public.lead_message_send(uuid, text, uuid[], uuid) to authenticated;
grant execute on function public.lead_message_mark_read(uuid)                to authenticated;

do $$ begin
  begin execute 'alter publication supabase_realtime add table public.lead_messages'; exception when others then null; end;
end $$;
