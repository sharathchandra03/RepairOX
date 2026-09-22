-- ============================================================================
-- RepairOX — Loyalty Ledger (Customer Master integration)
--
-- Adds the persistence layer for the customer loyalty program:
--   1. loyalty_accounts     — one row per customer, current points balance + tier
--   2. loyalty_transactions — immutable ledger (earn / redeem / adjustment /
--                             tier_change), append-only, never updated/deleted
--                             by normal application flow
--
-- Points are earned ONLY from invoices whose status = 'paid' (fully settled).
-- Draft / sent / partial / overdue / cancelled invoices never earn points.
-- Awarding happens once per invoice (loyalty_transactions.source_id = invoice
-- id, enforced via a partial unique index on earn transactions) so re-saving
-- an already-paid invoice cannot double-award.
--
-- Safe to re-run: uses "if not exists" / "drop if exists" patterns throughout.
-- Run in Supabase → SQL Editor.
-- ============================================================================

-- ── 0. Loyalty program configuration (org-wide, Settings → Customers → Loyalty) ──
alter table public.organization_settings add column if not exists loyalty_config jsonb;

comment on column public.organization_settings.loyalty_config is
  'Loyalty program config: { enabled: boolean, pointsPerRupee: number }. Read via parseJsonColumn with DEFAULT_STORE_SETTINGS.loyaltyConfig as fallback for older rows.';

-- ── 1. Loyalty Accounts ─────────────────────────────────────────────────────
create table if not exists public.loyalty_accounts (
  customer_id           text primary key references public.customers(id) on delete cascade,
  organization_id       uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  points_balance        integer not null default 0,
  tier                  text not null default 'bronze',
  enrolled_at           timestamptz not null default now(),
  last_transaction_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists loyalty_accounts_org_idx on public.loyalty_accounts(organization_id);

comment on table public.loyalty_accounts is
  'One row per customer. points_balance and tier are denormalized snapshots kept in sync by the loyalty_transactions ledger — never edited directly by application code except through the award/redeem/adjust flow.';

drop trigger if exists loyalty_accounts_touch on public.loyalty_accounts;
create trigger loyalty_accounts_touch before update on public.loyalty_accounts
  for each row execute function public.touch_updated_at();

-- ── 2. Loyalty Transactions (immutable ledger) ──────────────────────────────
create table if not exists public.loyalty_transactions (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  customer_id     text not null references public.customers(id) on delete cascade,
  type            text not null check (type in ('earn', 'redeem', 'adjustment', 'tier_change')),
  points_change   integer not null default 0,
  points_balance  integer not null,           -- cumulative balance AFTER this transaction
  tier            text,                        -- populated for tier_change rows
  source_type     text check (source_type in ('invoice', 'adjustment', 'admin')),
  source_id       text,                        -- e.g. the invoice id points were earned from
  description     text not null default '',
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists loyalty_transactions_org_idx on public.loyalty_transactions(organization_id);
create index if not exists loyalty_transactions_customer_idx on public.loyalty_transactions(customer_id, created_at desc);
create index if not exists loyalty_transactions_source_idx on public.loyalty_transactions(source_type, source_id);

comment on table public.loyalty_transactions is
  'Append-only loyalty ledger. Application code must never UPDATE or DELETE a row here — corrections are made with a new adjustment transaction, matching standard ledger practice.';

-- Prevent double-awarding points for the same invoice: at most one "earn"
-- transaction per (source_type, source_id) pair. Adjustments/redemptions are
-- unaffected since this index only applies to type = 'earn'.
create unique index if not exists loyalty_transactions_one_earn_per_source
  on public.loyalty_transactions(source_type, source_id)
  where type = 'earn' and source_id is not null;

-- ── 3. Row Level Security ───────────────────────────────────────────────────
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;

drop policy if exists loyalty_accounts_select on public.loyalty_accounts;
create policy loyalty_accounts_select on public.loyalty_accounts
  for select using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['view_loyalty', 'loyalty_view_points', 'manage_loyalty'])
  );

-- Accounts are only ever written by the award/redeem/tier-change flow (which
-- runs with the same permission set as the transaction that created it).
drop policy if exists loyalty_accounts_write on public.loyalty_accounts;
create policy loyalty_accounts_write on public.loyalty_accounts
  for all using (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['loyalty_award_points', 'loyalty_redeem_points', 'loyalty_tier_change', 'manage_loyalty'])
  ) with check (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['loyalty_award_points', 'loyalty_redeem_points', 'loyalty_tier_change', 'manage_loyalty'])
  );

drop policy if exists loyalty_transactions_select on public.loyalty_transactions;
create policy loyalty_transactions_select on public.loyalty_transactions
  for select using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['view_loyalty', 'loyalty_view_points', 'manage_loyalty'])
  );

-- Ledger rows are insert-only from the app's perspective (no update/delete
-- policy is defined, so RLS denies those by default even to holders of the
-- write keys below — corrections must be new rows, matching table comment).
drop policy if exists loyalty_transactions_insert on public.loyalty_transactions;
create policy loyalty_transactions_insert on public.loyalty_transactions
  for insert with check (
    public.auth_member_of_org(organization_id)
    and public.auth_has_any(array['loyalty_award_points', 'loyalty_redeem_points', 'loyalty_tier_change', 'manage_loyalty'])
  );

-- ── 4. Realtime ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loyalty_accounts'
  ) then
    alter publication supabase_realtime add table public.loyalty_accounts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loyalty_transactions'
  ) then
    alter publication supabase_realtime add table public.loyalty_transactions;
  end if;
end $$;
