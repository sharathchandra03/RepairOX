-- ============================================================================
-- RepairOX — Backfill loyalty points from historical paid invoices (0041)
--
-- Awards loyalty points for every paid invoice that has never had an "earn"
-- transaction written. Safe to run multiple times — the unique index
-- loyalty_transactions_one_earn_per_source prevents duplicate awards.
--
-- Rate: floor(total / 100) points per ₹ (default 1 pt per ₹100).
-- Only processes: status = 'paid', deleted_at IS NULL, customer_id NOT NULL,
--                 total > 0.
-- ============================================================================

do $$
declare
  v_invoices_found  integer := 0;
  v_ledger_inserted integer := 0;
  v_accounts_upserted integer := 0;
begin

  -- ── 1. Count eligible invoices ────────────────────────────────────────────
  select count(*)
  into v_invoices_found
  from public.invoices i
  where i.status     = 'paid'
    and i.deleted_at  is null
    and i.customer_id is not null
    and i.total       > 0
    -- Skip invoices already awarded (earn tx exists for this source_id)
    and not exists (
      select 1 from public.loyalty_transactions lt
      where lt.type       = 'earn'
        and lt.source_type = 'invoice'
        and lt.source_id   = i.id
    );

  raise notice 'Loyalty backfill: % eligible paid invoices found.', v_invoices_found;

  if v_invoices_found = 0 then
    raise notice 'Nothing to backfill — all paid invoices already have earn transactions.';
    return;
  end if;

  -- ── 2. Insert ledger rows (one per invoice, idempotent) ───────────────────
  -- points_balance for each row = running cumulative per customer,
  -- ordered by invoice created_at ascending.
  with eligible as (
    select
      i.id                                            as invoice_id,
      i.customer_id,
      i.organization_id,
      i.branch_id,
      i.created_at,
      floor(i.total / 100)::integer                   as pts
    from public.invoices i
    where i.status     = 'paid'
      and i.deleted_at  is null
      and i.customer_id is not null
      and i.total       > 0
      and not exists (
        select 1 from public.loyalty_transactions lt
        where lt.type       = 'earn'
          and lt.source_type = 'invoice'
          and lt.source_id   = i.id
      )
  ),
  windowed as (
    select
      invoice_id,
      customer_id,
      organization_id,
      branch_id,
      created_at,
      pts,
      sum(pts) over (
        partition by customer_id
        order by created_at asc
        rows between unbounded preceding and current row
      ) as running_balance
    from eligible
  )
  insert into public.loyalty_transactions (
    id, organization_id, branch_id, customer_id,
    type, points_change, points_balance,
    source_type, source_id, description, created_at
  )
  select
    'BF-' || invoice_id,
    organization_id,
    branch_id,
    customer_id,
    'earn',
    pts,
    running_balance,
    'invoice',
    invoice_id,
    'Backfilled from paid invoice',
    created_at
  from windowed
  on conflict do nothing;

  get diagnostics v_ledger_inserted = row_count;
  raise notice 'Loyalty backfill: % ledger rows inserted.', v_ledger_inserted;

  -- ── 3. Upsert loyalty_accounts with correct totals ────────────────────────
  with totals as (
    select
      lt.customer_id,
      -- Use the organization from the first matching invoice for this customer
      (select organization_id from public.invoices
       where customer_id = lt.customer_id and status = 'paid' and deleted_at is null
       limit 1)                                        as organization_id,
      sum(lt.points_change)                            as total_points,
      max(lt.created_at)                               as last_tx_at
    from public.loyalty_transactions lt
    where lt.type = 'earn'
    group by lt.customer_id
  )
  insert into public.loyalty_accounts (
    customer_id, organization_id, points_balance, tier, last_transaction_at
  )
  select
    customer_id,
    organization_id,
    total_points,
    case
      when total_points >= 10000 then 'platinum'
      when total_points >= 5000  then 'gold'
      when total_points >= 1000  then 'silver'
      else                            'bronze'
    end,
    last_tx_at
  from totals
  on conflict (customer_id) do update
    set points_balance       = excluded.points_balance,
        tier                  = excluded.tier,
        last_transaction_at   = excluded.last_transaction_at,
        updated_at            = now();

  get diagnostics v_accounts_upserted = row_count;
  raise notice 'Loyalty backfill: % loyalty_accounts upserted.', v_accounts_upserted;

  raise notice 'Loyalty backfill complete.';
end $$;
