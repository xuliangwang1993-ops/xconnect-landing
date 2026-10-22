-- 20261023_project_delivery.sql
-- Adds an explicit card type to work_checkpoints so the PWA can render
-- `project_delivery` cards without guessing from the JSON payload.
-- Additive only: existing rows keep card_type = 'goal'.

begin;

alter table public.work_checkpoints
  add column if not exists card_type text not null default 'goal';

comment on column public.work_checkpoints.card_type is
  'goal | project_delivery | workbench-card | task — mirrors sources[0].kind when set';

create index if not exists work_checkpoints_card_type_idx
  on public.work_checkpoints (card_type);

commit;

-- rollback:
-- begin;
-- drop index if exists public.work_checkpoints_card_type_idx;
-- alter table public.work_checkpoints drop column if exists card_type;
-- commit;
