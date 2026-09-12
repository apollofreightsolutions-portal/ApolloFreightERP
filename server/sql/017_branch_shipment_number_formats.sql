alter table app_settings add column if not exists kuwait_shipment_number_format text not null default 'AFS-#####/MM/KWI/{SERVICE}';
alter table app_settings add column if not exists dubai_shipment_number_format text not null default 'AFS-#####/MM/DBX/{SERVICE}';
