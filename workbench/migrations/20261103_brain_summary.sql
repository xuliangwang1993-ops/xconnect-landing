-- 总脑滚动摘要：每个会话一行，保存早期对话的压缩要点。
-- 原文仍在 brain_turns；这里只放"索引 + 压缩"，不替代原文。
-- Rollback: drop table if exists public.brain_summaries;
create table if not exists public.brain_summaries (
  id           text primary key default ('bs-' || replace(gen_random_uuid()::text, '-', '')),
  session_id   text not null,
  summary      jsonb not null default '{}'::jsonb,
  covered_upto text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id)
);
create index if not exists brain_summaries_updated_idx on public.brain_summaries (updated_at desc);

alter table public.brain_summaries enable row level security;
-- 不建 anon 读策略：摘要含客户原话摘录，只给 service_role。
