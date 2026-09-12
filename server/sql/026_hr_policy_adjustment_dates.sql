-- Store the date range used for a single-employee leave balance adjustment.
alter table hr_employee_leave_policies add column if not exists adjustment_start_date date;
alter table hr_employee_leave_policies add column if not exists adjustment_end_date date;
