-- 0087 — A fresh assignment is NOT "Not Contacted".
-- An EMPTY contact_status is now its own class ('unset'); a lead joins the Not
-- Contacted views only when "Not Contacted…" (or an attempt status) is actually
-- chosen. Mirrors contactStatusClass() in app/src/lib/leads-data.ts.
-- Additive: create-or-replace only; no data is modified.

create or replace function public.lead_contact_class(p text)
returns text language sql immutable as $$
  select case
    when btrim(coalesce(p, '')) = '' then 'unset'
    when lower(btrim(p)) like 'not contacted%' then 'not_contacted'
    when lower(p) ~ '(rnr|busy|switched off|switch off|no answer|not reachable|unreachable|not connected|no response|not picked|ringing|voicemail)' then 'attempted'
    else 'contacted'
  end;
$$;

-- Re-assigning a still-untouched lead (unset OR not_contacted) puts it back in
-- the new owner's Assigned inbox. Otherwise identical to 0086.
create or replace function public.leads_track_first_action()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old text := public.lead_contact_class(old.contact_status);
  v_new text := public.lead_contact_class(new.contact_status);
begin
  if new.assigned_user_id is distinct from old.assigned_user_id
     and new.assigned_user_id is not null
     and v_new in ('unset', 'not_contacted') then
    new.first_action_at := null;
  elsif new.first_action_at is null and (
       new.contact_status is distinct from old.contact_status
    or new.status         is distinct from old.status
    or new.lead_category  is distinct from old.lead_category
    or (new.converted_at is not null and old.converted_at is null)
    or (new.lost_at      is not null and old.lost_at      is null)
  ) then
    new.first_action_at := now();
  end if;

  if new.contact_status is distinct from old.contact_status then
    if v_old <> 'contacted' and v_new = 'contacted' then
      new.first_contacted_at := coalesce(new.first_contacted_at, now());
    end if;
    insert into public.lead_activity_history (
      organization_id, branch_id, lead_id, activity_type,
      contact_status, previous_contact_status, note, occurred_at, actor_staff_id
    ) values (
      new.organization_id, new.branch_id, new.id,
      case when v_new = 'contacted' then 'disposition' else 'contact_attempt' end,
      new.contact_status, old.contact_status, 'Contact status changed', now(),
      public.auth_staff_id()
    );
  end if;
  return new;
end;
$$;
