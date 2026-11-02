-- X-Connect Factory · per-user isolation (additive only)
-- Creates three new tables with a factory_ prefix. Touches no existing table, policy, function or auth config.
-- Reads: only the signed-in owner of a row (user_id = auth.uid()).
-- Writes: NO insert/update/delete policy and no write grants for anon/authenticated;
--         only the service role (owner backend, tools/push_factory_data.py) can write.

create table if not exists public.factory_orders (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  order_id       text        not null,
  run_id         text,
  recipe         text,
  sentence       text,
  deliverables   jsonb       not null default '[]'::jsonb,
  owner          jsonb       not null default '{}'::jsonb,
  pod_id         text,
  pod_name       text,
  desired_status text,
  dispatch       jsonb,
  close_policy   jsonb,
  reconcile      jsonb,
  status         text,
  opened_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, order_id)
);

create table if not exists public.factory_pods (
  user_id            uuid        not null references auth.users(id) on delete cascade,
  pod_id             text        not null,
  name               text,
  live_status        text,                 -- RunPod live status (desiredStatus): RUNNING / EXITED / ...
  public_ip          text,
  ports              jsonb       not null default '[]'::jsonb,
  port_mappings      jsonb       not null default '{}'::jsonb,
  gpu_count          int,
  vcpu_count         int,
  memory_gb          numeric,
  container_disk_gb  numeric,
  volume_gb          numeric,
  volume_mount_path  text,
  cost_per_hr        numeric,
  burn_since_created numeric,
  billed_total       numeric,
  billing            jsonb       not null default '[]'::jsonb,
  image_name         text,
  last_status_change text,
  observed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, pod_id)
);

create table if not exists public.factory_runs (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  run_id       text        not null,
  recipe       text,
  sentence     text,
  status       text,
  exit_code    int,
  elapsed_s    numeric,
  chain_closed int,
  chain_total  int,
  stations     jsonb       not null default '[]'::jsonb,   -- per-station run results (inputs/outputs/qa/score)
  chain        jsonb       not null default '[]'::jsonb,   -- handoff ledger
  build        jsonb,                                      -- build steps / checks summary
  artifacts    jsonb,                                      -- file metadata only (no file bodies)
  generated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, run_id)
);

alter table public.factory_orders enable row level security;
alter table public.factory_pods   enable row level security;
alter table public.factory_runs   enable row level security;

-- Supabase grants new public tables to anon/authenticated by default; strip that, then grant read only.
revoke all on public.factory_orders from anon, authenticated;
revoke all on public.factory_pods   from anon, authenticated;
revoke all on public.factory_runs   from anon, authenticated;
grant select on public.factory_orders to authenticated;
grant select on public.factory_pods   to authenticated;
grant select on public.factory_runs   to authenticated;
grant all on public.factory_orders to service_role;
grant all on public.factory_pods   to service_role;
grant all on public.factory_runs   to service_role;

create policy factory_orders_select_own on public.factory_orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy factory_pods_select_own on public.factory_pods
  for select to authenticated using (user_id = (select auth.uid()));
create policy factory_runs_select_own on public.factory_runs
  for select to authenticated using (user_id = (select auth.uid()));
