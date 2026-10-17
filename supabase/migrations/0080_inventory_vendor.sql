-- 0080 — INVENTORY ITEM VENDOR + COST GST
--
-- Additive + idempotent. Adds two nullable columns to inventory_items:
--   • vendor    — supplier / vendor label, set from the Item Identity section
--                 (free-text for now; a future Vendors module may promote it to
--                 an FK without changing the form surface).
--   • cost_tax  — GST rate on the Cost Price (CP), independent of the selling
--                 GST (`tax`), set from the Pricing section.
--
-- No backfill, no rewrite of any existing row, no destructive change.

alter table public.inventory_items add column if not exists vendor text;

-- GST rate applied to the COST price (CP). The existing `tax` column is the GST
-- on the selling price (SP); this lets CP and SP carry independent GST rates.
-- Nullable: when absent, the app falls back to `tax` for display.
alter table public.inventory_items add column if not exists cost_tax numeric;
