drop index if exists idx_customer_users_username;
create unique index if not exists idx_customer_users_username on customer_users (username);

alter table app_settings add column if not exists awb_number_format text not null default 'AWB-YY###';
