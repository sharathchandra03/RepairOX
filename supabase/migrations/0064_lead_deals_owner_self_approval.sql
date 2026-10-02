-- ############################################################################
-- 0064_lead_deals_owner_self_approval.sql
--
-- REPAIROX — Deal approval refinement (additive, idempotent).
--
-- The default rule stands: a requester may NOT approve/reject/request-changes
-- their OWN discount request (§22). The ONE explicit exception is a caller with
-- TOP AUTHORITY — a full-access owner / platform owner / org admin — who IS the
-- ultimate approver and may act on an exception they themselves raised (so a
-- single-owner shop is never deadlocked). Everyone else is still blocked.
--
-- This replaces lead_deals_guard() from 0063 with the same logic, changing only
-- the self-approval check to honour auth_has_any(['*','full_access']) (which
-- also returns true for is_admin() owner roles).
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
