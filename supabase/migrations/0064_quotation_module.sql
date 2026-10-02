-- ============================================================================
-- RepairOX — Quotation Module (lead-centric, customer-facing offer).
--
-- Additive + idempotent. EXTENDS the existing public.quotations table (0003)
-- with the fields the real quotation workflow needs:
--   • Lead → Quotation lineage + Customer Master reference + Sales Agent
--     attribution (owner, NOT the customer creator).
--   • Device / issue, quoted items (jsonb), structured warranty (jsonb),
--     offer amount + discount, source (lead | standalone), sent timestamp.
--   • A server-generated, immutable quotation number (QT-####) via a sequence.
--
-- It also RELAXES the RLS/number so the GRANULAR quotation capability keys
-- (quotations_view / quotations_create / quotations_send) work alongside the
-- coarse manage_sales fallback, keeping the Sales Agent flow functional.
--
-- Nothing is dropped; existing rows keep working. Safe to re-run.
-- ============================================================================

-- ── 1) New columns (additive) ───────────────────────────────────────────────
alter table public.quotations add column if not exists quotation_no      text;
alter table public.quotations add column if not exists source            text not null default 'standalone'; -- lead | standalone
alter table public.quotations add column if not exists lead_no           text;
alter table public.quotations add column if not exists customer_id        text;
alter table public.quotations add column if not exists customer_name      text;
alter table public.quotations add column if not exists phone              text;
alter table public.quotations add column if not exists email              text;
alter table public.quotations add column if not exists location           text;
alter table public.quotations add column if not exists sales_agent_id     uuid;
alter table public.quotations add column if not exists sales_agent_name   text;
alter table public.quotations add column if not exists device             text;
alter table public.quotations add column if not exists device_category_id text;
alter table public.quotations add column if not exists device_brand_id    text;
alter table public.quotations add column if not exists device_model_id    text;
alter table public.quotations add column if not exists issue              text;
alter table public.quotations add column if not exists warranty           jsonb not null default '{"months":null,"label":""}'::jsonb;
alter table public.quotations add column if not exists discount           numeric not null default 0;
alter table public.quotations add column if not exists discount_type      text not null default 'amount'; -- amount | percent
alter table public.quotations add column if not exists amount             numeric not null default 0;
alter table public.quotations add column if not exists note               text;
alter table public.quotations add column if not exists sent_at            timestamptz;

-- ── 2) Server-generated quotation number (QT-####), immutable ────────────────
create sequence if not exists public.quotation_no_seq;

create or replace function public.next_quotation_no()
returns text language sql volatile as $$
  select 'QT-' || lpad(nextval('public.quotation_no_seq')::text, 4, '0');
$$;

-- Stamp quotation_no on insert when the client didn't supply one. created_by
-- is already defaulted to auth_staff_id() by 0003.
create or replace function public.quotations_stamp_no()
returns trigger language plpgsql as $$
begin
  if new.quotation_no is null or btrim(new.quotation_no) = '' then
    new.quotation_no := public.next_quotation_no();
  end if;
  return new;
end;
$$;

drop trigger if exists quotations_stamp_no_trg on public.quotations;
create trigger quotations_stamp_no_trg
  before insert on public.quotations
  for each row execute function public.quotations_stamp_no();

create unique index if not exists quotations_no_uidx on public.quotations(quotation_no) where quotation_no is not null;
create index if not exists quotations_lead_idx     on public.quotations(lead_id)      where deleted_at is null;
create index if not exists quotations_customer_idx on public.quotations(customer_id)  where deleted_at is null;
create index if not exists quotations_agent_idx    on public.quotations(sales_agent_id) where deleted_at is null;

-- ── 3) RLS — accept the granular quotation keys + coarse fallback ────────────
-- Visibility: any lead/sales worker in the org + authorized store scope who
-- holds a quotation/sales key. Write: create/send keys. Store scope + org
-- isolation are ALWAYS enforced (auth_branch_visible + auth_member_of_org).

drop policy if exists quotations_sel on public.quotations;
create policy quotations_sel on public.quotations
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array[
      'quotations_view','quotations_create','quotations_send',
      'manage_sales','manage_invoices','view_financial_reports','manage_customers','manage_reports'
    ])
  );

drop policy if exists quotations_ins on public.quotations;
create policy quotations_ins on public.quotations
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['quotations_create','manage_sales','manage_invoices'])
  );

drop policy if exists quotations_upd on public.quotations;
create policy quotations_upd on public.quotations
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['quotations_create','quotations_send','manage_sales','manage_invoices'])
  )
  with check (
    organization_id = public.auth_org_id()
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['quotations_create','quotations_send','manage_sales','manage_invoices'])
  );

drop policy if exists quotations_del on public.quotations;
create policy quotations_del on public.quotations
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['quotations_create','manage_sales','manage_invoices'])
  );

-- ============================================================================
-- Done. Quotations now carry lead/customer/sales-agent attribution, device,
-- items, warranty, offer amount and a sent timestamp, with granular-key RLS.
-- ============================================================================
