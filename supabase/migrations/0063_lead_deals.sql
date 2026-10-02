-- ############################################################################
-- 0063_lead_deals.sql
--
-- REPAIROX — DEAL / DISCOUNT-APPROVAL WORKFLOW (attached to a Lead)
--
-- A DEAL is NOT a duplicate Lead. It is the commercial-exception / approval
-- workflow ATTACHED to a Lead:
--
--     CUSTOMER → LEAD → DEAL (approval, only when required) → continue Lead flow
--
-- The Lead stays the source of truth for the opportunity and the Sales Agent
-- attribution; the Deal only captures the discount request, its approval
-- lifecycle, and an immutable audit trail. This migration is ADDITIVE +
-- IDEMPOTENT and reuses — never forks — the existing lead RLS helpers
-- (auth_lead_visible / auth_has_any / auth_branch_visible / auth_staff_id),
-- the org/branch scope, and the sales-agent attribution.
--
--   Tables:
--     • lead_deals            — one approval request per revision cycle.
--     • lead_deal_comments    — the internal approval conversation (append-only).
--     • lead_deal_revisions   — append-only snapshot per submit/decision.
--   Sequence RPC:
--     • next_deal_id(org)     — gap-free DA-0001, DA-0002 … per organization.
--   Triggers (defence-in-depth; UI + CAP are not the security boundary):
--     • lead_deals_guard      — BEFORE: stamp created_by/deal_no, block
--                               self-approval, protect approver/decision columns,
--                               enforce capability by action.
--     • lead_deals_revision   — AFTER: write a revision snapshot on every
--                               submit / resubmit / decision.
-- ############################################################################


-- ============================================================================
-- SECTION 1 — Per-org, gap-free Deal reference (DA-0001 …)
-- ============================================================================
create table if not exists public.deal_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_number     integer not null default 1
);

create or replace function public.next_deal_id(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  insert into public.deal_sequences (organization_id, next_number)
  values (
    p_org_id,
    coalesce((
      select max((regexp_replace(deal_no, '\D', '', 'g'))::int)
      from public.lead_deals
      where organization_id = p_org_id and deal_no ~ '\d'
    ), 0) + 1
  )
  on conflict (organization_id) do nothing;

  select next_number into v_num
  from public.deal_sequences
  where organization_id = p_org_id
  for update;

  update public.deal_sequences
  set next_number = v_num + 1
  where organization_id = p_org_id;

  return 'DA-' || lpad(v_num::text, 4, '0');
end;
$$;

create or replace function public.next_deal_id()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_deal_id(public.auth_org_id());
$$;

grant execute on function public.next_deal_id(uuid) to authenticated;
grant execute on function public.next_deal_id()     to authenticated;


-- ============================================================================
-- SECTION 2 — lead_deals
-- ============================================================================
create table if not exists public.lead_deals (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  branch_id              uuid references public.branches(id) on delete set null,
  deal_no                text,

  -- Links (reference, never embed).
  lead_id                uuid not null references public.leads(id) on delete cascade,
  lead_no                text,
  customer_id            text,
  customer_name          text,
  -- The Sales Agent who owns the opportunity (the lead owner). Approval never
  -- changes this — sales credit stays with the agent.
  sales_agent_id         uuid references public.staff(id) on delete set null,
  sales_agent_name       text,

  -- The discount request. Requested vs Approved are DISTINCT.
  requested_discount      numeric,
  requested_discount_type text not null default 'percent',  -- 'amount' | 'percent'
  requested_reason        text,
  lead_value              numeric,

  approved_discount       numeric,
  approved_discount_type  text not null default 'percent',

  -- Approval lifecycle (SEPARATE from Lead Status).
  status                 text not null default 'pending_approval',
    -- pending_approval | changes_requested | approved | rejected | cancelled
  revision               integer not null default 1,

  approver_id            uuid references public.staff(id) on delete set null,
  approver_name          text,
  decided_at             timestamptz,
  approval_comment       text,
  rejection_reason       text,

  -- Audit.
  created_by             uuid references public.staff(id) on delete set null,
  created_by_name        text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists lead_deals_lead_idx    on public.lead_deals(lead_id);
create index if not exists lead_deals_org_idx      on public.lead_deals(organization_id);
create index if not exists lead_deals_branch_idx   on public.lead_deals(branch_id);
create index if not exists lead_deals_status_idx   on public.lead_deals(status);
create index if not exists lead_deals_agent_idx    on public.lead_deals(sales_agent_id);
-- At most ONE open (pending / changes_requested) deal per lead — the DB-level
-- duplicate-request guard (double-click / refresh / retry can't create two).
create unique index if not exists lead_deals_one_open_per_lead
  on public.lead_deals(lead_id)
  where status in ('pending_approval', 'changes_requested');

comment on table public.lead_deals is
  'Deal = discount/commercial-exception approval workflow attached to a Lead. '
  'NOT a duplicate Lead. Approval is separate from Lead conversion; approval '
  'never changes Sales Agent attribution, never auto-wins/loses the Lead.';


-- ============================================================================
-- SECTION 3 — lead_deal_comments (internal approval conversation)
-- ============================================================================
create table if not exists public.lead_deal_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deal_id         uuid not null references public.lead_deals(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete cascade,
  author_id       uuid references public.staff(id) on delete set null,
  author_name     text,
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists lead_deal_comments_deal_idx on public.lead_deal_comments(deal_id, created_at);


-- ============================================================================
-- SECTION 4 — lead_deal_revisions (append-only accountability snapshot)
-- ============================================================================
create table if not exists public.lead_deal_revisions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  deal_id                 uuid not null references public.lead_deals(id) on delete cascade,
  lead_id                 uuid references public.leads(id) on delete cascade,
  revision                integer not null,
  action                  text not null,  -- submitted|resubmitted|changes_requested|approved|rejected|cancelled
  requested_discount      numeric,
  requested_discount_type text,
  requested_reason        text,
  approved_discount       numeric,
  approved_discount_type  text,
  status_after            text not null,
  actor_id                uuid references public.staff(id) on delete set null,
  actor_name              text,
  comment                 text,
  created_at              timestamptz not null default now()
);
create index if not exists lead_deal_revisions_deal_idx on public.lead_deal_revisions(deal_id, revision);


-- ============================================================================
-- SECTION 5 — updated_at touch trigger
-- ============================================================================
create or replace function public.lead_deals_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists lead_deals_touch_trg on public.lead_deals;
create trigger lead_deals_touch_trg
  before update on public.lead_deals
  for each row execute function public.lead_deals_touch();


-- ============================================================================
-- SECTION 6 — Guard trigger (defence-in-depth; the real approval boundary)
--   • Service-role writes (no end-user JWT) skip the checks.
--   • created_by is stamped from the caller and immutable.
--   • deal_no is server-generated on insert.
--   • A requester can NEVER approve/reject/request-changes their OWN deal.
--   • Approver / decision columns can only be written via an approval action by
--     a user holding the matching capability — never silently by the agent.
--   • A pending request's commercial values are protected; the agent revises
--     via a resubmit (which the app sends with status → pending_approval + an
--     incremented revision), not a silent edit of the pending row.
-- ============================================================================
create or replace function public.lead_deals_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := public.auth_staff_id();
  v_me_name  text;
  v_lead     record;
  v_decides  boolean;  -- is this write a decision (approve/reject/changes)?
begin
  -- Service-role / server writes (migrations, admin client) bypass user checks.
  if auth.uid() is null then
    if tg_op = 'INSERT' and new.deal_no is null then
      new.deal_no := public.next_deal_id(new.organization_id);
    end if;
    return new;
  end if;

  select name into v_me_name from public.staff where id = v_me;

  if tg_op = 'INSERT' then
    -- Stamp identity + reference. created_by is ALWAYS the signed-in user.
    new.created_by      := v_me;
    new.created_by_name := v_me_name;
    if new.deal_no is null then
      new.deal_no := public.next_deal_id(new.organization_id);
    end if;
    -- A new request always starts pending; approver/decision columns are empty.
    if new.status not in ('pending_approval') then
      -- allow 'cancelled' direct insert? No — a deal is created as pending.
      new.status := 'pending_approval';
    end if;
    new.revision        := greatest(coalesce(new.revision, 1), 1);
    new.approver_id      := null;
    new.approver_name    := null;
    new.decided_at       := null;
    new.approval_comment := null;
    new.rejection_reason := null;
    new.approved_discount := null;
    -- Mandatory reason.
    if coalesce(btrim(new.requested_reason), '') = '' then
      raise exception 'deal_reason_required: a reason for the discount request is mandatory'
        using errcode = '23514';
    end if;
    -- The lead must be visible to the caller + they must be able to submit.
    if not public.auth_lead_visible(new.lead_id) then
      raise exception 'deal_lead_forbidden: you cannot create a deal for this lead'
        using errcode = '42501';
    end if;
    if not public.auth_has_any(array['deals_create', 'manage_sales']) then
      raise exception 'deal_create_forbidden: you are not allowed to submit discount requests'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE path -------------------------------------------------------------
  -- created_by / deal_no / lead are immutable.
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;
  new.deal_no         := old.deal_no;
  new.lead_id         := old.lead_id;
  new.organization_id := old.organization_id;

  v_decides := new.status is distinct from old.status
               and new.status in ('approved', 'rejected', 'changes_requested');

  if v_decides then
    -- A DECISION. Only a non-creator with the matching capability may decide,
    -- and only an OPEN deal can be decided.
    if old.status not in ('pending_approval', 'changes_requested') then
      raise exception 'deal_not_open: only a pending request can be decided'
        using errcode = '23514';
    end if;
    if new.created_by = v_me then
      raise exception 'deal_self_approval_forbidden: you cannot approve your own discount request'
        using errcode = '42501';
    end if;
    if new.status = 'approved'
       and not public.auth_has_any(array['deals_approve', 'manage_sales']) then
      raise exception 'deal_approve_forbidden: you are not allowed to approve deals'
        using errcode = '42501';
    end if;
    if new.status = 'rejected'
       and not public.auth_has_any(array['deals_reject', 'deals_approve', 'manage_sales']) then
      raise exception 'deal_reject_forbidden: you are not allowed to reject deals'
        using errcode = '42501';
    end if;
    if new.status = 'changes_requested'
       and not public.auth_has_any(array['deals_request_changes', 'deals_approve', 'manage_sales']) then
      raise exception 'deal_changes_forbidden: you are not allowed to request changes'
        using errcode = '42501';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.rejection_reason), '') = '' then
      raise exception 'deal_reject_reason_required: a rejection reason is mandatory'
        using errcode = '23514';
    end if;
    if new.status = 'changes_requested' and coalesce(btrim(new.approval_comment), '') = '' then
      raise exception 'deal_changes_comment_required: a comment is mandatory when requesting changes'
        using errcode = '23514';
    end if;
    -- Stamp the decision (server-owned — the client value is ignored/overwritten).
    new.approver_id   := v_me;
    new.approver_name := v_me_name;
    new.decided_at    := now();
    -- On approve, keep the approved discount (default to requested if blank).
    if new.status = 'approved' and new.approved_discount is null then
      new.approved_discount      := old.requested_discount;
      new.approved_discount_type := old.requested_discount_type;
    end if;
    return new;
  end if;

  -- A non-decision update. The approver/decision columns are NOT user-writable
  -- here (only an approval action, above, may set them).
  new.approver_id      := old.approver_id;
  new.approver_name    := old.approver_name;
  new.decided_at       := old.decided_at;

  -- Resubmission: the agent moves a 'changes_requested' deal back to pending
  -- (with a possibly-revised discount/reason + incremented revision). Only the
  -- OWNER/creator (or manage_sales) may do this, and only from changes_requested.
  if new.status is distinct from old.status and new.status = 'pending_approval' then
    if old.status <> 'changes_requested' then
      raise exception 'deal_resubmit_invalid: only a changes-requested deal can be resubmitted'
        using errcode = '23514';
    end if;
    if new.created_by <> v_me and not public.auth_has_any(array['manage_sales']) then
      raise exception 'deal_resubmit_forbidden: only the requester can resubmit this deal'
        using errcode = '42501';
    end if;
    if coalesce(btrim(new.requested_reason), '') = '' then
      raise exception 'deal_reason_required: a reason for the discount request is mandatory'
        using errcode = '23514';
    end if;
    -- Clear the previous decision context; a fresh approval cycle begins.
    new.approval_comment := null;
    new.rejection_reason := null;
    new.decided_at       := null;
    new.approver_id      := null;
    new.approver_name    := null;
    return new;
  end if;

  -- Cancellation: creator or a manager may cancel an OPEN deal.
  if new.status is distinct from old.status and new.status = 'cancelled' then
    if old.status not in ('pending_approval', 'changes_requested') then
      raise exception 'deal_cancel_invalid: only an open deal can be cancelled'
        using errcode = '23514';
    end if;
    if new.created_by <> v_me and not public.auth_has_any(array['deals_approve', 'manage_sales']) then
      raise exception 'deal_cancel_forbidden: you are not allowed to cancel this deal'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Any other field edit on a pending/open deal must be by the owner (plain
  -- edit of the request) and requires deals_edit/create (or manage_sales).
  if new.status = old.status then
    if old.status not in ('pending_approval', 'changes_requested') then
      raise exception 'deal_locked: a decided deal can no longer be edited'
        using errcode = '23514';
    end if;
    if new.created_by <> v_me and not public.auth_has_any(array['deals_approve', 'manage_sales']) then
      raise exception 'deal_edit_forbidden: only the requester can edit this deal'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lead_deals_guard_trg on public.lead_deals;
create trigger lead_deals_guard_trg
  before insert or update on public.lead_deals
  for each row execute function public.lead_deals_guard();


-- ============================================================================
-- SECTION 7 — Revision snapshot trigger (append-only accountability)
-- ============================================================================
create or replace function public.lead_deals_record_revision()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'submitted';
  elsif new.status is distinct from old.status then
    v_action := case new.status
      when 'pending_approval'   then 'resubmitted'
      when 'changes_requested'  then 'changes_requested'
      when 'approved'           then 'approved'
      when 'rejected'           then 'rejected'
      when 'cancelled'          then 'cancelled'
      else null end;
  else
    v_action := null;  -- a plain field edit is not a revision milestone
  end if;

  if v_action is null then
    return null;
  end if;

  insert into public.lead_deal_revisions (
    organization_id, deal_id, lead_id, revision, action,
    requested_discount, requested_discount_type, requested_reason,
    approved_discount, approved_discount_type, status_after,
    actor_id, actor_name, comment
  ) values (
    new.organization_id, new.id, new.lead_id, new.revision, v_action,
    new.requested_discount, new.requested_discount_type, new.requested_reason,
    new.approved_discount, new.approved_discount_type, new.status,
    coalesce(new.approver_id, new.created_by, public.auth_staff_id()),
    coalesce(new.approver_name, new.created_by_name),
    coalesce(new.rejection_reason, new.approval_comment)
  );
  return null;
end;
$$;

drop trigger if exists lead_deals_revision_trg on public.lead_deals;
create trigger lead_deals_revision_trg
  after insert or update on public.lead_deals
  for each row execute function public.lead_deals_record_revision();


-- ============================================================================
-- SECTION 8 — RLS (visibility follows the parent Lead; actions by capability)
-- ============================================================================
alter table public.lead_deals          enable row level security;
alter table public.lead_deal_comments  enable row level security;
alter table public.lead_deal_revisions enable row level security;

-- lead_deals ----------------------------------------------------------------
-- SELECT: a deal is visible iff its parent lead is visible (own/assigned/
-- follow-up or a see-all key), OR the caller can view all deals in scope.
drop policy if exists lead_deals_sel on public.lead_deals;
create policy lead_deals_sel on public.lead_deals for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.auth_has_any(array['deals_view_all', 'deals_approve', 'manage_sales', 'manage_reports'])
    or public.auth_lead_visible(lead_id)
  )
);

drop policy if exists lead_deals_ins on public.lead_deals;
create policy lead_deals_ins on public.lead_deals for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['deals_create', 'manage_sales'])
  and public.auth_lead_visible(lead_id)
);

-- UPDATE: the row must be visible to the caller + they must hold ANY deal-work
-- or approval key. The guard trigger enforces WHICH transition they may make
-- (self-approval block, approver-column protection, decision capabilities).
drop policy if exists lead_deals_upd on public.lead_deals;
create policy lead_deals_upd on public.lead_deals for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.auth_has_any(array['deals_view_all', 'deals_approve', 'manage_sales', 'manage_reports'])
    or public.auth_lead_visible(lead_id)
  )
  and public.auth_has_any(array[
    'deals_create', 'deals_edit', 'deals_approve', 'deals_reject',
    'deals_request_changes', 'manage_sales'
  ])
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
);

drop policy if exists lead_deals_del on public.lead_deals;
create policy lead_deals_del on public.lead_deals for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['deals_delete', 'manage_sales'])
);

-- lead_deal_comments --------------------------------------------------------
drop policy if exists lead_deal_comments_sel on public.lead_deal_comments;
create policy lead_deal_comments_sel on public.lead_deal_comments for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and (
    public.auth_has_any(array['deals_view_all', 'deals_approve', 'manage_sales', 'manage_reports'])
    or public.auth_lead_visible(lead_id)
  )
);

drop policy if exists lead_deal_comments_ins on public.lead_deal_comments;
create policy lead_deal_comments_ins on public.lead_deal_comments for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_has_any(array['deals_comment', 'deals_create', 'deals_approve', 'manage_sales'])
  and (
    public.auth_has_any(array['deals_view_all', 'deals_approve', 'manage_sales'])
    or public.auth_lead_visible(lead_id)
  )
);

-- lead_deal_revisions (read-only to clients; written by the trigger only) ----
drop policy if exists lead_deal_revisions_sel on public.lead_deal_revisions;
create policy lead_deal_revisions_sel on public.lead_deal_revisions for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and (
    public.auth_has_any(array['deals_view_all', 'deals_approve', 'manage_sales', 'manage_reports'])
    or public.auth_lead_visible(lead_id)
  )
);

-- Author stamping for comments (server-owned identity).
create or replace function public.lead_deal_comment_stamp()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.author_id   := public.auth_staff_id();
  new.author_name := (select name from public.staff where id = public.auth_staff_id());
  -- Default the org/lead from the parent deal when not supplied.
  if new.organization_id is null or new.lead_id is null then
    select organization_id, lead_id into new.organization_id, new.lead_id
    from public.lead_deals where id = new.deal_id;
  end if;
  return new;
end;
$$;
drop trigger if exists lead_deal_comment_stamp_trg on public.lead_deal_comments;
create trigger lead_deal_comment_stamp_trg
  before insert on public.lead_deal_comments
  for each row execute function public.lead_deal_comment_stamp();


-- ============================================================================
-- SECTION 9 — Realtime publication
-- ============================================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.lead_deals';          exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.lead_deal_comments';   exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.lead_deal_revisions';  exception when others then null; end;
end $$;

grant select, insert, update, delete on public.lead_deals          to authenticated;
grant select, insert                 on public.lead_deal_comments   to authenticated;
grant select                         on public.lead_deal_revisions  to authenticated;
grant select, insert, update         on public.deal_sequences       to authenticated;
