-- HR Leave Management expansion. Existing employee/leave records are preserved.
-- Safe to run multiple times.

alter table app_users add column if not exists hr_portal_access boolean not null default false;
alter table leave_requests add column if not exists calendar_days numeric(8,1) not null default 0;
alter table leave_requests add column if not exists weekend_days numeric(8,1) not null default 0;
alter table leave_requests add column if not exists public_holiday_days numeric(8,1) not null default 0;
alter table leave_requests add column if not exists actual_leave_days numeric(8,1) not null default 0;
alter table leave_requests add column if not exists half_day_type text not null default '';
alter table leave_requests add column if not exists rejoining_date date;
alter table leave_requests add column if not exists contact_during_leave text not null default '';
alter table leave_requests add column if not exists leave_address text not null default '';
alter table leave_requests add column if not exists emergency_contact text not null default '';
alter table leave_requests add column if not exists declaration_accepted boolean not null default false;
alter table leave_requests add column if not exists declaration_accepted_at timestamptz;
alter table leave_requests add column if not exists attachment_url text not null default '';
alter table leave_requests add column if not exists rejection_reason text not null default '';
alter table leave_requests add column if not exists cancellation_reason text not null default '';
alter table leave_requests add column if not exists requested_by text not null default '';
alter table leave_requests add column if not exists manager_approved_by text not null default '';
alter table leave_requests add column if not exists manager_approved_at timestamptz;
alter table leave_requests add column if not exists rejoined_at timestamptz;
alter table leave_requests add column if not exists rejoined_by text not null default '';
alter table leave_requests add column if not exists created_at timestamptz not null default now();
alter table leave_requests add column if not exists updated_at timestamptz not null default now();

update leave_requests
set calendar_days = case when calendar_days = 0 then (end_date - start_date + 1) else calendar_days end,
    actual_leave_days = case when actual_leave_days = 0 then coalesce(total_days, 0) else actual_leave_days end
where calendar_days = 0 or actual_leave_days = 0;

create table if not exists hr_calendar_days (
    id bigserial primary key,
    branch text not null default 'All',
    holiday_date date not null,
    day_type text not null default 'PUBLIC_HOLIDAY' check (day_type in ('PUBLIC_HOLIDAY','BLACKOUT','WORKING_DAY')),
    title text not null default '', notes text not null default '', active boolean not null default true,
    created_by text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (branch, holiday_date, day_type)
);
create index if not exists idx_hr_calendar_date on hr_calendar_days(holiday_date, active);

create table if not exists hr_weekend_rules (
    id bigserial primary key,
    branch text not null default 'All', weekday integer not null check (weekday between 0 and 6), active boolean not null default true,
    created_by text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (branch, weekday)
);

create table if not exists hr_leave_types (
    id bigserial primary key, code text not null unique, name text not null, paid boolean not null default true,
    annual_entitlement numeric(8,1) not null default 0, allow_half_day boolean not null default true, allow_hourly boolean not null default false,
    require_attachment boolean not null default false, attachment_after_days numeric(8,1) not null default 0,
    allow_during_probation boolean not null default false, allow_carry_forward boolean not null default false,
    max_carry_forward numeric(8,1) not null default 0, carry_forward_expiry_month integer, carry_forward_expiry_day integer,
    allow_encashment boolean not null default false, allow_negative_balance boolean not null default false, active boolean not null default true,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into hr_leave_types (code,name,paid,annual_entitlement,allow_half_day,allow_hourly,require_attachment,allow_during_probation,allow_carry_forward,max_carry_forward,active)
values
 ('ANNUAL','Annual Leave',true,30,true,false,false,false,true,10,true),
 ('SICK','Sick Leave',true,15,true,false,true,true,false,0,true),
 ('EMERGENCY','Emergency Leave',true,5,true,false,false,true,false,0,true),
 ('UNPAID','Unpaid Leave',false,0,true,false,false,true,false,0,true)
on conflict (code) do nothing;

create table if not exists hr_employee_leave_policies (
    id bigserial primary key, user_name text not null, leave_type_code text not null references hr_leave_types(code), year integer not null,
    entitlement numeric(8,1) not null default 0, carry_forward numeric(8,1) not null default 0, adjustment numeric(8,1) not null default 0,
    notes text not null default '', created_by text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique(user_name, leave_type_code, year)
);

create table if not exists hr_leave_balances (
    id bigserial primary key, user_name text not null, year integer not null, leave_type_code text not null references hr_leave_types(code),
    entitlement numeric(8,1) not null default 0, carry_forward numeric(8,1) not null default 0, adjustment numeric(8,1) not null default 0,
    used_days numeric(8,1) not null default 0, pending_days numeric(8,1) not null default 0, available_days numeric(8,1) not null default 0,
    projected_days numeric(8,1) not null default 0, updated_at timestamptz not null default now(), unique(user_name, year, leave_type_code)
);
create index if not exists idx_hr_balance_user_year on hr_leave_balances(lower(user_name), year);

create table if not exists hr_leave_ledger (
    id bigserial primary key, user_name text not null, year integer not null, leave_type_code text not null, transaction_type text not null,
    reference_no text not null default '', days numeric(8,1) not null default 0, balance_after numeric(8,1) not null default 0,
    reason text not null default '', created_by text not null default '', created_at timestamptz not null default now()
);
create index if not exists idx_hr_ledger_user_year on hr_leave_ledger(lower(user_name), year, created_at desc);

create table if not exists hr_leave_settings (
    settings_key text primary key, settings_json jsonb not null default '{}'::jsonb, updated_by text not null default '', updated_at timestamptz not null default now()
);
insert into hr_leave_settings(settings_key, settings_json)
values ('global', '{"backdated_days":3,"blackout_override":true,"max_same_department_leave":0,"default_rejoin_next_working_day":true}'::jsonb)
on conflict (settings_key) do nothing;

insert into hr_weekend_rules(branch,weekday,active,created_by)
values ('All',5,true,'system'),('All',6,true,'system')
on conflict (branch,weekday) do nothing;
