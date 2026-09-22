-- ============================================================================
-- RepairOX — Companies (CRM Company Master)
--
-- CRITICAL FIX: application code (store.tsx addCompany/updateCompany/
-- deleteCompany, the initial data load, and Leads → Add Company modal) has
-- referenced public.companies since it was built, but no migration ever
-- created the table — every read/write has been failing silently (caught,
-- logged, swallowed) in production. This migration creates it, matching the
-- exact column names companyToRow()/rowToCompany() in store.tsx expect.
--
-- Numbered 0030b (between 0030_multi_store_access_capability.sql and
-- 0031_customer_master_integration.sql) because 0031's `contacts` table has
-- an FK to public.companies(id) and cannot be applied until this table
-- exists. Apply this BEFORE 0031.
--
-- Safe to re-run: uses "if not exists" / "drop if exists" patterns throughout.
-- Run in Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.companies (
  id                       text primary key,
  organization_id          uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id                uuid default public.auth_branch_id() references public.branches(id) on delete set null,

  name                     text not null,
  company_type             text default 'pvt_ltd',
  industry                 text,
  business_category        text,
  business_size            text default 'small',
  number_of_employees      text,
  annual_revenue           text,
  gst_number               text,
  pan_number               text,
  website                  text,
  owner                    text,
  branch                   text,
  assigned_employee        text,
  status                   text not null default 'active',

  -- Structured sub-objects — stored as JSONB, matching customers/contacts
  -- conventions elsewhere in this schema (see communication_preferences on
  -- public.contacts, 0031_customer_master_integration.sql).
  phones                   jsonb not null default '[]'::jsonb,
  emails                   jsonb not null default '[]'::jsonb,
  communication_preferences jsonb not null default '{"email": true, "phone": true, "whatsapp": false}'::jsonb,
  address_data             jsonb not null default '{}'::jsonb,
  business_details         jsonb not null default '{}'::jsonb,
  social_links             jsonb not null default '{}'::jsonb,

  notes                    text,

  -- Denormalized relationship counts, kept in sync by application code
  -- (same pattern as customers.total_tickets / lifetime_value).
  total_contacts           integer not null default 0,
  total_deals              integer not null default 0,
  total_tickets            integer not null default 0,
  total_invoices           integer not null default 0,
  lifetime_value           numeric not null default 0,

  workspace                text default 'leads',

  created_by               uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by               uuid references public.staff(id) on delete set null,
  deleted_by               uuid references public.staff(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index if not exists companies_org_idx on public.companies(organization_id);
create index if not exists companies_name_idx on public.companies(name);
create index if not exists companies_gst_idx on public.companies(gst_number) where gst_number is not null and gst_number <> '';

comment on table public.companies is
  'CRM Company Master (Leads module). Referenced by public.contacts.company_id (0031_customer_master_integration.sql) — must exist before that migration runs.';

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

drop trigger if exists companies_audit on public.companies;
create trigger companies_audit
  after insert or update or delete on public.companies
  for each row execute function public.fn_audit('Company');

-- ── Row Level Security ───────────────────────────────────────────────────
alter table public.companies enable row level security;

-- Uses the same granular Companies keys already defined in permissions.ts
-- (companies_view / companies_create / companies_edit / companies_delete),
-- OR the coarse manage_sales/manage_customers fallback, matching the
-- CAP.customer.* fallback convention used across this codebase.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['companies_view', 'manage_sales', 'manage_customers'])
  );

drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies
  for all using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['companies_create', 'companies_edit', 'companies_delete', 'manage_sales', 'manage_customers'])
  ) with check (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['companies_create', 'companies_edit', 'companies_delete', 'manage_sales', 'manage_customers'])
  );

-- ── Realtime ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'companies'
  ) then
    alter publication supabase_realtime add table public.companies;
  end if;
end $$;
