-- ============================================================================
-- RepairOX — Customer Master Integration (Leads & Contacts)
--
-- Links CRM Leads and Contacts to the unified Customer Master.
-- Allows leads/contacts to reference their associated customer record.
--
-- DEPENDENCY: this file creates public.contacts with a FK to
-- public.companies(id). Run 0030b_companies.sql FIRST — that table did not
-- previously exist in the live database (confirmed by direct inspection),
-- so this migration would fail on "relation public.companies does not
-- exist" without it.
--
-- Safe to re-run: uses "if not exists" and "drop if exists" patterns.
-- ============================================================================

-- ── 1. Add customer_id to leads table ─────────────────────────────────────
alter table public.leads add column if not exists customer_id text references public.customers(id) on delete set null;

comment on column public.leads.customer_id is
  'Link to Customer Master. Populated when a lead is converted to a customer or when a contact is linked.';

-- ── 2. Add customer_id to contacts (if contacts table exists) ──────────────
-- Contacts are typically stored as part of the company/lead structure.
-- If there is a separate contacts table, add customer_id here.
-- For now, we assume contacts are embedded in leads or companies.

-- ── 3. Create a contacts table for CRM (optional but recommended) ──────────
-- This allows richer contact management: multiple people per company,
-- communication preferences, roles, etc.
create table if not exists public.contacts (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  customer_id     text references public.customers(id) on delete set null,
  company_id      text references public.companies(id) on delete set null,
  first_name      text not null,
  last_name       text,
  full_name       text,
  email           text,
  phone           text,
  mobile          text,
  designation     text,
  department      text,
  role            text,
  communication_preferences jsonb,  -- e.g. { email: true, phone: true, whatsapp: false }
  notes           text,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  deleted_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists contacts_org_idx on public.contacts(organization_id);
create index if not exists contacts_customer_idx on public.contacts(customer_id);
create index if not exists contacts_company_idx on public.contacts(company_id);

-- Keep updated_at fresh
drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Audit trail
drop trigger if exists contacts_audit on public.contacts;
create trigger contacts_audit
  after insert or update or delete on public.contacts
  for each row execute function public.fn_audit('Contact');

-- ── 4. Row Level Security for Contacts ───────────────────────────────────
alter table public.contacts enable row level security;

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['contacts_view', 'contacts_manage', 'manage_customers'])
  );

drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts
  for all using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['contacts_manage', 'contacts_create', 'manage_customers'])
  ) with check (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['contacts_manage', 'contacts_create', 'manage_customers'])
  );

-- ── 5. Realtime ──────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table public.contacts;
  end if;
end $$;

-- ── 6. Add indexes for performance ───────────────────────────────────────
create index if not exists leads_customer_id_idx on public.leads(customer_id);
