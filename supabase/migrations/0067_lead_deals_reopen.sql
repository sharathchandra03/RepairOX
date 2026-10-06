-- ############################################################################
-- 0067_lead_deals_reopen.sql
--
-- REPAIROX — Deal "reopen a terminal decision" (additive, idempotent).
--
-- Business need: an authorized approver must be able to change a deal's status
-- from the Deals table even AFTER it was decided — e.g. REOPEN a rejected (or
-- approved) deal for a fresh review. Previously the guard only allowed
-- changes_requested → pending (agent resubmission); a terminal deal was locked,
-- so a reopen was rejected with `deal_resubmit_invalid` and the UI silently
-- reverted.
--
-- This replaces lead_deals_guard() (last defined in 0064) with the SAME logic,
-- adding ONE new branch: a REOPEN — a terminal deal (approved | rejected) moving
-- back to pending_approval by an authorized approver. Rules preserved:
--   • Only an approver (deals_approve / manage_sales) may reopen — not a plain
--     agent (an agent uses Revise & Resubmit on a changes_requested deal).
--   • The self-approval protection stands: the creator may not reopen their own
--     deal unless they hold TOP AUTHORITY (full_access / '*' / org admin), the
--     same exception as self-approval (§22).
--   • A cancelled deal stays terminal (not reopenable) — it was withdrawn.
--   • The decision columns are cleared and the revision continues via the
--     existing append-only revision trigger (0063 SECTION 7).
-- ############################################################################

create or replace function public.lead_deals_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := public.auth_staff_id();
  v_me_name  text;
  v_decides  boolean;
  v_is_owner boolean := public.auth_has_any(array['*', 'full_access']);
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
    new.created_by      := v_me;
    new.created_by_name := v_me_name;
    if new.deal_no is null then
      new.deal_no := public.next_deal_id(new.organization_id);
    end if;
    if new.status not in ('pending_approval') then
      new.status := 'pending_approval';
    end if;
    new.revision        := greatest(coalesce(new.revision, 1), 1);
    new.approver_id      := null;
    new.approver_name    := null;
    new.decided_at       := null;
    new.approval_comment := null;
    new.rejection_reason := null;
    new.approved_discount := null;
    if coalesce(btrim(new.requested_reason), '') = '' then
      raise exception 'deal_reason_required: a reason for the discount request is mandatory'
        using errcode = '23514';
    end if;
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
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;
  new.deal_no         := old.deal_no;
  new.lead_id         := old.lead_id;
  new.organization_id := old.organization_id;

  v_decides := new.status is distinct from old.status
               and new.status in ('approved', 'rejected', 'changes_requested');

  if v_decides then
    if old.status not in ('pending_approval', 'changes_requested') then
      raise exception 'deal_not_open: only a pending request can be decided'
        using errcode = '23514';
    end if;
    -- Self-approval: blocked by default; allowed ONLY for a top-authority owner.
    if new.created_by = v_me and not v_is_owner then
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
    new.approver_id   := v_me;
    new.approver_name := v_me_name;
    new.decided_at    := now();
    if new.status = 'approved' and new.approved_discount is null then
      new.approved_discount      := old.requested_discount;
      new.approved_discount_type := old.requested_discount_type;
    end if;
    return new;
  end if;

  new.approver_id      := old.approver_id;
  new.approver_name    := old.approver_name;
  new.decided_at       := old.decided_at;

  -- REOPEN: a TERMINAL decided deal (approved | rejected) → pending_approval,
  -- so an authorized approver can re-decide it from the queue. Cancelled deals
  -- are NOT reopenable (they were withdrawn). This branch is checked BEFORE the
  -- agent resubmission branch so a decided deal routes here.
  if new.status is distinct from old.status
     and new.status = 'pending_approval'
     and old.status in ('approved', 'rejected') then
    if not public.auth_has_any(array['deals_approve', 'manage_sales']) then
      raise exception 'deal_reopen_forbidden: you are not allowed to reopen deals'
        using errcode = '42501';
    end if;
    -- Same self-approval protection: the creator can't reopen their own deal
    -- unless they hold top authority.
    if new.created_by = v_me and not v_is_owner then
      raise exception 'deal_self_approval_forbidden: you cannot reopen your own discount request'
        using errcode = '42501';
    end if;
    -- Fresh approval cycle — clear the previous decision.
    new.approved_discount := null;
    new.approval_comment  := null;
    new.rejection_reason  := null;
    new.decided_at        := null;
    new.approver_id       := null;
    new.approver_name     := null;
    new.revision          := greatest(coalesce(new.revision, old.revision), old.revision);
    return new;
  end if;

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
    new.approval_comment := null;
    new.rejection_reason := null;
    new.decided_at       := null;
    new.approver_id      := null;
    new.approver_name    := null;
    return new;
  end if;

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
