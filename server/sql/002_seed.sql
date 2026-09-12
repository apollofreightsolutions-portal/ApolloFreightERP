insert into customers (code, name, location_or_lane, full_address, email, terms, status, is_account_overdue, branch, credit_limit)
values
    ('CUS-001', 'Gulf Retail Trading', 'Kuwait City', 'Kuwait City, Kuwait', 'ops@gulf-retail.example', '30 days', 'Active', false, 'Kuwait HO', 5000),
    ('CUS-002', 'Desert Medical Supplies', 'Shuwaikh', 'Shuwaikh Industrial Area, Kuwait', 'logistics@desert-med.example', '15 days', 'Active', true, 'Dubai', 2500),
    ('CUS-003', 'Al Noor Projects', 'Ahmadi', 'Ahmadi, Kuwait', 'cargo@alnoor.example', '45 days', 'Active', false, 'Kuwait HO', 7500)
on conflict (code) do update set
    name = excluded.name,
    location_or_lane = excluded.location_or_lane,
    full_address = excluded.full_address,
    email = excluded.email,
    terms = excluded.terms,
    status = excluded.status,
    is_account_overdue = excluded.is_account_overdue,
    branch = excluded.branch,
    credit_limit = excluded.credit_limit;

insert into suppliers (code, name, location_or_lane, email, terms, status, is_account_overdue, branch, service_type)
values
    ('TRN-001', 'Al Dana Transport', 'Kuwait - Riyadh', 'dispatch@aldana.example', '20 days', 'Active', false, 'Kuwait HO', 'Transporter'),
    ('TRN-002', 'Falcon Line Haul', 'Kuwait - Dammam', 'ops@falconline.example', '30 days', 'Active', false, 'Dubai', 'Line Haul')
on conflict (code) do update set
    name = excluded.name,
    location_or_lane = excluded.location_or_lane,
    email = excluded.email,
    terms = excluded.terms,
    status = excluded.status,
    is_account_overdue = excluded.is_account_overdue,
    branch = excluded.branch,
    service_type = excluded.service_type;

insert into tariffs (
    tariff_no,
    customer,
    origin,
    destination,
    main_section,
    weight_section,
    min_up_to,
    rate_type,
    rate,
    min_charge,
    additional_charges_json,
    additional_charges_total,
    grand_total,
    volumetric_divisor,
    effective_from,
    effective_to,
    status
)
values
    ('TAR-1001', 'Gulf Retail Trading', 'Kuwait City', 'Riyadh', 'FTL', 'Minimum', '100 KG', 'Per KG', 0.420, 35.000, '[]', 0.000, 35.000, 5000, '2026-01-01', '2026-12-31', 'Active'),
    ('TAR-1002', 'Desert Medical Supplies', 'Shuwaikh', 'Dammam', 'LTL', 'Up to 300 KG', '300 KG', 'Per CBM', 18.000, 55.000, '[]', 0.000, 55.000, 5000, '2026-01-01', '2026-12-31', 'Active')
on conflict (tariff_no) do update set
    customer = excluded.customer,
    origin = excluded.origin,
    destination = excluded.destination,
    main_section = excluded.main_section,
    weight_section = excluded.weight_section,
    min_up_to = excluded.min_up_to,
    rate_type = excluded.rate_type,
    rate = excluded.rate,
    min_charge = excluded.min_charge,
    additional_charges_json = excluded.additional_charges_json,
    additional_charges_total = excluded.additional_charges_total,
    grand_total = excluded.grand_total,
    volumetric_divisor = excluded.volumetric_divisor,
    effective_from = excluded.effective_from,
    effective_to = excluded.effective_to,
    status = excluded.status;

insert into shipments (
    job_no,
    branch,
    customer_name,
    origin,
    destination,
    status,
    pieces,
    actual_kg,
    cbm,
    chargeable_kg,
    sell,
    buy_cost,
    pod_status,
    invoice_status,
    booking_date,
    airway_bill_no,
    tariff_no,
    transit_days,
    shipment_direction,
    shipment_service,
    shipment_service_other,
    volume_category,
    chargeable_divisor,
    created_by
)
values
    ('AFS-2605001', 'Kuwait HO', 'Gulf Retail Trading', 'Kuwait City', 'Riyadh', 'Booked', 14, 820.000, 5.200, 1040.000, 485.000, 330.000, 'Pending', 'Unbilled', '2026-05-05', 'AWB-2605001', 'TAR-1001', 3, 'Export', 'AE', '', 'Land', 250.000, 'admin'),
    ('AFS-2605002', 'Dubai', 'Desert Medical Supplies', 'Shuwaikh', 'Dammam', 'In-Transit', 8, 410.000, 2.100, 420.000, 215.000, 150.000, 'Pending', 'Unbilled', '2026-05-05', 'AWB-2605002', 'TAR-1002', 2, 'Import', 'AI', '', 'Land', 250.000, 'operations'),
    ('AFS-2605003', 'Kuwait HO', 'Al Noor Projects', 'Ahmadi', 'Doha', 'Delivered', 22, 1250.000, 7.800, 1560.000, 780.000, 590.000, 'Missing', 'Unbilled', '2026-05-04', 'AWB-2605003', 'TAR-1001', 4, 'Export', 'LE', '', 'Sea', 333.000, 'operations'),
    ('AFS-2605004', 'Kuwait HO', 'Gulf Retail Trading', 'Kuwait City', 'Riyadh', 'Invoiced', 4, 160.000, 0.900, 180.000, 95.000, 70.000, 'Uploaded', 'INV-260001', '2026-05-02', 'AWB-2605004', 'TAR-1001', 3, 'WHC', 'WHC Remark', 'Warehouse handling and cross-docking', 'Air', 167.000, 'billing')
on conflict (job_no) do update set
    branch = excluded.branch,
    customer_name = excluded.customer_name,
    origin = excluded.origin,
    destination = excluded.destination,
    status = excluded.status,
    pieces = excluded.pieces,
    actual_kg = excluded.actual_kg,
    cbm = excluded.cbm,
    chargeable_kg = excluded.chargeable_kg,
    sell = excluded.sell,
    buy_cost = excluded.buy_cost,
    pod_status = excluded.pod_status,
    invoice_status = excluded.invoice_status,
    booking_date = excluded.booking_date,
    airway_bill_no = excluded.airway_bill_no,
    tariff_no = excluded.tariff_no,
    transit_days = excluded.transit_days,
    shipment_direction = excluded.shipment_direction,
    shipment_service = excluded.shipment_service,
    shipment_service_other = excluded.shipment_service_other,
    volume_category = excluded.volume_category,
    chargeable_divisor = excluded.chargeable_divisor;

insert into consolidations (
    load_no,
    trip_date,
    route,
    transporter,
    vehicle_no,
    status,
    pieces,
    actual_kg,
    cbm,
    chargeable_kg,
    job_numbers,
    manifest_status,
    last_manifest_request_no,
    created_by
)
values
    ('CON-260501', '2026-05-05', 'Kuwait - Riyadh', 'Al Dana Transport', 'KWT-49217', 'Dispatched', 18, 980.000, 6.100, 1220.000, 'AFS-2605001, AFS-2605004', 'Not Generated', '', 'admin'),
    ('CON-260502', '2026-05-06', 'Kuwait - Dammam', 'Falcon Line Haul', 'KWT-77320', 'Planned', 8, 410.000, 2.100, 420.000, 'AFS-2605002', 'Not Generated', '', 'operations')
on conflict (load_no) do update set
    trip_date = excluded.trip_date,
    route = excluded.route,
    transporter = excluded.transporter,
    vehicle_no = excluded.vehicle_no,
    status = excluded.status,
    pieces = excluded.pieces,
    actual_kg = excluded.actual_kg,
    cbm = excluded.cbm,
    chargeable_kg = excluded.chargeable_kg,
    job_numbers = excluded.job_numbers,
    manifest_status = excluded.manifest_status,
    last_manifest_request_no = excluded.last_manifest_request_no;

insert into documents (document_no, linked_no, type, status, date, owner, file_name)
values
    ('DOC-001', 'AFS-2605001', 'Waybill', 'Issued', '2026-05-05', 'operations', 'AFS-2605001-waybill.pdf'),
    ('DOC-002', 'AFS-2605003', 'POD', 'Missing', '2026-05-04', 'delivery', ''),
    ('DOC-003', 'AFS-2605004', 'Customer Invoice', 'Stored', '2026-05-02', 'billing', 'INV-260001.pdf')
on conflict (document_no) do update set
    linked_no = excluded.linked_no,
    type = excluded.type,
    status = excluded.status,
    date = excluded.date,
    owner = excluded.owner,
    file_name = excluded.file_name;

insert into invoices (invoice_no, customer, shipment_no, revenue, supplier_cost, status, date)
values
    ('INV-260001', 'Gulf Retail Trading', 'AFS-2605004', 95.000, 70.000, 'Sent', '2026-05-02'),
    ('DRAFT-260006', 'Al Noor Projects', 'AFS-2605003', 780.000, 590.000, 'Draft', '2026-05-05')
on conflict (invoice_no) do update set
    customer = excluded.customer,
    shipment_no = excluded.shipment_no,
    revenue = excluded.revenue,
    supplier_cost = excluded.supplier_cost,
    status = excluded.status,
    date = excluded.date;

insert into app_users (
    user_name,
    email,
    role,
    account_status,
    branch_access,
    branch_view_scope,
    section_access,
    password,
    can_view_all_entry,
    can_view_only_self_entry,
    can_edit_all_entry,
    can_view_updated_history,
    notes
)
values
    ('admin', 'admin@apollofreightsolution.com', 'Admin', 'Active', 'Both', 'All Branches', 'All', 'pbkdf2$120000$c062c29dcdc632dc$ed19e93cd258ba7de539118d29ddbbf200f8f8379dc1fd476e05f327ca53073e', true, true, true, true, 'System temporary admin'),
    ('ops-kuwait', 'operations.kuwait@apollofreightsolution.com', 'Operations', 'Active', 'Kuwait HO', 'Assigned Branch Only', 'Dashboard, Shipment / Airway, Manifest, Customers, Suppliers / Transporters, Documents, Tariffs / Rate Master, Reports', 'pbkdf2$120000$e88750c8b3e0ccbf$fae99b36a994c4176202c29b4e91f7210c411d7b576e3d15676e446fe5a61590', false, true, false, false, 'Can create and track Kuwait HO shipments'),
    ('billing-dubai', 'billing.dubai@apollofreightsolution.com', 'Billing', 'Active', 'Dubai', 'Assigned Branch Only', 'Dashboard, Billing / Invoices, POD / Delivery, Shipment Status, Reports', 'pbkdf2$120000$d7af4928c4a3781a$7b08be3f0a27ea01930248c5e1a07fb68c446a59e05641b8c49f664d15aad642', true, false, true, true, 'Invoice and finance access for Dubai')
on conflict (user_name) do update set
    email = excluded.email,
    role = excluded.role,
    account_status = excluded.account_status,
    branch_access = excluded.branch_access,
    branch_view_scope = excluded.branch_view_scope,
    section_access = excluded.section_access,
    can_view_all_entry = excluded.can_view_all_entry,
    can_view_only_self_entry = excluded.can_view_only_self_entry,
    can_edit_all_entry = excluded.can_edit_all_entry,
    can_view_updated_history = excluded.can_view_updated_history,
    notes = excluded.notes;

insert into additional_charges (
    ref_no,
    shipment_no,
    charge_date,
    charge_type,
    charge_basis,
    supplier,
    reference_no,
    invoice_no,
    amount,
    tax_percent,
    currency,
    remarks,
    attachment_name,
    status,
    requested_by,
    approved_by,
    approval_notes
)
values
    ('CHG-001', 'AFS-2605001', '2026-05-24', 'Labour Charges', '1 ton', 'ABC Labour', 'LAB-5001', 'INV-LAB-001', 50.000, 10.000, 'KWD', 'Labour support at warehouse dock.', '', 'Approved', 'admin', 'admin', 'Approved by admin'),
    ('CHG-002', 'AFS-2605001', '2026-05-24', 'Delivery Charges', '3 ton', 'Fast Van', 'DLV-5001', 'INV-DLV-001', 20.000, 10.000, 'KWD', 'Final-mile van delivery.', '', 'Pending Approval', 'operations', '', '')
on conflict (ref_no) do update set
    shipment_no = excluded.shipment_no,
    charge_date = excluded.charge_date,
    charge_type = excluded.charge_type,
    charge_basis = excluded.charge_basis,
    supplier = excluded.supplier,
    reference_no = excluded.reference_no,
    invoice_no = excluded.invoice_no,
    amount = excluded.amount,
    tax_percent = excluded.tax_percent,
    currency = excluded.currency,
    remarks = excluded.remarks,
    attachment_name = excluded.attachment_name,
    status = excluded.status,
    requested_by = excluded.requested_by,
    approved_by = excluded.approved_by,
    approval_notes = excluded.approval_notes;

insert into app_settings (
    settings_key,
    company_name,
    company_logo_url,
    shipment_number_format,
    invoice_number_format,
    default_volumetric_divisor,
    require_pod_before_invoice,
    branches,
    dropdown_options
)
values
    ('default', 'APOLLO FREIGHT SOLUTIONS', '', 'AFS-SI###', 'INV-YY###', '5000', 'Yes', 'Kuwait HO, Dubai', '{}')
on conflict (settings_key) do nothing;
