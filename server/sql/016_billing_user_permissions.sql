alter table app_users add column if not exists can_billing_sales_entry boolean not null default true;
alter table app_users add column if not exists can_billing_cost_entry boolean not null default true;
