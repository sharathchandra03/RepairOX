-- ============================================================================
-- RepairOX — Quotations module schema.
--
-- Run this ONCE in Supabase → SQL Editor AFTER schema.sql (it depends on the
-- helper functions, organizations/branches/staff tables and fn_audit defined
-- there). Safe to re-run: uses "if not exists" / "drop ... if exists".
--
-- A quotation is the official proposal record. It links to a Lead / Deal /
-- Company / Contact, carries products & services (JSONB line items), computes
-- taxes and totals, and can be converted into an invoice with one click.
-- ============================================================================

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.quotations (
  id                 text primary key,                    -- e.g. QT-2026-1042
  organization_id    uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id          uuid default public.auth_branch_id() references public.branches(id) on delete set null,

  -- General information
  title              text,
  status             text not null default 'draft',       -- draft|pending|sent|accepted|rejected|expired
  quotation_date     date,
  valid_until        date,

  -- Linked records (soft references — Leads domain is not yet fully normalized)
  lead_id            text,
  deal_id            text,
  company_id         text,
  contact_id         text,

  -- Ownership / meta
  owner              text,
  sales_executive    text,
  priority           text,
  tags               jsonb not null default '[]'::jsonb,
  reference_number   text,
  source             text,
  branch             text,
  created_by_name    text,

  -- Products & services (array of line items)
  items              jsonb not null default '[]'::jsonb,

  -- Pricing
  gst_mode           text not null default 'intra',       -- intra (CGST+SGST) | inter (IGST)
  overall_discount   numeric not null default 0,
  shipping           numeric not null default 0,
  additional_charges numeric not null default 0,
  currency           text not null default 'INR',
  subtotal           numeric not null default 0,
  item_discounts     numeric not null default 0,
  tax_total          numeric not null default 0,
  cgst               numeric not null default 0,
  sgst               numeric not null default 0,
  igst               numeric not null default 0,
  round_off          numeric not null default 0,
  grand_total        numeric not null default 0,

  -- Billing
  billing_address    jsonb not null default '{}'::jsonb,
  shipping_address   jsonb not null default '{}'::jsonb,
  payment_terms      text,
  payment_method     text,

  -- Terms
  terms              text,
  warranty_terms     text,
  return_policy      text,
  delivery_terms     text,
  installation_notes text,

  -- Internal
  internal_notes     text,

  -- Conversion linkage
  converted_invoice_id text references public.invoices(id) on delete set null,

  -- Audit
  role_scope         text,
  created_by         uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  updated_by         uuid references public.staff(id) on delete set null,
  deleted_by         uuid references public.staff(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index if not exists quotations_org_idx      on public.quotations(organization_id);
create index if not exists quotations_status_idx   on public.quotations(organization_id, status) where deleted_at is null;
create index if not exists quotations_company_idx  on public.quotations(company_id);
create index if not exists quotations_created_idx  on public.quotations(created_at desc);

-- ── updated_at trigger ───────────────────────────────────────────────────────
drop trigger if exists quotations_touch on public.quotations;
create trigger quotations_touch before update on public.quotations
  for each row execute function public.touch_updated_at();

-- ── Audit trigger ──────────────────────────────────────────────────────────────
drop trigger if exists audit_quotations on public.quotations;
create trigger audit_quotations after insert or update or delete on public.quotations
  for each row execute function public.fn_audit('Quotation');

-- ── Row Level Security (gated on sales permissions) ──────────────────────────
alter table public.quotations enable row level security;

drop policy if exists quotations_sel on public.quotations;
create policy quotations_sel on public.quotations
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_sales','manage_invoices','view_financial_reports','manage_customers'])
  );

drop policy if exists quotations_ins on public.quotations;
create policy quotations_ins on public.quotations
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_sales','manage_invoices'])
  );

drop policy if exists quotations_upd on public.quotations;
create policy quotations_upd on public.quotations
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_sales','manage_invoices'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_sales','manage_invoices'])
  );

drop policy if exists quotations_del on public.quotations;
create policy quotations_del on public.quotations
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_sales','manage_invoices'])
  );

-- ── Real-time ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  execute 'alter table public.quotations replica identity full';
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quotations'
  ) then
    execute 'alter publication supabase_realtime add table public.quotations';
  end if;
end $$;

-- ── Grants ─────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.quotations to authenticated;

-- ============================================================================
-- Done. Quotations now persist, stream in real time, and are audited.
-- ============================================================================
