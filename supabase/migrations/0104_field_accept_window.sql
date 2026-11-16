-- 0104: configurable "time to accept" window for Ninja assignments (Settings -> Field).
-- NULL = app default (15 min). Display/flag only; nothing is auto-rejected.
alter table public.organization_settings add column if not exists field_accept_window_minutes integer;
do $$ begin
  alter table public.organization_settings add constraint organization_settings_field_accept_window_chk
    check (field_accept_window_minutes is null or (field_accept_window_minutes between 1 and 1440));
exception when duplicate_object then null; end $$;
