-- ############################################################################
-- 0076_invoice_refunds.sql
--
-- REPAIROX — INVOICE REFUNDS, PARTIAL REFUNDS, DEVICE RETURNS & RECONCILIATION
--
-- A monetary REFUND and a physical ITEM RETURN are SEPARATE, linkable facts
-- attached to a FINALIZED invoice. The finalized invoice is NEVER mutated —
-- refunds are new, linked, compensating transactions and the refund STATUS is
-- DERIVED at read time from the persisted refund rows (never a stored editable
-- label). This migration is ADDITIVE + IDEMPOTENT and reuses — never forks —
-- the existing invoice/org/branch scope, the RLS helpers (auth_has_any /
-- auth_branch_visible / auth_member_of_org / auth_org_id / auth_staff_id), the
-- stock_movements + inventory_items model and the loyalty_transactions ledger.
--
--   Tables:
--     • invoice_refunds             — the money event (one row per refund txn).
--     • invoice_refund_allocations  — per device / per line + qty + tax share.
--     • invoice_item_returns        — physical returns (independent, linkable).
--     • invoice_refund_revisions    — append-only accountability snapshot.
--   Sequence RPCs:
--     • next_refund_id(org)   — gap-free CN-0001 … per organization.
--     • next_item_return_id(org) — gap-free RET-0001 … per organization.
--   Functions:
--     • invoice_refundable_base(invoice_id) — settled refundable base, taking a
--       `for update` row lock on the invoice (serializes concurrent inserts).
--     • restock_item_return(return_id) — atomic Return movement + current_stock
--       bump + return-record completion, disposition- and permission-gated.
--   Triggers (defence-in-depth; UI + CAP are NOT the security boundary):
--     • invoice_refunds_guard         — eligibility, over-refund guard, SoD,
--                                       immutable identity, mandatory reason.
--     • invoice_item_returns_guard    — qty-over-return + restock gating.
--     • invoice_refunds_record_revision — append-only revision on every change.
--   Loyalty: allow source_type 'refund' + a refund-scoped one-reversal index.
-- ############################################################################


-- ============================================================================
-- SECTION 1 — Per-org, gap-free references (CN-0001 … / RET-0001 …)
-- ============================================================================
create table if not exists public.refund_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_refund     integer not null default 1,
  next_return     integer not null default 1
);

create or replace function public.next_refund_id(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  insert into public.refund_sequences (organization_id, next_refund)
  values (
    p_org_id,
    coalesce((
      select max((regexp_replace(refund_no, '\D', '', 'g'))::int)
      from public.invoice_refunds
      where organization_id = p_org_id and refund_no ~ '\d'
    ), 0) + 1
  )
  on conflict (organization_id) do nothing;

  select next_refund into v_num
  from public.refund_sequences
  where organization_id = p_org_id
  for update;

  update public.refund_sequences
  set next_refund = v_num + 1
  where organization_id = p_org_id;

  return 'CN-' || lpad(v_num::text, 4, '0');
end;
$$;

create or replace function public.next_refund_id()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_refund_id(public.auth_org_id());
$$;

create or replace function public.next_item_return_id(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  insert into public.refund_sequences (organization_id, next_return)
  values (
    p_org_id,
    coalesce((
      select max((regexp_replace(return_no, '\D', '', 'g'))::int)
      from public.invoice_item_returns
      where organization_id = p_org_id and return_no ~ '\d'
    ), 0) + 1
  )
  on conflict (organization_id) do update set next_return = public.refund_sequences.next_return;

  select next_return into v_num
  from public.refund_sequences
  where organization_id = p_org_id
  for update;

  update public.refund_sequences
  set next_return = v_num + 1
  where organization_id = p_org_id;

  return 'RET-' || lpad(v_num::text, 4, '0');
end;
$$;

create or replace function public.next_item_return_id()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_item_return_id(public.auth_org_id());
$$;

grant execute on function public.next_refund_id(uuid)        to authenticated;
grant execute on function public.next_refund_id()            to authenticated;
grant execute on function public.next_item_return_id(uuid)   to authenticated;
grant execute on function public.next_item_return_id()       to authenticated;


-- ============================================================================
-- SECTION 2 — invoice_refunds (the money event)
-- ============================================================================
create table if not exists public.invoice_refunds (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  branch_id            uuid references public.branches(id) on delete set null,  -- invoice's branch (origin store)
  refund_no            text,                                                    -- CN-0001 … per org
  invoice_id           text not null references public.invoices(id) on delete cascade,
  invoice_reference    text,
  customer_id          text references public.customers(id) on delete set null,
  customer_name        text,
  ticket_id            text,

  scope                text not null default 'invoice',       -- 'invoice' | 'devices' | 'lines'
  refund_kind          text not null default 'partial',       -- 'full_scope' | 'partial'

  -- Money (all INR, >= 0). gross refund_amount = refund_net + refund_tax.
  refund_net           numeric not null default 0,
  refund_tax           numeric not null default 0,
  refund_discount      numeric not null default 0,
  refund_amount        numeric not null default 0,            -- gross cash returned (authoritative)

  reason_code          text not null,
  reason_comment       text,
  method               text not null default 'cash',          -- from invoicePaymentModes
  reference            text,                                   -- txn / cheque / UTR reference
  customer_note        text,
  internal_remark      text,

  -- Lifecycle (gateway-aware; manual refunds skip pending/processing).
  status               text not null default 'succeeded'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'reversed')),

  -- Segregation-of-duties audit.
  initiated_by         uuid references public.staff(id) on delete set null,
  initiated_by_name    text,
  initiated_at         timestamptz not null default now(),
  approved_by          uuid references public.staff(id) on delete set null,
  approved_by_name     text,
  approved_at          timestamptz,
  processed_by         uuid references public.staff(id) on delete set null,
  processed_by_name    text,
  processed_at         timestamptz,
  reversed_by          uuid references public.staff(id) on delete set null,
  reversed_at          timestamptz,
  reversal_reason      text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists invoice_refunds_invoice_idx  on public.invoice_refunds(invoice_id);
create index if not exists invoice_refunds_org_idx       on public.invoice_refunds(organization_id);
create index if not exists invoice_refunds_branch_idx    on public.invoice_refunds(branch_id);
create index if not exists invoice_refunds_status_idx    on public.invoice_refunds(status);
create index if not exists invoice_refunds_customer_idx  on public.invoice_refunds(customer_id);

-- At most ONE in-flight (gateway pending/processing) refund per invoice — a
-- deliberate first-implementation limitation keeping the over-refund guard's
-- reservation arithmetic race-free. Manual `succeeded` refunds are NOT covered
-- by this index (they are serialized by the `for update` lock in the guard),
-- so a multi-device invoice can still receive several sequential manual device
-- refunds.
create unique index if not exists invoice_refunds_one_open_draft
  on public.invoice_refunds(invoice_id)
  where status in ('pending', 'processing');

comment on table public.invoice_refunds is
  'Refund = monetary reversal attached to a FINALIZED invoice. The invoice is '
  'never mutated; refund status is DERIVED from these rows. Realized balance = '
  'Σ refund_amount where status = succeeded. Over-refund guard base = Σ where '
  'status in (succeeded,pending,processing) incl. the new row, under a for-update '
  'lock on the invoice. Money refund and physical item return are separate facts.';


-- ============================================================================
-- SECTION 3 — invoice_refund_allocations (per device / per line breakdown)
-- ============================================================================
create table if not exists public.invoice_refund_allocations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  refund_id        uuid not null references public.invoice_refunds(id) on delete cascade,
  invoice_id       text not null,                              -- denormalized for RLS + fast rollups
  device_id        text,                                       -- InvoiceDeviceRecord.id (null for flat/invoice scope)
  ticket_device_id text,                                       -- durable device link
  line_id          text,                                       -- InvoiceLineItem.id (null for whole-device/repairCost)
  line_component   text not null default 'line',               -- 'line' | 'repair_cost' | 'device_tax' | 'discount_adj'
  sku              text,                                       -- inventory link when a product line
  qty              numeric not null default 0,                 -- refunded qty for this line (0 for non-line components)
  alloc_net        numeric not null default 0,
  alloc_tax        numeric not null default 0,
  alloc_amount     numeric not null default 0,                 -- alloc_net + alloc_tax
  created_at       timestamptz not null default now()
);

create index if not exists invoice_refund_alloc_refund_idx  on public.invoice_refund_allocations(refund_id);
create index if not exists invoice_refund_alloc_invoice_idx on public.invoice_refund_allocations(invoice_id);
create index if not exists invoice_refund_alloc_line_idx    on public.invoice_refund_allocations(invoice_id, line_id);
create index if not exists invoice_refund_alloc_device_idx  on public.invoice_refund_allocations(invoice_id, device_id);


-- ============================================================================
-- SECTION 4 — invoice_item_returns (physical returns — independent, linkable)
-- ============================================================================
create table if not exists public.invoice_item_returns (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  branch_id          uuid references public.branches(id) on delete set null,   -- RECEIVING store
  return_no          text,                                                     -- RET-0001 … per org
  invoice_id         text not null references public.invoices(id) on delete cascade,
  device_id          text,
  line_id            text,
  sku                text,                                                     -- inventory_items.id by reference (nullable: service)
  item_name          text,
  refund_id          uuid references public.invoice_refunds(id) on delete set null,  -- LINK to money refund (nullable: return-first)
  returned           boolean not null default true,
  return_qty         numeric not null default 0,
  condition          text not null default 'uninspected'
    check (condition in ('uninspected', 'good', 'damaged', 'defective', 'other')),
  disposition        text not null default 'inspection_required'
    check (disposition in ('restock', 'inspection_required', 'damaged_non_saleable', 'do_not_restock')),
  disposition_status text not null default 'pending'
    check (disposition_status in ('pending', 'completed')),
  stock_movement_ref text,                                                     -- Customer Return stock_movements.doc_number
  unit_cost          numeric,                                                  -- cost/valuation at return time (NEVER selling price)
  receiving_store    text,
  inspection_notes   text,
  received_by        uuid references public.staff(id) on delete set null,
  received_by_name   text,
  received_at        timestamptz not null default now(),
  restocked_by       uuid references public.staff(id) on delete set null,
  restocked_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists invoice_item_returns_invoice_idx on public.invoice_item_returns(invoice_id);
create index if not exists invoice_item_returns_refund_idx  on public.invoice_item_returns(refund_id);
create index if not exists invoice_item_returns_sku_idx     on public.invoice_item_returns(sku);
create index if not exists invoice_item_returns_org_idx     on public.invoice_item_returns(organization_id);
create index if not exists invoice_item_returns_disp_idx    on public.invoice_item_returns(disposition, disposition_status);

comment on table public.invoice_item_returns is
  'Physical item return (independent of the money refund; linkable via refund_id). '
  'Saleable stock increases ONLY when disposition=restock reaches disposition_status=completed '
  'via restock_item_return(); inspection/damaged/do-not-restock never increase stock. '
  'This record is the authoritative item+cost ledger for the return — the stock_movements '
  'row only carries qty/stores/actor/type/docNumber.';


-- ============================================================================
-- SECTION 5 — invoice_refund_revisions (append-only accountability)
-- ============================================================================
create table if not exists public.invoice_refund_revisions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  refund_id       uuid not null references public.invoice_refunds(id) on delete cascade,
  invoice_id      text,
  action          text not null,                 -- created|processed|settled|failed|reversed
  status_after    text not null,
  refund_amount   numeric,
  actor_id        uuid references public.staff(id) on delete set null,
  actor_name      text,
  comment         text,
  created_at      timestamptz not null default now()
);
create index if not exists invoice_refund_revisions_refund_idx on public.invoice_refund_revisions(refund_id, created_at);


-- ============================================================================
-- SECTION 6 — updated_at touch triggers
-- ============================================================================
drop trigger if exists invoice_refunds_touch_trg on public.invoice_refunds;
create trigger invoice_refunds_touch_trg
  before update on public.invoice_refunds
  for each row execute function public.touch_updated_at();

drop trigger if exists invoice_item_returns_touch_trg on public.invoice_item_returns;
create trigger invoice_item_returns_touch_trg
  before update on public.invoice_item_returns
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- SECTION 7 — invoice_refundable_base(invoice_id)
--   The settled refundable money cap, under a `for update` row lock on the
--   invoice so two concurrent manual `succeeded` inserts serialize (the second
--   guard sees the first's committed Σ and is rejected). Proforma/draft/
--   cancelled/unpaid return 0 (never a cash refund).
-- ============================================================================
create or replace function public.invoice_refundable_base(p_invoice_id text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_doc text;
begin
  select total, paid_amount, status, devices
    into v_inv
  from public.invoices
  where id = p_invoice_id
  for update;   -- serialize concurrent refund guards against this invoice

  if v_inv is null then
    return 0;
  end if;

  -- Document type lives in the JSONB `devices` envelope (meta.documentType);
  -- absent → normal 'invoice'. A proforma is never revenue, never refundable.
  v_doc := coalesce(
    case when jsonb_typeof(v_inv.devices) = 'object'
         then v_inv.devices->>'documentType' end,
    'invoice');

  if v_doc = 'proforma' then return 0; end if;
  if v_inv.status in ('draft', 'cancelled') then return 0; end if;

  -- Only money actually received is refundable.
  return greatest(0, least(coalesce(v_inv.paid_amount, 0), coalesce(v_inv.total, 0)));
end;
$$;
grant execute on function public.invoice_refundable_base(text) to authenticated;


-- ============================================================================
-- SECTION 8 — invoice_refunds_guard (eligibility + over-refund + SoD)
-- ============================================================================
create or replace function public.invoice_refunds_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me        uuid := public.auth_staff_id();
  v_me_name   text;
  v_base      numeric;
  v_reserved  numeric;
  v_processing boolean;
  v_reversing  boolean;
begin
  -- Service-role / server writes (migrations, admin client) bypass user checks
  -- but still stamp the refund_no + org immutability on insert.
  if auth.uid() is null then
    if tg_op = 'INSERT' and new.refund_no is null then
      new.refund_no := public.next_refund_id(new.organization_id);
    end if;
    return new;
  end if;

  select name into v_me_name from public.staff where id = v_me;

  if tg_op = 'INSERT' then
    -- Server-owned identity + reference.
    new.initiated_by      := v_me;
    new.initiated_by_name := v_me_name;
    new.initiated_at      := now();
    if new.refund_no is null then
      new.refund_no := public.next_refund_id(new.organization_id);
    end if;

    -- Mandatory reason.
    if coalesce(btrim(new.reason_code), '') = '' then
      raise exception 'refund_reason_required: a refund reason is mandatory'
        using errcode = '23514';
    end if;

    -- Capability to initiate.
    if not public.auth_has_any(array['refunds_initiate', 'refunds_process', 'manage_refunds']) then
      raise exception 'refund_initiate_forbidden: you are not allowed to initiate refunds'
        using errcode = '42501';
    end if;
    -- Marking a refund succeeded directly (manual path) needs the process key.
    if new.status = 'succeeded'
       and not public.auth_has_any(array['refunds_process', 'manage_refunds']) then
      raise exception 'refund_process_forbidden: you are not allowed to process refunds'
        using errcode = '42501';
    end if;

    -- Eligibility (reads real money state, not the status label).
    v_base := public.invoice_refundable_base(new.invoice_id);  -- takes the for-update lock
    if v_base <= 0 then
      raise exception 'refund_not_eligible: this invoice is not eligible for a monetary refund (proforma/draft/cancelled/unpaid)'
        using errcode = '23514';
    end if;

    -- Over-refund guard: Σ refund_amount in (succeeded,pending,processing) for
    -- the invoice, INCLUDING this new row, must not exceed the settled base.
    select coalesce(sum(refund_amount), 0) into v_reserved
    from public.invoice_refunds
    where invoice_id = new.invoice_id
      and status in ('succeeded', 'pending', 'processing');
    if (v_reserved + coalesce(new.refund_amount, 0)) > (v_base + 0.01) then
      raise exception 'refund_exceeds_balance: the refund exceeds the invoice''s remaining refundable balance'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- UPDATE path -------------------------------------------------------------
  -- Immutable identity + lineage.
  new.id              := old.id;
  new.organization_id := old.organization_id;
  new.invoice_id      := old.invoice_id;
  new.refund_no       := old.refund_no;
  new.initiated_by    := old.initiated_by;
  new.initiated_by_name := old.initiated_by_name;
  new.initiated_at    := old.initiated_at;

  v_processing := new.status is distinct from old.status
                  and old.status in ('pending', 'processing')
                  and new.status in ('succeeded', 'failed');
  v_reversing  := new.status is distinct from old.status and new.status = 'reversed';

  if v_processing then
    if new.status = 'succeeded'
       and not public.auth_has_any(array['refunds_process', 'manage_refunds']) then
      raise exception 'refund_process_forbidden: you are not allowed to settle refunds'
        using errcode = '42501';
    end if;
    if new.status = 'succeeded' then
      new.processed_by      := v_me;
      new.processed_by_name := v_me_name;
      new.processed_at      := now();
      -- Re-check the over-refund guard at settlement (realized set + this row).
      v_base := public.invoice_refundable_base(new.invoice_id);
      select coalesce(sum(refund_amount), 0) into v_reserved
      from public.invoice_refunds
      where invoice_id = new.invoice_id
        and status in ('succeeded', 'pending', 'processing')
        and id <> new.id;
      if (v_reserved + coalesce(new.refund_amount, 0)) > (v_base + 0.01) then
        raise exception 'refund_exceeds_balance: the refund exceeds the invoice''s remaining refundable balance'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if v_reversing then
    if old.status not in ('succeeded', 'pending', 'processing') then
      raise exception 'refund_reverse_invalid: only an active refund can be reversed'
        using errcode = '23514';
    end if;
    if not public.auth_has_any(array['refunds_approve', 'manage_refunds']) then
      raise exception 'refund_reverse_forbidden: you are not allowed to reverse refunds'
        using errcode = '42501';
    end if;
    new.reversed_by  := v_me;
    new.reversed_at  := now();
    return new;
  end if;

  -- Approver column is only settable by a non-initiator holding refunds_approve.
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null then
    if new.initiated_by = v_me then
      raise exception 'refund_self_approval_forbidden: you cannot approve your own refund'
        using errcode = '42501';
    end if;
    if not public.auth_has_any(array['refunds_approve', 'manage_refunds']) then
      raise exception 'refund_approve_forbidden: you are not allowed to approve refunds'
        using errcode = '42501';
    end if;
    new.approved_by      := v_me;
    new.approved_by_name := v_me_name;
    new.approved_at      := now();
  end if;

  -- A succeeded/failed/reversed refund's money fields are locked (immutable).
  if old.status in ('succeeded', 'failed', 'reversed')
     and (new.refund_amount is distinct from old.refund_amount
          or new.refund_net is distinct from old.refund_net
          or new.refund_tax is distinct from old.refund_tax) then
    raise exception 'refund_locked: a settled/failed/reversed refund amount is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists invoice_refunds_guard_trg on public.invoice_refunds;
create trigger invoice_refunds_guard_trg
  before insert or update on public.invoice_refunds
  for each row execute function public.invoice_refunds_guard();


-- ============================================================================
-- SECTION 9 — invoice_item_returns_guard (qty-over-return + restock gating)
-- ============================================================================
create or replace function public.invoice_item_returns_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me          uuid := public.auth_staff_id();
  v_me_name     text;
  v_prior       numeric;
  v_invoiced    numeric;
begin
  if auth.uid() is null then
    if tg_op = 'INSERT' and new.return_no is null then
      new.return_no := public.next_item_return_id(new.organization_id);
    end if;
    return new;
  end if;

  select name into v_me_name from public.staff where id = v_me;

  if tg_op = 'INSERT' then
    new.received_by      := coalesce(new.received_by, v_me);
    new.received_by_name := coalesce(new.received_by_name, v_me_name);
    if new.return_no is null then
      new.return_no := public.next_item_return_id(new.organization_id);
    end if;
    if not public.auth_has_any(array['returns_accept', 'returns_restock', 'adjust_stock', 'approve_inventory', 'manage_inventory', 'manage_refunds']) then
      raise exception 'return_accept_forbidden: you are not allowed to record customer returns'
        using errcode = '42501';
    end if;
    -- Qty-over-return guard: return_qty must not exceed invoiced qty − prior
    -- accepted returns for the same (invoice_id, line_id). line_id null (whole
    -- device / service) is not qty-bounded here (there is no invoiced qty).
    if new.line_id is not null and coalesce(new.return_qty, 0) > 0 then
      -- Prior accepted returns on the same line (exclude this row; non-reversed).
      select coalesce(sum(return_qty), 0) into v_prior
      from public.invoice_item_returns
      where invoice_id = new.invoice_id and line_id = new.line_id;
      -- Invoiced qty for the line: read from the invoice's JSONB devices/items.
      v_invoiced := public.invoice_line_qty(new.invoice_id, new.line_id);
      if v_invoiced > 0 and (v_prior + coalesce(new.return_qty, 0)) > v_invoiced then
        raise exception 'return_exceeds_qty: the returned quantity exceeds the invoiced quantity minus prior returns'
          using errcode = '23514';
      end if;
    end if;
    -- A return created directly as a completed restock needs the restock key.
    if new.disposition = 'restock' and new.disposition_status = 'completed'
       and not public.auth_has_any(array['returns_restock', 'approve_inventory', 'manage_inventory']) then
      raise exception 'return_restock_forbidden: you are not allowed to restock returned items'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE path: immutable identity.
  new.id              := old.id;
  new.organization_id := old.organization_id;
  new.invoice_id      := old.invoice_id;
  new.return_no       := old.return_no;

  -- A disposition reaching completed=restock needs the restock capability.
  if new.disposition_status = 'completed' and old.disposition_status <> 'completed'
     and new.disposition = 'restock'
     and not public.auth_has_any(array['returns_restock', 'approve_inventory', 'manage_inventory']) then
    raise exception 'return_restock_forbidden: you are not allowed to restock returned items'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Helper: invoiced qty for a given invoice line id, read from the invoice's
-- JSONB `devices` records (multi-device) + flat `items` (legacy). Returns 0
-- when the line is not found (unbounded / service line).
create or replace function public.invoice_line_qty(p_invoice_id text, p_line_id text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devices jsonb;
  v_items   jsonb;
  v_qty     numeric := 0;
  v_rec     jsonb;
  v_part    jsonb;
begin
  select devices, to_jsonb(items) into v_devices, v_items
  from public.invoices where id = p_invoice_id;

  -- Flat legacy items.
  if v_items is not null and jsonb_typeof(v_items) = 'array' then
    for v_part in select * from jsonb_array_elements(v_items) loop
      if v_part->>'id' = p_line_id then
        return coalesce((v_part->>'qty')::numeric, 0);
      end if;
    end loop;
  end if;

  -- Multi-device records live under devices->'records'.
  if v_devices is not null and jsonb_typeof(v_devices) = 'object'
     and jsonb_typeof(v_devices->'records') = 'array' then
    for v_rec in select * from jsonb_array_elements(v_devices->'records') loop
      if jsonb_typeof(v_rec->'parts') = 'array' then
        for v_part in select * from jsonb_array_elements(v_rec->'parts') loop
          if v_part->>'id' = p_line_id then
            return coalesce((v_part->>'qty')::numeric, 0);
          end if;
        end loop;
      end if;
    end loop;
  end if;

  return v_qty;
end;
$$;
grant execute on function public.invoice_line_qty(text, text) to authenticated;

drop trigger if exists invoice_item_returns_guard_trg on public.invoice_item_returns;
create trigger invoice_item_returns_guard_trg
  before insert or update on public.invoice_item_returns
  for each row execute function public.invoice_item_returns_guard();


-- ============================================================================
-- SECTION 10 — restock_item_return(return_id) — atomic restock
--   Insert the Customer Return stock_movements row + bump inventory_items
--   current_stock + mark the return completed, all-or-nothing, disposition- and
--   permission-gated. Valued at the item's cost (unit_cost on the return / the
--   item master), NEVER the customer selling/refund price.
-- ============================================================================
create or replace function public.restock_item_return(p_return_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ret     record;
  v_doc     text;
  v_recv    text;
begin
  select * into v_ret from public.invoice_item_returns where id = p_return_id for update;
  if v_ret is null then
    raise exception 'return_not_found: no such item return' using errcode = 'P0002';
  end if;

  -- End-user capability check (service-role bypasses via auth.uid() null).
  if auth.uid() is not null
     and not public.auth_has_any(array['returns_restock', 'approve_inventory', 'manage_inventory']) then
    raise exception 'return_restock_forbidden: you are not allowed to restock returned items'
      using errcode = '42501';
  end if;

  if v_ret.disposition <> 'restock' then
    raise exception 'return_not_restockable: only a restock-disposition return can increase saleable stock'
      using errcode = '23514';
  end if;
  if v_ret.disposition_status = 'completed' then
    raise exception 'return_already_restocked: this return has already been restocked'
      using errcode = '23514';
  end if;
  if coalesce(v_ret.return_qty, 0) <= 0 then
    raise exception 'return_qty_invalid: returned quantity must be positive to restock'
      using errcode = '23514';
  end if;

  v_doc  := public.next_item_return_id(v_ret.organization_id);
  v_recv := coalesce(v_ret.receiving_store, 'Store');

  -- 1. Customer Return stock movement (qty/stores/actor/type/docNumber only).
  insert into public.stock_movements (
    doc_number, organization_id, branch_id, from_store, to_store, items,
    movement_date, movement_user, movement_type, status
  ) values (
    v_doc, v_ret.organization_id, v_ret.branch_id, 'Customer', v_recv, ceil(v_ret.return_qty)::int,
    now()::text, coalesce(public.auth_staff_id()::text, 'system'), 'Return', 'completed'
  );

  -- 2. Increase saleable stock (the net-new increment) — ONLY for restock.
  if v_ret.sku is not null then
    update public.inventory_items
    set current_stock = coalesce(current_stock, 0) + v_ret.return_qty
    where id = v_ret.sku;
  end if;

  -- 3. Complete the return record + link the movement.
  update public.invoice_item_returns
  set disposition_status = 'completed',
      stock_movement_ref = v_doc,
      restocked_by       = public.auth_staff_id(),
      restocked_at       = now()
  where id = p_return_id;

  return v_doc;
end;
$$;
grant execute on function public.restock_item_return(uuid) to authenticated;


-- ============================================================================
-- SECTION 11 — invoice_refunds_record_revision (append-only accountability)
-- ============================================================================
create or replace function public.invoice_refunds_record_revision()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.status = 'succeeded' then 'processed' else 'created' end;
  elsif new.status is distinct from old.status then
    v_action := case new.status
      when 'succeeded' then 'settled'
      when 'failed'    then 'failed'
      when 'reversed'  then 'reversed'
      when 'processing' then 'processing'
      else null end;
  else
    v_action := null;
  end if;

  if v_action is null then return null; end if;

  insert into public.invoice_refund_revisions (
    organization_id, refund_id, invoice_id, action, status_after, refund_amount,
    actor_id, actor_name, comment
  ) values (
    new.organization_id, new.id, new.invoice_id, v_action, new.status, new.refund_amount,
    coalesce(new.processed_by, new.reversed_by, new.initiated_by, public.auth_staff_id()),
    coalesce(new.processed_by_name, new.initiated_by_name),
    coalesce(new.reversal_reason, new.reason_comment)
  );
  return null;
end;
$$;

drop trigger if exists invoice_refunds_revision_trg on public.invoice_refunds;
create trigger invoice_refunds_revision_trg
  after insert or update on public.invoice_refunds
  for each row execute function public.invoice_refunds_record_revision();


-- ============================================================================
-- SECTION 12 — Loyalty: allow source_type 'refund' + refund-scoped one-reversal
--   The existing loyalty_transactions_one_earn_per_source index is scoped
--   `where type='earn'`, so it does NOT cover reversal rows. Add a dedicated
--   refund-scoped partial unique index + widen the source_type CHECK.
-- ============================================================================
alter table public.loyalty_transactions drop constraint if exists loyalty_transactions_source_type_check;
alter table public.loyalty_transactions add constraint loyalty_transactions_source_type_check
  check (source_type in ('invoice', 'adjustment', 'admin', 'refund'));

create unique index if not exists loyalty_transactions_one_refund_reversal
  on public.loyalty_transactions(source_type, source_id)
  where type = 'adjustment' and source_type = 'refund';


-- ============================================================================
-- SECTION 13 — Settings: additive refund_config JSONB on organization_settings
-- ============================================================================
alter table public.organization_settings add column if not exists refund_config jsonb;
comment on column public.organization_settings.refund_config is
  'Refund config: { reasons: string[], require_approval: boolean, allow_partial: boolean, '
  'restock_default: disposition }. Read via parseJsonColumn with DEFAULT_STORE_SETTINGS.refundConfig '
  'as fallback. Payment methods reuse invoice_payment_modes (no second list).';


-- ============================================================================
-- SECTION 14 — RLS (visibility follows the parent invoice; actions by capability)
--   NIT-2: auth_branch_visible(null) is treated as org-wide-visible (see
--   0001_initial_schema.sql auth_branch_visible — `b is null` → true), matching
--   the lead_deals pattern this table mirrors; branch_id is `on delete set null`.
-- ============================================================================
alter table public.invoice_refunds            enable row level security;
alter table public.invoice_refund_allocations enable row level security;
alter table public.invoice_item_returns       enable row level security;
alter table public.invoice_refund_revisions   enable row level security;

-- invoice_refunds -----------------------------------------------------------
drop policy if exists invoice_refunds_sel on public.invoice_refunds;
create policy invoice_refunds_sel on public.invoice_refunds for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['refunds_view', 'manage_refunds', 'manage_invoices', 'manage_reports', 'view_invoice'])
);

drop policy if exists invoice_refunds_ins on public.invoice_refunds;
create policy invoice_refunds_ins on public.invoice_refunds for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['refunds_initiate', 'refunds_process', 'manage_refunds'])
);

drop policy if exists invoice_refunds_upd on public.invoice_refunds;
create policy invoice_refunds_upd on public.invoice_refunds for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['refunds_process', 'refunds_approve', 'manage_refunds'])
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
);

-- No delete policy — refunds are never deleted (reverse instead). RLS denies.

-- invoice_refund_allocations ------------------------------------------------
drop policy if exists invoice_refund_alloc_sel on public.invoice_refund_allocations;
create policy invoice_refund_alloc_sel on public.invoice_refund_allocations for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['refunds_view', 'manage_refunds', 'manage_invoices', 'manage_reports', 'view_invoice'])
);

drop policy if exists invoice_refund_alloc_ins on public.invoice_refund_allocations;
create policy invoice_refund_alloc_ins on public.invoice_refund_allocations for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_has_any(array['refunds_initiate', 'refunds_process', 'manage_refunds'])
);

-- invoice_item_returns ------------------------------------------------------
drop policy if exists invoice_item_returns_sel on public.invoice_item_returns;
create policy invoice_item_returns_sel on public.invoice_item_returns for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['refunds_view', 'returns_accept', 'returns_restock', 'manage_refunds', 'manage_invoices', 'manage_inventory', 'manage_reports', 'view_invoice', 'view_inventory'])
);

drop policy if exists invoice_item_returns_ins on public.invoice_item_returns;
create policy invoice_item_returns_ins on public.invoice_item_returns for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['returns_accept', 'returns_restock', 'adjust_stock', 'approve_inventory', 'manage_inventory', 'manage_refunds'])
);

drop policy if exists invoice_item_returns_upd on public.invoice_item_returns;
create policy invoice_item_returns_upd on public.invoice_item_returns for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['returns_accept', 'returns_restock', 'approve_inventory', 'manage_inventory', 'manage_refunds'])
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
);

-- invoice_refund_revisions (read-only to clients; written by the trigger only)
drop policy if exists invoice_refund_revisions_sel on public.invoice_refund_revisions;
create policy invoice_refund_revisions_sel on public.invoice_refund_revisions for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['refunds_view', 'manage_refunds', 'manage_invoices', 'manage_reports', 'view_invoice'])
);


-- ============================================================================
-- SECTION 15 — Realtime publication + grants
-- ============================================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.invoice_refunds';            exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.invoice_refund_allocations';  exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.invoice_item_returns';        exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.invoice_refund_revisions';    exception when others then null; end;
end $$;

grant select, insert, update         on public.invoice_refunds            to authenticated;
grant select, insert                 on public.invoice_refund_allocations to authenticated;
grant select, insert, update         on public.invoice_item_returns       to authenticated;
grant select                         on public.invoice_refund_revisions   to authenticated;
grant select, insert, update         on public.refund_sequences           to authenticated;
