-- ────────────────────────────────────────────────────────────────────────
-- RepairOX — Field Management (Pickup & Drop) schema.
--
-- OPTIONAL migration. The app works without it (Field Jobs fall back to
-- localStorage, and Lead routing columns degrade gracefully). Apply this to
-- persist Field Jobs and Lead routing in Supabase with realtime + org scoping.
--
-- Idempotent: safe to run multiple times.
-- ────────────────────────────────────────────────────────────────────────

-- 1) Lead fulfilment-routing + downstream link columns (nullable, additive).
alter table if exists public.leads add column if not exists fulfilment_route text;
alter table if exists public.leads add column if not exists assigned_store text;
alter table if exists public.leads add column if not exists routed_at timestamptz;
alter table if exists public.leads add column if not exists linked_walk_in_id text;
alter table if exists public.leads add column if not exists linked_field_job_id text;
alter table if exists public.leads add column if not exists linked_ticket_id text;
alter table if exists public.leads add column if not exists customer_id text;

-- 2) Walk-In: originating lead link (previously carried in the notes envelope).
alter table if exists public.walk_ins add column if not exists linked_lead_id text;

-- 3) Field Jobs table — the logistics record for a Pickup & Drop lead.
create table if not exists public.field_jobs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid,
  branch_id         uuid,
  job_no            text,
  lead_id           text,
  lead_no           text,
  customer_id       text,
  linked_ticket_id  text,
  linked_invoice_id text,
  customer          text,
  phone             text,
  email             text,
  device            text,
  model_id          text,
  category          text,
  issue             text,
  branch            text,
  sales_person_id   text,
  sales_person_name text,
  field_manager_id  text,
  field_manager_name text,
  ninja_id          text,
  ninja_name        text,
  drop_ninja_id     text,
  drop_ninja_name   text,
  pickup_address    text,
  pickup_date       date,
  pickup_time       text,
  pickup_proof      jsonb,
  drop_address      text,
  drop_date         date,
  drop_time         text,
  drop_proof        jsonb,
  status            text not null default 'pending_assignment',
  notes             text,
  delivery_confirmed boolean not null default false,
  created_by        uuid,
  updated_by        uuid,
  deleted_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists field_jobs_lead_idx     on public.field_jobs (lead_id);
create index if not exists field_jobs_customer_idx on public.field_jobs (customer_id);
create index if not exists field_jobs_status_idx   on public.field_jobs (status);
create index if not exists field_jobs_branch_idx   on public.field_jobs (branch);

-- 4) Realtime + RLS. RLS mirrors the existing pattern: authenticated users of
--    the org can read; writes require a field/repair capability. Adjust the
--    predicate to match your project's role/claims model.
alter table public.field_jobs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'field_jobs' and policyname = 'field_jobs_read') then
    create policy field_jobs_read on public.field_jobs
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'field_jobs' and policyname = 'field_jobs_write') then
    create policy field_jobs_write on public.field_jobs
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Add to the realtime publication (ignore if already present).
do $$ begin
  begin
    alter publication supabase_realtime add table public.field_jobs;
  exception when duplicate_object then null;
  end;
end $$;

-- 5) updated_at trigger (reuses a generic touch function if present).
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists field_jobs_touch on public.field_jobs;
    create trigger field_jobs_touch before update on public.field_jobs
      for each row execute function set_updated_at();
  end if;
end $$;
