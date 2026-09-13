-- Apollo Connected CRM module
-- Access is opt-in for ordinary users. Existing Admin accounts are granted full CRM control
-- so Company Management can configure the module immediately after deployment.

alter table app_users add column if not exists crm_portal_access boolean not null default false;
alter table app_users add column if not exists crm_role text not null default 'Sales Executive';
alter table app_users add column if not exists crm_view_all_accounts boolean not null default false;
alter table app_users add column if not exists crm_manage_assignments boolean not null default false;
alter table app_users add column if not exists crm_export_access boolean not null default false;
alter table app_users add column if not exists crm_archive_access boolean not null default false;
alter table app_users add column if not exists crm_view_team_reports boolean not null default false;
alter table app_users add column if not exists crm_admin_access boolean not null default false;

update app_users
set crm_portal_access = true,
    crm_role = 'Management',
    crm_view_all_accounts = true,
    crm_manage_assignments = true,
    crm_export_access = true,
    crm_archive_access = true,
    crm_view_team_reports = true,
    crm_admin_access = true
where lower(trim(role)) = 'admin';

create sequence if not exists crm_account_code_seq start 1001;
create sequence if not exists crm_opportunity_no_seq start 1001;

create table if not exists crm_accounts (
  id bigserial primary key,
  account_code text not null unique,
  company_name text not null,
  legal_name text,
  status text not null default 'Prospect',
  segment text,
  industry text,
  branch text,
  territory text,
  assigned_to text not null,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  source text,
  website text,
  phone text,
  email text,
  country text,
  city text,
  address text,
  services_interest text,
  trade_lanes text,
  estimated_monthly_shipments numeric(12,2) not null default 0,
  potential_value numeric(14,2) not null default 0,
  currency text not null default 'AED',
  next_action text,
  next_action_date date,
  relationship_health text not null default 'New',
  notes text,
  archived_at timestamptz,
  archived_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_accounts_assigned_to on crm_accounts (lower(assigned_to));
create index if not exists idx_crm_accounts_status on crm_accounts (status);
create index if not exists idx_crm_accounts_next_action_date on crm_accounts (next_action_date);
create index if not exists idx_crm_accounts_archived_at on crm_accounts (archived_at);

create table if not exists crm_contacts (
  id bigserial primary key,
  account_id bigint not null references crm_accounts(id) on delete cascade,
  full_name text not null,
  job_title text,
  department text,
  email text,
  mobile text,
  phone text,
  whatsapp text,
  linkedin text,
  is_primary boolean not null default false,
  influence_level text,
  preferred_contact_method text,
  birthday date,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_contacts_account on crm_contacts(account_id);

create table if not exists crm_opportunities (
  id bigserial primary key,
  account_id bigint not null references crm_accounts(id) on delete cascade,
  opportunity_no text not null unique,
  title text not null,
  owner_user_name text not null,
  stage text not null default 'Qualification',
  status text not null default 'Open',
  service_type text,
  origin text,
  destination text,
  estimated_value numeric(14,2) not null default 0,
  currency text not null default 'AED',
  probability integer not null default 25 check (probability >= 0 and probability <= 100),
  expected_close_date date,
  competitor text,
  next_step text,
  next_step_date date,
  lost_reason text,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_opportunities_account on crm_opportunities(account_id);
create index if not exists idx_crm_opportunities_owner on crm_opportunities(lower(owner_user_name));
create index if not exists idx_crm_opportunities_stage on crm_opportunities(stage);

create table if not exists crm_visits (
  id bigserial primary key,
  account_id bigint not null references crm_accounts(id) on delete cascade,
  contact_id bigint references crm_contacts(id) on delete set null,
  visit_date date not null,
  visit_time text,
  visit_type text not null default 'Client Visit',
  location text,
  attendees text,
  purpose text,
  outcome text,
  next_step text,
  follow_up_date date,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_visits_account on crm_visits(account_id);
create index if not exists idx_crm_visits_date on crm_visits(visit_date desc);

create table if not exists crm_meetings (
  id bigserial primary key,
  account_id bigint not null references crm_accounts(id) on delete cascade,
  contact_id bigint references crm_contacts(id) on delete set null,
  meeting_date date not null,
  meeting_time text,
  meeting_type text not null default 'In Person',
  subject text not null,
  attendees text,
  minutes text,
  decisions text,
  action_items text,
  follow_up_date date,
  document_link text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_meetings_account on crm_meetings(account_id);
create index if not exists idx_crm_meetings_date on crm_meetings(meeting_date desc);

create table if not exists crm_tasks (
  id bigserial primary key,
  account_id bigint references crm_accounts(id) on delete cascade,
  opportunity_id bigint references crm_opportunities(id) on delete set null,
  assigned_to text not null,
  title text not null,
  description text,
  due_date date,
  priority text not null default 'Normal',
  status text not null default 'Open',
  completed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_tasks_assigned_to on crm_tasks(lower(assigned_to));
create index if not exists idx_crm_tasks_due_date on crm_tasks(due_date);

create table if not exists crm_audit_log (
  id bigserial primary key,
  entity_type text not null,
  entity_id text not null,
  account_id bigint,
  action text not null,
  actor_user_name text not null,
  summary text,
  details_json jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_audit_account on crm_audit_log(account_id);
create index if not exists idx_crm_audit_actor on crm_audit_log(lower(actor_user_name));
create index if not exists idx_crm_audit_created on crm_audit_log(created_at desc);

-- Keep updated_at accurate even when records are edited through future integrations.
create or replace function crm_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_accounts_touch') then
    create trigger trg_crm_accounts_touch before update on crm_accounts for each row execute function crm_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_contacts_touch') then
    create trigger trg_crm_contacts_touch before update on crm_contacts for each row execute function crm_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_opportunities_touch') then
    create trigger trg_crm_opportunities_touch before update on crm_opportunities for each row execute function crm_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_visits_touch') then
    create trigger trg_crm_visits_touch before update on crm_visits for each row execute function crm_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_meetings_touch') then
    create trigger trg_crm_meetings_touch before update on crm_meetings for each row execute function crm_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_tasks_touch') then
    create trigger trg_crm_tasks_touch before update on crm_tasks for each row execute function crm_touch_updated_at();
  end if;
end $$;
