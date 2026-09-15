-- ============================================================================
-- RepairOX — Customer Classification migration
--
-- Adds the two NEW customer-classification dimensions WITHOUT touching the
-- existing Customer Type (personal/business), which remains the customer's
-- fundamental type and single source of truth.
--
--   1. customers.source     — where/how the customer first entered the business
--                             (Direct Walk-In / Sales / Referral / GMB / Meta /
--                              Other). This is the customer's ORIGIN, distinct
--                              from Customer Type and from per-interaction source.
--   2. customers.group_ids  — reusable segmentation labels (VIP, Wholesale,
--                             Corporate, …). A customer may belong to MANY groups.
--   3. public.customer_groups — the configurable group catalogue managed under
--                             Settings → Customers → Customer Groups.
--
-- Safe to re-run: uses "if not exists" everywhere. Existing personal/business
-- customers are UNCHANGED (source defaults null, group_ids defaults empty).
-- Run in Supabase → SQL Editor.
-- ============================================================================

-- ── 1. New classification columns on the Customer Master ─────────────────────
alter table public.customers add column if not exists source    text;
alter table public.customers add column if not exists group_ids text[] not null default '{}'::text[];

comment on column public.customers.source is
  'Customer ORIGIN — how the customer first entered the business (direct_walkin, sales, referral, gmb, meta, other). NOT the customer type and NOT a per-interaction source.';
comment on column public.customers.group_ids is
  'Customer group memberships (many-to-many via customer_groups.id). Segmentation only — never replaces type or source.';

-- ── 2. Customer Groups catalogue ─────────────────────────────────────────────
create table if not exists public.customer_groups (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  name            text not null,
  description     text,
  color           text,                 -- optional subtle tag colour (token name, e.g. 'violet')
  display_order   integer not null default 0,
  active          boolean not null default true,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by      uuid references public.staff(id) on delete set null,
  deleted_by      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists customer_groups_org_idx on public.customer_groups(organization_id);

-- Keep updated_at fresh.
drop trigger if exists customer_groups_touch on public.customer_groups;
create trigger customer_groups_touch before update on public.customer_groups
  for each row execute function public.touch_updated_at();

-- Audit trail (reuses the generic trigger; the '' arg falls back to table name).
drop trigger if exists customer_groups_audit on public.customer_groups;
create trigger customer_groups_audit
  after insert or update or delete on public.customer_groups
  for each row execute function public.fn_audit('Customer Group');

-- ── 3. Row Level Security ────────────────────────────────────────────────────
alter table public.customer_groups enable row level security;

drop policy if exists customer_groups_select on public.customer_groups;
create policy customer_groups_select on public.customer_groups
  for select using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['view_customers', 'manage_customer_groups', 'manage_customers'])
  );

drop policy if exists customer_groups_write on public.customer_groups;
create policy customer_groups_write on public.customer_groups
  for all using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['manage_customer_groups', 'manage_customers'])
  ) with check (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['manage_customer_groups', 'manage_customers'])
  );

-- ── 4. Realtime ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_groups'
  ) then
    alter publication supabase_realtime add table public.customer_groups;
  end if;
end $$;
