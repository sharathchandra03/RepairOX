-- 0107: store coordinates, used by the Ninja app to check "arrived at store / submitted to store".
-- Nullable: a store without coordinates simply skips the arrival check (never blocks a Ninja).
alter table public.branches add column if not exists latitude  double precision;
alter table public.branches add column if not exists longitude double precision;
do $$ begin
  alter table public.branches add constraint branches_coords_chk
    check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180));
exception when duplicate_object then null; end $$;
