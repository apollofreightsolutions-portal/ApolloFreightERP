alter table app_settings add column if not exists enable_auto_approval boolean not null default true;

create table if not exists customer_users (
    id bigserial primary key,
    customer_code text not null,
    username text not null,
    email text not null default '',
    password_hash text not null default '',
    status text not null default 'ACTIVE',
    last_login timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_customer_users_username on customer_users (lower(username));
create index if not exists idx_customer_users_customer_code on customer_users (lower(customer_code));
create index if not exists idx_customer_users_status on customer_users (status);

create table if not exists hs_code_master (
    id bigserial primary key,
    item_name text not null,
    alternate_name text not null default '',
    hs_code text not null default '',
    item_code text not null,
    status text not null default 'ACTIVE',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (item_code)
);

create index if not exists idx_hs_code_master_item_name on hs_code_master (lower(item_name));
create index if not exists idx_hs_code_master_alt_name on hs_code_master (lower(alternate_name));
create index if not exists idx_hs_code_master_status on hs_code_master (status);

create table if not exists shipment_requests (
    id bigserial primary key,
    request_no text not null unique,
    customer_code text not null,
    customer_name text not null default '',
    shipment_type text not null default '',
    origin text not null default '',
    destination text not null default '',
    consignee text not null default '',
    item_name text not null default '',
    hs_code text not null default '',
    item_code text not null default '',
    quantity numeric(12, 3) not null default 0,
    weight numeric(12, 3) not null default 0,
    invoice_value numeric(12, 3) not null default 0,
    remarks text not null default '',
    attachments_json text not null default '[]',
    status text not null default 'SUBMITTED',
    approval_notes text not null default '',
    auto_approved boolean not null default false,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint shipment_requests_status_check check (status in ('SUBMITTED','AUTO_APPROVED','PENDING_REVIEW','APPROVED','REJECTED','CANCELLED','COMPLETED'))
);

create index if not exists idx_shipment_requests_customer_code on shipment_requests (lower(customer_code));
create index if not exists idx_shipment_requests_customer_name on shipment_requests (lower(customer_name));
create index if not exists idx_shipment_requests_status on shipment_requests (status, created_at desc);

create table if not exists notifications (
    id bigserial primary key,
    user_id text not null default '',
    user_type text not null default 'company',
    customer_code text not null default '',
    type text not null default '',
    title text not null default '',
    message text not null default '',
    read_status text not null default 'UNREAD',
    created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications (lower(user_type), lower(user_id), created_at desc);
create index if not exists idx_notifications_customer_code on notifications (lower(customer_code), created_at desc);

create table if not exists customer_activity_logs (
    id bigserial primary key,
    customer_user_id text not null default '',
    customer_code text not null default '',
    action text not null default '',
    description text not null default '',
    ip_address text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists idx_customer_activity_logs_user on customer_activity_logs (lower(customer_user_id), created_at desc);
create index if not exists idx_customer_activity_logs_customer_code on customer_activity_logs (lower(customer_code), created_at desc);

do $$
declare
    table_name text;
begin
    foreach table_name in array array['customer_users','hs_code_master','shipment_requests']
    loop
        if not exists (select 1 from pg_trigger where tgname = 'trg_' || table_name || '_updated_at') then
            execute format('create trigger trg_%I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
        end if;
    end loop;
end $$;

insert into hs_code_master (item_name, alternate_name, hs_code, item_code, status)
values
    ('Laptop Charger', 'Notebook Charger', '8504.40', 'ITEM-1001', 'ACTIVE'),
    ('Packing List Sample', 'Shipment Document', '4901.99', 'ITEM-DOC', 'ACTIVE')
on conflict (item_code) do nothing;
