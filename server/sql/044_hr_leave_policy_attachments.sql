alter table hr_employee_leave_policies
    add column if not exists attachment_name text not null default '',
    add column if not exists attachment_mime_type text not null default '',
    add column if not exists attachment_url text not null default '';
