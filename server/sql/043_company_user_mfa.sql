-- Company/ERP MFA is opt-in per user. Existing users remain password-only until an Admin selects a policy.
alter table app_users
  add column if not exists mfa_policy text not null default 'disabled',
  add column if not exists mfa_secret_enc text not null default '',
  add column if not exists mfa_recovery_codes text not null default '[]',
  add column if not exists mfa_enrolled_at timestamptz;

alter table app_users drop constraint if exists app_users_mfa_policy_check;
alter table app_users add constraint app_users_mfa_policy_check
  check (mfa_policy in ('disabled', 'optional', 'required'));

create index if not exists app_users_mfa_policy_idx on app_users (mfa_policy);
