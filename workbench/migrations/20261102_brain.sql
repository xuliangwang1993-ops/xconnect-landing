-- 总脑（诸葛亮式第三方观察者）：对话流水、需求、回复计账、开关。
-- 写操作只走服务端 service_role；anon 仅可读（Factory 页面展示需求用）。
-- Rollback: drop table if exists public.brain_replies, public.brain_needs, public.brain_turns, public.brain_settings;

create table if not exists public.brain_turns (
  id           bigserial primary key,
  session_id   text not null,
  role         text not null check (role in ('user', 'assistant')),
  text         text not null,
  assistant_id text,
  at           timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists brain_turns_session_at_idx on public.brain_turns (session_id, at desc);
create index if not exists brain_turns_at_idx on public.brain_turns (at desc);

-- 需求：同一会话里同一件事（fingerprint = 去标点空白后的前 40 字）只保留一行，
-- 新证据合并、置信度取高，不刷屏，也不重复问。
create table if not exists public.brain_needs (
  id          text primary key default ('bn-' || replace(gen_random_uuid()::text, '-', '')),
  session_id  text not null,
  need        text not null,
  evidence    jsonb not null default '[]'::jsonb,
  confidence  numeric(3,2) not null default 0 check (confidence >= 0 and confidence <= 1),
  fingerprint text not null,
  status      text not null default 'open' check (status in ('open', 'confirmed', 'dismissed', 'converted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, fingerprint)
);
create index if not exists brain_needs_status_conf_idx on public.brain_needs (status, confidence desc);

-- 每一轮“总脑 vs 小助手兜底”的记账：谁说的、等了多少毫秒、为什么退回。
create table if not exists public.brain_replies (
  id         bigserial primary key,
  session_id text not null,
  -- turn=每轮回复前问总脑；proactive=停顿回看；strong=智库（慢而强）送达的结论
  kind       text not null default 'turn' check (kind in ('turn', 'proactive', 'strong')),
  reply      text,
  latency_ms integer not null default 0,
  used       text not null check (used in ('brain', 'fallback')),
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists brain_replies_created_idx on public.brain_replies (created_at desc);

create table if not exists public.brain_settings (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.brain_settings (key, value) values ('proactive', 'true'::jsonb)
  on conflict (key) do nothing;

-- RLS：anon 只能读（Factory 需求面板），写入交给 service_role。
alter table public.brain_turns    enable row level security;
alter table public.brain_needs    enable row level security;
alter table public.brain_replies  enable row level security;
alter table public.brain_settings enable row level security;

drop policy if exists brain_needs_read on public.brain_needs;
create policy brain_needs_read on public.brain_needs for select to anon, authenticated using (true);

drop policy if exists brain_settings_read on public.brain_settings;
create policy brain_settings_read on public.brain_settings for select to anon, authenticated using (true);
-- brain_turns / brain_replies 默认无 anon 策略 = anon 读不到，只有 service_role 能读写。
