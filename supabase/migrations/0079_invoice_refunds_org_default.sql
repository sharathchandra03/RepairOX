-- ============================================================================
-- 0079 — invoice_refunds: organization_id default (bug fix)
-- ============================================================================
-- 0076_invoice_refunds declared `organization_id uuid not null` on the refund
-- tables WITHOUT the `default public.auth_org_id()` that every other per-org
-- table in this schema carries. An end-user insert therefore sent a NULL
-- organization_id, the before-insert guard passed that NULL into
-- next_refund_id(new.organization_id), and the sequence insert failed with:
--
--   null value in column "organization_id" of relation "refund_sequences"
--   violates not-null constraint
--
-- (and the invoice_refunds insert itself would also violate its own NOT NULL).
--
-- This migration is ADDITIVE + IDEMPOTENT. It aligns the refund tables with the
-- rest of the schema so the server resolves the org exactly like leads /
-- quotations / work_sessions / inventory, and hardens the sequence RPCs against
-- a NULL org as defence-in-depth.
-- ============================================================================

-- 1) organization_id defaults to the caller's org (same as every other table).
alter table public.invoice_refunds
  alter column organization_id set default public.auth_org_id();

alter table public.invoice_refund_allocations
  alter column organization_id set default public.auth_org_id();

alter table public.invoice_item_returns
  alter column organization_id set default public.auth_org_id();

alter table public.invoice_refund_revisions
  alter column organization_id set default public.auth_org_id();

-- 2) Defence-in-depth: the per-org sequence RPCs must never attempt to write a
--    NULL organization_id into refund_sequences. If the org cannot be resolved
--    (unauthenticated / mis-scoped caller), fail with a clear error instead of
--    the opaque "refund_sequences organization_id null" violation.
create or replace function public.next_refund_id(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  if p_org_id is null then
    raise exception 'refund_org_unresolved: cannot allocate a refund number without an organization'
      using errcode = '23502';
  end if;

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

create or replace function public.next_item_return_id(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  if p_org_id is null then
    raise exception 'refund_org_unresolved: cannot allocate a return number without an organization'
      using errcode = '23502';
  end if;

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

grant execute on function public.next_refund_id(uuid)       to authenticated;
grant execute on function public.next_item_return_id(uuid)  to authenticated;
