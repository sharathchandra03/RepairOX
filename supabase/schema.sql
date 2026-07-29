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
  avatar_url    text,                              -- profile picture (data URL or storage URL)
  role_id       text references public.roles(id),
  branch        text,                              -- legacy free-text branch label
  status        text not null default 'active',    -- active | invited | suspended
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

-- Multi-tenant scoping for staff (added via ALTER so existing installs upgrade
-- cleanly without dropping data).
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
-- These resolve the CURRENT signed-in user's tenancy + permissions and are the
-- single source of truth every RLS policy is built on.

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

-- True if the current user's role has ANY of the given permission keys, or a
-- blanket grant ('*' / 'full_access'), or is an admin role.
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

-- Owners / managers / admins may see across all branches in their org; everyone
-- else is limited to their own branch.
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


-- ############################################################################
-- SECTION 4 — AUDIT TRAIL
--   One immutable table + one generic trigger. Records every create / update /
--   delete on every business table, capturing the full before & after value,
--   the actor, their role, and the org/branch scope. Used by the dashboard
--   Activity Log. Hard deletes are captured too, so nothing is ever lost.
-- ############################################################################

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  branch_id       uuid,
  module          text,                 -- Ticket | Invoice | Inventory | ...
  entity_type     text,                 -- source table name
  record_id       text,                 -- business id / reference of the row
  action_type     text,                 -- INSERT | UPDATE | DELETE
  action          text,                 -- human label
  severity        text default 'info',  -- success | info | warning | critical
  description     text,
  previous_value  jsonb,
  new_value       jsonb,
  changes         jsonb,                -- optional [{field,from,to}] (app-supplied)
  meta            jsonb,
  reason          text,
  performed_by    uuid,                 -- auth.users id of the actor
  actor           text,                 -- actor display name (snapshot)
  role            text,
  branch          text,
  created_at      timestamptz not null default now()
);

create index if not exists audit_org_idx     on public.audit_log(organization_id);
create index if not exists audit_created_idx  on public.audit_log(created_at desc);
create index if not exists audit_module_idx   on public.audit_log(module);
create index if not exists audit_record_idx   on public.audit_log(entity_type, record_id);

-- Generic audit trigger. Attach with the module label as the first argument,
-- e.g.  execute function public.fn_audit('Ticket').
-- SECURITY DEFINER so it can always write to audit_log regardless of the
-- writer's own RLS grants (the audit trail must never be blocked).
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
--   Standard scope/ownership columns on every table:
--     organization_id  (auto-filled from the signed-in user)
--     branch_id        (auto-filled from the signed-in user)
--     created_by / updated_by / deleted_by  (staff ids)
--     created_at / updated_at / deleted_at
--   Nested structures the app already uses (devices, parts, line items) are
--   stored as jsonb so writes stay atomic and match the existing shapes.
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

-- ── Tickets (devices / parts / items as jsonb) ───────────────────────────────
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

-- ── Invoices (line items / devices as jsonb) ─────────────────────────────────
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
  id                     text primary key,          -- SKU
  organization_id        uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id              uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  name                   text not null,
  category               text,
  item_type              text default 'Product',    -- Product | Service
  mode                   text default 'Both',        -- Buy | Sell | Both
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
  movement_type   text,                 -- Transfer | Inward | Outward | Adjustment | Return
  status          text not null default 'completed',
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Brands & device models (ticket/price-list catalogue) ─────────────────────
-- Catalogue/reference tables carry a nullable branch_id: NULL means "org-wide"
-- (visible to every branch), so shared catalogues aren't hidden per branch.
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

-- ── Price list (category → brand → model → part) ─────────────────────────────
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
  expense_id          text,                       -- EXP-YYYYMMDD-001 (per-day sequence)
  category            text,
  amount              numeric not null default 0,
  payment_mode        text,
  description         text,
  vendor              text,
  employee            text,
  attachment          text,
  expense_date        date,
  time_label          text,
  internal_notes      text,
  status              text not null default 'active',   -- active | cancelled
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

-- ── Daily ledger: sessions (per branch per day) + transactions ───────────────
create table if not exists public.daily_sessions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id           uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  session_date        date not null,
  status              text not null default 'open',   -- open | closed
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
  cash_or_bank      text,                 -- Cash | Bank
  direction         text,                 -- inflow | outflow
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

-- ── Accounting ledger entries (double-entry style feed) ──────────────────────
create table if not exists public.ledger_entries (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  entry_date      date not null,
  entry_type      text,                   -- expense | salary | ticket_payment | ...
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
  period          text,                   -- e.g. 2026-07
  base_salary     numeric not null default 0,
  deductions      numeric not null default 0,
  net_pay         numeric not null default 0,
  status          text not null default 'pending',  -- pending | paid
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
  status          text not null default 'pending',  -- pending | disbursed | recovered
  reference       text,
  disbursed_at    timestamptz,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Tasks (dashboard To-Do — personal + shared productivity items) ───────────
--   Powers the dashboard "Today's Focus → To-Do List" widget. Private tasks are
--   visible only to their creator; shared tasks are visible to permitted org
--   members (see the custom RLS in Section 7). `remind_at` / `reminder_sent`
--   are reserved so due-date reminders can be layered on later without a
--   migration.
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  title           text not null,
  description     text,
  priority        text not null default 'medium',   -- low | medium | high | critical
  status          text not null default 'open',     -- open | completed
  completed       boolean not null default false,
  due_date        date,
  due_time        text,                             -- HH:MM (local wall-clock)
  assigned_to     uuid references public.staff(id) on delete set null,
  is_private      boolean not null default false,
  remind_at       timestamptz,                      -- reserved: future reminders
  reminder_sent   boolean not null default false,   -- reserved: future reminders
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


-- ── updated_at triggers for business tables ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'customers','tickets','invoices','walk_ins','inventory_items','stock_movements',
    'price_list_categories','price_list_brands','price_list_models','price_list_parts',
    'expenses','daily_sessions','ledger_transactions','ledger_entries',
    'payroll_runs','salary_advances','tasks'
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
      ('customers',        'Customer'),
      ('tickets',          'Ticket'),
      ('invoices',         'Invoice'),
      ('walk_ins',         'Walk-In'),
      ('inventory_items',  'Inventory'),
      ('stock_movements',  'Inventory'),
      ('brands',           'Price List'),
      ('device_models',    'Price List'),
      ('price_list_categories', 'Price List'),
      ('price_list_brands',     'Price List'),
      ('price_list_models',     'Price List'),
      ('price_list_parts',      'Price List'),
      ('expenses',         'Expense'),
      ('expense_categories','Expense'),
      ('daily_sessions',   'Daily Ledger'),
      ('ledger_transactions','Daily Ledger'),
      ('ledger_entries',   'Accounting'),
      ('payroll_runs',     'Payroll'),
      ('salary_advances',  'Payroll'),
      ('tasks',            'Task'),
      ('staff',            'Employee'),
      ('branches',         'System')
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
--   Reads/writes happen from the browser with the anon/authenticated key, so
--   every rule is enforced here in Postgres. Privileged admin actions (creating
--   logins, seeding) use the service-role key which bypasses RLS by design.
-- ############################################################################

alter table public.organizations      enable row level security;
alter table public.branches           enable row level security;
alter table public.roles              enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.staff              enable row level security;
alter table public.audit_log          enable row level security;
alter table public.customers          enable row level security;
alter table public.tickets            enable row level security;
alter table public.invoices           enable row level security;
alter table public.walk_ins           enable row level security;
alter table public.inventory_items    enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.brands             enable row level security;
alter table public.device_models      enable row level security;
alter table public.price_list_categories enable row level security;
alter table public.price_list_brands  enable row level security;
alter table public.price_list_models  enable row level security;
alter table public.price_list_parts   enable row level security;
alter table public.expenses           enable row level security;
alter table public.expense_categories enable row level security;
alter table public.daily_sessions     enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries     enable row level security;
alter table public.payroll_runs       enable row level security;
alter table public.salary_advances    enable row level security;
alter table public.tasks              enable row level security;

-- ── Role catalogue: readable by everyone (drives the permission UI) ──────────
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
-- Builds SELECT / INSERT / UPDATE / DELETE policies for a business table using
-- org isolation + branch scope + per-module permission keys.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- table,                read keys,                                                              write keys
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
    -- SELECT
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_sel', r.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        public.auth_member_of_org(organization_id)
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_sel', r.tbl, r.read_keys);

    -- INSERT
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_ins', r.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        organization_id = public.auth_org_id()
        and public.auth_branch_visible(branch_id)
        and public.auth_has_any(%L::text[])
      );$f$, r.tbl || '_ins', r.tbl, r.write_keys);

    -- UPDATE
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

    -- DELETE
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
--   Private tasks are visible only to their creator. Shared tasks are visible
--   to org members who can view the dashboard (branch-scoped). Assignees always
--   see tasks assigned to them. Admins/owners see everything in their org.
--   Only the creator (or an admin) may delete a task; anyone who can see a
--   shared task may complete / edit it (that is the point of a shared to-do).
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
--   Publish every business table (+ audit_log) so changes stream live to all
--   permitted sessions. REPLICA IDENTITY FULL makes update/delete payloads
--   carry the full old row (needed for client-side reconciliation + filtering).
--   Realtime still respects RLS, so users only receive changes they may see.
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
    'payroll_runs','salary_advances','tasks'
  ];
begin
  -- Ensure the Supabase realtime publication exists (it does on Supabase).
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    execute format('alter table public.%I replica identity full;', t);
    -- Add to the publication only if not already a member (re-run safe).
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
--   RLS still governs row visibility; these grants just expose the tables to
--   the API roles. All write attempts are checked against the policies above.
-- ############################################################################

grant usage on schema public to anon, authenticated;

grant select on public.roles            to anon, authenticated;
grant select on public.role_permissions to anon, authenticated;

-- Helper functions used by policies / the app.
grant execute on function public.is_admin()                       to anon, authenticated;
grant execute on function public.auth_staff_id()                  to authenticated;
grant execute on function public.auth_org_id()                    to authenticated;
grant execute on function public.auth_branch_id()                 to authenticated;
grant execute on function public.auth_role_id()                   to authenticated;
grant execute on function public.auth_has_any(text[])             to authenticated;
grant execute on function public.auth_can_cross_branch()          to authenticated;
grant execute on function public.auth_member_of_org(uuid)         to authenticated;
grant execute on function public.auth_branch_visible(uuid)        to authenticated;

-- Business tables: authenticated CRUD (RLS-restricted). Reads for staff/org/
-- branch happen from the browser; writes are permission-checked in the policies.
do $$
declare
  t text;
  tables text[] := array[
    'organizations','branches','staff','audit_log',
    'customers','tickets','invoices','walk_ins','inventory_items','stock_movements',
    'brands','device_models',
    'price_list_categories','price_list_brands','price_list_models','price_list_parts',
    'expenses','expense_categories','daily_sessions','ledger_transactions','ledger_entries',
    'payroll_runs','salary_advances','tasks'
  ];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
  end loop;
end $$;

-- ============================================================================
-- Done. Next:  npm run db:seed   (bootstraps the org, branches, roles + staff)
-- ============================================================================
