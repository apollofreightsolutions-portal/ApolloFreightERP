-- V24 additive: explicit management override, no automatic privilege grants.
begin;
alter table hr_leave_user_settings add column if not exists management_override boolean not null default false;
-- Ignore stale/out-of-branch supervisor assignments for new submissions.
-- Existing requests are preserved and can be forwarded by management.
create or replace function hr_leave_route_submission() returns trigger language plpgsql as $$
declare supervisor text;
begin
  if (TG_OP='INSERT' and NEW.status='Pending') or
     (TG_OP='UPDATE' and NEW.status='Pending' and OLD.status='Sent Back') then
    select s.supervisor_user into supervisor from hr_leave_user_settings s
      join app_users employee on lower(employee.user_name)=lower(s.user_name)
      join app_users reviewer on lower(reviewer.user_name)=lower(s.supervisor_user)
      join hr_leave_user_settings permission on lower(permission.user_name)=lower(reviewer.user_name)
      where lower(s.user_name)=lower(NEW.user_name) and permission.can_approve_leave=true
        and reviewer.hr_portal_access=true and lower(reviewer.account_status)='active'
        and lower(reviewer.user_name)<>lower(employee.user_name)
        and lower(trim(reviewer.branch_access))=lower(trim(employee.branch_access))
        and trim(reviewer.branch_access)<>'' and reviewer.branch_access !~ '[,;|]'
        and lower(trim(reviewer.branch_access)) not in ('all','both','all branches');
    NEW.supervisor_user := coalesce(supervisor,'');
    NEW.supervisor_approved_by := '';
    NEW.approval_stage := case when NEW.supervisor_user='' then 'Management' else 'Supervisor' end;
  end if;
  if TG_OP='UPDATE' then NEW.workflow_version := OLD.workflow_version+1; end if;
  return NEW;
end $$;
commit;
