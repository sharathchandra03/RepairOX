-- 0110 — Per-option display style for Lead dropdown options (Settings → Lead
-- Settings → Form Edit). Additive + idempotent. Lets an admin pick the icon
-- (a curated icon key "i:<name>" or a single emoji) and the colour (#RRGGBB)
-- for an option such as a Lead Stage or Lead Nature value. NULL = automatic
-- (keyword-matched). Presentation only; writes are covered by the existing
-- lead_options RLS policies.
alter table public.lead_options add column if not exists icon text;
alter table public.lead_options add column if not exists color text;
comment on column public.lead_options.icon is 'Display icon: "i:<curated icon key>" or one emoji. NULL = automatic.';
comment on column public.lead_options.color is 'Display colour #RRGGBB. NULL = automatic.';
