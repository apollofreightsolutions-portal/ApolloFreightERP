alter table shipment_requests add column if not exists request_details_json text not null default '{}';
