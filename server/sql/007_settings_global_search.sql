alter table app_settings add column if not exists allow_global_shipment_quick_search text not null default 'No';
