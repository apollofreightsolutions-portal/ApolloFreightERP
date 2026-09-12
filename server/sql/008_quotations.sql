create table if not exists quotations (
    id bigserial primary key,
    quotation_no text not null unique,
    branch text not null default '',
    date date not null default current_date,
    customer_name text not null default '',
    customer_contact_person text not null default '',
    customer_mobile text not null default '',
    customer_email text not null default '',
    cargo_items_json text not null default '[]',
    nature_of_goods text not null default '',
    volume_category text not null default '',
    cbm numeric(12, 3) not null default 0,
    actual_kg numeric(12, 3) not null default 0,
    status text not null default 'Draft',
    converted_job_no text not null default '',
    notes text not null default '',
    created_by text not null default 'operations',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table app_settings add column if not exists quotation_number_format text not null default 'QUO-YY###';
