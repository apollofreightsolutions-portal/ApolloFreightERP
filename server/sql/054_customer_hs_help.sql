-- V30 additive only. Apply to the application's database before deployment.
create table if not exists customer_hs_help (
 id uuid primary key,
 analysis_id uuid not null,
 customer_code text not null,
 customer_user text not null,
 selected_json text not null,
 snapshot_json text not null,
 question text not null default '',
 response_json text not null default '[]',
 status text not null default 'OPEN',
 answered_by text not null default '',
 created_at timestamptz not null default now(),
 answered_at timestamptz,
 unique(analysis_id)
);
create index if not exists customer_hs_help_customer on customer_hs_help(lower(customer_code),created_at desc);
