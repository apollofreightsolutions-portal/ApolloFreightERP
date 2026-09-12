create table if not exists hr_weekend_rule_overrides (
    branch text primary key,
    configured boolean not null default true,
    updated_by text not null default '',
    updated_at timestamptz not null default now()
);
