-- ─────────────────────────────────────────────────────────────────────────────
-- Optional migration: promote Walk-In business fields to first-class columns.
--
-- The Walk-In module works WITHOUT this migration — new fields (walk-in number,
-- type, issue, sales person, model id, customer id, pinned state) are stored in
-- a JSON envelope inside the existing `notes` column and read back
-- transparently by the app (see rowToWalkIn/walkInToRow in src/lib/store.tsx).
--
-- Applying this migration makes those fields queryable/indexable at the DB
-- level. It is additive and safe to run on an existing database: every column
-- is added only IF NOT EXISTS, and no existing data is modified or removed.
-- After running it, the app's row mappers automatically PREFER these columns
-- when reading, while still honouring the notes envelope for rows that predate
-- a backfill. The app continues to WRITE the notes envelope (so it works with
-- or without this migration); run the optional backfill below to populate the
-- new columns from existing envelopes if you want them queryable immediately.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.walk_ins add column if not exists walkin_number    text;
alter table public.walk_ins add column if not exists walkin_type      text;      -- 'direct' | 'sales'
alter table public.walk_ins add column if not exists issue            text;
alter table public.walk_ins add column if not exists model_id         text;
alter table public.walk_ins add column if not exists sales_person_id  text;
alter table public.walk_ins add column if not exists sales_person_name text;
alter table public.walk_ins add column if not exists customer_id      text;
alter table public.walk_ins add column if not exists pinned_at        timestamptz;

-- Helpful indexes for the report / filtering (all optional).
create index if not exists idx_walk_ins_walkin_type on public.walk_ins (walkin_type);
create index if not exists idx_walk_ins_sales_person on public.walk_ins (sales_person_id);
create index if not exists idx_walk_ins_walkin_number on public.walk_ins (walkin_number);
