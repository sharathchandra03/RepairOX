-- 0080 — INVENTORY ITEM VENDOR (supplier reference)
--
-- Additive + idempotent. Adds a single nullable `vendor` text column to
-- inventory_items so a Part / Product OR a Repair Service can record its
-- supplier / vendor from the Item Identity section of the inventory form.
--
-- This is a free-text display label for now (same lightweight shape as
-- brand_model / barcode); a future Vendors-module migration may promote it to
-- an FK without changing the form surface. No backfill, no rewrite of any
-- existing row, no destructive change.

alter table public.inventory_items add column if not exists vendor text;
