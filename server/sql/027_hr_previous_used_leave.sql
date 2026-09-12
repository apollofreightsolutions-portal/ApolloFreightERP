-- Store historical leave used before the system records were created.
alter table hr_employee_leave_policies add column if not exists previous_used_days numeric(8,1) not null default 0;

COMMENT ON COLUMN hr_employee_leave_policies.previous_used_days IS 'HR-entered approved leave used before system records, not included in leave_requests';

-- The balance engine adds this value to approved leave_requests, preventing historical leave from being lost or double-counted.

