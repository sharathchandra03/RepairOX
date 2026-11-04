-- ============================================================================
-- 0088 — Lead Intelligence Search, Customer Lead History, shared READ-ONLY
--         lead reference, and handoff requests.
--
-- DESIGN
--   • Reading other agents' leads is a NEW, narrow capability delivered ONLY
--     through SECURITY DEFINER RPCs below. leads_sel / leads_upd / history
--     RLS are deliberately NOT widened, so a reference viewer can never UPDATE,
--     DELETE, reassign or insert history for another agent's lead — even with a
--     direct API call (RLS + leads_ownership_guard remain the write boundary).
--   • Permission keys (all OFF by default; owners via full_access):
--       leads_search            Lead Intelligence Search (CAP.lead.search; coarse
--                               fallback leads_view / manage_sales — keep in
--                               lockstep with the array in lead_search()).
--       leads_shared_reference  Search + open OTHER agents' permitted leads READ-ONLY.
--       leads_customer_history  Inspect a Customer's permitted lead history READ-ONLY.
--   • Org + store scope (auth_member_of_org / auth_branch_visible) always apply.
--   • Search never writes. Opening a reference lead writes ONE audit row
--     (lead_reference_access_log) and nothing on the lead itself.
-- ============================================================================

-- ── 1. Trigram + identity indexes (best-effort: extension may be restricted) ─
do $$
begin
  create extension if not exists pg_trgm with schema extensions;
exception when others then
  raise notice 'pg_trgm unavailable (%), search falls back to sequential scans', sqlerrm;
end $$;

do $$
begin
  execute 'create index if not exists leads_name_trgm_idx   on public.leads using gin (lower(name)   extensions.gin_trgm_ops)';
  execute 'create index if not exists leads_device_trgm_idx on public.leads using gin (lower(device) extensions.gin_trgm_ops)';
  execute 'create index if not exists leads_issue_trgm_idx  on public.leads using gin (lower(issue)  extensions.gin_trgm_ops)';
exception when others then
  raise notice 'trigram indexes skipped: %', sqlerrm;
end $$;

create index if not exists leads_org_mobile_norm_idx on public.leads(organization_id, mobile_normalized);
create index if not exists leads_org_email_norm_idx  on public.leads(organization_id, email_normalized);
create index if not exists leads_org_customer_idx    on public.leads(organization_id, customer_id);

-- ── 2. Seed: Sales Agents may use the (own-scope) search. Reference stays OFF.
insert into public.role_permissions (role_id, permission_key)
select 'sales_agent', 'leads_search'
where exists (select 1 from public.roles r where r.id = 'sales_agent')
on conflict (role_id, permission_key) do nothing;

-- ── 3. Helpers ──────────────────────────────────────────────────────────────
-- Last REAL activity on a lead (never view/open events — none are recorded).
create or replace function public.lead_last_activity(p_lead_id uuid)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    (select l.created_at from public.leads l where l.id = p_lead_id),
    coalesce((select max(a.occurred_at) from public.lead_activity_history a where a.lead_id = p_lead_id), '-infinity'::timestamptz),
    coalesce((select max(coalesce(f.completed_at, f.created_at)) from public.lead_followup_history f where f.lead_id = p_lead_id), '-infinity'::timestamptz),
    coalesce((select max(s.changed_at) from public.lead_status_history s where s.lead_id = p_lead_id), '-infinity'::timestamptz),
    coalesce((select max(c.occurred_at) from public.lead_conversion_history c where c.lead_id = p_lead_id), '-infinity'::timestamptz),
    coalesce((select max(h.created_at) from public.lead_assignment_history h where h.lead_id = p_lead_id), '-infinity'::timestamptz)
  );
$$;
revoke all on function public.lead_last_activity(uuid) from public, anon, authenticated;

-- Normal (non-reference) visibility of a lead for the caller — mirrors leads_sel.
create or replace function public.lead_ordinary_visible(l public.leads)
returns boolean
language sql stable security definer set search_path = public as $$
  -- coalesce: every comparison is NULL when the lead has no such user, and
  -- `not (NULL or false)` is NULL — which would silently skip IF-guards.
  select coalesce(
         l.created_by = public.auth_staff_id()
      or l.assigned_to = public.auth_staff_id()
      or l.assigned_user_id = public.auth_staff_id()
      or l.follow_up_agent_id = public.auth_staff_id()
      or public.auth_lead_see_all()
      or public.auth_is_lead_followup_agent(l.id), false);
$$;
revoke all on function public.lead_ordinary_visible(public.leads) from public, anon, authenticated;

-- ── 4. Audit + handoff tables ───────────────────────────────────────────────
create table if not exists public.lead_reference_access_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  branch_id        uuid references public.branches(id) on delete set null,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  viewer_staff_id  uuid references public.staff(id) on delete set null,
  viewer_name      text,
  owner_staff_id   uuid references public.staff(id) on delete set null,
  via              text not null default 'lead',     -- 'lead' | 'customer_history'
  created_at       timestamptz not null default now()
);
create index if not exists lral_lead_idx   on public.lead_reference_access_log(lead_id, created_at desc);
create index if not exists lral_viewer_idx on public.lead_reference_access_log(viewer_staff_id, lead_id, created_at desc);
alter table public.lead_reference_access_log enable row level security;
drop policy if exists lral_sel on public.lead_reference_access_log;
create policy lral_sel on public.lead_reference_access_log for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (public.is_admin() or public.auth_has_any(array['manage_reports', 'manage_users']))
);
-- No insert/update/delete policy: written by lead_reference_get() only. Append-only.

create table if not exists public.lead_handoff_requests (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id           uuid references public.branches(id) on delete set null,
  lead_id             uuid not null references public.leads(id) on delete cascade,
  lead_no             text,
  customer_name       text,
  owner_staff_id      uuid references public.staff(id) on delete set null,
  owner_name          text,
  requested_by        uuid not null references public.staff(id) on delete cascade,
  requested_by_name   text,
  reason              text not null check (length(btrim(reason)) > 0),
  note                text,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by          uuid references public.staff(id) on delete set null,
  decided_by_name     text,
  decided_at          timestamptz,
  decision_note       text,
  created_at          timestamptz not null default now()
);
create index if not exists lhr_lead_idx  on public.lead_handoff_requests(lead_id, created_at desc);
create index if not exists lhr_owner_idx on public.lead_handoff_requests(owner_staff_id) where status = 'pending';
create index if not exists lhr_req_idx   on public.lead_handoff_requests(requested_by);
-- One pending request per (lead, requester): double-click / retry safe.
create unique index if not exists lhr_one_pending_per_requester
  on public.lead_handoff_requests(lead_id, requested_by) where status = 'pending';
alter table public.lead_handoff_requests enable row level security;
drop policy if exists lhr_sel on public.lead_handoff_requests;
create policy lhr_sel on public.lead_handoff_requests for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and (
    requested_by = public.auth_staff_id()
    or owner_staff_id = public.auth_staff_id()
    or public.auth_has_any(array['leads_reassign', 'assign', 'manage_sales', 'manage_reports', 'manage_users'])
  )
);
-- No client write policy: requests are created/decided only through the RPCs.

-- ── 5. lead_search ──────────────────────────────────────────────────────────
drop function if exists public.lead_search(text, text, int, int, text, text, uuid, uuid, text, text, date, date, text);
create or replace function public.lead_search(
  p_query          text,
  p_entity         text default 'all',   -- all | customers | leads | contacts | followups
  p_limit          int  default 5,
  p_offset         int  default 0,
  p_status         text default null,
  p_contact_status text default null,
  p_agent          uuid default null,
  p_branch         uuid default null,
  p_region         text default null,
  p_source         text default null,
  p_from           date default null,
  p_to             date default null,
  p_active         text default 'all',   -- all | active | history
  p_sort           text default 'relevance' -- relevance | recent
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org     uuid := public.auth_org_id();
  v_me      uuid := public.auth_staff_id();
  v_raw     text := btrim(coalesce(p_query, ''));
  v_ql      text := lower(btrim(coalesce(p_query, '')));
  v_digits  text := regexp_replace(btrim(coalesce(p_query, '')), '[^0-9]', '', 'g');
  v_numeric boolean := btrim(coalesce(p_query, '')) ~ '^[+0-9()\s.-]+$';
  v_p10     text;
  v_esc     text;
  v_like    text;
  v_pref    text;
  v_all     boolean;
  v_shared  boolean;
  v_cust    boolean;
  v_cont    boolean;
  v_lim     int  := least(greatest(coalesce(p_limit, 5), 1), 50);
  v_off     int  := greatest(coalesce(p_offset, 0), 0);
  v_ent     text := lower(coalesce(p_entity, 'all'));
  v_empty   jsonb := jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  v_result  jsonb;
begin
  if auth.uid() is null or v_org is null or v_me is null then
    return jsonb_build_object('forbidden', true);
  end if;
  if not public.auth_has_any(array['leads_search', 'leads_view', 'manage_sales']) then
    return jsonb_build_object('forbidden', true);
  end if;
  if length(v_raw) < 2 then
    return jsonb_build_object('forbidden', false, 'leads', v_empty, 'customers', v_empty,
                              'contacts', v_empty, 'followups', v_empty);
  end if;

  v_p10    := right(v_digits, 10);
  v_esc    := replace(replace(replace(v_ql, '\', '\\'), '%', '\%'), '_', '\_');
  v_like   := '%' || v_esc || '%';
  v_pref   := v_esc || '%';
  v_all    := public.auth_lead_see_all();
  v_shared := public.auth_has_any(array['leads_shared_reference']);
  -- Customer results / Customer history are their own capability (NOT view_customers,
  -- which Sales Agents hold only so Add Lead can de-duplicate customers).
  v_cust   := public.auth_has_any(array['leads_customer_history']);
  v_cont   := public.auth_has_any(array['contacts_view', 'contacts_manage', 'manage_customers']);

  with vis as (
    select l.*,
           (l.converted_at is not null or l.lost_at is not null
            or lower(coalesce(l.status, '')) ~ '(lost|won|converted|closed|not qualified)') as is_closed,
           coalesce(v_all or l.created_by = v_me or l.assigned_to = v_me or l.assigned_user_id = v_me
            or l.follow_up_agent_id = v_me or public.auth_is_lead_followup_agent(l.id), false) as is_ordinary
    from public.leads l
    where l.organization_id = v_org
      and l.deleted_at is null
      and public.auth_branch_visible(l.branch_id)
      and ( v_all or v_shared
            or l.created_by = v_me or l.assigned_to = v_me or l.assigned_user_id = v_me
            or l.follow_up_agent_id = v_me or public.auth_is_lead_followup_agent(l.id) )
  ),
  scored as (
    select v.id, v.customer_id, v.is_closed, v.is_ordinary, split_part(m.ms, '|', 1)::int as score,
           split_part(m.ms, '|', 2) as match_field
    from vis v
    cross join lateral (
      select
        (length(v_digits) >= 10 and (v.mobile_normalized = v_p10
           or public.normalize_customer_mobile(v.alternate_number) = v_p10))            as f_phone_exact,
        (position('@' in v_ql) > 0 and v.email_normalized = v_ql)                       as f_email_exact,
        (v.customer_id is not null and lower(v.customer_id) = v_ql)                     as f_cust_exact,
        (lower(coalesce(v.lead_no, '')) = v_ql)                                         as f_lead_exact,
        (lower(btrim(coalesce(v.name, ''))) = v_ql)                                     as f_name_exact,
        (v_numeric and length(v_digits) between 4 and 9
           and (v.mobile_normalized like '%' || v_digits || '%'
                or public.normalize_customer_mobile(v.alternate_number) like '%' || v_digits || '%')) as f_phone_part,
        (not v_numeric and coalesce(v.email_normalized, '') like v_like)                as f_email_part,
        (lower(coalesce(v.lead_no, '')) like v_like)                                    as f_lead_part,
        (not v_numeric and (lower(coalesce(v.name, '')) like v_pref
                            or lower(coalesce(v.name, '')) like '% ' || v_pref))        as f_name_pref,
        (not v_numeric and lower(coalesce(v.name, '')) like v_like)                     as f_name_part,
        (not v_numeric and (lower(coalesce(v.device, ''))       like v_like
                         or lower(coalesce(v.issue, ''))        like v_like
                         or lower(coalesce(v.category, ''))     like v_like
                         or lower(coalesce(v.lead_category, '')) like v_like
                         or lower(coalesce(v.sub_category, '')) like v_like))           as f_device,
        (not v_numeric and (lower(coalesce(v.assigned_to_name, '')) like v_like
                         or lower(coalesce(v.follow_up_agent, ''))  like v_like
                         or lower(coalesce(v.status, ''))           like v_like
                         or lower(coalesce(v.contact_status, ''))   like v_like
                         or lower(coalesce(v.lead_nature, ''))      like v_like
                         or lower(coalesce(v.result, ''))           like v_like
                         or lower(coalesce(v.region, ''))           like v_like
                         or lower(coalesce(v.source, ''))           like v_like
                         or lower(coalesce(v.capture_channel, ''))  like v_like
                         or lower(coalesce(v.location, ''))         like v_like))        as f_meta,
        (not v_numeric and (lower(coalesce(v.comments, ''))           like v_like
                         or lower(coalesce(v.final_remarks, ''))      like v_like
                         or lower(coalesce(v.follow_up_comments, '')) like v_like))      as f_notes
    ) f
    cross join lateral (
      select case
        when f.f_phone_exact then '100|Mobile Number Match'
        when f.f_email_exact then '96|Email Match'
        when f.f_cust_exact  then '92|Customer ID Match'
        when f.f_lead_exact  then '90|Lead ID Match'
        when f.f_name_exact  then '85|Name Match'
        when f.f_phone_part  then '70|Mobile Number Match'
        when f.f_email_part  then '68|Email Match'
        when f.f_lead_part   then '66|Lead ID Match'
        when f.f_name_pref   then '60|Name Match'
        when f.f_name_part   then '50|Name Match'
        when f.f_device      then '40|Device / Issue Match'
        when f.f_meta        then '30|Lead Detail Match'
        when f.f_notes       then '25|Comment / Remark Match'
        when not v_numeric and length(v_raw) >= 3 and (
             exists (select 1 from public.lead_followup_history h
                      where h.lead_id = v.id and lower(coalesce(h.comments, '')) like v_like)
          or exists (select 1 from public.lead_activity_history a
                      where a.lead_id = v.id and lower(coalesce(a.note, '')) like v_like)
        ) then '20|Follow-up / Activity Note Match'
        else null end as ms
    ) m
    where m.ms is not null
      and (p_status is null         or lower(v.status) = lower(p_status))
      and (p_contact_status is null or lower(v.contact_status) = lower(p_contact_status))
      and (p_agent is null          or v.assigned_user_id = p_agent)
      and (p_branch is null         or v.branch_id = p_branch)
      and (p_region is null         or lower(v.region) = lower(p_region))
      and (p_source is null         or lower(v.source) = lower(p_source))
      and (p_from is null           or v.created_at::date >= p_from)
      and (p_to is null             or v.created_at::date <= p_to)
      and (p_active = 'all' or (p_active = 'active' and not v.is_closed) or (p_active = 'history' and v.is_closed))
  ),
  lead_page as (
    select s.*, v.lead_no, v.name, v.number, v.email, v.device, v.issue, v.status, v.contact_status,
           v.lead_nature, v.result, v.assigned_user_id, v.assigned_to_name, v.branch_id, v.region,
           v.source, v.capture_channel, v.lead_date, v.created_at, v.assigned_at, v.created_by,
           v.next_followup_at
    from scored s join vis v on v.id = s.id
    order by case when p_sort = 'recent' then public.lead_last_activity(s.id) end desc nulls last,
             s.score desc, public.lead_last_activity(s.id) desc, s.id
    limit (case when v_ent in ('all', 'leads') then v_lim else 0 end)
    offset (case when v_ent = 'leads' then v_off else 0 end)
  ),
  cust_direct as (
    select c.id, m.ms
    from public.customers c
    cross join lateral (
      select case
        when length(v_digits) >= 10 and (c.mobile_normalized = v_p10 or c.alt_mobile_normalized = v_p10) then '100|Mobile Number Match'
        when position('@' in v_ql) > 0 and c.email_normalized = v_ql then '96|Email Match'
        when lower(c.id) = v_ql then '92|Customer ID Match'
        when lower(btrim(coalesce(nullif(c.full_name, ''), c.first_name || ' ' || coalesce(c.last_name, '')))) = v_ql then '85|Name Match'
        when v_numeric and length(v_digits) between 4 and 9
             and (coalesce(c.mobile_normalized, '') like '%' || v_digits || '%'
                  or coalesce(c.alt_mobile_normalized, '') like '%' || v_digits || '%') then '70|Mobile Number Match'
        when not v_numeric and coalesce(c.email_normalized, '') like v_like then '68|Email Match'
        when lower(c.id) like v_like then '66|Customer ID Match'
        when not v_numeric and (lower(coalesce(nullif(c.full_name, ''), c.first_name || ' ' || coalesce(c.last_name, ''))) like v_pref
             or lower(coalesce(nullif(c.full_name, ''), c.first_name || ' ' || coalesce(c.last_name, ''))) like '% ' || v_pref) then '60|Name Match'
        when not v_numeric and lower(coalesce(nullif(c.full_name, ''), c.first_name || ' ' || coalesce(c.last_name, ''))) like v_like then '50|Name Match'
        when not v_numeric and lower(coalesce(c.company, '')) like v_like then '30|Company Match'
        else null end as ms
    ) m
    where v_cust and m.ms is not null
      and c.organization_id = v_org and c.deleted_at is null
      and public.auth_branch_visible(c.branch_id)
  ),
  cust_ids as (
    -- one row per Customer identity, whether found directly or through a matched lead
    select distinct on (x.id) x.id, x.score, x.match_field
    from (
      select d.id, split_part(d.ms, '|', 1)::int as score, split_part(d.ms, '|', 2) as match_field from cust_direct d
      union all
      select s.customer_id, s.score, 'Lead: ' || s.match_field
      from scored s
      where v_cust and s.customer_id is not null and btrim(s.customer_id) <> ''
    ) x
    join public.customers c on c.id = x.id and c.organization_id = v_org and c.deleted_at is null
         and public.auth_branch_visible(c.branch_id)
    order by x.id, x.score desc
  ),
  cust_page as (
    select i.id, i.score, i.match_field
    from cust_ids i
    order by i.score desc, i.id
    limit (case when v_ent in ('all', 'customers') then v_lim else 0 end)
    offset (case when v_ent = 'customers' then v_off else 0 end)
  ),
  cont_all as (
    select ct.id, m.ms
    from public.contacts ct
    cross join lateral (
      select case
        when length(v_digits) >= 10 and ct.mobile_normalized = v_p10 then '100|Mobile Number Match'
        when position('@' in v_ql) > 0 and ct.email_normalized = v_ql then '96|Email Match'
        when v_numeric and length(v_digits) between 4 and 9 and coalesce(ct.mobile_normalized, '') like '%' || v_digits || '%' then '70|Mobile Number Match'
        when not v_numeric and coalesce(ct.email_normalized, '') like v_like then '68|Email Match'
        when not v_numeric and lower(coalesce(ct.full_name, ct.first_name)) like v_pref then '60|Name Match'
        when not v_numeric and lower(coalesce(ct.full_name, ct.first_name)) like v_like then '50|Name Match'
        else null end as ms
    ) m
    where v_cont and m.ms is not null
      and ct.organization_id = v_org and ct.deleted_at is null
      and public.auth_branch_visible(ct.branch_id)
      and (public.auth_sales_see_all() or ct.created_by = v_me)
  ),
  cont_page as (
    select a.id, split_part(a.ms, '|', 1)::int as score, split_part(a.ms, '|', 2) as match_field
    from cont_all a
    order by 2 desc, a.id
    limit (case when v_ent in ('all', 'contacts') then v_lim else 0 end)
    offset (case when v_ent = 'contacts' then v_off else 0 end)
  ),
  fu_all as (
    select f.id, f.lead_id, f.scheduled_at, f.status, f.comments, f.followup_user_id, f.completed_at,
           (f.status in ('scheduled', 'rescheduled', 'missed')) as is_open
    from public.lead_followup_history f
    join vis v on v.id = f.lead_id
    where (not v_numeric and length(v_raw) >= 3 and lower(coalesce(f.comments, '')) like v_like)
       or exists (select 1 from scored s where s.id = f.lead_id and s.score >= 60)
  ),
  fu_page as (
    select a.* from fu_all a
    order by a.is_open desc, a.scheduled_at asc nulls last, a.id
    limit (case when v_ent in ('all', 'followups') then v_lim else 0 end)
    offset (case when v_ent = 'followups' then v_off else 0 end)
  )
  select jsonb_build_object(
    'forbidden', false,
    'leads', jsonb_build_object(
      'total', (select count(*) from scored),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'lead_no', p.lead_no, 'name', p.name, 'number', p.number, 'email', p.email,
          'device', p.device, 'issue', p.issue, 'status', p.status, 'contact_status', p.contact_status,
          'lead_nature', p.lead_nature, 'result', p.result,
          'assigned_user_id', p.assigned_user_id, 'assigned_to_name', p.assigned_to_name,
          'created_by', p.created_by,
          'created_by_name', (select s.name from public.staff s where s.id = p.created_by),
          'branch_id', p.branch_id,
          'store_name', (select b.name from public.branches b where b.id = p.branch_id),
          'region', p.region, 'source', p.source, 'capture_channel', p.capture_channel,
          'lead_date', p.lead_date, 'created_at', p.created_at, 'assigned_at', p.assigned_at,
          'customer_id', p.customer_id, 'closed', p.is_closed,
          'is_owner', (p.assigned_user_id = v_me), 'ordinary', p.is_ordinary,
          'open_followup', exists (select 1 from public.lead_followup_history f
                                    where f.lead_id = p.id and f.status in ('scheduled', 'rescheduled', 'missed')),
          'next_followup_at', p.next_followup_at,
          'last_activity', public.lead_last_activity(p.id),
          'score', p.score, 'match_field', p.match_field
        ) order by case when p_sort = 'recent' then public.lead_last_activity(p.id) end desc nulls last,
                   p.score desc, public.lead_last_activity(p.id) desc, p.id)
        from lead_page p), '[]'::jsonb)
    ),
    'customers', jsonb_build_object(
      'total', (select count(*) from cust_ids),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', coalesce(nullif(c.full_name, ''), btrim(c.first_name || ' ' || coalesce(c.last_name, ''))),
          'mobile', c.mobile, 'alt_mobile', c.alt_mobile, 'email', c.email, 'company', c.company,
          'created_at', c.created_at, 'branch_id', c.branch_id,
          'lead_count',   (select count(*) from vis v where v.customer_id = c.id),
          'active_count', (select count(*) from vis v where v.customer_id = c.id and not v.is_closed),
          'agents', coalesce((select jsonb_agg(distinct v.assigned_to_name)
                               from vis v where v.customer_id = c.id and v.assigned_to_name is not null), '[]'::jsonb),
          'last_activity', (select max(public.lead_last_activity(v.id)) from vis v where v.customer_id = c.id),
          'score', p.score, 'match_field', p.match_field
        ) order by p.score desc, p.id)
        from cust_page p join public.customers c on c.id = p.id), '[]'::jsonb)
    ),
    'contacts', jsonb_build_object(
      'total', (select count(*) from cont_all),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ct.id, 'name', coalesce(ct.full_name, ct.first_name), 'mobile', coalesce(nullif(ct.mobile, ''), ct.phone),
          'email', ct.email, 'customer_id', ct.customer_id, 'score', p.score, 'match_field', p.match_field
        ) order by p.score desc, p.id)
        from cont_page p join public.contacts ct on ct.id = p.id), '[]'::jsonb)
    ),
    'followups', jsonb_build_object(
      'total', (select count(*) from fu_all),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'lead_id', f.lead_id, 'lead_no', v.lead_no, 'customer_name', v.name,
          'scheduled_at', f.scheduled_at, 'status', f.status, 'comments', f.comments,
          'completed_at', f.completed_at,
          'agent_name', (select s.name from public.staff s where s.id = f.followup_user_id),
          'is_open', f.is_open
        ) order by f.is_open desc, f.scheduled_at asc nulls last, f.id)
        from fu_page f join vis v on v.id = f.lead_id), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.lead_search(text, text, int, int, text, text, uuid, uuid, text, text, date, date, text, text) from public, anon;
grant execute on function public.lead_search(text, text, int, int, text, text, uuid, uuid, text, text, date, date, text, text) to authenticated;

-- ── 6. lead_reference_get — one lead + its histories, READ-ONLY ─────────────
create or replace function public.lead_reference_get(p_lead_id uuid, p_via text default 'lead')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me       uuid := public.auth_staff_id();
  v_l        public.leads;
  v_ordinary boolean;
  v_shared   boolean;
begin
  if auth.uid() is null or v_me is null then return null; end if;
  select * into v_l from public.leads where id = p_lead_id and deleted_at is null;
  if not found then return null; end if;
  if not (public.auth_member_of_org(v_l.organization_id) and public.auth_branch_visible(v_l.branch_id)) then
    return null;
  end if;

  v_ordinary := public.lead_ordinary_visible(v_l);
  v_shared   := public.auth_has_any(array['leads_shared_reference', 'leads_customer_history']);
  if not (coalesce(v_ordinary, false) or coalesce(v_shared, false)) then
    return null;   -- never reveals existence
  end if;

  if not v_ordinary then
    -- Commercial values are not part of a shared reference.
    v_l.estimate := 0; v_l.expected_value := 0; v_l.discount := 0;
    if not exists (
      select 1 from public.lead_reference_access_log g
      where g.lead_id = v_l.id and g.viewer_staff_id = v_me and g.created_at > now() - interval '15 minutes'
    ) then
      insert into public.lead_reference_access_log (organization_id, branch_id, lead_id, viewer_staff_id, viewer_name, owner_staff_id, via)
      values (v_l.organization_id, v_l.branch_id, v_l.id, v_me,
              (select s.name from public.staff s where s.id = v_me), v_l.assigned_user_id,
              case when p_via = 'customer_history' then 'customer_history' else 'lead' end);
    end if;
  end if;

  return jsonb_build_object(
    'reference', not v_ordinary,
    'lead', to_jsonb(v_l),
    'created_by_name', (select s.name from public.staff s where s.id = v_l.created_by),
    'updated_by_name', (select s.name from public.staff s where s.id = v_l.updated_by),
    'store_name', (select b.name from public.branches b where b.id = v_l.branch_id),
    'last_activity', public.lead_last_activity(v_l.id),
    -- Names are resolved from staff so the "who handled it" trail is always populated.
    'assignment', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
          'from_user_name', (select s.name from public.staff s where s.id = a.from_user_id),
          'to_user_name',   (select s.name from public.staff s where s.id = a.to_user_id),
          'assigned_by_name', (select s.name from public.staff s where s.id = coalesce(a.assigned_by, a.actor_staff_id))
        ) order by a.created_at) from public.lead_assignment_history a where a.lead_id = v_l.id), '[]'::jsonb),
    'followups',  coalesce((select jsonb_agg(jsonb_build_object('seq', f.rn) || to_jsonb(f) || jsonb_build_object(
          'followup_user_name', (select s.name from public.staff s where s.id = f.followup_user_id),
          'created_by', f.actor_staff_id,
          'created_by_name', (select s.name from public.staff s where s.id = f.actor_staff_id)
        ) order by f.created_at)
        from (select ff.*, row_number() over (order by ff.created_at, ff.id) as rn
                from public.lead_followup_history ff where ff.lead_id = v_l.id) f), '[]'::jsonb),
    'activity',   coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object(
          'actor_name', (select s.name from public.staff s where s.id = x.actor_staff_id)
        ) order by x.occurred_at) from public.lead_activity_history x where x.lead_id = v_l.id), '[]'::jsonb),
    'status_history', coalesce((select jsonb_agg(to_jsonb(s2) || jsonb_build_object(
          'actor_name', (select s.name from public.staff s where s.id = s2.actor_staff_id)
        ) order by s2.changed_at) from public.lead_status_history s2 where s2.lead_id = v_l.id), '[]'::jsonb),
    'conversion', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
          'actor_name', (select s.name from public.staff s where s.id = c.actor_staff_id)
        ) order by c.occurred_at) from public.lead_conversion_history c where c.lead_id = v_l.id), '[]'::jsonb),
    'pending_handoff', (select to_jsonb(h) from public.lead_handoff_requests h
                         where h.lead_id = v_l.id and h.requested_by = v_me and h.status = 'pending' limit 1)
  );
end;
$$;
revoke all on function public.lead_reference_get(uuid, text) from public, anon;
grant execute on function public.lead_reference_get(uuid, text) to authenticated;

-- ── 7. lead_customer_history — Customer 360 lead list + interaction timeline ─
create or replace function public.lead_customer_history(p_customer_id text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_me     uuid := public.auth_staff_id();
  v_c      public.customers;
  v_all    boolean;
  v_shared boolean;
begin
  if auth.uid() is null or v_org is null or v_me is null then return null; end if;
  if not public.auth_has_any(array['leads_customer_history']) then
    return null;
  end if;
  select * into v_c from public.customers
   where id = p_customer_id and organization_id = v_org and deleted_at is null;
  if not found or not public.auth_branch_visible(v_c.branch_id) then return null; end if;

  v_all    := public.auth_lead_see_all();
  v_shared := public.auth_has_any(array['leads_shared_reference', 'leads_customer_history']);

  return (
    with vis as (
      select l.*,
             (l.converted_at is not null or l.lost_at is not null
              or lower(coalesce(l.status, '')) ~ '(lost|won|converted|closed|not qualified)') as is_closed,
             public.lead_ordinary_visible(l) as is_ordinary
      from public.leads l
      where l.organization_id = v_org and l.deleted_at is null
        and public.auth_branch_visible(l.branch_id)
        and ( l.customer_id = v_c.id
              or (v_c.mobile_normalized is not null and l.mobile_normalized = v_c.mobile_normalized)
              or (v_c.alt_mobile_normalized is not null and l.mobile_normalized = v_c.alt_mobile_normalized) )
        and ( v_shared or public.lead_ordinary_visible(l) )
    )
    select jsonb_build_object(
      'customer', jsonb_build_object(
        'id', v_c.id,
        'name', coalesce(nullif(v_c.full_name, ''), btrim(v_c.first_name || ' ' || coalesce(v_c.last_name, ''))),
        'mobile', v_c.mobile, 'alt_mobile', v_c.alt_mobile, 'email', v_c.email, 'company', v_c.company,
        'status', v_c.status, 'created_at', v_c.created_at),
      'full_history', v_shared,
      'leads', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'lead_no', v.lead_no, 'name', v.name, 'device', v.device, 'issue', v.issue,
          'source', v.source, 'status', v.status, 'contact_status', v.contact_status, 'result', v.result,
          'lead_nature', v.lead_nature,
          'assigned_user_id', v.assigned_user_id, 'assigned_to_name', v.assigned_to_name,
          'created_by_name', (select s.name from public.staff s where s.id = v.created_by),
          'created_at', v.created_at, 'assigned_at', v.assigned_at, 'closed', v.is_closed,
          'ordinary', v.is_ordinary, 'is_owner', (v.assigned_user_id = v_me),
          'store_name', (select b.name from public.branches b where b.id = v.branch_id),
          'next_followup_at', v.next_followup_at,
          'open_followup', exists (select 1 from public.lead_followup_history f
                                    where f.lead_id = v.id and f.status in ('scheduled', 'rescheduled', 'missed')),
          'overdue_followup', exists (select 1 from public.lead_followup_history f
                                       where f.lead_id = v.id and f.status in ('scheduled', 'rescheduled', 'missed')
                                         and f.scheduled_at < now()),
          'last_activity', public.lead_last_activity(v.id)
        ) order by v.created_at desc)
        from vis v), '[]'::jsonb),
      'timeline', coalesce((
        select jsonb_agg(e order by (e->>'at') desc)
        from (
          select jsonb_build_object('lead_id', v.id, 'lead_no', v.lead_no, 'kind', 'lead_created',
                   'title', 'Lead created', 'detail', concat_ws(' · ', nullif(v.device, ''), nullif(v.issue, '')),
                   'actor', (select s.name from public.staff s where s.id = v.created_by),
                   'at', v.created_at) as e
            from vis v
          union all
          select jsonb_build_object('lead_id', a.lead_id, 'lead_no', v.lead_no, 'kind', 'assignment',
                   'title', case when a.from_user_id is null then 'Lead assigned' else 'Lead reassigned' end,
                   'detail', concat_ws(' → ', (select s.name from public.staff s where s.id = a.from_user_id),
                                              (select s.name from public.staff s where s.id = a.to_user_id))
                             || coalesce(' · ' || nullif(a.reason, ''), ''),
                   'actor', (select s.name from public.staff s where s.id = a.assigned_by), 'at', a.created_at)
            from public.lead_assignment_history a join vis v on v.id = a.lead_id
          union all
          select jsonb_build_object('lead_id', x.lead_id, 'lead_no', v.lead_no, 'kind', 'activity',
                   'title', initcap(replace(x.activity_type, '_', ' ')),
                   'detail', concat_ws(' · ', nullif(x.contact_status, ''), nullif(x.result, ''), nullif(x.note, '')),
                   'actor', (select s.name from public.staff s where s.id = x.actor_staff_id), 'at', x.occurred_at)
            from public.lead_activity_history x join vis v on v.id = x.lead_id
          union all
          select jsonb_build_object('lead_id', f.lead_id, 'lead_no', v.lead_no, 'kind', 'followup',
                   'title', 'Follow-up ' || f.status,
                   'detail', concat_ws(' · ', to_char(f.scheduled_at, 'DD Mon YYYY HH24:MI'), nullif(f.result, ''), nullif(f.comments, '')),
                   'actor', (select s.name from public.staff s where s.id = f.followup_user_id),
                   'at', coalesce(f.completed_at, f.created_at))
            from public.lead_followup_history f join vis v on v.id = f.lead_id
          union all
          select jsonb_build_object('lead_id', s2.lead_id, 'lead_no', v.lead_no, 'kind', 'status',
                   'title', 'Status changed',
                   'detail', concat_ws(' → ', nullif(s2.from_status, ''), s2.to_status) || coalesce(' · ' || nullif(s2.note, ''), ''),
                   'actor', (select s.name from public.staff s where s.id = s2.actor_staff_id), 'at', s2.changed_at)
            from public.lead_status_history s2 join vis v on v.id = s2.lead_id
          union all
          select jsonb_build_object('lead_id', c.lead_id, 'lead_no', v.lead_no, 'kind', 'conversion',
                   'title', initcap(replace(c.event_type, '_', ' ')),
                   'detail', concat_ws(' ', nullif(c.target_type, ''), nullif(c.target_id, '')),
                   'actor', (select s.name from public.staff s where s.id = c.actor_staff_id), 'at', c.occurred_at)
            from public.lead_conversion_history c join vis v on v.id = c.lead_id
        ) t), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.lead_customer_history(text) from public, anon;
grant execute on function public.lead_customer_history(text) to authenticated;

-- ── 8. lead_repeat_check — duplicate / repeat-enquiry awareness ─────────────
create or replace function public.lead_repeat_check(
  p_phone text default null, p_email text default null, p_customer_id text default null,
  p_device text default null, p_issue text default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_me     uuid := public.auth_staff_id();
  v_p10    text := public.normalize_customer_mobile(p_phone);
  v_em     text := public.normalize_customer_email(p_email);
  v_shared boolean;
  v_cust   public.customers;
begin
  if auth.uid() is null or v_org is null or v_me is null then return null; end if;
  if not public.auth_has_any(array['leads_search', 'leads_view', 'manage_sales']) then return null; end if;
  if v_p10 is null and v_em is null and coalesce(p_customer_id, '') = '' then
    return jsonb_build_object('customer', null, 'leads', '[]'::jsonb);
  end if;
  v_shared := public.auth_has_any(array['leads_shared_reference']);

  if public.auth_has_any(array['view_customers', 'view_customer_history', 'manage_customers']) then
    select * into v_cust from public.customers c
     where c.organization_id = v_org and c.deleted_at is null and public.auth_branch_visible(c.branch_id)
       and ( (coalesce(p_customer_id, '') <> '' and c.id = p_customer_id)
          or (v_p10 is not null and length(v_p10) >= 10 and (c.mobile_normalized = v_p10 or c.alt_mobile_normalized = v_p10))
          or (v_p10 is null and v_em is not null and c.email_normalized = v_em) )
     limit 1;
  end if;

  return jsonb_build_object(
    'customer', case when v_cust.id is null then null else jsonb_build_object(
        'id', v_cust.id,
        'name', coalesce(nullif(v_cust.full_name, ''), btrim(v_cust.first_name || ' ' || coalesce(v_cust.last_name, ''))),
        'mobile', v_cust.mobile, 'email', v_cust.email) end,
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'lead_no', l.lead_no, 'name', l.name, 'device', l.device, 'issue', l.issue,
        'status', l.status, 'contact_status', l.contact_status,
        'assigned_user_id', l.assigned_user_id, 'assigned_to_name', l.assigned_to_name,
        'created_at', l.created_at, 'is_owner', (l.assigned_user_id = v_me),
        'ordinary', public.lead_ordinary_visible(l),
        'similar', ( coalesce(p_device, '') <> '' and lower(coalesce(l.device, '')) like '%' || lower(btrim(p_device)) || '%'
                     and ( coalesce(p_issue, '') = '' or lower(coalesce(l.issue, '')) like '%' || lower(btrim(p_issue)) || '%' ) )
      ) order by l.created_at desc)
      from public.leads l
      where l.organization_id = v_org and l.deleted_at is null
        and public.auth_branch_visible(l.branch_id)
        and not (l.converted_at is not null or l.lost_at is not null
                 or lower(coalesce(l.status, '')) ~ '(lost|won|converted|closed|not qualified)')
        and ( (coalesce(p_customer_id, '') <> '' and l.customer_id = p_customer_id)
           or (v_cust.id is not null and l.customer_id = v_cust.id)
           or (v_p10 is not null and length(v_p10) >= 10 and l.mobile_normalized = v_p10)
           or (v_p10 is null and v_em is not null and l.email_normalized = v_em) )
        and ( v_shared or public.lead_ordinary_visible(l) )
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.lead_repeat_check(text, text, text, text, text) from public, anon;
grant execute on function public.lead_repeat_check(text, text, text, text, text) to authenticated;

-- ── 9. Handoff request + decision (never changes ownership by itself) ───────
create or replace function public.lead_request_handoff(p_lead_id uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me     uuid := public.auth_staff_id();
  v_me_nm  text;
  v_l      public.leads;
  v_id     uuid;
  r        record;
begin
  if auth.uid() is null or v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'handoff_reason_required' using errcode = '23514';
  end if;
  select * into v_l from public.leads where id = p_lead_id and deleted_at is null;
  if not found
     or not (public.auth_member_of_org(v_l.organization_id) and public.auth_branch_visible(v_l.branch_id))
     or not (coalesce(public.lead_ordinary_visible(v_l), false)
             or coalesce(public.auth_has_any(array['leads_shared_reference', 'leads_customer_history']), false)) then
    raise exception 'lead_not_found' using errcode = '42501';
  end if;
  if v_l.assigned_user_id = v_me then
    raise exception 'handoff_already_owner' using errcode = '23514';
  end if;
  if v_l.assigned_user_id is null then
    raise exception 'handoff_lead_unassigned' using errcode = '23514';
  end if;
  select s.name into v_me_nm from public.staff s where s.id = v_me;

  insert into public.lead_handoff_requests
    (organization_id, branch_id, lead_id, lead_no, customer_name, owner_staff_id, owner_name,
     requested_by, requested_by_name, reason, note)
  values (v_l.organization_id, v_l.branch_id, v_l.id, v_l.lead_no, v_l.name, v_l.assigned_user_id,
          (select s.name from public.staff s where s.id = v_l.assigned_user_id),
          v_me, v_me_nm, btrim(p_reason), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  -- Notify the current owner + managers who can reassign (existing notifications table).
  for r in
    select distinct s.id
    from public.staff s
    where s.organization_id = v_l.organization_id
      and coalesce(s.status, 'active') = 'active'
      and s.id <> v_me
      and ( s.id = v_l.assigned_user_id
            or exists (select 1 from public.role_permissions rp
                        where rp.role_id = s.role_id and rp.permission_key in ('leads_reassign', 'manage_sales'))
          )
      and ( s.id = v_l.assigned_user_id or v_l.branch_id is null
            or v_l.branch_id = any(public.staff_store_ids(s.id)) )
  loop
    insert into public.notifications
      (organization_id, branch_id, kind, title, body, recipient_id, href, reference, dedupe_key)
    values (v_l.organization_id, v_l.branch_id, 'lead_handoff_requested',
            'Handoff requested for ' || coalesce(v_l.lead_no, 'a lead'),
            coalesce(v_me_nm, 'An agent') || ' asked to take over ' || coalesce(v_l.name, 'this lead') || '. Reason: ' || btrim(p_reason),
            r.id, '/leads/' || v_l.id::text, v_l.lead_no, 'handoff:' || v_id::text || ':' || r.id::text)
    on conflict do nothing;
  end loop;

  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;
revoke all on function public.lead_request_handoff(uuid, text, text) from public, anon;
grant execute on function public.lead_request_handoff(uuid, text, text) to authenticated;

create or replace function public.lead_handoff_decide(p_request_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me    uuid := public.auth_staff_id();
  v_me_nm text;
  v_r     public.lead_handoff_requests;
  v_dec   text := lower(coalesce(p_decision, ''));
  v_mgr   boolean;
begin
  if auth.uid() is null or v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_r from public.lead_handoff_requests where id = p_request_id for update;
  if not found or not public.auth_member_of_org(v_r.organization_id) then
    raise exception 'request_not_found' using errcode = '42501';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'request_not_pending' using errcode = '23514';
  end if;
  v_mgr := public.auth_has_any(array['leads_reassign', 'assign', 'manage_sales']);
  select s.name into v_me_nm from public.staff s where s.id = v_me;

  if v_dec = 'cancel' then
    if v_r.requested_by <> v_me then raise exception 'handoff_forbidden' using errcode = '42501'; end if;
    update public.lead_handoff_requests set status = 'cancelled', decided_by = v_me, decided_by_name = v_me_nm,
           decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = v_r.id;
  elsif v_dec = 'decline' then
    if not (v_r.owner_staff_id = v_me or v_mgr) then raise exception 'handoff_forbidden' using errcode = '42501'; end if;
    update public.lead_handoff_requests set status = 'declined', decided_by = v_me, decided_by_name = v_me_nm,
           decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = v_r.id;
  elsif v_dec = 'approve' then
    -- The actual transfer goes through the normal, guarded UPDATE: leads_ownership_guard
    -- enforces reassign authority + new-owner eligibility and writes assignment history.
    update public.leads
       set assigned_user_id = v_r.requested_by,
           last_assignment_reason = 'Handoff request approved: ' || v_r.reason
     where id = v_r.lead_id and assigned_user_id is not distinct from v_r.owner_staff_id;
    if not found then raise exception 'handoff_owner_changed' using errcode = '23514'; end if;
    update public.lead_handoff_requests set status = 'approved', decided_by = v_me, decided_by_name = v_me_nm,
           decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = v_r.id;
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if v_dec in ('approve', 'decline') then
    insert into public.notifications
      (organization_id, branch_id, kind, title, body, recipient_id, href, reference, dedupe_key)
    values (v_r.organization_id, v_r.branch_id, 'lead_handoff_' || case v_dec when 'approve' then 'approved' else 'declined' end,
            'Handoff ' || case v_dec when 'approve' then 'approved' else 'declined' end || ' for ' || coalesce(v_r.lead_no, 'lead'),
            coalesce(v_me_nm, 'A manager') || ' ' || case v_dec when 'approve' then 'approved' else 'declined' end || ' your request.',
            v_r.requested_by, '/leads/' || v_r.lead_id::text, v_r.lead_no, 'handoff-decision:' || v_r.id::text)
    on conflict do nothing;
  end if;

  return jsonb_build_object('id', v_r.id, 'status', case v_dec when 'approve' then 'approved' when 'decline' then 'declined' else 'cancelled' end);
end;
$$;
revoke all on function public.lead_handoff_decide(uuid, text, text) from public, anon;
grant execute on function public.lead_handoff_decide(uuid, text, text) to authenticated;

-- Pending handoffs visible to the caller (owner / requester / managers via RLS).
-- (Reads go through lead_handoff_requests RLS directly.)
