create table if not exists shipments (
    id bigserial primary key,
    job_no text not null unique,
    branch text not null default 'Kuwait HO',
    customer_name text not null,
    origin text not null default '',
    destination text not null default '',
    status text not null default 'Booked',
    pieces integer not null default 0,
    actual_kg numeric(12, 3) not null default 0,
    cbm numeric(12, 3) not null default 0,
    chargeable_kg numeric(12, 3) not null default 0,
    sell numeric(12, 3) not null default 0,
    buy_cost numeric(12, 3) not null default 0,
    pod_status text not null default 'Pending',
    invoice_status text not null default 'Unbilled',
    booking_date date not null default current_date,
    airway_bill_no text not null default '',
    tariff_no text not null default '',
    transit_days integer not null default 0,
    shipment_direction text not null default 'Export',
    shipment_service text not null default 'AE',
    shipment_service_other text not null default '',
    volume_category text not null default 'Land',
    chargeable_divisor numeric(12, 3) not null default 250,
    notes text not null default '',
    created_by text not null default 'system',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table shipments add column if not exists pieces integer not null default 0;
alter table shipments add column if not exists actual_kg numeric(12, 3) not null default 0;
alter table shipments add column if not exists cbm numeric(12, 3) not null default 0;
alter table shipments add column if not exists chargeable_kg numeric(12, 3) not null default 0;
alter table shipments add column if not exists sell numeric(12, 3) not null default 0;
alter table shipments add column if not exists buy_cost numeric(12, 3) not null default 0;
alter table shipments add column if not exists pod_status text not null default 'Pending';
alter table shipments add column if not exists invoice_status text not null default 'Unbilled';
alter table shipments add column if not exists airway_bill_no text not null default '';
alter table shipments add column if not exists tariff_no text not null default '';
alter table shipments add column if not exists transit_days integer not null default 0;
alter table shipments add column if not exists shipment_direction text not null default 'Export';
alter table shipments add column if not exists shipment_service text not null default 'AE';
alter table shipments add column if not exists shipment_service_other text not null default '';
alter table shipments add column if not exists volume_category text not null default 'Land';
alter table shipments add column if not exists chargeable_divisor numeric(12, 3) not null default 250;
alter table shipments add column if not exists notes text not null default '';
alter table shipments add column if not exists created_by text not null default 'system';
alter table shipments add column if not exists updated_at timestamptz not null default now();

create table if not exists consolidations (
    id bigserial primary key,
    load_no text not null unique,
    trip_date date not null default current_date,
    route text not null default '',
    transporter text not null default '',
    vehicle_no text not null default '',
    status text not null default 'Planned',
    pieces integer not null default 0,
    actual_kg numeric(12, 3) not null default 0,
    cbm numeric(12, 3) not null default 0,
    chargeable_kg numeric(12, 3) not null default 0,
    job_numbers text not null default '',
    manifest_status text not null default 'Not Generated',
    last_manifest_request_no text not null default '',
    notes text not null default '',
    created_by text not null default 'system',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table consolidations add column if not exists notes text not null default '';
alter table consolidations add column if not exists manifest_status text not null default 'Not Generated';
alter table consolidations add column if not exists last_manifest_request_no text not null default '';
alter table consolidations add column if not exists created_by text not null default 'system';
alter table consolidations add column if not exists updated_at timestamptz not null default now();

create table if not exists customers (
    id bigserial primary key,
    code text not null unique,
    name text not null,
    location_or_lane text not null default '',
    full_address text not null default '',
    email text not null default '',
    mobile text not null default '',
    terms text not null default '30 days',
    status text not null default 'Active',
    is_account_overdue boolean not null default false,
    branch text not null default 'Kuwait HO',
    credit_limit numeric(12, 3) not null default 0,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table customers add column if not exists credit_limit numeric(12, 3) not null default 0;
alter table customers add column if not exists full_address text not null default '';
alter table customers add column if not exists mobile text not null default '';
alter table customers add column if not exists notes text not null default '';
alter table customers add column if not exists created_by text not null default 'system';
alter table customers add column if not exists updated_at timestamptz not null default now();

create table if not exists suppliers (
    id bigserial primary key,
    code text not null unique,
    name text not null,
    location_or_lane text not null default '',
    full_address text not null default '',
    email text not null default '',
    mobile text not null default '',
    terms text not null default '30 days',
    status text not null default 'Active',
    is_account_overdue boolean not null default false,
    branch text not null default 'Kuwait HO',
    credit_limit numeric(12, 3) not null default 0,
    service_type text not null default 'Transporter',
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table suppliers add column if not exists credit_limit numeric(12, 3) not null default 0;
alter table suppliers add column if not exists full_address text not null default '';
alter table suppliers add column if not exists mobile text not null default '';
alter table suppliers add column if not exists created_by text not null default 'system';

create table if not exists tariffs (
    id bigserial primary key,
    tariff_no text not null unique,
    customer text not null default '',
    origin text not null default '',
    destination text not null default '',
    main_section text not null default 'FTL',
    weight_section text not null default 'Minimum',
    min_up_to text not null default '',
    rate numeric(12, 3) not null default 0,
    min_charge numeric(12, 3) not null default 0,
    additional_charges_json text not null default '[]',
    additional_charges_total numeric(12, 3) not null default 0,
    grand_total numeric(12, 3) not null default 0,
    rate_type text not null default 'Per KG',
    volumetric_divisor integer not null default 5000,
    effective_from date not null default current_date,
    effective_to date not null default (current_date + interval '1 year'),
    status text not null default 'Active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table tariffs add column if not exists min_up_to text not null default '';
alter table tariffs add column if not exists additional_charges_json text not null default '[]';
alter table tariffs add column if not exists additional_charges_total numeric(12, 3) not null default 0;
alter table tariffs add column if not exists grand_total numeric(12, 3) not null default 0;

create table if not exists documents (
    id bigserial primary key,
    document_no text not null unique,
    linked_no text not null default '',
    type text not null default '',
    status text not null default 'Uploaded',
    date date not null default current_date,
    owner text not null default 'operations',
    file_name text not null default '',
    storage_url text not null default '',
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists invoices (
    id bigserial primary key,
    invoice_no text not null unique,
    customer text not null default '',
    shipment_no text not null default '',
    revenue numeric(12, 3) not null default 0,
    supplier_cost numeric(12, 3) not null default 0,
    gross_profit numeric(12, 3) generated always as (revenue - supplier_cost) stored,
    status text not null default 'Draft',
    date date not null default current_date,
    due_date date,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists app_users (
    id bigserial primary key,
    user_name text not null unique,
    email text not null default '',
    role text not null default 'Operations',
    account_status text not null default 'Active',
    branch_access text not null default 'Kuwait HO',
    branch_view_scope text not null default 'Assigned Branch Only',
    section_access text not null default 'All',
    password text not null default '',
    can_view_all_entry boolean not null default true,
    can_view_only_self_entry boolean not null default false,
    can_edit_all_entry boolean not null default false,
    can_view_updated_history boolean not null default true,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table app_users add column if not exists password text not null default '';
alter table app_users add column if not exists branch_view_scope text not null default 'Assigned Branch Only';
alter table app_users add column if not exists section_access text not null default 'All';

create table if not exists unblock_requests (
    id bigserial primary key,
    request_no text not null unique,
    request_type text not null default 'Unblock',
    target_type text not null default 'Customer',
    reference_no text not null default '',
    customer_name text not null default '',
    requested_by text not null default '',
    reason text not null default '',
    status text not null default 'Pending',
    date date not null default current_date,
    approved_by text not null default '',
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists admin_requests (
    id bigserial primary key,
    request_no text not null unique,
    request_type text not null default 'Other',
    target_module text not null default '',
    reference_no text not null default '',
    requested_by text not null default '',
    status text not null default 'Pending',
    date date not null default current_date,
    details text not null default '',
    proposed_values text not null default '',
    approved_by text not null default '',
    approval_notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists additional_charges (
    id bigserial primary key,
    ref_no text not null unique,
    shipment_no text not null default '',
    charge_date date not null default current_date,
    charge_type text not null default 'Labour Charges',
    charge_basis text not null default '1 ton',
    supplier text not null default '',
    reference_no text not null default '',
    invoice_no text not null default '',
    amount numeric(12, 3) not null default 0,
    tax_percent numeric(12, 3) not null default 0,
    tax_amount numeric(12, 3) generated always as ((amount * tax_percent) / 100) stored,
    total_amount numeric(12, 3) generated always as (amount + ((amount * tax_percent) / 100)) stored,
    currency text not null default 'KWD',
    remarks text not null default '',
    attachment_name text not null default '',
    status text not null default 'Draft',
    requested_by text not null default '',
    approved_by text not null default '',
    approval_notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists audit_log (
    id bigserial primary key,
    date_time timestamptz not null default now(),
    user_name text not null default 'system',
    action text not null default '',
    reference text not null default '',
    details jsonb not null default '{}'::jsonb
);

create table if not exists app_settings (
    id bigserial primary key,
    settings_key text not null unique default 'default',
    company_name text not null default 'APOLLO FREIGHT SOLUTIONS',
    company_logo_url text not null default '',
    shipment_number_format text not null default 'AFS-SI###',
    invoice_number_format text not null default 'INV-YY###',
    consolidation_number_format text not null default 'CON-YY###',
    customer_number_format text not null default 'CUS-###',
    additional_charge_number_format text not null default 'CHG-YY###',
    supplier_number_format text not null default 'TRN-###',
    default_volumetric_divisor text not null default '5000',
    require_pod_before_invoice text not null default 'Yes',
    branches text not null default 'Kuwait HO, Dubai',
    dropdown_options text not null default '{}',
    updated_at timestamptz not null default now()
);

alter table unblock_requests add column if not exists request_type text not null default 'Unblock';
alter table unblock_requests add column if not exists target_type text not null default 'Customer';
alter table unblock_requests add column if not exists reference_no text not null default '';

alter table additional_charges add column if not exists created_by text not null default 'system';

alter table tariffs add column if not exists created_by text not null default 'system';
alter table documents add column if not exists created_by text not null default 'system';
alter table invoices add column if not exists created_by text not null default 'system';

alter table app_settings add column if not exists consolidation_number_format text not null default 'CON-YY###';
alter table app_settings add column if not exists tcn_number_format text not null default 'TCN-YY###';
alter table app_settings add column if not exists delivery_note_number_format text not null default 'POD-YY###';
alter table app_settings add column if not exists document_number_format text not null default 'DOC-YY###';
alter table app_settings add column if not exists tariff_number_format text not null default 'TAR-###';
alter table app_settings add column if not exists customer_number_format text not null default 'CUS-###';
alter table app_settings add column if not exists additional_charge_number_format text not null default 'CHG-YY###';
alter table app_settings add column if not exists supplier_number_format text not null default 'TRN-###';
alter table app_settings add column if not exists company_logo_url text not null default '';
alter table app_settings add column if not exists column_layout_json text not null default '{}';
alter table app_settings add column if not exists dropdown_options text not null default '{}';

create table if not exists shipment_status_history (
    id bigserial primary key,
    job_no text not null,
    status text not null,
    pod_status text not null default '',
    invoice_status text not null default '',
    notes text not null default '',
    updated_by text not null default 'system',
    updated_at timestamptz not null default now()
);

create table if not exists shipment_cargo_items (
    id bigserial primary key,
    job_no text not null,
    package_type text not null default 'Pallet',
    quantity numeric(12, 3) not null default 0,
    length numeric(12, 3) not null default 0,
    width numeric(12, 3) not null default 0,
    height numeric(12, 3) not null default 0,
    dimension_unit text not null default 'CM',
    weight numeric(12, 3) not null default 0,
    weight_unit text not null default 'KG',
    volume_weight numeric(12, 3) not null default 0,
    remarks text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_shipments_booking_date on shipments (booking_date desc);
create index if not exists idx_shipments_customer on shipments (customer_name);
create index if not exists idx_shipments_status on shipments (status);
create index if not exists idx_consolidations_trip_date on consolidations (trip_date desc);
create index if not exists idx_consolidations_status on consolidations (status);
create index if not exists idx_customers_created_at on customers (created_at desc);
create index if not exists idx_suppliers_created_at on suppliers (created_at desc);
create index if not exists idx_tariffs_route on tariffs (origin, destination);
create index if not exists idx_documents_linked_no on documents (linked_no);
create index if not exists idx_invoices_shipment_no on invoices (shipment_no);
create index if not exists idx_audit_log_date_time on audit_log (date_time desc);
create index if not exists idx_status_history_job_no on shipment_status_history (job_no, updated_at desc);
create index if not exists idx_shipment_cargo_items_job_no on shipment_cargo_items (job_no);
create index if not exists idx_admin_requests_status on admin_requests (status, date desc);
create index if not exists idx_additional_charges_shipment on additional_charges (shipment_no, charge_date desc);

create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'shipments',
        'consolidations',
        'customers',
        'suppliers',
        'tariffs',
        'documents',
        'invoices',
        'app_users',
        'unblock_requests',
        'admin_requests',
        'additional_charges',
        'shipment_cargo_items',
        'app_settings'
    ]
    loop
        if not exists (
            select 1
            from pg_trigger
            where tgname = 'trg_' || table_name || '_updated_at'
        ) then
            execute format(
                'create trigger trg_%I_updated_at before update on %I for each row execute function set_updated_at()',
                table_name,
                table_name
            );
        end if;
    end loop;
end $$;
