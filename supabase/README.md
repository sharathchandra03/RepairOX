# RepairOX — Database (migration-managed)

The database is part of the source-controlled application. The **single source
of truth** for the schema is:

```
supabase/migrations/          ← ordered, versioned migrations (the truth)
supabase/config.toml          ← Supabase CLI project config
scripts/migrate.mjs           ← CLI-free migration runner (pg + SUPABASE_DB_URL)
```

Everything else under `supabase/*.sql` and the loose `scripts/*.sql` are
**reference artifacts** kept for history. Do not apply them directly anymore —
they have been folded into `supabase/migrations/` (see the mapping at the bottom).

## Naming

`NNNN_short_description.sql` — a zero-padded numeric prefix gives an explicit,
review-friendly order. Migrations are **append-only**: never edit a migration
that has been applied; add a new one instead.

## Two ways to run migrations

Both read the **same** files in `supabase/migrations/`.

### A. CLI-free (works today — no install needed)

Uses a direct Postgres connection (`SUPABASE_DB_URL` in `.env.local`) via `pg`,
tracked in a `public.schema_migrations` ledger.

```bash
npm run db:migrate:status     # applied vs pending
npm run db:migrate:dry        # print what WOULD run (no changes)
node scripts/migrate.mjs verify   # run each pending migration in a tx, then ROLL BACK
npm run db:migrate            # apply all pending migrations
```

### B. Supabase CLI (once installed + linked)

```bash
supabase link --project-ref <ref>   # one-time; ref is NOT committed
supabase migration new <name>        # scaffold a new migration
supabase db push                     # apply pending migrations
```

## Adopting on an existing database (already done once)

Because the live DB already contained the base schema, migrations `0001`–`0020`
(minus `0003`, whose table was missing) were **baselined** — recorded as applied
without re-executing them:

```bash
node scripts/migrate.mjs baseline 0020_multi_store.sql --skip=0003_quotations.sql
```

New environments (a fresh Supabase project) instead run `npm run db:migrate`
from empty and get the full schema built from `0001` onward.

## The workflow for EVERY future database change

```
1. Create a new migration        supabase/migrations/NNNN_change.sql
2. Update app types/queries/RLS/indexes in the same PR
3. Verify locally               node scripts/migrate.mjs verify
4. Apply to dev                 npm run db:migrate   (dev SUPABASE_DB_URL)
5. Run tests + build            npm run build && npm run ms:verify
6. Commit migration to Git
7. Deploy application
8. Apply to production          npm run db:migrate   (prod SUPABASE_DB_URL)
9. Verify production            npm run db:inspect && npm run ms:verify
```

**No more pasting SQL into the Supabase SQL Editor.** No undocumented,
production-only schema changes.

## Migration safety rules

- Idempotent where practical (`create ... if not exists`, `drop policy if exists`).
- Additive first: add columns/tables before removing old ones; backfill; only
  later drop — never `DROP TABLE` / `TRUNCATE` / `DROP COLUMN` against
  production without a deliberate, reviewed migration.
- Backfills count rows before and after (`RAISE NOTICE`) and guard multi-org.
- Each migration runs in one transaction (all-or-nothing) via the runner.

## Reference-artifact → migration mapping

| Legacy file | Migration |
| --- | --- |
| `supabase/schema.sql` | `0001_initial_schema.sql` |
| `supabase/leads.sql` | `0002_leads.sql` |
| `supabase/quotations.sql` | `0003_quotations.sql` |
| `supabase/migration-assigned-options.sql` | `0004_assigned_options.sql` |
| `supabase/migration-customer-groups.sql` | `0005_customer_groups.sql` |
| `supabase/migration-qc-config.sql` | `0006_qc_config.sql` |
| `supabase/migration-ticket-workflow-settings.sql` | `0007_ticket_workflow_settings.sql` |
| `supabase/migration-walk-in-fields.sql` | `0008_walk_in_fields.sql` |
| `scripts/account-security.sql` | `0009_account_security.sql` |
| `scripts/device-categories-table.sql` | `0010_device_categories.sql` |
| `scripts/device-colours-table.sql` | `0011_device_colours.sql` |
| `scripts/brand-category-hierarchy.sql` | `0012_brand_category_hierarchy.sql` |
| `scripts/catalog-images-storage.sql` | `0013_catalog_images_storage.sql` |
| `scripts/feature-visibility-table.sql` | `0014_feature_visibility.sql` |
| `scripts/invoice-settings-columns.sql` | `0015_invoice_settings_columns.sql` |
| `scripts/theme-preference-column.sql` | `0016_theme_preference_column.sql` |
| `scripts/ticket-column-settings.sql` | `0017_ticket_column_settings.sql` |
| `scripts/demo-visits-table.sql` | `0018_demo_visits.sql` |
| `supabase/field-management.sql` | `0019_field_management.sql` |
| `supabase/multi-store.sql` | `0020_multi_store.sql` |
| _(new fixes — no legacy file)_ | `0021`–`0025` (see below) |

### New fix migrations (from the audit)

- `0021_fix_field_jobs_isolation.sql` — **CRITICAL**: replaces `field_jobs`
  open RLS with org+branch+permission gating; adds FKs, defaults, working
  `updated_at` + audit triggers, and store indexes.
- `0022_consolidate_price_list_rls.sql` — removes duplicate permissionless
  `catalog_*` policies and the duplicate `get_user_org_id()` function.
- `0023_store_ownership_and_indexes.sql` — adds `leads.assigned_store_id`
  (branch FK, backfilled from the old text label) and composite
  `(branch_id, created_at/status)` indexes on hot transactional tables.
- `0024_backfill_field_jobs_tenancy.sql` — assigns org/branch to legacy
  `field_jobs` rows (single-org guard; before/after counts).
- `0025_notifications.sql` — durable, org+store-scoped, recipient-targeted
  notifications table (dedupe unique, RLS, realtime) to replace the
  localStorage-only client store.

### Deprecated / superseded legacy files (do NOT apply directly)

- `scripts/rls-price-list.sql` — superseded by `0001` + `0022` (its
  permissionless policies and duplicate `get_user_org_id()` are removed).
- `scripts/assigned-options-tables.sql` — duplicate of
  `supabase/migration-assigned-options.sql` (`0004`).
