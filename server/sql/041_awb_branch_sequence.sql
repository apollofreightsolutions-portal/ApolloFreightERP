alter table app_settings
  add column if not exists awb_serial_start integer not null default 262035;

update app_settings
set awb_number_format = 'AFS######',
    awb_serial_start = 262035
where settings_key = 'default'
  and (awb_number_format is null or awb_number_format = 'AWB-YY###');

create unique index if not exists shipments_branch_airway_bill_no_unique
  on shipments (lower(trim(branch)), lower(trim(airway_bill_no)))
  where nullif(trim(airway_bill_no), '') is not null;
