-- Linear read-only mirror. Issues, teams and workflow states share this table
-- so the UI can render from Postgres alone. This migration does not write back
-- to Linear. Rollback: drop table if exists public.linear_issues;
create table if not exists public.linear_issues (
  record_type text not null check (record_type in ('issue', 'team', 'workflow_state')),
  id text not null,
  identifier text,
  title text,
  description text,
  url text,
  priority integer,
  team_id text,
  team_key text,
  team_name text,
  state_id text,
  state_name text,
  state_type text,
  state_color text,
  assignee_name text,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (record_type, id)
);

create index if not exists linear_issues_type_updated_idx
  on public.linear_issues (record_type, updated_at desc);
