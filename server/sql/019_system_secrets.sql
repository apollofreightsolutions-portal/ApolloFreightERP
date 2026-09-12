-- Dedicated store for server-managed secrets (e.g. the login token signing key).
-- Deliberately NOT part of the generic resources map in index.js, so it is never
-- readable through the /api/:resource CRUD endpoints.
create table if not exists system_secrets (
    secret_key text primary key,
    secret_value text not null,
    created_at timestamptz not null default now()
);
