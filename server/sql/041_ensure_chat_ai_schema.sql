-- 041: Self-healing, idempotent catch-up for Apollo AI (038/039) and Connected Chat (040).
-- Safe to run any number of times. It never resets per-user ai_access choices once the column exists.

-- Apollo AI: per-user access flag (only initialised the first time the column is created).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'app_users' and column_name = 'ai_access'
  ) then
    alter table app_users add column ai_access boolean not null default false;

    update app_users set ai_access = true where lower(trim(role)) = 'admin';

    update app_users
    set ai_access = true
    where lower(coalesce(account_status, 'Active')) = 'active'
      and (
        coalesce(erp_portal_access, true) = true
        or coalesce(hr_portal_access, false) = true
        or coalesce(crm_portal_access, false) = true
      );

    alter table app_users alter column ai_access set default true;
  end if;
end $$;

-- Apollo AI: metadata-only audit trail.
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

-- Connected Chat.
create table if not exists connected_chat_messages (
    id bigserial primary key,
    sender_user text not null,
    recipient_user text not null,
    body text not null,
    context_json text not null default '{}',
    read_at timestamptz,
    created_at timestamptz not null default now(),
    constraint connected_chat_sender_recipient_different check (lower(sender_user) <> lower(recipient_user)),
    constraint connected_chat_body_length check (char_length(body) between 1 and 2000)
);
create index if not exists connected_chat_sender_created_idx
    on connected_chat_messages (lower(sender_user), created_at desc);
create index if not exists connected_chat_recipient_created_idx
    on connected_chat_messages (lower(recipient_user), created_at desc);
create index if not exists connected_chat_unread_idx
    on connected_chat_messages (lower(recipient_user), created_at desc)
    where read_at is null;
