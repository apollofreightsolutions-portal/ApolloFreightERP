-- V23: additive, rerunnable leave routing and durable notification outbox.
begin;
create table if not exists hr_leave_user_settings (
  user_name text primary key,
  can_approve_leave boolean not null default false,
  final_approver boolean not null default false,
  supervisor_user text not null default '',
  updated_by text not null default '', updated_at timestamptz not null default now()
);
alter table leave_requests add column if not exists approval_stage text not null default 'Management';
alter table leave_requests add column if not exists supervisor_user text not null default '';
alter table leave_requests add column if not exists supervisor_approved_by text not null default '';
alter table leave_requests add column if not exists workflow_version integer not null default 1;
create table if not exists hr_leave_workflow_audit (
  id bigserial primary key, request_no text not null, actor text not null,
  action text not null, comment text not null default '', target_user text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists hr_leave_mail_outbox (
  id bigserial primary key, event_key text not null unique, request_no text not null,
  recipient_kind text not null, recipient_user text not null default '',
  event text not null, status text not null default 'Pending', attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(), last_error text not null default '',
  created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists hr_leave_mail_due on hr_leave_mail_outbox(status,next_attempt_at);
create index if not exists hr_leave_audit_request on hr_leave_workflow_audit(request_no,id);
-- Do not grant anyone automatically. An ERP administrator explicitly assigns final authority.
create or replace function hr_leave_route_submission() returns trigger language plpgsql as $$
declare supervisor text;
begin
  if (TG_OP='INSERT' and NEW.status='Pending') or
     (TG_OP='UPDATE' and NEW.status='Pending' and OLD.status='Sent Back') then
    select coalesce(s.supervisor_user,'') into supervisor from hr_leave_user_settings s
      where lower(s.user_name)=lower(NEW.user_name);
    NEW.supervisor_user := coalesce(supervisor,'');
    NEW.supervisor_approved_by := '';
    NEW.approval_stage := case when NEW.supervisor_user='' then 'Management' else 'Supervisor' end;
  end if;
  if TG_OP='UPDATE' then NEW.workflow_version := OLD.workflow_version+1; end if;
  return NEW;
end $$;
drop trigger if exists hr_leave_route_submission_trigger on leave_requests;
create trigger hr_leave_route_submission_trigger before insert or update on leave_requests
for each row execute function hr_leave_route_submission();
create or replace function hr_leave_queue_event() returns trigger language plpgsql as $$
declare event_name text; event_id text;
begin
  if TG_OP='INSERT' then
    if NEW.status<>'Pending' then return NEW; end if;
    event_name := 'Submitted';
  elsif NEW.status='Pending' and OLD.status='Sent Back' then event_name := 'Resubmitted';
  elsif NEW.status is distinct from OLD.status then event_name := NEW.status;
  elsif NEW.supervisor_user is distinct from OLD.supervisor_user then event_name := 'Forwarded';
  elsif NEW.approval_stage is distinct from OLD.approval_stage then event_name := 'Supervisor approved';
  else return NEW;
  end if;
  event_id := NEW.request_no || ':' || NEW.workflow_version || ':';
  insert into hr_leave_mail_outbox(event_key,request_no,recipient_kind,recipient_user,event)
    values(event_id||'management',NEW.request_no,'management','',event_name) on conflict do nothing;
  if NEW.supervisor_user<>'' then
    insert into hr_leave_mail_outbox(event_key,request_no,recipient_kind,recipient_user,event)
      values(event_id||'supervisor',NEW.request_no,'user',NEW.supervisor_user,event_name) on conflict do nothing;
  end if;
  insert into hr_leave_mail_outbox(event_key,request_no,recipient_kind,recipient_user,event)
    values(event_id||'employee',NEW.request_no,'user',NEW.user_name,event_name) on conflict do nothing;
  if event_name in ('Submitted','Resubmitted') then
    insert into hr_leave_workflow_audit(request_no,actor,action,comment)
      values(NEW.request_no,NEW.user_name,event_name,NEW.reason);
  end if;
  return NEW;
end $$;
drop trigger if exists hr_leave_queue_event_trigger on leave_requests;
create trigger hr_leave_queue_event_trigger after insert or update on leave_requests
for each row execute function hr_leave_queue_event();
commit;
