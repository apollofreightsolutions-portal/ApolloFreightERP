create table if not exists customer_compliance_checks (
  analysis_id text primary key,
  customer_code text not null,
  customer_user text not null default '',
  destination text not null default 'Kuwait',
  status text not null default 'ATTENTION_REQUIRED',
  input_sha256 text not null default '',
  result_json text not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_compliance_customer_created
  on customer_compliance_checks (lower(customer_code), created_at desc);
create index if not exists idx_customer_compliance_expires
  on customer_compliance_checks (expires_at);
