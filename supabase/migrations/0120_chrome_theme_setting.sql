-- 0120 — Sidebar / header colour theme (Settings → System → Preferences).
-- Stored once per organisation so every employee sees the same company look.
-- Shape: {"palette": "<preset id>", "pill": "<pill id>" | null}. NULL = built-in default.
-- Additive + idempotent. Write access is the existing organization_settings admin policy.
alter table public.organization_settings add column if not exists chrome_theme jsonb;
