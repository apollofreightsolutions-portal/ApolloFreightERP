-- Additive; no shipment/billing values, timestamps, status or identifiers are reset.
alter table shipments add column if not exists reporting_mode text not null default 'auto';
-- The dedicated endpoint permits only auto/live; generic shipment updates cannot write this column.
