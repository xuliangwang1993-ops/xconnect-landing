-- 总脑话题切分：每个会话的每段话题一行，供装配上下文时按话题召回。
-- 话题本身是纯函数算出来的（factory/brain/layers/topics.mjs），这里只留档与跨进程复用。
-- Rollback: drop table if exists public.brain_topics;
create table if not exists public.brain_topics (
  id          text primary key,
  session_id  text not null,
  start_index int  not null check (start_index >= 0),
  end_index   int  not null check (end_index >= start_index),
  label       text,
  created_at  timestamptz not null default now(),
  unique (session_id, id)
);
create index if not exists brain_topics_session_idx on public.brain_topics (session_id, start_index);

alter table public.brain_topics enable row level security;
-- 与 brain_turns / brain_replies 一致：只给 service_role。
