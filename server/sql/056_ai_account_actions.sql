-- Additive, reversible feature gate: no existing business rows are modified.
create table if not exists ai_account_actions (
  token uuid primary key,
  user_name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_account_actions_user_time on ai_account_actions(user_name,created_at desc);
