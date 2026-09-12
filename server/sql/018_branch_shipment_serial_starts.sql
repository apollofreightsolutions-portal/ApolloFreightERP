alter table app_settings add column if not exists kuwait_shipment_serial_start integer not null default 1;
alter table app_settings add column if not exists dubai_shipment_serial_start integer not null default 1;
