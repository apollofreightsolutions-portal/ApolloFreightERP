create table if not exists user_column_preferences (
  user_name text primary key,
  column_layout_json text not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_column_preferences_updated_at_idx
  on user_column_preferences (updated_at desc);
