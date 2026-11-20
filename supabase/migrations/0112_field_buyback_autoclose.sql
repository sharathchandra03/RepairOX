-- 0112_field_buyback_autoclose.sql (additive + idempotent)
-- A BUYBACK job (lead_type = 'buyback') ends when the store has received the device:
-- there is no repair and no drop leg. The pickup trip mirrors the job to 'at_store';
-- close it as 'completed' there so it never sits open in the Field table.
create or replace function public.field_jobs_buyback_close() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.lead_type = 'buyback' and new.status = 'at_store' then
    new.status := 'completed';
  end if;
  return new;
end $$;
drop trigger if exists field_jobs_buyback_close_trg on public.field_jobs;
create trigger field_jobs_buyback_close_trg before insert or update of status, lead_type on public.field_jobs
  for each row execute function public.field_jobs_buyback_close();
