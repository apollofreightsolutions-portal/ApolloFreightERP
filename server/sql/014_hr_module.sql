alter table app_users add column if not exists hr_portal_access boolean not null default false;

create table if not exists employees (
    id serial primary key,
    user_name text not null unique,
    employee_code text not null default '',
    full_name text not null default '',
    department text not null default '',
    designation text not null default '',
    join_date date,
    phone text not null default '',
    personal_email text not null default '',
    employment_status text not null default 'Active',
    reporting_manager text not null default '',
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_employees_user_name on employees (lower(user_name));

create table if not exists leave_requests (
    id serial primary key,
    request_no text not null unique,
    user_name text not null,
    employee_name text not null default '',
    leave_type text not null default 'Annual',
    start_date date not null,
    end_date date not null,
    total_days numeric(6, 1) not null default 0,
    reason text not null default '',
    status text not null default 'Pending'
        constraint leave_requests_status_check check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    approved_by text not null default '',
    approved_at timestamptz,
    applied_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_leave_requests_user_name on leave_requests (lower(user_name));

create table if not exists payslips (
    id serial primary key,
    payslip_no text not null unique,
    user_name text not null,
    employee_name text not null default '',
    period text not null default '',
    gross_pay numeric(12, 2) not null default 0,
    deductions numeric(12, 2) not null default 0,
    net_pay numeric(12, 2) not null default 0,
    status text not null default 'Issued',
    issued_date date,
    storage_url text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_payslips_user_name on payslips (lower(user_name));

create table if not exists hr_announcements (
    id serial primary key,
    title text not null default '',
    body text not null default '',
    posted_by text not null default '',
    audience text not null default 'All',
    pinned boolean not null default false,
    posted_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
