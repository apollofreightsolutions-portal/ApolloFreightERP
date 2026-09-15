-- Apollo AI: explicit per-user enablement + metadata-only audit trail.
-- No prompt or response text is stored in the audit table.

alter table app_users add column if not exists ai_access boolean not null default false;

-- Keep AI opt-in by default. Existing Admin accounts are enabled so management can test after deployment.
update app_users
set ai_access = true
where lower(trim(role)) = 'admin';

create table if not exists ai_audit_log (
  id bigserial primary key,
  request_id uuid not null unique,
  user_name text not null,
  portal text not null default 'company',
  domain text not null default 'general',
  scope_label text not null default '',
  model text not null default '',
  status text not null default 'ok',
  prompt_sha256 text not null default '',
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_audit_user_created on ai_audit_log(lower(user_name), created_at desc);
create index if not exists idx_ai_audit_domain_created on ai_audit_log(domain, created_at desc);
