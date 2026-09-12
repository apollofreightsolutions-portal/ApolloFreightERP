-- Additional HR leave workflow controls. All changes are additive and safe to rerun.

alter table leave_requests add column if not exists extension_of text not null default '';
alter table leave_requests add column if not exists extension_reason text not null default '';
alter table leave_requests add column if not exists approved_by_delegate boolean not null default false;

create table if not exists hr_leave_delegations (
    id bigserial primary key,
    delegator_user_name text not null,
    delegate_user_name text not null,
    start_date date not null,
    end_date date not null,
    active boolean not null default true,
    notes text not null default '',
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_hr_leave_delegations_active on hr_leave_delegations(lower(delegate_user_name), start_date, end_date) where active = true;

create table if not exists hr_leave_adjustment_audit (
    id bigserial primary key,
    user_name text not null,
    leave_type_code text not null,
    year integer not null,
    previous_adjustment numeric(8,1) not null default 0,
    new_adjustment numeric(8,1) not null default 0,
    reason text not null default '',
    adjusted_by text not null default '',
    created_at timestamptz not null default now()
);
create index if not exists idx_hr_leave_adjustment_audit_user on hr_leave_adjustment_audit(lower(user_name), year, created_at desc);
