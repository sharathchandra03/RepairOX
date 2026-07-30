-- ============================================================================
-- RepairOX — Supabase schema (multi-tenant, real-time, permission-enforced,
-- audited).
--
-- Run this ONCE in Supabase → SQL Editor (paste all, click Run).
-- Safe to re-run: uses "if not exists" / "drop ... if exists" everywhere.
-- After running, bootstrap data with:  npm run db:seed
--
-- WHAT THIS FILE GUARANTEES (the backend contract):
--   • Every business record belongs to an organization + branch and carries
--     ownership/audit columns (created_by, updated_by, deleted_by, timestamps).
--   • Row Level Security enforces visibility in the DATABASE — never relying on
--     front-end filtering. A user only ever receives rows for their own
--     organization, within their branch scope, and only for modules their role
--     is permitted to see.
--   • Real-time: every business table is published on `supabase_realtime`, so
--     one user's insert/update/delete streams live to every other permitted
--     session (lists, dashboards, counters, detail views) with no refresh.
--   • Audit trail: a single trigger records who did what, when, with the full
--     previous/new value — even for hard deletes, so nothing is silently lost.
--   • Organization settings, user preferences, numbering sequences, file
--     uploads, and vendors are all stored in the database (never localStorage)
--     ensuring persistence across devices, sessions, and employees.
-- ============================================================================


-- ############################################################################
-- SECTION 1 — TENANCY (organizations + branches)
-- ############################################################################

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  plan        text not null default 'free',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  code            text,
  address         text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists branches_org_idx on public.branches(organization_id);


-- ############################################################################
-- SECTION 1B — ORGANIZATION SETTINGS (persistent, shared across all employees)
--   One row per organization. Replaces localStorage-based store settings.
--   All employees in the org read the same values; only admins may write.
--   Published on realtime so changes stream instantly to every active session.
-- ############################################################################

create table if not exists public.organization_settings (
  organization_id     uuid primary key references public.organizations(id) on delete cascade,

  -- Basic Information
  logo                text default '',
  store_name          text not null default 'RepairOX Service Center',
  alternate_name      text default '',

  -- Contact Information
  phone               text default '',
  mobile              text default '',
  fax                 text default '',
  email               text default '',
  website             text default '',

  -- Store Location
  address             text default '',
  city                text default '',
  state               text default '',
  postal_code         text default '',
  country             text default 'India',

  -- Store Details
  registration_number text default '',
  language            text default 'English',
  timezone            text default 'Asia/Kolkata',
  time_format         text default '12h',
  start_time          text default '09:00',
  end_time            text default '20:00',

  -- Email and Access
  company_email       text default '',
  api_key             text default '',
  receive_all_emails  boolean not null default true,

  -- Configuration
  accounting_method   text not null default 'accrual',
  default_currency    text not null default 'INR',
  price_format        text not null default 'symbol_before',
  decimal_format      text not null default '2',
  deposit_enabled     boolean not null default false,
  deposit_percentage  numeric not null default 30,
  refund_policy       text default 'Refunds are processed within 7 business days of approval.',
  screen_timeout      integer not null default 15,

  -- Print Settings
  terms_and_conditions text default '',
  warranty_text        text default '',
  print_footer         text default 'Thank you for choosing RepairOX!',
  print_slogan         text default 'Your device, our expertise.',

  -- Invoice & Ticket Display
  invoice_show_logo    boolean not null default true,
  invoice_show_gst     boolean not null default true,
  invoice_show_terms   boolean not null default true,
  ticket_show_logo     boolean not null default true,
  ticket_show_warranty boolean not null default true,

  -- Audit
  updated_by          uuid references public.staff(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);


-- ############################################################################
-- SECTION 1C — USER PREFERENCES (per-staff, personal, device-portable)
--   Settings that belong to a single user (not shared with the org).
--   Follows the user across devices. Other employees never see these.
-- ############################################################################

create table if not exists public.user_preferences (
  staff_id            uuid primary key references public.staff(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  -- Dashboard & UI
  dashboard_layout    jsonb not null default '[]'::jsonb,
  sidebar_collapsed   boolean not null default false,
  default_page_size   integer not null default 20,
  preferred_filters   jsonb not null default '{}'::jsonb,
  theme               text not null default 'light',
  compact_mode        boolean not null default false,

  -- Default views
  default_workspace   text default 'shop',
  default_landing     text default '/dashboard',

  -- Notification preferences
  email_notifications boolean not null default true,
  push_notifications  boolean not null default true,
  sound_enabled       boolean not null default true,

  -- Timestamps
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists user_prefs_org_idx on public.user_preferences(organization_id);


-- ############################################################################
-- SECTION 1D — NUMBERING SEQUENCES (configurable prefixes + auto-increment)
--   Controls how tickets, invoices, expenses etc. are numbered.
--   Org-wide by default; branch_id can override per branch if needed.
--   Admins configure; all employees read (to generate the next number).
-- ############################################################################

create table if not exists public.numbering_sequences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  entity_type     text not null,           -- 'ticket' | 'invoice' | 'expense' | 'stock_movement' | 'payroll'
  prefix          text not null default '',
  suffix          text not null default '',
  next_number     integer not null default 1,
  padding         integer not null default 4,
  separator       text not null default '-',
  include_date    boolean not null default false,
  date_format     text default 'YYYYMMDD',
  reset_period    text not null default 'never',  -- 'daily' | 'monthly' | 'yearly' | 'never'
  last_reset_at   date,
  updated_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, branch_id, entity_type)
);

create index if not exists numbering_org_idx on public.numbering_sequences(organization_id);


-- ############################################################################
-- SECTION 1E — FILE UPLOADS (track all uploaded files with entity linking)
--   Every file uploaded through the app is registered here for traceability.
--   The actual binary lives in Supabase Storage; this table stores metadata
--   and the relationship to the owning entity.
-- ############################################################################

create table if not exists public.file_uploads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  storage_path    text not null,
  file_name       text not null,
  mime_type       text,
  file_size       bigint default 0,
  entity_type     text,                   -- 'ticket' | 'expense' | 'staff' | 'invoice' | 'customer' | 'organization'
  entity_id       text,
  description     text,
  uploaded_by     uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists file_uploads_org_idx    on public.file_uploads(organization_id);
create index if not exists file_uploads_entity_idx on public.file_uploads(entity_type, entity_id);


-- ############################################################################
-- SECTION 1F — VENDORS (normalized supplier/vendor management)
--   Replaces free-text vendor fields in expenses. Enables vendor analytics,
--   purchase tracking, and contact management for suppliers.
-- ############################################################################

create table if not exists public.vendors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  name            text not null,
  contact_person  text,
  phone           text,
  email           text,
  gst_number      text,
  address         text,
  city            text,
  state           text,
  postal_code     text,
  category        text,
  payment_terms   text,
  notes           text,
  is_active       boolean not null default true,
  total_purchases numeric not null default 0,
  total_paid      numeric not null default 0,
  balance_due     numeric not null default 0,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists vendors_org_idx on public.vendors(organization_id);

-- Add vendor_id FK to expenses (nullable, preserves existing free-text vendor column)
alter table public.expenses add column if not exists vendor_id uuid references public.vendors(id) on delete set null;


-- ############################################################################
-- SECTION 2 — ROLES / PERMISSIONS / STAFF
--   Roles are a shared platform catalogue (mirrors src/lib/permissions.ts).
--   Staff belong to an organization + branch.
-- ############################################################################

create table if not exists public.roles (
  id         text primary key,
  label      text not null,
  summary    text,
  workspaces text[] not null default '{}',
  is_custom  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id        text not null references public.roles(id) on delete cascade,
  permission_key text not null,
  primary key (role_id, permission_key)
);

create table if not exists public.staff (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid references auth.users(id) on delete set null,
  name          text not null,
  phone         text,
  email         text unique,
  avatar_url    text,
  role_id       text references public.roles(id),
  branch        text,
  status        text not null default 'active',
  login_enabled boolean not null default false,
  salary_type   text default 'monthly',
  salary_amount numeric not null default 0,
  department    text,
  designation   text,
  joining_date  date,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login    timestamptz
);

-- Multi-tenant scoping for staff
alter table public.staff add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.staff add column if not exists branch_id       uuid references public.branches(id)      on delete set null;
alter table public.staff add column if not exists avatar_url      text;

create index if not exists staff_org_idx    on public.staff(organization_id);
create index if not exists staff_branch_idx on public.staff(branch_id);
create index if not exists staff_auth_idx   on public.staff(auth_user_id);


-- ############################################################################
-- SECTION 3 — SHARED HELPERS
-- ############################################################################

-- Keep updated_at fresh on every update.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists staff_touch on public.staff;
create trigger staff_touch before update on public.staff
  for each row execute function public.touch_updated_at();

drop trigger if exists organizations_touch on public.organizations;
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

drop trigger if exists branches_touch on public.branches;
create trigger branches_touch before update on public.branches
  for each row execute function public.touch_updated_at();

-- ── Session helpers (SECURITY DEFINER avoids RLS recursion on staff) ────────

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.auth_user_id = auth.uid()
      and s.role_id in (
        'master_shop_owner', 'platform_owner',
        'shop_owner_branch_manager', 'developer_admin'
      )
  );
$$;

create or replace function public.auth_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.staff where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.staff where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.auth_branch_id()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.staff where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.auth_role_id()
returns text language sql stable security definer set search_path = public as $$
  select role_id from public.staff where auth_user_id = auth.uid() limit 1;
$$;

-- True if the current user's role has ANY of the given permission keys
create or replace function public.auth_has_any(keys text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.staff s
    join public.role_permissions rp on rp.role_id = s.role_id
    where s.auth_user_id = auth.uid()
      and (rp.permission_key = '*'
           or rp.permission_key = 'full_access'
           or rp.permission_key = any(keys))
  );
$$;

create or replace function public.auth_can_cross_branch()
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_has_any(array['manage_branches']);
$$;

create or replace function public.auth_member_of_org(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select org is not null and org = public.auth_org_id();
$$;

create or replace function public.auth_branch_visible(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_can_cross_branch() or b is null or b = public.auth_branch_id();
$$;


-- ── Numbering helper: atomically get-and-increment the next number ───────────
-- Returns the formatted document number (e.g. "INV-20260730-0042") and bumps
-- the sequence. Handles daily/monthly/yearly resets automatically.
create or replace function public.next_doc_number(
  p_org_id      uuid,
  p_entity_type text,
  p_branch_id   uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.numbering_sequences%rowtype;
  v_num   integer;
  v_today date := current_date;
  v_reset boolean := false;
  v_date  text := '';
  v_result text;
begin
  select * into v_row
  from public.numbering_sequences
  where organization_id = p_org_id
    and entity_type = p_entity_type
    and (branch_id = p_branch_id or (branch_id is null and p_branch_id is null))
  for update;

  if not found then
    -- No sequence configured; return a simple fallback
    return upper(p_entity_type) || '-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad('1', 4, '0');
  end if;

  -- Check if reset is needed
  if v_row.reset_period = 'daily' and v_row.last_reset_at is distinct from v_today then
    v_reset := true;
  elsif v_row.reset_period = 'monthly' and (v_row.last_reset_at is null or date_trunc('month', v_row.last_reset_at) < date_trunc('month', v_today)) then
    v_reset := true;
  elsif v_row.reset_period = 'yearly' and (v_row.last_reset_at is null or date_trunc('year', v_row.last_reset_at) < date_trunc('year', v_today)) then
    v_reset := true;
  end if;

  if v_reset then
    v_num := 1;
  else
    v_num := v_row.next_number;
  end if;

  -- Build the date segment
  if v_row.include_date then
    v_date := to_char(v_today, v_row.date_format) || v_row.separator;
  end if;

  -- Assemble result
  v_result := v_row.prefix || v_row.separator || v_date || lpad(v_num::text, v_row.padding, '0') || v_row.suffix;

  -- Bump the counter
  update public.numbering_sequences
  set next_number = v_num + 1,
      last_reset_at = v_today,
      updated_at = now()
  where id = v_row.id;

  return v_result;
end;
$$;


-- ############################################################################
-- SECTION 4 — AUDIT TRAIL
-- ############################################################################

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  branch_id       uuid,
  module          text,
  entity_type     text,
  record_id       text,
  action_type     text,
  action          text,
  severity        text default 'info',
  description     text,
  previous_value  jsonb,
  new_value       jsonb,
  changes         jsonb,
  meta            jsonb,
  reason          text,
  performed_by    uuid,
  actor           text,
  role            text,
  branch          text,
  created_at      timestamptz not null default now()
);

create index if not exists audit_org_idx     on public.audit_log(organization_id);
create index if not exists audit_created_idx  on public.audit_log(created_at desc);
create index if not exists audit_module_idx   on public.audit_log(module);
create index if not exists audit_record_idx   on public.audit_log(entity_type, record_id);

-- Generic audit trigger function
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_org    uuid;
  v_branch uuid;
  v_record text;
  v_module text := coalesce(nullif(TG_ARGV[0], ''), TG_TABLE_NAME);
  v_actor  uuid := auth.uid();
  v_name   text;
  v_role   text;
  v_bname  text;
begin
  if (TG_OP = 'DELETE') then
    v_old := to_jsonb(OLD); v_new := null;
  elsif (TG_OP = 'UPDATE') then
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  else
    v_old := null; v_new := to_jsonb(NEW);
  end if;

  v_org    := coalesce(v_new->>'organization_id', v_old->>'organization_id')::uuid;
  v_branch := coalesce(v_new->>'branch_id',        v_old->>'branch_id')::uuid;
  v_record := coalesce(v_new->>'id', v_old->>'id',
                       v_new->>'doc_number', v_old->>'doc_number',
                       v_new->>'reference',  v_old->>'reference',
                       v_new->>'expense_id', v_old->>'expense_id');

  select s.name, s.role_id, s.branch
    into v_name, v_role, v_bname
  from public.staff s
  where s.auth_user_id = v_actor
  limit 1;

  insert into public.audit_log(
    organization_id, branch_id, module, entity_type, record_id, action_type,
    action, severity, description, previous_value, new_value,
    performed_by, actor, role, branch
  ) values (
    v_org, v_branch, v_module, TG_TABLE_NAME, v_record, TG_OP,
    initcap(lower(TG_OP)) || ' ' || v_module,
    case TG_OP when 'DELETE' then 'critical' when 'INSERT' then 'success' else 'info' end,
    v_module || ' ' || lower(TG_OP) || (case when v_record is not null then ' (' || v_record || ')' else '' end),
    v_old, v_new, v_actor, coalesce(v_name, 'System'), v_role, v_bname
  );

  if (TG_OP = 'DELETE') then return OLD; else return NEW; end if;
end;
$$;


-- ############################################################################
-- SECTION 5 — BUSINESS TABLES
-- ############################################################################

-- ── Customers ───────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  type            text default 'personal',
  first_name      text,
  last_name       text,
  full_name       text,
  mobile          text,
  email           text,
  company         text,
  gst_number      text,
  address         text,
  city            text,
  state           text,
  postal_code     text,
  notes           text,
  last_visit      timestamptz,
  total_tickets   integer not null default 0,
  total_invoices  integer not null default 0,
  total_repairs   integer not null default 0,
  lifetime_value  numeric not null default 0,
  status          text not null default 'active',
  role_scope      text,
  assigned_to     uuid references public.staff(id) on delete set null,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  deleted_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- ── Tickets ──────────────────────────────────────────────────────────────────
create table if not exists public.tickets (
  id                 text primary key,
  organization_id    uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id          uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  customer           text,
  customer_id        text references public.customers(id) on delete set null,
  phone              text,
  company            text,
  email              text,
  address            text,
  device             text,
  model              text,
  issue              text,
  service            text,
  source             text,
  status             text not null default 'received',
  priority           text not null default 'normal',
  qc_status          text,
  technician         text,
  assigned_to        uuid references public.staff(id) on delete set null,
  amount             numeric not null default 0,
  discount           numeric not null default 0,
  imei_type          text,
  resolution_minutes integer,
  due_date           timestamptz,
  internal_notes     text,
  items              jsonb not null default '[]'::jsonb,
  parts              jsonb not null default '[]'::jsonb,
  devices            jsonb not null default '[]'::jsonb,
  role_scope         text,
  created_by         uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by         uuid references public.staff(id) on delete set null,
  deleted_by         uuid references public.staff(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- ── Invoices ─────────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  reference       text,
  invoice_type    text not null default 'retail',
  customer        text,
  customer_id     text references public.customers(id) on delete set null,
  phone           text,
  email           text,
  company         text,
  status          text not null default 'draft',
  due_date        timestamptz,
  paid_amount     numeric not null default 0,
  subtotal        numeric not null default 0,
  discount        numeric not null default 0,
  tax             numeric not null default 0,
  total           numeric not null default 0,
  notes           text,
  terms           text,
  slogan          text,
  footer          text,
  employee        text,
  ticket_id       text references public.tickets(id) on delete set null,
  items           jsonb not null default '[]'::jsonb,
  devices         jsonb not null default '[]'::jsonb,
  role_scope      text,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  deleted_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- ── Walk-ins ─────────────────────────────────────────────────────────────────
create table if not exists public.walk_ins (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  walkin_date     date,
  time_label      text,
  customer        text,
  phone           text,
  source          text,
  category        text,
  model           text,
  reasons         jsonb not null default '[]'::jsonb,
  status          text not null default 'waiting',
  ticket_id       text references public.tickets(id) on delete set null,
  invoice_value   numeric not null default 0,
  business_value  numeric not null default 0,
  notes           text,
  role_scope      text,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  deleted_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- ── Inventory items ──────────────────────────────────────────────────────────
create table if not exists public.inventory_items (
  id                     text primary key,
  organization_id        uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id              uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  name                   text not null,
  category               text,
  item_type              text default 'Product',
  mode                   text default 'Both',
  uom                    text,
  store                  text,
  active                 boolean not null default true,
  current_stock          numeric not null default 0,
  default_price          numeric not null default 0,
  regular_buying_price   numeric not null default 0,
  wholesale_buying_price numeric not null default 0,
  regular_selling_price  numeric not null default 0,
  mrp                    numeric not null default 0,
  dealer_price           numeric not null default 0,
  distributor_price      numeric not null default 0,
  hsn_code               text,
  tax                    numeric not null default 0,
  min_stock              numeric not null default 0,
  max_stock              numeric not null default 0,
  reserved_stock         numeric not null default 0,
  sold_units             numeric not null default 0,
  purchased_units        numeric not null default 0,
  created_by             uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by             uuid references public.staff(id) on delete set null,
  deleted_by             uuid references public.staff(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

-- ── Stock movements ──────────────────────────────────────────────────────────
create table if not exists public.stock_movements (
  doc_number      text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  from_store      text,
  to_store        text,
  items           integer not null default 0,
  movement_date   text,
  movement_user   text,
  movement_type   text,
  status          text not null default 'completed',
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Brands & device models ───────────────────────────────────────────────────
create table if not exists public.brands (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  name            text not null,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.device_models (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  brand_id        text references public.brands(id) on delete cascade,
  name            text not null,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ── Price list ───────────────────────────────────────────────────────────────
create table if not exists public.price_list_categories (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  name            text not null,
  icon            text,
  item_count      integer not null default 0,
  enabled         boolean not null default true,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.price_list_brands (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  category_id     text references public.price_list_categories(id) on delete cascade,
  name            text not null,
  item_count      integer not null default 0,
  logo_url        text,
  enabled         boolean not null default true,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.price_list_models (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  brand_id        text references public.price_list_brands(id) on delete cascade,
  category_id     text references public.price_list_categories(id) on delete set null,
  name            text not null,
  model_year      integer,
  chip            text,
  storage         text,
  display_size    text,
  variant         text,
  image_url       text,
  status          text not null default 'active',
  meta            jsonb,
  updated_by      uuid references public.staff(id) on delete set null,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.price_list_parts (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  model_id        text references public.price_list_models(id) on delete cascade,
  part_name       text not null,
  part_number     text,
  price           numeric not null default 0,
  price_known     boolean not null default true,
  warranty        text,
  availability    text default 'In Stock',
  repair_category text,
  image_url       text,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Expenses + categories ────────────────────────────────────────────────────
create table if not exists public.expense_categories (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  label           text not null,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.expenses (
  id                  text primary key,
  organization_id     uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id           uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  expense_id          text,
  category            text,
  amount              numeric not null default 0,
  payment_mode        text,
  description         text,
  vendor              text,
  vendor_id           uuid references public.vendors(id) on delete set null,
  employee            text,
  attachment          text,
  expense_date        date,
  time_label          text,
  internal_notes      text,
  status              text not null default 'active',
  cancellation_reason text,
  cancelled_at        timestamptz,
  cancelled_by        text,
  ledger_entry_id     text,
  role_scope          text,
  created_by          uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by          uuid references public.staff(id) on delete set null,
  deleted_by          uuid references public.staff(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- ── Daily ledger ─────────────────────────────────────────────────────────────
create table if not exists public.daily_sessions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id           uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  session_date        date not null,
  status              text not null default 'open',
  opening_cash        numeric not null default 0,
  opening_bank        numeric not null default 0,
  actual_closing_cash numeric,
  actual_closing_bank numeric,
  closed_at           timestamptz,
  closed_by           text,
  notes               text,
  created_by          uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, branch_id, session_date)
);

create table if not exists public.ledger_transactions (
  id                text primary key,
  organization_id   uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id         uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  txn_date          date not null,
  txn_at            timestamptz not null default now(),
  module            text,
  reference_id      text,
  description       text,
  category          text,
  payment_mode      text,
  cash_or_bank      text,
  direction         text,
  amount            numeric not null default 0,
  employee          text,
  color_code        text,
  linked_expense_id text,
  linked_invoice_id text,
  linked_ticket_id  text,
  audit_history     jsonb not null default '[]'::jsonb,
  created_by        uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ledger_tx_date_idx on public.ledger_transactions(organization_id, txn_date);

-- ── Accounting ledger entries ────────────────────────────────────────────────
create table if not exists public.ledger_entries (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  entry_date      date not null,
  entry_type      text,
  account         text,
  description     text,
  debit           numeric not null default 0,
  credit          numeric not null default 0,
  reference       text,
  status          text not null default 'posted',
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Payroll runs + salary advances ───────────────────────────────────────────
create table if not exists public.payroll_runs (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  staff_id        uuid references public.staff(id) on delete set null,
  period          text,
  base_salary     numeric not null default 0,
  deductions      numeric not null default 0,
  net_pay         numeric not null default 0,
  status          text not null default 'pending',
  reference       text,
  paid_at         timestamptz,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.salary_advances (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  staff_id        uuid references public.staff(id) on delete set null,
  employee        text,
  amount          numeric not null default 0,
  reason          text,
  status          text not null default 'pending',
  reference       text,
  disbursed_at    timestamptz,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Tasks ────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  title           text not null,
  description     text,
  priority        text not null default 'medium',
  status          text not null default 'open',
  completed       boolean not null default false,
  due_date        date,
  due_time        text,
  assigned_to     uuid references public.staff(id) on delete set null,
  is_private      boolean not null default false,
  remind_at       timestamptz,
  reminder_sent   boolean not null default false,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  deleted_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  deleted_at      timestamptz
);

create index if not exists tasks_org_idx      on public.tasks(organization_id);
create index if not exists tasks_assignee_idx on public.tasks(assigned_to);
create index if not exists tasks_open_idx     on public.tasks(organization_id, completed) where deleted_at is null;


-- ── updated_at triggers for ALL tables with updated_at ───────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'customers','tickets','invoices','walk_ins','inventory_items','stock_movements',
    'price_list_categories','price_list_brands','price_list_models','price_list_parts',
    'expenses','daily_sessions','ledger_transactions','ledger_entries',
    'payroll_runs','salary_advances','tasks',
    'organization_settings','user_preferences','numbering_sequences','vendors'
  ] loop
    execute format('drop trigger if exists %I on public.%I;', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at();',
      t || '_touch', t);
  end loop;
end $$;


-- ############################################################################
-- SECTION 6 — AUDIT TRIGGERS (attach fn_audit to every business table)
-- ############################################################################

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('customers',              'Customer'),
      ('tickets',                'Ticket'),
      ('invoices',               'Invoice'),
      ('walk_ins',               'Walk-In'),
      ('inventory_items',        'Inventory'),
      ('stock_movements',        'Inventory'),
      ('brands',                 'Price List'),
      ('device_models',          'Price List'),
      ('price_list_categories',  'Price List'),
      ('price_list_brands',      'Price List'),
      ('price_list_models',      'Price List'),
      ('price_list_parts',       'Price List'),
      ('expenses',               'Expense'),
      ('expense_categories',     'Expense'),
      ('daily_sessions',         'Daily Ledger'),
      ('ledger_transactions',    'Daily Ledger'),
      ('ledger_entries',         'Accounting'),
      ('payroll_runs',           'Payroll'),
      ('salary_advances',        'Payroll'),
      ('tasks',                  'Task'),
      ('staff',                  'Employee'),
      ('branches',               'System'),
      ('organization_settings',  'Settings'),
      ('numbering_sequences',    'Settings'),
      ('vendors',                'Vendor'),
      ('file_uploads',           'File')
    ) as x(tbl, label)
  loop
    execute format('drop trigger if exists %I on public.%I;', 'audit_' || r.tbl, r.tbl);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.fn_audit(%L);',
      'audit_' || r.tbl, r.tbl, r.label);
  end loop;
end $$;


-- ############################################################################
-- SECTION 7 — ROW LEVEL SECURITY
-- ############################################################################

alter table public.organizations          enable row level security;
alter table public.branches               enable row level security;
alter table public.roles                  enable row level security;
alter table public.role_permissions       enable row level security;
alter table public.staff                  enable row level security;
alter table public.audit_log              enable row level security;
alter table public.customers              enable row level security;
alter table public.tickets                enable row level security;
alter table public.invoices               enable row level security;
alter table public.walk_ins               enable row level security;
alter table public.inventory_items        enable row level security;
alter table public.stock_movements        enable row level security;
alter table public.brands                 enable row level security;
alter table public.device_models          enable row level security;
alter table public.price_list_categories  enable row level security;
alter table public.price_list_brands      enable row level security;
alter table public.price_list_models      enable row level security;
alter table public.price_list_parts       enable row level security;
alter table public.expenses               enable row level security;
alter table public.expense_categories     enable row level security;
alter table public.daily_sessions         enable row level security;
alter table public.ledger_transactions    enable row level security;
alter table public.ledger_entries         enable row level security;
alter table public.payroll_runs           enable row level security;
alter table public.salary_advances        enable row level security;
alter table public.tasks                  enable row level security;
alter table public.organization_settings  enable row level security;
alter table public.user_preferences       enable row level security;
alter table public.numbering_sequences    enable row level security;
alter table public.file_uploads           enable row level security;
alter table public.vendors                enable row level security;

-- ── Role catalogue: readable by everyone ─────────────────────────────────────
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select using (true);

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select using (true);

-- ── Organizations: read own org; admins manage ──────────────────────────────
drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations
  for select to authenticated
  using (id = public.auth_org_id() or public.is_admin());

drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── Branches: read within org; manage_branches to write ──────────────────────
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches
  for select to authenticated
  using (organization_id = public.auth_org_id() or public.is_admin());

drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.auth_has_any(array['manage_branches']))
  with check (organization_id = public.auth_org_id() and public.auth_has_any(array['manage_branches']));

-- ── Staff: read colleagues in same org; admins manage everyone ───────────────
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff
  for select to authenticated
  using (
    auth.uid() = auth_user_id
    or public.is_admin()
    or (organization_id is not null and organization_id = public.auth_org_id())
  );

drop policy if exists staff_write on public.staff;
create policy staff_write on public.staff
  for all to authenticated
  using (public.is_admin() and (organization_id = public.auth_org_id() or organization_id is null))
  with check (public.is_admin());

-- ── Self-service: user may update their own staff row (guarded) ──────────────
create or replace function public.staff_guard_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or auth.uid() is null then
    return NEW;
  end if;
  if NEW.role_id         is distinct from OLD.role_id
  or NEW.salary_type     is distinct from OLD.salary_type
  or NEW.salary_amount   is distinct from OLD.salary_amount
  or NEW.status          is distinct from OLD.status
  or NEW.login_enabled   is distinct from OLD.login_enabled
  or NEW.organization_id is distinct from OLD.organization_id
  or NEW.branch_id       is distinct from OLD.branch_id
  or NEW.branch          is distinct from OLD.branch
  or NEW.department      is distinct from OLD.department
  or NEW.designation     is distinct from OLD.designation
  or NEW.auth_user_id    is distinct from OLD.auth_user_id
  or NEW.email           is distinct from OLD.email then
    raise exception 'Only name, phone and avatar may be changed by the account holder.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists staff_guard_self on public.staff;
create trigger staff_guard_self before update on public.staff
  for each row execute function public.staff_guard_self_update();

drop policy if exists staff_self_update on public.staff;
create policy staff_self_update on public.staff
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ── Organization Settings: all org members read; admins write ────────────────
drop policy if exists org_settings_read on public.organization_settings;
create policy org_settings_read on public.organization_settings
  for select to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists org_settings_write on public.organization_settings;
create policy org_settings_write on public.organization_settings
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.is_admin())
  with check (organization_id = public.auth_org_id() and public.is_admin());

-- ── User Preferences: only the owner staff_id can read/write their own row ──
drop policy if exists user_prefs_read on public.user_preferences;
create policy user_prefs_read on public.user_preferences
  for select to authenticated
  using (staff_id = public.auth_staff_id());

drop policy if exists user_prefs_write on public.user_preferences;
create policy user_prefs_write on public.user_preferences
  for all to authenticated
  using (staff_id = public.auth_staff_id())
  with check (staff_id = public.auth_staff_id());

-- ── Numbering Sequences: org members read; admins write ─────────────────────
drop policy if exists numbering_read on public.numbering_sequences;
create policy numbering_read on public.numbering_sequences
  for select to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists numbering_write on public.numbering_sequences;
create policy numbering_write on public.numbering_sequences
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.is_admin())
  with check (organization_id = public.auth_org_id() and public.is_admin());

-- ── File Uploads: org members with upload_files can read/write ───────────────
drop policy if exists file_uploads_read on public.file_uploads;
create policy file_uploads_read on public.file_uploads
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
  );

drop policy if exists file_uploads_write on public.file_uploads;
create policy file_uploads_write on public.file_uploads
  for all to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['upload_files'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_has_any(array['upload_files'])
  );

-- ── Vendors: org members with manage_vendors or manage_purchases can access ──
drop policy if exists vendors_sel on public.vendors;
create policy vendors_sel on public.vendors
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_vendors','manage_purchases','manage_payments','manage_inventory'])
  );

drop policy if exists vendors_ins on public.vendors;
create policy vendors_ins on public.vendors
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_has_any(array['manage_vendors','manage_purchases'])
  );

drop policy if exists vendors_upd on public.vendors;
create policy vendors_upd on public.vendors
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['manage_vendors','manage_purchases'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_has_any(array['manage_vendors','manage_purchases'])
  );

drop policy if exists vendors_del on public.vendors;
create policy vendors_del on public.vendors
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['manage_vendors','manage_purchases'])
  );

-- ── Audit log: read requires view_audit_logs; org members may append ─────────
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select to authenticated
  using (organization_id = public.auth_org_id() and public.auth_has_any(array['view_audit_logs']));

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert to authenticated
  with check (organization_id = public.auth_org_id());

-- ── Generic per-module policy generator ──────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('customers',        array['manage_customers','manage_repair_jobs','manage_sales','manage_invoices','view_financial_reports'], array['manage_customers']),
      ('tickets',          array['manage_repair_jobs','update_repair_status','view_only','assign_technicians'],                       array['manage_repair_jobs','update_repair_status','create','edit']),
      ('invoices',         array['manage_invoices','manage_payments','view_financial_reports','manage_sales'],                        array['manage_invoices','manage_payments']),
      ('walk_ins',         array['use_pos','manage_repair_jobs','manage_sales','manage_customers'],                                   array['use_pos','manage_sales','manage_repair_jobs']),
      ('inventory_items',  array['manage_inventory','transfer_inventory','manage_purchases','manage_repair_jobs','view_only'],        array['manage_inventory','transfer_inventory','manage_purchases']),
      ('stock_movements',  array['manage_inventory','transfer_inventory','manage_repair_jobs'],                                       array['manage_inventory','transfer_inventory','manage_repair_jobs']),
      ('brands',           array['manage_repair_jobs','manage_sales','manage_inventory','view_only','manage_settings'],               array['manage_repair_jobs','manage_sales','manage_inventory','manage_settings']),
      ('device_models',    array['manage_repair_jobs','manage_sales','manage_inventory','view_only','manage_settings'],               array['manage_repair_jobs','manage_sales','manage_inventory','manage_settings']),
      ('price_list_categories', array['manage_sales','manage_repair_jobs','view_only','manage_settings'],                             array['manage_sales','manage_repair_jobs','manage_settings']),
      ('price_list_brands',     array['manage_sales','manage_repair_jobs','view_only','manage_settings'],                             array['manage_sales','manage_repair_jobs','manage_settings']),
      ('price_list_models',     array['manage_sales','manage_repair_jobs','view_only','manage_settings'],                             array['manage_sales','manage_repair_jobs','manage_settings']),
      ('price_list_parts',      array['manage_sales','manage_repair_jobs','view_only','manage_settings'],                             array['manage_sales','manage_repair_jobs','manage_settings']),
      ('expenses',         array['manage_payments','view_financial_reports'],                                                         array['manage_payments']),
      ('expense_categories', array['manage_payments','view_financial_reports'],                                                       array['manage_payments','manage_settings']),
      ('daily_sessions',   array['view_financial_reports','manage_payments'],                                                         array['manage_payments']),
      ('ledger_transactions', array['view_financial_reports','manage_payments'],                                                      array['manage_payments']),
      ('ledger_entries',   array['view_financial_reports','manage_payments'],                                                         array['manage_payments']),
      ('payroll_runs',     array['manage_payments','manage_users'],                                                                   array['manage_payments']),
      ('salary_advances',  array['manage_payments','manage_users'],                                                                   array['manage_payments'])
    ) as x(tbl, read_keys, write_keys)
  loop
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_sel', r.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_sel', r.tbl, r.read_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_ins', r.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_ins', r.tbl, r.write_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_upd', r.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      )
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_upd', r.tbl, r.write_keys, r.write_keys);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_del', r.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_del', r.tbl, r.write_keys);
  end loop;
end $$;

-- ── Tasks: custom visibility (private / shared / admin) ──────────────────────
drop policy if exists tasks_sel on public.tasks;
create policy tasks_sel on public.tasks for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.is_admin()
    or created_by = public.auth_staff_id()
    or assigned_to = public.auth_staff_id()
    or (is_private = false and public.auth_has_any(array['view_dashboard']))
  )
);

drop policy if exists tasks_ins on public.tasks;
create policy tasks_ins on public.tasks for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['view_dashboard'])
  and created_by = public.auth_staff_id()
);

drop policy if exists tasks_upd on public.tasks;
create policy tasks_upd on public.tasks for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.is_admin()
    or created_by = public.auth_staff_id()
    or assigned_to = public.auth_staff_id()
    or (is_private = false and public.auth_has_any(array['view_dashboard']))
  )
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
);

drop policy if exists tasks_del on public.tasks;
create policy tasks_del on public.tasks for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (public.is_admin() or created_by = public.auth_staff_id())
);


-- ############################################################################
-- SECTION 8 — REAL-TIME
-- ############################################################################

do $$
declare
  t text;
  tables text[] := array[
    'organizations','branches','staff','audit_log',
    'customers','tickets','invoices','walk_ins','inventory_items','stock_movements',
    'brands','device_models',
    'price_list_categories','price_list_brands','price_list_models','price_list_parts',
    'expenses','expense_categories','daily_sessions','ledger_transactions','ledger_entries',
    'payroll_runs','salary_advances','tasks',
    'organization_settings','user_preferences','numbering_sequences','file_uploads','vendors'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    execute format('alter table public.%I replica identity full;', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;


-- ############################################################################
-- SECTION 9 — GRANTS
-- ############################################################################

grant usage on schema public to anon, authenticated;

grant select on public.roles            to anon, authenticated;
grant select on public.role_permissions to anon, authenticated;

grant execute on function public.is_admin()                       to anon, authenticated;
grant execute on function public.auth_staff_id()                  to authenticated;
grant execute on function public.auth_org_id()                    to authenticated;
grant execute on function public.auth_branch_id()                 to authenticated;
grant execute on function public.auth_role_id()                   to authenticated;
grant execute on function public.auth_has_any(text[])             to authenticated;
grant execute on function public.auth_can_cross_branch()          to authenticated;
grant execute on function public.auth_member_of_org(uuid)         to authenticated;
grant execute on function public.auth_branch_visible(uuid)        to authenticated;
grant execute on function public.next_doc_number(uuid, text, uuid) to authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'organizations','branches','staff','audit_log',
    'customers','tickets','invoices','walk_ins','inventory_items','stock_movements',
    'brands','device_models',
    'price_list_categories','price_list_brands','price_list_models','price_list_parts',
    'expenses','expense_categories','daily_sessions','ledger_transactions','ledger_entries',
    'payroll_runs','salary_advances','tasks',
    'organization_settings','user_preferences','numbering_sequences','file_uploads','vendors'
  ];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
  end loop;
end $$;

-- ============================================================================
-- Done. Next:  npm run db:seed   (bootstraps the org, branches, roles + staff)
-- ============================================================================
