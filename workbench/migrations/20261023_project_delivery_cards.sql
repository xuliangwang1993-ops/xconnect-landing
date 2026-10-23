-- project_delivery 卡片：仍存在 public.work_checkpoints（不新建表、不改现有列）。
-- 仅加表达式索引和只读视图，方便按卡片类型筛选。本 PR 不在线上库执行。
create index if not exists work_checkpoints_card_type_idx
  on public.work_checkpoints ((sources -> 0 -> 'data' ->> 'type'))
  where source_platform = 'xc-workbench';

create or replace view public.workbench_project_deliveries
with (security_invoker = true) as
select
  project_id,
  user_id,
  updated_at,
  sources -> 0 -> 'data' -> 'delivery' ->> 'run_id'            as run_id,
  sources -> 0 -> 'data' -> 'delivery' ->> 'sentence'          as sentence,
  (sources -> 0 -> 'data' -> 'delivery' ->> 'scorecard')::numeric as scorecard,
  sources -> 0 -> 'data' ->> 'status'                          as status,
  sources -> 0 -> 'data' -> 'delivery' -> 'pending_customer'   as pending_customer
from public.work_checkpoints
where source_platform = 'xc-workbench'
  and sources -> 0 -> 'data' ->> 'type' = 'project_delivery';
-- security_invoker：视图沿用调用者的 RLS，不绕过行级权限。
-- 回滚：drop view if exists public.workbench_project_deliveries; drop index if exists work_checkpoints_card_type_idx;
