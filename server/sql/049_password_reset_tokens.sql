-- Additive password-reset support. Existing accounts and passwords are unchanged.
-- Run this migration alone through the guarded 049 runner; never replay the historical SQL chain.
begin;

alter table app_users
    add column if not exists auth_session_version integer not null default 0;

create table if not exists app_password_reset_tokens (
    id bigserial primary key,
    user_id bigint not null references app_users(id) on delete cascade,
    email_at_request_hash text not null check (email_at_request_hash ~ '^[0-9a-f]{64}$'),
    token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at timestamptz
);

create index if not exists app_password_reset_tokens_user_created_idx
    on app_password_reset_tokens (user_id, created_at desc);

create index if not exists app_password_reset_tokens_expiry_idx
    on app_password_reset_tokens (expires_at)
    where used_at is null;

-- The raw reset token and recipient are encrypted at application level with AES-256-GCM.
-- Only the hashed token is available to ordinary database queries.
create table if not exists app_password_reset_mail_outbox (
    id bigserial primary key,
    token_hash text not null unique
        references app_password_reset_tokens(token_hash) on delete cascade,
    payload_ciphertext bytea,
    payload_nonce bytea,
    payload_auth_tag bytea,
    attempts integer not null default 0 check (attempts >= 0),
    available_at timestamptz not null default now(),
    locked_until timestamptz,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    sent_at timestamptz,
    cancelled_at timestamptz,
    last_error text not null default ''
);

create index if not exists app_password_reset_mail_outbox_due_idx
    on app_password_reset_mail_outbox (available_at, created_at)
    where sent_at is null and cancelled_at is null;

create index if not exists app_password_reset_mail_outbox_expiry_idx
    on app_password_reset_mail_outbox (expires_at)
    where sent_at is null and cancelled_at is null;

commit;
