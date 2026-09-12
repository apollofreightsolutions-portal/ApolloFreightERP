create table if not exists hr_employee_leave_policy_history (
    id bigserial primary key,
    policy_id bigint,
    user_name text not null,
    leave_type_code text not null,
    year integer not null,
    entitlement numeric(8,1) not null default 0,
    carry_forward numeric(8,1) not null default 0,
    adjustment numeric(8,1) not null default 0,
    previous_used_days numeric(8,1) not null default 0,
    adjustment_start_date date,
    adjustment_end_date date,
    notes text not null default '',
    saved_by text not null default '',
    saved_at timestamptz not null default now()
);
create index if not exists idx_hr_policy_history_user on hr_employee_leave_policy_history(lower(user_name), year, saved_at desc);

insert into hr_employee_leave_policy_history
    (policy_id, user_name, leave_type_code, year, entitlement, carry_forward, adjustment, previous_used_days,
     adjustment_start_date, adjustment_end_date, notes, saved_by, saved_at)
select p.id, p.user_name, p.leave_type_code, p.year, p.entitlement, p.carry_forward, p.adjustment, p.previous_used_days,
       p.adjustment_start_date, p.adjustment_end_date, p.notes, p.created_by, coalesce(p.created_at, now())
from hr_employee_leave_policies p
where not exists (
    select 1 from hr_employee_leave_policy_history h
    where h.policy_id = p.id and h.saved_at = coalesce(p.created_at, now())
);

insert into hr_employee_leave_policy_history
    (policy_id, user_name, leave_type_code, year, entitlement, carry_forward, adjustment, previous_used_days,
     adjustment_start_date, adjustment_end_date, notes, saved_by, saved_at)
select p.id, a.user_name, a.leave_type_code, a.year, p.entitlement, p.carry_forward, a.new_adjustment, p.previous_used_days,
       p.adjustment_start_date, p.adjustment_end_date, a.reason, a.adjusted_by, a.created_at
from hr_leave_adjustment_audit a
join hr_employee_leave_policies p
  on lower(p.user_name)=lower(a.user_name) and p.leave_type_code=a.leave_type_code and p.year=a.year
where not exists (
    select 1 from hr_employee_leave_policy_history h
    where h.policy_id = p.id and h.saved_at = a.created_at and h.adjustment = a.new_adjustment
);
