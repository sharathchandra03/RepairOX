-- ============================================================================
-- RepairOX — CRM Contact → Customer lifecycle
--
-- A Lead/Contact/Walk-In is a prospect identity. A Customer is created/linked
-- only when a real Ticket or normal Invoice is created, or an authorized user
-- explicitly promotes the prospect. Estimates and Proformas never promote.
--
-- Dependencies (lexical migration order):
--   0030b_companies.sql
--   0031_customer_master_integration.sql
--   0032_loyalty_ledger.sql
-- ============================================================================

-- ── 1. Canonical identity normalizers ───────────────────────────────────────
create or replace function public.normalize_customer_mobile(value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(right(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), 10), '');
$$;

create or replace function public.normalize_customer_email(value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(lower(btrim(coalesce(value, ''))), '');
$$;

-- Non-unique generated keys: safe with existing duplicates. Unique indexes are
-- intentionally deferred until the duplicate-review queue has been reconciled.
alter table public.customers
  add column if not exists mobile_normalized text
    generated always as (public.normalize_customer_mobile(mobile)) stored,
  add column if not exists email_normalized text
    generated always as (public.normalize_customer_email(email)) stored,
  add column if not exists company_id text references public.companies(id) on delete set null;

alter table public.contacts
  add column if not exists mobile_normalized text
    generated always as (public.normalize_customer_mobile(coalesce(nullif(mobile, ''), phone))) stored,
  add column if not exists email_normalized text
    generated always as (public.normalize_customer_email(email)) stored,
  add column if not exists source text,
  add column if not exists status text not null default 'active',
  add column if not exists owner text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists last_contact_at timestamptz;

alter table public.leads
  add column if not exists mobile_normalized text
    generated always as (public.normalize_customer_mobile(number)) stored,
  add column if not exists email_normalized text
    generated always as (public.normalize_customer_email(email)) stored,
  add column if not exists contact_id text references public.contacts(id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references public.staff(id) on delete set null,
  add column if not exists conversion_source text;

alter table public.walk_ins
  add column if not exists contact_id text references public.contacts(id) on delete set null;

alter table public.tickets
  add column if not exists contact_id text references public.contacts(id) on delete set null;

alter table public.invoices
  add column if not exists contact_id text references public.contacts(id) on delete set null;

create index if not exists customers_org_mobile_norm_idx
  on public.customers(organization_id, mobile_normalized)
  where mobile_normalized is not null and deleted_at is null;
create index if not exists customers_org_email_norm_idx
  on public.customers(organization_id, email_normalized)
  where email_normalized is not null and deleted_at is null;
create index if not exists contacts_org_mobile_norm_idx
  on public.contacts(organization_id, mobile_normalized)
  where mobile_normalized is not null and deleted_at is null;
create index if not exists contacts_org_email_norm_idx
  on public.contacts(organization_id, email_normalized)
  where email_normalized is not null and deleted_at is null;
create index if not exists leads_org_mobile_norm_idx
  on public.leads(organization_id, mobile_normalized)
  where mobile_normalized is not null and deleted_at is null;
create index if not exists leads_org_email_norm_idx
  on public.leads(organization_id, email_normalized)
  where email_normalized is not null and deleted_at is null;
create index if not exists leads_contact_idx on public.leads(contact_id);
create index if not exists walk_ins_contact_idx on public.walk_ins(contact_id);
create index if not exists tickets_contact_idx on public.tickets(contact_id);
create index if not exists invoices_contact_idx on public.invoices(contact_id);
create index if not exists customers_company_idx on public.customers(company_id);

-- 0019/0008 created these columns as plain text before 0031 could attach its
-- inline REFERENCES clause. Add named FKs explicitly. NOT VALID protects new
-- writes immediately without failing deployment on historical orphan values.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_customer_id_fkey') then
    alter table public.leads
      add constraint leads_customer_id_fkey foreign key (customer_id)
      references public.customers(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'walk_ins_customer_id_fkey') then
    alter table public.walk_ins
      add constraint walk_ins_customer_id_fkey foreign key (customer_id)
      references public.customers(id) on delete set null not valid;
  end if;
end $$;

create index if not exists leads_customer_id_idx on public.leads(customer_id);
create index if not exists walk_ins_customer_id_idx on public.walk_ins(customer_id);

-- ── 2. Contact RLS: create must not imply update/delete ──────────────────────
drop policy if exists contacts_write on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
drop policy if exists contacts_delete on public.contacts;

create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['contacts_create', 'contacts_manage', 'manage_customers'])
  );

create policy contacts_update on public.contacts
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['contacts_manage', 'manage_customers'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['contacts_manage', 'manage_customers'])
  );

create policy contacts_delete on public.contacts
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['contacts_manage', 'manage_customers'])
  );

-- Granular customer permissions must work at the DB layer too. Existing coarse
-- policies remain for backward compatibility; these operation-specific policies
-- add precise grants without role checks.
drop policy if exists customers_granular_select on public.customers;
create policy customers_granular_select on public.customers
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['view_customers', 'view_customer_history', 'create_customer', 'edit_customer', 'delete_customer', 'merge_customer', 'manage_customers'])
  );

drop policy if exists customers_granular_insert on public.customers;
create policy customers_granular_insert on public.customers
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['create_customer', 'manage_customers'])
  );

drop policy if exists customers_granular_update on public.customers;
create policy customers_granular_update on public.customers
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['edit_customer', 'merge_customer', 'manage_customers'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['edit_customer', 'merge_customer', 'manage_customers'])
  );

-- ── 3. Safe existing-lead → Contact reconciliation ──────────────────────────
-- Create/reuse one prospect Contact per normalized lead identity. This never
-- creates Customers and never deletes data. Leads without phone/email remain
-- one Contact per Lead so distinct anonymous prospects are not accidentally
-- merged.
insert into public.contacts(
  id, organization_id, branch_id, first_name, last_name, full_name,
  email, phone, mobile, created_at, updated_at
)
select
  'CON-' || upper(substr(md5(l.id::text), 1, 12)),
  l.organization_id,
  l.branch_id,
  split_part(coalesce(nullif(btrim(l.name), ''), 'Prospect'), ' ', 1),
  nullif(btrim(substr(coalesce(l.name, ''), length(split_part(coalesce(l.name, ''), ' ', 1)) + 1)), ''),
  coalesce(nullif(btrim(l.name), ''), 'Prospect'),
  nullif(btrim(l.email), ''),
  nullif(btrim(l.number), ''),
  nullif(btrim(l.number), ''),
  coalesce(l.created_at, now()),
  now()
from public.leads l
where l.deleted_at is null
  and l.contact_id is null
  and not exists (
    select 1 from public.contacts c
    where c.organization_id = l.organization_id
      and c.deleted_at is null
      and (
        (l.mobile_normalized is not null and c.mobile_normalized = l.mobile_normalized)
        or (l.email_normalized is not null and c.email_normalized = l.email_normalized)
      )
  )
on conflict (id) do nothing;

update public.leads l
set contact_id = coalesce(
  (
    select c.id from public.contacts c
    where c.organization_id = l.organization_id
      and c.deleted_at is null
      and (
        (l.mobile_normalized is not null and c.mobile_normalized = l.mobile_normalized)
        or (l.email_normalized is not null and c.email_normalized = l.email_normalized)
      )
    order by (c.customer_id is not null) desc, c.created_at asc
    limit 1
  ),
  'CON-' || upper(substr(md5(l.id::text), 1, 12))
)
where l.deleted_at is null and l.contact_id is null;

-- Preserve existing Customer links on the newly-associated Contact, but never
-- create a Customer as part of reconciliation.
update public.contacts c
set customer_id = l.customer_id
from public.leads l
where l.contact_id = c.id
  and l.customer_id is not null
  and c.customer_id is null;

-- ── 4. Atomic promotion RPC (service-role only) ──────────────────────────────
-- Authorization is performed by /api/customers/promote before this RPC. The
-- RPC then locks identity + source rows and performs Customer creation/linking
-- in one PostgreSQL transaction.
create or replace function public.promote_customer(
  p_organization_id uuid,
  p_actor_id uuid,
  p_trigger text,
  p_contact_id text default null,
  p_lead_id uuid default null,
  p_walk_in_id text default null,
  p_existing_customer_id text default null,
  p_snapshot jsonb default '{}'::jsonb,
  p_reason text default null,
  p_allow_create boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
  v_lead public.leads%rowtype;
  v_walk_in public.walk_ins%rowtype;
  v_customer public.customers%rowtype;
  v_first text;
  v_last text;
  v_mobile text;
  v_email text;
  v_company text;
  v_address text;
  v_source text;
  v_mobile_norm text;
  v_email_norm text;
  v_match_count integer;
  v_customer_id text;
  v_created boolean := false;
begin
  if p_trigger not in ('ticket', 'invoice', 'manual') then
    raise exception using errcode = '22023', message = 'invalid_promotion_trigger';
  end if;

  if p_contact_id is not null then
    select * into v_contact from public.contacts
    where id = p_contact_id and organization_id = p_organization_id and deleted_at is null
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'contact_not_found'; end if;
  end if;

  if p_lead_id is not null then
    select * into v_lead from public.leads
    where id = p_lead_id and organization_id = p_organization_id and deleted_at is null
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'lead_not_found'; end if;
  end if;

  if p_walk_in_id is not null then
    select * into v_walk_in from public.walk_ins
    where id = p_walk_in_id and organization_id = p_organization_id and deleted_at is null
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'walk_in_not_found'; end if;
  end if;

  v_first := coalesce(nullif(btrim(v_contact.first_name), ''), nullif(btrim(split_part(v_lead.name, ' ', 1)), ''), nullif(btrim(split_part(v_walk_in.customer, ' ', 1)), ''), nullif(btrim(p_snapshot->>'firstName'), ''), 'Customer');
  v_last := coalesce(nullif(btrim(v_contact.last_name), ''), nullif(btrim(substr(coalesce(v_lead.name, ''), length(split_part(coalesce(v_lead.name, ''), ' ', 1)) + 1)), ''), nullif(btrim(substr(coalesce(v_walk_in.customer, ''), length(split_part(coalesce(v_walk_in.customer, ''), ' ', 1)) + 1)), ''), nullif(btrim(p_snapshot->>'lastName'), ''), '');
  v_mobile := coalesce(nullif(btrim(v_contact.mobile), ''), nullif(btrim(v_contact.phone), ''), nullif(btrim(v_lead.number), ''), nullif(btrim(v_walk_in.phone), ''), nullif(btrim(p_snapshot->>'mobile'), ''), '');
  v_email := coalesce(nullif(btrim(v_contact.email), ''), nullif(btrim(v_lead.email), ''), nullif(btrim(p_snapshot->>'email'), ''), '');
  v_company := coalesce(nullif(btrim(p_snapshot->>'company'), ''), '');
  v_address := coalesce(nullif(btrim(v_lead.location), ''), nullif(btrim(p_snapshot->>'address'), ''), '');
  v_source := coalesce(nullif(btrim(p_snapshot->>'source'), ''), case when p_lead_id is not null then 'sales' else 'direct_walkin' end);
  v_mobile_norm := public.normalize_customer_mobile(v_mobile);
  v_email_norm := public.normalize_customer_email(v_email);

  -- Serialize concurrent promotion of the same org+identity.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || coalesce(v_mobile_norm, v_email_norm, p_contact_id, p_lead_id::text, p_walk_in_id, md5(p_snapshot::text)), 0));

  if p_existing_customer_id is not null then
    select * into v_customer from public.customers
    where id = p_existing_customer_id and organization_id = p_organization_id and deleted_at is null
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'customer_not_found'; end if;
  elsif v_contact.customer_id is not null then
    select * into v_customer from public.customers
    where id = v_contact.customer_id and organization_id = p_organization_id and deleted_at is null
    for update;
  elsif v_lead.customer_id is not null then
    select * into v_customer from public.customers
    where id = v_lead.customer_id and organization_id = p_organization_id and deleted_at is null
    for update;
  else
    select count(*) into v_match_count
    from public.customers c
    where c.organization_id = p_organization_id and c.deleted_at is null
      and (
        (v_mobile_norm is not null and c.mobile_normalized = v_mobile_norm)
        or (v_email_norm is not null and c.email_normalized = v_email_norm)
      );
    if v_match_count > 1 then
      raise exception using errcode = 'P0001', message = 'duplicate_customer_conflict';
    end if;
    select * into v_customer
    from public.customers c
    where c.organization_id = p_organization_id and c.deleted_at is null
      and (
        (v_mobile_norm is not null and c.mobile_normalized = v_mobile_norm)
        or (v_email_norm is not null and c.email_normalized = v_email_norm)
      )
    order by c.created_at asc limit 1 for update;
  end if;

  if v_customer.id is null then
    if not p_allow_create then
      raise exception using errcode = '42501', message = 'customer_create_not_allowed';
    end if;
    v_customer_id := 'CUS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.customers(
      id, organization_id, branch_id, type, source, first_name, last_name,
      full_name, mobile, email, company, address, status, created_by
    ) values (
      v_customer_id, p_organization_id,
      coalesce(v_contact.branch_id, v_lead.branch_id, v_walk_in.branch_id),
      case when v_company <> '' then 'business' else coalesce(nullif(p_snapshot->>'type', ''), 'personal') end,
      v_source, v_first, v_last, btrim(v_first || ' ' || v_last), v_mobile,
      v_email, v_company, v_address, 'active', p_actor_id
    ) returning * into v_customer;
    v_created := true;
  end if;

  if p_contact_id is not null then
    update public.contacts set customer_id = v_customer.id, updated_by = p_actor_id where id = p_contact_id;
  end if;
  if p_lead_id is not null then
    update public.leads
      set customer_id = v_customer.id,
          contact_id = coalesce(contact_id, p_contact_id),
          converted_at = coalesce(converted_at, now()),
          converted_by = coalesce(converted_by, p_actor_id),
          conversion_source = coalesce(conversion_source, p_trigger),
          updated_by = p_actor_id
      where id = p_lead_id;
  end if;
  if p_walk_in_id is not null then
    update public.walk_ins
      set customer_id = v_customer.id,
          contact_id = coalesce(contact_id, p_contact_id),
          updated_by = p_actor_id
      where id = p_walk_in_id;
  end if;

  insert into public.audit_log(
    organization_id, branch_id, module, entity_type, record_id, action_type,
    action, severity, description, reason, performed_by, created_at
  ) values (
    p_organization_id, coalesce(v_contact.branch_id, v_lead.branch_id, v_walk_in.branch_id),
    'Customer', 'Customer', v_customer.id, 'PROMOTE',
    case when v_created then 'Customer Created from Prospect' else 'Prospect Linked to Customer' end,
    'success',
    'CRM prospect promoted/linked from ' || p_trigger,
    p_reason, p_actor_id, now()
  );

  return jsonb_build_object(
    'customerId', v_customer.id,
    'created', v_created,
    'contactId', p_contact_id,
    'leadId', p_lead_id,
    'walkInId', p_walk_in_id
  );
end;
$$;

revoke all on function public.promote_customer(uuid, uuid, text, text, uuid, text, text, jsonb, text, boolean) from public;
revoke all on function public.promote_customer(uuid, uuid, text, text, uuid, text, text, jsonb, text, boolean) from anon;
revoke all on function public.promote_customer(uuid, uuid, text, text, uuid, text, text, jsonb, text, boolean) from authenticated;
grant execute on function public.promote_customer(uuid, uuid, text, text, uuid, text, text, jsonb, text, boolean) to service_role;

-- ── 5. Read-only reconciliation views (security invoker = caller RLS) ───────
create or replace view public.customer_duplicate_candidates
with (security_invoker = true)
as
select
  organization_id,
  'mobile'::text as match_type,
  mobile_normalized as match_value,
  array_agg(id order by created_at) as customer_ids,
  count(*)::integer as candidate_count
from public.customers
where deleted_at is null and mobile_normalized is not null
group by organization_id, mobile_normalized
having count(*) > 1
union all
select
  organization_id,
  'email'::text,
  email_normalized,
  array_agg(id order by created_at),
  count(*)::integer
from public.customers
where deleted_at is null and email_normalized is not null
group by organization_id, email_normalized
having count(*) > 1;

grant select on public.customer_duplicate_candidates to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table public.contacts;
  end if;
end $$;
