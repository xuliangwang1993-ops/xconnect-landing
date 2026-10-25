-- Per-user English translations for the user's own data strings (so no client/run text lives in public JS).
-- Additive, only on the new factory_ tables; RLS/grants unchanged (select own, writes via service role).
alter table public.factory_runs   add column if not exists i18n_en jsonb;
alter table public.factory_orders add column if not exists i18n_en jsonb;
