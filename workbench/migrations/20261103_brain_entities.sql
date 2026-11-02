-- 总脑实体记忆：从对话里抽出的稳定事实（客户、项目、金额、日期、单号）。
-- 跨会话可用：同一 session 的同一实体只留一行，见一次 +1，value 取最新。
-- Rollback: drop table if exists public.brain_entities;
create table if not exists public.brain_entities (
  id           text primary key default ('be-' || replace(gen_random_uuid()::text, '-', '')),
  session_id   text not null,
  kind         text not null check (kind in ('person', 'org', 'project', 'money', 'date', 'id')),
  key          text not null,
  value        text,
  evidence     jsonb not null default '[]'::jsonb,
  seen_count   int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (session_id, kind, key)
);
create index if not exists brain_entities_session_idx on public.brain_entities (session_id, last_seen_at desc);

alter table public.brain_entities enable row level security;
-- 只给 service_role：实体里有 ABN、金额这类敏感原话。
