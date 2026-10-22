-- 001_project_delivery.sql
-- Adds a card type to public.work_checkpoints so one table can hold both the
-- original workbench cards and the pipeline's project_delivery cards.
--
-- Safe to run on the live table: additive, nullable-free default, no data rewrite
-- beyond the default, and it does not touch RLS policies.
--
-- NOT APPLIED. This migration ships in the PR only; the online database is untouched.

begin;

alter table public.work_checkpoints
  add column if not exists card_type text not null default 'workbench-card';

-- only two card types exist today; keep it honest instead of a free-text field
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'work_checkpoints_card_type_check'
  ) then
    alter table public.work_checkpoints
      add constraint work_checkpoints_card_type_check
      check (card_type in ('workbench-card', 'project_delivery'));
  end if;
end $$;

create index if not exists work_checkpoints_user_type_idx
  on public.work_checkpoints (user_id, card_type, updated_at desc);

comment on column public.work_checkpoints.card_type is
  'workbench-card = 手写/语音/字幕卡；project_delivery = 视频流水线交付卡（payload 在 sources[kind=project_delivery]）';

commit;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- begin;
--   drop index if exists public.work_checkpoints_user_type_idx;
--   alter table public.work_checkpoints drop constraint if exists work_checkpoints_card_type_check;
--   alter table public.work_checkpoints drop column if exists card_type;
-- commit;
