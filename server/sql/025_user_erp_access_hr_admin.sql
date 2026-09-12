-- erp_portal_access defaults to true so every existing user keeps working exactly as before -
-- until now there was no gate on ERP login at all, so defaulting this to false would lock
-- everyone out the moment this migration runs.
alter table app_users add column if not exists erp_portal_access boolean not null default true;
-- is_hr_admin is a new, independent opt-in permission - safe to default to false. A user with
-- role = 'Admin' still gets HR Admin rights automatically regardless of this flag (see isHrAdmin()
-- in app-runtime.js) - this column only matters for granting HR Admin to a non-Admin-role user.
alter table app_users add column if not exists is_hr_admin boolean not null default false;
