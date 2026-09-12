alter table shipments add column if not exists transporter text not null default '';
alter table shipments add column if not exists transporter_code text not null default '';
alter table shipments add column if not exists vehicle_no text not null default '';
alter table shipments add column if not exists driver_name text not null default '';
alter table shipments add column if not exists driver_number text not null default '';
alter table shipments add column if not exists driver_mobile text not null default '';
