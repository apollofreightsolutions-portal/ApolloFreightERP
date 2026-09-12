-- Store additional paid leave days caused by late return.
alter table leave_requests add column if not exists late_return_days numeric(8,1) not null default 0;
